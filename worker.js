/**
 * TeachSmarter API Worker
 * Deploy auf Cloudflare Workers (Free Tier reicht)
 * 
 * Benötigte Secrets (in Cloudflare Dashboard → Worker → Settings → Variables):
 *   STRIPE_SECRET_KEY     → sk_live_... (oder sk_test_... zum Testen)
 *   STRIPE_WEBHOOK_SECRET → whsec_... (aus Stripe Dashboard → Webhooks)
 *   ANTHROPIC_API_KEY     → sk-ant-... (aus console.anthropic.com)
 *   API_AUTH_TOKEN         → ein selbst gewähltes Token das die App mitschickt
 * 
 * Benötigter KV Namespace (in Cloudflare Dashboard → Workers → KV):
 *   Erstelle einen KV Namespace namens "LICENSES"
 *   Binde ihn im Worker unter dem Namen "LICENSES" ein
 * 
 * Stripe Webhook URL: https://api.teachsmarter.de/webhook
 * Events die du in Stripe aktivieren musst: checkout.session.completed
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ═══ ROUTES ═══

      // Stripe Webhook: eigene Signaturprüfung, kein API_AUTH_TOKEN nötig
      if (path === '/webhook' && request.method === 'POST') {
        return await handleStripeWebhook(request, env, corsHeaders);
      }

      // Giveaway Claim: öffentlich (Token = Auth), kein API_AUTH_TOKEN nötig
      if (path === '/giveaway/claim' && request.method === 'POST') {
        return await handleGiveawayClaim(request, env, corsHeaders);
      }

      // Alle übrigen Endpoints: API_AUTH_TOKEN prüfen (schützt gegen fremde Nutzung)
      if (env.API_AUTH_TOKEN) {
        const authHeader = request.headers.get('Authorization') || '';
        if (authHeader !== 'Bearer ' + env.API_AUTH_TOKEN) {
          return json({ error: 'Unauthorized' }, 401, corsHeaders);
        }
      }

      // Admin: Giveaway-Tokens generieren
      if (path === '/admin/giveaway/create' && request.method === 'POST') {
        return await handleGiveawayCreate(request, env, corsHeaders);
      }

      if (path === '/verify' && request.method === 'POST') {
        return await handleVerify(request, env, corsHeaders);
      }

      if (path === '/api/ki' && request.method === 'POST') {
        return await handleKI(request, env, corsHeaders);
      }

      if (path === '/api/credits' && request.method === 'POST') {
        return await handleCreditsInfo(request, env, corsHeaders);
      }

      // Schulferien-Proxy: ferien-api.de für alle 16 DE-Bundesländer
      if (path === '/api/schulferien' && request.method === 'GET') {
        return await handleSchulferien(request, env, corsHeaders);
      }

      return json({ error: 'Not found' }, 404, corsHeaders);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal error' }, 500, corsHeaders);
    }
  }
};

// ═══════════════════════════════════════════
// STRIPE WEBHOOK
// ═══════════════════════════════════════════
async function handleStripeWebhook(request, env, cors) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  // Verify webhook signature
  const isValid = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return json({ error: 'Invalid signature' }, 400, cors);
  }

  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    let email = session.customer_email || session.customer_details?.email || '';
    console.log('[webhook] checkout session:', session.id, 'email:', email, 'customer:', session.customer);
    if (!email && session.customer) {
      try {
        const custRes = await fetch(`https://api.stripe.com/v1/customers/${session.customer}`, {
          headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY }
        });
        const cust = await custRes.json();
        email = cust.email || '';
        console.log('[webhook] fetched customer email:', email);
      } catch(e) { console.error('Customer fetch error:', e); }
    }

    // Metadata aus Session — falls leer, vom Payment Link nachladen
    let meta = session.metadata || {};
    if (!meta.product_id && session.payment_link) {
      try {
        const plRes = await fetch(`https://api.stripe.com/v1/payment_links/${session.payment_link}`, {
          headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY }
        });
        const pl = await plRes.json();
        if (pl.metadata) meta = { ...pl.metadata, ...meta };
      } catch(e) { console.error('Payment link fetch error:', e); }
    }

    const productId = meta.product_id || '';
    const existingKey = meta.license_key || ''; // for credit top-ups

    if (existingKey) {
      // ── Credit Top-Up: add credits to existing key ──
      const license = await env.LICENSES.get(existingKey, 'json');
      if (license) {
        // Idempotency: skip if this session was already processed
        if ((license.purchases || []).some(p => p.sessionId === session.id)) {
          return json({ received: true }, 200, cors);
        }
        const creditsToAdd = getCreditsForProduct(productId);
        const newPlan = getPlanForProduct(productId);
        license.credits += creditsToAdd;
        // Upgrade plan falls höherwertig (founder/abo/premium schlägt credits)
        const planRank = { credits: 0, abo: 1, founder: 2, premium: 3 };
        if ((planRank[newPlan] || 0) > (planRank[license.plan] || 0)) {
          license.plan = newPlan;
        }
        license.purchases.push({
          date: new Date().toISOString(),
          product: productId,
          credits: creditsToAdd,
          sessionId: session.id
        });
        await env.LICENSES.put(existingKey, JSON.stringify(license));
        // Send top-up confirmation; if plan upgraded to founder/premium → also send license email with download links
        if (license.email) {
          await sendTopUpEmail(env, license.email, existingKey, creditsToAdd, license.credits);
          if (newPlan === 'founder' || newPlan === 'premium') {
            await sendLicenseEmail(env, license.email, existingKey, license.plan, license.credits);
          }
        }
      }
    } else {
      // ── Check if email already has a key → top-up instead of new key ──
      const existingEmailKeys = await env.LICENSES.get('email:' + email, 'json') || [];
      if (existingEmailKeys.length > 0) {
        const existingLicense = await env.LICENSES.get(existingEmailKeys[0], 'json');
        if (existingLicense) {
          // Idempotency: skip if this session was already processed
          if ((existingLicense.purchases || []).some(p => p.sessionId === session.id)) {
            return json({ received: true }, 200, cors);
          }
          const creditsToAdd = getCreditsForProduct(productId);
          const newPlan = getPlanForProduct(productId);
          existingLicense.credits += creditsToAdd;
          const planRank = { credits: 0, abo: 1, founder: 2, premium: 3 };
          if ((planRank[newPlan] || 0) > (planRank[existingLicense.plan] || 0)) {
            existingLicense.plan = newPlan;
          }
          existingLicense.purchases.push({
            date: new Date().toISOString(),
            product: productId,
            credits: creditsToAdd,
            sessionId: session.id
          });
          await env.LICENSES.put(existingEmailKeys[0], JSON.stringify(existingLicense));
          await sendTopUpEmail(env, email, existingEmailKeys[0], creditsToAdd, existingLicense.credits);
          if (newPlan === 'founder' || newPlan === 'premium') {
            await sendLicenseEmail(env, email, existingEmailKeys[0], existingLicense.plan, existingLicense.credits);
          }
          return json({ received: true }, 200, cors);
        }
      }

      // ── New Purchase: generate license key ──
      // Idempotency: check if this session was already used to create a key
      const existingSession = await env.LICENSES.get('session:' + session.id);
      if (existingSession) return json({ received: true }, 200, cors);
      await env.LICENSES.put('session:' + session.id, '1', { expirationTtl: 60 * 60 * 24 * 30 }); // 30 days

      const key = generateKey(productId);
      const credits = getCreditsForProduct(productId);
      const plan = getPlanForProduct(productId);

      const license = {
        key,
        email,
        plan,
        credits,
        creditsTotal: credits,
        createdAt: new Date().toISOString(),
        stripeSessionId: session.id,
        stripeCustomerId: session.customer || '',
        purchases: [{
          date: new Date().toISOString(),
          product: productId,
          credits,
          sessionId: session.id
        }]
      };

      await env.LICENSES.put(key, JSON.stringify(license));

      // Also index by email for lookups
      const emailKeys = await env.LICENSES.get('email:' + email, 'json') || [];
      emailKeys.push(key);
      await env.LICENSES.put('email:' + email, JSON.stringify(emailKeys));

      // Send license key via email
      console.log('[webhook] sending license email to:', email, 'key:', key, 'plan:', plan);
      if (email) await sendLicenseEmail(env, email, key, plan, credits);
      else console.warn('[webhook] no email found — skipping license email');
    }
  }

  // ── Subscription created/updated: Status + Plan synchronisieren ──
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    // Email aus Subscription-Metadata oder per Stripe Customer-API nachladen
    let email = sub.metadata?.email || '';
    if (!email && sub.customer) {
      try {
        const custRes = await fetch(`https://api.stripe.com/v1/customers/${sub.customer}`, {
          headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY }
        });
        const cust = await custRes.json();
        email = cust.email || '';
      } catch(e) {}
    }
    if (email) {
      const emailKeys = await env.LICENSES.get('email:' + email, 'json') || [];
      for (const key of emailKeys) {
        const license = await env.LICENSES.get(key, 'json');
        if (license) {
          license.subscriptionId = sub.id;
          license.subscriptionStatus = sub.status;
          if (sub.status === 'active') {
            // Abo aktiv → auf 'abo' setzen (außer bereits höherwertig)
            const planRank = { credits: 0, abo: 1, founder: 2, premium: 3 };
            if ((planRank[license.plan] || 0) < planRank['abo']) license.plan = 'abo';
          } else if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'past_due') {
            // Abo gekündigt/ausgelaufen → auf 'credits' zurücksetzen (außer founder/premium)
            if (license.plan === 'abo') license.plan = 'credits';
          }
          await env.LICENSES.put(key, JSON.stringify(license));
        }
      }
    }
  }

  // ── invoice.paid: monatliche Abo-Credits gutschreiben ──
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    // Nur bei Abo-Verlängerungen (nicht bei erster Zahlung, die checkout.session schon handelt)
    if (invoice.billing_reason === 'subscription_cycle' && invoice.customer) {
      let email = invoice.customer_email || '';
      if (!email) {
        try {
          const custRes = await fetch(`https://api.stripe.com/v1/customers/${invoice.customer}`, {
            headers: { 'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY }
          });
          const cust = await custRes.json();
          email = cust.email || '';
        } catch(e) {}
      }
      if (email) {
        const emailKeys = await env.LICENSES.get('email:' + email, 'json') || [];
        for (const key of emailKeys) {
          const license = await env.LICENSES.get(key, 'json');
          if (license && license.plan === 'abo') {
            // Rollover: ungenutzte Credits (max 29 Rollover) + 29 neue
            const rollover = Math.min(license.credits || 0, 29);
            license.credits = rollover + 29;
            license.purchases.push({
              date: new Date().toISOString(),
              product: 'sub_29_renewal',
              credits: 29,
              rollover,
              sessionId: invoice.id
            });
            await env.LICENSES.put(key, JSON.stringify(license));
          }
        }
      }
    }
  }

  return json({ received: true }, 200, cors);
}

// ═══════════════════════════════════════════
// VERIFY LICENSE
// ═══════════════════════════════════════════
async function handleVerify(request, env, cors) {
  const { key } = await request.json();
  if (!key) return json({ valid: false, error: 'No key' }, 400, cors);

  const license = await env.LICENSES.get(key, 'json');
  if (!license) return json({ valid: false, error: 'Unknown key' }, 404, cors);

  return json({
    valid: true,
    plan: license.plan,
    credits: license.credits,
    creditsTotal: license.creditsTotal,
    email: license.email,
    isFlatrate: license.plan === 'premium' || (license.subscriptionStatus === 'active'),
  }, 200, cors);
}

// ═══════════════════════════════════════════
// KI API PROXY
// ═══════════════════════════════════════════
async function handleKI(request, env, cors) {
  const body = await request.json();
  const { key, feature, context } = body;

  // Verify license
  if (!key) return json({ error: 'No license key' }, 401, cors);
  const license = await env.LICENSES.get(key, 'json');
  if (!license) return json({ error: 'Invalid key' }, 401, cors);

  // Check credits
  const isFlatrate = license.plan === 'premium' || license.subscriptionStatus === 'active';
  const KI_COSTS = {
    thema_vorschlag:     1,
    feld_refresh:        1,
    interaktiv:          3, // Fallback — wird unten dynamisch überschrieben
    sequenzplanung:      2,
    tafelbild:           2,
    differenzierung:     2,
    elternbrief:         2,
    praesentation:       2,
    jahresplanung:       3,
    stundenvorbereitung: 3,
    arbeitsblatt:        3,
    appbaukasten:        1,
    appbaukasten_themen: 1,
  };
  const IV_UMFANG_COSTS = { s: 2, m: 3, l: 5, xl: 8 };
  let creditCost = KI_COSTS[feature] || 1;
  if (feature === 'interaktiv') creditCost = IV_UMFANG_COSTS[context?.umfang] ?? 3;
  if (!isFlatrate && license.credits < creditCost) {
    return json({ error: 'no_credits', message: 'Nicht genug KI-Credits. Bitte Credits nachkaufen.' }, 402, cors);
  }

  // Build prompt based on feature
  const { systemPrompt, userPrompt, maxTokens } = buildPrompt(feature, context);

  // Call Anthropic API
  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!apiResponse.ok) {
    const err = await apiResponse.text();
    console.error('Anthropic API error:', apiResponse.status, err);
    let detail = '';
    try { detail = JSON.parse(err)?.error?.message || ''; } catch {}
    return json({ error: 'KI-Fehler. Bitte erneut versuchen.', message: detail || `HTTP ${apiResponse.status}` }, 502, cors);
  }

  const result = await apiResponse.json();
  const text = result.content?.[0]?.text || '';

  // Deduct credits (unless premium)
  if (!isFlatrate) {
    license.credits -= creditCost;
    await env.LICENSES.put(key, JSON.stringify(license));
  }

  return json({
    result: text,
    credits: license.credits,
    isFlatrate,
  }, 200, cors);
}

// ═══════════════════════════════════════════
// CREDITS INFO
// ═══════════════════════════════════════════
async function handleCreditsInfo(request, env, cors) {
  const { key } = await request.json();
  if (!key) return json({ error: 'No key' }, 400, cors);
  const license = await env.LICENSES.get(key, 'json');
  if (!license) return json({ error: 'Invalid key' }, 404, cors);

  return json({
    credits: license.credits,
    creditsTotal: license.creditsTotal,
    plan: license.plan,
    isFlatrate: license.plan === 'premium' || license.subscriptionStatus === 'active',
  }, 200, cors);
}

// ═══════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════
function buildPrompt(feature, ctx) {
  const baseSystem = `Du bist der TeachSmarter KI-Assistent für Lehrkräfte im DACH-Raum.
Du kennst die Lehrpläne aller deutschen Bundesländer (LehrplanPLUS Bayern, Bildungsplan BW, Kernlehrplan NRW, etc.).
Du antwortest IMMER auf Deutsch.
Du antwortest IMMER in strukturiertem JSON (kein Markdown, kein Fließtext außer in den JSON-Werten).

DIDAKTISCHE GRUNDPRINZIPIEN (nach Didaktischem Grundkurs / Brunnhuber / Meyer — verbindlich):
1. AKTIVIERUNG: SuS denken, handeln, sprechen selbst. Kein reines Lehrervortrag-Modell. Aktivierende Methoden bevorzugen.
2. MOTIVIERUNG: Lernziele transparent machen, Stundeneinstieg motivierend gestalten (Problemstellung, Alltagsbezug, Provokation).
3. STRUKTURIERUNG: Klarer Dreischritt — Einstieg → Erarbeitung → Sicherung (+ Transfer wenn möglich). Roten Faden sicherstellen.
4. DIFFERENZIERUNG: Mind. 3 Niveaus (Grundlegend/Standard/Erweiternd). Aufgaben so gestalten, dass alle SuS einbezogen werden.
5. ELEMENTARISIERUNG / REDUKTION: Auf das Wesentliche reduzieren. Nicht alles gleichzeitig. Fachlich richtig, aber schülergerecht.
6. VERANSCHAULICHUNG: Abstrakte Inhalte durch Beispiele, Analogien, Visualisierungen zugänglich machen.
7. LEBENSNÄHE: Bezug zur Lebenswelt der SuS herstellen. Anwendungsorientierung zeigt Sinn des Lernens.
8. KOMPETENZORIENTIERUNG: Lernziele als nachprüfbare Kompetenzen formulieren (nennen, beschreiben, unterscheiden, anwenden, lösen, beurteilen — keine Vagheit wie "verstehen" oder "kennenlernen").
Merkmale guten Unterrichts (nach Hilbert Meyer): Klare Strukturierung, Lernförderliches Klima, Methodenvielfalt, Individuelles Fördern, Intelligentes Üben, Transparente Leistungserwartungen.`;

  switch (feature) {

    case 'jahresplanung': {
      const totalUE = parseInt(ctx.totalUE) || 160;
      return {
      systemPrompt: baseSystem + `\n\nDu erstellst eine Jahresplanung für ein Fach.
PFLICHTREGELN — exakt einhalten:
1. Die Summe aller "ue"-Werte im Array MUSS exakt ${totalUE} ergeben — nicht mehr, nicht weniger.
2. Verteile die Lernbereiche lückenlos: Ein Block folgt direkt auf den nächsten, keine freien Wochen dazwischen.
3. Wenn am Ende eines Blocks noch UEs in einer Woche frei sind, beginnt der nächste Block in derselben Woche.
4. Berücksichtige didaktische Progression (leicht→schwer, aufbauend) und Prüfungszeiträume.
5. Antworte als JSON-Array: [{"name":"Lernbereich","ue":12,"sequenzen":[{"title":"Sequenz","ue":4}]}]
6. Antworte NUR mit dem JSON-Array, keine Erklärung.`,
      userPrompt: `Erstelle eine Jahresplanung.
Bundesland: ${ctx.bundesland || 'Bayern'}
Schulart: ${ctx.schulart || 'Mittelschule'}
Fach: ${ctx.fach || 'Mathematik'}
Jahrgangsstufe: ${ctx.jgst || '7'}
Wochenstunden: ${ctx.wochenstunden || 4}
Verfügbare UE im Schuljahr: ${totalUE} (PFLICHT: Summe aller ue-Werte muss exakt ${totalUE} ergeben)
${ctx.schwerpunkte ? 'Schwerpunkte: ' + ctx.schwerpunkte : ''}
${ctx.besonderheiten ? 'Besonderheiten: ' + ctx.besonderheiten : ''}
${ctx.schulbuch ? 'Schulbuch: ' + ctx.schulbuch : ''}

Antworte NUR mit dem JSON-Array.`,
      maxTokens: 3000,
    };}

    case 'sequenzplanung': return {
      systemPrompt: baseSystem + `\n\nDu erstellst Sequenzen (Stundenkette) für einen Lernbereich.
PFLICHTREGELN — diese musst du exakt einhalten:
1. Der Lernbereichsname ist FEST VORGEGEBEN — erfinde keinen anderen, nutze exakt den angegebenen.
2. Die Gesamt-UE ist FEST VORGEGEBEN — die Summe aller Sequenz-UEs muss exakt dieser Zahl entsprechen.
3. Berücksichtige: Einführung, Übungsphasen, Vertiefung, ggf. Leistungsnachweis.
4. Antworte als JSON-Array: [{"title":"Sequenz-Titel","ue":4}]`,
      userPrompt: `Erstelle Sequenzen für diesen Lernbereich:
Lernbereich (exakt so beibehalten): "${ctx.lernbereich || ''}"
Gesamt-UE (Summe muss genau ${ctx.ue || 12} ergeben): ${ctx.ue || 12}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Bundesland: ${ctx.bundesland || ''}
${ctx.schulbuch ? 'Schulbuch: ' + ctx.schulbuch : ''}
${ctx.lehrplaninhalt ? 'Lehrplaninhalte / Kompetenzerwartungen (Sequenztitel daran orientieren):\n' + ctx.lehrplaninhalt : ''}

Antworte NUR mit dem JSON-Array.`,
      maxTokens: 1500,
    };

    case 'stundenvorbereitung': return {
      systemPrompt: baseSystem + `\n\nDu erstellst eine detaillierte Stundenvorbereitung / einen Verlaufsplan.
Halte dich exakt an die gewünschten Vorgaben (Einstiegsform, Sozialform, Differenzierung, Material).

VERBINDLICHE QUALITÄTSKRITERIEN FÜR DIE STUNDENVORBEREITUNG:
LERNZIELE: Formuliere 2–3 Feinziele mit nachprüfbaren Operationsverben (nennen, aufzählen, unterscheiden, beschreiben, erklären, anwenden, lösen, beurteilen). Niemals vage Ziele wie "die SuS kennen..." oder "verstehen...".
EINSTIEG: Motivierend und aktivierend — Problemstellung, Alltagsbezug, Bild/Provokation, Rätsel o.ä. Klarer Lehrerimpuls + SuS-Aktivität. Zielstellung der Stunde transparent machen.
ERARBEITUNG: Handlungsorientiert, SuS-zentriert. Mit der angegebenen Sozialform. Differenzierung auf mind. 2 Niveaus (Grundlegend / Erweiternd). Lehrkraft moderiert, erklärt gezielt, gibt Hilfestellungen.
SICHERUNG: Ergebnisse werden gesichert, Lernziele werden überprüft. Tafelbild / Heft / Ergebnispräsentation. Erste Wiederholung erfolgt direkt in der Stunde (nicht erst nächste Woche).
HAUSAUFGABEN: Nur wenn sinnvoll — erwachsen aus dem Unterrichtsinhalt, klar formuliert, selbstständig lösbar, differenziert wo möglich.
TAFELBILD: Strenge Reduktion auf Wesentliches ("Was nicht auf die Tafel passt, passt nicht in den Kopf"). Übersichtlich, strukturiert (Über-/Unterordnung, Beziehungen). Farbig/Rahmen nur wenn sinnvoll.

Antworte als JSON-Objekt:
{"lernziele":"...","einstieg":"...","erarbeitung":"...","sicherung":"...","hausaufgaben":"...","tafelbild":"LINKS:\n...\n\nMITTE:\n...\n\nRECHTS:\n..."}`,
      userPrompt: `Erstelle eine Stundenvorbereitung:
Fach: ${ctx.fach || ''}
Klasse: ${ctx.klasse || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Bundesland: ${ctx.bundesland || ''}
Lehrplanzuordnung: ${ctx.lehrplan || ''}
Sequenz: ${ctx.sequenz || ''}
Stundenthema: ${ctx.thema || ''}
Verfügbare Zeit: ${ctx.zeit || '45 Minuten'}
SuS-Anzahl: ${ctx.sus || ''}
Einstiegsform: ${ctx.einstieg || ''}
Sozialform: ${ctx.sozialform || ''}
Differenzierung: ${ctx.differenzierung || ''}
Hauptmaterial: ${ctx.material_typ || ''}
${ctx.besonderheiten ? 'Besonderheiten: ' + ctx.besonderheiten : ''}

Antworte NUR mit dem JSON-Objekt.`,
      maxTokens: 3000,
    };

    case 'thema_vorschlag': return {
      systemPrompt: baseSystem + `\n\nDu schlägst 3 konkrete, kreative Stundenthemen vor.
Antworte als JSON-Array mit genau 3 Strings: ["Thema 1","Thema 2","Thema 3"]`,
      userPrompt: `Schlage 3 Stundenthemen vor:
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Lehrplanbezug: ${ctx.lehrplan || ''}
Sequenz: ${ctx.sequenz || ''}

Antworte NUR mit dem JSON-Array.`,
      maxTokens: 300,
    };

    case 'arbeitsblatt': {
      const isDiff3  = ctx.differenzierung_methode === 'alle3';
      const isLRS    = ctx.lrs === true || ctx.lrs === 'true';
      const typen    = (ctx.aufgabentypen || 'luckentext,offene').split(',').filter(Boolean);

      const typenHinweis = typen.map(t => ({
        luckentext:    'Lückentext (Lücken als _____, Wortbank optional)',
        offene:        'Offene Frage / Schreibaufgabe',
        multiplechoice:'Multiple Choice (Ankreuzen mit ☐, genau eine Antwort richtig)',
        tabelle:       'Tabelle ausfüllen (Header vorgeben, Zeilen leer lassen)',
        zuordnung:     'Zuordnung (Begriffe links, Definitionen rechts, SuS verbinden)',
      }[t] || t)).join('\n- ');

      const lrsHinweis = isLRS ? `
LRS-FREUNDLICH (zwingend beachten):
- Kurze Sätze, einfache Wörter, konkrete Formulierungen
- Aufgaben in kleinere Schritte aufteilen
- Mehr Lücken vorgeben als bei Standard
- Wortbanken großzügig einsetzen
- Keine langen Fließtexte als Aufgabenstellung` : '';

      const diff3System = isDiff3 ? `
DREIGLIEDRIGE DIFFERENZIERUNG — AUSGABE-FORMAT:
Statt "aufgaben" gibst du "aufgaben_niveaus" zurück mit drei Schlüsseln:
{
  "basis":    [{"nr":1,"titel":"...","inhalt":"...","punkte":2}],
  "standard": [{"nr":1,"titel":"...","inhalt":"...","punkte":3,"tipp":"..."}],
  "experte":  [{"nr":1,"titel":"...","inhalt":"...","punkte":5,"zusatz":"..."}]
}
Regeln:
- ★ Basis: vereinfacht, viele Hilfen, Lücken, Wortbank — für schwächere SuS
- ★★ Standard: reguläres Niveau, Mix aus geführt und offen
- ★★★ Experte: anspruchsvoll, Transfer, Kreativität, echte Denkaufgaben
- Jedes Niveau: 2-4 Aufgaben, aufeinander aufbauend
- Kein "Zusatz" im Basis-Niveau, kein "Tipp" im Experte-Niveau nötig` : '';

      const jsonSchema = isDiff3
        ? `{
  "titel": "...",
  "untertitel": "Klasse ___ | ${ctx.fach || 'Fach'} | Datum: ___________",
  "einfuehrung": "...",
  "aufgaben_niveaus": {
    "basis":    [{"nr":1,"titel":"...","inhalt":"...","punkte":2,"tipp":"..."}],
    "standard": [{"nr":1,"titel":"...","inhalt":"...","punkte":3,"tipp":"...","zusatz":"..."}],
    "experte":  [{"nr":1,"titel":"...","inhalt":"...","punkte":5,"zusatz":"..."}]
  },
  "merksatz": "...",
  "loesungshinweis": "..."
}`
        : `{
  "titel": "...",
  "untertitel": "Klasse ___ | ${ctx.fach || 'Fach'} | Datum: ___________",
  "einfuehrung": "...",
  "aufgaben": [{"nr":1,"titel":"...","inhalt":"...","punkte":3,"tipp":"...","zusatz":"..."}],
  "merksatz": "...",
  "loesungshinweis": "..."
}`;

      return {
        systemPrompt: baseSystem + `\n\nDu erstellst ein professionelles, didaktisch hochwertiges Arbeitsblatt.

VERBINDLICHE QUALITÄTSKRITERIEN (nach Didaktischem Grundkurs, DG 3):

FORMALE GRUNDSÄTZE:
- Klare Struktur: Titel → Einführung (optional) → Aufgaben → Merksatz (optional)
- Genügend Platz für Eintragungen der SuS (Lücken, Linien, freie Felder)
- Keine dekorativen Elemente — professionelle, klare Gestaltung

INHALTLICHE GRUNDSÄTZE:
- Sachlich korrekt und lehrplankonform
- Das AB erwächst aus dem Unterricht — kein kontextloser Ausfüller
- KEIN reines Lückentext-AB: mind. 1 offene, produktive Aufgabe (außer bei Lückentext-Format)

SPRACHLICHE GRUNDSÄTZE:
- Arbeitsaufträge kurz, prägnant, eindeutig (SuS wissen sofort was zu tun ist)
- Schülergerechte Sprache, fachlich korrekte Begriffe
- Aufgabentitel handlungsorientiert: "Erkläre…", "Berechne…", "Ordne zu…", "Vergleiche…"

AKTIVIERUNG:
- Aufgaben aktivieren eigenes Denken (nicht nur Reproduktion)
- Lücken als _____ (5-8 Unterstriche)
- Jede Aufgabe mit realistischem Punktwert (leicht=2P, mittel=3-4P, schwer=5-6P)

DIFFERENZIERUNG (Standard):
- "tipp": kurze Hilfestellung für schwächere SuS (Lösung NICHT verraten)
- "zusatz": anspruchsvolle Erweiterung für schnelle SuS (echter Transfer, kein Mehr-vom-Gleichen)

AUFBAU:
- "einfuehrung": Lebensweltbezug / Rahmengeschichte (1-3 Sätze, nur wenn sinnvoll)
- "merksatz": wichtige Regel/Formel zum Einrahmen (nur wenn inhaltlich nötig)
- "loesungshinweis": vollständige Musterlösung für die Lehrkraft (alle Aufgaben!)
${lrsHinweis}
${diff3System}

Antworte als JSON-Objekt:
${jsonSchema}
Felder "einfuehrung", "merksatz", "tipp", "zusatz" nur setzen wenn sinnvoll (sonst weglassen).`,

        userPrompt: `Erstelle ein Arbeitsblatt:
Thema: ${ctx.thema || ''}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Bundesland: ${ctx.bundesland || ''}
Schwierigkeitsniveau: ${ctx.niveau || 'Mittel'}
Lehrplanbezug: ${ctx.lehrplan || ''}
${isLRS ? 'Zielgruppe: LRS-freundlich (vereinfachte Sprache, viel Struktur, kurze Sätze)' : ''}

Anforderungsbereich (VERBINDLICH):
${ctx.anforderungsbereich === 'ab1' ? `AB I – Reproduktion: Aufgaben auf Reproduktionsniveau.
Operatoren: nennen, beschreiben, aufzählen, benennen, darstellen, reproduzieren, skizzieren, zusammenfassen.
SuS geben Fakten, Begriffe oder Abläufe wieder — kein Transfer, kein Urteilen.` :
ctx.anforderungsbereich === 'ab2' ? `AB II – Reorganisation & Transfer: Aufgaben auf Anwendungsniveau.
Operatoren: anwenden, erklären, vergleichen, zuordnen, einordnen, untersuchen, verknüpfen, übertragen.
SuS wenden Wissen auf neue Kontexte an, stellen Zusammenhänge her, verknüpfen Informationen.` :
ctx.anforderungsbereich === 'ab3' ? `AB III – Reflexion & Problemlösung: Aufgaben auf höchstem kognitivem Niveau.
Operatoren: beurteilen, bewerten, begründen, entwickeln, gestalten, diskutieren, Stellung nehmen, Lösungsweg erarbeiten.
SuS beurteilen, begründen, entwickeln eigene Lösungen, reflektieren kritisch — kein reines Wiedergeben.` :
`Gemischt (AB I bis AB III): Aufgaben steigen von Reproduktion über Transfer zu Reflexion auf.
Mindestens 1 Aufgabe pro Anforderungsbereich. Aufgaben didaktisch progressiv anordnen.`}

Aufgabenformen (einbeziehen, mind. 2-3 verschiedene):
- ${typenHinweis}

${isDiff3 ? 'Differenzierung: Alle 3 Niveaus (★ Basis / ★★ Standard / ★★★ Experte) auf einem Blatt.' : '3-5 Aufgaben, didaktisch aufsteigend.'}
Antworte NUR mit dem JSON-Objekt.`,
        maxTokens: isDiff3 ? 5000 : 3500,
      };
    }

    case 'tafelbild': {
      const isPremiumTb = ctx.premium === true || ctx.premium === 'true';

      // Strukturierungsform-Anweisung (Premium)
      const strukturMap = {
        kausal:         'KAUSAL: Ursache → Wirkung / Wenn-Dann. Pfeile zeigen Kausalzusammenhänge. Links: Ausgangssituation/Ursache. Mitte: Prozess/Mechanismus. Rechts: Ergebnis/Wirkung.',
        hierarchisch:   'HIERARCHISCH: Überordnung → Unterordnung. Oberbegriffe oben/Mitte, Unterbegriffe verzweigen. Links: Oberbegriff mit Definition. Mitte: Unterbegriffe/Kategorien. Rechts: Beispiele je Kategorie.',
        prozess:        'PROZESS/ABLAUF: Schrittfolge von links nach rechts. Links: Schritt 1 / Ausgangszustand. Mitte: Schritte 2-3 / Transformation. Rechts: Endergebnis / Fazit.',
        klassifizierung:'KLASSIFIZIERUNG: Vergleich und Einordnung. Links: Merkmal/Kriterium. Mitte: Vergleichsobjekte mit Merkmalsausprägung. Rechts: Einordnung / Fazit.',
        frei:           'FREI: Wähle die für den Inhalt didaktisch sinnvollste Struktur. Begründe im strukturhinweis kurz welche Logik du gewählt hast.',
      };
      const strukturAnweisung = strukturMap[ctx.strukturform || 'frei'] || strukturMap.frei;

      // Artikulationsphasen-Anweisung (Premium)
      const phasenMap = {
        vollstaendig: 'Das Tafelbild begleitet die gesamte Stunde: Links = Einstieg/Zielstellung, Mitte = Erarbeitung/Kerninhalt, Rechts = Sicherung/Merksatz.',
        erarbeitung:  'Fokus auf die Erarbeitungsphase: Links = Ausgangsproblem/Material, Mitte = Lösungsweg/Kerninhalt, Rechts = Ergebnis/Zwischenfazit.',
        sicherung:    'Fokus auf die Sicherungsphase: Das TB fasst das Stundenergebnis zusammen. Links = Lernziel-Erinnerung, Mitte = Kernergebnis, Rechts = Merksatz/Transferaufgabe.',
        lzk:          'Tafelbild für Lernzielkontrolle: Links = Wiederholungsfragen, Mitte = Lösungsschema, Rechts = Bewertungsmaßstab.',
      };
      const phasenAnweisung = isPremiumTb ? (phasenMap[ctx.phase || 'vollstaendig'] || phasenMap.vollstaendig) : phasenMap.vollstaendig;

      return {
        systemPrompt: baseSystem + `\n\nDu planst ein professionelles Tafelbild nach den Grundsätzen des Didaktischen Grundkurses (DG 2, Stephan Bauer / AG Seminarrektoren Mittelschule).

DIE 10 GRUNDSÄTZE (verbindlich für jedes Tafelbild):
1. KONSEQUENTE REDUKTION: "Was nicht auf die Tafel passt, passt auch nicht in den Kopf!" — Nur das Wesentlichste. Kein Fließtext. Stichwörter, Schlüsselbegriffe, Formeln.
2. LERNZIELBEZUG: Das Tafelbild repräsentiert die zentralen Lernziele der UE und didaktischen Schwerpunkte.
3. ÜBERSICHTLICHKEIT: Ausreichend Abstände, klare Aufteilung, "grüne Fläche" (Weißraum) als Strukturmittel.
4. TAFELSCHRIFT: Knappe, klare Formulierungen — wie an der Tafel geschrieben (kurze Zeilen, kein Blocksatz).
5. STRUKTURIERUNG DER ZUSAMMENHÄNGE: Kausal-, Final-, Über-/Unterordnungsbeziehungen sichtbar machen.
6. FORMALE GESTALTUNG: Datum, Überschrift (= Lernziel oder Thema), klare Aufteilung in Bereiche.
7. ANSCHAULICHKEIT/AKZENTUIERUNG: Farben, Rahmen, Unterstreichungen, Pfeile, Symbole gezielt einsetzen — nur inhaltlich sinnvoll, nie dekorativ.
8. REKAPITULIERBARKEIT: Das TB fasst Stundenergebnisse zusammen — SuS können den Lernweg nachverfolgen.
9. ARTIKULIERUNG: Das TB begleitet den Unterrichtsverlauf (Zielstellung → Erarbeitung → Sicherung).
10. FLEXIBLE NUTZUNG: Verbalisierung, Zusammenfassung, Wiederholung, Lernzielkontrolle.

STRUKTURIERUNGSFORM für dieses Tafelbild:
${strukturAnweisung}

ARTIKULATIONSPHASE:
${phasenAnweisung}

AUSGABEFORMAT — ZWINGEND:
Antworte als JSON-Objekt:
{
  "titel": "Kurzer, prägnanter Tafeltitel (= Thema der Stunde, max. 8 Wörter)",
  "lernziel": "Die SuS können [nachprüfbares Operationsverb] [Inhalt].",
  "links": {
    "kopf": "Überschrift linke Tafelseite (max. 3 Wörter)",
    "inhalt": "Inhalt als knappe Stichpunkte, eine Zeile pro Stichpunkt, \\n als Trenner. Max. 6 Zeilen.",
    "farbe": "weiß",
    "akzent": "Was farblich hervorgehoben werden soll (z.B. 'Schlüsselbegriff in Gelb')"
  },
  "mitte": {
    "kopf": "Überschrift Mitte (max. 3 Wörter)",
    "inhalt": "Kerninhalt als Stichpunkte. Max. 8 Zeilen. Darf Pfeile (→) und einfache Symbole enthalten.",
    "farbe": "weiß",
    "akzent": "Farbliche Akzentsetzung"
  },
  "rechts": {
    "kopf": "Überschrift rechte Tafelseite (max. 3 Wörter)",
    "inhalt": "Beispiel, Aufgabe oder Merksatz als Stichpunkte. Max. 6 Zeilen.",
    "farbe": "weiß",
    "akzent": "Farbliche Akzentsetzung"
  },
  "merksatz": "Ein prägnanter Merksatz den SuS ins Heft schreiben (1 Satz, vollständig formuliert).",
  "strukturhinweis": "Kurze Erklärung welche Strukturlogik verwendet wurde und warum (1-2 Sätze — für die Lehrkraft).",
  "heftbild_hinweis": "Hinweis was SuS ins Heft übernehmen sollen (1 Satz).",
  "diagramm": {
    "typ": "dreieck ODER pfeilkette ODER kreislauf ODER pyramide ODER keine",
    "HINWEIS": "Verwende diagramm NUR wenn der Inhalt eine klare geometrische Struktur hat (Feuerdreieck, Wasserkreislauf, Nahrungskette, Maslow-Pyramide, pH-Skala etc.). Ansonsten typ:'keine' oder Feld weglassen.",
    "ecken": ["Oben/Apex (max 3 Wörter)", "Unten-Links (max 3 Wörter)", "Unten-Rechts (max 3 Wörter)"],
    "seiten": ["opt. linke Seite (Beziehung)", "opt. untere Seite", "opt. rechte Seite"],
    "mitte_text": "opt. Text/Emoji im Zentrum des Dreiecks (z.B. '🔥 Verbrennung')",
    "schritte": ["Schritt A", "Schritt B", "Schritt C", "Schritt D"],
    "lagen": ["Basis unten (breit)", "Mittlere Schicht", "Spitze oben (schmal)"]
  }
  ${isPremiumTb ? `,"gestaltungshinweise": "Konkrete Empfehlungen: Welche Farbe für welchen Inhalt, wo Rahmen/Pfeile setzen, wo Bilder/Symbole sinnvoll wären (3-5 Punkte, stichpunktartig)."` : ''}
}

WICHTIG für diagramm: Wenn du ein Diagramm setzt, reduziere mitte.inhalt auf einen kurzen Einleitungssatz oder leere es. Das Diagramm ersetzt die Textdarstellung im Mittelteil.
Beispiel Feuerdreieck: typ='dreieck', ecken=['Wärme / Zündtemperatur','Sauerstoff (O₂)','Brennstoff'], mitte_text='🔥 Verbrennung', seiten=['Entzug → Feuer erlischt','Entzug → Feuer erlischt','Entzug → Feuer erlischt']`,

        userPrompt: `Erstelle ein Tafelbild:
Thema / Überschrift: ${ctx.thema || ''}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Bundesland: ${ctx.bundesland || ''}
${ctx.lernziel ? 'Lernziel (Vorgabe): ' + ctx.lernziel : ''}
${ctx.lehrplan ? 'Lehrplanbezug: ' + ctx.lehrplan : ''}
${ctx.sequenz ? 'Sequenz: ' + ctx.sequenz : ''}
Stundendauer: ${ctx.dauer || '45 Minuten'}
Tafelaufteilung: ${ctx.aufteilung || '3-geteilt (Links / Mitte / Rechts)'}

Antworte NUR mit dem JSON-Objekt.`,
        maxTokens: isPremiumTb ? 2000 : 1500,
      };
    }

    case 'praesentation': {
      const isPremiumP = ctx.premium === true || ctx.premium === 'true';
      const anzahl = parseInt(ctx.anzahl_folien || '8', 10);
      const stilMap = {
        sachlich: 'Sachlich-wissenschaftlich: klare Sprache, Fachbegriffe mit Erklärung, keine Ausschmückungen.',
        kreativ:  'Kreativ-anregend: bildhafte Sprache, Rätsel/Challenges pro Folie, SuS werden einbezogen.',
        visuell:  'Visuell-medial: kurze Texte, viele Visualisierungsanweisungen, Fokus auf Bilder/Grafiken.',
      };
      const stilAnweisung = stilMap[ctx.stil || 'sachlich'] || stilMap.sachlich;

      return {
        systemPrompt: baseSystem + `\n\nDu erstellst eine strukturierte Unterrichtspräsentation für eine Lehrkraft.
Stil: ${stilAnweisung}

STRIKTE REGELN FÜR FOLIENINHALTE:
- "inhalt" = NUR das, was auf der Folie als Text für die SuS erscheint. Kurze Stichpunkte, max. 5 pro Folie.
- NIEMALS in "inhalt": Bildhinweise, Medienverweise, Lehreranweisungen, "(Bild: ...)", "(Zeige...)", "(Visualisierung:...)" oder ähnliches.
- "methode" = die Unterrichtsmethode oder das Medium, das die Lehrkraft einsetzt (z.B. "Think-Pair-Share", "Lehrervortrag mit Tafelanschrieb", "Partnerarbeit").
- "lehrerhinweis" = interne Notiz NUR für die Lehrkraft, nie auf der Folie sichtbar.
- Kein Fließtext auf Folien. Keine Anweisungen an die Lehrkraft in "inhalt".

AUSGABEFORMAT — ZWINGEND:
{
  "titel": "Präsentationstitel",
  "fach": "Fach",
  "jgst": "Jahrgangsstufe",
  "dauer": "Stundendauer in Minuten",
  "lernziel": "Die SuS können [Operationsverb] [Inhalt].",
  "folien": [
    {
      "nr": 1,
      "typ": "einstieg|erarbeitung|sicherung|transfer|wiederholung|aufgabe|fazit",
      "titel": "Folientitel",
      "inhalt": ["Stichpunkt 1", "Stichpunkt 2", "..."],
      "methode": "Unterrichtsmethode / Medium für diese Folie",
      "zeit": "Zeitbedarf in Minuten"${isPremiumP ? `,
      "lehrerhinweis": "Interne Notiz für die Lehrkraft (was betonen, mögliche SuS-Fragen)",
      "interaktion": "Interaktiver Impuls / Frage an die Klasse"` : ''}
    }
  ]${isPremiumP ? `,
  "medienempfehlungen": "Liste empfohlener Medien/Materialien (Links, Bücher, Videos — allgemein beschrieben)",
  "differenzierung_hinweis": "Wie kann diese Präsentation für verschiedene Niveaus angepasst werden?"` : ''}
}`,
        userPrompt: `Erstelle eine Unterrichtspräsentation:
Thema: ${ctx.thema || ''}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Stundendauer: ${ctx.dauer || '45'} Minuten
Anzahl Folien: ${anzahl}
Stil: ${ctx.stil || 'sachlich'}
${ctx.lernziel ? 'Lernziel: ' + ctx.lernziel : ''}
${ctx.besonderheiten ? 'Besonderheiten: ' + ctx.besonderheiten : ''}

Antworte NUR mit dem JSON-Objekt.`,
        maxTokens: isPremiumP ? 3500 : 2500,
      };
    }

    case 'differenzierung': {
      const isPremiumD = ctx.premium === true || ctx.premium === 'true';
      const difArt = ctx.differenzierungsart || '3niveau';

      let difSystemExt = '';
      let difOutputSchema = '';

      if (difArt === 'lrs') {
        difSystemExt = `\n\nDu erstellst LRS-freundliche Versionen einer Aufgabe. LRS = Lese-Rechtschreib-Schwäche.

PRINZIPIEN FÜR LRS-DIFFERENZIERUNG:
- Kurze, einfache Sätze (max. 10 Wörter)
- Häufige Zeilenumbrüche, kein langer Fließtext
- Klare Struktur mit nummerierten Schritten
- Schlüsselwörter hervorheben (GROSSSCHREIBUNG oder *fett*)
- Kein doppeltes Negativ, keine verschachtelten Nebensätze
- Konkrete, handlungsorientierte Formulierungen

VERSION 1 — Standard: Originalaufgabe, klar formuliert.
VERSION 2 — LRS-Version: Stark vereinfachte Sprache, Teilschritte, Visualisierungshinweise.
VERSION 3 — LRS + Gerüst: Lückentext, Wortlisten, vorgegebene Satzanfänge.`;

        difOutputSchema = `{
  "thema": "Kurzbezeichnung des Aufgabenthemas",
  "fach": "Fach",
  "niveaus": {
    "standard": {
      "aufgabe": "Originalaufgabe, klar formuliert",
      "tipp": "Optionaler Hinweis"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "lrs": {
      "aufgabe": "Vereinfachte LRS-Version mit klarer Struktur und kurzen Sätzen",
      "tipp": "Methodentipp: Wie diese Version einsetzen"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "lrs_geruest": {
      "aufgabe": "LRS-Version mit Lücken, Wortliste und Satzanfängen",
      "tipp": "Geeignet für SuS mit starker LRS"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    }
  }${isPremiumD ? `,
  "foerdertipps": "Empfehlungen für LRS-SuS im Unterrichtsalltag (2-3 Punkte)",
  "differenzierung_hinweis": "Methodischer Tipp zum Einsatz der drei Versionen"` : ''}
}`;

      } else if (difArt === 'sprachsensibel') {
        difSystemExt = `\n\nDu erstellst sprachsensible Aufgabenversionen für DaZ-SuS (Deutsch als Zweitsprache) und SuS mit eingeschränktem Wortschatz.

PRINZIPIEN SPRACHSENSIBLER AUFGABEN:
- Alltagsnahe, einfache Sprache (Grundwortschatz)
- Fachbegriffe immer in Klammern erklären
- Kurze Sätze, aktive Konstruktionen bevorzugen
- Keine Idiome oder sprachlichen Bilder
- Wortfeld / Glossar als Hilfe beifügen

VERSION 1 — Standard: Originalaufgabe.
VERSION 2 — Vereinfacht: Einfache Sprache, Fachbegriffe erklärt, Glossar.
VERSION 3 — DaZ: Sehr einfache Sprache, Grundwortschatz, erweitertes Glossar.`;

        difOutputSchema = `{
  "thema": "Kurzbezeichnung des Aufgabenthemas",
  "fach": "Fach",
  "niveaus": {
    "standard": {
      "aufgabe": "Originalaufgabe",
      "tipp": "Optionaler Hinweis"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "vereinfacht": {
      "aufgabe": "Aufgabe in einfacher Sprache mit erklärten Fachbegriffen",
      "glossar": ["Begriff: Erklärung"],
      "tipp": "Sprachlicher Hinweis für die Lehrkraft"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "daz": {
      "aufgabe": "Aufgabe in sehr einfacher Sprache für DaZ-SuS",
      "glossar": ["Fachbegriff: sehr einfache Erklärung"],
      "tipp": "Tipp für DaZ-SuS"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    }
  }${isPremiumD ? `,
  "foerdertipps": "Empfehlungen für sprachsensiblen Unterricht (2-3 Punkte)",
  "differenzierung_hinweis": "Methodischer Tipp zum Einsatz der drei Versionen"` : ''}
}`;

      } else if (difArt === 'scaffolding') {
        difSystemExt = `\n\nDu erstellst drei Scaffolding-Versionen einer Aufgabe mit schrittweise abnehmender Unterstützung.

SCAFFOLDING-PRINZIP:
- Gerüste werden sukzessive reduziert → Selbstständigkeit aufbauen
- Jede Version enthält weniger Unterstützung als die vorherige

VERSION 1 — Vollgerüst: Schritt-für-Schritt-Anleitung, Lücken mit Wortfeld, Beispiel, Denkhilfen.
VERSION 2 — Teilgerüst: Strukturierungshilfen (Tabelle, Stichworte), Schlüsselfragen, kein Muster.
VERSION 3 — Selbstständig: Originalaufgabe ohne Hilfen, ggf. Erweiterungsimpuls.`;

        difOutputSchema = `{
  "thema": "Kurzbezeichnung des Aufgabenthemas",
  "fach": "Fach",
  "niveaus": {
    "vollgeruest": {
      "aufgabe": "Aufgabe mit maximaler Unterstützung: Schritte, Lücken, Beispiel, Wortfeld",
      "tipp": "Hinweis für die Lehrkraft zum Einsatz"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "teilgeruest": {
      "aufgabe": "Aufgabe mit mittlerer Unterstützung: Struktur und Schlüsselfragen",
      "tipp": "Hinweis zum Übergang zur Selbstständigkeit"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    },
    "selbststaendig": {
      "aufgabe": "Originalaufgabe ohne Gerüst, ggf. mit Erweiterungsimpuls",
      "tipp": "Hinweis für schnelle SuS"${isPremiumD ? `,
      "loesung": "Musterlösung"` : ''}
    }
  }${isPremiumD ? `,
  "foerdertipps": "Empfehlungen zum Scaffolding-Abbau im Lernprozess (2-3 Punkte)",
  "differenzierung_hinweis": "Methodischer Tipp zum Einsatz der Gerüste im Unterricht"` : ''}
}`;

      } else {
        // Default: 3niveau
        difSystemExt = `\n\nDu differenzierst Aufgaben in drei Niveaus nach dem Anforderungsbereich-Modell (AB I–III).

BASIS (Grundlegendes Niveau / AB I):
- Stark strukturiert, kleinschrittig
- Lückentexte, Satzanfänge, Wortlisten als Hilfen
- Reproduktion und direktes Anwenden von Gelerntem

STANDARD (Regelkompetenz / AB I–II):
- Die Originalaufgabe oder eine leicht angepasste Version
- Eigenständiges Arbeiten erwartet

EXPERTE (Erweiternd / AB II–III):
- Selbstständige Verknüpfungen herstellen
- Begründen, beurteilen, übertragen, weiterentwickeln
- Ggf. Zusatzaufgabe / offene Forschungsfrage`;

        difOutputSchema = `{
  "thema": "Kurzbezeichnung des Aufgabenthemas",
  "fach": "Fach",
  "niveaus": {
    "basis": {
      "aufgabe": "Vollständig formulierte Basisaufgabe mit allen Hilfen",
      "tipp": "Hilfestellung / Lösungsgerüst für Basis-SuS"${isPremiumD ? `,
      "loesung": "Musterlösung / Erwartungshorizont"` : ''}
    },
    "standard": {
      "aufgabe": "Standard-Aufgabe (Original oder leicht angepasst)",
      "tipp": "Optionaler Hinweis"${isPremiumD ? `,
      "loesung": "Musterlösung / Erwartungshorizont"` : ''}
    },
    "experte": {
      "aufgabe": "Erweiterungsaufgabe mit höherem Anforderungsbereich",
      "tipp": "Hinweis zur Herangehensweise"${isPremiumD ? `,
      "loesung": "Musterlösung / Erwartungshorizont"` : ''}
    }
  }${isPremiumD ? `,
  "foerdertipps": "Empfehlungen zur Förderung für Basis-SuS (2-3 Punkte)",
  "differenzierung_hinweis": "Methodischer Tipp wie die Lehrkraft die 3 Versionen im Unterricht einsetzen kann"` : ''}
}`;
      }

      return {
        systemPrompt: baseSystem + difSystemExt + `\n\nAUSGABEFORMAT — ZWINGEND:\n` + difOutputSchema,
        userPrompt: `Differenziere folgende Aufgabe (Differenzierungsart: ${difArt}):
Originalaufgabe: ${ctx.aufgabe || ''}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
${ctx.foerderbedarf ? 'Förderbedarf/Besonderheiten: ' + ctx.foerderbedarf : ''}
${ctx.kontext ? 'Unterrichtskontext: ' + ctx.kontext : ''}

Antworte NUR mit dem JSON-Objekt.`,
        maxTokens: isPremiumD ? 3000 : 2000,
      };
    }

    case 'interaktiv': {
      const isPremiumI = ctx.premium === true || ctx.premium === 'true';
      const typ = ctx.typ || 'quiz';
      const niveauMap = { basis: 'einfach, kleinschrittig, viel Struktur', standard: 'mittleres Niveau, altersgerecht', experte: 'anspruchsvoll, Transfer und Reflexion gefordert' };
      const niveauAnweisung = niveauMap[ctx.niveau || 'standard'];

      // Umfang-basierte Item-Anzahl (aus Client übergeben, Fallback je Typ)
      const itemCount = ctx.items || 10;
      // Hohes Limit für qualitativ hochwertige, vollständige HTML-Lernspiele
      const maxTokens = 14000;

      // Typ-spezifische Inhalts-Anleitung: Inhalt ZUERST, Technik minimal
      const typInstructions = {
        quiz: `QUIZ — Erstelle JETZT ${itemCount} vollständige Multiple-Choice-Fragen zum Thema "${ctx.thema||''}".
Schreibe alle ${itemCount} Fragen nacheinander als HTML. Jede Frage exakt so:
<div class="q" data-correct="B">
  <p class="qt">Wie nennt man den Prozess, bei dem Pflanzen Licht in Energie umwandeln?</p>
  <button onclick="pick(this)" ontouchend="pick(this)">A) Zellatmung</button>
  <button onclick="pick(this)" ontouchend="pick(this)">B) Fotosynthese</button>
  <button onclick="pick(this)" ontouchend="pick(this)">C) Osmose</button>
  <button onclick="pick(this)" ontouchend="pick(this)">D) Diffusion</button>
</div>
WICHTIG: Schreibe sofort alle ${itemCount} echten Fragen. Keine Platzhalter, keine Auslassungspunkte.`,

        lueckentext: `LÜCKENTEXT — Schreibe JETZT einen Fließtext zum Thema "${ctx.thema||''}" mit ${itemCount} Dropdown-Lücken.
Beispiel (ersetze durch themenspezifischen Inhalt):
<p>Die Fotosynthese findet in den <select class="gap" data-correct="Chloroplasten"><option>Chloroplasten</option><option>Mitochondrien</option><option>Ribosomen</option></select> der Pflanzenzelle statt.</p>
WICHTIG: Schreibe den vollständigen Fachtext mit allen ${itemCount} eingebetteten Dropdowns. Keine Auslassungspunkte.`,

        zuordnung: `ZUORDNUNG — Erstelle JETZT ${itemCount} Begriff-Definition-Paare zum Thema "${ctx.thema||''}".
Struktur: Zwei Spalten nebeneinander. Links: ${itemCount} Begriffe als klickbare Buttons. Rechts: ${itemCount} Definitionen als klickbare Buttons (zufällig sortiert).
Beispiel für einen Begriff: <button class="term" data-id="1" onclick="selTerm(this)" ontouchend="selTerm(this)">Fotosynthese</button>
Beispiel für eine Definition: <button class="def" data-id="1" onclick="selDef(this)" ontouchend="selDef(this)">Umwandlung von Licht in Zucker</button>
WICHTIG: Alle ${itemCount} echten Begriffe und Definitionen direkt als HTML-Elemente. Keine Auslassungspunkte.`,

        memory: `MEMORY-SPIEL — Erstelle JETZT ein JS-Array mit ${itemCount} echten Kartenpaaren zum Thema "${ctx.thema||''}".
Das Array muss GENAU SO aussehen (alle ${itemCount} Einträge vollständig):
const CARDS = [
  {front:"Fotosynthese", back:"Umwandlung von Lichtenergie in chemische Energie"},
  {front:"Chlorophyll", back:"Grüner Farbstoff der Pflanzen, absorbiert Licht"},
  {front:"CO₂", back:"Kohlenstoffdioxid, Ausgangsstoff der Fotosynthese"}
];
Ersetze die Beispiele durch ${itemCount} themenspezifische Paare. Schreibe ALLE ${itemCount} Einträge aus. Keine Auslassungspunkte (...).`,

        karteikarten: `KARTEIKARTEN — Erstelle JETZT ein JS-Array mit ${itemCount} echten Karten zum Thema "${ctx.thema||''}".
Das Array muss GENAU SO aussehen (alle ${itemCount} Einträge vollständig):
const CARDS = [
  {front:"Was ist Fotosynthese?", back:"Die Umwandlung von Lichtenergie in Zucker durch Pflanzen."},
  {front:"Wo findet Fotosynthese statt?", back:"In den Chloroplasten der Pflanzenzellen."},
  {front:"Welche Stoffe werden bei der Fotosynthese benötigt?", back:"CO₂, Wasser und Licht."}
];
Ersetze die Beispiele durch ${itemCount} themenspezifische Karten. Schreibe ALLE ${itemCount} Einträge aus. Keine Auslassungspunkte (...).`,

      };

      const typInstruction = typInstructions[typ] || typInstructions.quiz;

      // Eigene Basis für interaktiv — KEIN JSON, da HTML-Delimiter-Format
      const interaktivBase = `Du bist ein erfahrener HTML5-Entwickler und Didaktik-Experte für Schulunterricht im DACH-Raum.
Du antwortest auf Deutsch. Du antwortest NICHT in JSON — sondern im vorgegebenen Delimiter-Format mit ---HTML---.`;

      return {
        systemPrompt: interaktivBase + `\n\nDu erstellst professionelle, visuell ansprechende interaktive HTML5-Lernspiele für den Schulunterricht als vollständige Single-File-HTML-Dokumente. Das Ergebnis soll wie eine hochwertige Lern-App wirken — nicht wie ein schnelles Schulblatt.

OBERSTE PRIORITÄT: ECHTER INHALT
Alle Fragen, Begriffe, Antworten und Texte müssen real und fachlich korrekt sein.
VERBOTEN: leere JS-Arrays [], Auslassungspunkte (...), Platzhalter wie "Frage 1" / "Begriff A" / "Option A", TODO-Kommentare, generische Beispiele ohne Themenbezug.
PFLICHT: Jedes Array, jeder Block, jede Frage muss mit realem themenspezifischem Inhalt gefüllt sein.

DESIGN & QUALITÄT (das macht den Unterschied!):
⚠️ WICHTIG: Falls die TYP-SPEZIFISCHE ANLEITUNG unten ein eigenes Farbschema oder Design vorgibt, hat dieses ABSOLUTEN VORRANG über diese Standard-Vorgaben!
- Vollständiges <!DOCTYPE html> Single-File, alles inline (kein externes CSS/JS)
- viewport-Meta EXAKT SO: <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
- Google Fonts via @import (je nach Typ passend wählen — nicht immer Nunito/Poppins)
- Standard-Farbpalette (nur wenn Typ keine eigene vorgibt): #3BA89B Primär-Teal, #1A3C5E Navy, #FAF8F5 Hintergrund
- Cards mit box-shadow, border-radius, padding — Werte je nach Typ-Design
- Animiertes Feedback: richtig ✓ + scale-Animation, falsch ✗ + shake-Animation
- Abschluss-Screen mit Ergebnis und "Nochmal"-Button
- Smooth Transitions (opacity + translateY)
- Score-Anzeige oben sichtbar

iPAD/TOUCH PFLICHT (wird auf iPads gespielt — kritisch!):
- ALLE Buttons/klickbaren Elemente haben BEIDE Events: onclick="fn(this)" ontouchend="fn(this)"
- CSS für ALLE Buttons/klickbaren Elemente: cursor:pointer; -webkit-tap-highlight-color:transparent; touch-action:manipulation
- NIEMALS user-select:none auf Buttons, selects oder klickbaren Elementen
- :hover-States IMMER auch als :active-State definieren (iPads kennen kein Hover)
- Buttons mindestens 48px Höhe (Touch-Target-Mindestgröße), volle Breite auf Mobile
- In JS: touchend-Handler müssen event.preventDefault() aufrufen, damit kein doppeltes Feuern mit click entsteht

NIVEAU: ${niveauAnweisung}

TYP-SPEZIFISCHE ANLEITUNG — BEFOLGE EXAKT:
${typInstruction}

AUSGABEFORMAT — ZWINGEND, KEINE AUSNAHME:
Deine Antwort muss EXAKT mit diesen Trennzeichen strukturiert sein. Beginne SOFORT mit ---TITEL---, kein Text davor.
---TITEL---
Titel des Lernspiels
---TYP---
${typ}
---HTML---
<!DOCTYPE html>
[HIER: vollständiges HTML-Dokument — kein Platzhalter, kein ...]
---END---`,

        userPrompt: `Erstelle ein interaktives HTML-Lernspiel mit diesen Angaben:
Thema: ${ctx.thema || '(kein Thema angegeben)'}
Fach: ${ctx.fach || ''}
Jahrgangsstufe: ${ctx.jgst || ''}
Niveau: ${ctx.niveau || 'standard'}
Typ: ${typ}
Anzahl Aufgaben/Elemente: ${itemCount}
${ctx.kontext ? '\nVon der Lehrkraft bereitgestellter Inhalt (nutze diesen als Grundlage!):\n' + ctx.kontext : ''}

DEINE AUFGABE: Schreibe jetzt sofort alle ${itemCount} Elemente mit echtem Inhalt zum Thema "${ctx.thema||''}". Befolge die TYP-SPEZIFISCHE ANLEITUNG und das AUSGABEFORMAT exakt. Alle interaktiven Elemente müssen auf iPad-Touch funktionieren (ontouchend + onclick, 48px Touch-Targets).`,
        maxTokens,
      };
    }

    case 'appbaukasten_themen': {
      const anzahl = parseInt(ctx.anzahl) || 4;
      return {
        systemPrompt: `Du bist ein erfahrener Pädagoge im DACH-Raum. Antworte AUSSCHLIESSLICH mit einem JSON-Array — kein Text davor oder danach, keine Erklärungen.`,
        userPrompt: `Schlage ${anzahl} didaktisch aufeinander aufbauende Teilthemen für einen Forscher-Dungeon vor.

Hauptthema: "${ctx.hauptthema || ''}"
${ctx.fach ? `Fach: ${ctx.fach}` : ''}${ctx.jgst ? ` · Klasse ${ctx.jgst}` : ''}
${ctx.kontext ? `Kontext: ${ctx.kontext}` : ''}

Anforderungen:
- Themen bauen logisch auf (einfach → komplex, chronologisch oder konzeptuell)
- Jedes Thema ist prägnant (2–4 Wörter)
- Alle ${anzahl} Themen decken das Hauptthema vollständig und ohne Überschneidungen ab
- Geeignet als Raumtitel in einem Lern-Dungeon für Klasse ${ctx.jgst || '7–10'}

Antworte NUR mit diesem JSON-Array (${anzahl} Einträge):
["Teilthema 1", "Teilthema 2", ..., "Teilthema ${anzahl}"]`,
        maxTokens: 400,
      };
    }

    case 'appbaukasten': {
      const raumNr       = parseInt(ctx.raumNr)        || 1;
      const gesamtRaeume = parseInt(ctx.gesamtRaeume)  || 3;
      const hauptthema   = ctx.hauptthema  || '';
      const seitenthema  = ctx.seitenthema || hauptthema;
      const naechster    = raumNr < gesamtRaeume ? `r${raumNr+1}-q` : 'end';
      const nextLabel    = raumNr < gesamtRaeume ? `Weiter → Raum ${raumNr+1}` : '🏆 Dungeon abschließen';

      return {
        systemPrompt: `Du bist ein erfahrener Pädagoge und HTML-Entwickler für interaktive Lernmaterialien.
WICHTIG: Antworte AUSSCHLIESSLICH im Delimiter-Format unten. Kein einleitender Text, keine Erklärungen.
Kein <html>, kein <head>, kein <style>, kein <script> — NUR die vier div.screen-Elemente als HTML-Fragment.
Alle Inhalte auf Deutsch. Echter Fachinhalt, keine Platzhalter, keine Auslassungspunkte.`,
        userPrompt: `Erstelle die vier Screen-Divs für RAUM ${raumNr} von ${gesamtRaeume} eines Forscher-Dungeons.

HAUPTTHEMA: "${hauptthema}"
TEILTHEMA DIESES RAUMS: "${seitenthema}"
${ctx.fach ? `Fach: ${ctx.fach}` : ''}${ctx.jgst ? ` · Klasse ${ctx.jgst}` : ''}
${Array.isArray(ctx.alleTitel) && ctx.alleTitel.length > 1 ? `\nDUNGEON-STRUKTUR (alle Räume — für Kohärenz und logischen Aufbau):\n${ctx.alleTitel.map((t,i) => `  Raum ${i+1}: ${t}${i+1===raumNr?' ← DIESER RAUM':''}`).join('\n')}\n` : ''}${ctx.kontext ? `\nKontext:\n${ctx.kontext}\n` : ''}
VERFÜGBARE CSS-KLASSEN (exakt verwenden, keine neuen erfinden):
.screen · .progress · .room-title · .narrative · .question · .choices · .choice-btn · .correct-box · .wrong-box · .trap-box · .next-btn

SCREEN-IDs für diesen Raum:
- Frage:    r${raumNr}-q      (erster Screen, der angezeigt wird)
- Richtig:  r${raumNr}-correct
- Falsch-A: r${raumNr}-wrong-a
- Falsch-B: r${raumNr}-wrong-b
- Nächster: ${naechster}

MUSTER — ersetze alle [PLATZHALTER] durch echten Inhalt zu "${seitenthema}":

<div class="screen" id="r${raumNr}-q">
  <div class="progress">🗺️ Raum ${raumNr} von ${gesamtRaeume} · ${seitenthema}</div>
  <div class="room-title">◆ [THEMATISCHER RAUMNAME IN GROSSBUCHSTABEN] ◆</div>
  <p class="narrative">[3–4 atmosphärische Sätze mit eingebetteten echten Fachfakten zu "${seitenthema}"]</p>
  <p class="question">"[Frage als narrative Entscheidung mit echter Fachfrage — mische die Reihenfolge richtig/falsch]"</p>
  <div class="choices">
    <button class="choice-btn" onclick="show('r${raumNr}-correct')" ontouchend="show('r${raumNr}-correct')">[KORREKTE ANTWORT]</button>
    <button class="choice-btn" onclick="show('r${raumNr}-wrong-a')" ontouchend="show('r${raumNr}-wrong-a')">[FALSCHE ANTWORT A]</button>
    <button class="choice-btn" onclick="show('r${raumNr}-wrong-b')" ontouchend="show('r${raumNr}-wrong-b')">[FALSCHE ANTWORT B]</button>
  </div>
</div>

<div class="screen" id="r${raumNr}-correct">
  <div class="progress">🗺️ Raum ${raumNr} von ${gesamtRaeume}</div>
  <div class="correct-box">✅ [Bestätigung + 1 interessante Zusatzinfo zu "${seitenthema}"]</div>
  <button class="next-btn" onclick="show('${naechster}')" ontouchend="show('${naechster}')">${nextLabel}</button>
</div>

<div class="screen" id="r${raumNr}-wrong-a">
  <div class="progress">🗺️ Raum ${raumNr} von ${gesamtRaeume}</div>
  <div class="wrong-box">⚠️ [Kurze Erklärung warum Antwort A falsch ist + Richtigstellung]</div>
  <div class="trap-box">🔒 Rettungsfrage: [Einfachere Kontrollfrage zu "${seitenthema}"]
    <div class="choices" style="margin-top:.6rem">
      <button class="choice-btn" onclick="setTimeout(function(){show('${naechster}')},1400);this.style.background='rgba(52,199,89,.2)';this.style.borderColor='#34C759'" ontouchend="setTimeout(function(){show('${naechster}')},1400);this.style.background='rgba(52,199,89,.2)';this.style.borderColor='#34C759'">[RICHTIGE RETTUNGSANTWORT]</button>
      <button class="choice-btn" onclick="this.style.background='rgba(255,69,58,.2)';this.style.borderColor='#FF453A'" ontouchend="this.style.background='rgba(255,69,58,.2)';this.style.borderColor='#FF453A'">[FALSCHE RETTUNGSANTWORT]</button>
    </div>
  </div>
</div>

<div class="screen" id="r${raumNr}-wrong-b">
  <div class="progress">🗺️ Raum ${raumNr} von ${gesamtRaeume}</div>
  <div class="wrong-box">⚠️ [Kurze Erklärung warum Antwort B falsch ist + Richtigstellung]</div>
  <div class="trap-box">🔒 Rettungsfrage: [Andere einfache Kontrollfrage zu "${seitenthema}"]
    <div class="choices" style="margin-top:.6rem">
      <button class="choice-btn" onclick="setTimeout(function(){show('${naechster}')},1400);this.style.background='rgba(52,199,89,.2)';this.style.borderColor='#34C759'" ontouchend="setTimeout(function(){show('${naechster}')},1400);this.style.background='rgba(52,199,89,.2)';this.style.borderColor='#34C759'">[RICHTIGE RETTUNGSANTWORT]</button>
      <button class="choice-btn" onclick="this.style.background='rgba(255,69,58,.2)';this.style.borderColor='#FF453A'" ontouchend="this.style.background='rgba(255,69,58,.2)';this.style.borderColor='#FF453A'">[FALSCHE RETTUNGSANTWORT]</button>
    </div>
  </div>
</div>

AUSGABEFORMAT — ZWINGEND EINHALTEN:
---TITEL---
${seitenthema}
---TYP---
dungeon-raum
---HTML---
[Hier die vier div.screen-Elemente — kein HTML-Dokument, kein Style-Tag, kein Script-Tag]
---END---`,
        maxTokens: 2500,
      };
    }

    case 'elternbrief': {
      const isPremiumE = ctx.premium === true || ctx.premium === 'true';
      const anlassMap = {
        ausflug:      'Tagesausflug / Exkursion',
        klassenfahrt: 'Mehrtägige Klassenfahrt / Schullandheim',
        veranstaltung:'Schulveranstaltung / Aufführung / Wettkampf',
        info:         'Informationsschreiben / allgemeine Mitteilung',
        sonstiges:    'Sonstiges / freie Formulierung',
      };
      const anlassText = anlassMap[ctx.anlass || 'info'] || anlassMap.info;
      const tonMap = {
        formell:    'Formell und sachlich. Siezen. Keine Ausrufezeichen.',
        freundlich: 'Freundlich-informell aber professionell. Ggf. "Liebe Eltern" statt "Sehr geehrte Eltern".',
      };
      const tonAnweisung = isPremiumE ? (tonMap[ctx.ton || 'freundlich'] || tonMap.freundlich) : tonMap.freundlich;

      return {
        systemPrompt: baseSystem + `\n\nDu schreibst professionelle Elternbriefe für Lehrkräfte in Deutschland.
Ton: ${tonAnweisung}
Der Brief ist klar strukturiert: Anrede → Zweck → Details → Bitte/Hinweise → Grußformel.
${ctx.ruecklauf === 'true' || ctx.ruecklauf === true ? 'Füge einen abtrennbaren Rücklaufzettel mit den nötigen Feldern zum Unterschreiben/Ankreuzen hinzu.' : ''}

DSGVO-PFLICHTREGELN — ABSOLUT VERBINDLICH:
- Verwende AUSSCHLIESSLICH Platzhalter in [eckigen Klammern] für alle personenbezogenen Angaben
- Erlaubte Platzhalter: [Vorname], [Nachname], [Klasse], [Schulname], [Ort], [Unterschrift der Lehrkraft]
- NIEMALS echte Namen, Noten, Verhaltensbeschreibungen oder andere personenbezogene Daten in den Brief schreiben
- Der Brief muss auch dann DSGVO-konform sein, wenn der Lehrkraft versehentlich persönliche Daten in den Kontext eingegeben hat — ignoriere diese und ersetze sie durch Platzhalter
- Grußformel endet IMMER mit: [Unterschrift der Lehrkraft] \n [Vor- und Nachname]

AUSGABEFORMAT — ZWINGEND:
{
  "betreff": "Betreff-Zeile des Briefes",
  "datum_placeholder": "[Ort, Datum]",
  "anrede": "Anrede-Zeile",
  "inhalt": "Vollständiger Brieftext (Absätze mit \\n\\n getrennt). Alle persönlichen Daten als [Platzhalter].",
  "gruss": "Grußformel + [Unterschrift der Lehrkraft]\\n[Vor- und Nachname]",
  "wichtige_hinweise": ["Vor dem Versand: [Platzhalter] durch echte Daten ersetzen", "KI-Text auf Richtigkeit prüfen — Lehrkraft trägt die Verantwortung"]${ctx.ruecklauf === 'true' || ctx.ruecklauf === true ? `,
  "ruecklaufzettel": {
    "titel": "Titel des Rücklaufzettels",
    "felder": [
      {"typ": "text|checkbox|datum", "beschriftung": "Feldbeschriftung", "pflicht": true}
    ]
  }` : ''}${isPremiumE && ctx.sprachen ? `,
  "uebersetzungshinweis": "Wichtigste Infos des Briefes auf Englisch (für mehrsprachige Familien, kein Fließtext, nur Kerninfos)"` : ''}
}`,
        userPrompt: `Erstelle einen DSGVO-konformen Elternbrief (alle Namen als Platzhalter):
Anlass: ${anlassText}
Klasse: ${ctx.klasse || '[Klasse]'}
${ctx.datum_ereignis ? 'Datum des Ereignisses: ' + ctx.datum_ereignis : ''}
${ctx.frist ? 'Rücklauf-Frist: ' + ctx.frist : ''}
Details / Besonderheiten: ${ctx.details || ''}
Rücklaufzettel benötigt: ${ctx.ruecklauf === 'true' || ctx.ruecklauf === true ? 'Ja' : 'Nein'}
${ctx.kosten ? 'Kosten / Teilnahmebeitrag: ' + ctx.kosten : ''}

Antworte NUR mit dem JSON-Objekt.`,
        maxTokens: isPremiumE ? 2500 : 1800,
      };
    }

    case 'feld_refresh': {
      const feldLabels = {
        lernziele:    'Lernziele (2–3 kompetenzorientierte Lernziele)',
        hausaufgaben: 'Hausaufgaben (passend zum Thema)',
        tafelbild:    'Tafelbild (Struktur als Text)',
        einstieg:     'Einstieg (vollständig ausgearbeitet)',
        erarbeitung:  'Erarbeitung (detailliert)',
        sicherung:    'Sicherung (konkret)',
      };
      const feldKey = ctx.field || 'lernziele';
      const feldLabel = feldLabels[feldKey] || feldKey;

      const feldGuidelines = {
        lernziele: `LERNZIELE — VERBINDLICHE REGELN (nach DG 1 / Brunnhuber):
- Formuliere 2–3 FEINZIELE — operationalisiert, nachprüfbar, konkret
- Verwende ausschließlich nachprüfbare Operationsverben: nennen, aufzählen, beschreiben, erklären, unterscheiden, vergleichen, anwenden, berechnen, lösen, beurteilen, begründen, darstellen, gestalten
- VERBOTEN: "verstehen", "kennen", "kennenlernen", "wissen" — diese sind nicht nachprüfbar
- Format: "Die SuS können [Operationsverb] [Inhalt]."
- Bezug auf Lehrplan und Stundenthema herstellen`,

        tafelbild: `TAFELBILD — VERBINDLICHE REGELN (nach DG 2):
- STRENGE REDUKTION: Nur das absolut Wesentliche gehört auf die Tafel. Motto: "Was nicht auf die Tafel passt, passt nicht in den Kopf."
- ÜBERSICHTLICHKEIT: Klare, logische Anordnung. Genug Abstand zwischen Elementen. Kein Gedränge.
- STRUKTURIERUNG DER ZUSAMMENHÄNGE: Beziehungen sichtbar machen (Pfeile, Einrückung für Über-/Unterordnung, Rahmen für Zusammengehöriges)
- ANSCHAULICHKEIT: Farbe, Symbole, Skizzen nur inhaltlich sinnvoll — nicht dekorativ
- REKAPITULIERBARKEIT: Das Tafelbild fasst die Stundenergebnisse zusammen, kann als Heftbild abgeschrieben werden

AUSGABEFORMAT — ZWINGEND EINZUHALTEN:
Gliedere das Tafelbild IMMER in drei Bereiche. Verwende exakt diese Struktur:
LINKS:
<Inhalt linke Tafelseite — z.B. Einstiegsfrage, Vorwissen, Begriff>

MITTE:
<Inhalt Mitte — Hauptinhalt, Kernbegriffe, Erklärung, Formel, Schema>

RECHTS:
<Inhalt rechte Tafelseite — z.B. Beispiel, Aufgabe, Ergebnis, Merksatz>

Jeder Bereich maximal 4–5 knappe Zeilen. Kein Fließtext. Nur das Wesentlichste.`,

        hausaufgaben: `HAUSAUFGABEN — VERBINDLICHE REGELN (nach DG 6):
- Hausaufgaben erwachsen aus dem Unterricht — sie knüpfen direkt an Stundenergebnis an, kein Zusatzthema
- Klar und präzise formuliert — SuS wissen ohne Rückfrage was zu tun ist
- Selbstständig lösbar: SuS müssen die HA ohne Hilfe lösen können (keine neuen, ungeübten Inhalte)
- Differenziert wenn möglich: Pflichtaufgabe + optionale Erweiterung für Stärkere
- Sinnvoll: Nicht mechanisches "Aufgaben 1-10 aus Schulbuch Seite X" ohne didaktischen Grund
- Umfang angemessen: Keine Überlastung — lieber wenig, dafür gezielt
- Ziel: Sicherung/Festigung des Gelernten, erste Selbstständige Anwendung`,

        einstieg: `EINSTIEG — VERBINDLICHE REGELN:
- Motivierend und aktivierend: Problemstellung, Rätsel, Alltagsbezug, Provokation, Bild, Kurzgeschichte
- Klarer Lehrerimpuls (was zeigt/fragt/stellt die Lehrkraft?) + SuS-Reaktion (was tun/sagen/denken die SuS?)
- Zielstellung der Stunde transparent machen: SuS wissen am Ende des Einstiegs, was sie heute lernen
- Anknüpfung an Vorwissen oder Erfahrungen der SuS
- Zeitrahmen realistisch (5-10 Min)`,

        erarbeitung: `ERARBEITUNG — VERBINDLICHE REGELN:
- SuS-zentriert und handlungsorientiert: SuS arbeiten aktiv, Lehrkraft moderiert
- Mit der angegebenen Sozialform — konkret ausformuliert (was genau machen die SuS?)
- Differenzierung: Mindestens Grundniveau und Erweiterungsniveau
- Lehrkraft gibt gezielte Hilfestellungen, erklärt bei Bedarf, beobachtet Lernprozess
- Zwischensicherung oder -reflexion wenn nötig`,

        sicherung: `SICHERUNG — VERBINDLICHE REGELN:
- Lernziele werden überprüft: Haben die SuS das Stundenziel erreicht?
- Ergebnisse werden gesichert: Tafelbild abschreiben, Hefteintrag, Ergebnispräsentation
- Erste Wiederholung direkt in der Stunde (nicht auf nächste Woche verschieben)
- Verbindlicher Abschluss: SuS wissen, was sie gelernt haben
- Wenn möglich: SuS formulieren Ergebnis selbst (nicht nur Lehrkraft)`,
      };

      const extraGuidance = feldGuidelines[feldKey] || '';

      return {
        systemPrompt: baseSystem + `\n\nDu erstellst NUR ein einzelnes Feld einer Stundenvorbereitung.
${extraGuidance ? '\n' + extraGuidance + '\n' : ''}
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt mit genau einem Key: {"${feldKey}":"...Inhalt..."}
Kein Markdown, keine Erklärung, nur das JSON.`,
        userPrompt: `Erstelle für folgende Stunde das Feld: ${feldLabel}
Fach: ${ctx.fach || ''}
Klasse/Jgst: ${ctx.jgst || ''}
Schulart: ${ctx.schulart || ''}
Thema: ${ctx.thema || ''}
Lehrplanbezug: ${ctx.lehrplan || ''}
Sequenz: ${ctx.sequenz || ''}
${ctx.besonderheiten ? 'Hinweise: ' + ctx.besonderheiten : ''}
${ctx.existingContent ? 'Bisheriger Inhalt (bitte verbessern/variieren): ' + ctx.existingContent : ''}

Antworte NUR mit dem JSON-Objekt {"${feldKey}":"..."}.`,
        maxTokens: 1000,
      };
    }

    default:
      return {
        systemPrompt: baseSystem,
        userPrompt: ctx.prompt || 'Hallo',
        maxTokens: 1000,
      };
  }
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// GIVEAWAY
// ═══════════════════════════════════════════

function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = '';
  for (let i = 0; i < 12; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

async function handleGiveawayCreate(request, env, corsHeaders) {
  const { plan, credits, count } = await request.json();
  const validPlans = ['founder', 'credits'];
  if (!validPlans.includes(plan)) return json({ error: 'Ungültiger Plan' }, 400, corsHeaders);
  const n = Math.min(Math.max(parseInt(count) || 1, 1), 50);
  const tokens = [];
  for (let i = 0; i < n; i++) {
    const token = generateToken();
    await env.LICENSES.put('giveaway:' + token, JSON.stringify({
      plan, credits: parseInt(credits) || 29,
      used: false, createdAt: new Date().toISOString()
    }), { expirationTtl: 60 * 60 * 24 * 60 }); // 60 Tage gültig
    tokens.push({ token, url: 'https://app.teachsmarter.de/claim?token=' + token });
  }
  return json({ tokens }, 200, corsHeaders);
}

async function handleGiveawayClaim(request, env, corsHeaders) {
  const { token, email } = await request.json();
  if (!token || !email) return json({ error: 'Token und Email erforderlich.' }, 400, corsHeaders);

  const data = await env.LICENSES.get('giveaway:' + token, 'json');
  if (!data) return json({ error: 'Ungültiger oder abgelaufener Link.' }, 404, corsHeaders);
  if (data.used) return json({ error: 'Dieser Gewinn-Link wurde bereits eingelöst.' }, 409, corsHeaders);

  const key = generateKey(data.plan === 'founder' ? 'founder' : 'credits_giveaway');
  const license = {
    key, email,
    plan: data.plan,
    credits: data.credits,
    creditsTotal: data.credits,
    createdAt: new Date().toISOString(),
    source: 'giveaway',
    purchases: [{ date: new Date().toISOString(), product: 'giveaway_' + data.plan, credits: data.credits }]
  };
  await env.LICENSES.put(key, JSON.stringify(license));
  const emailKeys = await env.LICENSES.get('email:' + email, 'json') || [];
  emailKeys.push(key);
  await env.LICENSES.put('email:' + email, JSON.stringify(emailKeys));

  // Token als eingelöst markieren
  data.used = true;
  data.redeemedBy = email;
  data.redeemedAt = new Date().toISOString();
  await env.LICENSES.put('giveaway:' + token, JSON.stringify(data));

  await sendLicenseEmail(env, email, key, data.plan, data.credits);

  return json({ ok: true, key, plan: data.plan, credits: data.credits }, 200, corsHeaders);
}

// HELPERS
// ═══════════════════════════════════════════
function generateKey(productId) {
  const prefix = productId.includes('founder') ? 'TS-F' :
                 productId.includes('premium') ? 'TS-U' : 'TS-C';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 (ambiguous)
  let key = prefix + '-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) key += '-';
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function getCreditsForProduct(productId) {
  if (productId.includes('founder'))      return 29;   // Gründeredition 12,99 € — 29 KI-Credits
  if (productId.includes('credits_15'))   return 15;   // Schnuppern 1,99 €
  if (productId.includes('credits_45'))   return 45;   // Standard 5,49 €
  if (productId.includes('credits_99'))   return 99;   // Profi 10,99 €
  if (productId.includes('sub_29'))       return 29;   // Abo 4,99 €/Monat
  // Legacy (Altpakete)
  if (productId.includes('credits_100'))  return 100;
  if (productId.includes('credits_300'))  return 300;
  if (productId.includes('premium'))      return 999999;
  return 15; // default
}

function getPlanForProduct(productId) {
  if (productId.includes('founder'))  return 'founder';
  if (productId.includes('sub_29'))   return 'abo';
  if (productId.includes('premium'))  return 'premium';
  return 'credits';
}

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ═══════════════════════════════════════════
// STRIPE SIGNATURE VERIFICATION
// ═══════════════════════════════════════════
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  try {
    const parts = Object.fromEntries(
      sigHeader.split(',').map(p => p.trim().split('='))
    );
    const timestamp = parts['t'];
    const sig = parts['v1'];
    if (!timestamp || !sig) return false;

    const signedPayload = timestamp + '.' + payload;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload)
    );
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return expected === sig;
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

// ═══════════════════════════════════════════
// EMAIL (Resend)
// ═══════════════════════════════════════════
async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: 'TeachSmarter <bjoernsydow@teachsmarter.de>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) console.error('Resend error:', await res.text());
}

async function sendLicenseEmail(env, email, key, plan, credits) {
  const isFounder  = plan === 'founder';
  const isPremium  = plan === 'premium';
  const planLabel  = isPremium ? 'Flatrate (unbegrenzt)' :
                     isFounder ? "Founder's Edition (29 KI-Credits)" :
                     credits + ' KI-Credits';

  const WIN_URL = 'https://github.com/derbjoern28/teachsmarter-app/releases/latest/download/TeachSmarter-Setup.exe';
  const MAC_URL = 'https://github.com/derbjoern28/teachsmarter-app/releases/latest/download/TeachSmarter-mac-arm64.dmg';
  const WEB_URL = 'https://app.teachsmarter.de/TeachSmarter_Dashboard';

  const downloadBlock = (isFounder || isPremium) ? `
        <p style="color:#555;margin-bottom:12px"><strong>📥 App herunterladen:</strong></p>
        <table style="width:100%;border-collapse:separate;border-spacing:0 8px;margin-bottom:24px">
          <tr>
            <td style="padding:0 4px 0 0">
              <a href="${WIN_URL}"
                 style="display:block;background:#0078d4;color:#fff;text-decoration:none;border-radius:8px;padding:12px 16px;text-align:center;font-weight:600;font-size:.9rem">
                🪟 Windows herunterladen (.exe)
              </a>
            </td>
            <td style="padding:0 0 0 4px">
              <a href="${MAC_URL}"
                 style="display:block;background:#1d1d1f;color:#fff;text-decoration:none;border-radius:8px;padding:12px 16px;text-align:center;font-weight:600;font-size:.9rem">
                🍎 Mac herunterladen (.dmg)
              </a>
            </td>
          </tr>
        </table>
        <p style="color:#555;margin-bottom:24px;font-size:.85rem">
          Oder direkt im Browser (PWA) öffnen:
          <a href="${WEB_URL}" style="color:#3BA89B">${WEB_URL}</a>
        </p>
  ` : '';

  await sendEmail(env, {
    to: email,
    subject: isFounder ? "🎉 Deine TeachSmarter Founder's Edition" : 'Dein TeachSmarter Lizenzschlüssel',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        ${isFounder ? `
        <div style="background:linear-gradient(135deg,#1A3C5E,#3BA89B);border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
          <div style="font-size:2rem;margin-bottom:8px">🏅</div>
          <h1 style="font-size:1.4rem;color:#fff;margin:0 0 4px">Founder's Edition</h1>
          <p style="color:rgba(255,255,255,.8);margin:0;font-size:.9rem">Du gehörst zu den ersten TeachSmarter-Nutzern!</p>
        </div>
        ` : `<h1 style="font-size:1.5rem;color:#1a1a1a;margin-bottom:8px">Willkommen bei TeachSmarter! 🎉</h1>`}

        <p style="color:#555;margin-bottom:24px">Vielen Dank für deinen Kauf. Hier ist dein persönlicher Lizenzschlüssel:</p>

        <div style="background:#f4f4f4;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
          <div style="font-family:monospace;font-size:1.6rem;letter-spacing:.1em;font-weight:700;color:#1a1a1a">${key}</div>
          <div style="color:#888;font-size:.85rem;margin-top:6px">Paket: ${planLabel}</div>
        </div>

        ${downloadBlock}

        <p style="color:#555;margin-bottom:8px"><strong>So aktivierst du deinen Schlüssel:</strong></p>
        <ol style="color:#555;padding-left:20px;margin-bottom:24px">
          <li>Öffne die TeachSmarter App (Download oben oder PWA)</li>
          <li>Gehe zu <strong>Einstellungen → Abo &amp; KI</strong></li>
          <li>Trage den Schlüssel ein und tippe auf <strong>Aktivieren</strong></li>
        </ol>

        <p style="color:#555;margin-bottom:24px">Ab sofort kannst du den KI-Assistenten für Stundenvorbereitung, Sequenzplanung und Jahresplanung nutzen.</p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
        <p style="color:#aaa;font-size:.8rem">Bei Fragen antworte einfach auf diese E-Mail.<br>TeachSmarter · teachsmarter.de</p>
      </div>
    `,
  });
}

async function sendTopUpEmail(env, email, key, creditsAdded, creditsTotal) {
  await sendEmail(env, {
    to: email,
    subject: `${creditsAdded} KI-Credits hinzugefügt — TeachSmarter`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:1.5rem;color:#1a1a1a;margin-bottom:8px">Credits aufgeladen ⚡</h1>
        <p style="color:#555;margin-bottom:24px">Dein Credits-Guthaben wurde erfolgreich aufgeladen.</p>

        <div style="background:#f4f4f4;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
          <div style="font-size:2rem;font-weight:700;color:#3BA89B">+${creditsAdded}</div>
          <div style="color:#888;font-size:.9rem">neue Credits · Gesamt jetzt: <strong>${creditsTotal}</strong></div>
        </div>

        <p style="color:#555;margin-bottom:24px">Dein Lizenzschlüssel: <code style="font-family:monospace;background:#f4f4f4;padding:2px 6px;border-radius:4px">${key}</code></p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
        <p style="color:#aaa;font-size:.8rem">TeachSmarter · teachsmarter.de</p>
      </div>
    `,
  });
}

// ═══════════════════════════════════════════
// SCHULFERIEN PROXY (ferien-api.de → DE)
// ═══════════════════════════════════════════
const DE_STATES = new Set(['BB','BE','BW','BY','HB','HE','HH','MV','NI','NW','RP','SH','SL','SN','ST','TH']);

// ferien-api.de returns UTC timestamps at CET/CEST midnight → normalize to YYYY-MM-DD
function normFerienDate(utcStr) {
  const ms = new Date(utcStr).getTime();
  // +2h safely shifts midnight CET (T23:00Z) and CEST (T22:00Z) past midnight UTC
  return new Date(ms + 7200000).toISOString().slice(0, 10);
}

async function handleSchulferien(request, env, cors) {
  const url   = new URL(request.url);
  const state = (url.searchParams.get('state') || '').toUpperCase();
  const year  = parseInt(url.searchParams.get('year') || '0', 10);

  if (!DE_STATES.has(state) || year < 2020 || year > 2035) {
    return json([], 200, cors);
  }

  const upstream = `https://ferien-api.de/api/v1/holidays/${state}/${year}`;

  // Try Cloudflare Cache first (7-day TTL)
  const cache    = caches.default;
  const cacheReq = new Request(upstream);
  const cached   = await cache.match(cacheReq);
  if (cached) {
    const data = await cached.json();
    return json(data, 200, cors);
  }

  try {
    const res = await fetch(upstream, {
      headers: { 'User-Agent': 'TeachSmarter/2.0', 'Accept': 'application/json' },
      cf: { cacheTtl: 604800, cacheEverything: true },
    });
    if (!res.ok) throw new Error('upstream ' + res.status);

    const raw  = await res.json();
    // Normalize dates: UTC timestamps → YYYY-MM-DD (CET/CEST-aware)
    const data = raw.map(f => ({
      name:  f.name,
      start: normFerienDate(f.start),
      end:   normFerienDate(f.end),
    }));

    // Store in cache
    const cacheResp = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=604800' },
    });
    await cache.put(cacheReq, cacheResp);

    return json(data, 200, cors);
  } catch (e) {
    console.error('Schulferien proxy error:', e);
    return json({ error: 'upstream_error' }, 502, cors);
  }
}

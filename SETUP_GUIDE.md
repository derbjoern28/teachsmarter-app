# TeachSmarter Backend — Setup-Anleitung

## 1. Stripe einrichten (30 Minuten)

### Konto erstellen
1. https://dashboard.stripe.com/register
2. Unternehmensdaten eingeben (Einzelunternehmen reicht)
3. Bankkonto für Auszahlungen hinterlegen

### Produkte anlegen (Dashboard → Produkte → + Produkt)

**Produkt 1: Founder's Edition**
- Name: `TeachSmarter Founder's Edition`
- Preis: €9,00 (einmalig)
- Metadata: `product_id` = `founder`
- Beschreibung: Voller Zugang + 50 KI-Credits

**Produkt 2: 100 KI-Credits**
- Name: `100 KI-Credits`
- Preis: €4,99 (einmalig)
- Metadata: `product_id` = `credits_100`

**Produkt 3: 300 KI-Credits**
- Name: `300 KI-Credits`
- Preis: €9,99 (einmalig)
- Metadata: `product_id` = `credits_300`

**Produkt 4: KI-Flatrate**
- Name: `KI-Flatrate`
- Preis: €3,99/Monat (wiederkehrend)
- Metadata: `product_id` = `flatrate`

### Checkout-Links erstellen
Dashboard → Zahlungslinks → + Zahlungslink
- Wähle das Produkt
- Aktiviere "E-Mail-Adresse erfassen"
- Unter "Nach Zahlung" → Weiterleitung zu: `https://app.teachsmarter.de?purchased=true`
- Kopiere den Link → kommt auf die Landing Page

### Webhook einrichten
Dashboard → Entwickler → Webhooks → + Endpoint
- URL: `https://api.teachsmarter.de/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`
- Kopiere das Webhook-Secret (whsec_...)

### Test-Modus
Alles erstmal im Test-Modus machen (Toggle oben rechts im Dashboard).
Test-Kreditkarte: `4242 4242 4242 4242`, beliebiges Datum, beliebige CVC.

---

## 2. Cloudflare Worker einrichten (20 Minuten)

### Voraussetzungen
```bash
npm install -g wrangler
wrangler login
```

### KV Namespace erstellen
```bash
wrangler kv:namespace create LICENSES
```
→ gibt dir eine ID. Trage sie in `wrangler.toml` ein.

### Secrets setzen
```bash
wrangler secret put STRIPE_SECRET_KEY
# → sk_test_... (später sk_live_...)

wrangler secret put STRIPE_WEBHOOK_SECRET
# → whsec_...

wrangler secret put ANTHROPIC_API_KEY
# → sk-ant-...
```

### Deployen
```bash
wrangler deploy
```

### Custom Domain (optional, empfohlen)
Im Cloudflare Dashboard → Workers → dein Worker → Settings → Custom Domains
→ `api.teachsmarter.de` hinzufügen
(DNS muss bei Cloudflare liegen oder CNAME gesetzt werden)

### Testen
```bash
# Verify endpoint
curl -X POST https://api.teachsmarter.de/verify \
  -H "Content-Type: application/json" \
  -d '{"key":"TS-F-TEST-1234"}'

# Sollte {"valid":false,"error":"Unknown key"} zurückgeben
```

---

## 3. Frontend-Integration (in Claude Code)

### API-Endpunkt konfigurieren
```javascript
// In ts-core.js oder eigene Datei ts-ki.js
const TS_API = 'https://api.teachsmarter.de';
// Zum Testen lokal: const TS_API = 'http://localhost:8787';

let licenseKey = localStorage.getItem('ts_license_key') || '';
```

### Lizenz-Verifizierung
```javascript
async function verifyLicense() {
  if (!licenseKey) return { valid: false };
  try {
    const res = await fetch(TS_API + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey })
    });
    return await res.json();
  } catch (e) {
    return { valid: false, error: 'offline' };
  }
}

function setLicenseKey(key) {
  licenseKey = key.trim().toUpperCase();
  localStorage.setItem('ts_license_key', licenseKey);
}
```

### KI-Aufruf
```javascript
async function callKI(feature, context) {
  if (!licenseKey) {
    alert('Bitte zuerst einen Lizenzschlüssel eingeben (Einstellungen).');
    return null;
  }

  try {
    const res = await fetch(TS_API + '/api/ki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey, feature, context })
    });

    const data = await res.json();

    if (data.error === 'no_credits') {
      // Credits-Kaufen-Dialog anzeigen
      showCreditsDialog();
      return null;
    }

    if (data.error) {
      alert('KI-Fehler: ' + data.error);
      return null;
    }

    // Update Credit-Anzeige
    updateCreditDisplay(data.credits, data.isFlatrate);

    // Parse JSON result
    try {
      return JSON.parse(data.result);
    } catch (e) {
      return data.result; // Fallback: raw text
    }

  } catch (e) {
    alert('Verbindungsfehler. Bitte prüfe deine Internetverbindung.');
    return null;
  }
}
```

### Beispiel: 🪄 Sequenzplanung per KI
```javascript
async function wmGenerateSeqs() {
  const plan = getJpPlan();
  if (!plan || !wmLbId) return;
  const lb = plan.lernbereiche.find(l => l.id === wmLbId);
  if (!lb) return;

  const klasse = getKlasse(document.getElementById('jp-klasse').value);
  const fach = getFach(document.getElementById('jp-fach').value);

  // Loading state
  const btn = event.target;
  btn.textContent = '⏳ Generiere...';
  btn.disabled = true;

  const result = await callKI('sequenzplanung', {
    lernbereich: lb.name,
    ue: lb.ue,
    fach: fach?.name || '',
    jgst: klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart || '',
    bundesland: state.bundesland || '',
    schulbuch: plan.schulbuch || ''
  });

  btn.textContent = '🪄 KI';
  btn.disabled = false;

  if (result && Array.isArray(result)) {
    wmTempSeqs = result.map(s => ({
      title: s.title || s.name || '',
      ue: s.ue || 2
    }));
    wmRenderSeqList();
  }
}
```

### Beispiel: 🪄 Stundenvorbereitung per KI
```javascript
async function svGenerateKI() {
  if (!svContext) return;
  const { datum, fachId, klasseId, slotIdx } = svContext;
  const fach = getFach(fachId);
  const klasse = getKlasse(klasseId);
  const zr = getZeitraster();
  const slot = zr[slotIdx];

  const btn = document.getElementById('sv-ki-btn');
  if (btn) { btn.textContent = '⏳ Generiere...'; btn.disabled = true; }

  const result = await callKI('stundenvorbereitung', {
    fach: fach?.name || '',
    klasse: klasse?.name || '',
    jgst: klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart || '',
    bundesland: state.bundesland || '',
    lehrplan: document.getElementById('sv-lehrplan')?.value || '',
    sequenz: document.getElementById('sv-sequenz')?.value || '',
    thema: document.getElementById('sv-thema')?.value || '',
    zeit: slot ? (parseInt(slot.bis.split(':')[0])*60+parseInt(slot.bis.split(':')[1]) - parseInt(slot.von.split(':')[0])*60-parseInt(slot.von.split(':')[1])) + ' Minuten' : '45 Minuten',
    sus: klasse?.sus || '',
    besonderheiten: klasse?.besonderheiten || '',
    schwerpunkte: state.schwerpunkte || ''
  });

  if (btn) { btn.textContent = '🪄 KI ausfüllen'; btn.disabled = false; }

  if (result && typeof result === 'object') {
    const fields = ['lernziele','einstieg','erarbeitung','sicherung','material','hausaufgaben','tafelbild'];
    fields.forEach(f => {
      const el = document.getElementById('sv-' + f);
      if (el && result[f]) {
        el.value = result[f];
      }
    });
    svAutoSave();
  }
}
```

### Beispiel: 🪄 Jahresplanung per KI
```javascript
async function kiDistribute() {
  const klasseId = document.getElementById('jp-klasse').value;
  const fachId = document.getElementById('jp-fach').value;
  if (!klasseId || !fachId) { alert('Bitte Klasse und Fach wählen.'); return; }

  const klasse = getKlasse(klasseId);
  const fach = getFach(fachId);
  const weeks = getSchoolWeeks(klasseId, fachId);
  const totalUE = weeks.reduce((s, w) => s + w.ue, 0);

  const result = await callKI('jahresplanung', {
    bundesland: state.bundesland || '',
    schulart: state.schulart || '',
    fach: fach?.name || '',
    jgst: klasse ? extractJgst(klasse.name) : '',
    wochenstunden: countWeeklyUE(),
    totalUE,
    schwerpunkte: state.schwerpunkte || '',
    schulbuch: getJpPlan()?.schulbuch || ''
  });

  if (result && Array.isArray(result)) {
    const plan = getJpPlan();
    if (!plan) return;
    plan.lernbereiche = [];

    let pinCursor = 0;
    result.forEach((lb, i) => {
      const newLb = {
        id: 'lb_' + Date.now() + '_' + i,
        name: lb.name,
        ue: lb.ue || 10,
        notes: '',
        color: JP_LB_COLORS[i % JP_LB_COLORS.length],
        sequenzen: (lb.sequenzen || []).map(s => ({ title: s.title, ue: s.ue || 2 })),
        pinWeek: pinCursor
      };
      plan.lernbereiche.push(newLb);

      // Advance cursor
      let rem = newLb.ue;
      while (rem > 0 && pinCursor < weeks.length) {
        if (!weeks[pinCursor].isFerien && weeks[pinCursor].ue > 0) {
          rem -= weeks[pinCursor].ue;
        }
        pinCursor++;
      }
    });

    _scheduleCache.hash = '';
    saveJpData();
    renderPlanung();
    renderKiPanel();
  }
}
```

---

## 4. Credit-Anzeige in der App

```javascript
function updateCreditDisplay(credits, isFlatrate) {
  const el = document.getElementById('credit-display');
  if (!el) return;
  el.textContent = isFlatrate ? '∞ Flatrate' : credits + ' Credits';
}

function showCreditsDialog() {
  // Zeige Dialog mit Kauf-Optionen
  const html = `
    <h3>KI-Credits aufbraucht</h3>
    <p>Wähle ein Paket:</p>
    <a href="DEIN_STRIPE_LINK_100" target="_blank" class="pl-ki-btn pl-ki-btn-primary" style="margin:8px 0;text-decoration:none">100 Credits — €4,99</a>
    <a href="DEIN_STRIPE_LINK_300" target="_blank" class="pl-ki-btn pl-ki-btn-primary" style="margin:8px 0;text-decoration:none">300 Credits — €9,99</a>
    <a href="DEIN_STRIPE_LINK_FLAT" target="_blank" class="pl-ki-btn pl-ki-btn-secondary" style="margin:8px 0;text-decoration:none">Flatrate — €3,99/Monat</a>
  `;
  // In ein Modal packen
}
```

---

## 5. Lokal testen

```bash
# Worker lokal starten
wrangler dev

# Test-Lizenz manuell anlegen
curl -X POST http://localhost:8787/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed","data":{"object":{"customer_email":"test@test.de","metadata":{"product_id":"founder"}}}}'
```

---

## Checkliste vor Go-Live

- [ ] Stripe: Test-Modus → Live-Modus umschalten
- [ ] Stripe: Webhook-URL auf Live-Endpoint setzen
- [ ] Worker: STRIPE_SECRET_KEY auf Live-Key updaten
- [ ] Worker: Custom Domain `api.teachsmarter.de` einrichten
- [ ] App: API-URL auf `https://api.teachsmarter.de` setzen
- [ ] Test: Kauf durchführen → Key erhalten → KI nutzen → Credits prüfen
- [ ] Landing Page: Stripe Checkout-Links einsetzen
- [ ] Impressum + Datenschutzerklärung + AGB auf Website

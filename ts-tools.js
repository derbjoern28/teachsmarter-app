/* ═══════════════════════════════════════════
   ts-tools.js — KI-Werkzeuge
   Arbeitsblatt-Generator (+ weitere folgen)
   ═══════════════════════════════════════════ */

/* ── Gemeinsame Hilfsfunktion: Gesperrte Ansicht ── */
function _toolLockedView(viewId) {
  const el = document.getElementById('view-' + viewId);
  if (!el) return;
  el.innerHTML = `
    <div class="es-page">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:2rem">
        <div style="font-size:3.5rem;margin-bottom:1rem;opacity:.35">🔒</div>
        <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:700;margin-bottom:.5rem;color:var(--ts-text)">KI-Werkzeuge freischalten</div>
        <div style="color:var(--ts-text-secondary);max-width:280px;line-height:1.55;margin-bottom:1.75rem;font-size:.9rem">Für die KI-Werkzeuge benötigst du einen Lizenzschlüssel — einmalig oder im Abo.</div>
        <button class="btn btn-primary" style="width:auto;margin-bottom:.85rem" onclick="navigate('einstellungen')">Lizenzschlüssel eingeben</button>
        <a href="${TS_STRIPE_FOUNDER}" target="_blank" style="font-size:.85rem;color:var(--ts-teal);text-decoration:none">Noch kein Account? Jetzt freischalten →</a>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   ARBEITSBLATT-GENERATOR
   ══════════════════════════════════════════════════════ */

const _AB_SCHEMES = {
  modern:    { name:'Modern',    sub:'Petrol',     primary:'#16A085', accent:'#1ABC9C', highlight:'#F39C12' },
  klassisch: { name:'Klassisch', sub:'Marineblau', primary:'#2C3E50', accent:'#3498DB', highlight:'#E67E22' },
  warm:      { name:'Warm',      sub:'Bordeaux',   primary:'#C0392B', accent:'#E74C3C', highlight:'#F39C12' },
};

// Zustand — bleibt erhalten solange die App läuft
let _ab = {
  mode: 'form',  // 'form' | 'output'
  form: {
    niveau: 'Mittel',
    anforderungsbereich: 'gemischt',
    aufgabenformen: ['offene', 'luckentext'],
    farbschema: 'modern',
    differenzierung: 'standard',
    lrs: false,
    stilModus: 'design', // 'design' | 'plain'
    fachId: '',
    klassenIds: [],
  },
  data: null,
  opts: null,
};

/* ── Einstiegspunkt (wird von navigate() gerufen) ── */
function renderToolArbeitsblatt() {
  if (!isPremiumUser()) { _toolLockedView('tool-arbeitsblatt'); return; }
  if (_ab.mode === 'output' && _ab.data) { _abShowOutput(); return; }
  _abShowForm();
}

/* ── Formular ──────────────────────────────────────── */
function _abShowForm() {
  const plan      = state.plan || 'credits';
  const isPremium = ['founder', 'abo', 'premium'].includes(plan);
  const f         = _ab.form;

  // Fach-Dropdown aus allen Fächern (builtin + custom)
  const fachOpts = `<option value="">– Fach wählen –</option>`
    + (getAllFaecher()).map(fc =>
        `<option value="${esc(fc.id)}"${f.fachId === fc.id ? ' selected' : ''}>${esc(fc.name)}</option>`
      ).join('');

  // Klassen-Checkboxen
  const klassenChecks = (state.klassen || []).map(kl => `
    <label style="display:flex;align-items:center;gap:.35rem;font-size:.84rem;cursor:pointer;color:var(--ts-text)">
      <input type="checkbox" class="ab-klasse-cb" value="${esc(kl.id)}" ${(f.klassenIds||[]).includes(kl.id)?'checked':''}
        style="width:15px;height:15px;accent-color:var(--ts-teal)"> ${esc(kl.name)}
    </label>`).join('');

  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst === j ? ' selected' : ''}>${j}. Klasse</option>`)
    .join('');

  // Pill-Gruppen
  const pills = (id, field, opts, cur, labels) => `
    <div class="ab-pills" id="${id}">
      ${opts.map((o, i) => `<button class="ab-pill${cur === o ? ' active' : ''}" onclick="_abPill('${field}','${o}',this)">${labels ? labels[i] : o}</button>`).join('')}
    </div>`;

  // Aufgabenformen-Checkboxen (für alle Nutzer)
  const aufgabenFormen = [
    ['offene',        'Offene Fragen'],
    ['luckentext',    'Lückentext'],
    ['multiplechoice','Multiple Choice'],
    ['zuordnung',     'Zuordnung'],
    ['tabelle',       'Tabelle'],
    ['kreativ',       'Kreativ / Gestalterisch'],
  ];
  const formenCbs = aufgabenFormen.map(([v, lbl]) => `
    <label style="display:flex;align-items:center;gap:.4rem;font-size:.875rem;cursor:pointer;color:var(--ts-text)">
      <input type="checkbox" id="ab-af-${v}" ${(f.aufgabenformen || ['offene','luckentext']).includes(v) ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--ts-teal)">
      ${lbl}
    </label>`).join('');

  // Farbschema-Auswahl (Premium)
  const isPlain = (f.stilModus || 'design') === 'plain';
  const schemeButtons = Object.entries(_AB_SCHEMES).map(([k, s]) => `
    <button id="ab-scheme-${k}" onclick="_abScheme('${k}')"
      style="padding:7px 13px;border-radius:8px;border:2px solid ${(!isPlain && f.farbschema === k) ? s.primary : 'var(--ts-border-light)'};
             background:${(!isPlain && f.farbschema === k) ? s.primary + '18' : 'transparent'};
             cursor:pointer;font-size:.82rem;display:flex;align-items:center;gap:6px;color:var(--ts-text);transition:border-color .15s,background .15s,opacity .15s">
      <span style="width:12px;height:12px;border-radius:50%;background:${s.primary};flex-shrink:0;display:inline-block"></span>
      ${s.name} <span style="opacity:.5;font-size:.75rem">${s.sub}</span>
    </button>`).join('');
  const plainBtn = `
    <button id="ab-plain-btn" onclick="_abSetPlain()"
      style="padding:7px 13px;border-radius:8px;border:2px solid ${isPlain ? '#6b7280' : 'var(--ts-border-light)'};
             background:${isPlain ? '#6b728018' : 'transparent'};
             cursor:pointer;font-size:.82rem;display:flex;align-items:center;gap:6px;color:var(--ts-text);transition:border-color .15s,background .15s">
      <span style="width:12px;height:12px;border-radius:50%;background:#9ca3af;flex-shrink:0;display:inline-block;border:1px solid #6b7280"></span>
      Ohne Formatierung
    </button>`;

  const premiumSection = isPremium ? `
    <div class="es-section">
      <div class="es-section-title" style="display:flex;align-items:center;gap:.5rem">
        Erweiterte Optionen
        <span style="font-size:.68rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">✦ PREMIUM</span>
      </div>
      <div class="es-card">

        <div class="es-field">
          <label class="es-label">Ausgabe-Stil</label>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">${plainBtn}</div>
          <label class="es-label" style="font-size:.78rem;font-weight:500;opacity:.7;margin-bottom:.35rem">Farbschema</label>
          <div id="ab-schemes-wrap" style="display:flex;gap:.5rem;flex-wrap:wrap;${isPlain ? 'opacity:.3;pointer-events:none' : ''}">${schemeButtons}</div>
        </div>

        <div class="es-field">
          <label class="es-label">Differenzierung</label>
          ${pills('ab-diff-pills', 'differenzierung',
            ['standard', 'alle3'],
            f.differenzierung,
            ['Standard (Tipp + Zusatz)', '★ Alle 3 Niveaus'])}
        </div>

        <div class="es-field" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
          <div>
            <div class="es-label" style="margin-bottom:2px">LRS-freundlich</div>
            <div class="es-hint" style="margin:0">Größere Schrift, mehr Zeilenabstand, vereinfachte Sprache</div>
          </div>
          <label class="ts-toggle" style="flex-shrink:0;margin-left:1rem">
            <input type="checkbox" id="ab-lrs" ${f.lrs ? 'checked' : ''}>
            <span class="ts-toggle-slider"></span>
          </label>
        </div>

      </div>
    </div>` : `
    <div style="margin:-.25rem 0 .75rem;padding:.65rem .9rem;background:var(--ts-bg-warm);border-radius:8px;font-size:.82rem;color:var(--ts-text-secondary);border:1px solid var(--ts-border-light)">
      ✦ Farbschema, Alle-3-Niveaus-Differenzierung & LRS-freundlich mit
      <a href="${TS_STRIPE_ABO_29}" target="_blank" style="color:var(--ts-teal);text-decoration:none;font-weight:600">Abo oder Gründeredition</a>
    </div>`;

  document.getElementById('view-tool-arbeitsblatt').innerHTML = `
    <div>
    <div class="tool-grid">

      <div class="es-section">
        <div class="es-section-title">Inhalt</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Thema / Titel *</label>
            <input id="ab-thema" class="input" placeholder="z.B. Der Wasserkreislauf" value="${esc(f.thema || '')}">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Fach</label>
              <select id="ab-fach" class="input">${fachOpts}</select>
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Jahrgangsstufe</label>
              <select id="ab-jgst" class="input">${jgstOpts}</select>
            </div>
          </div>
          ${(state.klassen||[]).length ? `
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Klassen <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem .9rem;margin-top:.3rem">${klassenChecks}</div>
          </div>` : ''}
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Lehrplanbezug <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <input id="ab-lehrplan" class="input" placeholder="z.B. LB 3.2: Wasser und Luft" value="${esc(f.lehrplan || '')}">
          </div>
        </div>
      </div>

      <div class="es-section">
        <div class="es-section-title">Optionen</div>
        <div class="es-card">

          <div class="es-field">
            <label class="es-label">Anforderungsbereich</label>
            <div class="es-hint" style="margin-bottom:.5rem">Welches kognitive Niveau sollen die Aufgaben ansprechen?</div>
            ${pills('ab-ab-pills', 'anforderungsbereich',
              ['gemischt', 'ab1', 'ab2', 'ab3'],
              f.anforderungsbereich,
              ['Gemischt', 'AB I · Reproduktion', 'AB II · Transfer', 'AB III · Reflexion'])}
          </div>

          <div class="es-field">
            <label class="es-label">Schwierigkeitsniveau</label>
            ${pills('ab-niv-pills', 'niveau', ['Einfach','Mittel','Schwer'], f.niveau)}
          </div>

          <div class="es-field">
            <label class="es-label">Aufgabenformen <span style="font-weight:400;opacity:.6">(mehrere möglich)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem .85rem;margin-top:.2rem">
              ${formenCbs}
            </div>
          </div>

        </div>
      </div>

    </div><!-- /tool-grid -->
    ${premiumSection}
    <div class="es-section" style="margin-top:var(--sp-lg)">
      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generateArbeitsblatt()">
        Arbeitsblatt generieren
        <span style="opacity:.7;font-size:.82em;margin-left:.4rem">· 3 Credits</span>
      </button>
    </div>
    </div>`;
}

/* ── Pill / Scheme Callbacks ── */
function _abPill(field, value, btn) {
  _ab.form[field] = value;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _abScheme(key) {
  _ab.form.farbschema = key;
  _ab.form.stilModus  = 'design';
  // re-enable scheme wrap
  const wrap = document.getElementById('ab-schemes-wrap');
  if (wrap) { wrap.style.opacity = '1'; wrap.style.pointerEvents = ''; }
  // update plain button
  const pb = document.getElementById('ab-plain-btn');
  if (pb) { pb.style.borderColor = 'var(--ts-border-light)'; pb.style.background = 'transparent'; }
  // update scheme buttons
  Object.entries(_AB_SCHEMES).forEach(([k, s]) => {
    const btn = document.getElementById('ab-scheme-' + k);
    if (!btn) return;
    const active = k === key;
    btn.style.borderColor = active ? s.primary : 'var(--ts-border-light)';
    btn.style.background   = active ? s.primary + '18' : 'transparent';
  });
}

function _abSetPlain() {
  _ab.form.stilModus = 'plain';
  // dim scheme buttons
  const wrap = document.getElementById('ab-schemes-wrap');
  if (wrap) { wrap.style.opacity = '.3'; wrap.style.pointerEvents = 'none'; }
  // deactivate all scheme buttons
  Object.entries(_AB_SCHEMES).forEach(([k]) => {
    const btn = document.getElementById('ab-scheme-' + k);
    if (!btn) return;
    btn.style.borderColor = 'var(--ts-border-light)';
    btn.style.background  = 'transparent';
  });
  // activate plain button
  const pb = document.getElementById('ab-plain-btn');
  if (pb) { pb.style.borderColor = '#6b7280'; pb.style.background = '#6b728018'; }
}

/* ── Generierung ────────────────────────────────── */
async function generateArbeitsblatt() {
  const thema = (document.getElementById('ab-thema')?.value || '').trim();
  if (!thema) { _showToast('Bitte ein Thema eingeben.', 'error'); return; }

  _ab.form.thema    = thema;
  _ab.form.fachId   = document.getElementById('ab-fach')?.value || '';
  _ab.form.fach     = getAllFaecher().find(fc => fc.id === _ab.form.fachId)?.name || '';
  _ab.form.jgst     = document.getElementById('ab-jgst')?.value || '7';
  _ab.form.klassenIds = Array.from(document.querySelectorAll('.ab-klasse-cb:checked')).map(el => el.value);
  _ab.form.lehrplan = (document.getElementById('ab-lehrplan')?.value || '').trim();

  // Aufgabenformen (alle Nutzer)
  const alleFormen = ['offene','luckentext','multiplechoice','zuordnung','tabelle','kreativ'];
  const gewählteFormen = alleFormen.filter(v => document.getElementById('ab-af-' + v)?.checked);
  _ab.form.aufgabenformen = gewählteFormen.length > 0 ? gewählteFormen : ['offene', 'luckentext'];

  const plan      = state.plan || 'credits';
  const isPremium = ['founder', 'abo', 'premium'].includes(plan);

  if (isPremium) {
    _ab.form.lrs = document.getElementById('ab-lrs')?.checked || false;
  }

  const opts = {
    farbschema:      _ab.form.farbschema          || 'modern',
    differenzierung: _ab.form.differenzierung      || 'standard',
    aufgabenformen:  _ab.form.aufgabenformen,
    anforderungsbereich: _ab.form.anforderungsbereich || 'gemischt',
    lrs:             _ab.form.lrs                 || false,
    stilModus:       _ab.form.stilModus           || 'design',
  };

  const ctx = {
    thema:     _ab.form.thema,
    fach:      _ab.form.fach,
    jgst:      _ab.form.jgst,
    schulart:  state.schulart   || '',
    bundesland: state.bundesland || '',
    lehrplan:  _ab.form.lehrplan,
    niveau:    _ab.form.niveau  || 'Mittel',
    anforderungsbereich:     opts.anforderungsbereich,
    differenzierung_methode: opts.differenzierung,
    aufgabentypen:           opts.aufgabenformen.join(','),
    lrs:                     opts.lrs,
  };

  const data = await callKI('arbeitsblatt', ctx);
  if (!data) return;

  _ab.data = data;
  _ab.opts = opts;
  _ab.mode = 'output';
  _abShowOutput();
}

/* ── Ausgabe-Ansicht ────────────────────────────── */
function _abShowOutput() {
  const data = _ab.data;
  const opts = _ab.opts || {};
  const f    = _ab.form;
  const s    = _AB_SCHEMES[opts.farbschema || 'modern'];
  const { primary, highlight } = s;

  const starCount = { 'Einfach': 1, 'Mittel': 2, 'Schwer': 3 }[f.niveau || 'Mittel'] || 2;
  const stars = '★'.repeat(starCount) + '☆'.repeat(3 - starCount);
  const plain = opts.stilModus === 'plain';

  // Aufgaben rendern
  let aufgabenHtml = '';
  if (opts.differenzierung === 'alle3' && data.aufgaben_niveaus) {
    const nColors = {
      basis:    { bg:'#E8F8F5', border:'#27AE60', label:'★ Basis' },
      standard: { bg:'#EBF5FB', border:'#3498DB', label:'★★ Standard' },
      experte:  { bg:'#FDEDEC', border:'#E74C3C', label:'★★★ Experte' },
    };
    Object.entries(nColors).forEach(([key, nc]) => {
      const aufgaben = data.aufgaben_niveaus[key] || [];
      if (!aufgaben.length) return;
      const niveauHeader = plain
        ? `<div style="font-weight:700;margin-bottom:8px;font-size:11pt">${nc.label}</div>`
        : `<div style="border-left:4px solid ${nc.border};padding-left:10px;margin-bottom:10px">
             <span style="font-size:11pt;font-weight:700;color:${nc.border};background:${nc.bg};padding:3px 10px;border-radius:0 6px 6px 0;display:inline-block">${nc.label}</span>
           </div>`;
      aufgabenHtml += `
        <div style="margin-bottom:22px">
          ${niveauHeader}
          ${aufgaben.map((a, i) => _abAufgabeHtml({ ...a, nr: i + 1 }, primary, highlight, opts.lrs, plain)).join('')}
        </div>`;
    });
  } else {
    (data.aufgaben || []).forEach(a => { aufgabenHtml += _abAufgabeHtml(a, primary, highlight, opts.lrs, plain); });
  }

  const fach    = f.fach || (state.faecher?.[0]?.name) || '';
  const schulart = state.schulart || '';
  const fontSize = opts.lrs ? '13pt' : '12pt';
  const lineH    = opts.lrs ? '1.75' : '1.45';

  const previewHtml = plain ? `
    <div id="ab-preview" style="background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:${fontSize};line-height:${lineH};color:#000;padding:2cm 2cm 2cm 2.5cm">

      <!-- Kopfzeile plain -->
      <div style="border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end">
        <div style="font-size:9pt;color:#555">${[esc(fach), schulart, f.jgst ? f.jgst + '. Klasse' : ''].filter(Boolean).join(' · ')}</div>
        <div style="font-size:9pt;color:#555">${stars}</div>
      </div>

      <!-- Titel plain -->
      <div style="font-size:${opts.lrs ? '20pt' : '17pt'};font-weight:700;margin-bottom:4px;line-height:1.15">${esc(data.titel || f.thema)}</div>
      ${data.untertitel ? `<div style="font-size:9.5pt;color:#555;margin-bottom:8px">${esc(data.untertitel)}</div>` : ''}

      <!-- Name / Datum plain -->
      <div style="display:flex;gap:2.5rem;margin:10px 0 20px;font-size:11pt">
        <div>Name:&nbsp;<span style="display:inline-block;border-bottom:1px solid #000;width:160px;vertical-align:bottom">&nbsp;</span></div>
        <div>Datum:&nbsp;<span style="display:inline-block;border-bottom:1px solid #000;width:100px;vertical-align:bottom">&nbsp;</span></div>
      </div>

      ${data.einfuehrung ? `<div style="margin-bottom:16px;font-size:11pt;line-height:1.6">${esc(data.einfuehrung)}</div>` : ''}

      ${aufgabenHtml}

      ${data.merksatz ? `
      <div style="border:1px solid #000;padding:10px 14px;margin-top:18px">
        <div style="font-weight:700;margin-bottom:4px;font-size:10.5pt">Merke:</div>
        <div style="font-size:${opts.lrs ? '12pt' : '11pt'}">${esc(data.merksatz)}</div>
      </div>` : ''}

      <div style="border-top:1px solid #ccc;margin-top:28px;padding-top:7px;font-size:8pt;color:#999;display:flex;justify-content:space-between">
        <span>${esc(state.schulname || '')}</span>
        <span>Erstellt mit TeachSmarter · teachsmarter.de · ${new Date().getFullYear()}</span>
      </div>
    </div>` : `
    <div id="ab-preview" style="background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:${fontSize};line-height:${lineH};color:#1a1a1a;padding:2cm 2cm 2cm 2.5cm">

      <!-- Kopfzeile -->
      <div style="border-bottom:3px solid ${primary};padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div style="font-size:9pt;color:#7F8C8D;font-weight:700;letter-spacing:.07em;text-transform:uppercase">${esc(fach)}</div>
          <div style="font-size:9pt;color:#AAAAAA">${[schulart, f.jgst ? f.jgst + '. Klasse' : ''].filter(Boolean).join(' · ')}</div>
        </div>
        <div style="font-size:1.15rem;color:${highlight};letter-spacing:.18em" title="Schwierigkeitsniveau">${stars}</div>
      </div>

      <!-- Titel -->
      <div style="margin-bottom:10px">
        <div style="font-size:${opts.lrs ? '20pt' : '18pt'};font-weight:700;color:${primary};line-height:1.15">${esc(data.titel || f.thema)}</div>
        ${data.untertitel ? `<div style="font-size:9.5pt;color:#9E9E9E;margin-top:3px">${esc(data.untertitel)}</div>` : ''}
      </div>

      <!-- Name / Datum -->
      <div style="display:flex;gap:2.5rem;margin:10px 0 20px;font-size:11pt">
        <div>Name:&nbsp;<span style="display:inline-block;border-bottom:1px solid #555;width:160px;vertical-align:bottom">&nbsp;</span></div>
        <div>Datum:&nbsp;<span style="display:inline-block;border-bottom:1px solid #555;width:100px;vertical-align:bottom">&nbsp;</span></div>
      </div>

      <!-- Einführung -->
      ${data.einfuehrung ? `
      <div style="background:#F4F6F7;border-left:3px solid #BDC3C7;border-radius:0 6px 6px 0;padding:10px 14px;margin-bottom:18px;font-size:11pt;line-height:1.6;color:#444">
        ${esc(data.einfuehrung)}
      </div>` : ''}

      <!-- Aufgaben -->
      ${aufgabenHtml}

      <!-- Merksatz -->
      ${data.merksatz ? `
      <div style="background:#E8F8F5;border:2px solid #16A085;border-radius:8px;padding:11px 14px;margin-top:18px">
        <div style="font-weight:700;color:#16A085;margin-bottom:4px;font-size:10.5pt">📌 Merke:</div>
        <div style="font-weight:600;font-size:${opts.lrs ? '12pt' : '11pt'}">${esc(data.merksatz)}</div>
      </div>` : ''}

      <!-- Fußzeile -->
      <div style="border-top:1px solid #EBEBEB;margin-top:28px;padding-top:7px;font-size:8pt;color:#BBBBBB;display:flex;justify-content:space-between">
        <span>${esc(state.schulname || '')}</span>
        <span>Erstellt mit TeachSmarter · teachsmarter.de · ${new Date().getFullYear()}</span>
      </div>

    </div>`;

  document.getElementById('view-tool-arbeitsblatt').innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ts-bg)">

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:.5rem;padding:.65rem .85rem;border-bottom:1px solid var(--ts-border-light);background:var(--ts-bg-card);flex-shrink:0;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" style="width:auto;flex-shrink:0" onclick="_abBackToForm()">← Bearbeiten</button>
        <div style="flex:1;min-width:120px">
          <div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ts-text)">${esc(data.titel || f.thema)}</div>
          <div style="font-size:.72rem;color:var(--ts-text-secondary)">${esc(fach)}${f.jgst ? ' · ' + f.jgst + '. Klasse' : ''} · ${f.niveau || 'Mittel'}</div>
        </div>
        <div style="display:flex;gap:.4rem;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" style="width:auto" onclick="_abDocDownload()" title="Als Word-Dokument herunterladen">📄 .docx</button>
          <button class="btn btn-secondary btn-sm" style="width:auto" onclick="_abSaveToDb()" title="In Materialdatenbank speichern">💾 Speichern</button>
          <button class="btn btn-primary btn-sm" style="width:auto" onclick="_abPrint()">🖨️ Drucken</button>
        </div>
      </div>

      <!-- Vorschau -->
      <div style="flex:1;overflow-y:auto;padding:1.25rem;background:#E8E8E8">
        <div style="max-width:794px;margin:0 auto;box-shadow:0 4px 28px rgba(0,0,0,.18);border-radius:3px;overflow:hidden">
          ${previewHtml}
        </div>

        ${data.loesungshinweis ? `
        <div style="max-width:794px;margin:1rem auto 0;background:var(--ts-bg-card);border-radius:10px;padding:1rem 1.25rem;border:1px solid var(--ts-border-light)">
          <div style="font-weight:700;margin-bottom:.5rem;font-size:.9rem;color:var(--ts-text)">
            🔑 Lösungshinweis
            <span style="font-weight:400;font-size:.78rem;color:var(--ts-text-muted)">(nur für dich — wird nicht gedruckt)</span>
          </div>
          <div style="font-size:.85rem;color:var(--ts-text-secondary);white-space:pre-wrap;line-height:1.65">${esc(data.loesungshinweis)}</div>
        </div>` : ''}

      </div>
    </div>`;
}

/* ── Einzelne Aufgabe als HTML ── */
function _abAufgabeHtml(a, primary, highlight, lrs, plain) {
  const fs = lrs ? '12pt' : '11.5pt';
  const brauchtLinien = !(a.inhalt || '').includes('_____')
                     && !(a.inhalt || '').includes('☐')
                     && !(a.inhalt || '').includes('│');
  const linien = brauchtLinien
    ? `<div style="margin-top:8px">
        ${Array(3).fill('<div style="border-bottom:1px solid #AAAAAA;height:24px;margin-bottom:2px"></div>').join('')}
       </div>`
    : '';

  if (plain) {
    return `
    <div style="margin-bottom:20px">
      <div style="font-size:12pt;font-weight:700;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:baseline">
        <span>Aufgabe ${a.nr}${a.titel ? ': ' + esc(a.titel) : ''}</span>
        ${a.punkte ? `<span style="font-size:9pt;font-weight:400">/${a.punkte} P.</span>` : ''}
      </div>
      <div style="font-size:${fs};white-space:pre-wrap;line-height:1.55">${esc(a.inhalt || '')}</div>
      ${linien}
      ${a.tipp ? `<div style="margin-top:8px;font-size:${fs}"><em>Tipp: ${esc(a.tipp)}</em></div>` : ''}
      ${a.zusatz ? `<div style="margin-top:7px;font-size:${fs}"><strong>Zusatzaufgabe:</strong> ${esc(a.zusatz)}</div>` : ''}
    </div>`;
  }

  return `
    <div style="margin-bottom:20px">
      <div style="font-size:12.5pt;font-weight:700;color:${primary};border-bottom:1.5px solid ${primary}25;padding-bottom:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline">
        <span>Aufgabe ${a.nr}${a.titel ? ': ' + esc(a.titel) : ''}</span>
        ${a.punkte ? `<span style="font-size:9pt;color:#9E9E9E;font-weight:400">${a.punkte} P.</span>` : ''}
      </div>
      <div style="font-size:${fs};white-space:pre-wrap;line-height:1.55">${esc(a.inhalt || '')}</div>
      ${linien}
      ${a.tipp ? `
      <div style="background:#FFFBEA;border-left:4px solid ${highlight};padding:7px 11px;margin-top:9px;border-radius:0 6px 6px 0;font-size:${fs}">
        💡 <strong>Tipp:</strong> ${esc(a.tipp)}
      </div>` : ''}
      ${a.zusatz ? `
      <div style="background:#F8F9FA;border:1.5px dashed #AAAAAA;padding:7px 11px;margin-top:7px;border-radius:6px;font-size:${fs}">
        ⭐ <strong>Zusatzaufgabe:</strong> ${esc(a.zusatz)}
      </div>` : ''}
    </div>`;
}

function _abBackToForm() {
  _ab.mode = 'form';
  _abShowForm();
}

/* ── Word (.docx) Download via html-docx-js ── */
function _loadHtmlDocx() {
  return _loadScript(
    'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
    () => !!window.htmlDocx
  );
}

async function _abDocDownload() {
  if (!_ab.data) return;
  const f = _ab.form;
  const safeName = (f.thema || 'Arbeitsblatt').replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_]/g, '').trim();

  const plain = (_ab.opts?.stilModus === 'plain');
  let bodyHtml = '';
  if (!plain && typeof svRenderAbForWord === 'function') {
    bodyHtml = svRenderAbForWord(_ab.data);
  } else {
    bodyHtml = document.getElementById('ab-preview')?.innerHTML || '';
  }

  const fullDoc = '<!DOCTYPE html><html lang="de"><head>'
    + '<meta charset="UTF-8"><title>' + safeName + '</title>'
    + '<style>'
    + 'body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5}'
    + 'p{margin:0 0 6pt}'
    + 'table{border-collapse:collapse;width:100%}'
    + 'td,th{border:1pt solid #ccc;padding:4pt 6pt}'
    + '</style>'
    + '</head><body>' + bodyHtml + '</body></html>';

  try {
    await _loadHtmlDocx();
    const blob = htmlDocx.asBlob(fullDoc, { orientation: 'portrait', margins: { top: 1134, right: 1418, bottom: 1134, left: 1418 } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    _showToast('Word-Export fehlgeschlagen: ' + (e.message || e), 'error');
  }
}

/* ── In Materialdatenbank speichern (Fach + Klassen kommen aus dem Formular) ── */
async function _abSaveToDb() {
  if (!_ab.data || typeof getMediaDb !== 'function') return;
  const f    = _ab.form;
  const name = _ab.data.titel || f.thema || 'Arbeitsblatt';

  const renderedContent = typeof svRenderAbPreview === 'function'
    ? svRenderAbPreview(_ab.data, _ab.opts?.stilModus === 'plain')
    : (document.getElementById('ab-preview')?.innerHTML || '');

  const db = getMediaDb();
  const existingIdx = db.findIndex(it => it.name === name && (it.tags||[]).includes('ki-generiert'));

  if (existingIdx >= 0) {
    db[existingIdx] = {
      ...db[existingIdx],
      content:    renderedContent,
      rawData:    JSON.stringify(_ab.data),
      fachTags:   f.fachId ? [f.fachId] : [],
      klassenIds: f.klassenIds || [],
      updatedAt:  new Date().toISOString(),
    };
  } else {
    db.push({
      id:         'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name,
      type:       'html',
      content:    renderedContent,
      rawData:    JSON.stringify(_ab.data),
      createdAt:  new Date().toISOString(),
      fachTags:   f.fachId ? [f.fachId] : [],
      klassenIds: f.klassenIds || [],
      tags:       ['arbeitsblatt', 'ki-generiert'],
      source:     'ki',
    });
  }

  await saveMediaDb(db);
  const list = document.getElementById('sv-media-list');
  if (list && typeof svRenderMediaItems === 'function') list.innerHTML = svRenderMediaItems('');
  _showToast(`"${name}" in der Materialdatenbank gespeichert ✓`, 'ok');
}

/* ── Drucken / PDF ── */
function _abPrint() {
  const preview = document.getElementById('ab-preview');
  if (!preview) return;
  const win = window.open('', '_blank', 'width=900,height=750');
  if (!win) { _showToast('Popup-Blocker aktiv — bitte Popups für diese Seite erlauben.', 'error'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8">
<title>${esc(_ab.form.thema || 'Arbeitsblatt')} — TeachSmarter</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 0; }
  @media print {
    html, body { width: 210mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
</style>
</head><body>
${preview.outerHTML}
<script>window.onload = function() { window.print(); };<\/script>
</body></html>`);
  win.document.close();
}


/* ══════════════════════════════════════════════════════
   TAFELBILD-PLANER
   ══════════════════════════════════════════════════════ */

let _tb = {
  mode: 'form',   // 'form' | 'output'
  view: 'tafel',  // 'tafel' | 'heft'
  form: {
    aufteilung: '3-geteilt',
    dauer: '45',
    strukturform: 'frei',
    phase: 'vollstaendig',
    fachId: '',
    klassenIds: [],
  },
  data: null,
};

function renderToolTafelbild() {
  if (!isPremiumUser()) { _toolLockedView('tool-tafelbild'); return; }
  if (_tb.mode === 'output' && _tb.data) { _tbShowOutput(); return; }
  _tbShowForm();
}

/* ── Formular ── */
function _tbShowForm() {
  const plan      = state.plan || 'credits';
  const isPremium = ['founder', 'abo', 'premium'].includes(plan);
  const f         = _tb.form;

  const tbFachOpts = `<option value="">– Fach wählen –</option>`
    + getAllFaecher().map(fc =>
        `<option value="${esc(fc.id)}"${f.fachId === fc.id ? ' selected' : ''}>${esc(fc.name)}</option>`
      ).join('');

  const tbKlassenChecks = (state.klassen || []).map(kl => `
    <label style="display:flex;align-items:center;gap:.35rem;font-size:.84rem;cursor:pointer;color:var(--ts-text)">
      <input type="checkbox" class="tb-klasse-cb" value="${esc(kl.id)}" ${(f.klassenIds||[]).includes(kl.id)?'checked':''}
        style="width:15px;height:15px;accent-color:var(--ts-teal)"> ${esc(kl.name)}
    </label>`).join('');

  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst === j ? ' selected' : ''}>${j}. Klasse</option>`).join('');

  const pills = (id, field, opts, cur, labels) => `
    <div class="ab-pills" id="${id}">
      ${opts.map((o, i) => `<button class="ab-pill${cur === o ? ' active' : ''}" onclick="_abPill('${field}','${o}',this)" data-target="_tb">${labels ? labels[i] : o}</button>`).join('')}
    </div>`;

  // Pill-Callback für _tb statt _ab
  const tbPills = (id, field, opts, cur, labels) => `
    <div class="ab-pills" id="${id}">
      ${opts.map((o, i) => `<button class="ab-pill${cur === o ? ' active' : ''}" onclick="_tbPill('${field}','${o}',this)">${labels ? labels[i] : o}</button>`).join('')}
    </div>`;

  const premiumSection = isPremium ? `
    <div class="es-section">
      <div class="es-section-title" style="display:flex;align-items:center;gap:.5rem">
        Erweiterte Optionen
        <span style="font-size:.68rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">✦ PREMIUM</span>
      </div>
      <div class="es-card">
        <div class="es-field">
          <label class="es-label">Strukturierungsform</label>
          <div class="es-hint" style="margin-bottom:.5rem">Welche logische Beziehung soll das Tafelbild zeigen?</div>
          ${tbPills('tb-struk-pills','strukturform',
            ['frei','kausal','hierarchisch','prozess','klassifizierung'],
            f.strukturform,
            ['Frei','Kausal (Ursache→Wirkung)','Hierarchisch (Über-/Unterordnung)','Prozess (Ablauf)','Klassifizierung'])}
        </div>
        <div class="es-field" style="margin-bottom:0">
          <label class="es-label">Artikulationsphase</label>
          <div class="es-hint" style="margin-bottom:.5rem">Für welchen Unterrichtsmoment soll das Tafelbild entworfen werden?</div>
          ${tbPills('tb-phase-pills','phase',
            ['vollstaendig','erarbeitung','sicherung','lzk'],
            f.phase,
            ['Vollständige Stunde','Nur Erarbeitung','Nur Sicherung','Lernzielkontrolle'])}
        </div>
      </div>
    </div>` : `
    <div style="margin:-.25rem 0 .75rem;padding:.65rem .9rem;background:var(--ts-bg-warm);border-radius:8px;font-size:.82rem;color:var(--ts-text-secondary);border:1px solid var(--ts-border-light)">
      ✦ Strukturierungsformen (Kausal, Hierarchisch, Prozess…) & Artikulationsphasen mit
      <a href="${TS_STRIPE_ABO_29}" target="_blank" style="color:var(--ts-teal);text-decoration:none;font-weight:600">Abo oder Gründeredition</a>
    </div>`;

  document.getElementById('view-tool-tafelbild').innerHTML = `
    <div>
    <div class="tool-grid">

      <div class="es-section">
        <div class="es-section-title">Inhalt</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Thema / Überschrift *</label>
            <input id="tb-thema" class="input" placeholder="z.B. Die Fotosynthese" value="${esc(f.thema || '')}">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Fach</label>
              <select id="tb-fach" class="input">${tbFachOpts}</select>
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Jahrgangsstufe</label>
              <select id="tb-jgst" class="input">${jgstOpts}</select>
            </div>
          </div>
          ${(state.klassen||[]).length ? `
          <div class="es-field">
            <label class="es-label">Klassen <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem .9rem;margin-top:.3rem">${tbKlassenChecks}</div>
          </div>` : ''}
          <div class="es-field">
            <label class="es-label">Lernziel <span style="font-weight:400;opacity:.6">(optional — hilft der KI)</span></label>
            <input id="tb-lernziel" class="input" placeholder="Die SuS können…" value="${esc(f.lernziel || '')}">
          </div>
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Lehrplanbezug <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <input id="tb-lehrplan" class="input" placeholder="z.B. LB 4: Energie und Stoff" value="${esc(f.lehrplan || '')}">
          </div>
        </div>
      </div>

      <div class="es-section">
        <div class="es-section-title">Optionen</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Tafelaufteilung</label>
            ${tbPills('tb-auf-pills','aufteilung',
              ['3-geteilt','schwerpunkt-mitte','2-geteilt'],
              f.aufteilung,
              ['Klassisch 3-geteilt','Schwerpunkt Mitte','2-geteilt (Links/Rechts)'])}
          </div>
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Stundendauer</label>
            ${tbPills('tb-dauer-pills','dauer',['45','90','35'],f.dauer,['45 min','90 min (Doppelstunde)','35 min'])}
          </div>
        </div>
      </div>

    </div><!-- /tool-grid -->
    ${premiumSection}
    <div class="es-section" style="margin-top:var(--sp-lg)">
      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generateTafelbild()">
        Tafelbild planen
        <span style="opacity:.7;font-size:.82em;margin-left:.4rem">· 2 Credits</span>
      </button>
    </div>
    </div>`;
}

function _tbPill(field, value, btn) {
  _tb.form[field] = value;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* ── Generierung ── */
async function generateTafelbild() {
  const thema = (document.getElementById('tb-thema')?.value || '').trim();
  if (!thema) { _showToast('Bitte ein Thema eingeben.', 'error'); return; }

  _tb.form.thema      = thema;
  _tb.form.fachId     = document.getElementById('tb-fach')?.value || '';
  _tb.form.fach       = getAllFaecher().find(fc => fc.id === _tb.form.fachId)?.name || '';
  _tb.form.jgst       = document.getElementById('tb-jgst')?.value || '7';
  _tb.form.klassenIds = Array.from(document.querySelectorAll('.tb-klasse-cb:checked')).map(el => el.value);
  _tb.form.lernziel   = (document.getElementById('tb-lernziel')?.value || '').trim();
  _tb.form.lehrplan   = (document.getElementById('tb-lehrplan')?.value || '').trim();

  const plan      = state.plan || 'credits';
  const isPremium = ['founder', 'abo', 'premium'].includes(plan);

  const ctx = {
    thema:      _tb.form.thema,
    fach:       _tb.form.fach,
    jgst:       _tb.form.jgst,
    schulart:   state.schulart   || '',
    bundesland: state.bundesland || '',
    lernziel:   _tb.form.lernziel,
    lehrplan:   _tb.form.lehrplan,
    aufteilung: _tb.form.aufteilung || '3-geteilt',
    dauer:      (_tb.form.dauer || '45') + ' Minuten',
    strukturform: _tb.form.strukturform || 'frei',
    phase:      _tb.form.phase || 'vollstaendig',
    premium:    isPremium,
  };

  const data = await callKI('tafelbild', ctx);
  if (!data) return;

  _tb.data = data;
  _tb.mode = 'output';
  _tb.view = 'tafel';
  _tbShowOutput();
}

/* ── Ausgabe-Ansicht ── */
/* ── SVG-Diagramm-Renderer für Tafelbild ── */
function _tbDiagramSvg(diag, isTafel) {
  if (!diag || !diag.typ || diag.typ === 'keine') return '';

  const col    = isTafel ? '#a5d6a7' : '#1a3a2a';
  const colDk  = isTafel ? '#2d5c3e' : '#1a5c3e';
  const fill   = isTafel ? 'rgba(45,92,62,.45)' : 'rgba(26,90,62,.1)';
  const accent = isTafel ? '#fff176' : '#d35400';
  const wh     = 'white';

  // Wrap text into 1–2 tspan lines inside an SVG text element
  const wrapT = (txt, x, y, fs, fillC, bold) => {
    if (!txt) return '';
    const bld = bold !== false ? 'font-weight="700"' : '';
    const words = txt.split(' ');
    if (words.length <= 2 || txt.length <= 11) {
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="${fillC}" font-size="${fs}" font-family="Arial,sans-serif" ${bld}>${txt}</text>`;
    }
    const mid = Math.ceil(words.length / 2);
    const l1  = words.slice(0, mid).join(' ');
    const l2  = words.slice(mid).join(' ');
    const oy  = fs * 0.58;
    return `<text text-anchor="middle" fill="${fillC}" font-size="${fs}" font-family="Arial,sans-serif" ${bld}>
      <tspan x="${x}" y="${y - oy}">${l1}</tspan>
      <tspan x="${x}" dy="${fs * 1.25}">${l2}</tspan>
    </text>`;
  };

  switch (diag.typ) {

    /* ─── DREIECK ─────────────────────────────────────────── */
    case 'dreieck': {
      const ecken  = diag.ecken  || ['', '', ''];
      const seiten = diag.seiten || [];
      const mitte  = diag.mitte_text || '';

      // Equilateral-ish triangle, 480×370 viewBox
      const vT = [240,  46];   // Apex (oben)
      const vL = [ 52, 334];   // Unten-links
      const vR = [428, 334];   // Unten-rechts
      const ctr = [240, 238];  // Schwerpunkt

      // Inset a midpoint toward centroid by `off` px (for side labels)
      const inset = (a, b, off) => {
        const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
        const dx = ctr[0]-mx, dy = ctr[1]-my;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        return [mx + dx/len*off, my + dy/len*off];
      };
      const sL = inset(vT, vL, 32);  // left-side label
      const sB = inset(vL, vR, 26);  // bottom-side label
      const sR = inset(vT, vR, 32);  // right-side label
      const R  = 44;

      return `<svg viewBox="0 0 480 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:420px;display:block;margin:0 auto">
        <polygon points="${vT} ${vL} ${vR}" fill="${fill}" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
        ${mitte ? wrapT(mitte, ctr[0], ctr[1], 14, accent) : ''}
        ${seiten[0] ? `<text x="${sL[0]}" y="${sL[1]}" text-anchor="middle" dominant-baseline="middle" fill="${col}" font-size="8" font-family="Arial,sans-serif" opacity=".85">${seiten[0]}</text>` : ''}
        ${seiten[1] ? `<text x="${sB[0]}" y="${sB[1]}" text-anchor="middle" dominant-baseline="middle" fill="${col}" font-size="8" font-family="Arial,sans-serif" opacity=".85">${seiten[1]}</text>` : ''}
        ${seiten[2] ? `<text x="${sR[0]}" y="${sR[1]}" text-anchor="middle" dominant-baseline="middle" fill="${col}" font-size="8" font-family="Arial,sans-serif" opacity=".85">${seiten[2]}</text>` : ''}
        <circle cx="${vT[0]}" cy="${vT[1]}" r="${R}" fill="${colDk}" stroke="${col}" stroke-width="1.5"/>
        <circle cx="${vL[0]}" cy="${vL[1]}" r="${R}" fill="${colDk}" stroke="${col}" stroke-width="1.5"/>
        <circle cx="${vR[0]}" cy="${vR[1]}" r="${R}" fill="${colDk}" stroke="${col}" stroke-width="1.5"/>
        ${wrapT(ecken[0], vT[0], vT[1], 10, wh)}
        ${wrapT(ecken[1], vL[0], vL[1], 10, wh)}
        ${wrapT(ecken[2], vR[0], vR[1], 10, wh)}
      </svg>`;
    }

    /* ─── PFEILKETTE ──────────────────────────────────────── */
    case 'pfeilkette': {
      const steps = (diag.schritte || []).slice(0, 6);
      const n = steps.length; if (!n) return '';
      const bW = 78, bH = 48, aW = 28, pad = 14;
      const W = pad*2 + n*bW + (n-1)*aW;
      const H = bH + 32;
      const cy = H / 2;
      let s = '';
      steps.forEach((st, i) => {
        const x = pad + i*(bW+aW);
        s += `<rect x="${x}" y="${cy-bH/2}" width="${bW}" height="${bH}" rx="6" fill="${colDk}" stroke="${col}" stroke-width="1"/>`;
        s += wrapT(st, x+bW/2, cy, 9, wh);
        if (i < n-1) {
          const ax = x+bW+aW/2;
          s += `<text x="${ax}" y="${cy+2}" text-anchor="middle" dominant-baseline="middle" fill="${accent}" font-size="22" font-family="Arial,sans-serif" font-weight="900">→</text>`;
        }
      });
      return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;margin:0 auto">${s}</svg>`;
    }

    /* ─── KREISLAUF ───────────────────────────────────────── */
    case 'kreislauf': {
      const steps = (diag.schritte || []).slice(0, 6);
      const n = steps.length; if (!n) return '';
      const cx = 200, cy = 190, r = 128, rb = 40;
      let s = '';
      // Gestrichelte Umlaufbahn
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="9 4" opacity=".45"/>`;
      // Pfeilspitzen am Bogenmittelpunkt
      for (let i = 0; i < n; i++) {
        const a = ((i+0.5)/n)*2*Math.PI - Math.PI/2;
        const ax = cx + r*Math.cos(a), ay = cy + r*Math.sin(a);
        const pa = a + Math.PI/2, aw = 9;
        s += `<polygon points="${ax},${ay} ${ax+aw*Math.cos(pa-0.48)},${ay+aw*Math.sin(pa-0.48)} ${ax+aw*Math.cos(pa+0.48)},${ay+aw*Math.sin(pa+0.48)}" fill="${col}" opacity=".75"/>`;
      }
      // Kreise mit Labels
      for (let i = 0; i < n; i++) {
        const a = (i/n)*2*Math.PI - Math.PI/2;
        const bx = cx + r*Math.cos(a), by = cy + r*Math.sin(a);
        s += `<circle cx="${bx}" cy="${by}" r="${rb}" fill="${colDk}" stroke="${col}" stroke-width="1.5"/>`;
        s += wrapT(steps[i], bx, by, 9, wh);
      }
      if (diag.mitte_text) s += wrapT(diag.mitte_text, cx, cy, 13, accent);
      return `<svg viewBox="0 0 400 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:340px;display:block;margin:0 auto">${s}</svg>`;
    }

    /* ─── PYRAMIDE ────────────────────────────────────────── */
    case 'pyramide': {
      const lagen = (diag.lagen || []).slice(0, 6);
      const n = lagen.length; if (!n) return '';
      // lagen[0] = Basis (unten, breit), lagen[n-1] = Spitze (oben, schmal)
      const svgW = 400, svgH = 290;
      const baseW = 340;
      const layH = Math.floor((svgH - 16) / n) - 3;
      let s = '';
      for (let i = 0; i < n; i++) {
        const lw = baseW * (n-i) / n;
        const x  = (svgW - lw) / 2;
        const y  = svgH - 8 - (i+1)*(layH+3);
        const alpha = (0.42 + 0.58 * (i / Math.max(n-1, 1))).toFixed(2);
        s += `<rect x="${x}" y="${y}" width="${lw}" height="${layH}" rx="3" fill="${colDk}" opacity="${alpha}"/>`;
        s += `<text x="${svgW/2}" y="${y+layH/2}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="9.5" font-family="Arial,sans-serif" font-weight="700">${lagen[i]}</text>`;
      }
      return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:380px;display:block;margin:0 auto">${s}</svg>`;
    }

    default: return '';
  }
}

function _tbShowOutput() {
  const d  = _tb.data;
  const f  = _tb.form;
  const plan      = state.plan || 'credits';
  const isPremium = ['founder', 'abo', 'premium'].includes(plan);

  const isTafel = _tb.view === 'tafel';
  const aufteilung = f.aufteilung || '3-geteilt';
  const is2geteilt = aufteilung === '2-geteilt';

  // Farbgebung Tafelansicht
  const TB_BG     = '#1a3a2a';
  const TB_BORDER = '#2d5c3e';
  const TB_TEXT   = '#e8f5e9';
  const TB_KOPF   = '#a5d6a7';
  const TB_ACCENT = '#fff176'; // gelb für Akzente

  /* ── Tafelfeld-HTML ── */
  const tafelfeld = (panel, isMain, diagramHtml) => {
    if (!panel) return '';
    const lines = (panel.inhalt || '').split('\n').filter(l => l.trim());
    const lineHtml = lines.map(l => {
      const styled = l
        .replace(/→/g, '<span style="color:' + TB_ACCENT + '">→</span>')
        .replace(/\*([^*]+)\*/g, '<strong style="color:' + TB_ACCENT + '">$1</strong>');
      return `<div style="margin-bottom:4px;line-height:1.45">${styled}</div>`;
    }).join('');

    const flex = isMain ? '2' : '1';
    const border = isMain ? '2px solid ' + TB_ACCENT + '44' : '1px solid ' + TB_BORDER;

    return `
      <div style="flex:${flex};padding:14px 16px;border-right:${border}">
        <div style="font-size:10pt;font-weight:700;color:${TB_KOPF};letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${TB_BORDER}">${esc(panel.kopf || '')}</div>
        ${diagramHtml || ''}
        <div style="font-size:11pt;color:${TB_TEXT};font-family:'Courier New',monospace;line-height:1.5">${lineHtml}</div>
        ${panel.akzent && isPremium ? `<div style="margin-top:10px;font-size:8.5pt;color:${TB_ACCENT};opacity:.7;font-style:italic">🎨 ${esc(panel.akzent)}</div>` : ''}
      </div>`;
  };

  /* ── Heftbild-Feld-HTML ── */
  const heftfeld = (panel, isMain, diagramHtml) => {
    if (!panel) return '';
    const lines = (panel.inhalt || '').split('\n').filter(l => l.trim());
    const lineHtml = lines.map(l => `<div style="margin-bottom:3px;line-height:1.5;padding-left:8px;border-left:2px solid #e0e0e0">${esc(l)}</div>`).join('');
    const flex = isMain ? '2' : '1';
    return `
      <div style="flex:${flex};padding:12px 14px;border-right:1px solid #e8e8e8">
        <div style="font-size:9.5pt;font-weight:700;color:#1a3a2a;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1a3a2a">${esc(panel.kopf || '')}</div>
        ${diagramHtml || ''}
        <div style="font-size:11pt;color:#1a1a1a;line-height:1.55">${lineHtml}</div>
      </div>`;
  };

  /* ── Board bauen ── */
  const buildBoard = (isTafelView) => {
    const bg      = isTafelView ? TB_BG : '#fff';
    const panelFn = isTafelView ? tafelfeld : heftfeld;
    const titCol  = isTafelView ? TB_ACCENT : '#1a3a2a';
    const lzCol   = isTafelView ? TB_KOPF   : '#555';
    const borderC = isTafelView ? TB_BORDER  : '#e0e0e0';

    // Diagramm im Mittelfeld rendern (falls vorhanden)
    const diagSvg = d.diagramm ? _tbDiagramSvg(d.diagramm, isTafelView) : '';

    const panels = is2geteilt
      ? `${panelFn(d.links, false)}${panelFn(d.rechts, false)}`
      : aufteilung === 'schwerpunkt-mitte'
        ? `${panelFn(d.links, false)}${panelFn(d.mitte, true, diagSvg)}${panelFn(d.rechts, false)}`
        : `${panelFn(d.links, false)}${panelFn(d.mitte, true, diagSvg)}${panelFn(d.rechts, false)}`;

    const merksatzHtml = d.merksatz ? `
      <div style="padding:10px 16px;background:${isTafelView ? '#0d2a1a' : '#e8f5e9'};border-top:1px solid ${borderC}">
        <span style="font-size:9pt;font-weight:700;color:${isTafelView ? TB_ACCENT : '#1a3a2a'}">📌 Merksatz: </span>
        <span style="font-size:10.5pt;color:${isTafelView ? TB_TEXT : '#1a1a1a'};font-style:italic">${esc(d.merksatz)}</span>
      </div>` : '';

    return `
      <div id="tb-board" style="background:${bg};border-radius:6px;overflow:hidden;box-shadow:${isTafelView ? '0 4px 30px rgba(0,0,0,.5)' : '0 2px 20px rgba(0,0,0,.12)'}">
        <!-- Kopfzeile -->
        <div style="padding:10px 16px;background:${isTafelView ? '#122a1e' : '#f5f5f5'};border-bottom:1px solid ${borderC};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-size:15pt;font-weight:700;color:${titCol};font-family:${isTafelView ? '\'Courier New\',monospace' : 'Arial,sans-serif'}">${esc(d.titel || f.thema)}</div>
            ${d.lernziel ? `<div style="font-size:9pt;color:${lzCol};margin-top:3px">🎯 ${esc(d.lernziel)}</div>` : ''}
          </div>
          <div style="font-size:9pt;color:${lzCol};opacity:.6">${esc(f.fach || '')}${f.jgst ? ' · ' + f.jgst + '. Klasse' : ''} · ${esc(state.schulart || '')}</div>
        </div>
        <!-- Tafelfläche -->
        <div style="display:flex;min-height:200px">${panels}</div>
        <!-- Merksatz -->
        ${merksatzHtml}
      </div>`;
  };

  document.getElementById('view-tool-tafelbild').innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--ts-bg)">

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:.5rem;padding:.65rem .85rem;border-bottom:1px solid var(--ts-border-light);background:var(--ts-bg-card);flex-shrink:0;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" style="width:auto;flex-shrink:0" onclick="_tbBackToForm()">← Bearbeiten</button>
        <div style="flex:1;min-width:120px">
          <div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ts-text)">${esc(d.titel || f.thema)}</div>
          <div style="font-size:.72rem;color:var(--ts-text-secondary)">${esc(f.fach || '')}${f.jgst ? ' · ' + f.jgst + '. Klasse' : ''}</div>
        </div>
        <!-- Ansicht-Toggle -->
        <div style="display:flex;border:1.5px solid var(--ts-border-light);border-radius:8px;overflow:hidden;flex-shrink:0">
          <button id="tb-btn-tafel" onclick="_tbToggleView('tafel')"
            style="padding:5px 10px;font-size:.78rem;border:none;background:${_tb.view==='tafel'?'var(--ts-teal)':'transparent'};color:${_tb.view==='tafel'?'#fff':'var(--ts-text)'};cursor:pointer;font-weight:600">🪟 Tafelbild</button>
          <button id="tb-btn-heft" onclick="_tbToggleView('heft')"
            style="padding:5px 10px;font-size:.78rem;border:none;background:${_tb.view==='heft'?'var(--ts-teal)':'transparent'};color:${_tb.view==='heft'?'#fff':'var(--ts-text)'};cursor:pointer;font-weight:600">📓 Heftbild</button>
        </div>
        <div style="display:flex;gap:.4rem;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" style="width:auto" onclick="_tbSaveToDb()">💾 Speichern</button>
          <button class="btn btn-primary btn-sm" style="width:auto" onclick="_tbPrint()">🖨️ Drucken</button>
        </div>
      </div>

      <!-- Board-Vorschau -->
      <div style="flex:1;overflow-y:auto;padding:1.25rem;background:${_tb.view === 'tafel' ? '#0f1f17' : '#EEEEEE'}">
        <div style="max-width:900px;margin:0 auto">
          ${buildBoard(_tb.view === 'tafel')}

          ${d.strukturhinweis || d.gestaltungshinweise || d.heftbild_hinweis ? `
          <div style="margin-top:1rem;background:var(--ts-bg-card);border-radius:10px;padding:1rem 1.25rem;border:1px solid var(--ts-border-light)">
            ${d.strukturhinweis ? `<div style="margin-bottom:.5rem"><span style="font-weight:700;font-size:.85rem;color:var(--ts-text)">💡 Strukturlogik: </span><span style="font-size:.85rem;color:var(--ts-text-secondary)">${esc(d.strukturhinweis)}</span></div>` : ''}
            ${d.gestaltungshinweise ? `<div style="margin-bottom:.5rem"><span style="font-weight:700;font-size:.85rem;color:var(--ts-text)">🎨 Gestaltung: </span><span style="font-size:.85rem;color:var(--ts-text-secondary);white-space:pre-wrap">${esc(d.gestaltungshinweise)}</span></div>` : ''}
            ${d.heftbild_hinweis ? `<div><span style="font-weight:700;font-size:.85rem;color:var(--ts-text)">📓 Heftbild: </span><span style="font-size:.85rem;color:var(--ts-text-secondary)">${esc(d.heftbild_hinweis)}</span></div>` : ''}
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

function _tbToggleView(view) {
  _tb.view = view;
  _tbShowOutput();
}

function _tbBackToForm() {
  _tb.mode = 'form';
  _tbShowForm();
}

/* ── Speichern in Materialdatenbank ── */
/* Vollständiges, selbsttragendes HTML für ein gespeichertes Tafelbild erzeugen.
   Keine CSS-Variablen — funktioniert in jedem neuen Tab ohne App-Kontext. */
function _tbBuildStandaloneHtml() {
  const d = _tb.data;
  const f = _tb.form;
  if (!d) return '';

  const aufteilung = f.aufteilung || '3-geteilt';
  const is2 = aufteilung === '2-geteilt';

  // Diagram SVG in Heft-Farben (isTafel=false)
  const diagSvg = d.diagramm ? _tbDiagramSvg(d.diagramm, false) : '';

  const panel = (p, isMain, extra) => {
    if (!p) return '';
    const lines = (p.inhalt || '').split('\n').filter(l => l.trim());
    const lineHtml = lines.map(l => `<div style="margin-bottom:3px;line-height:1.5;padding-left:8px;border-left:2px solid #ddd">${l.replace(/→/g,'→')}</div>`).join('');
    const flex = isMain ? '2' : '1';
    return `<div style="flex:${flex};padding:12px 14px;border-right:1px solid #e8e8e8;min-width:0">
      <div style="font-size:9.5pt;font-weight:700;color:#1a3a2a;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1a3a2a">${p.kopf||''}</div>
      ${extra||''}
      <div style="font-size:10.5pt;color:#1a1a1a;line-height:1.55">${lineHtml}</div>
    </div>`;
  };

  const panels = is2
    ? `${panel(d.links, false)}${panel(d.rechts, false)}`
    : `${panel(d.links, false)}${panel(d.mitte, true, diagSvg)}${panel(d.rechts, false)}`;

  const merksatz = d.merksatz
    ? `<div style="padding:10px 16px;background:#e8f5e9;border-top:1px solid #e0e0e0">
        <span style="font-size:9pt;font-weight:700;color:#1a3a2a">📌 Merksatz: </span>
        <span style="font-size:10.5pt;color:#1a1a1a;font-style:italic">${d.merksatz}</span>
       </div>` : '';

  const meta = [f.fach, f.jgst ? f.jgst + '. Klasse' : '', state.schulart || ''].filter(Boolean).join(' · ');

  const board = `<div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.12);max-width:960px;margin:0 auto">
    <div style="padding:10px 16px;background:#f5f5f5;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem">
      <div>
        <div style="font-size:15pt;font-weight:700;color:#1a3a2a">${d.titel || f.thema}</div>
        ${d.lernziel ? `<div style="font-size:9pt;color:#555;margin-top:3px">🎯 ${d.lernziel}</div>` : ''}
      </div>
      <div style="font-size:9pt;color:#888">${meta}</div>
    </div>
    <div style="display:flex;min-height:200px">${panels}</div>
    ${merksatz}
  </div>
  ${d.strukturhinweis ? `<div style="margin-top:.75rem;font-size:9pt;color:#555;max-width:960px;margin-left:auto;margin-right:auto">💡 <em>${d.strukturhinweis}</em></div>` : ''}`;

  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8">
<title>${d.titel || f.thema} — Tafelbild · TeachSmarter</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4 landscape; margin:1.5cm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  body { font-family:Arial,Helvetica,sans-serif; background:#eee; padding:1.5rem; }
</style></head><body>${board}</body></html>`;
}

async function _tbSaveToDb() {
  if (!_tb.data || typeof getMediaDb !== 'function') return;
  const d    = _tb.data;
  const f    = _tb.form;
  const name = d.titel || f.thema || 'Tafelbild';

  const content = _tbBuildStandaloneHtml();
  const db = getMediaDb();
  const existingIdx = db.findIndex(m => m.name === name && m.isTafelbild);

  if (existingIdx >= 0) {
    db[existingIdx] = {
      ...db[existingIdx],
      content,
      rawData:    JSON.stringify(d),
      fachTags:   f.fachId ? [f.fachId] : [],
      klassenIds: f.klassenIds || [],
      tags:       ['tafelbild', 'ki-generiert'],
      updatedAt:  new Date().toISOString(),
    };
  } else {
    db.push({
      id:         'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name,
      type:       'html',
      content,
      rawData:    JSON.stringify(d),
      createdAt:  new Date().toISOString(),
      fachTags:   f.fachId ? [f.fachId] : [],
      klassenIds: f.klassenIds || [],
      tags:       ['tafelbild', 'ki-generiert'],
      source:     'ki',
      isTafelbild: true,
    });
  }

  await saveMediaDb(db);
  const list = document.getElementById('sv-media-list');
  if (list && typeof svRenderMediaItems === 'function') list.innerHTML = svRenderMediaItems('');
  _showToast(`"${name}" in der Materialdatenbank gespeichert ✓`, 'ok');
}

/* ── Drucken (Heftbild-optimiert) ── */
function _tbPrint() {
  const board = document.getElementById('tb-board');
  if (!board) return;
  const d = _tb.data;
  const f = _tb.form;

  // Immer Heftbild für den Druck (weiß, druckerfreundlich)
  _tb.view = 'heft';
  _tbShowOutput();
  setTimeout(() => {
    const boardHeft = document.getElementById('tb-board');
    const win = window.open('', '_blank', 'width=950,height=720');
    if (!win) { _showToast('Popup-Blocker aktiv — bitte Popups erlauben.', 'error'); return; }
    win.document.write(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><title>${esc(d.titel || f.thema)} — Tafelbild</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4 landscape; margin:1.5cm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  body { font-family:Arial,Helvetica,sans-serif; background:#fff; }
</style></head><body>
${boardHeft ? boardHeft.outerHTML : ''}
<script>window.onload=function(){window.print();};<\/script>
</body></html>`);
    win.document.close();
  }, 100);
}


/* ══════════════════════════════════════════════════════
   PRÄSENTATIONS-WIZARD
   ══════════════════════════════════════════════════════ */

/* ── Farbschemen für Präsentationen */
const _PR_SCHEMES = {
  navy:   { name:'Navy',    bg:'#1A3C5E', text:'#FFFFFF', accent:'#3BA89B', bar:'#2A5280', textRgb:'255,255,255' },
  teal:   { name:'Teal',    bg:'#2D8A7F', text:'#FFFFFF', accent:'#FAF8F5', bar:'#3BA89B', textRgb:'255,255,255' },
  hell:   { name:'Hell',    bg:'#FFFFFF', text:'#1A3C5E', accent:'#3BA89B', bar:'#F5F0EA', textRgb:'26,60,94' },
  dunkel: { name:'Dunkel',  bg:'#1E1E2E', text:'#E8E2DA', accent:'#3BA89B', bar:'#2A2A3E', textRgb:'232,226,218' },
};
const _PR_TYP_COLORS = { einstieg:'#E74C3C', erarbeitung:'#16A085', sicherung:'#8E44AD', transfer:'#2980B9', wiederholung:'#F39C12', aufgabe:'#27AE60', fazit:'#2C3E50' };
const _PR_TYP_LABELS = { einstieg:'Einstieg', erarbeitung:'Erarbeitung', sicherung:'Sicherung', transfer:'Transfer', wiederholung:'Wiederholung', aufgabe:'Aufgabe', fazit:'Fazit' };

let _pr = {
  mode: 'form',
  form: { thema:'', fach:'', jgst:'', lernziel:'', besonderheiten:'', stil:'sachlich', anzahl:'8', dauer:'45', farbschema:'navy', fachId:'', klassenIds:[] },
  data: null,
};

function renderToolPraesentation() {
  if (!licenseKey) { _toolLockedView('tool-praesentation'); return; }
  if (_pr.mode === 'output' && _pr.data) { _prShowOutput(); return; }
  _prShowForm();
}

function _prShowForm() {
  const view = document.getElementById('view-tool-praesentation');
  if (!view) return;
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const f = _pr.form;

  const fachOpts = `<option value="">– Fach wählen –</option>`
    + getAllFaecher().map(fc => `<option value="${esc(fc.id)}"${f.fachId===fc.id?' selected':''}>${esc(fc.name)}</option>`).join('');

  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst===j?' selected':''}>${j}. Klasse</option>`).join('');

  const klassenChecks = (state.klassen||[]).map(kl => `
    <label style="display:flex;align-items:center;gap:.35rem;font-size:.84rem;cursor:pointer;color:var(--ts-text)">
      <input type="checkbox" class="pr-klasse-cb" value="${esc(kl.id)}" ${(f.klassenIds||[]).includes(kl.id)?'checked':''}
        style="width:15px;height:15px;accent-color:var(--ts-teal)"> ${esc(kl.name)}
    </label>`).join('');

  const pills = (field, opts, cur, labels) => `<div class="ab-pills">
    ${opts.map((o,i)=>`<button class="ab-pill${cur===o?' active':''}" onclick="_prPill('${field}','${o}',this)">${labels?labels[i]:o}</button>`).join('')}
  </div>`;

  const schemeButtons = Object.entries(_PR_SCHEMES).map(([k, s]) =>
    `<button onclick="_prPill('farbschema','${k}',this)" class="ab-pill${f.farbschema===k?' active':''}"
      style="display:flex;align-items:center;gap:6px">
      <span style="width:12px;height:12px;border-radius:3px;background:${s.bg};border:1.5px solid rgba(0,0,0,.18);flex-shrink:0;display:inline-block"></span>${s.name}
    </button>`).join('');

  view.innerHTML = `
    <div>
    <div class="tool-grid">

      <div class="es-section">
        <div class="es-section-title">Inhalt</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Thema / Titel *</label>
            <input id="pr-thema" class="input" placeholder="z.B. Photosynthese" value="${esc(f.thema||'')}">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Fach</label>
              <select id="pr-fach-select" class="input">${fachOpts}</select>
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Jahrgangsstufe</label>
              <select id="pr-jgst" class="input"><option value="">– wählen –</option>${jgstOpts}</select>
            </div>
          </div>
          ${(state.klassen||[]).length ? `
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Klassen <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:.4rem .9rem;margin-top:.3rem">${klassenChecks}</div>
          </div>` : ''}
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Lernziel <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <input id="pr-lernziel" class="input" placeholder="Die SuS können …" value="${esc(f.lernziel||'')}">
          </div>
        </div>
      </div>

      <div class="es-section">
        <div class="es-section-title">Optionen</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Stundendauer</label>
            ${pills('dauer',['45','60','90'],f.dauer,['45 min','60 min','90 min'])}
          </div>
          <div class="es-field">
            <label class="es-label">Anzahl Folien</label>
            ${pills('anzahl',['5','8','12'],f.anzahl,['5 Folien','8 Folien','12 Folien'])}
          </div>
          <div class="es-field">
            <label class="es-label">Stil</label>
            ${pills('stil',['sachlich','kreativ','visuell'],f.stil,['Sachlich','Kreativ','Visuell'])}
          </div>
          <div class="es-field">
            <label class="es-label">Farbschema</label>
            <div class="ab-pills">${schemeButtons}</div>
          </div>
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Besonderheiten <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <textarea id="pr-besonderheiten" class="input" rows="2" placeholder="z.B. SuS haben keine Vorkenntnisse" style="resize:vertical">${esc(f.besonderheiten||'')}</textarea>
          </div>
        </div>
      </div>

    </div><!-- /tool-grid -->
    ${isPremium ? `
    <div class="es-section" style="margin-top:var(--sp-lg)">
      <div class="es-section-title" style="display:flex;align-items:center;gap:.5rem">
        Erweiterte Optionen
        <span style="font-size:.68rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">✦ PREMIUM</span>
      </div>
      <div class="es-card">
        <div class="es-hint">✓ Lehrerhinweise · ✓ Interaktive Impulse · ✓ Medienempfehlungen · ✓ Differenzierungshinweis</div>
      </div>
    </div>` : `
    <div style="margin-top:var(--sp-md);padding:.65rem .9rem;background:var(--ts-bg-warm);border-radius:8px;font-size:.82rem;color:var(--ts-text-secondary);border:1px solid var(--ts-border-light)">
      ✦ Lehrerhinweise, Impulse & Differenzierungshinweis mit
      <a href="${TS_STRIPE_ABO_29}" target="_blank" style="color:var(--ts-teal);text-decoration:none;font-weight:600">Abo oder Gründeredition</a>
    </div>`}
    <div class="es-section" style="margin-top:var(--sp-lg)">
      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generatePraesentation()">
        <span id="pr-btn-txt">Präsentation generieren · 2 Credits</span>
      </button>
    </div>
    </div>`;
}

function _prPill(field, value, btn) {
  _pr.form[field] = value;
  const g = btn.closest('.ab-pills');
  if (g) g.querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function generatePraesentation() {
  const thema = document.getElementById('pr-thema')?.value.trim();
  if (!thema) { _showToast('Bitte ein Thema eingeben.', 'error'); return; }
  const f = _pr.form;
  f.thema = thema;
  f.fachId = document.getElementById('pr-fach-select')?.value || '';
  f.klassenIds = [...document.querySelectorAll('.pr-klasse-cb:checked')].map(cb => cb.value);
  f.jgst  = document.getElementById('pr-jgst')?.value.trim() || '';
  f.lernziel = document.getElementById('pr-lernziel')?.value.trim() || '';
  f.besonderheiten = document.getElementById('pr-besonderheiten')?.value.trim() || '';

  // Fach-Name für den Prompt
  const fachObj = getAllFaecher().find(fc => fc.id === f.fachId);
  f.fach = fachObj ? fachObj.name : '';

  const btn = document.getElementById('pr-btn-txt');
  if (btn) btn.textContent = '⏳ Generiere…';
  try {
    const isPremium = window.isPremiumUser && window.isPremiumUser();
    const result = await callKI('praesentation', {
      thema: f.thema, fach: f.fach, jgst: f.jgst, lernziel: f.lernziel,
      dauer: f.dauer, anzahl_folien: f.anzahl, stil: f.stil,
      besonderheiten: f.besonderheiten,
      schulart: state.schulart||'', bundesland: state.bundesland||'',
      premium: isPremium,
    });
    if (!result) return;
    _pr.data = result; _pr.mode = 'output'; _prShowOutput();
  } catch(e) {
    if (btn) btn.textContent = '🎯 Präsentation generieren (2 Credits)';
    _showToast(e.message||'Fehler beim Generieren.', 'error');
  }
}

function _prShowOutput() {
  const view = document.getElementById('view-tool-praesentation');
  if (!view) return;
  const d = _pr.data;
  if (!d) { _prBackToForm(); return; }
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const totalZeit = (d.folien||[]).reduce((s,f) => s + (parseInt(f.zeit)||0), 0);

  const folienCards = (d.folien||[]).map(folie => {
    const col = _PR_TYP_COLORS[folie.typ] || '#555';
    const lbl = _PR_TYP_LABELS[folie.typ] || folie.typ;
    return `<div style="border:1px solid var(--ts-border);border-radius:10px;overflow:hidden;margin-bottom:.75rem">
      <div style="background:${col};color:#fff;padding:.45rem .9rem;display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:.88rem">Folie ${folie.nr}: ${esc(folie.titel)}</div>
        <div style="display:flex;gap:.6rem;align-items:center;flex-shrink:0">
          <span style="font-size:.72rem;background:rgba(255,255,255,.2);border-radius:20px;padding:.1rem .5rem">${lbl}</span>
          ${folie.zeit?`<span style="font-size:.72rem;opacity:.8">${esc(String(folie.zeit))} min</span>`:''}
          ${folie.bild_suchbegriff?`<span style="font-size:.72rem;opacity:.8">🖼️</span>`:''}
        </div>
      </div>
      <div style="padding:.75rem .9rem;background:var(--ts-bg)">
        <ul style="margin:0 0 .4rem 1.1rem;padding:0;font-size:.86rem;color:var(--ts-text)">
          ${(folie.inhalt||[]).map(s=>`<li style="margin-bottom:.18rem">${esc(s)}</li>`).join('')}
        </ul>
        ${folie.methode?`<div style="font-size:.76rem;color:var(--ts-text-secondary);border-top:1px solid var(--ts-border);padding-top:.4rem;margin-top:.4rem">📌 ${esc(folie.methode)}</div>`:''}
        ${isPremium&&folie.interaktion?`<div style="font-size:.76rem;color:#8E44AD;margin-top:.3rem">💬 ${esc(folie.interaktion)}</div>`:''}
        ${isPremium&&folie.lehrerhinweis?`<div style="font-size:.76rem;color:#E67E22;margin-top:.25rem;font-style:italic">🔑 ${esc(folie.lehrerhinweis)}</div>`:''}
      </div>
    </div>`;
  }).join('');

  view.innerHTML = `
  <div class="es-page">
    <div style="max-width:700px;margin:0 auto;padding:1.5rem 1rem 4rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_prBackToForm()">← Neu</button>
        <button class="btn btn-primary" style="padding:.4rem 1rem;font-size:.83rem" onclick="_prStartPresentation()">▶ Präsentation starten</button>
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_prSaveToDb()">💾 Speichern</button>
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_prDownloadPptx()">⬇ PowerPoint</button>
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_prPrint()">🖨️ Drucken</button>
      </div>
      <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--ts-text);margin-bottom:.35rem">${esc(d.titel||_pr.form.thema)}</div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
        ${d.fach?`<span style="font-size:.8rem;color:var(--ts-text-secondary)">${esc(d.fach)}</span>`:''}
        ${d.jgst?`<span style="font-size:.8rem;color:var(--ts-text-secondary)">Jgst. ${esc(d.jgst)}</span>`:''}
        <span style="font-size:.8rem;color:var(--ts-text-secondary)">${(d.folien||[]).length} Folien</span>
        ${totalZeit?`<span style="font-size:.8rem;color:var(--ts-text-secondary)">~${totalZeit} min</span>`:''}
      </div>
      ${d.lernziel?`<div style="background:rgba(59,168,155,.1);border-left:3px solid var(--ts-teal);padding:.55rem .9rem;border-radius:0 6px 6px 0;font-size:.84rem;color:var(--ts-text);margin-bottom:1rem"><strong>Lernziel:</strong> ${esc(d.lernziel)}</div>`:''}
      ${folienCards}
      ${isPremium&&d.medienempfehlungen?`<div style="border:1px solid var(--ts-border);border-radius:10px;padding:.8rem .9rem;margin-top:.5rem;background:var(--ts-bg)"><div style="font-size:.75rem;font-weight:700;color:var(--ts-teal);margin-bottom:.4rem">MEDIENEMPFEHLUNGEN</div><div style="font-size:.84rem;color:var(--ts-text)">${esc(d.medienempfehlungen)}</div></div>`:''}
      ${isPremium&&d.differenzierung_hinweis?`<div style="border:1px solid var(--ts-border);border-radius:10px;padding:.8rem .9rem;margin-top:.6rem;background:var(--ts-bg)"><div style="font-size:.75rem;font-weight:700;color:#8E44AD;margin-bottom:.4rem">DIFFERENZIERUNGSHINWEIS</div><div style="font-size:.84rem;color:var(--ts-text)">${esc(d.differenzierung_hinweis)}</div></div>`:''}
    </div>
  </div>`;
}

function _prBackToForm() { _pr.mode = 'form'; _prShowForm(); }

/* ── Standalone Slideshow HTML ── */
function _prBuildStandaloneHtml() {
  const d = _pr.data;
  if (!d) return '';
  const f = _pr.form;
  const sc = _PR_SCHEMES[f.farbschema || 'navy'];

  // Titelfolie-Gradient (immer dunkel, Akzentfarbe aus Schema)
  const titleGradients = {
    navy:   'linear-gradient(135deg,#1A3C5E 0%,#0d2035 55%,#163d35 100%)',
    teal:   'linear-gradient(135deg,#2D8A7F 0%,#1a5550 55%,#0f3530 100%)',
    hell:   'linear-gradient(135deg,#1A3C5E 0%,#2A5280 55%,#3BA89B 100%)',
    dunkel: 'linear-gradient(135deg,#1E1E2E 0%,#0a0a18 55%,#12202a 100%)',
  };
  const titleGrad = titleGradients[f.farbschema||'navy'];

  const titleSlide = `<div class="slide active" data-notes="">
    <div class="s-title-bg" style="background:${titleGrad}"></div>
    <div class="s-title-deco"></div>
    <div class="s-title-content">
      ${d.fach?`<div class="s-fach">${d.fach}${d.jgst?' · Jgst.\u00a0'+d.jgst:''}</div>`:''}
      <h1 class="s-haupttitel">${d.titel||f.thema}</h1>
      ${d.lernziel?`<div class="s-lernziel"><span style="font-weight:700">Lernziel:</span> ${d.lernziel}</div>`:''}
      <div class="s-meta">${[d.dauer?d.dauer+'\u00a0min':'', d.fach&&d.jgst?'':''].filter(Boolean).join(' · ')}</div>
    </div>
  </div>`;

  const contentSlides = (d.folien||[]).map(folie => {
    const tc = _PR_TYP_COLORS[folie.typ] || sc.accent;
    const lbl = _PR_TYP_LABELS[folie.typ] || folie.typ;
    const notes = [folie.lehrerhinweis, folie.interaktion].filter(Boolean).join('\n');
    return `<div class="slide" data-notes="${notes.replace(/"/g,'&quot;')}">
      <div class="s-typbar" style="background:${tc}">
        <span class="s-typlbl">${lbl}</span>
        ${folie.zeit?`<span class="s-zeit">${folie.zeit}\u00a0min</span>`:''}
      </div>
      <div class="s-body">
        <h2 class="s-titel">${folie.titel||''}</h2>
        <ul class="s-punkte">${(folie.inhalt||[]).map(s=>`<li>${s}</li>`).join('')}</ul>
        ${folie.methode?`<div class="s-methode">📌\u00a0${folie.methode}</div>`:''}
      </div>
    </div>`;
  }).join('');

  const total = (d.folien||[]).length + 1;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${d.titel||f.thema}</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#111;font-family:'DM Sans',sans-serif;overflow:hidden;-webkit-tap-highlight-color:transparent}
#app{width:100%;height:100dvh;display:flex;align-items:center;justify-content:center}
/* 16:9 Wrapper — font-size ist der Skalierungs-Anker für alle em-Werte */
#wrap{
  --sw:min(100vw,calc(100dvh * 16 / 9));
  --sh:min(100dvh,calc(100vw * 9 / 16));
  width:var(--sw);height:var(--sh);
  font-size:calc(var(--sw) / 52);
  position:relative;overflow:hidden;
  background:${sc.bg};color:${sc.text};
}
/* Slides */
.slide{position:absolute;inset:0;display:none;flex-direction:column;width:100%;height:100%}
.slide.active{display:flex}
/* ── Titelfolie */
.s-title-bg{position:absolute;inset:0}
.s-title-deco{position:absolute;inset:0;overflow:hidden}
.s-title-deco::before{content:'';position:absolute;right:-8%;top:-15%;width:55%;aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.03)}
.s-title-deco::after{content:'';position:absolute;right:12%;bottom:-20%;width:40%;aspect-ratio:1;border-radius:50%;background:rgba(${sc.accent==='#FAF8F5'?'250,248,245':'59,168,155'},.07)}
.s-title-content{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;height:100%;padding:0 8% 0 8%}
.s-fach{font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${sc.accent};margin-bottom:.9em}
.s-haupttitel{font-family:'Source Serif 4',serif;font-size:2.8em;font-weight:700;color:#fff;line-height:1.1;margin-bottom:.7em;max-width:75%}
.s-lernziel{background:rgba(255,255,255,.12);border-left:3px solid ${sc.accent};padding:.45em .9em;font-size:.72em;color:rgba(255,255,255,.9);max-width:68%;border-radius:0 6px 6px 0;margin-bottom:.6em;line-height:1.55}
.s-meta{font-size:.58em;color:rgba(255,255,255,.45)}
/* ── Inhaltsfolien */
.s-typbar{display:flex;align-items:center;justify-content:space-between;padding:.4em 1.6em;flex-shrink:0;min-height:2.2em}
.s-typlbl{font-size:.6em;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#fff}
.s-zeit{font-size:.58em;color:rgba(255,255,255,.75)}
.s-body{flex:1;display:flex;flex-direction:column;padding:1.1em 2em 1.4em;gap:.6em;overflow:hidden;min-height:0}
.s-titel{font-family:'Source Serif 4',serif;font-size:1.6em;font-weight:700;color:${sc.text};line-height:1.2;flex-shrink:0}
.s-punkte{list-style:none;flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:.55em;min-height:0}
.s-punkte li{font-size:1em;line-height:1.45;padding-left:1.3em;position:relative;color:${sc.text}}
.s-punkte li::before{content:'▸';position:absolute;left:0;color:${sc.accent};font-weight:700}
.s-methode{font-size:.62em;color:rgba(${sc.textRgb},.55);border-top:1px solid rgba(${sc.textRgb},.15);padding-top:.6em;flex-shrink:0}
/* ── Nav */
#nav{position:fixed;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 16px;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:100;opacity:0;transition:opacity .25s}
body:hover #nav,#nav:focus-within{opacity:1}
.nb{background:rgba(255,255,255,.14);border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:1.15rem;display:flex;align-items:center;justify-content:center;transition:background .12s;flex-shrink:0}
.nb:hover{background:rgba(255,255,255,.28)}.nb:disabled{opacity:.25;cursor:not-allowed}
#ctr{color:#fff;font-size:.85rem;font-weight:600;min-width:56px;text-align:center}
.nb-txt{background:rgba(255,255,255,.12);border:none;color:rgba(255,255,255,.8);font-size:.78rem;padding:5px 12px;border-radius:20px;cursor:pointer;transition:all .12s;white-space:nowrap}
.nb-txt.on{background:rgba(59,168,155,.45);color:#fff}
#bar{position:fixed;bottom:0;left:0;height:3px;background:${sc.accent};transition:width .3s;z-index:101;pointer-events:none}
/* ── Notes */
#notes{position:fixed;bottom:0;left:0;right:0;max-height:30vh;background:rgba(12,18,28,.97);color:#ccd8e8;font-size:.88rem;padding:14px 24px 50px;border-top:2px solid ${sc.accent};transform:translateY(100%);transition:transform .28s;z-index:99;overflow-y:auto;line-height:1.6}
#notes.open{transform:translateY(0)}
#notes-lbl{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:${sc.accent};font-weight:700;margin-bottom:6px}
</style>
</head>
<body>
<div id="app"><div id="wrap">
  ${titleSlide}
  ${contentSlides}
</div></div>
<div id="bar"></div>
<div id="nav">
  <button class="nb" id="bp" onclick="prev()" disabled title="Zurück (←)">‹</button>
  <span id="ctr">1 / ${total}</span>
  <button class="nb" id="bn" onclick="next()" title="Weiter (→ / Leertaste)">›</button>
  <button class="nb-txt" id="nb" onclick="toggleNotes()">📝 Notizen</button>
  <button class="nb-txt" onclick="toggleFS()">⛶ Vollbild</button>
</div>
<div id="notes"><div id="notes-lbl">Lehrerhinweise</div><div id="ntxt"></div></div>
<script>
const slides=document.querySelectorAll('.slide'),tot=slides.length;
let cur=0,notesOn=false;
function go(n){
  slides.forEach((s,i)=>s.classList.toggle('active',i===n));
  cur=n;
  document.getElementById('ctr').textContent=(n+1)+' / '+tot;
  document.getElementById('bar').style.width=((n+1)/tot*100)+'%';
  document.getElementById('bp').disabled=n===0;
  document.getElementById('bn').disabled=n===tot-1;
  document.getElementById('ntxt').textContent=slides[n].dataset.notes||'(Keine Notizen für diese Folie)';
}
function next(){if(cur<tot-1)go(cur+1);}
function prev(){if(cur>0)go(cur-1);}
function toggleNotes(){notesOn=!notesOn;document.getElementById('notes').classList.toggle('open',notesOn);document.getElementById('nb').classList.toggle('on',notesOn);}
function toggleFS(){if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});else document.exitFullscreen();}
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();next();}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();prev();}
  else if(e.key.toLowerCase()==='f')toggleFS();
  else if(e.key.toLowerCase()==='n')toggleNotes();
  else if(e.key==='Escape'&&notesOn)toggleNotes();
});
let tx=0;
document.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',e=>{const dx=tx-e.changedTouches[0].clientX;if(Math.abs(dx)>40)dx>0?next():prev();},{passive:true});
go(0);
<\/script>
</body>
</html>`;
}

function _prStartPresentation() {
  const html = _prBuildStandaloneHtml();
  const win = window.open('', '_blank');
  if (!win) { _showToast('Popup-Blocker aktiv — bitte erlauben.', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

async function _prSaveToDb() {
  if (!_pr.data || typeof getMediaDb !== 'function') return;
  const d = _pr.data;
  const f = _pr.form;
  const name = d.titel || f.thema || 'Präsentation';
  const content = _prBuildStandaloneHtml();
  const db = getMediaDb();
  const existingIdx = db.findIndex(m => m.name === name && m.tags?.includes('praesentation'));
  if (existingIdx >= 0) {
    db[existingIdx] = { ...db[existingIdx], content, rawData: JSON.stringify(d),
      fachTags: f.fachId ? [f.fachId] : [], klassenIds: f.klassenIds || [],
      tags: ['praesentation','ki-generiert', f.farbschema||'navy'], updatedAt: new Date().toISOString() };
  } else {
    db.push({ id: 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name, type: 'html', content, rawData: JSON.stringify(d), createdAt: new Date().toISOString(),
      fachTags: f.fachId ? [f.fachId] : [], klassenIds: f.klassenIds || [],
      tags: ['praesentation','ki-generiert', f.farbschema||'navy'], source: 'ki' });
  }
  await saveMediaDb(db);
  const list = document.getElementById('sv-media-list');
  if (list && typeof svRenderMediaItems === 'function') list.innerHTML = svRenderMediaItems('');
  _showToast(`"${name}" in der Materialdatenbank gespeichert ✓`, 'ok');
}

function _loadPptxGenJS() {
  if (typeof PptxGenJS !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    s.onload  = () => resolve();
    s.onerror = () => reject(new Error('PptxGenJS konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
    document.head.appendChild(s);
  });
}

async function _prDownloadPptx() {
  const d = _pr.data; if (!d) return;
  const f = _pr.form;
  const sc = _PR_SCHEMES[f.farbschema || 'navy'];

  try {
    await _loadPptxGenJS();
  } catch(e) {
    _showToast(e.message, 'error'); return;
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title  = d.titel || f.thema;
  pptx.author = 'TeachSmarter';

  // Farben aus Schema (hex ohne #)
  const bgHex   = sc.bg.replace('#','');
  const textHex = sc.text.replace('#','');
  const accentHex = sc.accent.replace('#','');

  // Titelfolie-Gradient simulieren (PptxGenJS kennt keine Gradients → Hintergrundfarbe + Akzentlinie)
  const titleBg = f.farbschema === 'hell' ? '1A3C5E' : bgHex;

  // ── Titelfolie ──
  const slide0 = pptx.addSlide();
  slide0.background = { color: titleBg };
  // Dekorativer Akzentbalken links
  slide0.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.08, h:'100%', fill:{ color: accentHex } });
  if (d.fach) {
    slide0.addText((d.fach + (d.jgst ? ' · Jgst. ' + d.jgst : '')).toUpperCase(), {
      x:0.35, y:1.2, w:9, h:0.4,
      fontSize:11, bold:true, color: accentHex, charSpacing:2,
    });
  }
  slide0.addText(d.titel || f.thema, {
    x:0.35, y:1.7, w:8.8, h:2.2,
    fontSize:36, bold:true, color:'FFFFFF',
    fontFace:'Calibri', breakLine:false, wrap:true,
  });
  if (d.lernziel) {
    slide0.addText('Lernziel: ' + d.lernziel, {
      x:0.35, y:4.1, w:8.8, h:0.8,
      fontSize:13, color:'CCDDEE', italic:false, wrap:true,
    });
  }
  if (d.dauer) {
    slide0.addText(d.dauer + ' min', {
      x:0.35, y:5.1, w:3, h:0.35,
      fontSize:11, color:'889EB5',
    });
  }

  // ── Inhaltsfolien ──
  const typColors = {
    einstieg:'E74C3C', erarbeitung:'16A085', sicherung:'8E44AD',
    transfer:'2980B9', wiederholung:'F39C12', aufgabe:'27AE60', fazit:'2C3E50',
  };
  const typLabels = _PR_TYP_LABELS;

  for (const folie of (d.folien || [])) {
    const slide = pptx.addSlide();
    slide.background = { color: f.farbschema === 'dunkel' ? '1E1E2E' : f.farbschema === 'hell' ? 'FFFFFF' : bgHex };

    const barColor = typColors[folie.typ] || '555555';
    const contentTextColor = f.farbschema === 'hell' ? '1A3C5E' : textHex.replace('#','');

    // Typ-Farbbalken oben
    slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:0.45, fill:{ color: barColor } });

    // Typ-Label + Zeit im Balken
    const barLabel = (typLabels[folie.typ] || folie.typ).toUpperCase();
    const barRight = folie.zeit ? folie.zeit + ' min' : '';
    slide.addText(barLabel, { x:0.2, y:0.02, w:4, h:0.4, fontSize:10, bold:true, color:'FFFFFF', charSpacing:1 });
    if (barRight) {
      slide.addText(barRight, { x:5.8, y:0.02, w:3.8, h:0.4, fontSize:10, color:'FFFFFF', align:'right' });
    }

    // Folientitel
    slide.addText(folie.titel || '', {
      x:0.3, y:0.6, w:9.1, h:0.85,
      fontSize:24, bold:true, color: contentTextColor,
      fontFace:'Calibri', wrap:true,
    });

    // Bullet Points
    const bullets = (folie.inhalt || []).map(s => ({
      text: s,
      options: { bullet:{ code:'25B8' }, fontSize:16, color: contentTextColor, breakLine:true, paraSpaceAfter:4 }
    }));
    if (bullets.length) {
      slide.addText(bullets, {
        x:0.3, y:1.55, w:9.1, h:3.4,
        fontFace:'Calibri', valign:'top', wrap:true,
      });
    }

    // Methode-Hinweis unten
    if (folie.methode) {
      slide.addShape(pptx.ShapeType.rect, { x:0, y:5.1, w:'100%', h:0.45, fill:{ color: f.farbschema==='hell'?'F0EBE4':'00000030' } });
      slide.addText('📌 ' + folie.methode, {
        x:0.2, y:5.12, w:9.3, h:0.38,
        fontSize:10, color: f.farbschema==='hell'?'6B7B8D':'AABBCC', italic:true,
      });
    }

    // Notizen (Lehrerhinweis + Interaktion) als Speaker Notes
    const notes = [folie.lehrerhinweis, folie.interaktion].filter(Boolean).join('\n');
    if (notes) slide.addNotes(notes);
  }

  // Premium: Abschlussfolie mit Medienempfehlungen
  if (d.medienempfehlungen || d.differenzierung_hinweis) {
    const slideExtra = pptx.addSlide();
    slideExtra.background = { color: titleBg };
    slideExtra.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.08, h:'100%', fill:{ color: accentHex } });
    slideExtra.addText('Hinweise für die Lehrkraft', { x:0.35, y:0.8, w:9, h:0.6, fontSize:22, bold:true, color:'FFFFFF' });
    let yPos = 1.6;
    if (d.medienempfehlungen) {
      slideExtra.addText('Medienempfehlungen', { x:0.35, y:yPos, w:9, h:0.4, fontSize:14, bold:true, color: accentHex });
      slideExtra.addText(d.medienempfehlungen, { x:0.35, y:yPos+0.4, w:9, h:1.2, fontSize:12, color:'CCDDEE', wrap:true });
      yPos += 1.8;
    }
    if (d.differenzierung_hinweis) {
      slideExtra.addText('Differenzierungshinweis', { x:0.35, y:yPos, w:9, h:0.4, fontSize:14, bold:true, color: accentHex });
      slideExtra.addText(d.differenzierung_hinweis, { x:0.35, y:yPos+0.4, w:9, h:1.5, fontSize:12, color:'CCDDEE', wrap:true });
    }
  }

  const filename = 'TeachSmarter_' + (d.titel || f.thema || 'Praesentation').replace(/[^a-zA-Z0-9äöüÄÖÜß\s]/g,'').trim() + '.pptx';
  await pptx.writeFile({ fileName: filename });
  _showToast('PowerPoint heruntergeladen ✓', 'ok');
}

function _prPrint() {
  const d = _pr.data; if (!d) return;
  const win = window.open('','_blank','width=900,height=700');
  if (!win) { _showToast('Popup-Blocker aktiv.','error'); return; }
  const fH = (d.folien||[]).map(folie => {
    const col = _PR_TYP_COLORS[folie.typ]||'#555';
    return `<div style="break-inside:avoid;border:1px solid #ccc;border-radius:8px;margin-bottom:1rem;overflow:hidden">
      <div style="background:${col};color:#fff;padding:.4rem .8rem;font-weight:700;display:flex;justify-content:space-between">
        <span>Folie ${folie.nr}: ${folie.titel||''}</span><span style="font-size:.75rem;opacity:.85">${folie.zeit||''}${folie.zeit?' min':''}</span>
      </div>
      <div style="padding:.7rem .85rem">
        <ul style="margin:0 0 .4rem 1rem;padding:0;font-size:.85rem">${(folie.inhalt||[]).map(s=>`<li>${s}</li>`).join('')}</ul>
        ${folie.methode?`<div style="font-size:.75rem;color:#555;border-top:1px solid #eee;padding-top:.4rem;margin-top:.4rem">📌 ${folie.methode}</div>`:''}
        ${folie.lehrerhinweis?`<div style="font-size:.75rem;color:#E67E22;margin-top:.25rem;font-style:italic">🔑 ${folie.lehrerhinweis}</div>`:''}
      </div>
    </div>`;
  }).join('');
  win.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${d.titel||'Präsentation'}</title>
<style>*{box-sizing:border-box}@page{size:A4;margin:1.5cm}body{font-family:Arial,sans-serif;font-size:10pt}h1{font-size:13pt;margin-bottom:.3rem}.lz{background:#e8f5f2;border-left:3px solid #16A085;padding:.4rem .7rem;margin-bottom:1rem;border-radius:0 4px 4px 0}</style></head><body>
<h1>${d.titel||'Präsentation'}</h1>
${d.lernziel?`<div class="lz"><strong>Lernziel:</strong> ${d.lernziel}</div>`:''}
${fH}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}


/* ══════════════════════════════════════════════════════
   DIFFERENZIERUNGSHELFER
   ══════════════════════════════════════════════════════ */

const _DIF_ARTEN = [
  { id:'3niveau',       label:'3 Niveaus',         desc:'Basis · Standard · Experte',        icon:'🎯' },
  { id:'lrs',           label:'LRS-freundlich',     desc:'Vereinfachte Sprache & Struktur',   icon:'👁' },
  { id:'sprachsensibel',label:'Sprachsensibel',     desc:'DaZ / einfache Sprache',            icon:'🗣' },
  { id:'scaffolding',   label:'Scaffolding',        desc:'Schrittweise Gerüste & Hilfen',     icon:'🪜' },
];

const _DIF_LEVEL_CFG = {
  '3niveau':       [
    { key:'basis',    label:'Basis',           sub:'AB I · Reproduktion',          col:'#27AE60', bg:'rgba(39,174,96,.08)'   },
    { key:'standard', label:'Standard',        sub:'AB I–II',                      col:'#2980B9', bg:'rgba(41,128,185,.08)'  },
    { key:'experte',  label:'Experte',         sub:'AB II–III · Reflexion',        col:'#8E44AD', bg:'rgba(142,68,173,.08)'  },
  ],
  'lrs':           [
    { key:'standard',    label:'Standard',        sub:'Original',                     col:'#2980B9', bg:'rgba(41,128,185,.08)'  },
    { key:'lrs',         label:'LRS-Version',     sub:'Vereinfachte Sprache',         col:'#27AE60', bg:'rgba(39,174,96,.08)'   },
    { key:'lrs_geruest', label:'LRS + Gerüst',    sub:'Maximal strukturiert',         col:'#E67E22', bg:'rgba(230,126,34,.08)'  },
  ],
  'sprachsensibel':[
    { key:'standard',    label:'Standard',        sub:'Komplexe Sprache',             col:'#2980B9', bg:'rgba(41,128,185,.08)'  },
    { key:'vereinfacht', label:'Vereinfacht',     sub:'Mittleres Sprachniveau',       col:'#27AE60', bg:'rgba(39,174,96,.08)'   },
    { key:'daz',         label:'DaZ-Version',     sub:'Sehr einfache Sprache',        col:'#E74C3C', bg:'rgba(231,76,60,.08)'   },
  ],
  'scaffolding':   [
    { key:'selbststaendig', label:'Selbstständig',   sub:'Ohne Hilfen',               col:'#8E44AD', bg:'rgba(142,68,173,.08)'  },
    { key:'teilgeruest',    label:'Mit Teilgerüst',  sub:'Schrittweise Hilfen',        col:'#2980B9', bg:'rgba(41,128,185,.08)'  },
    { key:'vollgeruest',    label:'Mit Vollgerüst',  sub:'Vollständig strukturiert',   col:'#27AE60', bg:'rgba(39,174,96,.08)'   },
  ],
};

let _dif = {
  mode: 'form',
  form: { aufgabe:'', fachId:'', jgst:'', kontext:'', foerderbedarf:'', differenzierungsart:'3niveau', klassenIds:[] },
  data: null,
  dbQ: '',
};

function renderToolDifferenzierung() {
  if (!isPremiumUser()) { _toolLockedView('tool-differenzierung'); return; }
  if (_dif.mode === 'output' && _dif.data) { _difShowOutput(); return; }
  _difShowForm();
}

function _difShowForm() {
  const view = document.getElementById('view-tool-differenzierung');
  if (!view) return;
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const f = _dif.form;

  const fachOpts = `<option value="">– Fach –</option>`
    + getAllFaecher().map(fc => `<option value="${esc(fc.id)}"${f.fachId===fc.id?' selected':''}>${esc(fc.name)}</option>`).join('');

  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst===j?' selected':''}>${j}. Klasse</option>`).join('');

  const klassenChecks = (state.klassen||[]).map(kl => `
    <label style="display:flex;align-items:center;gap:.35rem;font-size:.84rem;cursor:pointer;color:var(--ts-text)">
      <input type="checkbox" class="dif-klasse-cb" value="${esc(kl.id)}" ${(f.klassenIds||[]).includes(kl.id)?'checked':''}
        style="width:15px;height:15px;accent-color:var(--ts-teal)"> ${esc(kl.name)}
    </label>`).join('');

  const artPills = _DIF_ARTEN.map(a => `
    <button class="ab-pill${f.differenzierungsart===a.id?' active':''}" onclick="_difSetArt('${a.id}',this)"
      style="display:flex;flex-direction:column;align-items:flex-start;gap:1px;height:auto;padding:.45rem .75rem">
      <span>${a.icon} ${a.label}</span>
      <span style="font-size:.68rem;opacity:.65;font-weight:400">${a.desc}</span>
    </button>`).join('');

  view.innerHTML = `
  <div style="overflow-y:auto;height:100%;padding:var(--sp-lg) var(--sp-xl)">
  <div class="tool-grid">

        <div class="es-section tool-grid-full">
          <div class="es-section-title">Aufgabe / Text</div>
          <div class="es-card">
            <div class="es-field" style="margin-bottom:0">
              <div id="dif-drop-zone"
                style="border:2px dashed var(--ts-border);border-radius:10px;background:var(--ts-bg-warm);transition:border-color .15s,background .15s;cursor:text"
                ondragover="event.preventDefault();this.style.borderColor='var(--ts-teal)';this.style.background='rgba(var(--ts-teal-rgb),.06)'"
                ondragleave="this.style.borderColor='var(--ts-border)';this.style.background='var(--ts-bg-warm)'"
                ondrop="_difHandleDrop(event)">
                <textarea id="dif-aufgabe" class="input"
                  rows="7"
                  placeholder="Text eingeben oder Datei hier hineinziehen (.txt · .pdf · .docx · .odt · .ods …)"
                  style="border:none;background:transparent;resize:vertical;box-shadow:none;padding:.75rem .85rem"
                  >${esc(f.aufgabe||'')}</textarea>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;margin-top:.5rem">
                <button class="btn btn-ghost" style="height:auto;padding:3px 10px;font-size:.78rem;min-height:0;width:auto"
                  onclick="_difUploadFile()">📂 Datei laden</button>
                <span style="font-size:.74rem;color:var(--ts-text-muted)">.txt · .pdf · .docx · .odt · .ods — oder per Drag &amp; Drop</span>
              </div>
              <input type="file" id="dif-file-input"
                accept=".txt,text/plain,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.odt,.ods,.odp,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet"
                style="display:none" onchange="_difReadFile(this)">
            </div>
          </div>
        </div>

        <div class="es-section">
          <div class="es-section-title">Differenzierungsart</div>
          <div class="es-card">
            <div class="es-field" style="margin-bottom:0">
              <div class="ab-pills" style="flex-wrap:wrap;gap:.5rem">${artPills}</div>
            </div>
          </div>
        </div>

        <div class="es-section">
          <div class="es-section-title">Kontext</div>
          <div class="es-card">
            <div class="es-field-row">
              <div class="es-field" style="flex:1">
                <label class="es-label">Fach</label>
                <select id="dif-fach-select" class="input">${fachOpts}</select>
              </div>
              <div class="es-field" style="flex:1">
                <label class="es-label">Jahrgangsstufe</label>
                <select id="dif-jgst" class="input"><option value="">– wählen –</option>${jgstOpts}</select>
              </div>
            </div>
            ${klassenChecks ? `<div class="es-field">
              <label class="es-label">Klassen <span style="font-weight:400;opacity:.6">(optional)</span></label>
              <div style="display:flex;flex-wrap:wrap;gap:.4rem .9rem;margin-top:.3rem">${klassenChecks}</div>
            </div>` : ''}
            <div class="es-field">
              <label class="es-label">Unterrichtskontext <span style="font-weight:400;opacity:.6">(optional)</span></label>
              <input id="dif-kontext" class="input" placeholder="z.B. Ende der Sequenz" value="${esc(f.kontext||'')}">
            </div>
            <div class="es-field" style="margin-bottom:0">
              <label class="es-label">Förderbedarf <span style="font-weight:400;opacity:.6">(optional)</span></label>
              <input id="dif-foerderbedarf" class="input" placeholder="z.B. 3 SuS mit LRS" value="${esc(f.foerderbedarf||'')}">
            </div>
          </div>
        </div>

  </div><!-- /tool-grid -->
  ${isPremium ? `
  <div class="es-section" style="margin-top:var(--sp-lg)">
    <div class="es-section-title" style="display:flex;align-items:center;gap:.5rem">
      Erweiterte Optionen
      <span style="font-size:.68rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:2px 8px;border-radius:20px;font-weight:700">✦ PREMIUM</span>
    </div>
    <div class="es-card">
      <div class="es-hint">✓ Musterlösungen · ✓ Förderempfehlungen · ✓ Methodischer Einsatztipp</div>
    </div>
  </div>` : `
  <div style="margin-top:var(--sp-md);padding:.65rem .9rem;background:var(--ts-bg-warm);border-radius:8px;font-size:.82rem;color:var(--ts-text-secondary);border:1px solid var(--ts-border-light)">
    ✦ Musterlösungen & Förderempfehlungen mit
    <a href="${TS_STRIPE_ABO_29}" target="_blank" style="color:var(--ts-teal);text-decoration:none;font-weight:600">Abo oder Gründeredition</a>
  </div>`}
  <div class="es-section" style="margin-top:var(--sp-lg)">
    <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generateDifferenzierung()">
      <span id="dif-btn-txt">Differenzieren · 2 Credits</span>
    </button>
  </div>
  </div>`;
}

/* ── Lazy Loaders ── */
function _loadScript(url, check) {
  if (check()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = () => reject(new Error(`Konnte ${url} nicht laden.`));
    document.head.appendChild(s);
  });
}

function _loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('PDF.js konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

function _loadMammoth() {
  return _loadScript(
    'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    () => !!window.mammoth
  );
}

function _loadJSZip() {
  return _loadScript(
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    () => !!window.JSZip
  );
}

/* ── Text-Extraktoren ── */
async function _difExtractPdf(file) {
  const lib = await _loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
    if (text.length > 8000) break;
  }
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

async function _difExtractDocx(file) {
  await _loadMammoth();
  await _loadJSZip();
  const buf = await file.arrayBuffer();

  // Versuch 1: mammoth extractRawText (buf klonen da ArrayBuffer ggf. verbraucht wird)
  let text = '';
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buf.slice(0) });
    text = (result.value || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch(e) {}

  // Versuch 2: mammoth convertToHtml
  if (!text) {
    try {
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buf.slice(0) });
      text = (htmlResult.value || '')
        .replace(/<\/p>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n').trim();
    } catch(e) {}
  }

  // Versuch 3: direkt word/document.xml aus ZIP lesen (wie ODT)
  if (!text) {
    try {
      const zip = await JSZip.loadAsync(buf.slice(0));
      const xmlFile = zip.file('word/document.xml');
      if (xmlFile) {
        const xml = await xmlFile.async('string');
        text = xml
          .replace(/<\/w:p>/g, '\n').replace(/<\/w:tr>/g, '\n')
          .replace(/<w:tab[^>]*\/>/g, '\t')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      }
    } catch(e) {}
  }

  return text.slice(0, 6000);
}

async function _difExtractOdt(file) {
  await _loadJSZip();
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xmlFile = zip.file('content.xml');
  if (!xmlFile) throw new Error('content.xml nicht gefunden (kein gültiges ODT/ODS/ODP).');
  const xml = await xmlFile.async('string');
  // Namespace-sichere Extraktion: XML-Tags entfernen, nur Text behalten
  const text = xml
    .replace(/<text:s[^>]*\/>/g, ' ')           // Leerzeichen-Tags
    .replace(/<text:tab[^>]*\/>/g, '\t')         // Tabs
    .replace(/<text:line-break[^>]*\/>/g, '\n')  // Zeilenumbrüche
    .replace(/<\/text:p>/g, '\n')                // Absatzenden → Zeilenumbruch
    .replace(/<\/text:h>/g, '\n')                // Überschriften
    .replace(/<[^>]+>/g, '')                     // alle übrigen Tags entfernen
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, 6000);
}

/* ── Drag & Drop helper ── */
function _difHandleDrop(event) {
  event.preventDefault();
  const zone = document.getElementById('dif-drop-zone');
  if (zone) { zone.style.borderColor = 'var(--ts-border)'; zone.style.background = 'var(--ts-bg-warm)'; }
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  _difLoadFile(file);
}

function _difUploadFile() { document.getElementById('dif-file-input')?.click(); }

function _difReadFile(input) {
  const file = input.files[0];
  if (!file) return;
  _difLoadFile(file);
  input.value = '';
}

async function _difLoadFile(file) {
  const name = file.name.toLowerCase();
  const isPdf  = name.endsWith('.pdf');
  const isDocx = name.endsWith('.docx');
  const isDoc  = name.endsWith('.doc');
  const isOdt  = name.endsWith('.odt') || name.endsWith('.ods') || name.endsWith('.odp') || name.endsWith('.odg');
  const isTxt  = name.endsWith('.txt') || file.type.startsWith('text/');

  if (!isPdf && !isDocx && !isDoc && !isOdt && !isTxt) {
    _showToast('Format nicht unterstützt. Bitte .txt, .pdf, .docx, .doc oder .odt/.ods verwenden.', 'error');
    return;
  }

  const ta = document.getElementById('dif-aufgabe');
  if (ta) { ta.disabled = true; ta.value = ''; ta.placeholder = '⏳ Wird geladen…'; }

  try {
    let text = '';
    if (isPdf)       text = await _difExtractPdf(file);
    else if (isDocx) text = await _difExtractDocx(file);
    else if (isDoc)  throw new Error('.doc-Dateien (altes Word-Format) werden leider nicht unterstützt. Bitte in Word über „Speichern unter" als .docx speichern und erneut laden.');
    else if (isOdt)  text = await _difExtractOdt(file);
    else {
      text = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve((e.target.result || '').slice(0, 6000));
        r.onerror = reject;
        r.readAsText(file, 'UTF-8');
      });
    }
    if (!text.trim()) throw new Error('Kein Text gefunden. Mögliche Ursachen: Datei ist passwortgeschützt, enthält nur Bilder/Scans, oder ist beschädigt. Bitte als .txt kopieren und einfügen.');
    if (ta) { ta.value = text; ta.disabled = false; ta.placeholder = ''; _dif.form.aufgabe = text; }
    _showToast(`"${file.name}" geladen ✓`, 'ok');
  } catch (err) {
    if (ta) { ta.disabled = false; ta.placeholder = ''; }
    _showToast(err.message || 'Datei konnte nicht gelesen werden.', 'error');
  }
}

function _difSetArt(id, btn) {
  _dif.form.differenzierungsart = id;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function generateDifferenzierung() {
  const aufgabe = document.getElementById('dif-aufgabe')?.value.trim();
  if (!aufgabe) { _showToast('Bitte Text eingeben oder eine Datei laden.', 'error'); return; }
  const f = _dif.form;
  f.aufgabe       = aufgabe;
  f.fachId        = document.getElementById('dif-fach-select')?.value || '';
  f.jgst          = document.getElementById('dif-jgst')?.value || '';
  f.klassenIds    = [...document.querySelectorAll('.dif-klasse-cb:checked')].map(cb => cb.value);
  f.kontext       = document.getElementById('dif-kontext')?.value.trim() || '';
  f.foerderbedarf = document.getElementById('dif-foerderbedarf')?.value.trim() || '';
  const fachObj   = getAllFaecher().find(fc => fc.id === f.fachId);
  const fach      = fachObj ? fachObj.name : '';
  const btn = document.getElementById('dif-btn-txt');
  if (btn) btn.textContent = '⏳ Differenziere…';
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const result = await callKI('differenzierung', {
    aufgabe: f.aufgabe, fach, jgst: f.jgst,
    kontext: f.kontext, foerderbedarf: f.foerderbedarf,
    differenzierungsart: f.differenzierungsart || '3niveau',
    schulart: state.schulart||'', bundesland: state.bundesland||'',
    premium: isPremium,
  });
  if (!result) { if (btn) btn.textContent = 'Differenzieren · 2 Credits'; return; }
  _dif.data = result; _dif.mode = 'output'; _difShowOutput();
}

function _difShowOutput() {
  const view = document.getElementById('view-tool-differenzierung');
  if (!view) return;
  const d = _dif.data;
  if (!d) { _difBackToForm(); return; }
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const art = _dif.form.differenzierungsart || '3niveau';
  const nCfg = _DIF_LEVEL_CFG[art] || _DIF_LEVEL_CFG['3niveau'];

  const nCards = nCfg.map(cfg => {
    const n = (d.niveaus||{})[cfg.key]||{};
    return `<div style="border:1.5px solid ${cfg.col};border-radius:10px;overflow:hidden;margin-bottom:1rem">
      <div style="background:${cfg.col};color:#fff;padding:.5rem 1rem;display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:.9rem">${cfg.label}</div>
        <div style="font-size:.72rem;opacity:.85">${cfg.sub}</div>
      </div>
      <div style="background:${cfg.bg};padding:.85rem 1rem">
        <div style="font-size:.88rem;color:var(--ts-text);white-space:pre-line;line-height:1.55">${esc(n.aufgabe||'')}</div>
        ${n.glossar&&n.glossar.length?`<div style="margin-top:.6rem;background:rgba(255,255,255,.7);border-left:3px solid ${cfg.col};padding:.45rem .7rem;border-radius:0 6px 6px 0;font-size:.8rem;color:var(--ts-text)"><strong>📖 Glossar:</strong><ul style="margin:.3rem 0 0 1rem;padding:0">${n.glossar.map(g=>`<li>${esc(g)}</li>`).join('')}</ul></div>`:''}
        ${n.tipp?`<div style="margin-top:.6rem;background:rgba(255,255,255,.7);border-left:3px solid ${cfg.col};padding:.45rem .7rem;border-radius:0 6px 6px 0;font-size:.8rem;color:var(--ts-text-secondary)">💡 ${esc(n.tipp)}</div>`:''}
        ${isPremium&&n.loesung?`<div style="margin-top:.6rem;background:rgba(255,255,255,.7);border-left:3px solid #555;padding:.45rem .7rem;border-radius:0 6px 6px 0;font-size:.8rem;color:var(--ts-text)"><strong>Lösung:</strong> ${esc(n.loesung)}</div>`:''}
      </div>
    </div>`;
  }).join('');

  const originalText = esc(_dif.form.aufgabe || '');
  const artLabel = _DIF_ARTEN.find(a => a.id === art)?.label || 'Differenzierung';

  view.innerHTML = `
  <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

    <!-- Toolbar -->
    <div style="flex-shrink:0;padding:.75rem 1rem;border-bottom:1px solid var(--ts-border);display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;background:var(--ts-bg)">
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_difBackToForm()">← Zurück</button>
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_difPrint()">🖨️ Drucken</button>
      <div style="flex:1"></div>
      <div style="font-family:var(--font-display);font-size:.95rem;font-weight:700;color:var(--ts-text)">${esc(d.thema||'Differenzierte Aufgabe')}</div>
      <div style="font-size:.75rem;color:var(--ts-text-muted);padding:.2rem .6rem;background:var(--ts-bg-warm);border-radius:20px;border:1px solid var(--ts-border)">${artLabel}</div>
    </div>

    <!-- Split-Ansicht -->
    <div style="flex:1;overflow:hidden;display:grid;grid-template-columns:1fr 1fr;gap:0">

      <!-- Links: Original -->
      <div style="overflow-y:auto;border-right:1px solid var(--ts-border);padding:1rem 1.1rem 3rem">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;color:var(--ts-text-muted);text-transform:uppercase;margin-bottom:.6rem">Original</div>
        <div style="font-size:.87rem;color:var(--ts-text);white-space:pre-wrap;line-height:1.65;background:var(--ts-bg-warm);border-radius:8px;padding:.85rem 1rem;border:1px solid var(--ts-border)">${originalText||'<span style="color:var(--ts-text-muted);font-style:italic">Kein Text gespeichert.</span>'}</div>
      </div>

      <!-- Rechts: Differenzierte Niveaus -->
      <div style="overflow-y:auto;padding:1rem 1.1rem 3rem">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;color:var(--ts-text-muted);text-transform:uppercase;margin-bottom:.6rem">Differenzierung</div>
        ${nCards}
        ${isPremium&&d.foerdertipps?`<div style="border:1px solid var(--ts-border);border-radius:10px;padding:.8rem 1rem;margin-top:.5rem;background:var(--ts-bg)"><div style="font-size:.7rem;font-weight:700;color:#27AE60;margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.06em">Förderempfehlungen</div><div style="font-size:.84rem;color:var(--ts-text)">${esc(d.foerdertipps)}</div></div>`:''}
        ${isPremium&&d.differenzierung_hinweis?`<div style="border:1px solid var(--ts-border);border-radius:10px;padding:.8rem 1rem;margin-top:.6rem;background:var(--ts-bg)"><div style="font-size:.7rem;font-weight:700;color:#2980B9;margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.06em">Methodischer Einsatztipp</div><div style="font-size:.84rem;color:var(--ts-text)">${esc(d.differenzierung_hinweis)}</div></div>`:''}
      </div>

    </div>
  </div>`;
}

function _difBackToForm() { _dif.mode = 'form'; _difShowForm(); }

function _difPrint() {
  const d = _dif.data; if (!d) return;
  const win = window.open('','_blank','width=900,height=700');
  if (!win) { _showToast('Popup-Blocker aktiv.','error'); return; }
  const art = _dif.form.differenzierungsart || '3niveau';
  const nCfg = _DIF_LEVEL_CFG[art] || _DIF_LEVEL_CFG['3niveau'];
  const original = _dif.form.aufgabe || '';

  const cards = nCfg.map(cfg => {
    const n = (d.niveaus||{})[cfg.key]||{};
    return `<div style="break-inside:avoid;border:1.5px solid ${cfg.col};border-radius:8px;margin-bottom:1rem;overflow:hidden">
      <div style="background:${cfg.col};color:#fff;padding:.4rem .8rem;font-weight:700;display:flex;justify-content:space-between">
        <span>${cfg.label}</span><span style="font-size:.75em;opacity:.85">${cfg.sub}</span>
      </div>
      <div style="padding:.7rem .85rem">
        <div style="font-size:.88rem;white-space:pre-wrap">${n.aufgabe||''}</div>
        ${n.glossar&&n.glossar.length?`<div style="margin-top:.5rem;border-left:3px solid ${cfg.col};padding:.35rem .6rem;font-size:.78rem"><strong>Glossar:</strong><ul style="margin:.3rem 0 0 1rem;padding:0">${n.glossar.map(g=>`<li>${g}</li>`).join('')}</ul></div>`:''}
        ${n.tipp?`<div style="margin-top:.5rem;border-left:3px solid ${cfg.col};padding:.35rem .6rem;font-size:.8rem;color:#555">💡 ${n.tipp}</div>`:''}
        ${n.loesung?`<div style="margin-top:.5rem;border-left:3px solid #555;padding:.35rem .6rem;font-size:.8rem"><strong>Lösung:</strong> ${n.loesung}</div>`:''}
      </div>
    </div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Differenzierte Aufgabe</title>
<style>*{box-sizing:border-box}@page{size:A4;margin:1.5cm}body{font-family:Arial,sans-serif;font-size:10pt}
h1{font-size:12pt;margin-bottom:.4rem}.orig{background:#f7f7f7;border-radius:6px;padding:.6rem .8rem;font-size:.88em;white-space:pre-wrap;margin-bottom:1.2rem;border:1px solid #ddd}
.lbl{font-size:.7em;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.06em;margin-bottom:.25rem}</style></head><body>
<h1>${d.thema||'Differenzierte Aufgabe'}</h1>
${original?`<div class="lbl">Original</div><div class="orig">${original}</div>`:''}
<div class="lbl">Differenzierung</div>
${cards}
${d.foerdertipps?`<div style="border:1px solid #ccc;border-radius:6px;padding:.6rem .8rem;margin-top:.5rem"><strong>Förderempfehlungen:</strong><br>${d.foerdertipps}</div>`:''}
${d.differenzierung_hinweis?`<div style="border:1px solid #ccc;border-radius:6px;padding:.6rem .8rem;margin-top:.5rem"><strong>Einsatztipp:</strong><br>${d.differenzierung_hinweis}</div>`:''}
<script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}


/* ══════════════════════════════════════════════════════
   INTERAKTIVE ARBEITSBLÄTTER (HTML5)
   ══════════════════════════════════════════════════════ */

const _IV_TYPES = [
  { id:'quiz',        icon:'🎯', label:'Quiz',         desc:'Multiple Choice mit Sofort-Feedback & Punktzahl' },
  { id:'lueckentext', icon:'✏️', label:'Lückentext',   desc:'Lücken füllen mit Wortbank & Dropdown' },
  { id:'zuordnung',   icon:'🔗', label:'Zuordnung',    desc:'Begriffe & Definitionen per Drag & Drop zuordnen' },
  { id:'memory',      icon:'🃏', label:'Memory-Spiel', desc:'Begriffe & Definitionen als Karten-Memory' },
  { id:'karteikarten',icon:'📇', label:'Karteikarten', desc:'Flip-Karten mit Selbstbewertung & Lernfortschritt' },
];

// Umfang-Konfiguration: items = Anzahl Fragen/Karten/Vokabeln
const _IV_UMFANG = [
  { id:'s', label:'Klein',       items:5,  credits:2, desc:'~5 Aufgaben · ca. 5 Min' },
  { id:'m', label:'Standard',    items:10, credits:3, desc:'~10 Aufgaben · ca. 10 Min' },
  { id:'l', label:'Groß',        items:15, credits:5, desc:'~15 Aufgaben · ca. 15 Min' },
  { id:'xl',label:'Sehr groß',   items:20, credits:8, desc:'~20 Aufgaben · ca. 20 Min' },
];

let _iv = {
  mode: 'form',
  form: { thema:'', fachId:'', jgst:'', typ:'quiz', niveau:'standard', kontext:'', umfang:'m' },
  data: null,
};

function renderToolInteraktiv() {
  if (!isPremiumUser()) { _toolLockedView('tool-interaktiv'); return; }
  if (_iv.mode === 'output' && _iv.data) { _ivShowOutput(); return; }
  _ivShowForm();
}

function _ivShowForm() {
  const view = document.getElementById('view-tool-interaktiv');
  if (!view) return;
  const f = _iv.form;
  const isPremium = window.isPremiumUser && window.isPremiumUser();

  const fachOpts = `<option value="">– Fach –</option>`
    + getAllFaecher().map(fc => `<option value="${esc(fc.id)}"${f.fachId===fc.id?' selected':''}>${esc(fc.name)}</option>`).join('');
  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst===j?' selected':''}>${j}. Klasse</option>`).join('');

  const typPills = _IV_TYPES.map(t => `
    <button class="ab-pill${f.typ===t.id?' active':''}" onclick="_ivSetTyp('${t.id}',this)"
      style="display:flex;flex-direction:column;align-items:flex-start;gap:1px;height:auto;padding:.45rem .75rem">
      <span>${t.icon} ${t.label}</span>
      <span style="font-size:.66rem;opacity:.6;font-weight:400">${t.desc}</span>
    </button>`).join('');


  view.innerHTML = `
  <div style="overflow-y:auto;height:100%;padding:var(--sp-lg) var(--sp-xl)">
  <div class="tool-grid">

    <div class="es-section tool-grid-full">
      <div class="es-section-title">Art des interaktiven Arbeitsblatts</div>
      <div class="es-card">
        <div class="es-field" style="margin-bottom:0">
          <div class="ab-pills" style="flex-wrap:wrap;gap:.4rem">${typPills}</div>
        </div>
      </div>
    </div>

    <div class="es-section">
      <div class="es-section-title">Inhalt</div>
      <div class="es-card">
        <div class="es-field">
          <label class="es-label">Thema *</label>
          <input id="iv-thema" class="input" placeholder="z.B. Photosynthese, Bruchrechnung, Französische Revolution…" value="${esc(f.thema||'')}">
        </div>
        <div class="es-field-row">
          <div class="es-field" style="flex:1">
            <label class="es-label">Fach</label>
            <select id="iv-fach" class="input">${fachOpts}</select>
          </div>
          <div class="es-field" style="flex:1">
            <label class="es-label">Jahrgangsstufe</label>
            <select id="iv-jgst" class="input"><option value="">– wählen –</option>${jgstOpts}</select>
          </div>
        </div>
        <div class="es-field" style="margin-bottom:0">
          <label class="es-label">Inhalt / Kontext <span style="font-weight:400;opacity:.6">(optional — Text, Vokabeln, Aufgaben)</span></label>
          <textarea id="iv-kontext" class="input" rows="4" placeholder="Stichpunkte, Vokabelliste, Fachbegriffe oder ganzer Text — die KI passt das Arbeitsblatt darauf an…" style="resize:vertical">${esc(f.kontext||'')}</textarea>
        </div>
      </div>
    </div>

    <div class="es-section">
      <div class="es-section-title">Optionen</div>
      <div class="es-card">
        <div class="es-field">
          <label class="es-label">Niveau</label>
          <div class="ab-pills">
            <button class="ab-pill${f.niveau==='basis'?' active':''}" onclick="_ivSetNiveau('basis',this)">🟢 Basis</button>
            <button class="ab-pill${f.niveau==='standard'?' active':''}" onclick="_ivSetNiveau('standard',this)">🔵 Standard</button>
            <button class="ab-pill${f.niveau==='experte'?' active':''}" onclick="_ivSetNiveau('experte',this)">🟣 Experte</button>
          </div>
        </div>
        <div class="es-field" style="margin-bottom:0">
          <label class="es-label">Umfang</label>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem">
            ${_IV_UMFANG.map(u => `
            <button id="iv-umfang-${u.id}" onclick="_ivSetUmfang('${u.id}')"
              style="border:1.5px solid ${f.umfang===u.id?'var(--ts-teal)':'var(--ts-border)'};border-radius:8px;padding:.6rem .5rem;background:${f.umfang===u.id?'rgba(var(--ts-teal-rgb),.08)':'var(--ts-bg)'};cursor:pointer;text-align:center;transition:all .15s">
              <div style="font-weight:700;font-size:.88rem;color:${f.umfang===u.id?'var(--ts-teal)':'var(--ts-text)'}">${u.label}</div>
              <div style="font-size:.68rem;color:var(--ts-text-muted);margin-top:2px">${u.desc}</div>
              <div style="font-size:.72rem;font-weight:600;color:${f.umfang===u.id?'var(--ts-teal)':'var(--ts-text-secondary)'};margin-top:4px">${u.credits} Credits</div>
            </button>`).join('')}
          </div>
        </div>
      </div>
    </div>

  </div><!-- /tool-grid -->
  <div class="es-section" style="margin-top:var(--sp-lg)">
    <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generateInteraktiv()">
      <span id="iv-btn-txt">⚡ Erstellen · ${(_IV_UMFANG.find(u=>u.id===f.umfang)||_IV_UMFANG[1]).credits} Credits</span>
    </button>
  </div>
  </div>`;
}

function _ivSetTyp(id, btn) {
  _iv.form.typ = id;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _ivSetNiveau(id, btn) {
  _iv.form.niveau = id;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _ivSetUmfang(id) {
  _iv.form.umfang = id;
  const cfg = _IV_UMFANG.find(u => u.id === id) || _IV_UMFANG[1];
  _IV_UMFANG.forEach(u => {
    const el = document.getElementById('iv-umfang-' + u.id);
    if (!el) return;
    const active = u.id === id;
    el.style.borderColor = active ? 'var(--ts-teal)' : 'var(--ts-border)';
    el.style.background  = active ? 'rgba(var(--ts-teal-rgb),.08)' : 'var(--ts-bg)';
    el.querySelector('div').style.color = active ? 'var(--ts-teal)' : 'var(--ts-text)';
  });
  const btn = document.getElementById('iv-btn-txt');
  if (btn) btn.textContent = `⚡ Erstellen · ${cfg.credits} Credits`;
}

async function generateInteraktiv() {
  const thema = document.getElementById('iv-thema')?.value.trim();
  if (!thema) { _showToast('Bitte ein Thema eingeben.', 'error'); return; }
  const f = _iv.form;
  f.thema   = thema;
  f.fachId  = document.getElementById('iv-fach')?.value || '';
  f.jgst    = document.getElementById('iv-jgst')?.value || '';
  f.kontext = document.getElementById('iv-kontext')?.value.trim() || '';
  const fachObj = getAllFaecher().find(fc => fc.id === f.fachId);
  const fach = fachObj ? fachObj.name : '';
  const btn = document.getElementById('iv-btn-txt');
  if (btn) btn.textContent = '⏳ Erstelle interaktives Arbeitsblatt…';
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const umfangCfg = _IV_UMFANG.find(u => u.id === f.umfang) || _IV_UMFANG[1];
  const result = await callKI('interaktiv', {
    thema: f.thema, fach, jgst: f.jgst, typ: f.typ,
    niveau: f.niveau, kontext: f.kontext,
    umfang: f.umfang, items: umfangCfg.items,
    schulart: state.schulart||'', bundesland: state.bundesland||'',
    premium: isPremium,
  }, umfangCfg.credits);
  if (!result) { if (btn) btn.textContent = `⚡ Erstellen · ${umfangCfg.credits} Credits`; return; }
  _iv.data = result; _iv.mode = 'output'; _ivShowOutput();
}

function _ivShowOutput() {
  const view = document.getElementById('view-tool-interaktiv');
  if (!view) return;
  const d = _iv.data;
  if (!d?.html) { _ivBackToForm(); return; }
  const typCfg = _IV_TYPES.find(t => t.id === (_iv.form.typ || d.typ)) || _IV_TYPES[0];

  view.innerHTML = `
  <div style="display:flex;flex-direction:column;height:calc(100dvh - var(--header-h));overflow:hidden;margin:calc(-1 * var(--sp-lg)) calc(-1 * var(--sp-xl))">
    <div style="flex-shrink:0;padding:.7rem 1rem;border-bottom:1px solid var(--ts-border);display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;background:var(--ts-bg)">
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_ivBackToForm()">← Zurück</button>
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_ivOpenNew()">↗ Öffnen</button>
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_ivSaveToDb()">💾 Speichern</button>
      <div style="flex:1"></div>
      <div style="font-family:var(--font-display);font-size:.92rem;font-weight:700;color:var(--ts-text)">${esc(d.titel||_iv.form.thema)}</div>
      <div style="font-size:.73rem;color:var(--ts-text-muted);padding:.2rem .55rem;background:var(--ts-bg-warm);border-radius:20px;border:1px solid var(--ts-border)">${typCfg.icon} ${typCfg.label}</div>
    </div>
    <div style="flex:1;overflow:hidden">
      <iframe id="iv-preview-frame" sandbox="allow-scripts allow-forms"
        style="width:100%;height:100%;border:none;display:block"></iframe>
    </div>
  </div>`;

  // Iframe befüllen
  const frame = document.getElementById('iv-preview-frame');
  if (frame) {
    frame.srcdoc = d.html;
    frame.onerror = () => console.error('[TeachSmarter] iframe render error');
    frame.onload = () => {
      try {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (doc && doc.body && doc.body.innerHTML.trim() === '') {
          console.error('[TeachSmarter] iframe loaded but body is empty. HTML length:', d.html.length);
        }
      } catch(e) {}
    };
  }
}

function _ivOpenNew() {
  const html = _iv.data?.html; if (!html) return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function _ivSaveToDb() {
  const d = _iv.data; if (!d?.html || typeof getMediaDb !== 'function') return;
  const f = _iv.form;
  const fachObj = getAllFaecher().find(fc => fc.id === f.fachId);
  const name = d.titel || f.thema || 'Interaktives Arbeitsblatt';
  const typCfg = _IV_TYPES.find(t => t.id === f.typ) || _IV_TYPES[0];
  const db = getMediaDb();
  const item = {
    id: 'iv_' + Date.now(),
    name,
    type: 'html',
    content: d.html,
    tags: ['interaktiv', f.typ],
    isTafelbild: false,
    fachId: f.fachId || null,
    fachName: fachObj?.name || '',
    jgst: f.jgst || '',
    createdAt: new Date().toISOString(),
  };
  db.push(item);
  await saveMediaDb(db);
  _showToast(`"${name}" in der Materialdatenbank gespeichert ✓`, 'ok');
}

function _ivBackToForm() { _iv.mode = 'form'; _ivShowForm(); }


/* ══════════════════════════════════════════════════════
   ELTERNBRIEF-ASSISTENT
   ══════════════════════════════════════════════════════ */

let _eb = { mode: 'form', form: { anlass: 'info', ruecklauf: false, ton: 'freundlich' }, data: null };

function renderToolElternbrief() {
  if (!isPremiumUser()) { _toolLockedView('tool-elternbrief'); return; }
  if (_eb.mode === 'output' && _eb.data) { _ebShowOutput(); return; }
  _ebShowForm();
}

function _ebShowForm() {
  const el = document.getElementById('view-tool-elternbrief');
  if (!el) return;
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  const f = _eb.form;
  el.innerHTML = `
  <div>

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem">
      <div style="font-size:2rem">✉️</div>
      <div>
        <div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--ts-text)">Elternbrief-Assistent</div>
        <div style="font-size:.82rem;color:var(--ts-text-secondary)">Fertige Elternbriefe mit optionalem Rücklaufzettel</div>
      </div>
    </div>
      <!-- DSGVO-Hinweis -->
      <div style="border:1.5px solid #E8A020;border-radius:10px;background:rgba(232,160,32,.07);margin-bottom:1.25rem">
        <div style="padding:.75rem 1rem;display:flex;align-items:flex-start;gap:.65rem">
          <div style="font-size:1.1rem;flex-shrink:0">🔒</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.82rem;font-weight:700;color:#B07010;margin-bottom:.5rem">DSGVO-Konformität — so funktioniert es</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:.3rem .65rem;font-size:.79rem;color:var(--ts-text);line-height:1.5">
              <span style="color:#B07010;font-weight:700">1.</span><span>Gib <strong>keine echten Namen</strong>, Noten oder Verhaltensbeschreibungen ein</span>
              <span style="color:#B07010;font-weight:700">2.</span><span>TeachSmarter ersetzt automatisch alle Lücken mit <code style="background:rgba(0,0,0,.08);padding:.05rem .3rem;border-radius:3px">[Platzhalter]</code></span>
              <span style="color:#B07010;font-weight:700">3.</span><span>Du ersetzt die Platzhalter <strong>lokal</strong> in deiner Textverarbeitung — nie durch die App</span>
              <span style="color:#B07010;font-weight:700">4.</span><span>Prüfe den Brief vor dem Versand — du trägst die rechtliche Verantwortung</span>
            </div>
            <button onclick="(function(b,d){var o=d.style.display==='none';d.style.display=o?'block':'none';b.textContent=o?'Rechtliche Details ▴':'Rechtliche Details ▾'})(this,document.getElementById('eb-dsgvo-details'))" style="background:none;border:none;color:#B07010;font-size:.76rem;cursor:pointer;padding:.45rem 0 0;font-weight:600">Rechtliche Details ▾</button>
          </div>
        </div>
        <div id="eb-dsgvo-details" style="display:none;padding:0 1rem 1rem;font-size:.77rem;color:var(--ts-text);line-height:1.6;border-top:1px solid rgba(232,160,32,.2)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.75rem">
            <div>
              <div style="font-weight:700;color:#B07010;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:.35rem">EU AI Act – Fristen</div>
              <ul style="margin:0;padding:0 0 0 1rem;list-style:disc">
                <li><strong>Feb. 2025</strong>: KI-Kompetenzpflicht; Emotionserkennung verboten</li>
                <li><strong>Aug. 2025</strong>: Transparenzpflicht für Sprachmodelle (GPAI)</li>
                <li><strong>Aug. 2026</strong>: Bewertungs-KI = Hochrisiko, Dokumentationspflicht</li>
              </ul>
            </div>
            <div>
              <div style="font-weight:700;color:#B07010;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;margin-bottom:.35rem">Länderlösungen</div>
              <ul style="margin:0;padding:0 0 0 1rem;list-style:disc">
                <li><strong>BW</strong>: „F13" auf SCHULE@BW</li>
                <li><strong>Bayern</strong>: „telli" &amp; ByCS</li>
                <li><strong>NRW</strong>: „telli" ab Dez. 2025</li>
                <li><strong>RLP/Sachsen</strong>: fobizz-Lizenzen</li>
              </ul>
            </div>
          </div>
          <div style="margin-top:.65rem;padding:.5rem .65rem;background:rgba(232,160,32,.1);border-radius:6px;font-size:.76rem">
            <strong>DSGVO-Grundregel:</strong> Eingabe personenbezogener Daten (Namen, Noten, Verhalten) in nicht-zertifizierte KI-Tools ist untersagt. TeachSmarter ist DSGVO-konform — keine Trainingsdaten, kein Cloudspeicher persönlicher Informationen.
          </div>
        </div>
      </div>

    <!-- Anlass: volle Breite -->
    <div class="es-section">
      <div class="es-section-title">Anlass</div>
      <div class="es-card">
        <div class="es-field" style="margin-bottom:0">
          <div class="ab-pills" id="eb-anlass-pills">
            <button class="ab-pill${f.anlass==='info'?' active':''}" onclick="_ebPill('anlass','info',this)">Information</button>
            <button class="ab-pill${f.anlass==='ausflug'?' active':''}" onclick="_ebPill('anlass','ausflug',this)">Ausflug</button>
            <button class="ab-pill${f.anlass==='klassenfahrt'?' active':''}" onclick="_ebPill('anlass','klassenfahrt',this)">Klassenfahrt</button>
            <button class="ab-pill${f.anlass==='veranstaltung'?' active':''}" onclick="_ebPill('anlass','veranstaltung',this)">Veranstaltung</button>
            <button class="ab-pill${f.anlass==='sonstiges'?' active':''}" onclick="_ebPill('anlass','sonstiges',this)">Sonstiges</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zwei Spalten: Inhalt | Einstellungen -->
    <div class="tool-grid">

      <!-- Linke Spalte: Inhaltliche Angaben -->
      <div class="es-section">
        <div class="es-section-title">Inhalt</div>
        <div class="es-card">
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Klasse *</label>
              <input id="eb-klasse" class="input" type="text" placeholder="z.B. 7b" value="${esc(f.klasse||'')}">
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Datum des Ereignisses</label>
              <input id="eb-datum" class="input" type="text" placeholder="z.B. 15.05.2026" value="${esc(f.datum_ereignis||'')}">
            </div>
          </div>
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Details / Inhalt * <span style="font-weight:400;text-transform:none;font-size:.72rem;color:var(--ts-error,#c0392b)">— Keine Namen oder Noten!</span></label>
            <textarea id="eb-details" class="input" rows="6"
              placeholder="Sachliche Infos: Ort, Zeit, Programm, Treffpunkt, Kosten…&#10;Keine Namen, Noten oder persönliche Angaben!"
              oninput="_ebCheckPersonalData(this.value)"
              style="resize:vertical">${esc(f.details||'')}</textarea>
            <div id="eb-personal-warn" style="display:none;margin-top:.3rem;padding:.35rem .6rem;background:rgba(212,87,78,.1);border-left:3px solid #D4574E;border-radius:0 5px 5px 0;font-size:.77rem;color:#D4574E">
              Mögliche Namens- oder Personendaten erkannt — entferne diese oder nutze [Vorname].
            </div>
          </div>
        </div>
      </div>

      <!-- Rechte Spalte: Einstellungen -->
      <div class="es-section">
        <div class="es-section-title">Einstellungen</div>
        <div class="es-card">
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Rücklauf-Frist</label>
              <input id="eb-frist" class="input" type="text" placeholder="z.B. 08.05.2026" value="${esc(f.frist||'')}">
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Kosten</label>
              <input id="eb-kosten" class="input" type="text" placeholder="z.B. 5,00 €" value="${esc(f.kosten||'')}">
            </div>
          </div>
          <div class="es-field">
            <div style="display:flex;align-items:center;gap:.75rem;padding:.3rem 0">
              <span style="width:40px;height:22px;background:${f.ruecklauf?'var(--ts-teal)':'var(--ts-border)'};border-radius:11px;display:inline-flex;align-items:center;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0" id="eb-toggle" onclick="var v=!_eb.form.ruecklauf;_eb.form.ruecklauf=v;this.style.background=v?'var(--ts-teal)':'var(--ts-border)';document.getElementById('eb-dot').style.left=v?'20px':'2px'">
                <span id="eb-dot" style="width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;left:${f.ruecklauf?'20':'2'}px;top:2px;transition:left .2s"></span>
              </span>
              <span style="font-size:.88rem;color:var(--ts-text);cursor:pointer" onclick="document.getElementById('eb-toggle').click()">Rücklaufzettel hinzufügen</span>
            </div>
          </div>
          ${isPremium?`
          <div class="es-field" style="border-top:1px solid var(--ts-border-light);padding-top:.75rem;margin-bottom:0">
            <label class="es-label" style="color:var(--ts-teal)">✦ Premium — Ton</label>
            <div class="ab-pills" id="eb-ton-pills">
              <button class="ab-pill${f.ton==='freundlich'?' active':''}" onclick="_ebPill('ton','freundlich',this)">Freundlich</button>
              <button class="ab-pill${f.ton==='formell'?' active':''}" onclick="_ebPill('ton','formell',this)">Formell</button>
            </div>
            <div style="margin-top:.5rem;font-size:.78rem;color:var(--ts-text-secondary)">✓ Englische Kurzinfo für mehrsprachige Familien</div>
          </div>`:`
          <div class="es-field" style="border-top:1px solid var(--ts-border-light);padding-top:.75rem;margin-bottom:0;font-size:.8rem;color:var(--ts-text-secondary)">
            ✦ Tonwahl & Englische Kurzinfo mit <a href="${TS_STRIPE_ABO_29}" target="_blank" style="color:var(--ts-teal);text-decoration:none;font-weight:600">Abo oder Gründeredition</a>
          </div>`}
        </div>
      </div>

    </div><!-- /tool-grid -->

    <!-- Button: volle Breite -->
    <div class="es-section" style="margin-top:var(--sp-lg)">
      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="generateElternbrief()">
        <span id="eb-btn-txt">✉️ Brief erstellen · 2 Credits</span>
      </button>
    </div>

  </div>`;
}

function _ebPill(field, value, btn) {
  _eb.form[field] = value;
  const g = btn.closest('.ab-pills');
  if (g) g.querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* Heuristik: Warnt wenn 2+ aufeinanderfolgende großgeschriebene Wörter (möglicher Name) */
function _ebCheckPersonalData(text) {
  const warn = document.getElementById('eb-personal-warn');
  if (!warn) return;
  // Muster: "Max Mustermann" oder "Müller, Anna" oder Noten-Muster "Note: 2"
  const hasName = /\b[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}\b/.test(text);
  const hasNote = /\b(Note|Zensur|Zeugnis|Note:)\s*[1-6]\b/i.test(text);
  warn.style.display = (hasName || hasNote) ? 'block' : 'none';
}

async function generateElternbrief() {
  const details = document.getElementById('eb-details')?.value.trim();
  const klasse  = document.getElementById('eb-klasse')?.value.trim();
  if (!details) { _showToast('Bitte Details eingeben.', 'error'); return; }
  if (!klasse)  { _showToast('Bitte Klasse eingeben.', 'error'); return; }
  const f = _eb.form;
  f.klasse         = klasse;
  f.details        = details;
  f.datum_ereignis = document.getElementById('eb-datum')?.value.trim() || '';
  f.frist          = document.getElementById('eb-frist')?.value.trim() || '';
  f.kosten         = document.getElementById('eb-kosten')?.value.trim() || '';
  const btn = document.getElementById('eb-btn-txt');
  if (btn) btn.textContent = '⏳ Erstelle Brief…';
  try {
    const isPremium = window.isPremiumUser && window.isPremiumUser();
    const result = await callKI('elternbrief', {
      anlass: f.anlass, klasse: f.klasse, details: f.details,
      datum_ereignis: f.datum_ereignis, frist: f.frist, kosten: f.kosten,
      ruecklauf: f.ruecklauf, ton: f.ton, sprachen: isPremium,
      schulart: state.schulart||'', bundesland: state.bundesland||'',
      premium: isPremium,
    });
    _eb.data = result; _eb.mode = 'output'; _ebShowOutput();
  } catch(e) {
    if (btn) btn.textContent = '✉️ Brief erstellen (2 Credits)';
    _showToast(e.message||'Fehler beim Generieren.', 'error');
  }
}

function _ebShowOutput() {
  const el = document.getElementById('view-tool-elternbrief');
  if (!el) return;
  const d = _eb.data;
  const isPremium = window.isPremiumUser && window.isPremiumUser();
  let rzHtml = '';
  if (d.ruecklaufzettel) {
    const rz = d.ruecklaufzettel;
    const felder = (rz.felder||[]).map(feld => {
      if (feld.typ==='checkbox') return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem"><input type="checkbox" disabled> <span style="font-size:.88rem">${esc(feld.beschriftung||'')}</span></div>`;
      return `<div style="margin-bottom:.6rem"><div style="font-size:.78rem;color:var(--ts-text-secondary);margin-bottom:.2rem">${esc(feld.beschriftung||'')}${feld.pflicht?' *':''}</div><div style="border-bottom:1px solid var(--ts-border);height:1.5rem"></div></div>`;
    }).join('');
    rzHtml = `<div style="border:1.5px dashed var(--ts-border);border-radius:10px;padding:1rem;margin-top:1rem;background:var(--ts-bg)">
      <div style="font-size:.78rem;font-weight:700;color:var(--ts-text-secondary);margin-bottom:.75rem;text-transform:uppercase;letter-spacing:.05em">✂ Bitte ausschneiden und zurückgeben</div>
      <div style="font-size:.88rem;font-weight:700;color:var(--ts-text);margin-bottom:.75rem">${esc(rz.titel||'Rücklaufzettel')}</div>
      ${felder}
    </div>`;
  }
  el.innerHTML = `
  <div class="es-page">
    <div style="max-width:660px;margin:0 auto;padding:1.5rem 1rem 4rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_ebBackToForm()">← Zurück</button>
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_ebCopy()">📋 Kopieren</button>
        <button class="btn btn-secondary" style="padding:.4rem .9rem;font-size:.83rem" onclick="_ebPrint()">🖨️ Drucken</button>
        <div style="flex:1"></div>
        <div style="font-family:var(--font-display);font-size:.95rem;font-weight:700;color:var(--ts-text)">${esc(d.betreff||'Elternbrief')}</div>
      </div>
      <!-- DSGVO-Checkliste vor dem Versand -->
      <div style="border:1.5px solid #3BA89B;border-radius:10px;background:rgba(59,168,155,.06);padding:.75rem 1rem;margin-bottom:1rem">
        <div style="font-size:.8rem;font-weight:700;color:#2a7a72;margin-bottom:.5rem">Checkliste vor dem Versand</div>
        <div style="display:flex;flex-direction:column;gap:.3rem;font-size:.79rem;color:var(--ts-text)">
          <label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer"><input type="checkbox" style="margin-top:.15rem;flex-shrink:0"><span>Alle <strong>[Platzhalter]</strong> im Brief durch echte Daten ersetzt (lokal in deiner Textverarbeitung)</span></label>
          <label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer"><input type="checkbox" style="margin-top:.15rem;flex-shrink:0"><span>Briefinhalt auf Richtigkeit geprüft — keine Halluzinationen, alle Fakten korrekt</span></label>
          <label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer"><input type="checkbox" style="margin-top:.15rem;flex-shrink:0"><span>Schulkopf / Briefpapier hinzugefügt</span></label>
          <label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer"><input type="checkbox" style="margin-top:.15rem;flex-shrink:0"><span>Eigenhändig unterschrieben (rechtliche Verantwortung liegt bei dir)</span></label>
        </div>
      </div>
      <div style="background:var(--ts-bg);border:1px solid var(--ts-border);border-radius:10px;padding:1.5rem 1.75rem">
        <div style="text-align:right;font-size:.85rem;color:var(--ts-text-secondary);margin-bottom:1.25rem">${esc(d.datum_placeholder||'[Ort, Datum]')}</div>
        <div style="font-weight:700;margin-bottom:1rem;font-size:.9rem">Betreff: ${esc(d.betreff||'')}</div>
        <div style="font-size:.9rem;margin-bottom:.75rem">${esc(d.anrede||'')}</div>
        <div style="font-size:.9rem;white-space:pre-line;line-height:1.65;margin-bottom:1.25rem">${esc(d.inhalt||'')}</div>
        <div style="font-size:.9rem;white-space:pre-line">${esc(d.gruss||'')}</div>
      </div>
      ${rzHtml}
      ${d.wichtige_hinweise&&d.wichtige_hinweise.length?`<div style="margin-top:1rem;background:rgba(243,156,18,.1);border-left:3px solid #F39C12;padding:.6rem .9rem;border-radius:0 6px 6px 0"><div style="font-size:.78rem;font-weight:700;color:#E67E22;margin-bottom:.4rem">HINWEISE FÜR DICH</div><ul style="margin:0;padding-left:1.1rem">${d.wichtige_hinweise.map(h=>`<li style="font-size:.83rem;color:var(--ts-text);margin-bottom:.2rem">${esc(h)}</li>`).join('')}</ul></div>`:''}
      ${isPremium&&d.uebersetzungshinweis?`<div style="margin-top:.75rem;border:1px solid var(--ts-border);border-radius:10px;padding:.85rem 1rem;background:var(--ts-bg)"><div style="font-size:.78rem;font-weight:700;color:#2980B9;margin-bottom:.5rem">ENGLISCHE KURZINFO</div><div style="font-size:.85rem;color:var(--ts-text)">${esc(d.uebersetzungshinweis)}</div></div>`:''}
    </div>
  </div>`;
}

function _ebBackToForm() { _eb.mode = 'form'; _ebShowForm(); }

function _ebCopy() {
  const d = _eb.data; if (!d) return;
  const text = [d.datum_placeholder||'','',`Betreff: ${d.betreff||''}`,'',d.anrede||'','',d.inhalt||'','',d.gruss||''].join('\n');
  navigator.clipboard.writeText(text).then(
    () => _showToast('Brief in die Zwischenablage kopiert ✓','ok'),
    () => _showToast('Kopieren fehlgeschlagen.','error'),
  );
}

function _ebPrint() {
  const d = _eb.data; if (!d) return;
  const win = window.open('','_blank','width=800,height=700');
  if (!win) { _showToast('Popup-Blocker aktiv.','error'); return; }
  let rzHtml = '';
  if (d.ruecklaufzettel) {
    const rz = d.ruecklaufzettel;
    const felder = (rz.felder||[]).map(feld => {
      if (feld.typ==='checkbox') return `<div style="margin-bottom:.4rem"><input type="checkbox"> ${feld.beschriftung||''}</div>`;
      return `<div style="margin-bottom:.7rem"><div style="font-size:.8rem;color:#777">${feld.beschriftung||''}${feld.pflicht?' *':''}</div><div style="border-bottom:1px solid #999;height:1.5rem"></div></div>`;
    }).join('');
    rzHtml = `<div style="border:1.5px dashed #aaa;padding:1rem;margin-top:1.5rem;border-radius:6px">
      <div style="font-size:.75rem;color:#777;margin-bottom:.5rem">✂ Bitte ausschneiden und zurückgeben</div>
      <div style="font-weight:700;margin-bottom:.75rem">${rz.titel||'Rücklaufzettel'}</div>${felder}
    </div>`;
  }
  win.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>${d.betreff||'Elternbrief'}</title>
<style>*{box-sizing:border-box}@page{size:A4;margin:2cm}body{font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.6;color:#222}.datum{text-align:right;margin-bottom:1.5rem}.betreff{font-weight:700;margin-bottom:1rem}</style></head><body>
<div class="datum">${d.datum_placeholder||''}</div>
<div class="betreff">Betreff: ${d.betreff||''}</div>
<div>${d.anrede||''}</div>
<div style="white-space:pre-line;margin:1rem 0">${d.inhalt||''}</div>
<div style="white-space:pre-line">${d.gruss||''}</div>
${rzHtml}
<script>window.onload=function(){window.print()}<\/script></body></html>`);
  win.document.close();
}


/* ══════════════════════════════════════════════════════
   MATERIALDATENBANK
   ══════════════════════════════════════════════════════ */

let _mdb = { q: '', type: '', fach: '', sort: 'newest' };

function renderMaterialdatenbank() {
  const el = document.getElementById('view-materialdatenbank');
  if (!el) return;

  const faecher = (typeof getAllFaecher === 'function') ? getAllFaecher() : [];
  const fachOpts = faecher.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');

  el.innerHTML = `
  <div style="display:flex;flex-direction:column;height:100%;background:var(--ts-bg)">

    <!-- Suchleiste -->
    <div style="padding:1rem 1rem .75rem;background:var(--ts-bg-card);border-bottom:1px solid var(--ts-border);flex-shrink:0">
      <div style="max-width:860px;margin:0 auto">
        <div style="position:relative;margin-bottom:.75rem">
          <span style="position:absolute;left:.85rem;top:50%;transform:translateY(-50%);font-size:1.1rem;pointer-events:none;opacity:.45">🔍</span>
          <input id="mdb-search" class="ts-input" type="search" placeholder="Material suchen — Name, Fach, Tag…"
            style="width:100%;padding-left:2.6rem;font-size:.95rem;height:2.8rem"
            value="${esc(_mdb.q)}"
            oninput="_mdb.q=this.value;_mdbRefresh()">
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <select id="mdb-type" class="ts-input" style="flex:1;min-width:130px;height:2.1rem;font-size:.83rem"
            onchange="_mdb.type=this.value;_mdbRefresh()">
            <option value="">Alle Typen</option>
            <option value="html" ${_mdb.type==='html'?'selected':''}>📋 KI-Arbeitsblatt</option>
            <option value="html-tb" ${_mdb.type==='html-tb'?'selected':''}>🪟 Tafelbild</option>
            <option value="html-pr" ${_mdb.type==='html-pr'?'selected':''}>🎯 Präsentation</option>
            <option value="html-iv" ${_mdb.type==='html-iv'?'selected':''}>⚡ Interaktives AB</option>
            <option value="pdf" ${_mdb.type==='pdf'?'selected':''}>📄 PDF</option>
            <option value="image" ${_mdb.type==='image'?'selected':''}>🖼️ Bild</option>
            <option value="link" ${_mdb.type==='link'?'selected':''}>🔗 Link</option>
            <option value="video" ${_mdb.type==='video'?'selected':''}>🎬 Video</option>
            <option value="doc" ${_mdb.type==='doc'?'selected':''}>📝 Dokument</option>
            <option value="own" ${_mdb.type==='own'?'selected':''}>📁 Eigenes Material</option>
          </select>
          <select id="mdb-fach" class="ts-input" style="flex:1;min-width:130px;height:2.1rem;font-size:.83rem"
            onchange="_mdb.fach=this.value;_mdbRefresh()">
            <option value="">Alle Fächer</option>
            ${fachOpts}
          </select>
          <select id="mdb-sort" class="ts-input" style="flex:1;min-width:130px;height:2.1rem;font-size:.83rem"
            onchange="_mdb.sort=this.value;_mdbRefresh()">
            <option value="newest" ${_mdb.sort==='newest'?'selected':''}>Neueste zuerst</option>
            <option value="oldest" ${_mdb.sort==='oldest'?'selected':''}>Älteste zuerst</option>
            <option value="name"   ${_mdb.sort==='name'?'selected':''}>Name A–Z</option>
          </select>
          <button class="btn btn-secondary" style="height:2.1rem;padding:0 .85rem;font-size:.82rem;white-space:nowrap"
            onclick="_mdb={q:'',type:'',fach:'',sort:'newest'};_mdbReset()">✕ Reset</button>
        </div>
      </div>
    </div>

    <!-- Stats + Liste -->
    <div style="flex:1;overflow-y:auto;padding:1rem">
      <div style="max-width:860px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.85rem;flex-wrap:wrap;gap:.5rem">
          <div id="mdb-stats" style="font-size:.8rem;color:var(--ts-text-secondary)"></div>
          <button class="btn btn-primary" style="padding:.4rem .9rem;font-size:.85rem;flex-shrink:0"
            onclick="svAddMedia()">+ Material hinzufügen</button>
        </div>
        <div id="mdb-grid"></div>
      </div>
    </div>
  </div>`;

  _mdbRefresh();
}

function _mdbReset() {
  const el = document.getElementById('view-materialdatenbank');
  if (!el) return;
  const s = document.getElementById('mdb-search');  if (s) s.value = '';
  const t = document.getElementById('mdb-type');    if (t) t.value = '';
  const f = document.getElementById('mdb-fach');    if (f) f.value = '';
  const o = document.getElementById('mdb-sort');    if (o) o.value = 'newest';
  _mdbRefresh();
}



function _mdbRefresh() {
  const db = (typeof getMediaDb === 'function') ? getMediaDb() : [];
  const q  = (_mdb.q || '').toLowerCase().trim();
  const faecher = (typeof getAllFaecher === 'function') ? getAllFaecher() : [];

  // Filter
  let items = db.filter(m => {
    // Typ-Filter (virtuelle Typen: html vs html-tb vs html-pr)
    if (_mdb.type === 'html-tb')      { if (!(m.type === 'html' && m.isTafelbild)) return false; }
    else if (_mdb.type === 'html-pr') { if (!(m.type === 'html' && (m.tags||[]).includes('praesentation'))) return false; }
    else if (_mdb.type === 'html-iv') { if (!(m.type === 'html' && (m.tags||[]).includes('interaktiv'))) return false; }
    else if (_mdb.type === 'html')    { if (!(m.type === 'html' && !m.isTafelbild && !(m.tags||[]).includes('praesentation') && !(m.tags||[]).includes('interaktiv'))) return false; }
    else if (_mdb.type === 'own')     { if (m.source !== 'own') return false; }
    else if (_mdb.type)               { if (m.type !== _mdb.type) return false; }

    // Fach-Filter
    if (_mdb.fach && !(m.fachTags || []).includes(_mdb.fach)) return false;

    // Volltextsuche
    if (q) {
      const nameHit = (m.name || '').toLowerCase().includes(q);
      const tagHit  = (m.tags || []).some(t => t.toLowerCase().includes(q));
      const fachHit = (m.fachTags || []).some(tid => {
        const f = faecher.find(x => x.id === tid);
        return f && f.name.toLowerCase().includes(q);
      });
      if (!nameHit && !tagHit && !fachHit) return false;
    }
    return true;
  });

  // Sortierung
  if (_mdb.sort === 'newest') {
    items = items.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } else if (_mdb.sort === 'oldest') {
    items = items.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } else if (_mdb.sort === 'name') {
    items = items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  }

  // Stats
  const total = db.length;
  const typeCount = {};
  db.forEach(m => {
    const k = m.type === 'html' && m.isTafelbild ? 'html-tb'
            : m.type === 'html' && (m.tags||[]).includes('praesentation') ? 'html-pr'
            : m.type === 'html' && (m.tags||[]).includes('interaktiv') ? 'html-iv'
            : m.type;
    typeCount[k] = (typeCount[k] || 0) + 1;
  });
  const typeLabels = { html:'KI-AB', 'html-tb':'Tafelbild', 'html-pr':'Präsentation', 'html-iv':'Interaktiv', pdf:'PDF', image:'Bild', link:'Link', video:'Video', doc:'Dok.' };
  const statParts = Object.entries(typeCount).map(([k,v]) => `${v} ${typeLabels[k]||k}`);
  const statsEl = document.getElementById('mdb-stats');
  if (statsEl) {
    statsEl.innerHTML = total === 0
      ? 'Noch keine Materialien gespeichert.'
      : `<strong>${total}</strong> Materialien gesamt &nbsp;·&nbsp; ${statParts.join(' · ')}` +
        (items.length !== total ? `&nbsp;·&nbsp; <strong>${items.length}</strong> Treffer` : '');
  }

  // Grid
  const gridEl = document.getElementById('mdb-grid');
  if (!gridEl) return;

  if (!items.length) {
    gridEl.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--ts-text-secondary)">
        <div style="font-size:3rem;margin-bottom:.75rem;opacity:.3">📭</div>
        <div style="font-size:.95rem;font-weight:600;color:var(--ts-text);margin-bottom:.35rem">Keine Treffer</div>
        <div style="font-size:.85rem">${total === 0 ? 'Speichere Material aus den KI-Werkzeugen oder der Stundenvorbereitung.' : 'Versuche einen anderen Suchbegriff oder Filter.'}</div>
      </div>`;
    return;
  }

  const TYPE_ICON = (typeof MEDIA_TYPE_ICON !== 'undefined') ? MEDIA_TYPE_ICON : {};
  const TYPE_BG   = (typeof MEDIA_TYPE_BG   !== 'undefined') ? MEDIA_TYPE_BG   : {};

  gridEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem">
    ${items.map(m => {
      const _tk       = m.type === 'html' && m.isTafelbild ? 'html-tb'
                      : m.type === 'html' && (m.tags||[]).includes('praesentation') ? 'html-pr'
                      : m.type === 'html' && (m.tags||[]).includes('interaktiv') ? 'html-iv'
                      : m.type;
      const icon      = TYPE_ICON[_tk] || '📎';
      const bgColor   = TYPE_BG[_tk]   || '#f5f5f5';
      const fachNames = (m.fachTags || []).map(tid => {
        const f = faecher.find(x => x.id === tid);
        return f ? esc(f.name) : '';
      }).filter(Boolean).join(', ');
      const klassen   = (m.klassenIds || []).length
        ? 'Kl. ' + m.klassenIds.map(id => { const k=(state.klassen||[]).find(kl=>kl.id===id); return k?k.name:id; }).join(', ')
        : '';
      const meta      = [fachNames, klassen].filter(Boolean).join(' · ');
      const dateStr   = m.createdAt ? new Date(m.createdAt).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';
      const tags      = (m.tags || []).filter(t => !['ki-generiert','tafelbild','praesentation','interaktiv'].includes(t));

      return `<div style="background:var(--ts-bg-card);border:1px solid var(--ts-border);border-radius:10px;overflow:hidden;cursor:pointer;transition:box-shadow .15s"
                   onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'"
                   onmouseout="this.style.boxShadow='none'"
                   onclick="svOpenMedia('${m.id}')">
        <div style="background:${bgColor};padding:.9rem 1rem;display:flex;align-items:center;gap:.6rem;border-bottom:1px solid var(--ts-border)">
          <span style="font-size:1.5rem">${icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.88rem;color:var(--ts-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(m.name)}">${esc(m.name)}</div>
            ${meta ? `<div style="font-size:.75rem;color:var(--ts-text-secondary);margin-top:.1rem">${meta}</div>` : ''}
          </div>
        </div>
        <div style="padding:.6rem 1rem;display:flex;align-items:center;justify-content:space-between">
          <div>
            ${tags.length ? `<div style="display:flex;gap:.25rem;flex-wrap:wrap">${tags.slice(0,3).map(t=>`<span style="font-size:.7rem;background:var(--ts-bg);border:1px solid var(--ts-border);border-radius:20px;padding:.1rem .4rem;color:var(--ts-text-secondary)">${esc(t)}</span>`).join('')}</div>` : ''}
            ${dateStr ? `<div style="font-size:.72rem;color:var(--ts-text-secondary);margin-top:${tags.length?'.3':'0'}rem">${dateStr}</div>` : ''}
          </div>
          <button style="background:none;border:none;font-size:1.1rem;cursor:pointer;opacity:.45;padding:.2rem .4rem;border-radius:6px;transition:opacity .15s"
                  title="Optionen"
                  onmouseover="this.style.opacity='1'"
                  onmouseout="this.style.opacity='.45'"
                  onclick="event.stopPropagation();_mdbItemMenu(event,'${m.id}')">⋮</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function _mdbItemMenu(e, id) {
  document.getElementById('mdb-menu-overlay')?.remove();
  const item = getMediaDb().find(m => m.id === id);
  const isPraesentation = item && item.type === 'html' && (item.tags||[]).includes('praesentation');
  const isInteraktiv    = item && item.type === 'html' && (item.tags||[]).includes('interaktiv');
  const isArbeitsblatt  = item && item.type === 'html' && !isPraesentation && !isInteraktiv && !item.isTafelbild;

  const overlay = document.createElement('div');
  overlay.id = 'mdb-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:399';
  overlay.onclick = () => overlay.remove();

  const menu = document.createElement('div');
  menu.className = 'sv-chip-menu';
  const x = Math.min(e.clientX, window.innerWidth - 210);
  const y = Math.min(e.clientY + 4, window.innerHeight - 120);
  menu.style.cssText = `left:${x}px;top:${y}px`;
  menu.innerHTML = `
    <button onclick="svOpenMedia('${id}');document.getElementById('mdb-menu-overlay').remove()"><span>↗</span> Öffnen</button>
    ${isPraesentation ? `<button onclick="_mdbPrDownloadPptx('${id}');document.getElementById('mdb-menu-overlay').remove()"><span>⬇</span> PowerPoint</button>` : ''}
    ${isArbeitsblatt   ? `<button onclick="_mdbAbDownloadDocx('${id}');document.getElementById('mdb-menu-overlay').remove()"><span>📄</span> Word (.docx)</button>` : ''}
    <div class="sv-chip-menu-divider"></div>
    <button class="danger" onclick="_mdbDelete('${id}')"><span>🗑</span> Löschen</button>`;

  overlay.appendChild(menu);
  document.body.appendChild(overlay);
}

async function _mdbPrDownloadPptx(id) {
  const item = getMediaDb().find(m => m.id === id);
  if (!item?.rawData) { _showToast('Keine Rohdaten für PowerPoint-Export vorhanden.', 'error'); return; }
  try {
    const saved = _pr.data;
    const savedForm = { ..._pr.form };
    _pr.data = JSON.parse(item.rawData);
    // Farbschema aus Tags ableiten falls vorhanden, sonst navy
    const schemeTag = (item.tags||[]).find(t => Object.keys(_PR_SCHEMES).includes(t));
    _pr.form = { ..._pr.form, farbschema: schemeTag || 'navy' };
    await _prDownloadPptx();
    _pr.data = saved;
    _pr.form = savedForm;
  } catch(e) {
    _showToast('PowerPoint-Export fehlgeschlagen: ' + e.message, 'error');
  }
}

async function _mdbAbDownloadDocx(id) {
  const item = getMediaDb().find(m => m.id === id);
  if (!item) return;
  const safeName = (item.name || 'Arbeitsblatt').replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_]/g,'').trim();
  let bodyHtml = '';
  if (item.rawData) {
    try { bodyHtml = svRenderAbForWord(JSON.parse(item.rawData)); } catch(e){}
  }
  if (!bodyHtml) bodyHtml = item.content || '';
  const fullDoc = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>' + safeName + '</title>'
    + '<style>body{font-family:Arial,sans-serif;font-size:11pt}p{margin:0}table{border-collapse:collapse;width:100%}td,th{border:1pt solid #ccc;padding:4pt 6pt}</style>'
    + '</head><body>' + bodyHtml + '</body></html>';
  try {
    await _loadHtmlDocx();
    const blob = htmlDocx.asBlob(fullDoc, { orientation:'portrait', margins:{top:1134,right:1418,bottom:1134,left:1418} });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName + '.docx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    _showToast(`"${safeName}" als .docx heruntergeladen ✓`, 'ok');
  } catch(e) {
    _showToast('Word-Export fehlgeschlagen: ' + (e.message || e), 'error');
  }
}

async function _mdbDelete(id) {
  document.getElementById('mdb-menu-overlay')?.remove();
  if (!confirm('Material dauerhaft aus der Datenbank löschen?')) return;
  const db = getMediaDb().filter(m => m.id !== id);
  await saveMediaDb(db);
  _mdbRefresh();
}


/* ══════════════════════════════════════════════════════
   APP-BAUKASTEN
   ══════════════════════════════════════════════════════ */

const _ABK_TEMPLATES = [
  { id:'dungeon', icon:'🗺️', label:'Forscher-Dungeon',
    desc:'Text-Adventure: Raum für Raum durch das Thema — Fehler führen in Lernfallen',
    seitenName:'Raum', minSeiten:2, maxSeiten:8 },
];

let _abk = {
  mode: 'setup',
  form: { hauptthema:'', fachId:'', jgst:'', kontext:'', template:'dungeon', seitenanzahl:4 },
  seiten: [],
};

function renderToolAppBaukasten() {
  if (!isPremiumUser()) { _toolLockedView('tool-appbaukasten'); return; }
  if (_abk.mode === 'edit') { _abkShowEdit(); return; }
  _abkShowSetup();
}

function _abkShowSetup() {
  const view = document.getElementById('view-tool-appbaukasten');
  if (!view) return;
  const f = _abk.form;
  const tmpl = _ABK_TEMPLATES.find(t => t.id === f.template) || _ABK_TEMPLATES[0];
  const fachOpts = `<option value="">– Fach –</option>`
    + getAllFaecher().map(fc => `<option value="${esc(fc.id)}"${f.fachId===fc.id?' selected':''}>${esc(fc.name)}</option>`).join('');
  const jgstOpts = ['1','2','3','4','5','6','7','8','9','10','11','12','13']
    .map(j => `<option value="${j}"${f.jgst===j?' selected':''}>${j}. Klasse</option>`).join('');
  const templateCards = _ABK_TEMPLATES.map(t => `
    <button class="ab-pill${f.template===t.id?' active':''}" onclick="_abkSetTemplate('${t.id}',this)"
      style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;height:auto;padding:.5rem .85rem">
      <span>${t.icon} ${esc(t.label)}</span>
      <span style="font-size:.66rem;opacity:.6;font-weight:400">${esc(t.desc)}</span>
    </button>`).join('');
  const seitenRange = Array.from({length: tmpl.maxSeiten - tmpl.minSeiten + 1}, (_,i) => i + tmpl.minSeiten);
  const seitenBtns = seitenRange.map(n => {
    const active = f.seitenanzahl === n;
    return `<button id="abk-n-${n}" onclick="_abkSetAnzahl(${n})"
      style="border:1.5px solid ${active?'var(--ts-teal)':'var(--ts-border)'};border-radius:8px;
      padding:.5rem 1rem;background:${active?'rgba(var(--ts-teal-rgb),.08)':'var(--ts-bg)'};
      cursor:pointer;font-size:.92rem;font-weight:${active?'700':'500'};
      color:${active?'var(--ts-teal)':'var(--ts-text)'};min-width:50px">${n}</button>`;
  }).join('');

  view.innerHTML = `
  <div style="overflow-y:auto;height:100%;padding:var(--sp-lg) var(--sp-xl)">
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem">
      <div style="font-size:2rem">🧩</div>
      <div>
        <div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;color:var(--ts-text)">App-Baukasten</div>
        <div style="font-size:.82rem;color:var(--ts-text-secondary)">Interaktive Lern-Apps Seite für Seite &mdash; <strong>1 Credit pro ${tmpl.seitenName}</strong></div>
      </div>
    </div>
    <div class="tool-grid">
      <div class="es-section tool-grid-full">
        <div class="es-section-title">Template</div>
        <div class="es-card"><div class="ab-pills">${templateCards}</div></div>
      </div>
      <div class="es-section">
        <div class="es-section-title">Inhalt</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Hauptthema *</label>
            <input id="abk-thema" class="input" placeholder="z.B. Photosynthese, Zweiter Weltkrieg, Bruchrechnung…" value="${esc(f.hauptthema||'')}">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Fach</label>
              <select id="abk-fach" class="input">${fachOpts}</select>
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Jahrgangsstufe</label>
              <select id="abk-jgst" class="input"><option value="">– wählen –</option>${jgstOpts}</select>
            </div>
          </div>
          <div class="es-field" style="margin-bottom:0">
            <label class="es-label">Kontext <span style="font-weight:400;opacity:.6">(optional)</span></label>
            <textarea id="abk-kontext" class="input" rows="3" placeholder="Stichpunkte, Fachbegriffe, Unterrichtsstand…" style="resize:vertical">${esc(f.kontext||'')}</textarea>
          </div>
        </div>
      </div>
      <div class="es-section">
        <div class="es-section-title">Anzahl ${tmpl.seitenName}e <span style="font-size:.78rem;font-weight:400;color:var(--ts-text-muted)">· je 1 Credit</span></div>
        <div class="es-card">
          <div style="display:flex;flex-wrap:wrap;gap:.5rem">${seitenBtns}</div>
          <div id="abk-cost-info" style="margin-top:.75rem;font-size:.78rem;color:var(--ts-text-muted)">Gesamt: <strong>${f.seitenanzahl} Credits</strong> · Jeder ${tmpl.seitenName} wird einzeln generiert &amp; kann bearbeitet werden</div>
        </div>
      </div>
    </div>
    <div style="margin-top:var(--sp-lg)">
      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="_abkStartProject()">
        🚀 Projekt starten
      </button>
    </div>
  </div>`;
}

function _abkSetTemplate(id, btn) {
  _abk.form.template = id;
  btn.closest('.ab-pills').querySelectorAll('.ab-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function _abkSetAnzahl(n) {
  _abk.form.seitenanzahl = n;
  const tmpl = _ABK_TEMPLATES.find(t => t.id === _abk.form.template) || _ABK_TEMPLATES[0];
  const range = Array.from({length: tmpl.maxSeiten - tmpl.minSeiten + 1}, (_,i) => i + tmpl.minSeiten);
  range.forEach(num => {
    const el = document.getElementById('abk-n-' + num);
    if (!el) return;
    const active = num === n;
    el.style.borderColor = active ? 'var(--ts-teal)' : 'var(--ts-border)';
    el.style.background  = active ? 'rgba(var(--ts-teal-rgb),.08)' : 'var(--ts-bg)';
    el.style.fontWeight  = active ? '700' : '500';
    el.style.color       = active ? 'var(--ts-teal)' : 'var(--ts-text)';
  });
  const info = document.getElementById('abk-cost-info');
  if (info) info.innerHTML = `Gesamt: <strong>${n} Credits</strong> · Jeder ${tmpl.seitenName} wird einzeln generiert &amp; kann bearbeitet werden`;
}

function _abkStartProject() {
  const thema = document.getElementById('abk-thema')?.value.trim();
  if (!thema) { _showToast('Bitte ein Hauptthema eingeben.', 'error'); return; }
  const f = _abk.form;
  f.hauptthema = thema;
  f.fachId  = document.getElementById('abk-fach')?.value || '';
  f.jgst    = document.getElementById('abk-jgst')?.value || '';
  f.kontext = document.getElementById('abk-kontext')?.value.trim() || '';
  const tmpl = _ABK_TEMPLATES.find(t => t.id === f.template) || _ABK_TEMPLATES[0];
  _abk.seiten = Array.from({length: f.seitenanzahl}, (_, i) => ({
    nr: i + 1,
    titel: `${tmpl.seitenName} ${i+1}: ${thema}`,
    status: 'empty',
    html: null,
  }));
  _abk.mode = 'edit';
  _abkShowEdit();
}

function _abkCardHtml(s, tmpl) {
  const statusIcon = {empty:'⬜', loading:'⏳', done:'✅', error:'❌'}[s.status] || '⬜';
  const canGen = s.status !== 'loading';
  const genLabel = s.status === 'loading' ? '⏳ Generiere…' : s.status === 'done' ? '🔄 Neu' : '⚡ 1 Credit';
  return `
  <div class="es-card" id="abk-card-${s.nr}" style="margin-bottom:.6rem">
    <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <div style="font-size:1.05rem;flex-shrink:0">${statusIcon}</div>
      <div style="flex:1;min-width:140px">
        <div style="font-size:.7rem;font-weight:600;color:var(--ts-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">${tmpl.seitenName} ${s.nr}</div>
        <input id="abk-titel-${s.nr}" class="input" style="margin:0;font-size:.88rem;padding:.35rem .6rem"
          value="${esc(s.titel)}" oninput="_abk.seiten[${s.nr-1}].titel=this.value"
          placeholder="${tmpl.seitenName}-Thema…">
      </div>
      <div style="display:flex;gap:.35rem;flex-shrink:0">
        ${s.status === 'done' ? `<button class="btn btn-secondary" style="padding:.28rem .65rem;font-size:.75rem" onclick="_abkPreview(${s.nr})">👁</button>` : ''}
        <button class="btn btn-primary" style="padding:.28rem .65rem;font-size:.75rem${canGen?'':';opacity:.5;cursor:not-allowed'}"
          onclick="${canGen ? `_abkGenerate(${s.nr})` : 'void 0'}">${genLabel}</button>
      </div>
    </div>
  </div>`;
}

function _abkShowEdit() {
  const view = document.getElementById('view-tool-appbaukasten');
  if (!view) return;
  const f = _abk.form;
  const tmpl = _ABK_TEMPLATES.find(t => t.id === f.template) || _ABK_TEMPLATES[0];
  const allDone    = _abk.seiten.every(s => s.status === 'done');
  const anyLoading = _abk.seiten.some(s => s.status === 'loading');
  const remaining  = _abk.seiten.filter(s => s.status !== 'done').length;
  const seitenCards = _abk.seiten.map(s => _abkCardHtml(s, tmpl)).join('');

  view.innerHTML = `
  <div style="overflow-y:auto;height:100%;padding:var(--sp-lg) var(--sp-xl)">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1.25rem;flex-wrap:wrap">
      <button class="btn btn-secondary" style="padding:.35rem .85rem;font-size:.82rem" onclick="_abkReset()">← Neu</button>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--ts-text);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${tmpl.icon} ${esc(f.hauptthema)}</div>
        <div style="font-size:.75rem;color:var(--ts-text-muted)">${esc(tmpl.label)} · ${_abk.seiten.length} ${tmpl.seitenName}e</div>
      </div>
      <div style="display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap">
        <button class="btn btn-secondary" id="abk-suggest-btn"
          style="padding:.35rem .8rem;font-size:.8rem"
          onclick="_abkSuggestThemen()" title="KI schlägt passende Teilthemen vor (1 Credit)">
          💡 Themen · 1 Credit
        </button>
        <button class="btn btn-secondary" id="abk-all-btn"
          style="padding:.35rem .8rem;font-size:.8rem${anyLoading?';opacity:.5;cursor:not-allowed':''}"
          onclick="${anyLoading ? 'void 0' : '_abkGenerateAll()'}">
          🪄 Alle · ${remaining} Credits
        </button>
        ${allDone ? `<button class="btn btn-primary" style="padding:.35rem .8rem;font-size:.8rem" onclick="_abkDownload()">📥 Download</button>` : ''}
      </div>
    </div>
    <div id="abk-seiten-list">${seitenCards}</div>
    ${allDone ? `<div style="margin-top:1rem"><button class="btn btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="_abkDownload()">📥 Gesamte App herunterladen</button></div>` : ''}
  </div>`;
}

function _abkRefreshCard(nr) {
  const seite = _abk.seiten.find(s => s.nr === nr);
  if (!seite) return;
  const card = document.getElementById('abk-card-' + nr);
  if (!card) return;
  const tmpl = _ABK_TEMPLATES.find(t => t.id === _abk.form.template) || _ABK_TEMPLATES[0];
  card.outerHTML = _abkCardHtml(seite, tmpl);
  const allBtn   = document.getElementById('abk-all-btn');
  const remaining  = _abk.seiten.filter(s => s.status !== 'done').length;
  const anyLoading = _abk.seiten.some(s => s.status === 'loading');
  if (allBtn) {
    allBtn.textContent = `🪄 Alle · ${remaining} Credits`;
    allBtn.style.opacity = anyLoading ? '.5' : '1';
    allBtn.style.cursor  = anyLoading ? 'not-allowed' : '';
    allBtn.onclick = anyLoading ? null : _abkGenerateAll;
  }
}

async function _abkSuggestThemen() {
  const f = _abk.form;
  const fachObj = getAllFaecher().find(fc => fc.id === f.fachId);
  const btn = document.getElementById('abk-suggest-btn');
  if (btn) { btn.textContent = '⏳ Schlage vor…'; btn.disabled = true; }
  const result = await callKI('appbaukasten_themen', {
    hauptthema: f.hauptthema,
    anzahl:     _abk.seiten.length,
    fach:       fachObj?.name || '',
    jgst:       f.jgst,
    kontext:    f.kontext,
  }, 1);
  if (btn) { btn.textContent = '💡 Themen · 1 Credit'; btn.disabled = false; }
  if (!Array.isArray(result) || !result.length) {
    _showToast('Themenvorschläge konnten nicht geladen werden.', 'error'); return;
  }
  const tmpl = _ABK_TEMPLATES.find(t => t.id === f.template) || _ABK_TEMPLATES[0];
  result.slice(0, _abk.seiten.length).forEach((titel, i) => {
    _abk.seiten[i].titel = `${tmpl.seitenName} ${i+1}: ${titel}`;
    const inp = document.getElementById(`abk-titel-${i+1}`);
    if (inp) inp.value = _abk.seiten[i].titel;
  });
  _showToast('Themen vorgeschlagen — jetzt bearbeiten oder direkt generieren ✓', 'success');
}

async function _abkGenerate(nr) {
  const seite = _abk.seiten.find(s => s.nr === nr);
  if (!seite || seite.status === 'loading') return;
  const f = _abk.form;
  const fachObj = getAllFaecher().find(fc => fc.id === f.fachId);
  seite.status = 'loading';
  _abkRefreshCard(nr);
  const result = await callKI('appbaukasten', {
    hauptthema:  f.hauptthema,
    seitenthema: seite.titel,
    raumNr:      nr,
    gesamtRaeume: _abk.seiten.length,
    alleTitel:   _abk.seiten.map(s => s.titel),
    fach:        fachObj?.name || '',
    jgst:        f.jgst,
    kontext:     f.kontext,
    schulart:    state.schulart || '',
  }, 1);
  seite.html   = result?.html || null;
  seite.status = result?.html ? 'done' : 'error';
  _abkRefreshCard(nr);
  if (_abk.seiten.every(s => s.status === 'done')) _abkShowEdit();
}

async function _abkGenerateAll() {
  for (const s of _abk.seiten.filter(s => s.status !== 'done' && s.status !== 'loading')) {
    await _abkGenerate(s.nr);
  }
}

function _abkPreview(nr) {
  const seite = _abk.seiten.find(s => s.nr === nr);
  if (!seite?.html) return;
  const html = _abkBuildFullHtml([seite], true);
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function _abkDownload() {
  const done = _abk.seiten.filter(s => s.status === 'done');
  if (!done.length) { _showToast('Noch keine Räume generiert.', 'error'); return; }
  const html = _abkBuildFullHtml(done);
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Forscher-Dungeon_${(_abk.form.hauptthema||'App').replace(/[^a-zA-Z0-9äöüÄÖÜß]/g,'_')}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function _abkBuildFullHtml(seiten, previewSingle = false) {
  const f      = _abk.form;
  const thema  = f.hauptthema;
  const firstId = previewSingle ? `r${seiten[0].nr}-q` : 'r1-q';
  const rooms   = seiten.map(s => s.html || '').join('\n\n');
  const endScreen = previewSingle ? '' : `
  <div class="screen" id="end">
    <div style="text-align:center;padding:2rem 0">
      <div style="font-size:3rem;margin-bottom:.75rem">🏆</div>
      <div class="room-title" style="border:none">DUNGEON BEZWUNGEN!</div>
      <p class="narrative" style="text-align:center;margin-top:.5rem">
        Du hast alle Geheimnisse des <em>${esc(thema)}</em>-Dungeons entdeckt und gemeistert!
      </p>
      <button class="next-btn" onclick="show('r1-q')" ontouchend="show('r1-q')">🗺️ Nochmal erkunden</button>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Forscher-Dungeon: ${esc(thema)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:#1C1C1E;color:#E5E5EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;min-height:100vh;padding:20px;display:flex;justify-content:center}
.dungeon{max-width:600px;width:100%;padding-bottom:40px}
.screen{display:none}
.progress{font-size:.75rem;color:#8E8E93;letter-spacing:.05em;text-transform:uppercase;margin-bottom:.85rem;text-align:center}
.room-title{font-size:1.1rem;font-weight:700;color:#FFD60A;letter-spacing:.02em;text-align:center;margin-bottom:1rem;padding:.6rem 0;border-bottom:1px solid #3A3A3C}
.narrative{font-size:.95rem;line-height:1.65;color:#AEAEB2;margin-bottom:1rem}
.question{font-size:1rem;font-weight:600;color:#E5E5EA;margin-bottom:.85rem}
.choices{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.85rem}
.choice-btn{background:#2C2C2E;border:1.5px solid #3A3A3C;border-radius:12px;color:#E5E5EA;padding:13px 16px;font-size:.88rem;text-align:left;cursor:pointer;touch-action:manipulation;transition:background .12s,border-color .12s;min-height:48px;width:100%;font-family:inherit}
.choice-btn:hover,.choice-btn:active{background:#3A3A3C;border-color:#6D6D70}
.correct-box{background:rgba(52,199,89,.13);border:1.5px solid #34C759;border-radius:12px;padding:.85rem 1rem;margin-bottom:.85rem;color:#34C759;font-size:.9rem;line-height:1.5}
.wrong-box{background:rgba(255,69,58,.13);border:1.5px solid #FF453A;border-radius:12px;padding:.85rem 1rem;margin-bottom:.85rem;color:#FF453A;font-size:.9rem;line-height:1.5}
.trap-box{background:#2C2C2E;border:1.5px solid #FFD60A;border-radius:12px;padding:.85rem 1rem;margin-bottom:.85rem;color:#FFD60A;font-size:.88rem;line-height:1.5}
.next-btn{background:#FFD60A;color:#1C1C1E;border:none;border-radius:12px;padding:13px 28px;font-size:.9rem;font-weight:700;cursor:pointer;touch-action:manipulation;width:100%;margin-top:.35rem;min-height:48px;transition:opacity .12s;font-family:inherit}
.next-btn:hover,.next-btn:active{opacity:.85}
</style>
</head>
<body>
<div class="dungeon">
${rooms}
${endScreen}
</div>
<script>
function show(id){
  document.querySelectorAll('.dungeon .screen').forEach(function(s){s.style.display='none';});
  var el=document.getElementById(id);
  if(el){el.style.display='block';window.scrollTo({top:0,behavior:'smooth'});}
}
window.addEventListener('DOMContentLoaded',function(){show('${firstId}');});
<\/script>
</body>
</html>`;
}

function _abkReset() {
  _abk.mode = 'setup';
  _abk.seiten = [];
  _abkShowSetup();
}

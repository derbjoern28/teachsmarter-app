/* ═══════════════════════════════════════════
   /* ts-core.js — State, Storage, Navigation, Helpers
   ═══════════════════════════════════════════ */

const FAECHER = [
  {id:'mathe',name:'Mathematik',color:'#E8A44A'},{id:'deutsch',name:'Deutsch',color:'#D4574E'},
  {id:'englisch',name:'Englisch',color:'#5B8EC9'},{id:'nt',name:'NT / NuT',color:'#3BA89B'},
  {id:'gpg',name:'GPG',color:'#8B6DB5'},{id:'wib',name:'WiB',color:'#C47A5A'},
  {id:'sport',name:'Sport',color:'#5AAE6B'},{id:'musik',name:'Musik',color:'#D47BA0'},
  {id:'kunst',name:'Kunst',color:'#E07B4F'},{id:'religion',name:'Religion / Ethik',color:'#7B9EC4'},
  {id:'informatik',name:'Informatik',color:'#4A8B9E'},{id:'hsb',name:'HsB / Werken',color:'#A0885B'},
  {id:'franzoesisch',name:'Französisch',color:'#C4A05B'},{id:'physik',name:'Physik',color:'#5BA8C4'},
  {id:'chemie',name:'Chemie',color:'#6BAA7B'},{id:'biologie',name:'Biologie',color:'#7BBB5A'},
  {id:'geschichte',name:'Geschichte',color:'#9B7B5A'},{id:'geografie',name:'Geografie',color:'#6B9B5A'},
];
const BUNDESLAENDER_DE = [
  'Baden-Württemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg',
  'Hessen','Mecklenburg-Vorpommern','Niedersachsen','Nordrhein-Westfalen',
  'Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thüringen',
];
const BUNDESLAENDER_AT = [
  'Wien','Niederösterreich','Oberösterreich','Steiermark',
  'Tirol','Vorarlberg','Salzburg','Kärnten','Burgenland',
];
const KANTONE_CH = [
  'Aargau','Appenzell Ausserrhoden','Appenzell Innerrhoden','Basel-Landschaft','Basel-Stadt',
  'Bern','Freiburg','Genf','Glarus','Graubünden','Jura','Luzern',
  'Neuenburg','Nidwalden','Obwalden','Schaffhausen','Schwyz','Solothurn',
  'St. Gallen','Tessin','Thurgau','Uri','Waadt','Wallis','Zug','Zürich',
];
// Für Dropdown: welche Staaten-Liste je Land
const STATES_BY_LAND = { DE: BUNDESLAENDER_DE, AT: BUNDESLAENDER_AT, CH: KANTONE_CH };
const SCHULARTEN = [
  'Grundschule','Mittelschule','Hauptschule','Realschule','Gymnasium',
  'Gesamtschule','Gemeinschaftsschule','Förderschule','Montessori','Waldorfschule',
  'AHS','NMS','Sekundarschule','Oberschule','Stadtteilschule','Werkrealschule'
];

/* ═══ HTML-Escaping (XSS-Schutz) ═══
   Alle nutzerkontrollierten Strings die per innerHTML eingesetzt werden MÜSSEN durch esc() laufen. */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const TAGE_SHORT = ['Mo','Di','Mi','Do','Fr'];
const TAGE_LONG = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const DEFAULT_ZEITRASTER = [
  {nr:1,von:'08:00',bis:'08:45'},{nr:2,von:'08:45',bis:'09:30'},
  {nr:3,von:'09:45',bis:'10:30'},{nr:4,von:'10:30',bis:'11:15'},
  {nr:5,von:'11:30',bis:'12:15'},{nr:6,von:'12:15',bis:'13:00'},
  {nr:7,von:'13:45',bis:'14:30'},{nr:8,von:'14:30',bis:'15:15'},
];

/* ═══ KI / LICENSE ═══ */
const TS_API = 'https://teachsmarter-api.teachsmarter-api.workers.dev';
// API_AUTH_TOKEN: muss mit dem Cloudflare-Worker-Secret übereinstimmen
// In Produktion: diesen Wert in einem eigenen Build-Step / Env ersetzen
const TS_API_TOKEN = 'ts-app-2026';

// Stripe payment links (Credits-Nachkauf)
// ── Stripe Payment Links ─────────────────────────────────────────
// Gründeredition (12,99 € einmalig, 15 Starter-Credits)
const TS_STRIPE_FOUNDER      = 'https://buy.stripe.com/5kQ9AS59vdVS1mvdfv0ZW08';
// Credits-Pakete
const TS_STRIPE_CREDITS_15   = 'https://buy.stripe.com/fZu4gy45rg400ir0sJ0ZW07'; // Schnuppern  1,99 €
const TS_STRIPE_CREDITS_45   = 'https://buy.stripe.com/3cIfZgeK59FCaX51wN0ZW06'; // Standard   5,49 €
const TS_STRIPE_CREDITS_99   = 'https://buy.stripe.com/3cIcN41Xj2daghp0sJ0ZW05'; // Profi     10,99 €
// Abo
const TS_STRIPE_ABO_29       = 'https://buy.stripe.com/4gM4gygSd8By6GP0sJ0ZW04'; // 4,99 €/Monat, 29 Credits
// Legacy
const TS_STRIPE_CREDITS_100  = '';
const TS_STRIPE_CREDITS_300  = '';
const TS_STRIPE_PREMIUM      = '';

let licenseKey = localStorage.getItem('ts_license_key') || '';

// Credits-Kosten pro Feature (muss mit worker.js übereinstimmen)
const KI_COSTS = {
  thema_vorschlag:    { credits: 1, label: 'Themenvorschläge',          desc: 'Schnelle KI-Vorschläge' },
  feld_refresh:       { credits: 1, label: 'Feld neu generieren',       desc: 'Einzelnes Feld der Stundenvorbereitung' },
  sequenzplanung:     { credits: 2, label: 'Sequenzplanung',            desc: 'Sequenzen für einen Lernbereich' },
  jahresplanung:      { credits: 3, label: 'Jahresplanung',             desc: 'Vollständige Jahresplanung' },
  stundenvorbereitung:{ credits: 3, label: 'Stundenvorbereitung',       desc: 'Detaillierter Verlaufsplan' },
  arbeitsblatt:       { credits: 3, label: 'Arbeitsblatt-Generator',    desc: 'Fertiges Arbeitsblatt mit Lösung' },
  interaktiv:         { credits: 3, label: 'Interaktives Arbeitsblatt', desc: 'HTML5-Lernspiel (Kosten je nach Umfang)' },
  tafelbild:          { credits: 2, label: 'Tafelbild-Planer',          desc: 'Strukturiertes Tafelbild' },
  praesentation:      { credits: 2, label: 'Präsentations-Wizard',      desc: 'Präsentation mit Struktur' },
  differenzierung:    { credits: 2, label: 'Differenzierungshelfer',    desc: 'Differenzierte Aufgaben' },
  elternbrief:        { credits: 2, label: 'Elternbrief-Assistent',     desc: 'DSGVO-konformer Elternbrief' },
};

function _kiConfirmDialog(feature, creditsOverride) {
  return new Promise(resolve => {
    const base = KI_COSTS[feature] || { credits: 1, label: feature, desc: '' };
    const cost = creditsOverride !== undefined ? { ...base, credits: creditsOverride } : base;
    const isFlatrate = state.plan === 'premium';
    const currentCredits = state.ki_credits || 0;

    const existing = document.getElementById('ki-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ki-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';

    const afterCredits = isFlatrate ? null : currentCredits - cost.credits;
    const creditInfo = isFlatrate
      ? `<div style="color:var(--ts-teal);font-weight:600;font-size:.9rem">Flatrate — unbegrenzte Anfragen ✓</div>`
      : `<div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--ts-text-secondary);margin-top:.25rem">
           <span>Guthaben jetzt: <strong>${currentCredits}</strong></span>
           <span>→ danach: <strong style="color:${afterCredits < 5 ? '#e04' : 'var(--ts-teal)'}">${afterCredits}</strong></span>
         </div>`;

    modal.innerHTML = `
      <div style="background:var(--ts-bg-card);border-radius:16px;padding:1.5rem;max-width:320px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;margin-bottom:.25rem">⚡ KI-Aktion bestätigen</div>
        <div style="color:var(--ts-text-secondary);font-size:.85rem;margin-bottom:1rem">${cost.desc}</div>
        <div style="background:var(--ts-bg);border-radius:10px;padding:.85rem 1rem;margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">${cost.label}</span>
            <span style="font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--ts-teal)">${isFlatrate ? '∞' : cost.credits + ' Credit' + (cost.credits > 1 ? 's' : '')}</span>
          </div>
          ${creditInfo}
        </div>
        <div style="display:flex;gap:.5rem">
          <button onclick="document.getElementById('ki-confirm-modal').remove();window._kiConfirmResolve(false)"
            style="flex:1;padding:10px;border:1.5px solid var(--ts-border,#e0e0e0);background:none;border-radius:8px;cursor:pointer;font-size:.9rem;color:var(--ts-text)">
            Abbrechen
          </button>
          <button id="ki-confirm-ok-btn" onclick="this.disabled=true;this.textContent='…';document.getElementById('ki-confirm-modal').remove();window._kiConfirmResolve(true)"
            style="flex:2;padding:10px;background:var(--ts-teal);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600">
            Generieren ✦
          </button>
        </div>
      </div>`;

    window._kiConfirmResolve = resolve;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) { modal.remove(); resolve(false); } });
  });
}

async function verifyLicense() {
  if (!licenseKey) return { valid: false };
  try {
    const res = await fetch(TS_API + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TS_API_TOKEN },
      body: JSON.stringify({ key: licenseKey })
    });
    const data = await res.json();
    if (data.valid) {
      updateCreditDisplay(data.credits, data.isFlatrate);
      state.ki_credits = data.isFlatrate ? 999999 : (data.credits || 0);
      state.plan = data.plan || (data.isFlatrate ? 'premium' : 'credits');
      saveState();
      updateToolsNavState();
    }
    return data;
  } catch (e) {
    return { valid: false, error: 'offline' };
  }
}

function setLicenseKey(key) {
  licenseKey = key.trim().toUpperCase();
  localStorage.setItem('ts_license_key', licenseKey);
}

function isPremiumUser() {
  return ['founder','abo','premium'].includes(state.plan || '');
}

const TOOL_VIEWS = ['tool-arbeitsblatt','tool-tafelbild','tool-differenzierung','tool-interaktiv','tool-elternbrief','tool-appbaukasten'];

function updateToolsNavState() {
  const locked = !isPremiumUser();
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    if (TOOL_VIEWS.includes(btn.dataset.view)) {
      btn.classList.toggle('nav-item--locked', locked);
    }
  });
}

async function callKI(feature, context, creditsOverride) {
  if (!licenseKey) {
    _showToast('Bitte zuerst einen Lizenzschlüssel eingeben (Einstellungen → Abo & KI).', 'error');
    navigate('einstellungen');
    return null;
  }
  const confirmed = await _kiConfirmDialog(feature, creditsOverride);
  if (!confirmed) return null;

  // Loading-Spinner anzeigen
  const loadingEl = _kiShowLoading();
  try {
    const res = await fetch(TS_API + '/api/ki', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TS_API_TOKEN },
      body: JSON.stringify({ key: licenseKey, feature, context })
    });
    const data = await res.json();
    loadingEl.remove();
    if (data.error === 'no_credits') { showCreditsDialog(); return null; }
    if (data.error) { _showToast('KI-Fehler: ' + (data.message || data.error), 'error'); return null; }
    updateCreditDisplay(data.credits, data.isFlatrate);
    if (!data.isFlatrate && data.credits !== undefined) {
      state.ki_credits = data.credits;
      saveState();
    }
    const parsed = _kiParseResult(data.result);
    if (!parsed) {
      console.error('[TeachSmarter] KI Parse failed. Raw result (first 2000 chars):', (data.result||'').substring(0, 2000));
      _showToast('KI-Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.', 'error');
    }
    return parsed;
  } catch (e) {
    loadingEl.remove();
    _showToast('Verbindungsfehler. Bitte Internetverbindung prüfen.', 'error');
    return null;
  }
}

/* KI-Ladeanzeige */
function _kiShowLoading(){
  const el = document.createElement('div');
  el.id = 'ki-loading-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center';
  el.innerHTML = `<div style="background:var(--ts-bg-card);border-radius:16px;padding:1.5rem 2rem;display:flex;flex-direction:column;align-items:center;gap:.75rem;box-shadow:0 8px 32px rgba(0,0,0,.25)">
    <div style="width:36px;height:36px;border:3px solid var(--ts-teal);border-top-color:transparent;border-radius:50%;animation:ts-spin .8s linear infinite"></div>
    <div style="font-family:var(--font-display);font-weight:600;color:var(--ts-text)">KI generiert…</div>
    <div style="font-size:.78rem;color:var(--ts-text-secondary)">Einen Moment bitte</div>
  </div>`;
  document.body.appendChild(el);
  return el;
}

/* Toast-Benachrichtigung statt alert() */
function _showToast(msg, type='info'){
  const existing = document.getElementById('ts-toast');
  if(existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'ts-toast';
  const colors = { error:'#D4574E', success:'#3BA89B', info:'#1A3C5E' };
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${colors[type]||colors.info};color:#fff;padding:10px 20px;border-radius:10px;font-size:.88rem;font-weight:500;z-index:10001;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90vw;text-align:center;animation:ts-slide-up .25s ease`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function _kiParseResult(raw) {
  if (!raw) return null;
  // Separator format for interaktiv (HTML embedded in JSON is unreliable)
  if (raw.includes('---HTML---')) {
    const tM = raw.match(/---TITEL---\s*([\s\S]*?)\s*---TYP---/);
    const yM = raw.match(/---TYP---\s*([\s\S]*?)\s*---HTML---/);
    const hM = raw.match(/---HTML---\s*([\s\S]*?)(?:\s*---END---|$)/);
    if (hM) return { titel: tM?.[1]?.trim()||'', typ: yM?.[1]?.trim()||'', html: hM[1].trim() };
  }
  // Fallback: KI hat Delimiter vergessen, aber direkt HTML geliefert
  // Suche nach <!DOCTYPE html> oder <html — auch innerhalb von Markdown-Fences
  const rawStripped = raw.replace(/^```(?:html)?\s*/im, '').replace(/\s*```\s*$/m, '');
  const htmlDirect = rawStripped.match(/(<!DOCTYPE\s+html[\s\S]*)/i) || rawStripped.match(/(<html[\s\S]*)/i);
  if (htmlDirect) {
    // Titel aus <title>-Tag extrahieren falls vorhanden
    const titleM = htmlDirect[1].match(/<title[^>]*>([^<]+)<\/title>/i);
    return { titel: titleM?.[1]?.trim() || '', typ: '', html: htmlDirect[1].trim() };
  }
  // Direct parse
  try { return JSON.parse(raw); } catch(e) {}
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) try { return JSON.parse(fenced[1].trim()); } catch(e) {}
  // Extract first [...] or {...} block
  const arrMatch = raw.match(/(\[[\s\S]*\])/);
  if (arrMatch) try { return JSON.parse(arrMatch[1]); } catch(e) {}
  const objMatch = raw.match(/(\{[\s\S]*\})/);
  if (objMatch) try { return JSON.parse(objMatch[1]); } catch(e) {}
  console.error('KI: JSON parse failed, raw result:', raw);
  return null;
}

function updateCreditDisplay(credits, isFlatrate) {
  // Update header badge (if present)
  const badge = document.getElementById('ki-credits-badge');
  if (badge) badge.textContent = isFlatrate ? '∞' : credits;
  // Update Einstellungen display
  const val = document.getElementById('es-credits-val');
  if (val) val.textContent = isFlatrate ? '∞ Flatrate' : credits;
  const bar = document.querySelector('.es-credits-bar');
  if (bar) bar.style.width = isFlatrate ? '100%' : Math.min(100, (credits / 10)) + '%';
}

function showCreditsDialog() {
  // Einfaches Modal mit Kauf-Links
  const existing = document.getElementById('ki-credits-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'ki-credits-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  const close = `onclick="document.getElementById('ki-credits-modal').remove()"`;
  const btnPrimary = `display:block;background:var(--ts-teal);color:#fff;text-align:center;padding:11px;border-radius:10px;text-decoration:none;font-weight:600;margin-bottom:8px`;
  const btnSecondary = `display:block;background:var(--ts-bg-warm);color:var(--ts-navy);text-align:center;padding:11px;border-radius:10px;text-decoration:none;font-weight:600;margin-bottom:8px`;
  modal.innerHTML = `
    <div style="background:var(--ts-bg-card);border-radius:20px;padding:1.5rem;max-width:360px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.28)">
      <div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;margin-bottom:.25rem">⚡ KI-Credits nachkaufen</div>
      <p style="color:var(--ts-text-secondary);font-size:.82rem;margin-bottom:1.25rem;line-height:1.5">Wähle dein Paket — Credits verfallen nicht.</p>

      <a href="${TS_STRIPE_CREDITS_15}" target="_blank" style="${btnSecondary}" ${close}>
        <span style="font-size:.78rem;opacity:.7;display:block;margin-bottom:1px">Schnuppern</span>
        15 Credits — <strong>1,99 €</strong>
        <span style="font-size:.72rem;opacity:.6;margin-left:6px">≈ 5–7 Ideen</span>
      </a>
      <a href="${TS_STRIPE_CREDITS_45}" target="_blank" style="${btnPrimary}" ${close}>
        <span style="font-size:.78rem;opacity:.85;display:block;margin-bottom:1px">Standard · Beliebt</span>
        45 Credits — <strong>5,49 €</strong>
        <span style="font-size:.72rem;opacity:.8;margin-left:6px">≈ 15 Arbeitsblätter</span>
      </a>
      <a href="${TS_STRIPE_CREDITS_99}" target="_blank" style="${btnSecondary}" ${close}>
        <span style="font-size:.78rem;opacity:.7;display:block;margin-bottom:1px">Profi</span>
        99 Credits — <strong>10,99 €</strong>
        <span style="font-size:.72rem;opacity:.6;margin-left:6px">≈ 33 Arbeitsblätter</span>
      </a>

      <div style="border-top:1px solid var(--ts-border-light);margin:12px 0 10px"></div>
      <a href="${TS_STRIPE_ABO_29}" target="_blank" style="${btnSecondary}" ${close}>
        <span style="font-size:.78rem;opacity:.7;display:block;margin-bottom:1px">Abo · Features inklusive</span>
        29 Credits/Monat — <strong>4,99 €</strong>
        <span style="font-size:.72rem;opacity:.6;margin-left:6px">+ Rollover bis 58</span>
      </a>

      <button ${close} style="width:100%;padding:8px;border:none;background:none;color:var(--ts-text-muted);cursor:pointer;font-size:.85rem;margin-top:4px">Abbrechen</button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ═══ STATE ═══ */
let state = {};
let currentView = 'heute';
let wocheOffset = 0;
let heuteOffset = 0;

/* ═══ STORAGE (localForage with localStorage migration) ═══ */
const STORAGE_KEYS = ['ts_state','ts_events','ts_jahresplan_v2','ts_notizen','ts_stunden'];

/* loadState: liest ts_state aus IndexedDB (via CryptoManager → verschlüsselt nach PIN-Unlock).
   Fällt auf localStorage zurück, falls IndexedDB-Eintrag noch nicht vorhanden (Erststart / v1-Nutzer). */
async function loadState(){
  try {
    const data = await CryptoManager.getItem('ts_state');
    if(data && typeof data === 'object') { state = data; return; }
  } catch(e){}
  // Fallback: localStorage (Pre-DSGVO-Upgrade oder kein Crypto-Gerät)
  try { const s=localStorage.getItem('ts_state'); if(s) state=JSON.parse(s); } catch(e){}
}

/* saveState: schreibt state verschlüsselt in IndexedDB (fire-and-forget).
   DSGVO: Vorname, Schulname, Klassen, Stundenplan — alles lokal + verschlüsselt. */
function saveState(){
  CryptoManager.setItem('ts_state', state).catch(e => console.error('[TSStore] saveState error:', e));
}

function getAllFaecher(){ return [...FAECHER, ...(state.customFaecher||[])]; }
function getFach(id){ return getAllFaecher().find(f => f.id === id) || (state.ags||[]).find(a => a.id === id); }
function getKlasse(id){ return (state.klassen||[]).find(k => k.id === id); }
function getZeitraster(){ return state.zeitraster || DEFAULT_ZEITRASTER; }

/* Tagesoverride > Stundenplan-Fallback */
function getEffectiveLesson(datum, dayIndex, slotIdx){
  const ok = `${datum}_${dayIndex}_${slotIdx}`;
  const ov = state.tagesOverrides && state.tagesOverrides[ok];
  if(ov) return { ...ov, _isOverride:true };
  const spKey = `${dayIndex}-${slotIdx}`;
  const sp = state.stundenplan && state.stundenplan[spKey];
  if(sp) return { ...sp, _isOverride:false };
  return null;
}

/* Schuljahresbeginn (1. Sept.) */
function getSchuljahrStart(){
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear()-1;
  return new Date(y, 8, 1);
}

/* ═══ HELPERS ═══ */
function dateStr(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* Datum-String YYYY-MM-DD → DD.MM.YYYY für die Anzeige */
function dateDe(s){
  if(!s) return '';
  const p = s.split('-');
  if(p.length !== 3) return s;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

function getMonday(d){
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getWeekNumber(d){
  const date = new Date(d.getTime());
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/* ═══ NAVIGATION ═══ */
function navigate(viewId){
  currentView = viewId;

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if(target) target.classList.add('active');

  const titles = {
    heute:'Heute', woche:'Woche', monat:'Monatsansicht', planung:'Jahres- & Sequenzplanung',
    'ferien-countdown':'Ferien-Countdown',
    stundenvorbereitung:'Stundenvorbereitung', notizen:'Notizen', einstellungen:'Einstellungen',
    'tool-arbeitsblatt':'Arbeitsblatt-Generator','tool-tafelbild':'Tafelbild-Planer',
    'tool-elternbrief':'Elternbrief-Assistent','tool-differenzierung':'Differenzierungshelfer',
    'tool-interaktiv':'Interaktive Arbeitsblätter (HTML5)',
    'tool-appbaukasten':'App-Baukasten',
    'materialdatenbank':'Materialdatenbank'
  };
  document.getElementById('header-title').textContent = titles[viewId] || viewId;

  closeSidebar();
  document.getElementById('content').scrollTop = 0;

  // Panel auto-show/hide
  if(viewId === 'planung'){ if(typeof showPanel==='function') showPanel(); if(typeof renderPlanung==='function') renderPlanung(); }
  else { if(typeof hidePanel==='function') hidePanel(); }
  if(viewId === 'einstellungen'){ if(typeof renderEinstellungen==='function') renderEinstellungen(); }
  if(viewId === 'ferien-countdown'){ if(typeof renderFerienCountdown==='function') renderFerienCountdown(); }
  if(viewId === 'tool-arbeitsblatt'){ if(typeof renderToolArbeitsblatt==='function') renderToolArbeitsblatt(); }
  if(viewId === 'tool-tafelbild'){ if(typeof renderToolTafelbild==='function') renderToolTafelbild(); }
  if(viewId === 'tool-differenzierung'){ if(typeof renderToolDifferenzierung==='function') renderToolDifferenzierung(); }
  if(viewId === 'tool-interaktiv'){ if(typeof renderToolInteraktiv==='function') renderToolInteraktiv(); }
  if(viewId === 'tool-elternbrief'){ if(typeof renderToolElternbrief==='function') renderToolElternbrief(); }
  if(viewId === 'tool-appbaukasten'){ if(typeof renderToolAppBaukasten==='function') renderToolAppBaukasten(); }
  if(viewId === 'materialdatenbank'){ if(typeof renderMaterialdatenbank==='function') renderMaterialdatenbank(); }
}

function navigateKlasse(klasseId){
  const k = getKlasse(klasseId);
  if(!k) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-klasse-detail').classList.add('active');
  document.getElementById('klasse-detail-title').textContent = `Klasse ${k.name}`;
  document.getElementById('header-title').textContent = `Klasse ${k.name}`;
  const navBtn = document.querySelector(`[data-klasse="${klasseId}"]`);
  if(navBtn) navBtn.classList.add('active');
  if(typeof hidePanel==='function') hidePanel();
  closeSidebar();
  if(typeof renderKlasseDetail==='function') renderKlasseDetail(klasseId);
}

function buildKlassenNav(){
  const container = document.getElementById('klassen-nav');
  if(!state.klassen || !state.klassen.length){
    container.innerHTML = '<div class="nav-item" style="color:var(--ts-text-muted);font-style:italic;cursor:default"><span class="nav-icon">—</span><span class="nav-label">Keine Klassen</span></div>';
    return;
  }
  container.innerHTML = state.klassen.map(k =>
    `<button class="nav-item" data-klasse="${esc(k.id)}" onclick="navigateKlasse('${esc(k.id)}')">
      <span class="nav-icon">👥</span><span class="nav-label">${esc(k.name)}${k.sus ? ' · '+esc(k.sus)+' SuS':''}</span>
    </button>`
  ).join('');
}

/* ═══ SIDEBAR ═══ */
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

/* ═══ KI BUTTON ═══ */
function openKI(){
  alert('🧠 KI-Assistent\n\nDer kontextsensitive KI-Assistent wird in Woche 8 integriert.\n\nEr wird automatisch wissen, welches Fach, welche Klasse und welches Thema gerade relevant ist.');
  closeSidebar();
}

/* ═══ PRINT ═══ */
function printView(){ window.print(); }

/* ═══════════════════════════════════════════
   TSStore — IndexedDB-Wrapper (ersetzt localStorage für verschlüsselte Daten)
   ═══════════════════════════════════════════ */
const TSStore = (() => {
  const DB_NAME = 'teachsmarter_v1';
  const DB_VER  = 1;
  const STORE   = 'kv';
  let _db = null;

  function _open(){
    if(_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = e => {
        if(!e.target.result.objectStoreNames.contains(STORE))
          e.target.result.createObjectStore(STORE);
      };
      r.onsuccess = e => { _db = e.target.result; res(_db); };
      r.onerror   = e => rej(e.target.error);
    });
  }

  async function getItem(key){
    const db = await _open();
    return new Promise((res, rej) => {
      const r = db.transaction(STORE,'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror   = e => rej(e.target.error);
    });
  }

  async function setItem(key, val){
    const db = await _open();
    return new Promise((res, rej) => {
      const r = db.transaction(STORE,'readwrite').objectStore(STORE).put(val, key);
      r.onsuccess = () => res();
      r.onerror   = e => rej(e.target.error);
    });
  }

  async function removeItem(key){
    const db = await _open();
    return new Promise((res, rej) => {
      const r = db.transaction(STORE,'readwrite').objectStore(STORE).delete(key);
      r.onsuccess = () => res();
      r.onerror   = e => rej(e.target.error);
    });
  }

  // Einmalige Migration: localStorage → IndexedDB
  async function migrate(){
    const done = await getItem('_ts_idb_migrated');
    if(done) return;
    const keys = [
      'ts_pin_verify','ts_crypto_salt',
      'ts_state',                              // DSGVO: Lehrerdaten verschlüsselt speichern
      'ts_events','ts_jahresplan_v2','ts_notizen',
      'ts_stunden','ts_material_db'
    ];
    try {
      const st = localStorage.getItem('ts_state');
      if(st)(JSON.parse(st).klassen||[]).forEach(k=>keys.push('ts_kl_'+k.id));
    } catch(e){}
    for(const k of keys){
      const v = localStorage.getItem(k);
      if(v !== null) await setItem(k, v);
    }
    await setItem('_ts_idb_migrated','1');
    console.log('[TSStore] Migration abgeschlossen:', keys.filter(k=>localStorage.getItem(k)!==null).length, 'Schlüssel');
  }

  return { getItem, setItem, removeItem, migrate };
})();

/* ═══════════════════════════════════════════
   CryptoManager — AES-256-GCM, PBKDF2, basiert auf TSStore (IndexedDB)
   ═══════════════════════════════════════════ */
const CryptoManager = {
  _key: null,
  get unlocked(){ return this._key !== null; },

  _b2b(b64){ return Uint8Array.from(atob(b64), c=>c.charCodeAt(0)); },
  _b2s(u8){ return btoa(String.fromCharCode(...(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8)))); },

  async _deriveKey(pin, saltB64){
    const saltBytes = this._b2b(saltB64);
    const baseKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt:saltBytes, iterations:200000, hash:'SHA-256' },
      baseKey, { name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']
    );
  },

  /* ── Session-Key (sessionStorage, tab-gebunden, nicht persistent) ── */
  async saveSession(){
    if(!this._key) return;
    try {
      const raw = await crypto.subtle.exportKey('raw', this._key);
      sessionStorage.setItem('ts_session_key', this._b2s(new Uint8Array(raw)));
    } catch(e){ /* Private-Browsing oder Policy-Block → stumm ignorieren */ }
  },

  async restoreSession(){
    const stored = sessionStorage.getItem('ts_session_key');
    if(!stored) return false;
    try {
      this._key = await crypto.subtle.importKey(
        'raw', this._b2b(stored), { name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']
      );
      // Kurztest: verify-Token entschlüsseln um sicherzustellen dass der Key noch passt
      const v = await TSStore.getItem('ts_pin_verify');
      if(v){
        const [ivB64, dataB64] = v.split('.');
        const dec = await crypto.subtle.decrypt(
          {name:'AES-GCM', iv:this._b2b(ivB64)}, this._key, this._b2b(dataB64)
        );
        if(new TextDecoder().decode(dec) !== 'ts-ok') throw new Error('key mismatch');
      }
      return true;
    } catch(e){
      sessionStorage.removeItem('ts_session_key');
      this._key = null;
      return false;
    }
  },

  lockSession(){
    sessionStorage.removeItem('ts_session_key');
    this._key = null;
  },

  async init(pin){
    let salt = await TSStore.getItem('ts_crypto_salt');
    if(!salt){
      salt = this._b2s(crypto.getRandomValues(new Uint8Array(16)));
      await TSStore.setItem('ts_crypto_salt', salt);
    }
    this._key = await this._deriveKey(pin, salt);
  },

  async verifyPin(pin){
    const v    = await TSStore.getItem('ts_pin_verify');
    if(!v) return false;   // kein gespeicherter Verify-Token → PIN nicht bekannt → ablehnen
    const salt = await TSStore.getItem('ts_crypto_salt');
    if(!salt) return false; // kein Salt → Daten inkonsistent → ablehnen
    const testKey = await this._deriveKey(pin, salt);
    try {
      const [ivB64, dataB64] = v.split('.');
      const dec = await crypto.subtle.decrypt(
        {name:'AES-GCM', iv:this._b2b(ivB64)}, testKey, this._b2b(dataB64)
      );
      return new TextDecoder().decode(dec) === 'ts-ok';
    } catch(e){ return false; }
  },

  async storeVerify(){
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      {name:'AES-GCM', iv}, this._key, new TextEncoder().encode('ts-ok')
    );
    await TSStore.setItem('ts_pin_verify', this._b2s(iv) + '.' + this._b2s(enc));
  },

  async _enc(str){
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      {name:'AES-GCM', iv}, this._key, new TextEncoder().encode(str)
    );
    return this._b2s(iv) + '.' + this._b2s(enc);
  },

  async _dec(stored){
    const [ivB64, dataB64] = stored.split('.');
    const dec = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:this._b2b(ivB64)}, this._key, this._b2b(dataB64)
    );
    return new TextDecoder().decode(dec);
  },

  async setItem(key, obj){
    if(!this._key){ await TSStore.setItem(key, JSON.stringify(obj)); return; }
    await TSStore.setItem(key, await this._enc(JSON.stringify(obj)));
  },

  async getItem(key){
    const raw = await TSStore.getItem(key);
    if(!raw) return null;
    if(!this._key){ try{ return JSON.parse(raw); }catch(e){ return null; } }
    if(/^[A-Za-z0-9+/]{16}\./.test(raw)){
      try{ return JSON.parse(await this._dec(raw)); }catch(e){}
    }
    try{ return JSON.parse(raw); }catch(e){ return null; }
  },

  /* PIN ändern: entschlüsselt alle Daten, leitet neuen Key ab, re-verschlüsselt */
  async changePin(newPin){
    const encKeys = [
      'ts_state',                              // DSGVO: Lehrerdaten mitverschieben
      'ts_notizen','ts_stunden','ts_material_db','ts_events','ts_jahresplan_v2',
      ...(state.klassen||[]).map(k=>'ts_kl_'+k.id)
    ];
    const decoded = {};
    for(const k of encKeys) decoded[k] = await this.getItem(k);
    const newSalt = this._b2s(crypto.getRandomValues(new Uint8Array(16)));
    this._key = await this._deriveKey(newPin, newSalt);
    await TSStore.setItem('ts_crypto_salt', newSalt);
    for(const k of encKeys) if(decoded[k] !== null) await this.setItem(k, decoded[k]);
    await this.storeVerify();
  }
};

/* ═══════════════════════════════════════════
   Swipe-to-dismiss — Bottom-Sheet-Modals
   Drag auf .event-modal-handle oder .modal-header
   > 90px nach unten = Modal schließen
   ═══════════════════════════════════════════ */
(function(){
  let _sd = null; // { startY, sheet, overlay }

  document.addEventListener('touchstart', e => {
    const trigger = e.target.closest('.event-modal-handle, .modal-header');
    if (!trigger) return;
    const sheet = trigger.closest('.event-modal, .modal-card, .pl-modal');
    if (!sheet) return;
    const overlay = sheet.parentElement;
    if (!overlay) return;
    _sd = { startY: e.touches[0].clientY, sheet, overlay };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!_sd) return;
    const dy = e.touches[0].clientY - _sd.startY;
    if (dy > 0) {
      _sd.sheet.style.transform = `translateY(${dy}px)`;
      _sd.sheet.style.transition = 'none';
      _sd.sheet.style.opacity = String(Math.max(0.35, 1 - dy / 260));
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!_sd) return;
    const { sheet, overlay } = _sd;
    const dy = e.changedTouches[0].clientY - _sd.startY;
    _sd = null;
    if (dy > 90) {
      sheet.style.transition = 'transform .22s ease, opacity .18s ease';
      sheet.style.transform = 'translateY(110%)';
      sheet.style.opacity = '0';
      setTimeout(() => {
        sheet.style.cssText = '';
        overlay.click(); // triggers onclick="if(event.target===this)closeXxx()"
      }, 220);
    } else {
      sheet.style.transition = 'transform .24s cubic-bezier(.16,1,.3,1), opacity .2s ease';
      sheet.style.transform = '';
      sheet.style.opacity = '';
      setTimeout(() => { sheet.style.transition = ''; }, 240);
    }
  }, { passive: true });
})();

/* ═══ ASYNC INIT ═══ */

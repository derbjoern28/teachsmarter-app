/* ═══════════════════════════════════════════
   ts-app.js — App-Einstiegspunkt & Service Worker
   ═══════════════════════════════════════════ */

// Fix: Chromium/Electron scroll-focus bug — prevent overflow:auto containers
// inside modals from stealing focus when clicking on non-interactive elements.
// Without this, clicking a chip/label/div in a modal locks all text inputs.
document.addEventListener('mousedown', function(e) {
  const scroller = e.target.closest('.event-modal, .ts-modal-scroll');
  if (!scroller) return;
  if (!e.target.closest('input,textarea,select,button,a,label,[tabindex],[contenteditable]')) {
    e.preventDefault();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await TSStore.migrate();
  if(!window.crypto || !window.crypto.subtle){ initApp(); return; }

  // Session-Key aus sessionStorage wiederherstellen — kein PIN-Dialog bei Page-Reload
  if(await CryptoManager.restoreSession()){ initApp(); return; }

  const hasPinVerify = await TSStore.getItem('ts_pin_verify');
  tsShowPinScreen(!hasPinVerify);
});

async function initApp(){
  // ── License Gate ─────────────────────────────────────────────────────
  if (!licenseKey) {
    showLicenseGate();
    return;
  }
  // ─────────────────────────────────────────────────────────────────────

  await loadState(); // liest verschlüsselt aus IndexedDB (DSGVO)

  if(!state.vorname || !(state.klassen||[]).length){
    document.body.innerHTML = '<div style="text-align:center;padding:20vh 2rem;font-family:var(--font-body);color:var(--ts-text)"><h2 style="font-family:var(--font-display);margin-bottom:1rem">Onboarding nicht abgeschlossen</h2><p style="color:var(--ts-text-secondary);margin-bottom:2rem">Bitte richte zuerst deinen Kalender ein.</p><a href="TeachSmarter_App_Onboarding.html" style="background:var(--ts-teal);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Zum Onboarding →</a></div>';
    return;
  }

  await loadEvents();
  await loadJpData();
  await loadNotesCache();
  await loadStundenCache();
  await loadMediaCache();

  const initial = (state.vorname || 'U')[0].toUpperCase();
  document.getElementById('header-avatar').textContent = initial;
  document.getElementById('header-meta-text').textContent = state.vorname;

  buildKlassenNav();
  if(typeof initJpSelectors === 'function') initJpSelectors();
  if(typeof renderHeute === 'function') renderHeute();
  if(typeof renderWoche === 'function') renderWoche();
  if(typeof renderMonat === 'function') renderMonat();
  if(typeof loadHolidays === 'function') loadHolidays();

  const overlay = document.getElementById('pin-overlay');
  if(overlay) overlay.style.display = 'none';

  // Verify license in background (updates credit display if key exists)
  updateToolsNavState();
  if (licenseKey) verifyLicense();
}



/* ══════════════════════════════════════════════
   THEME SYSTEM
   ══════════════════════════════════════════════ */
const THEMES = [
  { id:'light',   label:'Hell',      emoji:'☀️',  desc:'Standard — helles Design' },
  { id:'dark',    label:'Dunkel',    emoji:'🌙',  desc:'Dark Mode — augenschonend abends' },
  { id:'creme',   label:'Creme',     emoji:'📓',  desc:'Warmes Papier-Design — gemütlich & handschriftlich' },
  { id:'blush',   label:'Blush',     emoji:'🌸',  desc:'Zartes Rosé — elegant & weich' },
  { id:'forest',  label:'Wald',      emoji:'🌲',  desc:'Erdige Grüntöne — ruhig & natürlich' },
  { id:'slate',   label:'Schiefer',  emoji:'🪨',  desc:'Kühles Blaugrau — sachlich & präzise' },
  { id:'minimal', label:'Minimal',   emoji:'◻️',  desc:'Reines Schwarz-Weiß — maximal fokussiert' },
  { id:'digital', label:'Digital',   emoji:'💻',  desc:'Matrix-Grün auf Schwarz — Terminal-Look' },
];

function initTheme(){
  const t = localStorage.getItem('ts_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
}

function setTheme(themeId){
  localStorage.setItem('ts_theme', themeId);
  document.documentElement.setAttribute('data-theme', themeId);
  // re-render picker active state without full re-render
  document.querySelectorAll('.es-theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === themeId);
  });
}

// Keep backward compat for old dark-toggle (used nowhere else now)
function esToggleDark(btn){
  const nowDark = !btn.classList.contains('active');
  setTheme(nowDark ? 'dark' : 'light');
}

/* ══════════════════════════════════════════════
   EINSTELLUNGEN
   ══════════════════════════════════════════════ */
function renderEinstellungen(){
  const plan   = state.plan || 'free';
  const credits = state.ki_credits || 0;
  const planLabel = { free:'Kostenlos', starter:'Starter', pro:'Pro ✦' };
  const planCls   = { free:'free', starter:'starter', pro:'pro' };

  document.getElementById('view-einstellungen').innerHTML = `
    <div class="es-page">

      <!-- ── Profil ── -->
      <div class="es-section">
        <div class="es-section-title">Profil bearbeiten</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Vorname / Name</label>
            <input id="es-vorname" class="input" value="${esc(state.vorname||'')}" placeholder="Dein Name">
          </div>
          <div class="es-field">
            <label class="es-label">Schule</label>
            <input id="es-schulname" class="input" value="${esc(state.schulname||'')}" placeholder="Name der Schule">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Land</label>
              <select id="es-land" class="input" onchange="esLandChange()">
                <option value="DE"${(state.land||'DE')==='DE'?' selected':''}>🇩🇪 Deutschland</option>
                <option value="AT"${state.land==='AT'?' selected':''}>🇦🇹 Österreich</option>
                <option value="CH"${state.land==='CH'?' selected':''}>🇨🇭 Schweiz</option>
              </select>
            </div>
            <div class="es-field" style="flex:2">
              <label class="es-label" id="es-bl-label">${(state.land==='CH')?'Kanton':'Bundesland'}</label>
              <select id="es-bundesland" class="input">
                ${(STATES_BY_LAND[state.land||'DE']||BUNDESLAENDER_DE).map(b=>`<option${state.bundesland===b?' selected':''}>${b}</option>`).join('')}
              </select>
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Schulart</label>
              <select id="es-schulart" class="input">
                ${SCHULARTEN.map(s=>`<option${state.schulart===s?' selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="es-btn-row">
            <button class="btn btn-primary btn-sm" style="width:auto" onclick="esSaveProfile()">Speichern</button>
            <span id="es-profile-saved" class="note-saved">Gespeichert ✓</span>
          </div>
        </div>
      </div>

      <!-- ── PIN ── -->
      <div class="es-section">
        <div class="es-section-title">PIN ändern</div>
        <div class="es-card">
          <div class="es-field">
            <label class="es-label">Aktueller PIN</label>
            <input id="es-pin-old" class="input" type="password" inputmode="numeric"
                   maxlength="8" placeholder="••••" autocomplete="current-password">
          </div>
          <div class="es-field-row">
            <div class="es-field" style="flex:1">
              <label class="es-label">Neuer PIN</label>
              <input id="es-pin-new" class="input" type="password" inputmode="numeric"
                     maxlength="8" placeholder="••••" autocomplete="new-password">
            </div>
            <div class="es-field" style="flex:1">
              <label class="es-label">Bestätigen</label>
              <input id="es-pin-confirm" class="input" type="password" inputmode="numeric"
                     maxlength="8" placeholder="••••" autocomplete="new-password">
            </div>
          </div>
          <div id="es-pin-msg" class="es-msg" style="display:none"></div>
          <div class="es-btn-row">
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esChangePin()">PIN ändern</button>
            <button class="btn btn-ghost btn-sm" style="width:auto" onclick="esLockSession()">🔒 Sitzung sperren</button>
          </div>
          <div class="es-hint">Der PIN schützt deine Daten. Beim Ändern werden alle gespeicherten Daten mit dem neuen PIN neu verschlüsselt. „Sitzung sperren" schließt die aktuelle Sitzung sofort — der PIN wird beim nächsten Öffnen wieder abgefragt.</div>
        </div>
      </div>

      <!-- ── Erscheinungsbild ── -->
      <div class="es-section">
        <div class="es-section-title">Erscheinungsbild</div>
        <div class="es-card" style="gap:var(--sp-sm)">
          <div class="es-toggle-desc">Wähle deinen persönlichen Look — die Änderung gilt sofort.</div>
          <div class="es-theme-grid">
            ${THEMES.map(t => {
              const active = (localStorage.getItem('ts_theme') || 'light') === t.id;
              return `<button class="es-theme-card${active?' active':''}" data-theme="${t.id}" onclick="setTheme('${t.id}')" title="${t.desc}">
                <div class="es-theme-preview es-theme-preview--${t.id}"></div>
                <div class="es-theme-label">${t.emoji} ${t.label}</div>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- ── Eigene Fächer ── -->
      <div class="es-section">
        <div class="es-section-title">Eigene Fächer</div>
        <div class="es-card">
          <div class="es-toggle-desc" style="margin-bottom:var(--sp-sm)">Erstelle eigene Fachbezeichnungen, die an deiner Schule verwendet werden — z.B. „MNT", „WAT" oder „BNT".</div>
          <div id="es-custom-faecher-list">${_esCustomFaecherHtml()}</div>
          <div class="es-custom-fach-add" id="es-custom-fach-add-row" style="display:none">
            <div class="es-custom-fach-inputs">
              <input id="es-cf-name" class="input" placeholder="Fachname *" autocomplete="off" style="flex:1;min-width:0" onkeydown="if(event.key==='Enter')esCustomFachSave()">
              <div class="es-cf-colors" id="es-cf-colors">${_esCfColorSwatches()}</div>
              <input id="es-cf-hex" class="input" type="color" value="#3BA89B" title="Eigene Farbe" style="width:40px;min-width:40px;padding:2px 4px;cursor:pointer">
            </div>
            <div class="es-btn-row" style="margin-top:var(--sp-xs)">
              <button class="btn btn-primary btn-sm" style="width:auto" onclick="esCustomFachSave()">Fach anlegen</button>
              <button class="btn btn-ghost btn-sm" style="width:auto" onclick="esCustomFachCancelAdd()">Abbrechen</button>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="es-cf-add-btn" style="width:auto;margin-top:var(--sp-xs)" onclick="esCustomFachShowAdd()">＋ Eigenes Fach hinzufügen</button>
        </div>
      </div>

      <!-- ── Klassen ── -->
      <div class="es-section">
        <div class="es-section-title">Klassen verwalten</div>
        <div class="es-card">
          <div id="es-klassen-list">
            ${(state.klassen||[]).map(k=>`
              <div class="es-klasse-row" id="es-kl-${esc(k.id)}">
                <div class="es-klasse-dot" style="background:var(--ts-teal)">👥</div>
                <div class="es-klasse-info">
                  <input class="input es-klasse-name-input" value="${esc(k.name||'')}"
                         onchange="esUpdateKlasse('${esc(k.id)}','name',this.value)" style="min-height:36px;font-size:.88rem">
                  <div class="es-klasse-meta">
                    <input class="input es-klasse-sus-input" type="number" min="1" max="40"
                           value="${esc(String(k.sus||''))}" placeholder="Anz. SuS"
                           onchange="esUpdateKlasse('${esc(k.id)}','sus',this.value)" style="min-height:32px;width:90px;font-size:.82rem">
                    <span class="es-label" style="line-height:32px">SuS</span>
                  </div>
                  <div class="es-klasse-faecher-label">Fächer:</div>
                  <div class="es-klasse-faecher" id="es-kl-faecher-${esc(k.id)}">
                    ${getAllFaecher().map(f=>{ const sel=(k.faecher||[]).includes(f.id); return `<button class="es-fach-chip${sel?' sel':''}" style="${sel?'background:'+f.color+'20;border-color:'+f.color+';color:'+f.color:''}" onclick="esToggleFach('${esc(k.id)}','${esc(f.id)}')"><span class="es-fach-dot" style="background:${f.color}"></span>${esc(f.name)}</button>`; }).join('')}
                  </div>
                </div>
                <button class="es-klasse-del" onclick="esDeleteKlasse('${esc(k.id)}')" title="Klasse entfernen">✕</button>
              </div>
            `).join('')}
            ${!(state.klassen||[]).length?'<div class="kl-empty" style="padding:var(--sp-md)">Noch keine Klassen angelegt.</div>':''}
          </div>
          <div class="es-btn-row" style="margin-top:var(--sp-sm)">
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esAddKlasse()">+ Klasse hinzufügen</button>
            <span id="es-klassen-saved" class="note-saved">Gespeichert ✓</span>
          </div>
          <div class="es-hint">Für detaillierte Einstellungen (Fächer, Stundenplan pro Klasse) bitte im Onboarding konfigurieren.</div>
        </div>
      </div>

      <!-- ── Stundenplan Quick-Edit ── -->
      <div class="es-section">
        <div class="es-section-title">Stundenplan</div>
        <div class="es-card">
          <div class="es-sp-info">
            <div class="es-toggle-label">Aktueller Stundenplan</div>
            <div class="es-toggle-desc">${_spSummary()}</div>
          </div>
          <div class="es-btn-row">
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esOpenSpEditor()">Stundenplan bearbeiten</button>
          </div>
          <div id="es-sp-editor" style="display:none;margin-top:var(--sp-md)">
            <div class="es-sp-grid-wrap" id="es-sp-grid"></div>
            <div class="es-hint">Zelle antippen → Fach und Klasse auswählen. Änderungen werden sofort gespeichert.</div>
          </div>
        </div>
      </div>

      <!-- ── Abo & Credits ── -->
      <div class="es-section">
        <div class="es-section-title">Abo &amp; KI-Credits</div>
        <div class="es-card">

          <!-- Lizenzschlüssel -->
          <div class="es-field" style="margin-bottom:var(--sp-sm)">
            <label class="es-label">Lizenzschlüssel</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="es-license-key" class="input" style="flex:1;font-family:monospace;letter-spacing:.06em;text-transform:uppercase"
                     placeholder="TS-F-XXXX-XXXX"
                     value="${licenseKey||''}"
                     oninput="this.value=this.value.toUpperCase()"
                     onkeydown="if(event.key==='Enter')esActivateLicense()">
              <button class="btn btn-primary btn-sm" style="width:auto;white-space:nowrap" onclick="esActivateLicense()">Aktivieren</button>
            </div>
            <div id="es-license-msg" style="font-size:.8rem;margin-top:4px;display:none"></div>
          </div>

          <!-- Credits-Status -->
          <div class="es-abo-row">
            <span class="es-plan-badge es-plan-${planCls[plan]||'free'}">${planLabel[plan]||plan}</span>
            <div class="es-credits-display">
              <span id="es-credits-val">${credits}</span>
              <span class="es-credits-label">KI-Credits</span>
            </div>
          </div>
          <div class="es-credits-bar-wrap">
            <div class="es-credits-bar" style="width:${Math.min(100, credits/10)}%"></div>
          </div>
          <div class="es-abo-actions">
            <button class="btn btn-primary btn-sm" style="width:auto" onclick="esBuyCredits()">⚡ Credits kaufen</button>
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esRefreshLicense()">↻ Aktualisieren</button>
          </div>
          <div class="es-hint">Gib deinen Lizenzschlüssel ein, den du nach dem Kauf per E-Mail erhalten hast. Mit KI-Credits nutzt du den Assistenten für Stundenvorbereitung, Sequenzplanung und Jahresplanung.</div>
        </div>
      </div>

      <!-- ── Stundenplan Import ── -->
      <div class="es-section">
        <div class="es-section-title">Stundenplan-Import</div>
        <div class="es-card">
          <div class="es-toggle-label" style="margin-bottom:4px">WebUntis / Untis iCal</div>
          <div class="es-toggle-desc" style="margin-bottom:var(--sp-md)">Trage deinen persönlichen Untis-Kalenderabo-Link ein. Der Stundenplan wird lokal verarbeitet — keine Daten verlassen das Gerät.</div>
          <div class="es-field">
            <label class="es-label">iCal-URL (WebUntis Kalenderabo)</label>
            <input id="es-ical-url" class="input" type="url"
                   placeholder="https://mope.webuntis.com/WebUntis/Ical?..."
                   value="${state.ical_url||''}">
          </div>
          <div id="es-ical-msg" class="es-msg" style="display:none"></div>
          <div class="es-btn-row">
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esImportICal()">↓ Importieren</button>
          </div>
          <div class="es-hint">Der Import überschreibt den manuell eingetragenen Stundenplan. Du kannst ihn danach noch anpassen. Tipp: Unter WebUntis → Kalender → Kalender-Abonnement findest du deine persönliche iCal-URL.</div>
        </div>
      </div>

      <!-- ── Datensicherung ── -->
      <div class="es-section">
        <div class="es-section-title">Datensicherung</div>
        <div class="es-card">
          <div class="es-toggle-label" style="margin-bottom:4px">Verschlüsselter Export &amp; Import</div>
          <div class="es-toggle-desc" style="margin-bottom:var(--sp-md)">Exportiert alle Daten als verschlüsselte JSON-Datei — ideal für Gerätewechsel oder als Backup. Beim Import auf einem neuen Gerät brauchst du deinen PIN.</div>
          <div class="es-btn-row">
            <button class="btn btn-secondary btn-sm" style="width:auto" onclick="esExportData()">↑ Daten exportieren</button>
            <button class="btn btn-ghost btn-sm" style="width:auto" onclick="esImportData()">↓ Backup importieren</button>
          </div>
          <div class="es-hint">Das Backup enthält alle deine Klassen, Noten, Notizen und Planungen — im selben verschlüsselten Format. Ohne PIN kann niemand die Daten lesen.</div>
        </div>
      </div>

      <!-- ── Meine Statistik ── -->
      <div class="es-section">
        <div class="es-section-title">Meine Statistik</div>
        <div class="es-card" id="es-stat-section">
          <div class="es-hint">Lade …</div>
        </div>
      </div>

      <!-- ── Kompletter Reset ── -->
      <div class="es-section">
        <div class="es-section-title">Kalender zurücksetzen</div>
        <div class="es-card es-card-danger">
          <div class="es-toggle-label" style="margin-bottom:4px">Alle Daten löschen</div>
          <div class="es-toggle-desc" style="margin-bottom:var(--sp-md)">Löscht alle Klassen, Noten, Notizen, Planungen, Stundenplan <strong>und den PIN</strong> — der Kalender wird auf den Werkszustand zurückgesetzt. Diese Aktion kann nicht rückgängig gemacht werden!</div>
          <button class="btn btn-danger btn-sm" style="width:auto" onclick="esFullReset()">⚠ Kalender komplett zurücksetzen</button>
        </div>
      </div>

      <!-- ── DSGVO ── -->
      <div class="es-section">
        <div class="es-section-title">Datenschutz &amp; DSGVO</div>
        <div class="es-card">
          <div class="es-dsgvo-badge">
            <span class="es-dsgvo-icon">🔒</span>
            <div>
              <div class="es-dsgvo-title">Zero-Setup · Kein AVV erforderlich</div>
              <div class="es-dsgvo-desc">Alle Schülerdaten bleiben ausschließlich auf diesem Gerät. Kein Server, keine Cloud, kein Tracking.</div>
            </div>
          </div>
          <div class="es-dsgvo-pills">
            <span class="es-dsgvo-pill">🏠 100 % lokal</span>
            <span class="es-dsgvo-pill">🔐 AES-256 GCM</span>
            <span class="es-dsgvo-pill">📵 Kein Server</span>
            <span class="es-dsgvo-pill">✅ DSGVO-konform</span>
          </div>
          <div class="es-hint">Diese Information kannst du auch Eltern oder der Schulleitung vorzeigen: Da keine personenbezogenen Daten das Gerät verlassen, ist weder eine Einwilligung noch ein Auftragsverarbeitungsvertrag (AVV) erforderlich.</div>
        </div>
      </div>

    </div>
  `;
  // Statistik-Sektion separat füllen (Fehler hier sollen die Hauptseite nicht wegräumen)
  try {
    const sec = document.getElementById('es-stat-section');
    if(sec) sec.innerHTML = _esStatHtml();
  } catch(e) {
    const sec = document.getElementById('es-stat-section');
    if(sec) sec.innerHTML = '<div class="es-hint">Statistik konnte nicht geladen werden.</div>';
  }
}

/* ── Meine Statistik ── */
function _esStatHtml(){
  const sjStart = getSchuljahrStart();
  const sjLabel = `${sjStart.getFullYear()}/${String(sjStart.getFullYear()+1).slice(2)}`;

  // Vertretungen
  const vtgCount = (state.vertretungsLog||[]).filter(v => v.datum >= dateStr(sjStart)).length;

  // Krankentage
  const krank = (state.krankentage||[]).filter(k => k.typ==='krank' && k.datum >= dateStr(sjStart))
    .sort((a,b) => b.datum.localeCompare(a.datum));
  const kindkrank = (state.krankentage||[]).filter(k => k.typ==='kindkrank' && k.datum >= dateStr(sjStart))
    .sort((a,b) => b.datum.localeCompare(a.datum));

  const kranktag = k => `
    <div class="es-kranktag-row">
      <span>${dateDe(k.datum)}</span>
      <button class="btn-icon" style="color:var(--ts-error);font-size:.85rem" onclick="esDeleteKranktag('${k.id}')" title="Eintrag löschen">✕</button>
    </div>`;

  return `
    <div class="es-stat-bar">
      <div class="es-stat-chip">
        <div class="es-stat-num">${vtgCount}</div>
        <div class="es-stat-lbl">Vertretungen ${sjLabel}</div>
      </div>
      <div class="es-stat-chip">
        <div class="es-stat-num">${krank.length}</div>
        <div class="es-stat-lbl">Krankentage ${sjLabel}</div>
      </div>
      <div class="es-stat-chip">
        <div class="es-stat-num">${kindkrank.length}</div>
        <div class="es-stat-lbl">Kindkranktage ${sjLabel}</div>
      </div>
    </div>

    <div class="es-section-sub">Krankentage</div>
    ${krank.length ? krank.map(kranktag).join('') : '<div class="es-hint" style="margin:4px 0">Keine Einträge dieses Schuljahr.</div>'}
    <button class="btn btn-secondary btn-sm" style="width:auto;margin-top:8px" onclick="esAddKranktag('krank')">+ Kranktag eintragen</button>

    <div class="es-section-sub" style="margin-top:var(--sp-md)">Kind-Krankentage</div>
    ${kindkrank.length ? kindkrank.map(kranktag).join('') : '<div class="es-hint" style="margin:4px 0">Keine Einträge dieses Schuljahr.</div>'}
    <button class="btn btn-secondary btn-sm" style="width:auto;margin-top:8px" onclick="esAddKranktag('kindkrank')">+ Kind-Kranktag eintragen</button>
  `;
}

function esAddKranktag(typ){
  document.getElementById('esKranktModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'esKranktModal';
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:320px">
      <div class="modal-header">
        <span>${typ==='krank'?'Kranktag':'Kind-Kranktag'} eintragen</span>
        <button class="modal-close" onclick="document.getElementById('esKranktModal').remove()">✕</button>
      </div>
      <div class="modal-body kl-modal-body">
        <label class="kl-label">Datum</label>
        <input id="esKranktDatum" class="input" type="date" value="${dateStr(new Date())}">
      </div>
      <div class="modal-footer">
        <span style="flex:1"></span>
        <button class="btn btn-secondary" onclick="document.getElementById('esKranktModal').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="_esKranktSave('${typ}')">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('esKranktDatum')?.focus(), 80);
}

function _esKranktSave(typ){
  const datum = document.getElementById('esKranktDatum')?.value;
  if(!datum) return;
  if(!state.krankentage) state.krankentage = [];
  // avoid duplicates
  if(!state.krankentage.find(k => k.datum===datum && k.typ===typ)){
    state.krankentage.push({ id:'kk_'+Date.now().toString(36), datum, typ });
    saveState();
  }
  document.getElementById('esKranktModal')?.remove();
  renderEinstellungen();
}

function esDeleteKranktag(id){
  state.krankentage = (state.krankentage||[]).filter(k => k.id !== id);
  saveState();
  renderEinstellungen();
}

/* ── Land wechseln → Bundesland/Kanton-Liste aktualisieren ── */
function esLandChange() {
  const land  = document.getElementById('es-land').value;
  const list  = STATES_BY_LAND[land] || BUNDESLAENDER_DE;
  const label = document.getElementById('es-bl-label');
  const sel   = document.getElementById('es-bundesland');
  if (label) label.textContent = land === 'CH' ? 'Kanton' : 'Bundesland';
  sel.innerHTML = list.map(b => `<option>${b}</option>`).join('');
}

/* ── Profil speichern ── */
function esSaveProfile(){
  state.vorname   = document.getElementById('es-vorname').value.trim();
  state.schulname = document.getElementById('es-schulname').value.trim();
  state.land      = document.getElementById('es-land').value || 'DE';
  state.bundesland= document.getElementById('es-bundesland').value;
  state.schulart  = document.getElementById('es-schulart').value;
  saveState();
  // Avatar + Header aktualisieren
  const initial = (state.vorname||'U')[0].toUpperCase();
  const av = document.getElementById('header-avatar'); if(av) av.textContent = initial;
  const hm = document.getElementById('header-meta-text'); if(hm) hm.textContent = state.vorname;
  const el = document.getElementById('es-profile-saved');
  if(el){ el.classList.add('visible'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('visible'),2000); }
}

/* ── PIN ändern ── */
async function esChangePin(){
  const oldPin  = document.getElementById('es-pin-old').value;
  const newPin  = document.getElementById('es-pin-new').value;
  const confirm = document.getElementById('es-pin-confirm').value;
  const msgEl   = document.getElementById('es-pin-msg');

  const showMsg = (txt, err=true) => {
    msgEl.textContent = txt;
    msgEl.className = 'es-msg ' + (err ? 'es-msg--err' : 'es-msg--ok');
    msgEl.style.display = '';
  };

  if(!oldPin || !newPin || !confirm){ showMsg('Bitte alle Felder ausfüllen.'); return; }
  if(newPin.length < 4){ showMsg('Neuer PIN muss mindestens 4 Stellen haben.'); return; }
  if(newPin !== confirm){ showMsg('Neuer PIN und Bestätigung stimmen nicht überein.'); return; }
  if(typeof _isPinStrong === 'function' && !_isPinStrong(newPin)){ showMsg('PIN zu einfach – bitte kein 1234, 0000 o.ä.'); return; }

  const valid = await CryptoManager.verifyPin(oldPin);
  if(!valid){ showMsg('Aktueller PIN ist falsch.'); return; }

  showMsg('Daten werden neu verschlüsselt …', false);
  try {
    await CryptoManager.changePin(newPin);
    await CryptoManager.saveSession(); // Session-Key für neuen PIN aktualisieren
    showMsg('PIN erfolgreich geändert. ✓', false);
    document.getElementById('es-pin-old').value = '';
    document.getElementById('es-pin-new').value = '';
    document.getElementById('es-pin-confirm').value = '';
  } catch(e){
    showMsg('Fehler beim Ändern des PINs: ' + e.message);
  }
}

/* ── Sitzung sperren ── */
function esLockSession(){
  if(!confirm('Sitzung jetzt sperren? Der PIN wird beim nächsten Öffnen wieder abgefragt.')) return;
  CryptoManager.lockSession();
  location.reload();
}

/* ── Eigene Fächer in Einstellungen ── */
const CF_COLORS = ['#E74C3C','#E67E22','#F39C12','#2ECC71','#1ABC9C','#3BA89B','#3498DB','#5B8EC9','#9B59B6','#E91E63','#795548','#607D8B'];

function _esCfColorSwatches(selected){
  return CF_COLORS.map(c=>`<button type="button" class="es-cf-swatch${c===selected?' active':''}" style="background:${c}" onclick="esSelectCfColor(this,'${c}')" title="${c}"></button>`).join('');
}

function _esCustomFaecherHtml(){
  const cf = state.customFaecher||[];
  if(!cf.length) return '<div class="kl-eb-empty">Noch keine eigenen Fächer angelegt</div>';
  return cf.map((f,i)=>`
    <div class="es-cf-item">
      <span class="es-fach-dot" style="background:${f.color};width:10px;height:10px;border-radius:50%;flex-shrink:0;display:inline-block"></span>
      <span class="es-cf-name">${esc(f.name)}</span>
      <button class="kl-eb-del" onclick="esCustomFachDelete('${esc(f.id)}')" title="Entfernen">✕</button>
    </div>`).join('');
}

function esCustomFachShowAdd(){
  document.getElementById('es-custom-fach-add-row').style.display = '';
  document.getElementById('es-cf-add-btn').style.display = 'none';
  // reset
  document.getElementById('es-cf-name').value = '';
  document.getElementById('es-cf-hex').value = '#3BA89B';
  document.getElementById('es-cf-colors').innerHTML = _esCfColorSwatches('#3BA89B');
  setTimeout(()=>document.getElementById('es-cf-name').focus(), 60);
}

function esCustomFachCancelAdd(){
  document.getElementById('es-custom-fach-add-row').style.display = 'none';
  document.getElementById('es-cf-add-btn').style.display = '';
}

function esSelectCfColor(btn, color){
  document.getElementById('es-cf-hex').value = color;
  document.querySelectorAll('.es-cf-swatch').forEach(b=>b.classList.toggle('active', b===btn));
}

function esCustomFachSave(){
  const name = document.getElementById('es-cf-name').value.trim();
  if(!name){ document.getElementById('es-cf-name').focus(); return; }
  const color = document.getElementById('es-cf-hex').value || '#3BA89B';
  const id = 'cf_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  if(!state.customFaecher) state.customFaecher = [];
  state.customFaecher.push({id, name, color});
  saveState();
  document.getElementById('es-custom-faecher-list').innerHTML = _esCustomFaecherHtml();
  esCustomFachCancelAdd();
  // re-render klassen fach chips so new fach appears
  const lists = document.querySelectorAll('.es-klasse-faecher');
  lists.forEach(container => {
    const kId = container.id.replace('es-kl-faecher-','');
    const k = (state.klassen||[]).find(k=>k.id===kId);
    if(k) container.innerHTML = getAllFaecher().map(f=>{ const sel=(k.faecher||[]).includes(f.id); return `<button class="es-fach-chip${sel?' sel':''}" style="${sel?'background:'+f.color+'20;border-color:'+f.color+';color:'+f.color:''}" onclick="esToggleFach('${kId}','${f.id}')"><span class="es-fach-dot" style="background:${f.color}"></span>${f.name}</button>`; }).join('');
  });
}

function esCustomFachDelete(id){
  if(!confirm('Eigenes Fach löschen? Das Fach wird auch aus allen Klassen-Zuweisungen entfernt.')) return;
  state.customFaecher = (state.customFaecher||[]).filter(f=>f.id!==id);
  // Remove from all klassen
  (state.klassen||[]).forEach(k=>{ if(k.faecher) k.faecher = k.faecher.filter(fid=>fid!==id); });
  // Remove from stundenplan
  Object.keys(state.stundenplan||{}).forEach(key=>{ if(state.stundenplan[key]?.fachId===id) delete state.stundenplan[key]; });
  saveState();
  renderEinstellungen();
}

/* ── Klassen in Einstellungen ── */
function _spSummary(){
  const sp = state.stundenplan || {};
  const filled = Object.keys(sp).length;
  const total  = (getZeitraster()||[]).length * 5;
  return filled > 0 ? `${filled} von ${total} Slots belegt` : 'Noch nicht eingerichtet';
}

function esUpdateKlasse(id, field, val){
  const k = (state.klassen||[]).find(k=>k.id===id);
  if(!k) return;
  k[field] = field==='sus' ? (parseInt(val)||val) : val;
  saveState();
  buildKlassenNav();
  const el = document.getElementById('es-klassen-saved');
  if(el){ el.classList.add('visible'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('visible'),2000); }
}

function esToggleFach(klasseId, fachId){
  const k = (state.klassen||[]).find(k=>k.id===klasseId);
  if(!k) return;
  if(!k.faecher) k.faecher = [];
  const idx = k.faecher.indexOf(fachId);
  if(idx >= 0) k.faecher.splice(idx, 1);
  else k.faecher.push(fachId);
  saveState();
  const container = document.getElementById('es-kl-faecher-' + klasseId);
  if(container){
    container.innerHTML = getAllFaecher().map(f=>{ const sel=(k.faecher||[]).includes(f.id); return `<button class="es-fach-chip${sel?' sel':''}" style="${sel?'background:'+f.color+'20;border-color:'+f.color+';color:'+f.color:''}" onclick="esToggleFach('${esc(klasseId)}','${esc(f.id)}')"><span class="es-fach-dot" style="background:${f.color}"></span>${esc(f.name)}</button>`; }).join('');
  }
  buildKlassenNav();
  const el = document.getElementById('es-klassen-saved');
  if(el){ el.classList.add('visible'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('visible'),2000); }
}

function esDeleteKlasse(id){
  if(!confirm('Klasse wirklich entfernen? Alle Noten, Sitzpläne und Notizen dieser Klasse werden gelöscht.')) return;
  state.klassen = (state.klassen||[]).filter(k=>k.id!==id);
  // Stundenplan-Einträge dieser Klasse entfernen
  if(state.stundenplan){
    Object.keys(state.stundenplan).forEach(k=>{ if(state.stundenplan[k].klasseId===id) delete state.stundenplan[k]; });
  }
  saveState();
  buildKlassenNav();
  renderEinstellungen();
}

function esAddKlasse(){
  const name = prompt('Name der neuen Klasse (z.B. 7a):');
  if(!name||!name.trim()) return;
  if(!state.klassen) state.klassen = [];
  state.klassen.push({ id:'kl_'+Date.now().toString(36), name:name.trim(), sus:'', faecher:[] });
  saveState();
  buildKlassenNav();
  renderEinstellungen();
}

/* ── Stundenplan Quick-Edit ── */
function esOpenSpEditor(){
  const ed = document.getElementById('es-sp-editor');
  if(!ed) return;
  const open = ed.style.display !== 'none';
  ed.style.display = open ? 'none' : 'block';
  if(!open) esRenderSpGrid();
}

function esRenderSpGrid(){
  const zr = getZeitraster();
  const klassen = state.klassen || [];
  const sp = state.stundenplan || {};
  let html = '<div class="es-sp-grid">';
  // Header
  html += '<div class="es-sp-th"></div>';
  ['Mo','Di','Mi','Do','Fr'].forEach(d=>{ html+=`<div class="es-sp-th">${d}</div>`; });
  // Rows
  zr.forEach((slot,s)=>{
    html += `<div class="es-sp-td-time">${slot.nr}.<br><small>${slot.von}</small></div>`;
    for(let d=0;d<5;d++){
      const key=`${d}-${s}`;
      const entry = sp[key];
      const fach = entry ? getFach(entry.fachId) : null;
      const kl   = entry ? getKlasse(entry.klasseId) : null;
      html += `<div class="es-sp-cell${entry?' filled':''}"
        style="${entry&&fach?'background:'+fach.color+'22;border-color:'+fach.color+'66':''}"
        onclick="esSpCellClick(${d},${s})">
        ${entry ? `<span style="font-size:.72rem;font-weight:600;color:${fach?fach.color:'#666'}">${fach?fach.name:'?'}</span><br><span style="font-size:.6rem;color:var(--ts-text-muted)">${kl?kl.name:''}</span>` : '<span class="es-sp-plus">＋</span>'}
      </div>`;
    }
  });
  html += '</div>';
  document.getElementById('es-sp-grid').innerHTML = html;
}

let _esSpPicking = null; // {d, s}
function esSpCellClick(d,s){
  const key = `${d}-${s}`;
  const sp = state.stundenplan || {};
  const existing = sp[key];
  // Build picker
  const klassen = state.klassen || [];
  let html = `<div class="es-sp-picker-head">Stunde ${s+1} · ${['Mo','Di','Mi','Do','Fr'][d]}</div>`;
  if(existing){
    html += `<button class="es-sp-picker-clear" onclick="esSpClear(${d},${s})">✕ Leeren</button>`;
  }
  klassen.forEach(kl=>{
    (kl.faecher||[]).forEach(fId=>{
      const f = getFach(fId);
      if(!f) return;
      const sel = existing && existing.fachId===fId && existing.klasseId===kl.id;
      html += `<button class="es-sp-picker-opt${sel?' selected':''}"
        style="${sel?'border-color:'+f.color+';background:'+f.color+'18':''}"
        onclick="esSpAssign(${d},${s},'${fId}','${kl.id}')">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${f.color};margin-right:5px"></span>
        ${f.name} · ${kl.name}
      </button>`;
    });
  });
  if(!klassen.length) html += '<div style="padding:12px;font-size:.82rem;color:var(--ts-text-muted)">Keine Klassen mit Fächern konfiguriert.</div>';

  // ── AG-Bereich ──
  const ags = state.ags || [];
  html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--ts-border-light)">
    <div style="font-size:.65rem;font-weight:700;color:var(--ts-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">AGs</div>`;
  ags.forEach(ag => {
    const sel = existing && existing.fachId === ag.id && !existing.klasseId;
    html += `<button class="es-sp-picker-opt${sel?' selected':''}"
      style="${sel?'border-color:'+ag.color+';background:'+ag.color+'18':''}"
      onclick="esSpAssignAg(${d},${s},'${ag.id}')">
      <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ag.color};margin-right:5px"></span>
      ${ag.name}
    </button>`;
  });
  html += `<div style="display:flex;gap:6px;margin-top:6px">
    <input id="es-ag-name-${d}-${s}" class="es-sp-ag-input" placeholder="Neue AG (z.B. Theater-AG)" style="flex:1">
    <button class="es-sp-picker-opt" style="flex-shrink:0;padding:4px 8px" onclick="esCreateAg(${d},${s})">+ Anlegen</button>
  </div>
  </div>`;

  // Picker inline unterhalb des Grids rendern (kein position:absolute nötig)
  const old = document.getElementById('es-sp-picker');
  if(old) old.remove();
  const picker = document.createElement('div');
  picker.className = 'es-sp-picker';
  picker.id = 'es-sp-picker';
  picker.innerHTML = html;
  const editor = document.getElementById('es-sp-editor');
  if(editor) editor.appendChild(picker);
  picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if(!klassen.length) setTimeout(() => document.getElementById(`es-ag-name-${d}-${s}`)?.focus(), 50);
}

function esSpAssign(d,s,fachId,klasseId){
  if(!state.stundenplan) state.stundenplan={};
  state.stundenplan[`${d}-${s}`] = {fachId, klasseId};
  saveState();
  esRenderSpGrid();
  const old = document.getElementById('es-sp-picker'); if(old) old.remove();
  if(typeof renderWoche==='function') renderWoche();
  if(typeof renderHeute==='function') renderHeute();
}

function esSpClear(d,s){
  if(state.stundenplan) delete state.stundenplan[`${d}-${s}`];
  saveState();
  esRenderSpGrid();
  const old = document.getElementById('es-sp-picker'); if(old) old.remove();
  if(typeof renderWoche==='function') renderWoche();
  if(typeof renderHeute==='function') renderHeute();
}

function esSpAssignAg(d,s,agId){
  if(!state.stundenplan) state.stundenplan={};
  state.stundenplan[`${d}-${s}`] = {fachId: agId, klasseId: null};
  saveState();
  esRenderSpGrid();
  const old = document.getElementById('es-sp-picker'); if(old) old.remove();
  if(typeof renderWoche==='function') renderWoche();
  if(typeof renderHeute==='function') renderHeute();
}

const AG_COLORS = ['#9C27B0','#E91E63','#FF5722','#607D8B','#795548','#009688','#3F51B5','#F44336'];
function esCreateAg(d,s){
  const input = document.getElementById(`es-ag-name-${d}-${s}`);
  const name = input ? input.value.trim() : '';
  if(!name){ if(input) input.focus(); return; }
  if(!state.ags) state.ags = [];
  // avoid duplicate names
  if(state.ags.find(a => a.name.toLowerCase() === name.toLowerCase())){
    esSpAssignAg(d, s, state.ags.find(a => a.name.toLowerCase() === name.toLowerCase()).id);
    return;
  }
  const id = 'ag_' + Date.now();
  const color = AG_COLORS[state.ags.length % AG_COLORS.length];
  state.ags.push({id, name, color});
  saveState();
  esSpAssignAg(d, s, id);
}

/* ── Abo-Placeholder ── */
function esBuyCredits(){ showCreditsDialog(); }
function esManageAbo(){ window.open('https://billing.stripe.com/p/login/PORTAL_LINK', '_blank'); }

async function esActivateLicense(){
  const input = document.getElementById('es-license-key');
  const btn   = document.querySelector('[onclick="esActivateLicense()"]');
  const key   = (input?.value || '').trim().toUpperCase();
  if (!key) { _esLicenseMsg('Bitte Schlüssel eingeben.', 'error'); return; }

  if(btn){ btn.disabled = true; btn.textContent = '…'; }
  _esLicenseMsg('Prüfe...', 'info');
  setLicenseKey(key);
  const data = await verifyLicense();
  if(btn){ btn.disabled = false; btn.textContent = 'Aktivieren'; }

  if (data.valid) {
    _esSaveLicenseToState(data);
    _esLicenseMsg('Lizenz aktiv ✓ — ' + (data.isFlatrate ? 'Flatrate' : data.credits + ' Credits'), 'ok');
    updateToolsNavState();
    renderEinstellungen();
  } else {
    _esLicenseMsg('Ungültiger Schlüssel. Bitte prüfen.', 'error');
    licenseKey = '';
    localStorage.removeItem('ts_license_key');
    updateToolsNavState();
  }
}

async function esRefreshLicense(){
  const data = await verifyLicense();
  if (data.valid) {
    _esSaveLicenseToState(data);
    _esLicenseMsg('Aktualisiert ✓ — ' + (data.isFlatrate ? 'Flatrate' : data.credits + ' Credits'), 'ok');
    renderEinstellungen();
  } else {
    _esLicenseMsg('Kein gültiger Lizenzschlüssel hinterlegt.', 'error');
  }
}

function _esSaveLicenseToState(data){
  state.ki_credits = data.isFlatrate ? 999999 : (data.credits || 0);
  state.plan = data.plan || (data.isFlatrate ? 'premium' : 'credits');
  saveState();
}

function _esLicenseMsg(text, type){
  const el = document.getElementById('es-license-msg');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = type === 'ok' ? 'var(--ts-teal)' : type === 'error' ? '#e04' : 'var(--ts-text-secondary)';
  el.textContent = text;
}

/* ── iCal Import (WebUntis) ── */
async function esImportICal(){
  const url = document.getElementById('es-ical-url').value.trim();
  const msgEl = document.getElementById('es-ical-msg');
  const show = (txt, err=true) => {
    msgEl.textContent = txt;
    msgEl.className = 'es-msg ' + (err ? 'es-msg--err' : 'es-msg--ok');
    msgEl.style.display = '';
  };
  if(!url){ show('Bitte iCal-URL eingeben.'); return; }
  show('Wird geladen …', false);
  try {
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const entries = _parseICal(text);
    state.ical_url = url;
    state.ical_entries = entries;
    saveState();
    show(`${entries.length} Termine importiert ✓`, false);
  } catch(e) {
    show('Fehler: ' + e.message + ' — Bei CORS-Problemen muss die App auf demselben Server wie WebUntis laufen oder ein Proxy verwendet werden.');
  }
}

function _parseICal(text){
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  blocks.slice(1).forEach(block => {
    const get = key => { const m = block.match(new RegExp(key + '[^:]*:(.+)')); return m ? m[1].trim() : ''; };
    const dtstart  = get('DTSTART');
    const summary  = get('SUMMARY');
    const location = get('LOCATION');
    if(dtstart && summary) events.push({ dtstart, summary, location });
  });
  return events;
}

/* ── Daten-Export / Import ── */
async function esFullReset(){
  const confirmed = confirm(
    '⚠ ACHTUNG: Kalender komplett zurücksetzen?\n\n' +
    'Alle Klassen, Schüler, Noten, Notizen, Planungen, der Stundenplan und der PIN werden unwiderruflich gelöscht.\n\n' +
    'Zum Bestätigen nochmals auf OK klicken.'
  );
  if(!confirmed) return;
  const confirmed2 = confirm('Wirklich alles löschen? Diese Aktion kann NICHT rückgängig gemacht werden!');
  if(!confirmed2) return;

  try {
    // Delete IndexedDB entirely
    await new Promise((res, rej) => {
      const r = indexedDB.deleteDatabase('teachsmarter_v1');
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
      r.onblocked = () => { console.warn('IDB delete blocked'); res(); };
    });
  } catch(e){ console.warn('IDB reset error', e); }

  // Clear localStorage fallback keys
  try { localStorage.clear(); } catch(e){}

  // Reload → PIN setup screen
  location.reload();
}

async function esExportData(){
  try {
    const idbKeys = [
      'ts_pin_verify','ts_crypto_salt',
      'ts_events','ts_jahresplan_v2','ts_notizen',
      'ts_stunden','ts_material_db',
      ...(state.klassen||[]).map(k => 'ts_kl_' + k.id)
    ];
    const blob = {};
    // ts_state liegt noch in localStorage
    const tsState = localStorage.getItem('ts_state');
    if(tsState !== null) blob['ts_state'] = tsState;
    // Verschlüsselte Daten aus IndexedDB
    for(const k of idbKeys){
      const v = await TSStore.getItem(k);
      if(v !== null) blob[k] = v;
    }
    const json = JSON.stringify({ ts_export_v1: true, ts: Date.now(), data: blob });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'TeachSmarter_Backup_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch(e) {
    alert('Export fehlgeschlagen: ' + e.message);
  }
}

async function esImportData(){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const file = inp.files[0];
    if(!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if(!obj.ts_export_v1 || !obj.data) throw new Error('Keine gültige TeachSmarter-Backup-Datei.');
      if(!confirm('Alle aktuellen Daten werden durch das Backup ersetzt.\n\nDu brauchst deinen alten PIN, um danach auf die Daten zugreifen zu können.\n\nFortfahren?')) return;
      for(const [k,v] of Object.entries(obj.data)){
        if(k === 'ts_state') localStorage.setItem(k, v);
        else await TSStore.setItem(k, v);
      }
      await TSStore.setItem('_ts_idb_migrated', '1');
      alert('Backup erfolgreich importiert. Die App wird jetzt neu geladen.');
      location.reload();
    } catch(e) {
      alert('Import fehlgeschlagen: ' + e.message);
    }
  };
  inp.click();
}

/* ── Service Worker Registration ── */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(e => console.warn('SW registration failed (kein HTTPS?):', e.message));
  });
}

/* ══════════════════════════════════════════════
   LICENSE GATE
   ══════════════════════════════════════════════ */
function showLicenseGate(errorMsg) {
  const existing = document.getElementById('license-gate');
  if (existing) existing.remove();

  const gate = document.createElement('div');
  gate.id = 'license-gate';
  gate.style.cssText = 'position:fixed;inset:0;background:var(--ts-bg);z-index:99999;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:var(--font-body)';
  gate.innerHTML = `
    <div style="max-width:420px;width:100%;text-align:center">
      <div style="width:72px;height:72px;background:var(--ts-teal);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;font-size:2rem">💡</div>
      <h1 style="font-family:var(--font-display);font-size:1.7rem;color:var(--ts-text);margin:0 0 .5rem">TeachSmarter</h1>
      <p style="color:var(--ts-text-secondary);margin:0 0 2rem;line-height:1.6;font-size:.95rem">Gib deinen Lizenzschlüssel ein.<br>Du erhältst ihn per E-Mail nach dem Kauf.</p>
      <div style="background:var(--ts-bg-card);border-radius:16px;padding:1.5rem;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:left">
        <label style="font-size:.8rem;font-weight:600;color:var(--ts-text-secondary);letter-spacing:.04em;text-transform:uppercase">Lizenzschlüssel</label>
        <input id="license-input" type="text" placeholder="TS-F-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"
          style="width:100%;margin-top:.4rem;padding:12px 14px;border:1.5px solid ${errorMsg ? '#e04' : 'var(--ts-border)'};border-radius:10px;font-size:1rem;font-family:monospace;background:var(--ts-bg);color:var(--ts-text);box-sizing:border-box;text-transform:uppercase;letter-spacing:.07em;outline:none;margin-bottom:${errorMsg ? '.5rem' : '1rem'}">
        ${errorMsg ? `<div style="color:#e04;font-size:.83rem;margin-bottom:.85rem">⚠ ${errorMsg}</div>` : ''}
        <button id="license-btn" onclick="activateLicense()"
          style="width:100%;padding:13px;background:var(--ts-teal);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;font-family:var(--font-body);transition:opacity .15s">
          Aktivieren →
        </button>
        <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--ts-border-light);font-size:.85rem;color:var(--ts-text-secondary);text-align:center">
          Noch kein Schlüssel? <a href="${TS_STRIPE_FOUNDER}" target="_blank" style="color:var(--ts-teal);font-weight:600;text-decoration:none">Founder's Edition kaufen →</a>
        </div>
      </div>
    </div>`;

  document.body.appendChild(gate);
  const input = document.getElementById('license-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') activateLicense(); });
  setTimeout(() => input.focus(), 50);
}

async function activateLicense() {
  const input = document.getElementById('license-input');
  const btn   = document.getElementById('license-btn');
  const key   = (input?.value || '').trim().toUpperCase();
  if (!key) { input?.focus(); return; }

  btn.textContent = 'Wird geprüft …';
  btn.disabled = true;

  try {
    const res  = await fetch(TS_API + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TS_API_TOKEN },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (data.valid) {
      setLicenseKey(key);
      document.getElementById('license-gate')?.remove();
      initApp();
    } else {
      showLicenseGate('Ungültiger Lizenzschlüssel. Bitte prüfe die Eingabe.');
    }
  } catch(e) {
    showLicenseGate('Keine Verbindung. Bitte überprüfe deine Internetverbindung.');
  }
}


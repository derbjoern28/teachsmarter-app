/* ═══════════════════════════════════════════
   ts-klassen.js — Klassenübersicht
   Tabs: Schüler · Sitzplan · Noten · Notizen
   Storage: CryptoManager (verschlüsselt, DSGVO)
   ═══════════════════════════════════════════ */

let _klId        = null;  // aktive Klassen-ID
let _klData      = null;  // geladene Klassendaten
let _klTab       = 'schueler';
let _klNotenFach = null;  // ausgewähltes Fach im Noten-Tab
let _klSavTimer  = null;
let _klSusEditId  = null;  // SuS-ID für den geöffneten Schüler-Modal (Notizlog)
let _klSpDragState = null; // Sitzplan-Drag-State
let _klSpDidDrag   = false;// Verhindert Click nach abgeschlossenem Drag

/* ─── Datenstruktur ─── */
function _klEmpty() {
  return {
    schueler: [],
    sitzplan: { rows: 4, cols: 5, plaetze: {} },
    noten: {},
    klassennotizen: '',
    anwesenheit: {}   // { 'YYYY-MM-DD': { susId: { status:'a'|'e'|'u', zuSpaet:0, abgeholt:null } } }
  };
}

/* ─── Laden / Speichern ─── */
async function klLoad(id) {
  _klId = id;
  const raw = await CryptoManager.getItem('ts_kl_' + id);
  _klData = (raw && typeof raw === 'object') ? raw : _klEmpty();
  if(!Array.isArray(_klData.schueler))    _klData.schueler = [];
  if(!_klData.sitzplan)                   _klData.sitzplan = { rows: 4, cols: 5, plaetze: {} };
  if(typeof _klData.sitzplan.plaetze !== 'object') _klData.sitzplan.plaetze = {};
  if(!_klData.noten || typeof _klData.noten !== 'object') _klData.noten = {};
  if(typeof _klData.klassennotizen !== 'string') _klData.klassennotizen = '';
  if(!_klData.anwesenheit || typeof _klData.anwesenheit !== 'object') _klData.anwesenheit = {};
}

async function klSave() {
  if(_klId && _klData) await CryptoManager.setItem('ts_kl_' + _klId, _klData);
}

function klAutoSave() {
  clearTimeout(_klSavTimer);
  _klSavTimer = setTimeout(klSave, 800);
}

/* ════════════════════════════════
   HAUPT-RENDER — wird von navigateKlasse() aufgerufen
   ════════════════════════════════ */
async function renderKlasseDetail(klasseId) {
  await klLoad(klasseId);
  _klTab = 'schueler';
  _klNotenFach = null;

  const kl   = getKlasse(klasseId);
  const n    = _klData.schueler.length;
  const sub  = n === 0 ? 'Noch keine Schüler/innen' : n + ' Schüler/in' + (n !== 1 ? 'nen' : '');

  document.getElementById('view-klasse-detail').innerHTML = `
    <div class="kl-head">
      <div class="kl-head-info">
        <span class="kl-head-title" id="klasse-detail-title">${kl ? kl.name : ''}</span>
        <span class="kl-head-sub"   id="kl-sus-count">${sub}</span>
      </div>
      <div class="kl-tabs">
        <button class="kl-tab active" data-tab="schueler"    onclick="klTab('schueler')">👤 Schüler</button>
        <button class="kl-tab"        data-tab="sitzplan"    onclick="klTab('sitzplan')">🪑 Sitzplan</button>
        <button class="kl-tab"        data-tab="anwesenheit" onclick="klTab('anwesenheit')">📋 Anwesenheit</button>
        <button class="kl-tab"        data-tab="noten"       onclick="klTab('noten')">📊 Noten</button>
        <button class="kl-tab"        data-tab="notizen"     onclick="klTab('notizen')">📝 Notizen</button>
      </div>
    </div>

    <div id="kl-pane-schueler"    class="kl-pane active"></div>
    <div id="kl-pane-sitzplan"    class="kl-pane"></div>
    <div id="kl-pane-noten"       class="kl-pane"></div>
    <div id="kl-pane-anwesenheit" class="kl-pane"></div>
    <div id="kl-pane-notizen"     class="kl-pane"></div>

    ${_klSusModalHtml()}
    ${_klSeatModalHtml()}
    ${_klNotenModalHtml()}
  `;

  klRenderSchueler();
}

/* ─── Tab-Wechsel ─── */
function klTab(tab) {
  _klTab = tab;
  document.querySelectorAll('.kl-tab')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.kl-pane')
    .forEach(p => p.classList.toggle('active', p.id === 'kl-pane-' + tab));
  if(tab === 'schueler')    klRenderSchueler();
  if(tab === 'sitzplan')    klRenderSitzplan();
  if(tab === 'noten')       klRenderNoten();
  if(tab === 'anwesenheit') klRenderAnwesenheit();
  if(tab === 'notizen')     klRenderNotizen();
}

/* ─── Hilfsfunktion: Geburtstag in Tagen ─── */
function _klBirthdayIn(bdayStr) {
  if(!bdayStr) return null;
  const p = bdayStr.split('-');
  if(p.length < 3) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  let d = new Date(today.getFullYear(), +p[1]-1, +p[2]);
  if(d < today) d = new Date(today.getFullYear()+1, +p[1]-1, +p[2]);
  return Math.round((d - today) / 86400000);
}

/* ════════════════════════════════
   TAB: SCHÜLER
   ════════════════════════════════ */
function klRenderSchueler() {
  const sorted = [..._klData.schueler].sort((a,b) =>
    (a.nachname||'').localeCompare(b.nachname||'') || (a.vorname||'').localeCompare(b.vorname||''));

  document.getElementById('kl-pane-schueler').innerHTML = `
    <div class="kl-toolbar">
      <button class="btn btn-primary btn-sm" style="width:auto" onclick="_klOpenSusModal()">
        + Schüler/in hinzufügen
      </button>
      <span class="kl-count-badge">${sorted.length} Einträge</span>
    </div>
    ${sorted.length === 0 ? `
      <div class="kl-empty">
        <div class="kl-empty-icon">👥</div>
        <div class="kl-empty-title">Noch keine Schüler/innen</div>
        <div class="kl-empty-desc">
          Alle Daten werden verschlüsselt und nur lokal gespeichert – DSGVO-konform.
        </div>
      </div>
    ` : sorted.map(s => {
      const days = _klBirthdayIn(s.geburtstag);
      return `
        <div class="kl-sus-card" onclick="_klOpenSusModal('${s.id}')">
          <div class="kl-sus-avatar">${((s.anzeigename || s.vorname || '?')[0]).toUpperCase()}</div>
          <div class="kl-sus-info">
            <div class="kl-sus-name">
              ${s.nachname ? s.nachname + ', ' : ''}${s.vorname}
              ${s.anzeigename ? `<span class="kl-sus-nick">(${s.anzeigename})</span>` : ''}
            </div>
            ${s.geburtstag ? `<div class="kl-sus-meta">${s.geburtstag.split('-').reverse().join('.')}</div>` : ''}
            ${s.kommentar  ? `<div class="kl-sus-kommentar">${s.kommentar}</div>` : ''}
            ${s.notizLog && s.notizLog.length ? `<div class="kl-sus-notiz-hint">📝 ${s.notizLog.length} Notiz${s.notizLog.length!==1?'en':''}</div>` : ''}
            ${s.erziehungsberechtigte && s.erziehungsberechtigte.length ? `<div class="kl-sus-notiz-hint">👨‍👩‍👧 ${s.erziehungsberechtigte.length} EB hinterlegt</div>` : ''}
          </div>
          ${days !== null ? `
            <div class="kl-sus-bday${days <= 7 ? ' soon' : ''}">
              🎂 ${days === 0 ? 'Heute!' : 'in ' + days + 'd'}
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  `;

  const cnt = document.getElementById('kl-sus-count');
  if(cnt) cnt.textContent = sorted.length + ' Schüler/in' + (sorted.length !== 1 ? 'nen' : '');
}

/* Schüler-Modal HTML */
function _klSusModalHtml() {
  return `
    <div id="kl-sus-modal" class="modal-overlay" style="display:none"
         onclick="if(event.target===this)_klCloseSusModal()">
      <div class="modal-card" style="max-width:520px">
        <div class="modal-header">
          <span id="kl-sus-modal-title">Schüler/in hinzufügen</span>
          <button class="modal-close" onclick="_klCloseSusModal()">✕</button>
        </div>
        <div class="modal-body kl-modal-body">
          <div class="kl-field-row">
            <input id="kl-sus-vorname"  class="input" placeholder="Vorname *" autocomplete="off">
            <input id="kl-sus-nachname" class="input" placeholder="Nachname"  autocomplete="off">
          </div>
          <input id="kl-sus-anzeige" class="input"
                 placeholder="Kürzel / Spitzname (optional · erscheint im Sitzplan)" autocomplete="off">
          <div class="kl-field-row kl-field-row--label">
            <label class="kl-label">Geburtstag</label>
            <input id="kl-sus-geb" class="input" type="date" style="flex:1">
          </div>
          <textarea id="kl-sus-kommentar" class="input" rows="2"
                    placeholder="Besonderheiten, Förderhinweise (kurz · sichtbar auf der Karte)"
                    style="resize:vertical"></textarea>

          <!-- Erziehungsberechtigte -->
          <div class="kl-eb-section">
            <div class="kl-eb-header">
              <label class="kl-label" style="margin:0">Erziehungsberechtigte</label>
              <button class="btn btn-secondary btn-xs" onclick="_klEbAdd()">+ Hinzufügen</button>
            </div>
            <div id="kl-eb-list"></div>
          </div>

          <label class="kl-label" style="margin-top:8px">Notizen (Datum + Text)</label>
          <div id="kl-sus-log-list" class="sus-log-list"></div>
          <div class="sus-log-add">
            <div class="kl-field-row kl-field-row--label">
              <label class="kl-label">Datum</label>
              <input id="kl-sus-log-datum" class="input" type="date" style="flex:1">
            </div>
            <textarea id="kl-sus-log-text" class="input" rows="2"
                      placeholder="Beobachtung, Förderhinweis, Gesprächsnotiz …"
                      style="resize:vertical;margin-top:4px"></textarea>
            <button class="btn btn-secondary sus-log-add-btn" onclick="_klSusSaveNote()">+ Notiz speichern</button>
          </div>
          <input type="hidden" id="kl-sus-id">
        </div>
        <div class="modal-footer">
          <button id="kl-sus-del-btn" class="btn kl-del-btn" style="display:none"
                  onclick="_klDeleteSchueler()">Entfernen</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary" onclick="_klCloseSusModal()">Abbrechen</button>
          <button class="btn btn-primary"   onclick="_klSaveSus()">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

/* ── Erziehungsberechtigte helpers ── */
let _klEbList = []; // working copy while modal is open

function _klEbRender() {
  const container = document.getElementById('kl-eb-list');
  if (!container) return;
  if (!_klEbList.length) {
    container.innerHTML = '<div class="kl-eb-empty">Noch keine Erziehungsberechtigten hinterlegt</div>';
    return;
  }
  container.innerHTML = _klEbList.map((eb, i) => `
    <div class="kl-eb-card">
      <div class="kl-eb-card-top">
        <div class="kl-field-row" style="flex:1;gap:6px">
          <input class="input" placeholder="Name *" value="${_esc(eb.name||'')}" oninput="_klEbSet(${i},'name',this.value)" style="flex:2">
          <select class="input" onchange="_klEbSet(${i},'rolle',this.value)" style="flex:1">
            ${['Mutter','Vater','Erziehungsberechtigte/r','Vormund','Großelternteil','Sonstige/r'].map(r=>`<option${eb.rolle===r?' selected':''}>${r}</option>`).join('')}
          </select>
        </div>
        <button class="kl-eb-del" onclick="_klEbRemove(${i})" title="Entfernen">✕</button>
      </div>
      <div class="kl-field-row" style="gap:6px;margin-top:5px">
        <input class="input" type="tel" placeholder="📞 Telefon" value="${_esc(eb.telefon||'')}" oninput="_klEbSet(${i},'telefon',this.value)" style="flex:1">
        <input class="input" type="email" placeholder="✉ E-Mail" value="${_esc(eb.email||'')}" oninput="_klEbSet(${i},'email',this.value)" style="flex:1">
      </div>
      <textarea class="input" rows="1" placeholder="Notiz (optional)" style="margin-top:5px;resize:vertical;font-size:.8rem" oninput="_klEbSet(${i},'notiz',this.value)">${_esc(eb.notiz||'')}</textarea>
    </div>
  `).join('');
}

function _esc(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _klEbSet(i, field, val) {
  if (_klEbList[i]) _klEbList[i][field] = val;
}

function _klEbAdd() {
  _klEbList.push({ name:'', rolle:'Erziehungsberechtigte/r', telefon:'', email:'', notiz:'' });
  _klEbRender();
  // Focus first input of the new card
  const cards = document.querySelectorAll('.kl-eb-card');
  if (cards.length) {
    const inp = cards[cards.length-1].querySelector('input');
    if (inp) setTimeout(() => inp.focus(), 60);
  }
}

function _klEbRemove(i) {
  _klEbList.splice(i, 1);
  _klEbRender();
}

function _klOpenSusModal(susId) {
  const m = document.getElementById('kl-sus-modal');
  if(!m) return;
  _klSusEditId = susId || null;
  document.getElementById('kl-sus-del-btn').style.display = 'none';

  if(susId) {
    const s = _klData.schueler.find(x => x.id === susId);
    if(!s) return;
    document.getElementById('kl-sus-modal-title').textContent = 'Schüler/in bearbeiten';
    document.getElementById('kl-sus-vorname').value   = s.vorname     || '';
    document.getElementById('kl-sus-nachname').value  = s.nachname    || '';
    document.getElementById('kl-sus-anzeige').value   = s.anzeigename || '';
    document.getElementById('kl-sus-geb').value       = s.geburtstag  || '';
    document.getElementById('kl-sus-kommentar').value = s.kommentar   || '';
    document.getElementById('kl-sus-id').value        = susId;
    document.getElementById('kl-sus-del-btn').style.display = '';
    _klEbList = JSON.parse(JSON.stringify(s.erziehungsberechtigte || []));
  } else {
    document.getElementById('kl-sus-modal-title').textContent = 'Schüler/in hinzufügen';
    ['vorname','nachname','anzeige','geb','kommentar'].forEach(k =>
      (document.getElementById('kl-sus-'+k).value = ''));
    document.getElementById('kl-sus-id').value = '';
    _klEbList = [];
  }

  _klEbRender();
  document.getElementById('kl-sus-log-datum').value = dateStr(new Date());
  document.getElementById('kl-sus-log-text').value  = '';
  _klSusRenderLog();

  m.style.display = 'flex';
  setTimeout(() => document.getElementById('kl-sus-vorname').focus(), 80);
}

function _klCloseSusModal() {
  const m = document.getElementById('kl-sus-modal');
  if(m) m.style.display = 'none';
}

function _klSaveSus() {
  const vorname = document.getElementById('kl-sus-vorname').value.trim();
  if(!vorname) { document.getElementById('kl-sus-vorname').focus(); return; }

  const existingId = document.getElementById('kl-sus-id').value;
  const sus = {
    id:          existingId || ('sus_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5)),
    vorname,
    nachname:    document.getElementById('kl-sus-nachname').value.trim(),
    anzeigename: document.getElementById('kl-sus-anzeige').value.trim(),
    geburtstag:  document.getElementById('kl-sus-geb').value,
    kommentar:   document.getElementById('kl-sus-kommentar').value.trim(),
    erziehungsberechtigte: _klEbList.filter(eb => eb.name.trim()),
  };

  if(existingId) {
    const i = _klData.schueler.findIndex(x => x.id === existingId);
    if(i >= 0) {
      sus.notizLog = _klData.schueler[i].notizLog || [];
      _klData.schueler[i] = sus;
    }
  } else {
    sus.notizLog = [];
    _klData.schueler.push(sus);
  }

  klAutoSave();
  _klCloseSusModal();
  klRenderSchueler();
}

function _klDeleteSchueler() {
  const id = document.getElementById('kl-sus-id').value;
  if(!id || !confirm('Schüler/in wirklich entfernen?\nAlle Noten dieser Person werden ebenfalls gelöscht.')) return;

  _klData.schueler = _klData.schueler.filter(x => x.id !== id);
  delete _klData.noten[id];
  Object.keys(_klData.sitzplan.plaetze).forEach(k => {
    if(_klData.sitzplan.plaetze[k] === id) delete _klData.sitzplan.plaetze[k];
  });

  klAutoSave();
  _klCloseSusModal();
  klRenderSchueler();
}

/* ─── Schüler-Notizlog ─── */
function _klSusRenderLog() {
  const listEl = document.getElementById('kl-sus-log-list');
  if(!listEl) return;
  if(!_klSusEditId) {
    listEl.innerHTML = '<div class="sus-log-empty">Erst speichern, dann Notizen hinzufügen.</div>';
    return;
  }
  const s = _klData.schueler.find(x => x.id === _klSusEditId);
  const log = (s && Array.isArray(s.notizLog)) ? [...s.notizLog].sort((a,b) => b.datum.localeCompare(a.datum)) : [];
  if(!log.length) {
    listEl.innerHTML = '<div class="sus-log-empty">Noch keine Notizen eingetragen.</div>';
    return;
  }
  listEl.innerHTML = log.map(entry => `
    <div class="sus-log-entry">
      <div class="sus-log-meta">
        <span class="sus-log-date">${dateDe(entry.datum)}</span>
        <button class="sus-log-del" onclick="_klSusDeleteNote('${entry.id}')" title="Notiz löschen">✕</button>
      </div>
      <div class="sus-log-text">${entry.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}

function _klSusSaveNote() {
  const datum = document.getElementById('kl-sus-log-datum').value || dateStr(new Date());
  const text  = document.getElementById('kl-sus-log-text').value.trim();
  if(!text) { document.getElementById('kl-sus-log-text').focus(); return; }
  if(!_klSusEditId) return; // neuer SuS muss erst gespeichert werden
  const s = _klData.schueler.find(x => x.id === _klSusEditId);
  if(!s) return;
  if(!Array.isArray(s.notizLog)) s.notizLog = [];
  s.notizLog.push({ id:'nl_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), datum, text });
  document.getElementById('kl-sus-log-text').value = '';
  klAutoSave();
  _klSusRenderLog();
  klRenderSchueler();
}

function _klSusDeleteNote(noteId) {
  if(!_klSusEditId) return;
  const s = _klData.schueler.find(x => x.id === _klSusEditId);
  if(!s || !Array.isArray(s.notizLog)) return;
  s.notizLog = s.notizLog.filter(e => e.id !== noteId);
  klAutoSave();
  _klSusRenderLog();
  klRenderSchueler();
}

/* ════════════════════════════════
   TAB: SITZPLAN
   ════════════════════════════════ */
function klRenderSitzplan() {
  const sp   = _klData.sitzplan;
  const pane = document.getElementById('kl-pane-sitzplan');

  const seated   = new Set(Object.values(sp.plaetze));
  const unplaced = _klData.schueler.filter(s => !seated.has(s.id)).length;

  pane.innerHTML = `
    <div class="kl-toolbar kl-sp-toolbar">
      <label class="kl-label">Reihen</label>
      <select class="input kl-sp-sel" onchange="_klSpResize('rows',this.value)">
        ${[3,4,5,6,7,8].map(n=>`<option ${sp.rows==n?'selected':''}>${n}</option>`).join('')}
      </select>
      <label class="kl-label">Plätze/Reihe</label>
      <select class="input kl-sp-sel" onchange="_klSpResize('cols',this.value)">
        ${[3,4,5,6,7,8].map(n=>`<option ${sp.cols==n?'selected':''}>${n}</option>`).join('')}
      </select>
      <span style="flex:1"></span>
      <span class="kl-count-badge">${unplaced} nicht platziert</span>
      <button class="btn btn-secondary btn-sm" style="width:auto;font-size:.78rem"
              onclick="_klSpClear()">Alle leeren</button>
    </div>

    <div class="kl-sp-wrap">
      <div class="kl-lehrerpult">Lehrerpult</div>
      <div class="kl-sp-grid" style="--sp-cols:${sp.cols}">
        ${Array.from({length: sp.rows * sp.cols}, (_, i) => {
          const row = Math.floor(i / sp.cols);
          const col = i % sp.cols;
          const key = row + '-' + col;
          const susId = sp.plaetze[key];
          const sus   = susId ? _klData.schueler.find(s => s.id === susId) : null;
          const label = sus ? (sus.anzeigename || sus.vorname || '?') : '';
          return `
            <div class="kl-seat ${sus ? 'occupied' : 'empty'}"
                 data-row="${row}" data-col="${col}"
                 onclick="_klSeatClick(${row},${col})"
                 ${sus ? `onmousedown="_klSpDragStart(${row},${col},event)" ontouchstart="_klSpDragStart(${row},${col},event)"` : ''}
                 title="${sus ? (sus.nachname ? sus.nachname+', ' : '')+sus.vorname : 'Leer – klicken zum Belegen'}">
              ${sus
                ? `<span class="kl-seat-name">${label}</span>`
                : '<span class="kl-seat-plus">＋</span>'
              }
            </div>`;
        }).join('')}
      </div>
      ${_klData.schueler.length === 0
        ? '<div class="kl-empty" style="margin-top:24px">Erst Schüler/innen im Tab "Schüler" hinzufügen.</div>'
        : `<div class="kl-sp-legend">${Object.keys(sp.plaetze).length} / ${_klData.schueler.length} Schüler/innen platziert</div>`
      }
    </div>
  `;
}

/* Sitzplan-Modal HTML */
function _klSeatModalHtml() {
  return `
    <div id="kl-seat-modal" class="modal-overlay" style="display:none"
         onclick="if(event.target===this)_klCloseSeatModal()">
      <div class="modal-card" style="max-width:300px">
        <div class="modal-header">
          <span id="kl-seat-modal-title">Platz belegen</span>
          <button class="modal-close" onclick="_klCloseSeatModal()">✕</button>
        </div>
        <div id="kl-seat-picker" style="max-height:360px;overflow-y:auto;padding:8px"></div>
      </div>
    </div>`;
}

function _klSeatClick(row, col) {
  if(_klSpDidDrag) { _klSpDidDrag = false; return; }
  if(_klData.schueler.length === 0) return;
  const key   = row + '-' + col;
  const sp    = _klData.sitzplan;
  const susId = sp.plaetze[key];
  const sus   = susId ? _klData.schueler.find(s => s.id === susId) : null;

  const seated   = new Set(Object.values(sp.plaetze));
  const unplaced = _klData.schueler
    .filter(s => !seated.has(s.id) || s.id === susId)
    .filter(s => !sus || s.id !== sus.id)
    .sort((a,b) => (a.nachname||'').localeCompare(b.nachname||''));

  let html = `<div class="kl-seat-info">Reihe ${row+1}, Sitz ${col+1}</div>`;

  if(sus) {
    html += `<div class="kl-seat-current">${sus.nachname ? sus.nachname+', ' : ''}${sus.vorname}</div>`;
    html += `<button class="kl-seat-opt kl-seat-opt--remove" onclick="_klSeatRemove('${key}')">Platz leeren</button>`;
    if(unplaced.length) html += `<div class="kl-seat-section">Tauschen mit:</div>`;
  }

  html += unplaced.map(s =>
    `<button class="kl-seat-opt" onclick="_klSeatAssign('${key}','${s.id}')">
       ${s.nachname ? s.nachname+', ' : ''}${s.vorname}
     </button>`
  ).join('');

  if(!sus && unplaced.length === 0) {
    html += '<div style="padding:12px;color:var(--ts-text-muted);font-size:.85rem">Alle Schüler/innen sind bereits platziert.</div>';
  }

  document.getElementById('kl-seat-modal-title').textContent = sus ? 'Platz bearbeiten' : 'Platz belegen';
  document.getElementById('kl-seat-picker').innerHTML = html;
  document.getElementById('kl-seat-modal').style.display = 'flex';
}

function _klSeatAssign(key, susId) {
  // Alten Platz der Person leeren
  Object.keys(_klData.sitzplan.plaetze).forEach(k => {
    if(_klData.sitzplan.plaetze[k] === susId) delete _klData.sitzplan.plaetze[k];
  });
  _klData.sitzplan.plaetze[key] = susId;
  klAutoSave();
  _klCloseSeatModal();
  klRenderSitzplan();
}

function _klSeatRemove(key) {
  delete _klData.sitzplan.plaetze[key];
  klAutoSave();
  _klCloseSeatModal();
  klRenderSitzplan();
}

function _klCloseSeatModal() {
  document.getElementById('kl-seat-modal').style.display = 'none';
}

/* ─── Sitzplan Drag & Drop ─── */
function _klSpDragStart(fromRow, fromCol, evt) {
  const susId = _klData.sitzplan.plaetze[`${fromRow}-${fromCol}`];
  if(!susId) return;
  evt.preventDefault();
  const isTouch = evt.type === 'touchstart';
  const cx = isTouch ? evt.touches[0].clientX : evt.clientX;
  const cy = isTouch ? evt.touches[0].clientY : evt.clientY;

  const onMove = isTouch
    ? e => { e.preventDefault(); _klSpDragMove(e.touches[0].clientX, e.touches[0].clientY); }
    : e => _klSpDragMove(e.clientX, e.clientY);
  const onEnd = isTouch
    ? e => _klSpDragEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
    : e => _klSpDragEnd(e.clientX, e.clientY);

  _klSpDragState = { fromRow, fromCol, susId, startX:cx, startY:cy, dragging:false, ghost:null, onMove, onEnd, isTouch };
  document.addEventListener(isTouch?'touchmove':'mousemove', onMove, {passive:false});
  document.addEventListener(isTouch?'touchend':'mouseup',   onEnd, {once:true});
}

function _klSpDragMove(x, y) {
  if(!_klSpDragState) return;
  const dx = x - _klSpDragState.startX, dy = y - _klSpDragState.startY;

  if(!_klSpDragState.dragging && Math.hypot(dx, dy) > 8) {
    _klSpDragState.dragging = true;
    const ghost = document.createElement('div');
    ghost.className = 'kl-sp-drag-ghost';
    const sus = _klData.schueler.find(s => s.id === _klSpDragState.susId);
    ghost.textContent = sus ? (sus.anzeigename || sus.vorname || '?') : '?';
    document.body.appendChild(ghost);
    _klSpDragState.ghost = ghost;
  }
  if(!_klSpDragState.dragging) return;

  _klSpDragState.ghost.style.left = (x + 14) + 'px';
  _klSpDragState.ghost.style.top  = (y + 14) + 'px';

  _klSpDragState.ghost.style.pointerEvents = 'none';
  const el = document.elementFromPoint(x, y);
  _klSpDragState.ghost.style.pointerEvents = '';
  document.querySelectorAll('.kl-seat.sp-drop-over').forEach(s => s.classList.remove('sp-drop-over'));
  el?.closest('.kl-seat')?.classList.add('sp-drop-over');
}

function _klSpDragEnd(x, y) {
  if(!_klSpDragState) return;
  document.removeEventListener(_klSpDragState.isTouch?'touchmove':'mousemove', _klSpDragState.onMove);
  if(_klSpDragState.ghost) _klSpDragState.ghost.remove();
  document.querySelectorAll('.kl-seat.sp-drop-over').forEach(s => s.classList.remove('sp-drop-over'));

  if(_klSpDragState.dragging) {
    _klSpDragState.ghost && (_klSpDragState.ghost.style.pointerEvents = 'none');
    const el = document.elementFromPoint(x, y);
    const seatEl = el?.closest('.kl-seat');
    if(seatEl) {
      const toRow = parseInt(seatEl.dataset.row);
      const toCol = parseInt(seatEl.dataset.col);
      const fromKey = `${_klSpDragState.fromRow}-${_klSpDragState.fromCol}`;
      const toKey   = `${toRow}-${toCol}`;
      if(!isNaN(toRow) && !isNaN(toCol) && fromKey !== toKey) {
        const fromSus = _klData.sitzplan.plaetze[fromKey];
        const toSus   = _klData.sitzplan.plaetze[toKey];
        if(fromSus) _klData.sitzplan.plaetze[toKey] = fromSus; else delete _klData.sitzplan.plaetze[toKey];
        if(toSus)   _klData.sitzplan.plaetze[fromKey] = toSus;  else delete _klData.sitzplan.plaetze[fromKey];
        klAutoSave();
        klRenderSitzplan();
      }
    }
    _klSpDidDrag = true;
    setTimeout(() => { _klSpDidDrag = false; }, 150);
  }
  _klSpDragState = null;
}

function _klSpResize(dim, val) {
  _klData.sitzplan[dim] = parseInt(val);
  const { rows, cols } = _klData.sitzplan;
  Object.keys(_klData.sitzplan.plaetze).forEach(k => {
    const [r,c] = k.split('-').map(Number);
    if(r >= rows || c >= cols) delete _klData.sitzplan.plaetze[k];
  });
  klAutoSave();
  klRenderSitzplan();
}

function _klSpClear() {
  if(!confirm('Alle Sitzplatzzuweisungen leeren?')) return;
  _klData.sitzplan.plaetze = {};
  klAutoSave();
  klRenderSitzplan();
}

/* ════════════════════════════════
   TAB: NOTEN
   ════════════════════════════════ */

const KL_TYP_LABEL = { muendlich:'Mündlich', schriftlich:'Schriftlich', projekt:'Projekt', sonstige:'Sonstige' };
const KL_TYP_SHORT = { muendlich:'M', schriftlich:'S', projekt:'P', sonstige:'?' };

function klRenderNoten() {
  const kl     = getKlasse(_klId);
  const faecher = (kl ? (kl.faecher || []) : [])
    .map(id => getFach(id)).filter(Boolean);
  const sorted  = [..._klData.schueler].sort((a,b) =>
    (a.nachname||'').localeCompare(b.nachname||''));
  const pane    = document.getElementById('kl-pane-noten');

  if(sorted.length === 0) {
    pane.innerHTML = '<div class="kl-empty"><div class="kl-empty-icon">📊</div><div class="kl-empty-title">Erst Schüler/innen anlegen</div></div>';
    return;
  }
  if(faecher.length === 0) {
    pane.innerHTML = '<div class="kl-empty"><div class="kl-empty-icon">📚</div><div class="kl-empty-title">Keine Fächer zugewiesen</div><div class="kl-empty-desc">Fächer unter <strong>Mein Profil → Klassen</strong> ergänzen.</div></div>';
    return;
  }

  if(!_klNotenFach || !faecher.find(f => f.id === _klNotenFach)) {
    _klNotenFach = faecher[0].id;
  }
  const curFach = getFach(_klNotenFach);

  pane.innerHTML = `
    <div class="kl-fach-tabs">
      ${faecher.map(f => `
        <button class="kl-fach-tab${_klNotenFach === f.id ? ' active' : ''}"
                style="${_klNotenFach === f.id ? '--fach-color:'+f.color : ''}"
                onclick="_klSetFach('${f.id}')">${f.name}</button>
      `).join('')}
    </div>

    <div class="kl-noten-table-wrap">
      <table class="kl-noten-table">
        <thead>
          <tr>
            <th class="kl-nt-name-col">Schüler/in</th>
            <th>Noten <span class="kl-nt-fach-hint">${curFach ? curFach.name : ''}</span></th>
            <th class="kl-nt-add-col"></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(s => {
            const notes = ((_klData.noten[s.id] || {})[_klNotenFach] || [])
              .slice().sort((a,b) => (a.datum||'').localeCompare(b.datum||''));
            const avg = _klAverage(notes);
            return `
              <tr>
                <td class="kl-nt-name">
                  ${s.nachname ? s.nachname+',&nbsp;' : ''}${s.vorname}
                  ${avg !== null ? `<span class="kl-nt-avg" title="Gewichteter Durchschnitt">${avg}</span>` : ''}
                </td>
                <td>
                  <div class="kl-noten-chips">
                    ${notes.map(n => `
                      <span class="kl-note-chip kl-note-${n.typ}"
                            onclick="_klOpenNote('${s.id}','${n.id}')"
                            title="${n.thema||''}${n.thema?' · ':''}${KL_TYP_LABEL[n.typ]||''} · ${dateDe(n.datum)}${(n.gewichtung||1)>1?' · ×'+n.gewichtung+' gewichtet':''}${n.bemerkung?' · '+n.bemerkung:''}">
                        ${n.note}${(n.gewichtung||1)>1?`<span class="kl-note-weight">×${n.gewichtung}</span>`:''}
                        ${n.thema?`<span class="kl-note-thema">${n.thema}</span>`:''}
                      </span>
                    `).join('')}
                    ${notes.length === 0
                      ? '<span class="kl-no-notes">–</span>'
                      : ''}
                  </div>
                </td>
                <td>
                  <button class="kl-add-note-btn"
                          onclick="_klOpenNote('${s.id}')"
                          title="Note eintragen">＋</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="kl-noten-legend">
      <span class="kl-note-chip kl-note-muendlich">M</span> Mündlich &nbsp;
      <span class="kl-note-chip kl-note-schriftlich">S</span> Schriftlich &nbsp;
      <span class="kl-note-chip kl-note-projekt">P</span> Projekt &nbsp;
      <span class="kl-note-chip kl-note-sonstige">?</span> Sonstige &nbsp;·&nbsp;
      <span class="kl-note-chip kl-note-schriftlich">2<span class="kl-note-weight">×2</span></span> = doppelt gewichtet
    </div>
  `;
}

function _klSetFach(id) {
  _klNotenFach = id;
  klRenderNoten();
}

function _klAverage(notes) {
  const valid = notes.filter(n => {
    const v = parseFloat(n.note);
    return !isNaN(v) && v >= 1 && v <= 6;
  });
  if(!valid.length) return null;
  const totalWeight  = valid.reduce((s,n) => s + (n.gewichtung || 1), 0);
  const weightedSum  = valid.reduce((s,n) => s + parseFloat(n.note) * (n.gewichtung || 1), 0);
  return (weightedSum / totalWeight).toFixed(1);
}

/* Noten-Modal HTML */
function _klNotenModalHtml() {
  return `
    <div id="kl-nm-modal" class="modal-overlay" style="display:none"
         onclick="if(event.target===this)_klCloseNote()">
      <div class="modal-card" style="max-width:400px">
        <div class="modal-header">
          <span id="kl-nm-title">Note eintragen</span>
          <button class="modal-close" onclick="_klCloseNote()">✕</button>
        </div>
        <div class="modal-body kl-modal-body">
          <div id="kl-nm-sus-name" class="kl-nm-sus-name"></div>
          <select id="kl-nm-typ" class="input">
            <option value="muendlich">Mündliche Note</option>
            <option value="schriftlich">Schriftliche Note (Test / Probe)</option>
            <option value="projekt">Projekt / Referat</option>
            <option value="sonstige">Sonstige Leistung</option>
          </select>
          <div class="kl-field-row kl-field-row--label">
            <label class="kl-label">Gewichtung</label>
            <select id="kl-nm-gewicht" class="input" style="flex:1">
              <option value="1">× 1 — einfach</option>
              <option value="2">× 2 — doppelt (z. B. Große Probe)</option>
              <option value="3">× 3 — dreifach</option>
            </select>
          </div>
          <input id="kl-nm-thema" class="input"
                 placeholder="Thema / Anlass *" autocomplete="off"
                 style="border-color:var(--ts-teal-subtle)">
          <input id="kl-nm-wert" class="input"
                 placeholder="Note — z. B.  2  ·  2+  ·  sehr gut  ·  78%" autocomplete="off">
          <div class="kl-field-row kl-field-row--label">
            <label class="kl-label">Datum</label>
            <input id="kl-nm-datum" class="input" type="date" style="flex:1">
          </div>
          <input id="kl-nm-bemerkung" class="input"
                 placeholder="Bemerkung (optional)" autocomplete="off">
          <input type="hidden" id="kl-nm-note-id">
          <input type="hidden" id="kl-nm-sus-id">
          <input type="hidden" id="kl-nm-fach-id">
        </div>
        <div class="modal-footer">
          <button id="kl-nm-del-btn" class="btn kl-del-btn" style="display:none"
                  onclick="_klDeleteNote()">Löschen</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary" onclick="_klCloseNote()">Abbrechen</button>
          <button class="btn btn-primary"   onclick="_klSaveNote()">Speichern</button>
        </div>
      </div>
    </div>
  `;
}

function _klOpenNote(susId, noteId) {
  const m = document.getElementById('kl-nm-modal');
  if(!m) return;
  const sus = _klData.schueler.find(s => s.id === susId);

  document.getElementById('kl-nm-sus-name').textContent =
    sus ? (sus.nachname ? sus.nachname+', ' : '') + sus.vorname : '';
  document.getElementById('kl-nm-sus-id').value  = susId;
  document.getElementById('kl-nm-fach-id').value = _klNotenFach;
  document.getElementById('kl-nm-del-btn').style.display = 'none';

  if(noteId) {
    const note = ((_klData.noten[susId]||{})[_klNotenFach]||[]).find(n => n.id === noteId);
    if(!note) return;
    document.getElementById('kl-nm-title').textContent     = 'Note bearbeiten';
    document.getElementById('kl-nm-typ').value              = note.typ;
    document.getElementById('kl-nm-gewicht').value          = String(note.gewichtung || 1);
    document.getElementById('kl-nm-thema').value            = note.thema || '';
    document.getElementById('kl-nm-wert').value             = note.note;
    document.getElementById('kl-nm-datum').value            = note.datum;
    document.getElementById('kl-nm-bemerkung').value        = note.bemerkung || '';
    document.getElementById('kl-nm-note-id').value          = noteId;
    document.getElementById('kl-nm-del-btn').style.display  = '';
  } else {
    document.getElementById('kl-nm-title').textContent = 'Note eintragen';
    document.getElementById('kl-nm-typ').value          = 'muendlich';
    document.getElementById('kl-nm-gewicht').value      = '1';
    document.getElementById('kl-nm-thema').value        = '';
    document.getElementById('kl-nm-wert').value         = '';
    document.getElementById('kl-nm-datum').value        = dateStr(new Date());
    document.getElementById('kl-nm-bemerkung').value    = '';
    document.getElementById('kl-nm-note-id').value      = '';
  }

  m.style.display = 'flex';
  setTimeout(() => document.getElementById('kl-nm-thema').focus(), 80);
}

function _klCloseNote() {
  const m = document.getElementById('kl-nm-modal');
  if(m) m.style.display = 'none';
}

function _klSaveNote() {
  const thema = document.getElementById('kl-nm-thema').value.trim();
  const wert  = document.getElementById('kl-nm-wert').value.trim();

  if(!thema) {
    const el = document.getElementById('kl-nm-thema');
    el.style.borderColor = 'var(--ts-error)';
    el.focus();
    el.placeholder = 'Thema ist Pflichtfeld! *';
    setTimeout(() => { el.style.borderColor = ''; el.placeholder = 'Thema / Anlass *'; }, 2000);
    return;
  }
  if(!wert) { document.getElementById('kl-nm-wert').focus(); return; }

  const susId   = document.getElementById('kl-nm-sus-id').value;
  const fachId  = document.getElementById('kl-nm-fach-id').value;
  const noteId  = document.getElementById('kl-nm-note-id').value;

  if(!_klData.noten[susId])         _klData.noten[susId] = {};
  if(!_klData.noten[susId][fachId]) _klData.noten[susId][fachId] = [];

  const entry = {
    id:          noteId || ('n_' + Date.now().toString(36) + Math.random().toString(36).slice(2,4)),
    typ:         document.getElementById('kl-nm-typ').value,
    gewichtung:  parseInt(document.getElementById('kl-nm-gewicht').value) || 1,
    thema,
    note:        wert,
    datum:       document.getElementById('kl-nm-datum').value || dateStr(new Date()),
    bemerkung:   document.getElementById('kl-nm-bemerkung').value.trim(),
  };

  const arr = _klData.noten[susId][fachId];
  if(noteId) {
    const i = arr.findIndex(n => n.id === noteId);
    if(i >= 0) arr[i] = entry; else arr.push(entry);
  } else {
    arr.push(entry);
  }

  klAutoSave();
  _klCloseNote();
  klRenderNoten();
}

function _klDeleteNote() {
  const susId  = document.getElementById('kl-nm-sus-id').value;
  const fachId = document.getElementById('kl-nm-fach-id').value;
  const noteId = document.getElementById('kl-nm-note-id').value;
  if(!noteId) return;
  _klData.noten[susId][fachId] = _klData.noten[susId][fachId].filter(n => n.id !== noteId);
  klAutoSave();
  _klCloseNote();
  klRenderNoten();
}

/* ════════════════════════════════
   TAB: NOTIZEN
   ════════════════════════════════ */
function klRenderNotizen() {
  document.getElementById('kl-pane-notizen').innerHTML = `
    <div class="kl-notizen-wrap">
      <div class="kl-notizen-hint">
        Klassennotizen — nur lokal gespeichert, verschlüsselt (DSGVO)
      </div>
      <textarea id="kl-notizen-area" class="input kl-notizen-area"
                placeholder="Notizen zur Klasse, Beobachtungen, besondere Ereignisse …"
                oninput="_klNotizenChange(this.value)"
      >${_klData.klassennotizen || ''}</textarea>
      <span id="kl-notizen-saved" class="note-saved">Gespeichert ✓</span>
    </div>
  `;
}

function _klNotizenChange(val) {
  _klData.klassennotizen = val;
  klAutoSave();
  const el = document.getElementById('kl-notizen-saved');
  if(el) {
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('visible'), 1800);
  }
}

/* ══════════════════════════════════════════════════════
   ANWESENHEIT
   Status: 'a' anwesend · 'e' entschuldigt · 'u' unentschuldigt
   Zu spät: Minuten (45 min = 1 Fehlstunde, 6 Fehlstd = 1 Fehltag)
   ══════════════════════════════════════════════════════ */
let _klAvDate = dateStr(new Date()); // 'YYYY-MM-DD', reset beim Tab-Öffnen

function klRenderAnwesenheit() {
  const pane = document.getElementById('kl-pane-anwesenheit');
  if(!pane) return;

  const dateObj  = new Date(_klAvDate + 'T00:00:00');
  const dow      = (dateObj.getDay() + 6) % 7;
  const tagName  = ['Mo','Di','Mi','Do','Fr','Sa','So'][dow];
  const dateLabel = `${tagName}, ${dateObj.getDate()}. ${MONATE[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const todayStr  = dateStr(new Date());

  const schueler = [...(_klData.schueler || [])]
    .sort((a,b) => (a.nachname||a.vorname).localeCompare(b.nachname||b.vorname));
  const av = (_klData.anwesenheit || {})[_klAvDate] || {};

  let anwesend=0, entschuldigt=0, unentschuldigt=0, offen=0;
  schueler.forEach(s => {
    const st = (av[s.id]||{}).status;
    if(st==='a') anwesend++;
    else if(st==='e') entschuldigt++;
    else if(st==='u') unentschuldigt++;
    else offen++;
  });

  let html = `
    <div class="av-bar">
      <button class="av-nav-btn" onclick="_klAvPrev()">‹</button>
      <span class="av-nav-date">${dateLabel}</span>
      <button class="av-nav-btn" onclick="_klAvNext()"${_klAvDate===todayStr?' disabled':''}>›</button>
      <button class="av-today-btn" onclick="_klAvToday()"${_klAvDate===todayStr?' disabled':''}>Heute</button>
    </div>

    <div class="av-day-summary">
      <span class="av-sum-chip av-sum-a">✓ ${anwesend}</span>
      ${entschuldigt?`<span class="av-sum-chip av-sum-e">E ${entschuldigt}</span>`:''}
      ${unentschuldigt?`<span class="av-sum-chip av-sum-u">U ${unentschuldigt}</span>`:''}
      ${offen?`<span class="av-sum-chip av-sum-n">? ${offen} offen</span>`:''}
      <button class="av-alleA-btn" onclick="_klAvAlleAnwesend()">Alle anwesend</button>
    </div>

    <div class="av-legend">
      <span class="av-legend-chip av-legend-a">A&nbsp;= Anwesend</span>
      <span class="av-legend-chip av-legend-e">E&nbsp;= Entschuldigt fehlt</span>
      <span class="av-legend-chip av-legend-u">U&nbsp;= Unentschuldigt fehlt</span>
    </div>

    <div class="av-table">
      <div class="av-table-head">
        <div class="av-th-name">Schüler/in</div>
        <div class="av-th-status">Status</div>
        <div class="av-th-extra">Zu spät</div>
        <div class="av-th-extra">Abgeholt</div>
      </div>`;

  schueler.forEach(s => {
    const e  = av[s.id] || {};
    const st = e.status || '';
    const zs = e.zuSpaet || 0;
    const ab = e.abgeholt || null;
    const nm = (s.nachname ? s.nachname+', ' : '') + s.vorname;
    html += `
      <div class="av-row${st==='e'||st==='u'?' av-row-absent':''}">
        <div class="av-td-name">${nm}</div>
        <div class="av-td-status">
          <button class="av-btn av-btn-a${st==='a'?' av-on':''}" onclick="_klAvSetStatus('${s.id}','a')" title="Anwesend">A</button>
          <button class="av-btn av-btn-e${st==='e'?' av-on':''}" onclick="_klAvSetStatus('${s.id}','e')" title="Entschuldigt">E</button>
          <button class="av-btn av-btn-u${st==='u'?' av-on':''}" onclick="_klAvSetStatus('${s.id}','u')" title="Unentschuldigt">U</button>
        </div>
        <div class="av-td-extra" onclick="_klAvZuSpaetClick('${s.id}')">
          ${zs ? `<span class="av-badge av-badge-zs">${zs}&thinsp;min</span>` : '<span class="av-td-leer">+</span>'}
        </div>
        <div class="av-td-extra" onclick="_klAvAbgeholtClick('${s.id}')">
          ${ab ? `<span class="av-badge av-badge-ab">${ab.zeit}</span>` : '<span class="av-td-leer">+</span>'}
        </div>
      </div>`;
  });

  html += `</div>

  <!-- ── Jahresstatistik ── -->
  <div class="av-stats-wrap">
    <button class="av-stats-toggle" onclick="_klAvToggleStats(this)">📊 Jahresstatistik einblenden</button>
    <div class="av-stats-body" style="display:none">
      <div class="av-stats-hint">
        Zu spät: 45&thinsp;min = 1 unentsch. Fehlstunde &nbsp;·&nbsp; 6 Fehlstd. = 1 unentsch. Fehltag
      </div>
      <div class="av-stats-table">
        <div class="av-stats-hd">
          <div>Schüler/in</div>
          <div title="Unentschuldigte Fehltage (inkl. aus Fehlstunden)">Fehlt.&nbsp;U</div>
          <div title="Entschuldigte Fehltage">Fehlt.&nbsp;E</div>
          <div title="Verbleibende Fehlstunden (Rest bis nächster Fehltag)">Fehlst.</div>
          <div title="Gesamte Verspätungsminuten">Zu&nbsp;spät</div>
          <div title="Frühzeitig abgeholt / gegangen">Abgeholt</div>
        </div>
        ${schueler.map(s => {
          const st = _klAvStats(s.id);
          const nm = (s.nachname ? s.nachname+', ' : '') + s.vorname;
          return `<div class="av-stats-row">
            <div class="av-stats-name">${nm}</div>
            <div class="av-stats-val${st.fehltagU?' av-u':''}">${st.fehltagU||'–'}</div>
            <div class="av-stats-val${st.fehltagE?' av-e':''}">${st.fehltagE||'–'}</div>
            <div class="av-stats-val">${st.fehlstundenRest||'–'}</div>
            <div class="av-stats-val">${st.zuSpaetMin?st.zuSpaetMin+'&thinsp;min':'–'}</div>
            <div class="av-stats-val">${st.abgeholtCount||'–'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Zu-spät-Modal -->
  <div id="av-zs-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)_klAvCloseZs()">
    <div class="modal-card" style="max-width:320px">
      <div class="modal-header"><span>Zu spät</span><button class="modal-close" onclick="_klAvCloseZs()">✕</button></div>
      <div class="modal-body kl-modal-body">
        <div id="av-zs-name" style="font-weight:600;margin-bottom:var(--sp-sm)"></div>
        <div class="kl-field-row kl-field-row--label">
          <label class="kl-label">Minuten zu spät</label>
          <input id="av-zs-min" class="input" type="number" min="1" max="270" placeholder="z. B. 15" style="flex:1;text-align:center">
        </div>
        <div style="font-size:.73rem;color:var(--ts-text-muted);margin-top:4px">45 Min. = 1 Fehlstunde · 6 Fehlstd. = 1 Fehltag</div>
        <input type="hidden" id="av-zs-susid">
      </div>
      <div class="modal-footer">
        <button id="av-zs-del" class="btn kl-del-btn" style="display:none" onclick="_klAvClearZs()">Entfernen</button>
        <span style="flex:1"></span>
        <button class="btn btn-secondary" onclick="_klAvCloseZs()">Abbrechen</button>
        <button class="btn btn-primary" onclick="_klAvSaveZs()">Speichern</button>
      </div>
    </div>
  </div>

  <!-- Abgeholt-Modal -->
  <div id="av-ab-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)_klAvCloseAb()">
    <div class="modal-card" style="max-width:360px">
      <div class="modal-header"><span>Frühzeitig abgeholt / gegangen</span><button class="modal-close" onclick="_klAvCloseAb()">✕</button></div>
      <div class="modal-body kl-modal-body">
        <div id="av-ab-name" style="font-weight:600;margin-bottom:var(--sp-sm)"></div>
        <div class="kl-field-row kl-field-row--label">
          <label class="kl-label">Uhrzeit</label>
          <input id="av-ab-zeit" class="input" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" oninput="_tpFormatInput(this)" style="flex:1">
        </div>
        <input id="av-ab-grund" class="input" placeholder="Grund (z. B. Arzttermin, Übelkeit …)" autocomplete="off">
        <input type="hidden" id="av-ab-susid">
      </div>
      <div class="modal-footer">
        <button id="av-ab-del" class="btn kl-del-btn" style="display:none" onclick="_klAvDeleteAb()">Entfernen</button>
        <span style="flex:1"></span>
        <button class="btn btn-secondary" onclick="_klAvCloseAb()">Abbrechen</button>
        <button class="btn btn-primary" onclick="_klAvSaveAb()">Speichern</button>
      </div>
    </div>
  </div>`;

  pane.innerHTML = html;
}

/* ─── Datum-Navigation ─── */
function _klAvPrev(){ const d=new Date(_klAvDate+'T00:00:00'); d.setDate(d.getDate()-1); _klAvDate=dateStr(d); klRenderAnwesenheit(); }
function _klAvNext(){ const d=new Date(_klAvDate+'T00:00:00'); d.setDate(d.getDate()+1); _klAvDate=dateStr(d); klRenderAnwesenheit(); }
function _klAvToday(){ _klAvDate=dateStr(new Date()); klRenderAnwesenheit(); }

/* ─── Status setzen ─── */
function _klAvEnsure(susId){
  if(!_klData.anwesenheit) _klData.anwesenheit={};
  if(!_klData.anwesenheit[_klAvDate]) _klData.anwesenheit[_klAvDate]={};
  if(!_klData.anwesenheit[_klAvDate][susId]) _klData.anwesenheit[_klAvDate][susId]={};
  return _klData.anwesenheit[_klAvDate][susId];
}

function _klAvSetStatus(susId, status){
  const e=_klAvEnsure(susId);
  e.status = e.status===status ? '' : status;
  klAutoSave(); klRenderAnwesenheit();
}

function _klAvAlleAnwesend(){
  (_klData.schueler||[]).forEach(s => { const e=_klAvEnsure(s.id); if(!e.status) e.status='a'; });
  klAutoSave(); klRenderAnwesenheit();
}

/* ─── Toggle Statistik ─── */
function _klAvToggleStats(btn){
  const b=document.querySelector('.av-stats-body');
  if(!b) return;
  const open = b.style.display!=='none';
  b.style.display = open?'none':'block';
  btn.textContent = open?'📊 Jahresstatistik einblenden':'📊 Jahresstatistik ausblenden';
}

/* ─── Statistik-Berechnung ─── */
function _klAvStats(susId){
  const all=_klData.anwesenheit||{};
  let fehltagE=0, fehltagU=0, zuSpaetMin=0, abgeholtCount=0;
  for(const dk of Object.keys(all)){
    const e=(all[dk]||{})[susId]; if(!e) continue;
    if(e.status==='e') fehltagE++;
    else if(e.status==='u') fehltagU++;
    if(e.zuSpaet) zuSpaetMin+=e.zuSpaet;
    if(e.abgeholt) abgeholtCount++;
  }
  const fehlstundenGesamt = Math.floor(zuSpaetMin/45);
  const extraFehltage     = Math.floor(fehlstundenGesamt/6);
  const fehlstundenRest   = fehlstundenGesamt%6;
  return { fehltagE, fehltagU: fehltagU+extraFehltage, fehlstundenRest, zuSpaetMin, abgeholtCount };
}

/* ─── Zu-spät-Modal ─── */
function _klAvZuSpaetClick(susId){
  const sus=_klData.schueler.find(s=>s.id===susId);
  const e=((_klData.anwesenheit||{})[_klAvDate]||{})[susId]||{};
  document.getElementById('av-zs-name').textContent=(sus?(sus.nachname?sus.nachname+', ':'')+sus.vorname:'');
  document.getElementById('av-zs-susid').value=susId;
  document.getElementById('av-zs-min').value=e.zuSpaet||'';
  document.getElementById('av-zs-del').style.display=e.zuSpaet?'':'none';
  document.getElementById('av-zs-modal').style.display='flex';
  setTimeout(()=>document.getElementById('av-zs-min').focus(),80);
}
function _klAvCloseZs(){ document.getElementById('av-zs-modal').style.display='none'; }
function _klAvSaveZs(){
  const susId=document.getElementById('av-zs-susid').value;
  const min=parseInt(document.getElementById('av-zs-min').value)||0;
  const e=_klAvEnsure(susId);
  e.zuSpaet=min>0?min:0;
  if(min>0&&!e.status) e.status='a';
  klAutoSave(); _klAvCloseZs(); klRenderAnwesenheit();
}
function _klAvClearZs(){
  const susId=document.getElementById('av-zs-susid').value;
  _klAvEnsure(susId).zuSpaet=0;
  klAutoSave(); _klAvCloseZs(); klRenderAnwesenheit();
}

/* ─── Abgeholt-Modal ─── */
function _klAvAbgeholtClick(susId){
  const sus=_klData.schueler.find(s=>s.id===susId);
  const e=((_klData.anwesenheit||{})[_klAvDate]||{})[susId]||{};
  const ab=e.abgeholt||null;
  document.getElementById('av-ab-name').textContent=(sus?(sus.nachname?sus.nachname+', ':'')+sus.vorname:'');
  document.getElementById('av-ab-susid').value=susId;
  document.getElementById('av-ab-zeit').value=ab?ab.zeit:'';
  document.getElementById('av-ab-grund').value=ab?ab.grund||'':'';
  document.getElementById('av-ab-del').style.display=ab?'':'none';
  document.getElementById('av-ab-modal').style.display='flex';
  setTimeout(()=>document.getElementById('av-ab-zeit').focus(),80);
}
function _klAvCloseAb(){ document.getElementById('av-ab-modal').style.display='none'; }
function _klAvSaveAb(){
  const susId=document.getElementById('av-ab-susid').value;
  const zeit=document.getElementById('av-ab-zeit').value;
  const grund=document.getElementById('av-ab-grund').value.trim();
  if(!zeit){ document.getElementById('av-ab-zeit').focus(); return; }
  const e=_klAvEnsure(susId);
  e.abgeholt={zeit,grund};
  if(!e.status) e.status='a';
  klAutoSave(); _klAvCloseAb(); klRenderAnwesenheit();
}
function _klAvDeleteAb(){
  const susId=document.getElementById('av-ab-susid').value;
  _klAvEnsure(susId).abgeholt=null;
  klAutoSave(); _klAvCloseAb(); klRenderAnwesenheit();
}

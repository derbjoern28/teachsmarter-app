/* ═══════════════════════════════════════════
   /* ts-stunde.js — Stundenvorbereitung / Verlaufsplan
   ═══════════════════════════════════════════ */

let svContext = null; // { datum, fachId, klasseId, slotIdx }
let svPrevView = 'heute';
let svSaveTimer = null;
let _svActivePanel = 'material'; // 'material' | 'ab'
let _svAbData = null;

const SV_FIELDS = [
  {id:'lehrplan', label:'Lehrplanzuordnung'},
  {id:'sequenz',  label:'Sequenz'},
  {id:'thema',    label:'Stundenthema'},
  {id:'lernziele',label:'Lernziele'},
  {id:'verlaufsplan', label:'Verlaufsplan'},
  {id:'hausaufgaben', label:'Hausaufgaben'},
  {id:'tafelbild',    label:'Tafelbild'},
  {id:'reflexion',    label:'Nachbereitung'},
];

function svKey(datum, fachId, klasseId, slotIdx){
  return `${datum}_${fachId}_${klasseId}_${slotIdx}`;
}

function svEscape(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Media-DB helpers ── */
function getMediaDb(){ return mediaCache; }
async function saveMediaDb(db){ mediaCache=db; await CryptoManager.setItem('ts_material_db',db); }

const MEDIA_TYPE_ICON = {pdf:'📄',image:'🖼️',link:'🔗',video:'🎬',html:'📋','html-tb':'🪟','html-pr':'🎯','html-iv':'⚡',doc:'📝'};
const MEDIA_TYPE_BG   = {pdf:'#FDECEA',image:'#E8F6F4',link:'#EEF3FB',video:'#FFF3E0',html:'#F3E8FF','html-tb':'#E8F5E9','html-pr':'#EAF0FB','html-iv':'#E8F8F5',doc:'#F5F0EA'};

function openStunde(datum, fachId, klasseId, slotIdx){
  svContext = { datum, fachId, klasseId, slotIdx };
  _svFilter  = { fach: fachId||'', klasse:'', type:'' }; // reset for new lesson
  _svPanelOpen = false; // Panel immer geschlossen beim Öffnen einer neuen Stunde
  svPrevView = currentView;
  navigate('stundenvorbereitung');
  renderStundenvorbereitung();
}

function renderStundenvorbereitung(){
  if(!svContext) return;
  const {datum, fachId, klasseId, slotIdx} = svContext;
  const fach = getFach(fachId);
  const klasse = getKlasse(klasseId);
  const zr = getZeitraster();
  const slot = zr[slotIdx];
  const key = svKey(datum, fachId, klasseId, slotIdx);

  let saved = stundenCache[key] || {};

  let lpName='', seqName='';
  if(typeof getLernbereichForDate==='function'){
    const lb = getLernbereichForDate(fachId, klasseId, new Date(datum+'T00:00:00'));
    if(lb){ lpName=lb.lbName||''; seqName=lb.seqTitle||lb.lbName||''; }
  }

  const container = document.getElementById('view-stundenvorbereitung');
  container.innerHTML = `
    <button class="sv-back" onclick="navigate('${svPrevView}')">← Zurück zur ${svPrevView==='heute'?'Tagesansicht':'Wochenansicht'}</button>
    <div class="sv-header">
      <span class="sv-header-fach" style="background:${fach?fach.color:'#999'}">${fach?fach.name:'?'}</span>
      <span class="sv-header-info">${klasse?klasse.name:''} · ${datum} · ${slot?slot.von+' – '+slot.bis:''}</span>
      <button class="sv-ki-btn" id="sv-ki-btn" onclick="svGenerateKI()">
        <svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M16 4c-5.5 0-10 4-10 9.1 0 2.6 1.3 5 3.4 6.6.5.4.8 1 .9 1.7l.3 2c.1.9.9 1.6 1.8 1.6h7.2c.9 0 1.7-.7 1.8-1.6l.3-2c.1-.7.4-1.3.9-1.7 2.1-1.6 3.4-4 3.4-6.6C26 8 21.5 4 16 4z" stroke="#fff" stroke-width="1.8" fill="rgba(255,255,255,.2)"/><circle cx="13.5" cy="12" r="1.3" fill="#fff"/><circle cx="18.5" cy="12" r="1.3" fill="#fff"/><circle cx="16" cy="16" r="1.3" fill="#fff"/></svg>
        Mit KI vorbereiten
        <span class="premium-badge">Premium</span>
      </button>
      <button class="sv-panel-toggle-btn" id="sv-panel-toggle-btn" onclick="svTogglePanel()">📚 Material & AB ▶</button>
      <span class="sv-saved" id="sv-saved-badge">Gespeichert ✓</span>
    </div>
    <div class="sv-layout" id="sv-layout">
      <div class="sv-form">
        <div class="sv-fields">
          <div class="sv-row sv-row-locked">
            <div class="sv-field">
              <label class="sv-locked-label">
                🔒 Lehrplanzuordnung
                <button class="sv-edit-plan-btn" onclick="navigate('planung')" title="In Jahresplanung bearbeiten">✎ Bearbeiten</button>
              </label>
              <textarea id="sv-lehrplan" readonly class="sv-locked-field">${svEscape(saved.lehrplan||lpName)}</textarea>
            </div>
            <div class="sv-field">
              <label class="sv-locked-label">
                🔒 Sequenz
              </label>
              <textarea id="sv-sequenz" readonly class="sv-locked-field">${svEscape(saved.sequenz||seqName)}</textarea>
            </div>
          </div>
          <div class="sv-field">
            <label>Stundenthema <button class="sv-suggest-btn" id="sv-suggest-btn" onclick="svSuggestThema()" title="KI-Themenvorschlag">💡 Vorschlagen</button></label>
            <div id="sv-thema-chips" class="sv-thema-chips" style="display:none"></div>
            <textarea id="sv-thema" oninput="svAutoSave();svAutoResize(this)">${svEscape(saved.thema||'')}</textarea>
          </div>
          <div class="sv-field"><label>Lernziele <button class="sv-suggest-btn" onclick="svRefreshFeld('lernziele')" title="KI neu generieren">↻</button></label><textarea id="sv-lernziele" class="tall" oninput="svAutoSave();svAutoResize(this)">${svEscape(saved.lernziele||'')}</textarea></div>
          <div class="sv-field"><label>Verlaufsplan <button class="sv-suggest-btn" onclick="svRefreshVerlaufsplan()" title="Abschnitt neu generieren">↻</button></label><textarea id="sv-verlaufsplan" class="tall" style="min-height:180px" oninput="svAutoSave();svAutoResize(this)">${svEscape(saved.verlaufsplan||'')}</textarea></div>
          <div class="sv-row">
            <div class="sv-field">
              <label>Material &amp; Medien</label>
              <div class="sv-material-drop" id="sv-material-drop"
                   ondragover="event.preventDefault();this.classList.add('drag-over')"
                   ondragleave="this.classList.remove('drag-over')"
                   ondrop="svDropMedia(event)">
                <div class="sv-material-chips" id="sv-material-chips">${svRenderChips(saved.materialItems||[])}</div>
                <div style="font-size:.72rem;color:var(--ts-text-muted);padding:2px 2px 4px">Aus der Datenbank hierher ziehen oder</div>
                <label class="sv-upload-label">
                  <input type="file" multiple style="display:none" onchange="svUploadFiles(this)">
                  + Dateien hochladen
                </label>
              </div>
            </div>
            <div class="sv-field"><label>Hausaufgaben <button class="sv-suggest-btn" onclick="svRefreshFeld('hausaufgaben')" title="KI neu generieren">↻</button></label><textarea id="sv-hausaufgaben" class="tall" oninput="svAutoSave();svAutoResize(this)">${svEscape(saved.hausaufgaben||'')}</textarea></div>
          </div>
          <div class="sv-field sv-tafelboard-field">
            <label>Tafelbild / Tafelskizze <button class="sv-suggest-btn" onclick="svRefreshFeld('tafelbild')" title="KI neu generieren">↻</button><button class="sv-suggest-btn sv-tafel-save-btn" onclick="svSaveTafelbildAsMedia()" title="Als Material speichern">💾 Als Material</button></label>
            <div class="sv-tafelboard-frame">
              <textarea id="sv-tafelbild" style="display:none" spellcheck="false">${svEscape(saved.tafelbild||'')}</textarea>
              <div class="sv-tafel-columns">
                <div class="sv-tafel-col" id="sv-tafel-col-left" contenteditable="true" oninput="svSyncTafelFromVisual()" spellcheck="false" data-placeholder="Linke Seite…"></div>
                <div class="sv-tafel-divider"></div>
                <div class="sv-tafel-col sv-tafel-col-mid" id="sv-tafel-col-mid" contenteditable="true" oninput="svSyncTafelFromVisual()" spellcheck="false" data-placeholder="Mitte…"></div>
                <div class="sv-tafel-divider"></div>
                <div class="sv-tafel-col" id="sv-tafel-col-right" contenteditable="true" oninput="svSyncTafelFromVisual()" spellcheck="false" data-placeholder="Rechte Seite…"></div>
              </div>
              <div class="sv-tafelboard-tray"><span class="sv-tafelboard-eraser"></span></div>
            </div>
          </div>

          <div class="sv-reflexion-wrap">
            <div class="sv-reflexion-title">📝 Reflexion & Nachbereitung</div>
            <div class="sv-field">
              <label>Lernziele erreicht?</label>
              <div class="sv-lz-group">
                <label class="sv-lz-btn sv-lz-ja${saved.lzErreicht==='ja'?' sv-lz-on':''}">
                  <input type="radio" name="sv-lz" value="ja" ${saved.lzErreicht==='ja'?'checked':''} onchange="_svLzUpdate(this)"> ✓ Ja
                </label>
                <label class="sv-lz-btn sv-lz-teilweise${saved.lzErreicht==='teilweise'?' sv-lz-on':''}">
                  <input type="radio" name="sv-lz" value="teilweise" ${saved.lzErreicht==='teilweise'?'checked':''} onchange="_svLzUpdate(this)"> ~ Teilweise
                </label>
                <label class="sv-lz-btn sv-lz-nein${saved.lzErreicht==='nein'?' sv-lz-on':''}">
                  <input type="radio" name="sv-lz" value="nein" ${saved.lzErreicht==='nein'?'checked':''} onchange="_svLzUpdate(this)"> ✗ Nein
                </label>
              </div>
            </div>
            <div class="sv-field"><label>Nachbereitungsnotiz</label><textarea id="sv-reflexion" class="tall" oninput="svAutoSave();svAutoResize(this)" placeholder="Was lief gut? Was würde ich beim nächsten Mal anders machen?">${svEscape(saved.reflexion||'')}</textarea></div>
          </div>
        </div>
      </div>
      <div class="sv-media-panel" id="sv-media-panel">
        ${svRenderMediaPanel(fachId)}
      </div>
    </div>`;
  svRenderTafelbildVisual();
  requestAnimationFrame(svResizeAll);
}

/* ── Material chips ── */
function svRenderChips(items){
  if(!items||!items.length) return '';
  return items.map(m=>`<span class="sv-material-chip" onclick="svChipMenu(event,'${m.id}')">${MEDIA_TYPE_ICON[m.type]||'📎'} ${svEscape(m.name)}</span>`).join('');
}

function svChipMenu(e, id){
  e.stopPropagation();
  document.getElementById('sv-chip-menu-overlay')?.remove();
  const item=getMediaDb().find(m=>m.id===id);
  const overlay=document.createElement('div');
  overlay.id='sv-chip-menu-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:399';
  overlay.onclick=()=>overlay.remove();
  const menu=document.createElement('div');
  menu.className='sv-chip-menu';
  // position near click
  const x=Math.min(e.clientX, window.innerWidth-180);
  const y=Math.min(e.clientY+4, window.innerHeight-140);
  menu.style.cssText=`left:${x}px;top:${y}px`;
  menu.innerHTML=`
    <button onclick="svChipOpen('${id}');document.getElementById('sv-chip-menu-overlay').remove()">
      <span>↗</span> Öffnen
    </button>
    <div class="sv-chip-menu-divider"></div>
    <button class="danger" onclick="svRemoveMaterial('${id}');document.getElementById('sv-chip-menu-overlay').remove()">
      <span>🗑</span> Löschen
    </button>`;
  overlay.appendChild(menu);
  document.body.appendChild(overlay);
}

function svChipOpen(id){ svOpenMedia(id); }

function svChipPrint(id){
  const item=getMediaDb().find(m=>m.id===id);
  if(!item) return;
  const src=item.url||item.dataUrl;
  if(!src) return;
  const w=window.open('','_blank');
  if(item.type==='image'){
    w.document.write(`<!DOCTYPE html><html><head><style>body{margin:0}img{max-width:100%}</style></head><body><img src="${src}" onload="window.print()"></body></html>`);
  } else if(item.type==='pdf'){
    w.document.write(`<!DOCTYPE html><html><head></head><body style="margin:0"><embed src="${src}" style="width:100%;height:100vh" onload="window.print()"></body></html>`);
  } else {
    w.document.write(`<!DOCTYPE html><html><head></head><body><script>window.onload=function(){window.print()}<\/script><embed src="${src}" style="width:100%;height:100vh"></body></html>`);
  }
  w.document.close();
}

async function svRemoveMaterial(id){
  if(!svContext) return;
  const key=svKey(svContext.datum,svContext.fachId,svContext.klasseId,svContext.slotIdx);
  if(stundenCache[key]&&stundenCache[key].materialItems){
    stundenCache[key].materialItems=stundenCache[key].materialItems.filter(m=>m.id!==id);
    await CryptoManager.setItem('ts_stunden', stundenCache);
    const el=document.getElementById('sv-material-chips');
    if(el) el.innerHTML=svRenderChips(stundenCache[key].materialItems);
  }
}

/* ── Media filter state (reset in openStunde) ── */
let _svFilter = { fach:'', klasse:'', type:'' };

const SV_KLASSENSTUFEN = Array.from({length:13},(_,i)=>String(i+1)); // '1'..'13'

const SV_MEDIA_TYPES = [
  { id:'link',    label:'Link',          icon:'🔗' },
  { id:'pdf',     label:'PDF',           icon:'📄' },
  { id:'image',   label:'Bild',          icon:'🖼️' },
  { id:'video',   label:'Video',         icon:'🎬' },
  { id:'html',    label:'KI-AB',         icon:'📋' },
  { id:'html-tb', label:'Tafelbild',     icon:'🪟' },
  { id:'html-pr', label:'Präsentation',  icon:'🎯' },
  { id:'html-iv', label:'Interaktiv',    icon:'⚡' },
  { id:'doc',     label:'Dokument',      icon:'📝' },
];

/* ── Media panel ── */
function svRenderMediaPanel(_, query=''){
  const faecher  = getAllFaecher();

  const fachOpts = `<option value="">Alle Fächer</option>`
    + faecher.map(f=>`<option value="${f.id}"${_svFilter.fach===f.id?' selected':''}>${svEscape(f.name)}</option>`).join('');

  const klasseOpts = `<option value="">Alle Klassen</option>`
    + SV_KLASSENSTUFEN.map(s=>`<option value="${s}"${_svFilter.klasse===s?' selected':''}>${s}. Klasse</option>`).join('');

  const typeOpts = `<option value="">Alle Formate</option>`
    + SV_MEDIA_TYPES.map(t=>`<option value="${t.id}"${_svFilter.type===t.id?' selected':''}>${t.icon} ${t.label}</option>`).join('');

  return `
    <div class="sv-panel-tabs">
      <button class="sv-panel-tab${_svActivePanel==='material'?' active':''}" onclick="svSwitchPanel('material')">📚 Material</button>
      <button class="sv-panel-tab${_svActivePanel==='ab'?' active':''}" onclick="svSwitchPanel('ab')">📄 AB-Generator</button>
    </div>
    <div id="sv-panel-material" style="display:${_svActivePanel==='material'?'flex':'none'};flex-direction:column;flex:1;min-height:0;overflow:hidden">
      <div class="sv-media-panel-hd">
        <span>Material-Datenbank</span>
        <button class="sv-media-add-btn" onclick="svAddMedia()" title="Material hinzufügen">+</button>
      </div>
      <div class="sv-media-search">
        <input type="search" id="sv-media-search-input" placeholder="Name oder Tag suchen…" value="${svEscape(query)}"
               oninput="svFilterMedia(this.value)">
      </div>
      <div class="sv-filter-row">
        <select class="sv-filter-select" id="sv-filter-fach"   onchange="svApplyFilter()">${fachOpts}</select>
        <select class="sv-filter-select" id="sv-filter-klasse" onchange="svApplyFilter()">${klasseOpts}</select>
        <select class="sv-filter-select" id="sv-filter-type"   onchange="svApplyFilter()">${typeOpts}</select>
      </div>
      <div class="sv-media-list" id="sv-media-list">
        ${svRenderMediaItems(query)}
      </div>
      <div class="sv-media-footer"><button onclick="svAddMedia()">+ Material hinzufügen</button></div>
    </div>
    <div id="sv-panel-ab" style="display:${_svActivePanel==='ab'?'flex':'none'};flex-direction:column;flex:1;min-height:0;overflow-y:auto">
      ${svRenderAbPanelContent()}
    </div>`;
}

/* Extrahiert die Klassenstufe aus einem Klassennamen:
   "7a" → "7", "10b" → "10", "Klasse 7a" → "7", "7. Klasse" → "7" */
function _svKlassenstufe(kl){ const m=(kl.name||'').match(/(\d+)/); return m?m[1]:''; }

function svRenderMediaItems(query){
  const q   = (query||'').toLowerCase().trim();
  const db  = getMediaDb();
  const filtered = db.filter(m => {
    const matchFach   = !_svFilter.fach   || (m.fachTags||[]).includes(_svFilter.fach);
    // Klasse-Filter: _svFilter.klasse ist eine Klassenstufe ('7'), klassenIds enthält Klasse-IDs ('kl_xxx').
    // → Klassen-Objekte mit passender Stufe suchen und deren IDs vergleichen.
    let matchKlasse = true;
    if(_svFilter.klasse){
      const matchingKlIds = (state.klassen||[])
        .filter(kl => _svKlassenstufe(kl) === _svFilter.klasse)
        .map(kl => kl.id);
      matchKlasse = (m.klassenIds||[]).some(id => matchingKlIds.includes(id));
    }
    let   matchType   = true;
    if(_svFilter.type){
      if(_svFilter.type === 'html-tb') matchType = m.type === 'html' && !!m.isTafelbild;
      else if(_svFilter.type === 'html-pr') matchType = m.type === 'html' && (m.tags||[]).includes('praesentation');
      else if(_svFilter.type === 'html') matchType = m.type === 'html' && !m.isTafelbild && !(m.tags||[]).includes('praesentation');
      else matchType = m.type === _svFilter.type;
    }
    let   matchQ = true;
    if(q){
      const nameHit  = m.name.toLowerCase().includes(q);
      const fachHit  = (m.fachTags||[]).some(tid=>{
        const f = getAllFaecher().find(x=>x.id===tid);
        return f && f.name.toLowerCase().includes(q);
      });
      const tagHit   = (m.tags||[]).some(t => t.toLowerCase().includes(q));
      matchQ = nameHit || fachHit || tagHit;
    }
    return matchFach && matchKlasse && matchType && matchQ;
  });

  if(!filtered.length){
    const hasFilter = q || _svFilter.fach || _svFilter.klasse || _svFilter.type;
    return hasFilter
      ? '<div class="sv-media-empty">Keine Treffer für diese Filterauswahl.</div>'
      : '<div class="sv-media-empty">Noch kein Material vorhanden.<br>Füge Material über + hinzu oder ziehe Dateien in das Feld links.</div>';
  }

  return filtered.map(m=>{
    const typeKey    = (m.type === 'html' && m.isTafelbild) ? 'html-tb'
                     : (m.type === 'html' && (m.tags||[]).includes('praesentation')) ? 'html-pr'
                     : (m.type === 'html' && (m.tags||[]).includes('interaktiv')) ? 'html-iv'
                     : m.type;
    const typeEntry  = SV_MEDIA_TYPES.find(t => t.id === typeKey);
    const typeLabel  = typeEntry ? typeEntry.label : m.type.toUpperCase();
    const fachName   = (m.fachTags||[]).map(tid=>{const f=getAllFaecher().find(x=>x.id===tid);return f?svEscape(f.name):'';}).filter(Boolean).join(', ');
    const klasseName = (m.klassenIds||[]).length
      ? 'Kl. ' + m.klassenIds.map(id => { const k=(state.klassen||[]).find(kl=>kl.id===id); return k?k.name:id; }).join(', ')
      : '';
    const meta = [typeLabel, fachName, klasseName].filter(Boolean).join(' · ');
    return `
    <div class="media-item" draggable="true"
         ondragstart="svMediaDragStart(event,'${m.id}')"
         ondragend="this.classList.remove('dragging')"
         ontouchstart="svMediaTouchStart(event,'${m.id}')"
         onclick="svOpenMedia('${m.id}')">
      <div class="media-type-icon" style="background:${MEDIA_TYPE_BG[typeKey]||'#f0f0f0'}">${MEDIA_TYPE_ICON[typeKey]||'📎'}</div>
      <div class="media-item-info">
        <div class="media-item-name">${svEscape(m.name)}</div>
        <div class="media-item-meta">${meta}</div>
      </div>
      <button class="media-item-menu-btn" title="Optionen"
              onclick="event.stopPropagation();svDbItemMenu(event,'${m.id}')">⋮</button>
    </div>`;
  }).join('');
}

/* Called on every keystroke — only updates list, search input keeps focus */
function svFilterMedia(query){
  const list = document.getElementById('sv-media-list');
  if(list) list.innerHTML = svRenderMediaItems(query);
}

/* Read all 3 dropdowns → update _svFilter → re-render list only */
function svApplyFilter(){
  _svFilter.fach   = document.getElementById('sv-filter-fach')?.value   || '';
  _svFilter.klasse = document.getElementById('sv-filter-klasse')?.value || '';
  _svFilter.type   = document.getElementById('sv-filter-type')?.value   || '';
  const q = document.getElementById('sv-media-search-input')?.value || '';
  const list = document.getElementById('sv-media-list');
  if(list) list.innerHTML = svRenderMediaItems(q);
}

/* Context menu for a database item */
function svDbItemMenu(e, id){
  document.getElementById('sv-dbitem-menu-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.id='sv-dbitem-menu-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:399';
  overlay.onclick=()=>overlay.remove();
  const menu=document.createElement('div');
  menu.className='sv-chip-menu';
  const x=Math.min(e.clientX, window.innerWidth-180);
  const y=Math.min(e.clientY+4, window.innerHeight-120);
  menu.style.cssText=`left:${x}px;top:${y}px`;
  menu.innerHTML=`
    <button onclick="svOpenMedia('${id}');document.getElementById('sv-dbitem-menu-overlay').remove()">
      <span>↗</span> Öffnen
    </button>
    <div class="sv-chip-menu-divider"></div>
    <button class="danger" onclick="svDeleteFromDb('${id}');document.getElementById('sv-dbitem-menu-overlay').remove()">
      <span>🗑</span> Aus Datenbank löschen
    </button>`;
  overlay.appendChild(menu);
  document.body.appendChild(overlay);
}

/* Delete an item from the media database entirely */
async function svDeleteFromDb(id){
  if(!confirm('Material dauerhaft aus der Datenbank löschen?')) return;
  const db=getMediaDb().filter(m=>m.id!==id);
  await saveMediaDb(db);
  // refresh list with current search term
  const inp=document.getElementById('sv-media-search-input');
  const query=inp?inp.value:'';
  const list=document.getElementById('sv-media-list');
  if(list) list.innerHTML=svRenderMediaItems(query);
}

/* ── Drag & Drop (Maus) ── */
function svMediaDragStart(e, id){
  e.dataTransfer.setData('text/plain',id);
  e.currentTarget.classList.add('dragging');
}

function svDropMedia(e){
  e.preventDefault();
  document.getElementById('sv-material-drop')?.classList.remove('drag-over');
  const id=e.dataTransfer.getData('text/plain');
  if(id){
    const item=getMediaDb().find(m=>m.id===id);
    if(item){ svAddMaterialToField(item); return; }
  }
  if(e.dataTransfer.files.length) svHandleFiles(e.dataTransfer.files);
}

/* ── Touch Drag für iOS (Safari/Chrome unterstützt kein HTML5 DnD per Touch) ── */
let _svTouchDragId = null;

function svMediaTouchStart(e, id) {
  e.stopPropagation();
  const touch = e.touches[0];
  const startX = touch.clientX, startY = touch.clientY;
  let started = false;
  let ghost = null;

  function onMove(ev) {
    const t = ev.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (!started && Math.abs(dx) + Math.abs(dy) < 8) return;
    ev.preventDefault();
    if (!started) {
      started = true;
      _svTouchDragId = id;
      ghost = document.createElement('div');
      ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;padding:6px 14px;border-radius:8px;background:var(--ts-teal);color:#fff;font-size:.78rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:.9;white-space:nowrap;transform:translate(-50%,-50%)';
      const item = getMediaDb().find(m => m.id === id);
      ghost.textContent = item ? item.name : '📎';
      document.body.appendChild(ghost);
      const dropZone = document.getElementById('sv-material-drop');
      if (dropZone) dropZone.classList.add('drag-over');
    }
    if (ghost) {
      ghost.style.left = t.clientX + 'px';
      ghost.style.top  = t.clientY + 'px';
    }
  }

  function onEnd(ev) {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    if (!started) return;
    if (ghost) ghost.remove();
    const dropZone = document.getElementById('sv-material-drop');
    if (dropZone) dropZone.classList.remove('drag-over');
    const t = ev.changedTouches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY);
    const zone = target ? target.closest('#sv-material-drop') : null;
    if (zone && _svTouchDragId) {
      const item = getMediaDb().find(m => m.id === _svTouchDragId);
      if (item) svAddMaterialToField(item);
    }
    _svTouchDragId = null;
  }

  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

async function svAddMaterialToField(item){
  if(!svContext) return;
  const key=svKey(svContext.datum,svContext.fachId,svContext.klasseId,svContext.slotIdx);
  if(!stundenCache[key]) stundenCache[key]={};
  if(!stundenCache[key].materialItems) stundenCache[key].materialItems=[];
  if(!stundenCache[key].materialItems.find(m=>m.id===item.id)){
    stundenCache[key].materialItems.push({id:item.id,name:item.name,type:item.type});
    await CryptoManager.setItem('ts_stunden', stundenCache);
  }
  const el=document.getElementById('sv-material-chips');
  if(el) el.innerHTML=svRenderChips(stundenCache[key].materialItems);
}

/* ── File upload ── */
function svUploadFiles(input){ if(input.files) svHandleFiles(input.files); }

function svHandleFiles(files){
  const db=getMediaDb();
  Array.from(files).forEach(file=>{
    const type=file.type.startsWith('image/')?'image':
               file.type==='application/pdf'?'pdf':
               (file.name.endsWith('.html')||file.name.endsWith('.htm'))?'html':
               file.type.startsWith('video/')?'video':'doc';
    const reader=new FileReader();
    reader.onload=ev=>{
      const item={
        id:'media_'+Date.now()+'_'+Math.random().toString(36).slice(2),
        name:file.name, type,
        dataUrl:ev.target.result,
        fachTags:svContext?[svContext.fachId]:[],
        source:'own',
        dateAdded:new Date().toISOString()
      };
      db.push(item); saveMediaDb(db);
      svAddMaterialToField(item);
      const panel=document.getElementById('sv-media-panel');
      if(panel&&svContext){ const _q=document.getElementById('sv-media-search-input')?.value||''; panel.innerHTML=svRenderMediaPanel(svContext.fachId,_q); }
    };
    reader.readAsDataURL(file);
  });
}

/* ── Open media ── */
// Types the browser can display natively — everything else gets downloaded
const MEDIA_BROWSER_NATIVE = new Set(['image','pdf','html','video','link']);

function svOpenMedia(id){
  const item=getMediaDb().find(m=>m.id===id);
  if(!item) return;
  const native=MEDIA_BROWSER_NATIVE.has(item.type);

  if(item.url){
    if(native){ window.open(item.url,'_blank'); }
    else {
      // Force download for Word/Excel/etc. URLs
      const a=document.createElement('a');
      a.href=item.url; a.download=item.name; a.target='_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    return;
  }

  // HTML-Inhalt (KI-generiertes Arbeitsblatt ohne URL/dataUrl)
  if(item.content && item.type==='html'){
    if(item.isTafelbild || (item.tags||[]).includes('praesentation') || (item.tags||[]).includes('interaktiv')){
      const blob = new Blob([item.content], {type:'text/html;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    svOpenAbViewer(item);
    return;
  }

  if(item.dataUrl){
    if(native){
      const w=window.open('','_blank');
      if(item.type==='image'){
        w.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${item.dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
      } else if(item.type==='video'){
        w.document.write(`<!DOCTYPE html><html><body style="margin:0;background:#000"><video src="${item.dataUrl}" controls autoplay style="width:100%;height:100vh"></body></html>`);
      } else {
        w.document.write(`<!DOCTYPE html><html><body style="margin:0"><embed src="${item.dataUrl}" style="width:100%;height:100vh"></body></html>`);
      }
      w.document.close();
    } else {
      const a=document.createElement('a');
      a.href=item.dataUrl; a.download=item.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  }
}

function svOpenAbViewer(item){
  // Gestalteten Inhalt direkt verwenden
  let renderedContent = item.content || '';
  if(!renderedContent && item.rawData){
    try { renderedContent = svRenderAbPreview(JSON.parse(item.rawData)); } catch(e){}
  }

  // Word-kompatible Version vorberechnen (im Hauptfenster-Kontext, wo svRenderAbForWord verfügbar ist)
  let wordBodyHtml = '';
  if(item.rawData){
    try { wordBodyHtml = svRenderAbForWord(JSON.parse(item.rawData)); } catch(e){}
  }
  if(!wordBodyHtml) wordBodyHtml = renderedContent; // Fallback auf Browser-Render

  const safeName = item.name.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_]/g,'').trim() || 'Arbeitsblatt';

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${item.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#f0ede7;padding:0}
  .print-bar{position:fixed;top:0;left:0;right:0;background:#1A3C5E;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;font-family:sans-serif;z-index:999;gap:10px}
  .print-bar strong{font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .print-bar button{border:none;padding:8px 15px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap}
  .btn-print{background:#3BA89B;color:#fff}
  .btn-docx{background:#2B579A;color:#fff}
  .btn-html{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3)!important}
  .page{max-width:760px;margin:0 auto;padding:64px 20px 40px}
  @media print{.print-bar{display:none}body{background:#fff}.page{padding:0;max-width:100%}}
</style></head><body>
<div class="print-bar">
  <strong>${item.name}</strong>
  <button class="btn-html" id="btn-html">💾 .html</button>
  <button class="btn-docx" id="btn-docx">📄 Als Word (.docx)</button>
  <button class="btn-print" onclick="window.print()">🖨️ Drucken / PDF</button>
</div>
<div class="page" id="ab-page">${renderedContent}</div>
<script>
  const safeName = ${JSON.stringify(safeName)};
  // Word-optimiertes HTML (vorberechnet im Hauptfenster — kein Flexbox, kein border-radius)
  const wordBodyHtml = ${JSON.stringify(wordBodyHtml)};

  function getPageHtml(){
    return '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>'+safeName+'</title></head><body style="font-family:Arial,sans-serif;padding:20mm 25mm;max-width:210mm">'+document.getElementById('ab-page').innerHTML+'</body></html>';
  }
  document.getElementById('btn-html').addEventListener('click',function(){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([getPageHtml()],{type:'text/html;charset=utf-8'}));
    a.download=safeName+'.html'; a.click();
  });
  document.getElementById('btn-docx').addEventListener('click',async function(){
    const btn = this; btn.disabled = true; btn.textContent = '⏳ …';
    try {
      if (!window.htmlDocx) {
        await new Promise((res,rej)=>{
          const s=document.createElement('script');
          s.src='https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js';
          s.onload=res; s.onerror=()=>rej(new Error('html-docx-js nicht ladbar'));
          document.head.appendChild(s);
        });
      }
      const fullDoc = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>'+safeName+'</title>'
        +'<style>body{font-family:Arial,sans-serif;font-size:11pt}p{margin:0}table{border-collapse:collapse}</style>'
        +'</head><body>'+wordBodyHtml+'</body></html>';
      const blob = htmlDocx.asBlob(fullDoc, {orientation:'portrait', margins:{top:1134,right:1418,bottom:1134,left:1418}});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = safeName + '.docx';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    } catch(e) {
      alert('Word-Export fehlgeschlagen: '+(e.message||e));
    }
    btn.disabled = false; btn.textContent = '📄 Als Word (.docx)';
  });
<\/script>
</body></html>`;

  // Blob-URL statt document.write() — zuverlässiger in allen Browsern
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // URL nach kurzer Zeit freigeben
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ── Add media modal ── */
function svAddMedia(){
  document.getElementById('sv-add-media-modal')?.remove();

  const INP = 'width:100%;padding:8px 12px;border:1.5px solid var(--ts-border);border-radius:var(--radius-sm);font-size:.9rem;font-family:var(--font-body);outline:none';
  const LBL = 'font-size:.75rem;font-weight:600;color:var(--ts-text-secondary);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em';

  // Fach dropdown — pre-select current lesson's fach
  const fachOpts = `<option value="">– Kein Fach –</option>`
    + getAllFaecher().map(f=>`<option value="${f.id}"${svContext&&f.id===svContext.fachId?' selected':''}>${svEscape(f.name)}</option>`).join('');

  // Klassenstufen checkboxes 1–13 — multi-select
  const klassenCbs = SV_KLASSENSTUFEN.map(s=>`
    <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer;padding:1px 0;min-width:48px">
      <input type="checkbox" name="svam-klasse" value="${s}">
      Kl. ${s}
    </label>`).join('');

  const overlay=document.createElement('div');
  overlay.id='sv-add-media-modal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(26,60,94,.45);z-index:3500;display:flex;align-items:center;justify-content:center;padding:var(--sp-md)';
  overlay.onclick=e=>{ if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML=`
    <div class="ts-modal-scroll" style="background:var(--ts-bg-card);border-radius:var(--radius-lg);padding:var(--sp-xl);width:100%;max-width:460px;box-shadow:var(--shadow-lg);overflow-y:auto;max-height:90dvh">
      <h3 style="font-family:var(--font-display);font-size:1.05rem;color:var(--ts-navy);margin-bottom:var(--sp-lg)">Material hinzufügen</h3>
      <div style="display:grid;gap:var(--sp-md)">

        <div><label style="${LBL}">Name *</label>
          <input id="svam-name" type="text" placeholder="z.B. Arbeitsblatt Brüche" style="${INP}"></div>

        <div><label style="${LBL}">Format</label>
          <select id="svam-type" onchange="svAmToggleType()" style="${INP};background:var(--ts-bg-card)">
            <option value="link">🔗 Link / URL</option>
            <option value="pdf">📄 PDF</option>
            <option value="image">🖼️ Bild</option>
            <option value="video">🎬 Video</option>
            <option value="html">📋 HTML-Datei</option>
            <option value="doc">📝 Dokument</option>
          </select></div>

        <div id="svam-url-wrap"><label style="${LBL}">URL *</label>
          <input id="svam-url" type="url" placeholder="https://…" style="${INP}"></div>
        <div id="svam-file-wrap" style="display:none"><label style="${LBL}">Datei *</label>
          <input id="svam-file" type="file" style="font-family:var(--font-body);font-size:.85rem;width:100%"></div>

        <div><label style="${LBL}">Fach</label>
          <select id="svam-fach" style="${INP};background:var(--ts-bg-card)">${fachOpts}</select></div>

        <div><label style="${LBL}">Klassen</label>
          <div style="display:flex;flex-wrap:wrap;gap:4px 20px;padding:4px 0">${klassenCbs}</div></div>

        <div style="display:flex;gap:var(--sp-sm);justify-content:flex-end;padding-top:var(--sp-sm)">
          <button onclick="document.getElementById('sv-add-media-modal').remove()" style="padding:8px 16px;border:1px solid var(--ts-border);border-radius:var(--radius-sm);background:none;cursor:pointer;font-family:var(--font-body)">Abbrechen</button>
          <button onclick="svSaveNewMedia()" style="padding:8px 16px;border-radius:var(--radius-sm);background:var(--ts-teal);color:#fff;border:none;cursor:pointer;font-family:var(--font-body);font-weight:600">Hinzufügen</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function svAmToggleType(){
  const type=document.getElementById('svam-type')?.value;
  document.getElementById('svam-url-wrap').style.display=type==='link'?'block':'none';
  document.getElementById('svam-file-wrap').style.display=type!=='link'?'block':'none';
}

function svSaveNewMedia(){
  const name=document.getElementById('svam-name')?.value.trim();
  const type=document.getElementById('svam-type')?.value;
  const url=document.getElementById('svam-url')?.value.trim();
  const fileInput=document.getElementById('svam-file');
  if(!name){ alert('Bitte einen Namen eingeben.'); return; }
  const fachId   = document.getElementById('svam-fach')?.value||'';
  const fachTags = fachId ? [fachId] : [];
  const klassenIds = Array.from(document.querySelectorAll('#sv-add-media-modal input[name="svam-klasse"]:checked')).map(cb=>cb.value);
  const base={id:'media_'+Date.now()+'_'+Math.random().toString(36).slice(2),name,type,fachTags,klassenIds,source:'own',dateAdded:new Date().toISOString()};
  const db=getMediaDb();
  function _svAfterSave(){
    document.getElementById('sv-add-media-modal')?.remove();
    const panel=document.getElementById('sv-media-panel');
    if(panel&&svContext){ const _q=document.getElementById('sv-media-search-input')?.value||''; panel.innerHTML=svRenderMediaPanel(svContext.fachId,_q); }
    if(typeof _mdbRefresh==='function') _mdbRefresh();
  }
  if(type==='link'){
    if(!url){ alert('Bitte eine URL eingeben.'); return; }
    db.push({...base,url}); saveMediaDb(db);
    _svAfterSave();
  } else {
    if(!fileInput?.files?.length){ alert('Bitte eine Datei auswählen.'); return; }
    const reader=new FileReader();
    reader.onload=ev=>{ db.push({...base,dataUrl:ev.target.result}); saveMediaDb(db); _svAfterSave(); };
    reader.readAsDataURL(fileInput.files[0]);
  }
}

/* ════════════════════════════════════════════
   LESSON CONTEXT MENU
   ════════════════════════════════════════════ */
let swapSource = null; // { dayIndex, slotIdx }

function openLessonMenu(e, datum, fachId, klasseId, slotIdx, dayIndex) {
  e.stopPropagation();
  // If swap mode active → treat click as swap target
  if (swapSource) {
    if (swapSource.dayIndex === dayIndex && swapSource.slotIdx === slotIdx) { cancelSwap(); return; }
    lessonSwapTarget(dayIndex, slotIdx);
    return;
  }
  document.getElementById('lesson-menu-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'lesson-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:399';
  overlay.onclick = () => overlay.remove();
  const menu = document.createElement('div');
  menu.className = 'lesson-menu';
  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY + 4, window.innerHeight - 200);
  menu.style.cssText = `left:${x}px;top:${y}px`;
  const fach = getFach(fachId);
  const _kloseMenu = "document.getElementById('lesson-menu-overlay').remove()";
  const ovKey = `${datum}_${dayIndex}_${slotIdx}`;
  const hasOverride = !!(state.tagesOverrides && state.tagesOverrides[ovKey]);
  menu.innerHTML = `
    <div style="padding:8px 14px 6px;font-size:.72rem;font-weight:600;color:var(--ts-text-muted);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--ts-border-light)">
      ${fach?fach.name:'Stunde'} · ${datum}${hasOverride?'<span style="margin-left:6px;background:#E8A44A;color:#fff;font-size:.65rem;padding:1px 5px;border-radius:3px;font-weight:700">Geändert</span>':''}
    </div>
    <button onclick="lessonPlan('${datum}','${fachId}','${klasseId}',${slotIdx});${_kloseMenu}">
      📝 Planen/Öffnen
    </button>
    <button onclick="openStundeOverrideModal('${datum}',${dayIndex},${slotIdx},'${fachId}','${klasseId}');${_kloseMenu}">
      ✏️ Ändern
    </button>
    <button onclick="lessonStartSwap(${dayIndex},${slotIdx});${_kloseMenu}">
      ↕ Verschieben (Tauschen)
    </button>
    <button onclick="exportVertretung('${datum}','${fachId}','${klasseId}',${slotIdx});${_kloseMenu}">
      📤 Für Vertretung exportieren
    </button>
    <div class="lesson-menu-divider"></div>
    ${hasOverride?`<button onclick="lessonRemoveOverride('${datum}',${dayIndex},${slotIdx});${_kloseMenu}">↩ Änderung zurücksetzen</button><div class="lesson-menu-divider"></div>`:''}
    <button class="danger" onclick="lessonDelete(${dayIndex},${slotIdx});${_kloseMenu}">
      🗑 Aus Stundenplan entfernen
    </button>`;
  overlay.appendChild(menu);
  document.body.appendChild(overlay);
}

function lessonPlan(datum, fachId, klasseId, slotIdx) {
  if (typeof openStunde === 'function') openStunde(datum, fachId, klasseId, slotIdx);
}

function lessonDelete(dayIndex, slotIdx) {
  if (!confirm('Stunde aus dem Stundenplan entfernen?')) return;
  const key = `${dayIndex}-${slotIdx}`;
  if (state.stundenplan) delete state.stundenplan[key];
  saveState();
  renderHeute(); renderWoche();
}

function lessonStartSwap(dayIndex, slotIdx) {
  swapSource = { dayIndex, slotIdx };
  renderHeute(); renderWoche();
}

function lessonSwapTarget(targetDay, targetSlot) {
  if (!swapSource) return;
  const srcKey = `${swapSource.dayIndex}-${swapSource.slotIdx}`;
  const tgtKey = `${targetDay}-${targetSlot}`;
  if (!state.stundenplan) state.stundenplan = {};
  const srcEntry = state.stundenplan[srcKey] || null;
  const tgtEntry = state.stundenplan[tgtKey] || null;
  if (tgtEntry) state.stundenplan[srcKey] = tgtEntry;
  else delete state.stundenplan[srcKey];
  if (srcEntry) state.stundenplan[tgtKey] = srcEntry;
  else delete state.stundenplan[tgtKey];
  saveState();
  swapSource = null;
  renderHeute(); renderWoche();
}

function cancelSwap() {
  swapSource = null;
  renderHeute(); renderWoche();
}

/* ── Ersetzen Modal ── */
function lessonReplace(dayIndex, slotIdx) {
  document.getElementById('lesson-replace-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'lesson-replace-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(26,60,94,.45);z-index:300;display:flex;align-items:center;justify-content:center;padding:var(--sp-md)';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  // Build fach+klasse combos
  const klassen = state.klassen || [];
  const options = [];
  klassen.forEach(k => {
    (k.faecher || []).forEach(fachId => {
      const fach = getFach(fachId);
      if (fach) options.push({ fachId, klasseId: k.id, fachName: fach.name, klasseName: k.name, color: fach.color });
    });
  });

  const rows = options.map(o =>
    `<div class="media-item" style="cursor:pointer;border-radius:var(--radius-sm)"
      onclick="lessonReplaceConfirm(${dayIndex},${slotIdx},'${o.fachId}','${o.klasseId}');document.getElementById('lesson-replace-modal').remove()">
      <div class="media-type-icon" style="background:${o.color}22;color:${o.color};font-weight:700;font-size:.8rem">${o.fachName.slice(0,2)}</div>
      <div class="media-item-info">
        <div class="media-item-name">${o.fachName}</div>
        <div class="media-item-meta">${o.klasseName}</div>
      </div>
    </div>`
  ).join('');

  overlay.innerHTML = `
    <div style="background:var(--ts-bg-card);border-radius:var(--radius-lg);width:100%;max-width:380px;box-shadow:var(--shadow-lg);overflow:hidden">
      <div style="padding:var(--sp-md) var(--sp-lg);border-bottom:1px solid var(--ts-border-light);display:flex;align-items:center;justify-content:space-between">
        <span style="font-family:var(--font-display);font-size:1rem;font-weight:600;color:var(--ts-navy)">Stunde ersetzen</span>
        <button onclick="document.getElementById('lesson-replace-modal').remove()" class="btn-icon">✕</button>
      </div>
      <div style="max-height:60dvh;overflow-y:auto;padding:var(--sp-sm)">
        ${rows || '<div style="padding:var(--sp-lg);text-align:center;color:var(--ts-text-muted);font-size:.85rem">Keine Klassen angelegt — bitte unter <strong>Mein Profil</strong> einrichten.</div>'}
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function lessonReplaceConfirm(dayIndex, slotIdx, fachId, klasseId) {
  if (!state.stundenplan) state.stundenplan = {};
  state.stundenplan[`${dayIndex}-${slotIdx}`] = { fachId, klasseId };
  saveState();
  renderHeute(); renderWoche();
}

/* ══ Tages-Override Modal (Ändern / Stunde erstellen) ══ */
function openStundeOverrideModal(datum, dayIndex, slotIdx, existingFachId, existingKlasseId){
  document.getElementById('stundeOverrideModal')?.remove();
  const overrideKey = `${datum}_${dayIndex}_${slotIdx}`;
  const existing  = (state.tagesOverrides||{})[overrideKey];
  const selFach   = (!existing?.isVertretung && (existing?.fachId   || existingFachId))   || '';
  const selKlasse = (!existing?.isVertretung && (existing?.klasseId || existingKlasseId)) || '';
  const isVtg     = existing?.isVertretung || false;
  const vtgFachId = isVtg ? (existing?.fachId || '') : '';
  const vtgKlasse = isVtg ? (existing?.vtgKlasse || '') : '';
  const isNew     = !existingFachId && !existingKlasseId;

  const klassen = state.klassen || [];
  const ownOptions = [];
  klassen.forEach(k => {
    (k.faecher||[]).forEach(fId => {
      const f = getFach(fId);
      if(f) ownOptions.push({ fachId:fId, klasseId:k.id, fachName:f.name, klasseName:k.name, color:f.color });
    });
  });

  const rows = ownOptions.map(o => {
    const sel = o.fachId === selFach && o.klasseId === selKlasse;
    return `<div class="som-option${sel?' som-selected':''}"
      onclick="_somSelect(this,'${o.fachId}','${o.klasseId}')">
      <div class="som-option-dot" style="background:${o.color}22;color:${o.color};font-weight:700;font-size:.78rem">${o.fachName.slice(0,2).toUpperCase()}</div>
      <div class="som-option-info">
        <div class="som-option-name">${o.fachName}</div>
        <div class="som-option-meta">${o.klasseName}</div>
      </div>
      ${sel?'<div class="som-check">✓</div>':''}
    </div>`;
  }).join('');

  const allFaecherOpts = getAllFaecher().map(f =>
    `<option value="${f.id}"${vtgFachId===f.id?' selected':''}>${f.name}</option>`
  ).join('');

  const zr = getZeitraster();
  const slot = zr[slotIdx];
  const dow = (new Date(datum+'T00:00:00').getDay()+6)%7;

  const overlay = document.createElement('div');
  overlay.id = 'stundeOverrideModal';
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal-card som-card">
      <div class="modal-header">
        <div>
          <div style="font-weight:700">${isNew?'Stunde erstellen':'Stunde ändern'}</div>
          <div style="font-size:.75rem;color:var(--ts-text-muted);margin-top:1px">${TAGE_LONG[dow]||''} · ${dateDe(datum)} · ${slot?slot.von+'–'+slot.bis:''}</div>
        </div>
        <button class="modal-close" onclick="document.getElementById('stundeOverrideModal').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:0">

        <!-- Eigene Stunden (sichtbar wenn KEINE Vertretung) -->
        <div id="som-own-section" style="${isVtg?'display:none':''}">
          <div class="som-list" style="margin-bottom:0">
            ${rows||'<div class="som-empty">Keine eigenen Klassen/Fächer angelegt.</div>'}
          </div>
        </div>
        <input type="hidden" id="som-fach"   value="${selFach}">
        <input type="hidden" id="som-klasse" value="${selKlasse}">

        <!-- Vertretungs-Formular (sichtbar wenn Vertretung aktiv) -->
        <div id="som-vtg-section" style="${isVtg?'':'display:none'};padding:var(--sp-md)">
          <div style="font-size:.78rem;color:var(--ts-text-muted);margin-bottom:var(--sp-sm)">Wähle das Fach und gib die Klasse ein, die du vertrittst:</div>
          <div class="kl-field-row kl-field-row--label" style="margin-bottom:8px">
            <label class="kl-label" style="min-width:52px">Fach</label>
            <select id="som-vtg-fach" class="input" style="flex:1">
              <option value="">— Fach wählen —</option>
              ${allFaecherOpts}
            </select>
          </div>
          <div class="kl-field-row kl-field-row--label">
            <label class="kl-label" style="min-width:52px">Klasse</label>
            <input id="som-vtg-klasse" class="input" type="text" style="flex:1"
                   placeholder="z. B. 7c, 9a …" autocomplete="off"
                   value="${vtgKlasse}">
          </div>
        </div>

        <!-- Vertretungs-Checkbox -->
        <div class="som-vtg-row">
          <label class="som-vtg-label" onclick="_somVtgToggle()">
            <span id="som-vtg-box" class="som-vtg-box${isVtg?' som-vtg-on':''}">✓</span>
            Vertretungsstunde
          </label>
          <input type="hidden" id="som-vtg-val" value="${isVtg?'1':'0'}">
        </div>
      </div>
      <div class="modal-footer">
        ${!isNew&&existing?`<button class="btn kl-del-btn" style="font-size:.82rem" onclick="_somDelete('${datum}',${dayIndex},${slotIdx})">Änderung entfernen</button>`:''}
        <span style="flex:1"></span>
        <button class="btn btn-secondary" onclick="document.getElementById('stundeOverrideModal').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="_somSave('${datum}',${dayIndex},${slotIdx})">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function _somSelect(el, fachId, klasseId){
  document.querySelectorAll('.som-option').forEach(o => { o.classList.remove('som-selected'); const c=o.querySelector('.som-check'); if(c) c.remove(); });
  el.classList.add('som-selected');
  el.insertAdjacentHTML('beforeend','<div class="som-check">✓</div>');
  document.getElementById('som-fach').value   = fachId;
  document.getElementById('som-klasse').value = klasseId;
}

function _somVtgToggle(){
  const val     = document.getElementById('som-vtg-val');
  const box     = document.getElementById('som-vtg-box');
  const ownSec  = document.getElementById('som-own-section');
  const vtgSec  = document.getElementById('som-vtg-section');
  const nowOn   = val.value !== '1';
  val.value     = nowOn ? '1' : '0';
  box.classList.toggle('som-vtg-on', nowOn);
  if(ownSec) ownSec.style.display = nowOn ? 'none' : '';
  if(vtgSec) vtgSec.style.display = nowOn ? '' : 'none';
  if(nowOn) setTimeout(() => document.getElementById('som-vtg-fach')?.focus(), 60);
}

function _somSave(datum, dayIndex, slotIdx){
  const isVtg = document.getElementById('som-vtg-val').value === '1';
  let fachId, klasseId, vtgKlasse;
  if(isVtg){
    fachId    = document.getElementById('som-vtg-fach')?.value || '';
    vtgKlasse = (document.getElementById('som-vtg-klasse')?.value || '').trim();
    if(!fachId){ alert('Bitte ein Fach für die Vertretungsstunde wählen.'); return; }
    if(!vtgKlasse){ alert('Bitte die Klasse eingeben, die du vertrittst.'); return; }
    klasseId = '';
  } else {
    fachId   = document.getElementById('som-fach').value;
    klasseId = document.getElementById('som-klasse').value;
    if(!fachId || !klasseId){ alert('Bitte ein Fach und eine Klasse auswählen.'); return; }
    vtgKlasse = '';
  }
  if(!state.tagesOverrides) state.tagesOverrides = {};
  const key = `${datum}_${dayIndex}_${slotIdx}`;
  state.tagesOverrides[key] = { fachId, klasseId, isVertretung: isVtg, vtgKlasse: vtgKlasse || '' };
  if(!state.vertretungsLog) state.vertretungsLog = [];
  state.vertretungsLog = state.vertretungsLog.filter(v => v.key !== key);
  if(isVtg) state.vertretungsLog.push({ key, datum, slotIdx, fachId, klasseId, vtgKlasse: vtgKlasse || '', ts: Date.now() });
  saveState();
  document.getElementById('stundeOverrideModal')?.remove();
  renderHeute(); renderWoche();
}

function _somDelete(datum, dayIndex, slotIdx){
  const key = `${datum}_${dayIndex}_${slotIdx}`;
  if(state.tagesOverrides) delete state.tagesOverrides[key];
  if(state.vertretungsLog) state.vertretungsLog = state.vertretungsLog.filter(v => v.key !== key);
  saveState();
  document.getElementById('stundeOverrideModal')?.remove();
  renderHeute(); renderWoche();
}

function lessonRemoveOverride(datum, dayIndex, slotIdx){ _somDelete(datum, dayIndex, slotIdx); }

/* ══ Vertretungsplan-Export ══ */
function exportVertretung(datum, fachId, klasseId, slotIdx){
  const key   = typeof svKey === 'function' ? svKey(datum, fachId, klasseId, slotIdx) : `${datum}_${fachId}_${klasseId}_${slotIdx}`;
  const saved = stundenCache[key] || {};
  const fach  = getFach(fachId);
  const kl    = getKlasse(klasseId);
  const zr    = getZeitraster();
  const slot  = zr[slotIdx];
  const vtgEntry = (state.tagesOverrides||{})[`${datum}_*_${slotIdx}`]; // approx — fachId/klasseId already correct
  const lines = [
    '═══════════════════════════════════════',
    '  VERTRETUNGSPLAN – TeachSmarter',
    '═══════════════════════════════════════',
    `Datum:    ${dateDe(datum)}`,
    `Zeit:     ${slot ? slot.von+' – '+slot.bis+' ('+slot.nr+'. Stunde)' : '–'}`,
    `Fach:     ${fach ? fach.name : fachId}`,
    `Klasse:   ${kl   ? kl.name  : klasseId}`,
    '',
    '───────────────────────────────────────',
    'STUNDENTHEMA',
    saved.thema || '–',
    '',
    '───────────────────────────────────────',
    'LERNZIELE',
    saved.lernziele || '–',
    '',
    '───────────────────────────────────────',
    'VERLAUFSPLAN',
    saved.verlaufsplan || '–',
    '',
    '───────────────────────────────────────',
    'HAUSAUFGABEN',
    saved.hausaufgaben || '–',
    '',
    '───────────────────────────────────────',
    'TAFELBILD / NOTIZEN',
    saved.tafelbild || '–',
    '',
    '═══════════════════════════════════════',
    `Exportiert: ${new Date().toLocaleString('de-DE')}`,
  ].join('\n');

  document.getElementById('vtgExportModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'vtgExportModal';
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:580px">
      <div class="modal-header">
        <span>📤 Vertretungsplan exportieren</span>
        <button class="modal-close" onclick="document.getElementById('vtgExportModal').remove()">✕</button>
      </div>
      <div class="modal-body kl-modal-body">
        <div style="font-size:.78rem;color:var(--ts-text-muted);margin-bottom:8px">Text kopieren oder als Datei speichern — für Kollegin / Kollegen zur Vertretung.</div>
        <textarea id="vtgExportText" class="vtg-export-textarea" readonly>${lines.replace(/</g,'&lt;')}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="_vtgCopy()">📋 Kopieren</button>
        <button class="btn btn-secondary" onclick="_vtgDownload('${datum}_${fachId}_${klasseId}')">⬇ Download .txt</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" onclick="document.getElementById('vtgExportModal').remove()">Schließen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function _vtgCopy(){
  const ta = document.getElementById('vtgExportText');
  if(!ta) return;
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.querySelector('#vtgExportModal .btn-secondary');
    if(btn){ const orig=btn.textContent; btn.textContent='✓ Kopiert!'; setTimeout(()=>btn.textContent=orig,2000); }
  }).catch(() => { ta.select(); document.execCommand('copy'); });
}

function _vtgDownload(prefix){
  const ta = document.getElementById('vtgExportText');
  if(!ta) return;
  const blob = new Blob([ta.value], { type:'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Vertretungsplan_${prefix}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── KI-Vorbereitung — erst Thema prüfen, dann Konfig-Dialog ── */
function svGenerateKI(){
  if(!svContext) return;
  const thema = document.getElementById('sv-thema')?.value?.trim();
  if(!thema){
    alert('Bitte zuerst ein Stundenthema eingeben.\n\nTipp: Nutze 💡 Vorschlagen für KI-Themenideen.');
    document.getElementById('sv-thema')?.focus();
    return;
  }
  svShowKiConfigModal();
}

function svShowKiConfigModal(){
  document.getElementById('sv-ki-config-modal')?.remove();
  const thema = svEscape(document.getElementById('sv-thema')?.value||'');
  const modal = document.createElement('div');
  modal.id = 'sv-ki-config-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:520px">
      <div class="modal-header">🪄 Stunde mit KI vorbereiten
        <button onclick="document.getElementById('sv-ki-config-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--ts-text-muted);padding:4px">✕</button>
      </div>
      <div class="modal-body">
      <div class="sv-ki-cfg-thema">Thema: <strong>${thema}</strong></div>

      <div class="sv-ki-cfg-section">
        <label>Einstieg</label>
        <div class="sv-ki-chip-row" id="sv-cfg-einstieg">
          ${['Problemstellung','Bild / Foto','Geschichte','Experiment','Quiz / Rätsel','Schülergespräch'].map((e,i)=>
            `<button class="sv-ki-chip${i===0?' active':''}" onclick="svKiChipSelect(this,'sv-cfg-einstieg')">${e}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sv-ki-cfg-section">
        <label>Sozialform</label>
        <div class="sv-ki-chip-row" id="sv-cfg-sozial">
          ${['Einzelarbeit','Partnerarbeit','Gruppenarbeit','Plenum','gemischt'].map((e,i)=>
            `<button class="sv-ki-chip${i===4?' active':''}" onclick="svKiChipSelect(this,'sv-cfg-sozial')">${e}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sv-ki-cfg-section">
        <label>Differenzierung</label>
        <div class="sv-ki-chip-row" id="sv-cfg-diff">
          ${['Keine','2 Niveaus','3 Niveaus (B/M/E)'].map((e,i)=>
            `<button class="sv-ki-chip${i===2?' active':''}" onclick="svKiChipSelect(this,'sv-cfg-diff')">${e}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sv-ki-cfg-section">
        <label>Hauptmaterial</label>
        <div class="sv-ki-chip-row" id="sv-cfg-material">
          ${['Schulbuch','Arbeitsblatt','Digitale Medien','Experiment','Tafel','gemischt'].map((e,i)=>
            `<button class="sv-ki-chip${i===5?' active':''}" onclick="svKiChipSelect(this,'sv-cfg-material')">${e}</button>`
          ).join('')}
        </div>
      </div>

      <div class="sv-ki-cfg-section">
        <label>Besonderheiten <span style="font-weight:400;text-transform:none">(optional)</span></label>
        <textarea id="sv-cfg-besonderheiten" class="sv-ki-cfg-ta" placeholder="z.B. 3 DaZ-Schüler, sehr lebhafte Klasse, kein Beamer…"></textarea>
      </div>

      <div class="sv-ki-cfg-actions">
        <button class="btn btn-ghost btn-sm" style="width:auto" onclick="document.getElementById('sv-ki-config-modal').remove()">Abbrechen</button>
        <button class="btn btn-primary" id="sv-cfg-gen-btn" onclick="svKiConfigGenerate()">🪄 Stunde generieren</button>
      </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

function svKiChipSelect(btn, groupId){
  document.querySelectorAll(`#${groupId} .sv-ki-chip`).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

async function svKiConfigGenerate(){
  const getActive = id => document.querySelector(`#${id} .sv-ki-chip.active`)?.textContent||'';
  const config = {
    einstieg:      getActive('sv-cfg-einstieg'),
    sozialform:    getActive('sv-cfg-sozial'),
    differenzierung: getActive('sv-cfg-diff'),
    material_typ:  getActive('sv-cfg-material'),
    besonderheiten: document.getElementById('sv-cfg-besonderheiten')?.value||'',
  };

  document.getElementById('sv-ki-config-modal')?.remove();

  const mainBtn = document.getElementById('sv-ki-btn');
  if(mainBtn){ mainBtn.textContent='⏳ Generiere...'; mainBtn.disabled=true; }

  const {fachId, klasseId, slotIdx} = svContext;
  const fach   = getFach(fachId);
  const klasse = getKlasse(klasseId);
  const zr     = getZeitraster();
  const slot   = zr[slotIdx];
  const minSlot = slot
    ? (parseInt(slot.bis.split(':')[0])*60+parseInt(slot.bis.split(':')[1]))
      -(parseInt(slot.von.split(':')[0])*60+parseInt(slot.von.split(':')[1]))
    : 45;

  const result = await callKI('stundenvorbereitung', {
    fach:     fach?.name||'',
    klasse:   klasse?.name||'',
    jgst:     klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart||'',
    bundesland: state.bundesland||'',
    lehrplan: document.getElementById('sv-lehrplan')?.value||'',
    sequenz:  document.getElementById('sv-sequenz')?.value||'',
    thema:    document.getElementById('sv-thema')?.value||'',
    zeit:     minSlot+' Minuten',
    sus:      klasse?.sus||'',
    ...config,
  });

  if(mainBtn){
    mainBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 32 32" fill="none"><path d="M16 4c-5.5 0-10 4-10 9.1 0 2.6 1.3 5 3.4 6.6.5.4.8 1 .9 1.7l.3 2c.1.9.9 1.6 1.8 1.6h7.2c.9 0 1.7-.7 1.8-1.6l.3-2c.1-.7.4-1.3.9-1.7 2.1-1.6 3.4-4 3.4-6.6C26 8 21.5 4 16 4z" stroke="#fff" stroke-width="1.8" fill="rgba(255,255,255,.2)"/><circle cx="13.5" cy="12" r="1.3" fill="#fff"/><circle cx="18.5" cy="12" r="1.3" fill="#fff"/><circle cx="16" cy="16" r="1.3" fill="#fff"/></svg> Mit KI vorbereiten <span class="premium-badge">Premium</span>`;
    mainBtn.disabled=false;
  }

  if(result && typeof result==='object'){
    const verlauf = [
      result.einstieg    ? '🟢 Einstieg:\n'+result.einstieg    : '',
      result.erarbeitung ? '🔵 Erarbeitung:\n'+result.erarbeitung : '',
      result.sicherung   ? '🟠 Sicherung:\n'+result.sicherung   : '',
    ].filter(Boolean).join('\n\n');
    const set = (id,val) => { const el=document.getElementById(id); if(el&&val){ el.value=val; svAutoResize(el); } };
    set('sv-lernziele',   result.lernziele);
    set('sv-verlaufsplan', verlauf);
    set('sv-hausaufgaben', result.hausaufgaben);
    set('sv-tafelbild',   result.tafelbild);
    svAutoSave();
    svRenderTafelbildVisual();
  }
}

// Backward-compat alias
function svKiPrepare(){ svGenerateKI(); }

/* ── Einzelfeld neu generieren ── */
async function svRefreshFeld(fieldId){
  if(!svContext) return;
  const fach   = getFach(svContext.fachId);
  const klasse = getKlasse(svContext.klasseId);
  const result = await callKI('feld_refresh', {
    field:    fieldId,
    fach:     fach?.name||'',
    jgst:     klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart||'',
    thema:    document.getElementById('sv-thema')?.value||'',
    lehrplan: document.getElementById('sv-lehrplan')?.value||'',
    sequenz:  document.getElementById('sv-sequenz')?.value||'',
    existingContent: document.getElementById('sv-'+fieldId)?.value||'',
  });
  if(result && typeof result==='object' && result[fieldId]){
    const el = document.getElementById('sv-'+fieldId);
    if(el){ el.value = result[fieldId]; svAutoResize(el); svAutoSave(); }
    if(fieldId === 'tafelbild') svRenderTafelbildVisual();
  }
}

/* ── Tafelbild: Parser + Visual-Sync ── */
function svParseTafelbild(text){
  if(!text) return {left:'',middle:'',right:''};
  const L = text.match(/(?:LINKS|LINKE\s+SEITE)\s*[:\-]\s*([\s\S]*?)(?=\n\s*(?:MITTE|MITTIG|RECHTS|RECHTE\s+SEITE)\s*[:\-]|$)/i);
  const M = text.match(/(?:MITTE|MITTIG)\s*[:\-]\s*([\s\S]*?)(?=\n\s*(?:RECHTS|RECHTE\s+SEITE)\s*[:\-]|$)/i);
  const R = text.match(/(?:RECHTS|RECHTE\s+SEITE)\s*[:\-]\s*([\s\S]*?)$/i);
  const hasStructure = L||M||R;
  return {
    left:   L ? L[1].trim() : '',
    middle: hasStructure ? (M ? M[1].trim() : '') : text.trim(),
    right:  R ? R[1].trim() : '',
  };
}

function svRenderTafelbildVisual(){
  const ta = document.getElementById('sv-tafelbild');
  if(!ta) return;
  const p = svParseTafelbild(ta.value);
  const setCol = (id, val) => {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
  };
  setCol('sv-tafel-col-left',  p.left);
  setCol('sv-tafel-col-mid',   p.middle);
  setCol('sv-tafel-col-right', p.right);
}

function svSyncTafelFromVisual(){
  const ta = document.getElementById('sv-tafelbild');
  if(!ta) return;
  const left  = document.getElementById('sv-tafel-col-left')?.innerText?.trim()  || '';
  const mid   = document.getElementById('sv-tafel-col-mid')?.innerText?.trim()   || '';
  const right = document.getElementById('sv-tafel-col-right')?.innerText?.trim() || '';
  ta.value = `LINKS:\n${left}\n\nMITTE:\n${mid}\n\nRECHTS:\n${right}`;
  svAutoSave();
}

function svBuildTafelbildHtml(left, mid, right, thema){
  const E = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Tafelbild – ${E(thema)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#2a1a0a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif}
.bar{position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;display:flex;align-items:center;gap:12px;padding:10px 20px;z-index:9;font-size:.85rem}
.bar strong{flex:1}
.bar button{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.8rem}
.bar button:hover{background:rgba(255,255,255,.25)}
.frame{background:linear-gradient(160deg,#7d4e28,#5a3010 50%,#6e3d1c);padding:16px 18px 0;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12);width:100%;max-width:1100px}
.title-bar{color:rgba(255,255,255,.5);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;padding:0 0 8px 2px;font-family:'Segoe Print','Chalkboard SE','Comic Sans MS',sans-serif}
.cols{display:flex;background:#1f4521;border-radius:4px 4px 0 0;box-shadow:inset 0 0 80px rgba(0,0,0,.3)}
.col{flex:1;padding:20px 22px;color:rgba(255,255,255,.88);font-family:'Segoe Print','Chalkboard SE','Comic Sans MS',sans-serif;font-size:1rem;line-height:1.85;white-space:pre-wrap;letter-spacing:.01em;min-height:260px}
.div{width:1px;border-left:2px dashed rgba(255,255,255,.22);margin:18px 0;flex-shrink:0}
.tray{height:16px;background:linear-gradient(to bottom,#8b5e2e,#6b3e18 60%,#7a4a22);border-radius:0 0 6px 6px;margin:4px 0 0;box-shadow:0 3px 8px rgba(0,0,0,.4)}
@media print{.bar{display:none}body{background:#fff;padding:0}.frame{box-shadow:none;padding:0;border-radius:0;background:#fff}.cols{background:#1f4521;border-radius:0}.tray{display:none}}
</style></head><body>
<div class="bar"><strong>Tafelbild – ${E(thema)}</strong><button onclick="window.print()">🖨️ Drucken</button></div>
<div class="frame">
  <div class="title-bar">${E(thema)}</div>
  <div class="cols">
    <div class="col">${E(left)}</div>
    <div class="div"></div>
    <div class="col">${E(mid)}</div>
    <div class="div"></div>
    <div class="col">${E(right)}</div>
  </div>
  <div class="tray"></div>
</div>
</body></html>`;
}

function svSaveTafelbildAsMedia(){
  const left  = document.getElementById('sv-tafel-col-left')?.innerText?.trim()  || '';
  const mid   = document.getElementById('sv-tafel-col-mid')?.innerText?.trim()   || '';
  const right = document.getElementById('sv-tafel-col-right')?.innerText?.trim() || '';
  if(!left && !mid && !right){ alert('Das Tafelbild ist noch leer.'); return; }
  const thema = document.getElementById('sv-thema')?.value?.trim() || 'Tafelbild';
  const fachId = svContext?.fachId || '';
  const htmlContent = svBuildTafelbildHtml(left, mid, right, thema);
  const klasseId = svContext?.klasseId || '';
  const item = {
    id:   'media_'+Date.now()+'_'+Math.random().toString(36).slice(2),
    name: 'Tafelbild – '+thema,
    type: 'html',
    content: htmlContent,
    isTafelbild: true,
    fachTags:   fachId   ? [fachId]   : [],
    klassenIds: klasseId ? [klasseId] : [],
    tags:       ['tafelbild'],
    source:     'own',
    createdAt:  new Date().toISOString(),
  };
  const db = getMediaDb();
  db.push(item);
  saveMediaDb(db);
  // Panel neu rendern
  const panel = document.getElementById('sv-media-panel');
  if(panel && svContext){ panel.innerHTML = svRenderMediaPanel(svContext.fachId); }
  // kurzes Feedback
  const btn = document.querySelector('.sv-tafel-save-btn');
  if(btn){ const orig=btn.textContent; btn.textContent='✓ Gespeichert'; btn.style.color='var(--ts-teal)'; setTimeout(()=>{ btn.textContent=orig; btn.style.color=''; },1800); }
}

/* ── Verlaufsplan-Abschnitt wählen & neu generieren ── */
function svRefreshVerlaufsplan(){
  if(!svContext) return;
  const existing = document.getElementById('sv-verlauf-refresh-modal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'sv-verlauf-refresh-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:var(--ts-bg-card);border-radius:16px;padding:1.5rem;max-width:300px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin-bottom:1rem">↻ Was soll neu generiert werden?</div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        ${[['einstieg','🟢 Einstieg'],['erarbeitung','🔵 Erarbeitung'],['sicherung','🟠 Sicherung']].map(([k,l])=>
          `<button onclick="svRefreshVerlaufPhase('${k}');document.getElementById('sv-verlauf-refresh-modal').remove()"
            style="padding:10px 14px;background:var(--ts-bg);border:1.5px solid var(--ts-border,#e0e0e0);border-radius:8px;cursor:pointer;text-align:left;font-size:.9rem;color:var(--ts-text)">${l} <span style="font-size:.75rem;color:var(--ts-teal)">1 Credit</span></button>`
        ).join('')}
        <button onclick="svKiConfigGenerate_fromRefresh();document.getElementById('sv-verlauf-refresh-modal').remove()"
          style="padding:10px 14px;background:var(--ts-teal);color:#fff;border:none;border-radius:8px;cursor:pointer;text-align:left;font-size:.9rem;font-weight:600">Alles neu generieren <span style="font-size:.75rem;opacity:.8">3 Credits</span></button>
        <button onclick="document.getElementById('sv-verlauf-refresh-modal').remove()"
          style="padding:8px;border:none;background:none;color:var(--ts-text-muted);cursor:pointer;font-size:.85rem">Abbrechen</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
}

async function svRefreshVerlaufPhase(phase){
  if(!svContext) return;
  const fach   = getFach(svContext.fachId);
  const klasse = getKlasse(svContext.klasseId);
  const result = await callKI('feld_refresh', {
    field:    phase,
    fach:     fach?.name||'',
    jgst:     klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart||'',
    thema:    document.getElementById('sv-thema')?.value||'',
    lehrplan: document.getElementById('sv-lehrplan')?.value||'',
    sequenz:  document.getElementById('sv-sequenz')?.value||'',
  });
  if(result && typeof result==='object' && result[phase]){
    const ta = document.getElementById('sv-verlaufsplan');
    if(!ta) return;
    const phaseEmoji = {einstieg:'🟢 Einstieg',erarbeitung:'🔵 Erarbeitung',sicherung:'🟠 Sicherung'}[phase];
    const newBlock = `${phaseEmoji}:\n${result[phase]}`;
    // Existing content: replace the matching block if present, otherwise append
    const regex = new RegExp(`(🟢 Einstieg|🔵 Erarbeitung|🟠 Sicherung):\\n[\\s\\S]*?(?=(🟢 Einstieg|🔵 Erarbeitung|🟠 Sicherung):|$)`);
    const phaseMarker = {einstieg:'🟢 Einstieg',erarbeitung:'🔵 Erarbeitung',sicherung:'🟠 Sicherung'}[phase];
    const specificRegex = new RegExp(`${phaseMarker}:[\\s\\S]*?(?=(🟢 Einstieg:|🔵 Erarbeitung:|🟠 Sicherung:)|$)`);
    if(ta.value.includes(phaseMarker)){
      ta.value = ta.value.replace(specificRegex, newBlock + '\n\n').trim();
    } else {
      ta.value = ta.value ? ta.value + '\n\n' + newBlock : newBlock;
    }
    svAutoResize(ta);
    svAutoSave();
  }
}

function svKiConfigGenerate_fromRefresh(){
  // Re-show the config modal for full regeneration
  svGenerateKI();
}

/* ── Panel Slide-In Toggle (wie pl-panel in Jahresplanung) ── */
let _svPanelOpen = false;
function svTogglePanel(){
  _svPanelOpen = !_svPanelOpen;
  const panel   = document.getElementById('sv-media-panel');
  const view    = document.getElementById('view-stundenvorbereitung');
  const btn     = document.getElementById('sv-panel-toggle-btn');
  const overlay = document.getElementById('sv-panel-overlay');
  if(_svPanelOpen){
    panel?.classList.add('open');
    view?.classList.add('sv-panel-open');
    overlay?.classList.add('open');
    if(btn) btn.textContent = '📚 Material & AB ◀';
  } else {
    panel?.classList.remove('open');
    view?.classList.remove('sv-panel-open');
    overlay?.classList.remove('open');
    if(btn) btn.textContent = '📚 Material & AB ▶';
  }
}

/* ── Panel Tab Switch ── */
function svSwitchPanel(tab){
  _svActivePanel = tab;
  const matEl = document.getElementById('sv-panel-material');
  const abEl  = document.getElementById('sv-panel-ab');
  if(matEl) matEl.style.display = tab==='material' ? 'flex' : 'none';
  if(abEl)  abEl.style.display  = tab==='ab'       ? 'flex' : 'none';
  document.querySelectorAll('.sv-panel-tab').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(tab==='material'?'Material':'AB'));
  });
  // Sync thema into AB panel when switching
  if(tab==='ab'){
    const abThema = document.getElementById('sv-ab-thema');
    if(abThema && !abThema.value) abThema.value = document.getElementById('sv-thema')?.value || '';
  }
}

/* ── Thema-Vorschlag ── */
async function svSuggestThema(){
  const btn = document.getElementById('sv-suggest-btn');
  if(btn){ btn.textContent='⏳'; btn.disabled=true; }
  const fach = getFach(svContext?.fachId);
  const klasse = getKlasse(svContext?.klasseId);
  const result = await callKI('thema_vorschlag', {
    lehrplan: document.getElementById('sv-lehrplan')?.value||'',
    sequenz:  document.getElementById('sv-sequenz')?.value||'',
    fach:     fach?.name||'',
    jgst:     klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart||'',
  });
  if(btn){ btn.textContent='💡 Vorschlagen'; btn.disabled=false; }
  if(result && Array.isArray(result) && result.length) svShowThemaChips(result);
}

function svShowThemaChips(suggestions){
  const el = document.getElementById('sv-thema-chips');
  if(!el) return;
  el.style.display = 'flex';
  el.innerHTML = suggestions.map(t =>
    `<button class="sv-thema-chip" data-thema="${svEscape(t)}" onclick="svSelectThema(this.dataset.thema)">${svEscape(t)}</button>`
  ).join('') +
  `<button class="sv-thema-chip sv-thema-chip-refresh" onclick="svSuggestThema()" title="Neue Vorschläge">↻</button>` +
  `<button class="sv-thema-chip sv-thema-chip-x" onclick="document.getElementById('sv-thema-chips').style.display='none'">✕</button>`;
}

function svSelectThema(thema){
  const el = document.getElementById('sv-thema');
  if(el){ el.value=thema; svAutoResize(el); svAutoSave(); }
  const chips = document.getElementById('sv-thema-chips');
  if(chips) chips.style.display='none';
  const abThema = document.getElementById('sv-ab-thema');
  if(abThema) abThema.value = thema;
}

/* ── AB-Generator Panel ── */
function svRenderAbPanelContent(){
  const thema = svEscape(document.getElementById('sv-thema')?.value || '');
  const abPills = (opts, cur, labels) => opts.map((o, i) =>
    `<button class="sv-ab-niv-btn${cur===o?' active':''}" data-val="${o}" onclick="svAbPill(this,'sv-ab-ab-pills')">${labels?labels[i]:o}</button>`
  ).join('');
  return `
    <div class="sv-ab-panel">
      <div class="sv-ab-header">Arbeitsblatt generieren</div>
      <div class="sv-ab-form">

        <div class="sv-ab-field">
          <label>Thema</label>
          <input id="sv-ab-thema" class="input" placeholder="Stundenthema…" value="${thema}" style="font-size:.85rem">
        </div>

        <div class="sv-ab-field">
          <label>Anforderungsbereich</label>
          <div class="sv-ab-niveau" id="sv-ab-ab-pills">
            ${abPills(
              ['gemischt','ab1','ab2','ab3'],
              'gemischt',
              ['Gemischt','AB I · Reproduktion','AB II · Transfer','AB III · Reflexion']
            )}
          </div>
        </div>

        <div class="sv-ab-field">
          <label>Niveau</label>
          <div class="sv-ab-niveau" id="sv-ab-niv-pills">
            <button class="sv-ab-niv-btn" data-niv="Einfach" onclick="svAbSelectNiveau(this)">Einfach</button>
            <button class="sv-ab-niv-btn active" data-niv="Mittel" onclick="svAbSelectNiveau(this)">Mittel</button>
            <button class="sv-ab-niv-btn" data-niv="Schwer" onclick="svAbSelectNiveau(this)">Schwer</button>
          </div>
        </div>

        <div class="sv-ab-field">
          <label>Aufgabenformen</label>
          <div style="display:flex;flex-wrap:wrap;gap:.25rem .6rem;margin-top:2px">
            ${[['offene','Offene Fragen'],['luckentext','Lückentext'],['multiplechoice','Multiple Choice'],['zuordnung','Zuordnung'],['tabelle','Tabelle']].map(([v,lbl])=>`
              <label style="display:flex;align-items:center;gap:.3rem;font-size:.78rem;cursor:pointer">
                <input type="checkbox" class="sv-ab-aufgabenform" value="${v}" ${['offene','luckentext'].includes(v)?'checked':''}
                  style="width:14px;height:14px;accent-color:var(--ts-teal)">
                ${lbl}
              </label>`).join('')}
          </div>
        </div>

        <div class="sv-ab-field" style="margin-bottom:4px">
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.8rem;cursor:pointer;color:var(--ts-text)">
            <input type="checkbox" id="sv-ab-plain" style="width:14px;height:14px;accent-color:var(--ts-teal)">
            Ohne Formatierung (reiner Text)
          </label>
        </div>

        <button id="sv-ab-btn" class="btn btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="svGenerateAb()">🪄 AB generieren</button>
      </div>
      <div id="sv-ab-preview" style="display:none">
        <div class="sv-ab-preview-hd">
          <span style="font-weight:600;font-size:.82rem;flex:1">Vorschau</span>
          <span id="sv-ab-preview-hd-msg" style="font-size:.75rem;color:var(--ts-teal)"></span>
          <button id="sv-ab-fullscreen-btn" class="btn btn-secondary btn-sm" style="width:auto;font-size:.72rem;padding:4px 8px;opacity:.38;cursor:not-allowed" disabled onclick="svOpenAbFullscreen()">⛶ Vollbild</button>
          <button class="btn btn-secondary btn-sm" style="width:auto;font-size:.72rem;padding:4px 8px" onclick="svSaveAbAsMaterial(false)">💾 Speichern</button>
          <button class="btn btn-primary btn-sm" style="width:auto;font-size:.72rem;padding:4px 8px" onclick="svSaveAbAsMaterial(true)">📌 Speichern + zuweisen</button>
        </div>
        <div id="sv-ab-preview-content" class="sv-ab-preview-content"></div>
      </div>
    </div>`;
}

function svAbSelectNiveau(btn){
  // nur Niveau-Buttons in der Niveau-Gruppe
  btn.closest('.sv-ab-niveau').querySelectorAll('.sv-ab-niv-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function svAbPill(btn, groupId){
  const group = document.getElementById(groupId);
  if(group) group.querySelectorAll('.sv-ab-niv-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

async function svGenerateAb(){
  const thema = document.getElementById('sv-ab-thema')?.value || document.getElementById('sv-thema')?.value || '';
  if(!thema){ alert('Bitte zuerst ein Stundenthema eingeben.'); return; }
  const btn = document.getElementById('sv-ab-btn');
  if(btn){ btn.textContent='⏳ Generiere...'; btn.disabled=true; }
  const fach   = getFach(svContext?.fachId);
  const klasse = getKlasse(svContext?.klasseId);
  const niveau = document.querySelector('#sv-ab-niv-pills .sv-ab-niv-btn.active')?.dataset.niv || 'Mittel';
  const anforderungsbereich = document.querySelector('#sv-ab-ab-pills .sv-ab-niv-btn.active')?.dataset.val || 'gemischt';
  // Aufgabenformen aus Checkboxen
  const alleFormen = Array.from(document.querySelectorAll('.sv-ab-aufgabenform:checked')).map(cb=>cb.value);
  const aufgabentypen = alleFormen.length > 0 ? alleFormen.join(',') : 'offene,luckentext';

  const result = await callKI('arbeitsblatt', {
    thema,
    fach:     fach?.name||'',
    jgst:     klasse ? extractJgst(klasse.name) : '',
    schulart: state.schulart||'',
    bundesland: state.bundesland||'',
    niveau,
    anforderungsbereich,
    aufgabentypen,
    lehrplan: document.getElementById('sv-lehrplan')?.value||'',
    sequenz:  document.getElementById('sv-sequenz')?.value||'',
    sus:      klasse?.sus||'',
  });
  if(btn){ btn.textContent='🪄 AB generieren'; btn.disabled=false; }
  if(result && typeof result==='object'){
    const plain = document.getElementById('sv-ab-plain')?.checked || false;
    _svAbData = { ...result, _thema: thema, _plain: plain };
    const preview = document.getElementById('sv-ab-preview');
    const content = document.getElementById('sv-ab-preview-content');
    if(preview && content){
      content.innerHTML = svRenderAbPreview(result, plain);
      preview.style.display = 'block';
    }
    // Vollbild-Button freischalten
    const fbBtn = document.getElementById('sv-ab-fullscreen-btn');
    if(fbBtn){ fbBtn.disabled=false; fbBtn.style.opacity='1'; fbBtn.style.cursor='pointer'; }
  }
}

function svOpenAbFullscreen(){
  if(!_svAbData) return;
  svOpenAbViewer({
    name:    _svAbData.titel || _svAbData._thema || 'Arbeitsblatt',
    content: svRenderAbPreview(_svAbData, _svAbData._plain),
    rawData: JSON.stringify(_svAbData),
    type:    'html',
  });
}

function svRenderAbPreview(ab, plain){
  const aufgaben = (ab.aufgaben||[]).map((a,i)=>{
    if(plain){
      return `
      <div style="margin-bottom:1.2rem">
        <div style="font-weight:700;font-size:.88rem;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:6px;display:flex;justify-content:space-between">
          <span>Aufgabe ${a.nr||i+1}${a.titel?': '+svEscape(a.titel):''}</span>
          ${a.punkte?`<span style="font-weight:400">/${a.punkte} P.</span>`:''}
        </div>
        <div style="font-size:.88rem;line-height:1.7">${svEscape(a.inhalt||'').replace(/\n/g,'<br>')}</div>
        ${a.tipp?`<div style="margin-top:.5rem;font-size:.83rem"><em>Tipp: ${svEscape(a.tipp)}</em></div>`:''}
        ${a.zusatz?`<div style="margin-top:.5rem;font-size:.83rem"><strong>Zusatzaufgabe:</strong> ${svEscape(a.zusatz)}</div>`:''}
      </div>`;
    }
    const tipp = a.tipp ? `
      <div style="margin-top:.7rem;padding:.6rem .85rem;background:#FFF9E6;border-left:4px solid #F39C12;border-radius:0 6px 6px 0;font-size:.8rem;color:#7a5500;line-height:1.5">
        <span style="font-weight:700">💡 Tipp: </span>${svEscape(a.tipp)}
      </div>` : '';
    const zusatz = a.zusatz ? `
      <div style="margin-top:.7rem;padding:.6rem .85rem;background:#F7F9FA;border:1.5px dashed #95A5A6;border-radius:6px;font-size:.8rem;color:#444;line-height:1.5">
        <span style="font-weight:700;color:#F39C12">⭐ Zusatzaufgabe: </span>${svEscape(a.zusatz)}
      </div>` : '';
    return `
    <div style="margin-bottom:1.4rem;padding:1rem 1.1rem;background:#fff;border-radius:8px;border:1px solid #e8e4dc;border-left:4px solid #3BA89B;box-shadow:0 1px 3px rgba(0,0,0,.04)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div style="font-weight:700;font-size:.87rem;color:#1A3C5E">Aufgabe ${a.nr||i+1}${a.titel?': '+svEscape(a.titel):''}</div>
        ${a.punkte?`<span style="background:#EAF4F3;color:#3BA89B;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px">${a.punkte} P.</span>`:''}
      </div>
      <div style="font-size:.88rem;line-height:1.7;color:#2d2d2d">${svEscape(a.inhalt||'').replace(/\n/g,'<br>')}</div>
      ${tipp}${zusatz}
    </div>`;
  }).join('');

  if(plain){
    return `
    <div style="font-family:Arial,sans-serif;background:#fff;padding:1.5rem;color:#000">
      <div style="border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end">
        <div style="font-size:.78rem;color:#555">${svEscape(ab.untertitel||'')}</div>
      </div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:10px">${svEscape(ab.titel||'Arbeitsblatt')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1.5rem;margin-bottom:1rem;font-size:.8rem">
        <span>Name: <span style="display:inline-block;width:120px;border-bottom:1px solid #000">&nbsp;</span></span>
        <span>Klasse: <span style="display:inline-block;width:50px;border-bottom:1px solid #000">&nbsp;</span></span>
        <span>Datum: <span style="display:inline-block;width:80px;border-bottom:1px solid #000">&nbsp;</span></span>
      </div>
      ${ab.einfuehrung?`<div style="margin-bottom:.9rem;font-size:.85rem;line-height:1.6">${svEscape(ab.einfuehrung)}</div>`:''}
      <div>${aufgaben}</div>
      ${ab.merksatz?`<div style="border:1px solid #000;padding:.7rem .9rem;margin-top:1rem;font-size:.85rem"><strong>Merke:</strong> ${svEscape(ab.merksatz)}</div>`:''}
      ${ab.loesungshinweis?`
      <div style="margin-top:1rem;padding:.7rem .9rem;background:#f9f9f9;border:1px dashed #999;font-size:.8rem">
        <div style="font-weight:700;margin-bottom:.3rem">🔑 Lösung (nur Lehrkraft)</div>
        <div>${svEscape(ab.loesungshinweis).replace(/\n/g,'<br>')}</div>
      </div>`:''}
      <div style="border-top:1px solid #ccc;margin-top:1.5rem;padding-top:.4rem;font-size:.7rem;color:#999;display:flex;justify-content:space-between">
        <span>TeachSmarter · teachsmarter.de</span><span>${new Date().getFullYear()}</span>
      </div>
    </div>`;
  }

  const merksatz = ab.merksatz ? `
    <div style="margin:0 1.2rem 1.2rem;padding:.85rem 1rem;background:#E8F8F5;border:2px solid #3BA89B;border-radius:8px;font-size:.85rem">
      <div style="font-weight:700;color:#1A3C5E;margin-bottom:.3rem">📌 Merke:</div>
      <div style="color:#1a3c3c;line-height:1.6;font-weight:500">${svEscape(ab.merksatz).replace(/\n/g,'<br>')}</div>
    </div>` : '';

  const einfuehrung = ab.einfuehrung ? `
    <div style="padding:.75rem 1.4rem;background:#f7f5f0;border-bottom:1px solid #e0dbd2;font-size:.85rem;color:#444;line-height:1.6;font-style:italic">
      ${svEscape(ab.einfuehrung)}
    </div>` : '';

  return `
    <div style="font-family:Arial,sans-serif;background:#FAF8F5;border-radius:12px;overflow:hidden;border:1px solid #e0dbd2">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1A3C5E 0%,#2a5a88 100%);padding:1.25rem 1.4rem;color:#fff">
        <div style="font-size:1.15rem;font-weight:700;letter-spacing:.01em;margin-bottom:.25rem">${svEscape(ab.titel||'Arbeitsblatt')}</div>
        <div style="font-size:.78rem;opacity:.75">${svEscape(ab.untertitel||'')}</div>
      </div>
      <!-- Name / Datum Zeile -->
      <div style="display:flex;flex-wrap:wrap;gap:1.5rem;padding:.6rem 1.4rem;background:#edeae3;border-bottom:1px solid #e0dbd2;font-size:.78rem;color:#555">
        <span>Name: <span style="display:inline-block;width:130px;border-bottom:1px solid #999">&nbsp;</span></span>
        <span>Klasse: <span style="display:inline-block;width:55px;border-bottom:1px solid #999">&nbsp;</span></span>
        <span>Datum: <span style="display:inline-block;width:85px;border-bottom:1px solid #999">&nbsp;</span></span>
      </div>
      <!-- Einführung -->
      ${einfuehrung}
      <!-- Aufgaben -->
      <div style="padding:1.1rem 1.2rem">${aufgaben}</div>
      <!-- Merksatz -->
      ${merksatz}
      ${ab.loesungshinweis?`
      <!-- Lösungshinweis -->
      <div style="margin:0 1.2rem 1.2rem;padding:.85rem 1rem;background:#fffbe6;border:1px dashed #d4a017;border-radius:8px;font-size:.8rem">
        <div style="font-weight:700;color:#a07000;margin-bottom:.35rem">🔑 Lehrerversion — Lösung</div>
        <div style="color:#555;line-height:1.6">${svEscape(ab.loesungshinweis).replace(/\n/g,'<br>')}</div>
      </div>`:''}
      <!-- Footer -->
      <div style="padding:.5rem 1.4rem;border-top:1px solid #e0dbd2;font-size:.7rem;color:#aaa;display:flex;justify-content:space-between">
        <span>TeachSmarter · teachsmarter.de</span>
        <span>${new Date().getFullYear()}</span>
      </div>
    </div>`;
}

/* Word-kompatible Render-Funktion
   Regeln: Alles in <table>/<td>, background-color nur auf <td>,
   schmale farbige <td> statt CSS border-left, kein display:flex/inline-block */
function svRenderAbForWord(ab){
  const E = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  /* Hilfsfunktion: farbige Box mit linkem Streifen via schmaler <td> */
  function stripeBox(accentColor, bgColor, borderColor, content, extraTopMargin){
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;${extraTopMargin?'margin-top:6pt;':''}border-top-width:1pt;border-top-style:solid;border-top-color:${borderColor};border-right-width:1pt;border-right-style:solid;border-right-color:${borderColor};border-bottom-width:1pt;border-bottom-style:solid;border-bottom-color:${borderColor}">
        <tr>
          <td width="4" style="background-color:${accentColor};font-size:1pt">&nbsp;</td>
          <td style="background-color:${bgColor};padding:6pt 10pt;vertical-align:top">${content}</td>
        </tr>
      </table>`;
  }

  const aufgaben = (ab.aufgaben||[]).map((a,i)=>{
    const nr = a.nr || (i+1);
    const tipp = a.tipp ? stripeBox('#F39C12','#FFF9E6','#f0e0b0',
      `<p style="margin:0;font-size:9pt;color:#7a5500"><b>Tipp:</b> ${E(a.tipp)}</p>`, true) : '';
    const zusatz = a.zusatz ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6pt;border-top-width:1pt;border-top-style:dashed;border-top-color:#95A5A6;border-right-width:1pt;border-right-style:dashed;border-right-color:#95A5A6;border-bottom-width:1pt;border-bottom-style:dashed;border-bottom-color:#95A5A6;border-left-width:1pt;border-left-style:dashed;border-left-color:#95A5A6">
        <tr><td style="padding:5pt 8pt;font-size:9pt;color:#444">
          <b style="color:#E67E22">Zusatzaufgabe:</b> ${E(a.zusatz)}
        </td></tr>
      </table>` : '';

    /* Aufgaben-Box: schmaler grüner Streifen links, Inhalt rechts */
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10pt;border-top-width:1pt;border-top-style:solid;border-top-color:#d0cbc2;border-right-width:1pt;border-right-style:solid;border-right-color:#d0cbc2;border-bottom-width:1pt;border-bottom-style:solid;border-bottom-color:#d0cbc2">
        <tr>
          <td width="5" rowspan="2" style="background-color:#3BA89B;font-size:1pt">&nbsp;</td>
          <td style="background-color:#ffffff;padding:8pt 12pt 4pt 12pt;vertical-align:top">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="font-size:11pt;font-weight:bold;color:#1A3C5E;vertical-align:top">Aufgabe ${nr}${a.titel?': '+E(a.titel):''}</td>
                ${a.punkte?`<td align="right" style="font-size:10pt;font-weight:bold;color:#3BA89B;white-space:nowrap;vertical-align:top">${E(String(a.punkte))} P.</td>`:''}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:0 12pt 8pt 12pt;font-size:10pt;line-height:1.6;color:#2d2d2d;vertical-align:top">
            <p style="margin:0 0 6pt 0">${E(a.inhalt||'').replace(/\n/g,'<br>')}</p>
            ${tipp}${zusatz}
          </td>
        </tr>
      </table>`;
  }).join('\n');

  const einfuehrung = ab.einfuehrung ? stripeBox('#c0b090','#f7f5f0','#d0c8b0',
    `<p style="margin:0;font-size:10pt;color:#444;font-style:italic">${E(ab.einfuehrung).replace(/\n/g,'<br>')}</p>`) + '<br>' : '';

  const merksatz = ab.merksatz ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12pt;margin-bottom:10pt;border-top-width:2pt;border-top-style:solid;border-top-color:#3BA89B;border-right-width:2pt;border-right-style:solid;border-right-color:#3BA89B;border-bottom-width:2pt;border-bottom-style:solid;border-bottom-color:#3BA89B;border-left-width:2pt;border-left-style:solid;border-left-color:#3BA89B">
      <tr><td style="background-color:#E8F8F5;padding:10pt 12pt">
        <p style="margin:0 0 4pt 0;font-size:11pt;font-weight:bold;color:#1A3C5E">Merke:</p>
        <p style="margin:0;font-size:11pt;color:#1a3c3c;font-weight:bold">${E(ab.merksatz).replace(/\n/g,'<br>')}</p>
      </td></tr>
    </table>` : '';

  const loesung = ab.loesungshinweis ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16pt;border-top-width:1pt;border-top-style:dashed;border-top-color:#d4a017;border-right-width:1pt;border-right-style:dashed;border-right-color:#d4a017;border-bottom-width:1pt;border-bottom-style:dashed;border-bottom-color:#d4a017;border-left-width:1pt;border-left-style:dashed;border-left-color:#d4a017">
      <tr><td style="background-color:#fffbe6;padding:10pt 12pt">
        <p style="margin:0 0 4pt 0;font-size:10pt;font-weight:bold;color:#a07000">Lehrerversion - Loesung</p>
        <p style="margin:0;font-size:10pt;color:#555">${E(ab.loesungshinweis).replace(/\n/g,'<br>')}</p>
      </td></tr>
    </table>` : '';

  return `
    <!-- HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:0">
      <tr><td style="background-color:#1A3C5E;padding:12pt 16pt">
        <p style="margin:0 0 3pt 0;font-size:16pt;font-weight:bold;color:#ffffff">${E(ab.titel||'Arbeitsblatt')}</p>
        ${ab.untertitel?`<p style="margin:0;font-size:9pt;color:#aaccee">${E(ab.untertitel)}</p>`:''}
      </td></tr>
    </table>
    <!-- NAME / DATUM -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14pt;border-bottom-width:1pt;border-bottom-style:solid;border-bottom-color:#d0cbc2">
      <tr><td style="background-color:#edeae3;padding:8pt 16pt;font-size:10pt;color:#555">
        Name:&nbsp;<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>
        &nbsp;&nbsp;&nbsp;
        Klasse:&nbsp;<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>
        &nbsp;&nbsp;&nbsp;
        Datum:&nbsp;<u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>
      </td></tr>
    </table>
    <!-- INHALT -->
    ${einfuehrung}
    ${aufgaben}
    ${merksatz}
    ${loesung}
    <!-- FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20pt;border-top-width:1pt;border-top-style:solid;border-top-color:#e0dbd2">
      <tr>
        <td style="padding:5pt 0;font-size:8pt;color:#aaa">TeachSmarter &middot; teachsmarter.de</td>
        <td align="right" style="padding:5pt 0;font-size:8pt;color:#aaa">${new Date().getFullYear()}</td>
      </tr>
    </table>`;
}

async function svSaveAbAsMaterial(addToStunde){
  if(!_svAbData) return;
  const db = getMediaDb();
  const name = _svAbData.titel || _svAbData._thema || 'Arbeitsblatt';
  const renderedContent = svRenderAbPreview(_svAbData);

  // Überschreiben wenn gleicher Name bereits existiert
  const existingIdx = db.findIndex(item => item.name === name && item.tags?.includes('ki-generiert'));
  let newItem;
  if(existingIdx >= 0){
    newItem = { ...db[existingIdx], content: renderedContent, rawData: JSON.stringify(_svAbData), updatedAt: new Date().toISOString() };
    db[existingIdx] = newItem;
  } else {
    newItem = {
      id: 'media_'+Date.now(),
      name,
      type: 'html',
      content: renderedContent,
      rawData: JSON.stringify(_svAbData),
      createdAt: new Date().toISOString(),
      fachTags:   svContext?.fachId  ? [svContext.fachId]  : [],
      klassenIds: svContext?.klasseId ? [svContext.klasseId]: [],
      tags: ['arbeitsblatt','ki-generiert'],
    };
    db.push(newItem);
  }
  await saveMediaDb(db);

  if(addToStunde && svContext){
    const key = svKey(svContext.datum, svContext.fachId, svContext.klasseId, svContext.slotIdx);
    const saved = stundenCache[key] || {};
    if(!saved.materialItems) saved.materialItems = [];
    saved.materialItems.push({ id:newItem.id, name:newItem.name, type:newItem.type });
    stundenCache[key] = saved;
    await CryptoManager.setItem('ts_stunden', stundenCache);
    const chips = document.getElementById('sv-material-chips');
    if(chips) chips.innerHTML = svRenderChips(saved.materialItems);
  }

  // Refresh media list if material panel is visible
  const list = document.getElementById('sv-media-list');
  if(list) list.innerHTML = svRenderMediaItems('');

  const msg = `"${newItem.name}" gespeichert${addToStunde?' und der Stunde zugewiesen':''}.`;
  const preview = document.getElementById('sv-ab-preview-hd-msg');
  if(preview) preview.textContent = msg;
  else alert(msg);
}

/* ── Reflexion LZ toggle ── */
function _svLzUpdate(radio){
  document.querySelectorAll('.sv-lz-btn').forEach(btn => btn.classList.remove('sv-lz-on'));
  if(radio.checked) radio.closest('.sv-lz-btn').classList.add('sv-lz-on');
  svAutoSave();
}

/* ── Textarea Auto-Resize ── */
function svAutoResize(el){
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
function svResizeAll(){
  document.querySelectorAll('.sv-field textarea').forEach(svAutoResize);
}

/* ── AutoSave ── */
function svAutoSave(){
  clearTimeout(svSaveTimer);
  svSaveTimer=setTimeout(async ()=>{
    if(!svContext) return;
    const key=svKey(svContext.datum,svContext.fachId,svContext.klasseId,svContext.slotIdx);
    const data={};
    SV_FIELDS.forEach(f=>{ const el=document.getElementById('sv-'+f.id); if(el) data[f.id]=el.value; });
    const lzEl=document.querySelector('input[name="sv-lz"]:checked');
    data.lzErreicht=lzEl?lzEl.value:'';
    data.materialItems=(stundenCache[key]&&stundenCache[key].materialItems)||[];
    stundenCache[key]=data;
    await CryptoManager.setItem('ts_stunden', stundenCache);
    const badge=document.getElementById('sv-saved-badge');
    if(badge){badge.classList.add('visible');setTimeout(()=>badge.classList.remove('visible'),1500);}
  },800);
}

/* ══ Encrypted caches (populated at startup after PIN) ══ */
let notesCache = {};
let stundenCache = {};
let mediaCache = [];

async function loadNotesCache(){
  const d = await CryptoManager.getItem('ts_notizen');
  if(d && typeof d === 'object') notesCache = d;
}
async function loadStundenCache(){
  const d = await CryptoManager.getItem('ts_stunden');
  if(d && typeof d === 'object') stundenCache = d;
}
async function loadMediaCache(){
  const d = await CryptoManager.getItem('ts_material_db');
  if(Array.isArray(d)) mediaCache = d;
}

/* ══ PIN SCREEN ══ */
let _pinBuffer = '';
let _pinStep = 'enter'; // 'enter' | 'setup-first' | 'setup-confirm'
let _pinFirst = '';

function tsShowPinScreen(isFirstTime){
  _pinBuffer = ''; _pinFirst = '';
  _pinStep = isFirstTime ? 'setup-first' : 'enter';
  const overlay = document.getElementById('pin-overlay');
  if(overlay){ overlay.style.display='flex'; tsUpdatePinUI(); }
}

function tsUpdatePinUI(){
  const subtitle = document.getElementById('pin-subtitle');
  const dots = document.getElementById('pin-dots');
  const err = document.getElementById('pin-error');
  if(!subtitle) return;
  const labels = {
    'enter':'PIN eingeben',
    'setup-first':'Neuen PIN festlegen (4 Stellen)',
    'setup-confirm':'PIN bestätigen'
  };
  subtitle.textContent = labels[_pinStep] || '';
  if(err) err.textContent = '';
  if(dots){
    dots.innerHTML = Array.from({length:4}, (_,i) =>
      '<div style="width:14px;height:14px;border-radius:50%;border:2px solid var(--ts-teal);background:' +
      (i < _pinBuffer.length ? 'var(--ts-teal)' : 'transparent') + '"></div>'
    ).join('');
  }
}

function tsPinKey(k){
  if(_pinBuffer.length >= 4) return;
  _pinBuffer += k;
  tsUpdatePinUI();
  if(_pinBuffer.length === 4) setTimeout(tsPinSubmit, 120);
}

function tsPinBack(){
  if(_pinBuffer.length > 0) _pinBuffer = _pinBuffer.slice(0,-1);
  tsUpdatePinUI();
}

/* Prüft ob ein PIN ausreichend sicher ist (keine trivialen Muster) */
function _isPinStrong(pin){
  // Alle-gleich: 0000, 1111, ..., 9999
  if(/^(\d)\1{3}$/.test(pin)) return false;
  // Aufsteigende/absteigende Sequenz
  const seqUp   = ['0123','1234','2345','3456','4567','5678','6789'];
  const seqDown  = ['9876','8765','7654','6543','5432','4321','3210'];
  if([...seqUp,...seqDown].includes(pin)) return false;
  return true;
}

async function tsPinSubmit(){
  const pin = _pinBuffer;
  _pinBuffer = '';
  if(_pinStep === 'setup-first'){
    if(!_isPinStrong(pin)){
      const err = document.getElementById('pin-error');
      if(err) err.textContent = 'PIN zu einfach – bitte kein 1234, 0000 o.ä.';
      tsUpdatePinUI(); return;
    }
    _pinFirst = pin;
    _pinStep = 'setup-confirm';
    tsUpdatePinUI(); return;
  }
  if(_pinStep === 'setup-confirm'){
    if(pin !== _pinFirst){
      _pinFirst=''; _pinStep='setup-first';
      const err=document.getElementById('pin-error');
      if(err) err.textContent='PINs stimmen nicht überein – erneut eingeben';
      tsUpdatePinUI(); return;
    }
    await CryptoManager.init(pin);
    await CryptoManager.storeVerify();
    await CryptoManager.saveSession();
    initApp(); return;
  }
  const ok = await CryptoManager.verifyPin(pin);
  if(!ok){
    const err=document.getElementById('pin-error');
    if(err) err.textContent='Falscher PIN';
    tsUpdatePinUI(); return;
  }
  await CryptoManager.init(pin);
  await CryptoManager.saveSession();
  initApp();
}

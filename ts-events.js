/* ═══════════════════════════════════════════
   /* ts-events.js — Termine / Events
   ═══════════════════════════════════════════ */
   /* EVENTS / TERMINE
   ═══════════════════════════════════════════ */
const EVENT_TYPES = [
  { id:'eltern',       name:'Elterngespräch',      color:'#5B8EC9', icon:'👨‍👩‍👧', blocksDay:false },
  { id:'klassenfahrt', name:'Klassenfahrt',         color:'#5AAE6B', icon:'🚌',    blocksDay:true  },
  { id:'schulfest',    name:'Schulfest',            color:'#E8A44A', icon:'🎉',    blocksDay:true  },
  { id:'konferenz',    name:'Konferenz',            color:'#8B6DB5', icon:'🏫',    blocksDay:false },
  { id:'pruefung',     name:'Prüfung / Probe',      color:'#D4574E', icon:'📝',    blocksDay:false },
  { id:'ausflug',      name:'Ausflug / Wandertag',  color:'#3BA89B', icon:'🥾',    blocksDay:true  },
  { id:'fortbildung',  name:'Fortbildung',          color:'#4A8B9E', icon:'📚',    blocksDay:false },
  { id:'praktikum',    name:'Praktikum',            color:'#C47A5A', icon:'🔧',    blocksDay:true  },
  { id:'sonstiges',    name:'Sonstiges',            color:'#9AABB8', icon:'📌',    blocksDay:false },
  { id:'custom',       name:'Eigene Kategorie …',   color:'#6B7B8D', icon:'✏️',   blocksDay:false },
];

let events = [];
let editingEventId = null;
let selectedEventType = null;

async function loadEvents() {
  const d = await CryptoManager.getItem('ts_events');
  if(Array.isArray(d)) events = d;
}

async function saveEvents() {
  await CryptoManager.setItem('ts_events', events);
}

function getEventsForDate(date) {
  const ds = dateStr(date);
  return events.filter(e => {
    if (e.dateEnd && e.dateEnd > e.date) return ds >= e.date && ds <= e.dateEnd;
    return e.date === ds;
  });
}

function getEventType(typeId) {
  return EVENT_TYPES.find(t => t.id === typeId) || EVENT_TYPES.find(t => t.id === 'sonstiges');
}

function getEventDisplayName(evt) {
  if (evt.type === 'custom' && evt.customName) return evt.customName;
  return getEventType(evt.type).name;
}

function getEventIcon(evt) {
  if (evt.type === 'custom') return '✏️';
  return getEventType(evt.type).icon;
}

// ── Date input helpers (custom picker stores ISO in data-iso) ──
const DP_MONATE_LONG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function setDateInput(id, isoStr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.iso = isoStr || '';
  if (isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    el.value = `${d}. ${DP_MONATE_LONG[m - 1]} ${y}`;
  } else {
    el.value = '';
  }
}

function getDateInput(id) {
  const el = document.getElementById(id);
  return el ? (el.dataset.iso || '') : '';
}

// ── Helpers ──
function evtDateStartChange() {
  const start = getDateInput('evt-date');
  const endEl = document.getElementById('evt-date-end');
  endEl.dataset.minIso = start;
  const endIso = getDateInput('evt-date-end');
  if (endIso && endIso < start) setDateInput('evt-date-end', start);
}

// ── Custom Date Picker ──
let _tsDP = { inputId: null, year: 0, month: 0, selected: null, minIso: null };

function openDatePicker(inputId) {
  _tsDP.inputId = inputId;
  const el = document.getElementById(inputId);
  _tsDP.minIso = el.dataset.minIso || null;
  const currentIso = getDateInput(inputId);
  const d = currentIso ? new Date(currentIso + 'T00:00:00') : new Date();
  _tsDP.year = d.getFullYear();
  _tsDP.month = d.getMonth();
  _tsDP.selected = currentIso || null;
  tsDatepickerRender();
  document.getElementById('ts-datepicker-overlay').style.display = 'flex';
}

function tsDatepickerNav(dir) {
  _tsDP.month += dir;
  if (_tsDP.month < 0)  { _tsDP.month = 11; _tsDP.year--; }
  if (_tsDP.month > 11) { _tsDP.month = 0;  _tsDP.year++; }
  tsDatepickerRender();
}

function tsDatepickerRender() {
  const { year, month, selected, minIso } = _tsDP;
  document.getElementById('ts-dp-month-label').textContent = `${DP_MONATE_LONG[month]} ${year}`;
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const offset   = (firstDow + 6) % 7;               // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = dateStr(new Date());
  let html = '';
  for (let i = 0; i < offset; i++) html += `<div class="ts-dp-cell ts-dp-empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const ds  = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dow = new Date(year, month, day).getDay();
    let cls   = 'ts-dp-cell';
    if (ds === selected)        cls += ' ts-dp-selected';
    else if (ds === todayStr)   cls += ' ts-dp-today';
    if (dow === 0 || dow === 6) cls += ' ts-dp-weekend';
    const disabled = minIso && ds < minIso;
    if (disabled) cls += ' ts-dp-disabled';
    html += `<div class="${cls}"${disabled ? '' : ` onclick="tsDatepickerSelect('${ds}')"`}>${day}</div>`;
  }
  document.getElementById('ts-dp-grid').innerHTML = html;
}

function tsDatepickerSelect(ds) {
  _tsDP.selected = ds;
  tsDatepickerRender();
}

function tsDatepickerConfirm() {
  if (!_tsDP.selected) { tsDatepickerCancel(); return; }
  setDateInput(_tsDP.inputId, _tsDP.selected);
  if (_tsDP.inputId === 'evt-date') evtDateStartChange();
  document.getElementById('ts-datepicker-overlay').style.display = 'none';
}

function tsDatepickerCancel() {
  document.getElementById('ts-datepicker-overlay').style.display = 'none';
}

function evtToggleGanztag() {
  const checked = document.getElementById('evt-ganztag').checked;
  document.getElementById('evt-time-wrap').style.display = checked ? 'none' : '';
  document.getElementById('evt-slots-wrap').style.display = checked ? 'block' : 'none';
  if (checked) renderEvtSlotOptions();
}

function evtScopeChange() {
  const scope = document.querySelector('input[name="evt-scope"]:checked')?.value;
  document.getElementById('evt-slot-cbs').style.display = scope === 'specific' ? 'grid' : 'none';
}

function renderEvtSlotOptions() {
  const zr = getZeitraster();
  document.getElementById('evt-slot-cbs').innerHTML = zr.map((slot, i) =>
    `<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;cursor:pointer;padding:3px 0">
      <input type="checkbox" class="evt-slot-cb" value="${i}">
      ${slot.nr}. Std. (${slot.von}–${slot.bis})
    </label>`
  ).join('');
}

function evtFormatTime(input) {
  // Auto-insert colon after 2 digits
  let v = input.value.replace(/[^\d]/g,'');
  if (v.length >= 3) v = v.slice(0,2) + ':' + v.slice(2,4);
  input.value = v;
}

// ── Modal ──
function openEventModal(prefillDate, eventId) {
  editingEventId = eventId || null;
  selectedEventType = null;

  const titleEl = document.getElementById('event-modal-title');
  const deleteBtn = document.getElementById('evt-delete-btn');

  // Populate klassen dropdown
  const klasseSelect = document.getElementById('evt-klasse');
  klasseSelect.innerHTML = '<option value="">Keine</option>' +
    (state.klassen || []).map(k => `<option value="${k.id}">${k.name}</option>`).join('');

  // Render type chips
  document.getElementById('evt-types').innerHTML = EVENT_TYPES.map(t =>
    `<div class="event-type-chip" data-type="${t.id}" style="color:${t.color}" onclick="selectEventType('${t.id}')">
      <div class="event-type-dot" style="background:${t.color}"></div>${t.icon} ${t.name}
    </div>`
  ).join('');

  if (eventId) {
    const evt = events.find(e => e.id === eventId);
    if (!evt) return;
    titleEl.textContent = 'Termin bearbeiten';
    document.getElementById('evt-title').value = evt.title;
    setDateInput('evt-date', evt.date);
    setDateInput('evt-date-end', (evt.dateEnd && evt.dateEnd > evt.date) ? evt.dateEnd : '');
    document.getElementById('evt-date-end').dataset.minIso = evt.date;
    document.getElementById('evt-ganztag').checked = !!evt.ganztag;
    document.getElementById('evt-time-wrap').style.display = evt.ganztag ? 'none' : '';
    document.getElementById('evt-slots-wrap').style.display = evt.ganztag ? 'block' : 'none';
    if (evt.ganztag) {
      renderEvtSlotOptions();
      const isSpecific = Array.isArray(evt.affectedSlots);
      document.querySelector(`input[name="evt-scope"][value="${isSpecific?'specific':'all'}"]`).checked = true;
      document.getElementById('evt-slot-cbs').style.display = isSpecific ? 'grid' : 'none';
      if (isSpecific) {
        evt.affectedSlots.forEach(idx => {
          const cb = document.querySelector(`.evt-slot-cb[value="${idx}"]`);
          if (cb) cb.checked = true;
        });
      }
    }
    document.getElementById('evt-time').value = evt.time || '';
    document.getElementById('evt-end-time').value = evt.endTime || '';
    document.getElementById('evt-klasse').value = evt.klasseId || '';
    document.getElementById('evt-notes').value = evt.notes || '';
    if (evt.type === 'custom') {
      document.getElementById('evt-custom-wrap').style.display = 'block';
      document.getElementById('evt-custom-name').value = evt.customName || '';
    }
    selectEventType(evt.type);
    deleteBtn.style.display = 'inline-flex';
  } else {
    titleEl.textContent = 'Neuer Termin';
    document.getElementById('evt-title').value = '';
    const startDate = prefillDate || new Date().toISOString().split('T')[0];
    setDateInput('evt-date', startDate);
    setDateInput('evt-date-end', '');
    document.getElementById('evt-date-end').dataset.minIso = startDate;
    document.getElementById('evt-ganztag').checked = false;
    document.getElementById('evt-time-wrap').style.display = '';
    document.getElementById('evt-time').value = '';
    document.getElementById('evt-end-time').value = '';
    document.getElementById('evt-klasse').value = '';
    document.getElementById('evt-notes').value = '';
    document.getElementById('evt-custom-wrap').style.display = 'none';
    document.getElementById('evt-custom-name').value = '';
    deleteBtn.style.display = 'none';
  }

  document.getElementById('event-modal').classList.add('open');
}

function closeEventModal() {
  document.getElementById('event-modal').classList.remove('open');
  editingEventId = null;
  selectedEventType = null;
}

function selectEventType(typeId) {
  selectedEventType = typeId;
  document.querySelectorAll('#evt-types .event-type-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.type === typeId);
  });
  // Show custom name field
  document.getElementById('evt-custom-wrap').style.display = typeId === 'custom' ? 'block' : 'none';
}

function saveEvent() {
  const title = document.getElementById('evt-title').value.trim();
  const date = getDateInput('evt-date');
  const dateEnd = getDateInput('evt-date-end') || '';
  const ganztag = document.getElementById('evt-ganztag').checked;
  if (!title || !date || !selectedEventType) {
    alert('Bitte Titel, Datum und Kategorie angeben.');
    return;
  }
  if (dateEnd && dateEnd < date) {
    alert('Das Enddatum darf nicht vor dem Startdatum liegen.');
    return;
  }
  const customName = selectedEventType === 'custom'
    ? document.getElementById('evt-custom-name').value.trim() : '';
  if (selectedEventType === 'custom' && !customName) {
    alert('Bitte einen Namen für die eigene Kategorie eingeben.');
    return;
  }

  // Validate time format HH:MM
  const timeRaw = document.getElementById('evt-time').value.trim();
  const endTimeRaw = document.getElementById('evt-end-time').value.trim();
  const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (!ganztag && timeRaw && !timeRe.test(timeRaw)) {
    alert('Bitte "Von" im Format HH:MM eingeben (z.B. 08:30).');
    return;
  }
  if (!ganztag && endTimeRaw && !timeRe.test(endTimeRaw)) {
    alert('Bitte "Bis" im Format HH:MM eingeben (z.B. 09:15).');
    return;
  }

  // Collect affected slots
  let affectedSlots = 'all';
  if (ganztag) {
    const scope = document.querySelector('input[name="evt-scope"]:checked')?.value || 'all';
    if (scope === 'specific') {
      const checked = Array.from(document.querySelectorAll('.evt-slot-cb:checked')).map(cb => parseInt(cb.value));
      affectedSlots = checked.length ? checked : 'all';
    }
  }

  const evtData = {
    id: editingEventId || 'evt_' + Date.now(),
    title,
    date,
    dateEnd: (dateEnd && dateEnd > date) ? dateEnd : '',
    ganztag,
    affectedSlots: ganztag ? affectedSlots : null,
    time: ganztag ? '' : timeRaw,
    endTime: ganztag ? '' : endTimeRaw,
    type: selectedEventType,
    customName,
    blocksDay: ganztag,
    klasseId: document.getElementById('evt-klasse').value || '',
    notes: document.getElementById('evt-notes').value.trim(),
  };

  if (editingEventId) {
    const idx = events.findIndex(e => e.id === editingEventId);
    if (idx >= 0) events[idx] = evtData;
  } else {
    events.push(evtData);
  }

  saveEvents();
  if(typeof invalidateScheduleCache === 'function') invalidateScheduleCache(); // invalidate JP cache
  closeEventModal();
  renderHeute();
  renderWoche();
  renderMonat();
  if(typeof renderPlanung === 'function') renderPlanung();
}

function deleteEvent() {
  if (!editingEventId) return;
  if (!confirm('Termin wirklich löschen?')) return;
  events = events.filter(e => e.id !== editingEventId);
  saveEvents();
  if(typeof invalidateScheduleCache === 'function') invalidateScheduleCache(); // invalidate JP cache
  closeEventModal();
  renderHeute();
  renderWoche();
  renderMonat();
  if(typeof renderPlanung === 'function') renderPlanung();
}

/* ══════════════════════════════════════════════
   Time Picker Wheel (Google-Calendar-style)
   ══════════════════════════════════════════════ */

const TP_ITEM_H   = 44; // px — matches CSS .ts-tp-item height
const TP_COL_H    = 176; // px — matches CSS .ts-tp-col height (4 visible rows)
const TP_PAD      = TP_COL_H / 2 - TP_ITEM_H / 2; // = 66px — centres first/last item

let _tpTarget  = null; // id of the input to fill
let _tpWheelLock = { h: false, m: false }; // one-step-at-a-time gate

function _tpWheelStep(col, key) {
  col.addEventListener('wheel', e => {
    e.preventDefault();
    if (_tpWheelLock[key]) return;
    _tpWheelLock[key] = true;
    // Snap current position first so we always step from a clean boundary
    const base = Math.round(col.scrollTop / TP_ITEM_H) * TP_ITEM_H;
    const dir  = e.deltaY > 0 ? 1 : -1;
    col.scrollTo({ top: base + dir * TP_ITEM_H, behavior: 'smooth' });
    setTimeout(() => { _tpWheelLock[key] = false; }, 160);
  }, { passive: false });
}

function openTimePicker(inputId) {
  _tpTarget = inputId;
  const input = document.getElementById(inputId);
  const raw   = (input && input.value) ? input.value : '';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  const initH = match ? Math.min(23, parseInt(match[1], 10)) : 8;
  const initM = match ? Math.round(Math.min(59, parseInt(match[2], 10)) / 5) * 5 : 0;

  const hCol = document.getElementById('ts-tp-hours');
  const mCol = document.getElementById('ts-tp-minutes');

  // Build hour column 00–23
  hCol.innerHTML =
    `<div class="ts-tp-pad" style="height:${TP_PAD}px"></div>` +
    Array.from({length: 24}, (_, i) =>
      `<div class="ts-tp-item" onclick="document.getElementById('ts-tp-hours').scrollTo({top:${i*TP_ITEM_H},behavior:'smooth'})">${String(i).padStart(2,'0')}</div>`
    ).join('') +
    `<div class="ts-tp-pad" style="height:${TP_PAD}px"></div>`;

  // Build minute column 00,05,10,…,55
  mCol.innerHTML =
    `<div class="ts-tp-pad" style="height:${TP_PAD}px"></div>` +
    Array.from({length: 12}, (_, i) =>
      `<div class="ts-tp-item" onclick="document.getElementById('ts-tp-minutes').scrollTo({top:${i*TP_ITEM_H},behavior:'smooth'})">${String(i * 5).padStart(2,'0')}</div>`
    ).join('') +
    `<div class="ts-tp-pad" style="height:${TP_PAD}px"></div>`;

  const overlay = document.getElementById('ts-timepicker-overlay');
  overlay.style.display = 'flex';

  // Scroll to current value (after paint)
  requestAnimationFrame(() => {
    hCol.scrollTop = initH * TP_ITEM_H;
    mCol.scrollTop = Math.round(initM / 5) * TP_ITEM_H;
    _tpHighlight(hCol);
    _tpHighlight(mCol);
  });

  // Live highlight on scroll — RAF-throttled für flüssige 60fps-Darstellung
  let _tpRaf = null;
  hCol.onscroll = () => { if(_tpRaf) cancelAnimationFrame(_tpRaf); _tpRaf = requestAnimationFrame(() => _tpHighlight(hCol)); };
  mCol.onscroll = () => { if(_tpRaf) cancelAnimationFrame(_tpRaf); _tpRaf = requestAnimationFrame(() => _tpHighlight(mCol)); };

  // Mouse-wheel: exactly one item per tick
  // (listeners live on the freshly rebuilt innerHTML, so re-attach each open)
  _tpWheelLock = { h: false, m: false };
  _tpWheelStep(hCol, 'h');
  _tpWheelStep(mCol, 'm');
}

function _tpHighlight(col) {
  // Index of the centred item
  const idx = Math.round(col.scrollTop / TP_ITEM_H);
  col.querySelectorAll('.ts-tp-item').forEach((el, i) => {
    el.classList.toggle('ts-tp-item--active', i === idx);
  });
}

function tsTimepickerConfirm() {
  const hCol = document.getElementById('ts-tp-hours');
  const mCol = document.getElementById('ts-tp-minutes');
  const h  = Math.min(23, Math.max(0, Math.round(hCol.scrollTop / TP_ITEM_H)));
  const mi = Math.min(11, Math.max(0, Math.round(mCol.scrollTop / TP_ITEM_H)));
  const val = `${String(h).padStart(2,'0')}:${String(mi * 5).padStart(2,'0')}`;
  if (_tpTarget) {
    const inp = document.getElementById(_tpTarget);
    if (inp) inp.value = val;
  }
  document.getElementById('ts-timepicker-overlay').style.display = 'none';
}

function tsTimepickerCancel() {
  document.getElementById('ts-timepicker-overlay').style.display = 'none';
}

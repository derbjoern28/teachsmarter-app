/* ═══════════════════════════════════════════
   /* ts-kalender.js — Heute, Woche, Monat Views
   ═══════════════════════════════════════════ */
   /* HEUTE VIEW
   ═══════════════════════════════════════════ */
function renderHeute() {
  const realNow = new Date();
  const viewDate = new Date(realNow);
  viewDate.setDate(viewDate.getDate() + heuteOffset);

  const dayIndex = (viewDate.getDay() + 6) % 7; // 0=Mo, 4=Fr
  const isWeekday = dayIndex < 5;
  const isActualToday = heuteOffset === 0;
  const viewDateStr = dateStr(viewDate);

  const allDayNames = [...TAGE_LONG, 'Samstag', 'Sonntag'];
  document.getElementById('heute-date').textContent = allDayNames[dayIndex] || '';
  document.getElementById('heute-sub').textContent =
    `${viewDate.getDate()}. ${MONATE[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  document.getElementById('heute-kw').textContent = `KW ${getWeekNumber(viewDate)}`;

  // Holiday/Ferien check
  const holidayInfo = getHolidayInfo(viewDate);
  let bannerHtml = '';
  if (holidayInfo.feiertag) {
    bannerHtml += `<div class="holiday-banner feiertag"><span class="holiday-banner-icon">🎌</span><div class="holiday-banner-text"><span class="holiday-banner-name">${holidayInfo.feiertag.name}</span> – Feiertag, kein Unterricht</div></div>`;
  }
  if (holidayInfo.ferien) {
    bannerHtml += `<div class="holiday-banner ferien"><span class="holiday-banner-icon">🏖️</span><div class="holiday-banner-text"><span class="holiday-banner-name">${holidayInfo.ferien.name}</span></div></div>`;
  }
  document.getElementById('heute-holiday-banner').innerHTML = bannerHtml;

  if (!isWeekday || holidayInfo.isHoliday) {
    document.getElementById('heute-stats').innerHTML = '';
    const msg = holidayInfo.feiertag
      ? `<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--ts-navy);margin-bottom:8px">${holidayInfo.feiertag.name}</div><div class="placeholder-desc">Feiertag – genieß den freien Tag!</div>`
      : holidayInfo.ferien
      ? `<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--ts-navy);margin-bottom:8px">${holidayInfo.ferien.name}</div><div class="placeholder-desc">Schulferien – erhole dich gut!</div>`
      : `<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--ts-navy);margin-bottom:8px">Wochenende!</div><div class="placeholder-desc">Genieß deine freie Zeit.</div>`;
    let emptyHtml = `<div class="tl-empty"><div class="tl-empty-icon">${holidayInfo.ferien ? '🏖️' : holidayInfo.feiertag ? '🎌' : '☀️'}</div>${msg}</div>`;
    // Still show events even on holidays/weekends
    const dayEvents = getEventsForDate(viewDate);
    if (dayEvents.length) {
      emptyHtml += renderEventsList(dayEvents, viewDateStr);
    }
    emptyHtml += `<div style="text-align:center;margin-top:var(--sp-lg)"><button class="btn btn-secondary btn-sm" style="width:auto" onclick="openEventModal('${viewDateStr}')">+ Termin hinzufügen</button></div>`;
    document.getElementById('timeline').innerHTML = emptyHtml;
    return;
  }

  // Get day's lessons (tagesOverrides > recurring stundenplan)
  const zr = getZeitraster();
  const todayLessons = [];
  zr.forEach((slot, i) => {
    const entry = getEffectiveLesson(viewDateStr, dayIndex, i);
    todayLessons.push({ slot, index: i, entry });
  });

  const dayEvents = getEventsForDate(viewDate);
  const ganztag = dayEvents.filter(e => e.blocksDay || e.ganztag);
  const timedEvents = dayEvents.filter(e => !e.blocksDay && !e.ganztag && e.time);
  const untimedEvents = dayEvents.filter(e => !e.blocksDay && !e.ganztag && !e.time);

  // ── Ganztag-Block Helper ──
  function isSlotBlocked(slotIdx) {
    return ganztag.some(e => !e.affectedSlots || e.affectedSlots === 'all' || (Array.isArray(e.affectedSlots) && e.affectedSlots.includes(slotIdx)));
  }
  const blockedAll = ganztag.length > 0 && ganztag.some(e => !e.affectedSlots || e.affectedSlots === 'all');

  // ── Ganztag-Block Banner(s) ──
  if (ganztag.length > 0) {
    const blockedCount = todayLessons.filter((_,i) => isSlotBlocked(i) && todayLessons[i].entry).length;
    document.getElementById('heute-stats').innerHTML = `
      <div class="stat-card"><div class="stat-value" style="color:var(--ts-warning)">${blockedCount}</div><div class="stat-label">UEs entfallen</div></div>
      <div class="stat-card"><div class="stat-value">${todayLessons.filter(l=>l.entry).length - blockedCount}</div><div class="stat-label">Stunden</div></div>`;
    let blockHtml = '';
    ganztag.forEach(evt => {
      const t = getEventType(evt.type);
      const slotLabel = (!evt.affectedSlots || evt.affectedSlots === 'all')
        ? 'Gesamter Tag'
        : `${Array.isArray(evt.affectedSlots) ? evt.affectedSlots.map(i=>todayLessons[i]?.slot.nr||i+1).join('. & ')+'.' : ''} Stunde`;
      blockHtml += `
        <div class="ganztag-block" style="border-color:${t.color};background:${t.color}18" onclick="openEventModal(null,'${evt.id}')">
          <div style="font-size:1.8rem">${getEventIcon(evt)}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:1rem;color:var(--ts-navy)">${getEventDisplayName(evt)}: ${evt.title}</div>
            <div style="font-size:.82rem;color:var(--ts-text-secondary);margin-top:2px">${slotLabel} · ${blockedCount} UE entfallen</div>
          </div>
          <div style="font-size:.75rem;color:var(--ts-text-muted)">Bearbeiten →</div>
        </div>`;
    });
    if (blockedAll) {
      // All lessons blocked → show all grayed out, return early
      blockHtml += `<div style="margin-top:var(--sp-md);opacity:.35;pointer-events:none">`;
      todayLessons.forEach(lesson => {
        if (!lesson.entry) return;
        const fach = getFach(lesson.entry.fachId);
        blockHtml += `<div class="tl-item past">
          <div class="tl-time">${lesson.slot.von}<br>${lesson.slot.bis}</div>
          <div class="tl-dot"></div>
          <div class="tl-card"><div class="tl-bar" style="background:${fach?fach.color:'#ccc'}"></div>
          <div class="tl-body"><div class="tl-fach">${fach?fach.name:'–'} <span style="font-size:.72rem;font-weight:400">(entfällt)</span></div></div></div>
        </div>`;
      });
      blockHtml += `</div>`;
      blockHtml += `<div style="text-align:center;margin-top:var(--sp-lg)"><button class="btn btn-secondary btn-sm" style="width:auto" onclick="openEventModal('${viewDateStr}')">+ Termin hinzufügen</button></div>`;
      document.getElementById('timeline').innerHTML = blockHtml;
      renderNoteArea('view-heute','tag-'+viewDateStr,'Tagesnotiz');
      return;
    }
    // Partial blocking → continue rendering timeline, but mark blocked slots
    document.getElementById('timeline').innerHTML = ''; // will be set below
  }

  const filledCount = todayLessons.filter(l => l.entry).length;
  const fachSet = new Set(todayLessons.filter(l => l.entry).map(l => l.entry.fachId));
  const klassenSet = new Set(todayLessons.filter(l => l.entry).map(l => l.entry.klasseId));
  document.getElementById('heute-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${filledCount}</div><div class="stat-label">Stunden</div></div>
    <div class="stat-card"><div class="stat-value">${fachSet.size}</div><div class="stat-label">Fächer</div></div>
    <div class="stat-card"><div class="stat-value">${klassenSet.size}</div><div class="stat-label">Klassen</div></div>
  `;

  // Build combined timeline (lessons + timed events interleaved)
  const currentMinutes = realNow.getHours() * 60 + realNow.getMinutes();
  const tlItems = [];
  todayLessons.forEach(lesson => {
    const [h,m] = lesson.slot.von.split(':').map(Number);
    tlItems.push({ kind:'lesson', startMin: h*60+m, lesson });
  });
  timedEvents.forEach(evt => {
    const [h,m] = evt.time.split(':').map(Number);
    tlItems.push({ kind:'event', startMin: h*60+m, evt });
  });
  tlItems.sort((a,b) => a.startMin - b.startMin);

  let html = '';
  let lastLessonEnd = -1;

  tlItems.forEach((item, idx) => {
    if (item.kind === 'lesson') {
      const lesson = item.lesson;
      const [vonH,vonM] = lesson.slot.von.split(':').map(Number);
      const [bisH,bisM] = lesson.slot.bis.split(':').map(Number);
      const slotStart = vonH*60+vonM, slotEnd = bisH*60+bisM;
      // Pause between consecutive lessons
      if (lastLessonEnd >= 0 && slotStart - lastLessonEnd >= 5) {
        html += `<div class="tl-pause"><span class="tl-pause-label">☕ ${slotStart - lastLessonEnd} Min. Pause</span></div>`;
      }
      lastLessonEnd = slotEnd;
      const isNow = isActualToday && currentMinutes >= slotStart && currentMinutes < slotEnd;
      const isPast = heuteOffset < 0 || (isActualToday && currentMinutes >= slotEnd);
      const timeClass = isNow ? 'now' : isPast ? 'past' : '';
      const blocked = ganztag.length > 0 && isSlotBlocked(lesson.index);
      if (lesson.entry) {
        const fach = getFach(lesson.entry.fachId);
        const klasse = getKlasse(lesson.entry.klasseId);
        const lb = getLernbereichForDate(lesson.entry.fachId, lesson.entry.klasseId, viewDate);
        const _svk = `${viewDateStr}_${lesson.entry.fachId}_${lesson.entry.klasseId}_${lesson.index}`;
        const _thema = (typeof stundenCache!=='undefined'&&stundenCache[_svk])?stundenCache[_svk].thema:'';
        if (blocked) {
          // Show the blocking event IN this slot
          const blockEvt = ganztag.find(e => Array.isArray(e.affectedSlots) && e.affectedSlots.includes(lesson.index)) || ganztag[0];
          const t = blockEvt ? getEventType(blockEvt.type) : null;
          html += `<div class="tl-item">
            <div class="tl-time">${lesson.slot.von}<br>${lesson.slot.bis}</div>
            <div class="tl-dot" style="background:${t?t.color:'#ccc'}"></div>
            <div class="tl-card" style="cursor:pointer" onclick="openEventModal(null,'${blockEvt?.id}')">
              <div class="tl-bar" style="background:${t?t.color:'#ccc'}"></div>
              <div class="tl-body">
                <div class="tl-fach" style="color:${t?t.color:'inherit'}">${getEventIcon(blockEvt)} ${getEventDisplayName(blockEvt)}</div>
                <div class="tl-klasse">${blockEvt?.title||''}</div>
                ${lesson.entry&&fach?`<div style="font-size:.7rem;color:var(--ts-text-muted);margin-top:2px">statt: ${fach.name}</div>`:''}
              </div>
            </div>
          </div>`;
        } else {
          html += `<div class="tl-item ${timeClass}${swapSource&&swapSource.dayIndex===dayIndex&&swapSource.slotIdx===lesson.index?' swap-selected':''}">
            <div class="tl-time">${lesson.slot.von}<br>${lesson.slot.bis}</div>
            <div class="tl-dot"></div>
            <div class="tl-card${swapSource&&!(swapSource.dayIndex===dayIndex&&swapSource.slotIdx===lesson.index)?' swap-target':''}"
              onclick="openLessonMenu(event,'${viewDateStr}','${lesson.entry.fachId}','${lesson.entry.klasseId}',${lesson.index},${dayIndex})">
              <div class="tl-bar" style="background:${fach?fach.color:'#ccc'}"></div>
              <div class="tl-body">
                <div class="tl-fach">${fach?fach.name:'–'}</div>
                <div class="tl-klasse">${lesson.entry._isOverride&&lesson.entry.vtgKlasse ? lesson.entry.vtgKlasse : (klasse?klasse.name:'')} ${!lesson.entry._isOverride||!lesson.entry.vtgKlasse?(klasse&&klasse.sus?'· '+klasse.sus+' SuS':''):''}</div>
                ${lb?`<div class="tl-thema" style="font-style:normal"><span style="background:${lb.color};color:#fff;padding:1px 6px;border-radius:3px;font-size:.68rem;font-weight:600;margin-right:4px">${lb.lbName}</span>${lb.seqTitle?'<span style="opacity:.7">→ '+lb.seqTitle+'</span>':''}</div>`:''}
                ${_thema?`<div class="tl-sv-thema">📖 ${_thema}</div>`:''}
                ${lesson.entry._isOverride&&lesson.entry.isVertretung?'<span class="tl-badge vtg-badge">🔄 Vertretung</span>':''}
                ${isNow?'<span class="tl-badge" style="background:var(--ts-teal-subtle);color:var(--ts-teal-dark)">▶ Jetzt</span>':''}
                ${swapSource?'<span class="tl-badge" style="background:var(--ts-teal);color:#fff">Hier tauschen →</span>':''}
              </div>
            </div>
          </div>`;
        }
      } else {
        html += `<div class="tl-item ${timeClass}">
          <div class="tl-time">${lesson.slot.von}<br>${lesson.slot.bis}</div>
          <div class="tl-dot"></div>
          <div class="tl-card${swapSource?' swap-target':''}" style="border-style:dashed;opacity:.55;cursor:${swapSource?'pointer':'pointer'}"
            onclick="${swapSource?`lessonSwapTarget(${dayIndex},${lesson.index})`:`openStundeOverrideModal('${viewDateStr}',${dayIndex},${lesson.index},'','')`}">
            <div class="tl-body"><div class="tl-fach" style="color:var(--ts-text-muted)">${swapSource?'Hierher verschieben':'＋ Stunde erstellen'}</div></div>
          </div>
        </div>`;
      }
    } else {
      // Timed event in timeline
      const evt = item.evt;
      const t = getEventType(evt.type);
      html += `<div class="tl-item" onclick="openEventModal(null,'${evt.id}')">
        <div class="tl-time">${evt.time}<br>${evt.endTime||''}</div>
        <div class="tl-dot" style="background:${t.color}"></div>
        <div class="tl-card" style="border-color:${t.color}20">
          <div class="tl-bar" style="background:${t.color}"></div>
          <div class="tl-body">
            <div class="tl-fach" style="color:${t.color}">${getEventIcon(evt)} ${getEventDisplayName(evt)}</div>
            <div class="tl-klasse">${evt.title}</div>
          </div>
        </div>
      </div>`;
    }
  });

  if (!html) {
    html = '<div class="tl-empty"><div class="tl-empty-icon">📅</div><div class="placeholder-desc">Keine Stunden im Stundenplan für diesen Tag.</div></div>';
  }

  // Untimed events section
  if (untimedEvents.length) html += renderEventsList(untimedEvents, viewDateStr);

  if (swapSource) {
    html += `<div style="text-align:center;margin-top:var(--sp-md)"><button class="btn btn-secondary btn-sm" style="width:auto;color:var(--ts-error)" onclick="cancelSwap()">Verschieben abbrechen</button></div>`;
  } else {
    html += `<div style="text-align:center;margin-top:var(--sp-lg)"><button class="btn btn-secondary btn-sm" style="width:auto" onclick="openEventModal('${viewDateStr}')">+ Termin hinzufügen</button></div>`;
  }
  document.getElementById('timeline').innerHTML = html;
  // Render note area
  renderNoteArea('view-heute','tag-'+viewDateStr,'Tagesnotiz');
}

function renderEventsList(dayEvents, ds) {
  if (!dayEvents.length) return '';
  let html = '<div style="margin-top:var(--sp-lg);padding-top:var(--sp-md);border-top:1px dashed var(--ts-border)">';
  html += '<div style="font-size:.75rem;font-weight:600;color:var(--ts-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-sm)">Weitere Termine</div>';
  dayEvents.sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99')).forEach(evt => {
    const t = getEventType(evt.type);
    const klasse = evt.klasseId ? getKlasse(evt.klasseId) : null;
    html += `<div class="tl-event" onclick="openEventModal(null,'${evt.id}')">
      <div class="tl-event-card" style="border-left-color:${t.color}">
        <div class="tl-event-time">${evt.ganztag ? 'Ganztag' : evt.time ? evt.time+(evt.endTime?'–'+evt.endTime:'') : 'Ganztag'}</div>
        <div class="tl-event-title">${getEventIcon(evt)} ${evt.title} <span style="font-size:.75rem;opacity:.7">(${getEventDisplayName(evt)})</span></div>
        ${klasse ? `<span style="font-size:.72rem;color:var(--ts-text-muted)">${klasse.name}</span>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function heuteNav(dir) {
  heuteOffset += dir;
  renderHeute();
}

function heuteToday() {
  heuteOffset = 0;
  renderHeute();
}

function addEventFromContext() {
  // Use the date from whichever view is active
  if (currentView === 'heute') {
    const d = new Date(); d.setDate(d.getDate() + heuteOffset);
    openEventModal(dateStr(d));
  } else if (currentView === 'woche') {
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() + wocheOffset * 7);
    openEventModal(dateStr(monday));
  } else if (currentView === 'monat') {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + monatOffset, 1);
    openEventModal(dateStr(d));
  } else {
    openEventModal();
  }
}

/* ═══════════════════════════════════════════
   /* WOCHE VIEW
   ═══════════════════════════════════════════ */
function getSlotIndexForTime(timeStr, zr) {
  if (!timeStr) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  const eMin = h * 60 + m;
  for (let i = 0; i < zr.length; i++) {
    const [vh, vm] = zr[i].von.split(':').map(Number);
    const [bh, bm] = zr[i].bis.split(':').map(Number);
    if (eMin >= vh * 60 + vm && eMin < bh * 60 + bm) return i;
  }
  return -1;
}

function renderWoche() {
  const today = new Date();
  const monday = getMonday(today);
  monday.setDate(monday.getDate() + wocheOffset * 7);

  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  // Title
  document.getElementById('woche-title').textContent =
    `${monday.getDate()}. ${MONATE[monday.getMonth()]} – ${friday.getDate()}. ${MONATE[friday.getMonth()]} ${friday.getFullYear()}`;

  const zr = getZeitraster();
  const realToday = new Date();
  const todayDayIndex = (realToday.getDay() + 6) % 7;
  const isCurrentWeek = wocheOffset === 0;
  const todayMidnight = new Date(realToday); todayMidnight.setHours(0,0,0,0);

  let html = '<div class="woche-time"></div>';

  // Day headers
  const weekDates = [];
  for (let d = 0; d < 5; d++) {
    const dayDate = new Date(monday);
    dayDate.setDate(dayDate.getDate() + d);
    weekDates.push(dayDate);
    const isToday = isCurrentWeek && d === todayDayIndex && todayDayIndex < 5;
    const isPastDay = dayDate < todayMidnight;
    const hi = getHolidayInfo(dayDate);
    const holidayClass = hi.isHoliday ? 'holiday' : '';
    const holidayLabel = hi.feiertag ? hi.feiertag.name : hi.ferien ? hi.ferien.name : '';
    const dayGanztagEvts = getEventsForDate(dayDate).filter(e => e.ganztag || e.blocksDay);
    const ganztagBadges = dayGanztagEvts.map(evt => {
      const t = getEventType(evt.type);
      return `<span class="woche-ganztag-badge" style="background:${t.color}" onclick="openEventModal(null,'${evt.id}')">${t.icon} ${evt.title}</span>`;
    }).join('');
    html += `<div class="woche-day-header ${isToday?'today':isPastDay?'past-day':''} ${holidayClass}">
      ${TAGE_SHORT[d]}
      <span class="day-date">${String(dayDate.getDate()).padStart(2,'0')}.${String(dayDate.getMonth()+1).padStart(2,'0')}.</span>
      ${holidayLabel ? `<span class="holiday-label">${holidayLabel}</span>` : ''}
      ${ganztagBadges}
    </div>`;
  }

  // Grid cells
  zr.forEach((slot, s) => {
    html += `<div class="woche-time">${slot.nr}.<br><span style="font-size:.6rem">${slot.von}</span></div>`;
    for (let d = 0; d < 5; d++) {
      const dayDate = weekDates[d];
      const hi = getHolidayInfo(dayDate);
      const isTodayCol = isCurrentWeek && d === todayDayIndex && todayDayIndex < 5;
      const isPastDay = weekDates[d] < todayMidnight;
      const todayClass = isTodayCol ? ' today-col' : (isPastDay ? ' past-day' : '');

      if (hi.isHoliday) {
        const label = s === 0 ? (hi.feiertag ? hi.feiertag.name : hi.ferien ? hi.ferien.name : '') : '';
        html += `<div class="woche-cell holiday${todayClass}">${label}</div>`;
      } else {
        const entry = getEffectiveLesson(dateStr(dayDate), d, s);

        const dayEvts = getEventsForDate(dayDate);
        const dayGanztag = dayEvts.filter(e => e.blocksDay || e.ganztag);
        const wIsBlocked = dayGanztag.some(e => !e.affectedSlots || e.affectedSlots === 'all' || (Array.isArray(e.affectedSlots) && e.affectedSlots.includes(s)));

        const timedSlotEvts = dayEvts.filter(e => !e.ganztag && !e.blocksDay && e.time && getSlotIndexForTime(e.time, zr) === s);
        const evtChipsHtml = timedSlotEvts.map(evt => {
          const t = getEventType(evt.type);
          return `<div class="wc-event-chip" style="border-left:2px solid ${t.color};background:${t.color}18;color:var(--ts-text)" onclick="event.stopPropagation();openEventModal(null,'${evt.id}')">${t.icon} ${evt.time}${evt.endTime?'–'+evt.endTime:''} ${evt.title}</div>`;
        }).join('');

        if (wIsBlocked) {
          const blockEvt = dayGanztag.find(e => !e.affectedSlots || e.affectedSlots === 'all' || (Array.isArray(e.affectedSlots) && e.affectedSlots.includes(s)));
          const t = blockEvt ? getEventType(blockEvt.type) : null;
          html += `<div class="woche-cell filled${todayClass}" style="background:${t?t.color+'33':'#eee'};border-left:3px solid ${t?t.color:'#ccc'};opacity:.7;cursor:pointer" onclick="openEventModal(null,'${blockEvt?.id}')">
            <div class="wc-fach" style="font-size:.65rem">${t?getEventIcon(blockEvt):''} entfällt</div>
            <div class="wc-klasse" style="font-size:.55rem">${blockEvt?blockEvt.title:''}</div>
            ${evtChipsHtml}
          </div>`;
        } else if (entry) {
          const fach = getFach(entry.fachId);
          const klasse = getKlasse(entry.klasseId);
          const lb = getLernbereichForDate(entry.fachId, entry.klasseId, dayDate);
          const _wsvk = `${dateStr(dayDate)}_${entry.fachId}_${entry.klasseId}_${s}`;
          const _wthema = (typeof stundenCache!=='undefined'&&stundenCache[_wsvk])?stundenCache[_wsvk].thema:'';
          const isSwapSel = swapSource && swapSource.dayIndex===d && swapSource.slotIdx===s;
          const isSwapTgt = swapSource && !isSwapSel;
          html += `<div class="woche-cell filled${todayClass}${isSwapSel?' swap-selected':isSwapTgt?' swap-target':''}"
            onclick="openLessonMenu(event,'${dateStr(dayDate)}','${entry.fachId}','${entry.klasseId}',${s},${d})"
            style="background:${fach?fach.color:'#999'}">
            <div class="wc-fach">${fach?fach.name:'?'}</div>
            <div class="wc-klasse">${entry._isOverride&&entry.vtgKlasse ? entry.vtgKlasse : (klasse?klasse.name:'')}</div>
            ${entry._isOverride&&entry.isVertretung?'<div class="wc-vtg-badge">🔄 Vertretung</div>':''}
            ${lb?`<div class="wc-seq"><span class="wc-lb-badge" style="background:${lb.color}">${lb.lbName}</span>${lb.seqTitle?`<span class="wc-seq-badge" style="background:${lb.color}88"> → ${lb.seqTitle}</span>`:''}</div>`:''}
            ${_wthema?'<div class="wc-thema">📖 '+_wthema+'</div>':''}
            ${evtChipsHtml}
          </div>`;
        } else if (timedSlotEvts.length) {
          html += `<div class="woche-cell empty${todayClass}" style="cursor:pointer;padding:3px 4px;flex-direction:column;align-items:stretch;gap:2px">
            ${evtChipsHtml}
          </div>`;
        } else {
          const isSwapTgt = !!swapSource;
          html += `<div class="woche-cell empty${todayClass}${isSwapTgt?' swap-target':''}"
            onclick="${isSwapTgt?`lessonSwapTarget(${d},${s})`:`openStundeOverrideModal('${dateStr(dayDate)}',${d},${s},'','')`}"
            style="cursor:pointer">
            ${isSwapTgt?'<div style="font-size:.65rem;color:var(--ts-teal);text-align:center;padding-top:4px">↕</div>':'<div style="font-size:.65rem;color:var(--ts-border-light);text-align:center;padding-top:4px">＋</div>'}
          </div>`;
        }
      }
    }
  });

  // Nachmittag/Abend row — events not in any lesson slot
  html += `<div class="woche-time woche-time-nach">🌆<br><span style="font-size:.6rem">Nachm.</span></div>`;
  for (let d = 0; d < 5; d++) {
    const dayDate = weekDates[d];
    const isTodayCol = isCurrentWeek && d === todayDayIndex && todayDayIndex < 5;
    const isPastDay = weekDates[d] < todayMidnight;
    const todayClass = isTodayCol ? ' today-col' : (isPastDay ? ' past-day' : '');
    const dayEvts = getEventsForDate(dayDate);
    const nachEvts = dayEvts.filter(e => !e.ganztag && !e.blocksDay && e.time && getSlotIndexForTime(e.time, zr) === -1);
    if (nachEvts.length) {
      const chips = nachEvts.map(evt => {
        const t = getEventType(evt.type);
        return `<div class="wc-event-chip" style="border-left:2px solid ${t.color};background:${t.color}18;color:var(--ts-text)" onclick="event.stopPropagation();openEventModal(null,'${evt.id}')">${t.icon} ${evt.time}${evt.endTime?'–'+evt.endTime:''} ${evt.title}</div>`;
      }).join('');
      html += `<div class="woche-cell woche-cell-nach${todayClass}" style="cursor:pointer;padding:3px 4px;flex-direction:column;align-items:stretch;gap:2px" onclick="openEventModal('${dateStr(dayDate)}')">${chips}</div>`;
    } else {
      html += `<div class="woche-cell woche-cell-nach empty${todayClass}" onclick="openEventModal('${dateStr(dayDate)}')" style="cursor:pointer"><div style="font-size:.65rem;color:var(--ts-border-light);text-align:center;padding-top:4px">＋</div></div>`;
    }
  }

  document.getElementById('woche-grid').innerHTML = html;
  const kwNum = getWeekNumber(monday);
  renderNoteArea('view-woche','kw-'+monday.getFullYear()+'-'+kwNum,'Wochennotiz KW '+kwNum);
}

function wocheNav(dir) {
  wocheOffset += dir;
  renderWoche();
}
function wocheToday() {
  wocheOffset = 0;
  renderWoche();
}

/* ═══════════════════════════════════════════
   /* MONAT VIEW
   ═══════════════════════════════════════════ */
let monatOffset = 0; // 0 = current month

function renderMonat() {
  const today = new Date();
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monatOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  document.getElementById('monat-title').textContent = `${MONATE[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mo

  const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  let html = dayNames.map((d, i) =>
    `<div class="monat-dayname ${i >= 5 ? 'weekend' : ''}">${d}</div>`
  ).join('');

  // Fill grid: prev month padding + current month + next month padding
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    const cellDate = new Date(year, month, dayNum);
    const isCurrentMonth = cellDate.getMonth() === month;
    const isToday = isCurrentMonth && monatOffset === 0 && cellDate.getDate() === today.getDate() && cellDate.getMonth() === today.getMonth();
    const isPast = isCurrentMonth && monatOffset === 0 && cellDate < today && !isToday;
    const dow = (cellDate.getDay() + 6) % 7;
    const isWeekend = dow >= 5;

    let classes = 'monat-cell';
    if (!isCurrentMonth) classes += ' other-month';
    if (isToday) classes += ' today';
    if (isWeekend) classes += ' weekend';
    if (isPast) classes += ' past-day';

    // Check holidays
    const hi = isCurrentMonth ? getHolidayInfo(cellDate) : { ferien: null, feiertag: null, isHoliday: false };
    if (hi.feiertag) classes += ' holiday';
    else if (hi.ferien) classes += ' ferien';

    // Holiday / Ferien label (weekdays only)
    let holidayLabel = '';
    if (isCurrentMonth && !isWeekend) {
      if (hi.feiertag) holidayLabel = `<div class="monat-cell-label">${hi.feiertag.name}</div>`;
      else if (hi.ferien) holidayLabel = `<div class="monat-cell-label">${hi.ferien.name}</div>`;
    }

    // Events for this day
    let evtHtml = '';
    if (isCurrentMonth) {
      const dayEvents = getEventsForDate(cellDate);
      dayEvents.forEach(evt => {
        const t = getEventType(evt.type);
        const mEvtTime = evt.ganztag ? '' : evt.time ? evt.time+(evt.endTime?'–'+evt.endTime:'') : '';
        evtHtml += `<div class="evt-chip-sm" style="background:${t.color};color:#fff;font-size:.58rem;padding:1px 5px;border-radius:3px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;cursor:pointer" onclick="event.stopPropagation();openEventModal(null,'${evt.id}')">${t.icon}${mEvtTime?' '+mEvtTime:''} ${evt.title}</div>`;
      });
    }

    html += `<div class="${classes}" onclick="monatDayClick(${cellDate.getFullYear()},${cellDate.getMonth()},${cellDate.getDate()})">
      <div class="monat-cell-date">${cellDate.getDate()}</div>
      ${holidayLabel}${evtHtml}
    </div>`;
  }

  document.getElementById('monat-grid').innerHTML = html;
  document.getElementById('monat-legend').innerHTML = '';
  renderNoteArea('view-monat','monat-'+year+'-'+month,MONATE[month]+' Notiz');
}

function monatNav(dir) {
  monatOffset += dir;
  renderMonat();
}

function monatToday() {
  monatOffset = 0;
  renderMonat();
}

function monatDayClick(y, m, d) {
  // Zur Tagesansicht für den angeklickten Tag navigieren
  const clicked = new Date(y, m, d);
  const today = new Date();
  today.setHours(0,0,0,0);
  clicked.setHours(0,0,0,0);
  const diffMs = clicked.getTime() - today.getTime();
  heuteOffset = Math.round(diffMs / 86400000);
  navigate('heute');
  if(typeof renderHeute === 'function') renderHeute();
}

/* ═══════════════════════════════════════════

/* ═══ NOTIZ AREAS (appended to each view) ═══ */
function renderNoteArea(containerId, key, label){
  const existing = document.getElementById('note-'+containerId);
  if(existing) existing.remove();
  const container = document.getElementById(containerId);
  if(!container) return;
  const div = document.createElement('div');
  div.id = 'note-'+containerId;
  div.className = 'note-area';
  div.innerHTML = `<label>${label} <span class="note-saved" id="ns-${key}">Gespeichert</span></label>
    <textarea id="nt-${key}" placeholder="Notizen…" oninput="saveNote('${key}',this.value)"></textarea>`;
  container.appendChild(div);
  const el = document.getElementById('nt-'+key);
  if(el && notesCache[key]) el.value = notesCache[key];
}

let noteSaveTimer = null;
function saveNote(key, val){
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async ()=>{
    notesCache[key] = val;
    await CryptoManager.setItem('ts_notizen', notesCache);
    const badge = document.getElementById('ns-'+key);
    if(badge){badge.classList.add('visible');setTimeout(()=>badge.classList.remove('visible'),1500)}
  }, 600);
}



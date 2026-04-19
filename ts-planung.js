/* ═══════════════════════════════════════════
   /* ts-planung.js — Jahresplan, Lehrplan, Drag&Drop
   ═══════════════════════════════════════════ */
   /* PLANUNG (Jahres- + Sequenzplanung)
   ═══════════════════════════════════════════ */
const JP_LB_COLORS = ['#3BA89B','#5B8EC9','#E8A44A','#D4574E','#8B6DB5','#5AAE6B','#C47A5A','#D47BA0','#E07B4F','#4A8B9E','#7B9EC4','#A0885B','#C4A05B','#6BAA7B'];

let jpData = {};
let jpSchoolWeeks = null;

async function loadJpData(){ const d=await CryptoManager.getItem('ts_jahresplan_v2'); if(d) jpData=d; }
async function saveJpData(){ await CryptoManager.setItem('ts_jahresplan_v2', jpData); }
function getJpKey(){const k=document.getElementById('jp-klasse').value,f=document.getElementById('jp-fach').value;return(k&&f)?k+'_'+f:null}
function getJpPlan(){const key=getJpKey();if(!key)return null;if(!jpData[key])jpData[key]={lernbereiche:[],pruefungen:{}};if(!jpData[key].pruefungen)jpData[key].pruefungen={};return jpData[key]}

function getSchuljahrStart(){const now=new Date();return now.getMonth()>=8?now.getFullYear():now.getFullYear()-1}

// Generate all school weeks Sep–Jul with UE data
function getSchoolWeeks(klasseId, fachId){
  if(jpSchoolWeeks && jpSchoolWeeks._key === klasseId+'_'+fachId) return jpSchoolWeeks;
  const sjStart = getSchuljahrStart();
  let d = new Date(sjStart, 8, 1);
  const dow = (d.getDay()+6)%7;
  if(dow > 0) d.setDate(d.getDate() - dow);
  const endDate = new Date(sjStart+1, 6, 31);
  
  // Count UE per weekday
  const slotsPerDay = [0,0,0,0,0];
  const zeitraster = getZeitraster();
  if(state.stundenplan && klasseId && fachId){
    for(let day=0;day<5;day++){
      for(let slot=0;slot<zeitraster.length;slot++){
        const entry = state.stundenplan[day+'-'+slot];
        if(entry && entry.fachId===fachId && entry.klasseId===klasseId) slotsPerDay[day]++;
      }
    }
  }
  
  const weeks = [];
  while(d <= endDate){
    const monday = new Date(d);
    const friday = new Date(d);
    friday.setDate(friday.getDate()+4);
    
    // Only include weeks where at least one day is in Sep-Jul range
    if(friday.getMonth()>=8 || friday.getMonth()<=6 || (friday >= new Date(sjStart,8,1))){
      let ue = 0;
      let isFerien = true;
      let ferienName = '';
      let hasFeiertag = false;
      for(let wd=0;wd<5;wd++){
        const dd = new Date(monday);
        dd.setDate(dd.getDate()+wd);
        const hi = getHolidayInfo(dd);
        if(!hi.isHoliday){
          isFerien = false;
          ue += slotsPerDay[wd];
        } else {
          if(hi.ferien && !ferienName) ferienName = hi.ferien.name;
          if(hi.feiertag) hasFeiertag = true;
        }
      }
      // Partial ferien weeks: check if ALL 5 days are holiday
      let allHoliday = true;
      for(let wd=0;wd<5;wd++){
        const dd = new Date(monday);
        dd.setDate(dd.getDate()+wd);
        if(!getHolidayInfo(dd).isHoliday){allHoliday=false;break}
      }
      
      weeks.push({
        monday: new Date(monday), friday: new Date(friday),
        kw: getWeekNumber(monday), month: monday.getMonth(),
        ue, isFerien: allHoliday,
        slotsPerDay: [...slotsPerDay],
        ferienName: allHoliday ? ferienName : '',
        partialHoliday: !allHoliday && ue < slotsPerDay.reduce((a,b)=>a+b,0) && hasFeiertag,
        klasseId
      });
    }
    d.setDate(d.getDate()+7);
  }
  weeks._key = klasseId+'_'+fachId;
  jpSchoolWeeks = weeks;
  return weeks;
}

function countWeeklyUE(){
  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  if(!klasseId||!fachId||!state.stundenplan) return 0;
  let c=0;const zr=getZeitraster();
  for(let d=0;d<5;d++)for(let s=0;s<zr.length;s++){const e=state.stundenplan[d+'-'+s];if(e&&e.fachId===fachId&&e.klasseId===klasseId)c++}
  return c;
}

// ═══ UE-GENAUE SCHEDULE BERECHNUNG (PIN-BASIERT) ═══
// Jeder LB hat pinWeek = feste Startwoche. Löschen erzeugt Lücken.
// Sequenzen fließen UE-genau ab pinWeek.
let _scheduleCache = { hash:'', result:null };
function invalidateScheduleCache(){ _scheduleCache = { hash:'', result:null }; }
// Returns blocking events (Klassenfahrt, Praktikum etc.) that overlap with a given week
function getBlockingEventsForWeek(w) {
  const monStr = dateStr(w.monday);
  const friStr = dateStr(w.friday);
  return (typeof events !== 'undefined' ? events : []).filter(e => {
    if (!e.ganztag && !e.blocksDay) return false;
    // schulweite Events (kein klasseId) oder nur die betroffene Klasse
    if (e.klasseId && e.klasseId !== w.klasseId) return false;
    const end = (e.dateEnd && e.dateEnd >= e.date) ? e.dateEnd : e.date;
    return e.date <= friStr && end >= monStr;
  });
}

// Returns how many UE are blocked in a week by blocking events
function getEventBlockedUe(w) {
  if (!w.slotsPerDay) return 0;
  const blockEvts = getBlockingEventsForWeek(w);
  if (!blockEvts.length) return 0;
  let blocked = 0;
  for (let wd = 0; wd < 5; wd++) {
    if (!w.slotsPerDay[wd]) continue;
    const dd = new Date(w.monday);
    dd.setDate(dd.getDate() + wd);
    const ds = dateStr(dd);
    const dayBlocked = blockEvts.some(e => {
      const end = (e.dateEnd && e.dateEnd >= e.date) ? e.dateEnd : e.date;
      return ds >= e.date && ds <= end;
    });
    if (dayBlocked) blocked += w.slotsPerDay[wd];
  }
  return blocked;
}

function _scheduleHash(plan,weeks){
  const evtHash = (typeof events !== 'undefined' ? events : [])
    .filter(e => e.ganztag || e.blocksDay)
    .map(e => e.id + e.date + (e.dateEnd||'')).join(',');
  return JSON.stringify((plan.lernbereiche||[]).map(l=>({id:l.id,ue:l.ue,pw:l.pinWeek,sq:(l.sequenzen||[]).map(s=>s.ue)}))) + weeks.length + '|' + evtHash;
}

function computeSchedule(plan, weeks){
  const h = _scheduleHash(plan,weeks);
  if(_scheduleCache.hash === h && _scheduleCache.result) return _scheduleCache.result;
  const result = _computeScheduleInner(plan, weeks);
  _scheduleCache = { hash:h, result };
  return result;
}

function _computeScheduleInner(plan, weeks){
  const schedule = weeks.map(w => {
    const blockedUE = w.isFerien ? 0 : getEventBlockedUe(w);
    const cap = w.isFerien ? 0 : Math.max(0, w.ue - blockedUE);
    return {
      assignments: [], // {lbId, lbName, seqTitle, seqIdx, ue, color}
      capacity: cap,
      remaining: cap,
      blockedUE
    };
  });

  // Sort LBs by pinWeek to handle overlaps correctly
  const sorted = (plan.lernbereiche||[]).filter(lb => lb.pinWeek !== undefined).sort((a,b) => a.pinWeek - b.pinWeek);

  sorted.forEach(lb => {
    const col = lb.color || 'var(--ts-teal)';
    const hasSeqs = lb.sequenzen && lb.sequenzen.length > 0;

    // Build items from sequenzen, or single block if none
    let items = [];
    if(hasSeqs){
      lb.sequenzen.forEach((s,i) => items.push({ lbId:lb.id, lbName:lb.name, seqIdx:i, seqTitle:s.title, totalUE:s.ue||0, color:col }));
    } else {
      items.push({ lbId:lb.id, lbName:lb.name, seqIdx:-1, seqTitle:null, totalUE:lb.ue||0, color:col });
    }

    // Place starting from pinWeek, but first fill any remaining capacity in the
    // week where the previous block ended (even if there are empty weeks in between).
    // Walk backwards past fully-untouched weeks until we find a partially-used week.
    let wi = lb.pinWeek;
    // Walk backward skipping ferien OR completely-untouched weeks to find last partial week
    let lookback = wi - 1;
    while (lookback >= 0 && (weeks[lookback].isFerien ||
           (schedule[lookback].capacity > 0 && schedule[lookback].remaining === schedule[lookback].capacity))) {
      lookback--;
    }
    if (lookback >= 0 && !weeks[lookback].isFerien
        && schedule[lookback].remaining > 0
        && schedule[lookback].remaining < schedule[lookback].capacity) {
      wi = lookback;
    }
    items.forEach(item => {
      let rem = item.totalUE;
      while(rem > 0 && wi < schedule.length){
        if(weeks[wi].isFerien || schedule[wi].capacity <= 0){ wi++; continue; }
        const avail = schedule[wi].remaining;
        if(avail <= 0){ wi++; continue; }
        const use = Math.min(rem, avail);
        schedule[wi].assignments.push({
          lbId: item.lbId, lbName: item.lbName, seqTitle: item.seqTitle, seqIdx: item.seqIdx,
          ue: use, color: item.color
        });
        schedule[wi].remaining -= use;
        rem -= use;
        if(rem > 0 && schedule[wi].remaining <= 0) wi++;
      }
    });
  });

  return schedule;
}

// For each LB, compute span info from schedule
function getLbWeekSpans(plan, schedule, weeks){
  const spans = {};
  (plan.lernbereiche||[]).forEach(lb => {
    let first=-1, last=-1, totalScheduled=0;
    schedule.forEach((s,i) => {
      const match = s.assignments.filter(a=>a.lbId===lb.id);
      if(match.length){
        if(first<0) first=i;
        last=i;
        totalScheduled += match.reduce((sum,a)=>sum+a.ue,0);
      }
    });
    spans[lb.id] = { first, last, totalScheduled, kw1: first>=0?weeks[first].kw:'–', kw2: last>=0?weeks[last].kw:'–' };
  });
  return spans;
}

// For Heute/Woche/Monat: lookup LB + active Sequenz for a date
// Returns { lbName, seqTitle, color } or null
function getLernbereichForDate(fachId, klasseId, date){
  const key = klasseId+'_'+fachId;
  if(!jpData[key]) return null;
  const weeks = getSchoolWeeks(klasseId, fachId);
  const ds = dateStr(date);
  const wi = weeks.findIndex(w => ds >= dateStr(w.monday) && ds <= dateStr(w.friday));
  if(wi < 0) return null;
  const schedule = computeSchedule(jpData[key], weeks);
  if(!schedule[wi] || !schedule[wi].assignments.length) return null;
  // Return the first assignment (dominant in this week)
  const a = schedule[wi].assignments[0];
  return { lbName: a.lbName, seqTitle: a.seqTitle, color: a.color, lbId: a.lbId };
}

// Selectors
function initJpSelectors(){
  const kS=document.getElementById('jp-klasse'),fS=document.getElementById('jp-fach');
  kS.innerHTML='<option value="">Klasse wählen…</option>'+(state.klassen||[]).map(k=>`<option value="${k.id}">${k.name}</option>`).join('');
  const allF=new Set();(state.klassen||[]).forEach(k=>(k.faecher||[]).forEach(f=>allF.add(f)));
  fS.innerHTML='<option value="">Fach wählen…</option>'+[...allF].map(fId=>{const f=getFach(fId);return f?`<option value="${fId}">${f.name}</option>`:''}).join('');
}
function updateJpFaecher(){
  const kId=document.getElementById('jp-klasse').value,fS=document.getElementById('jp-fach'),cur=fS.value;
  if(!kId){const allF=new Set();(state.klassen||[]).forEach(k=>(k.faecher||[]).forEach(f=>allF.add(f)));
    fS.innerHTML='<option value="">Fach wählen…</option>'+[...allF].map(fId=>{const f=getFach(fId);return f?`<option value="${fId}">${f.name}</option>`:''}).join('');
  } else {const kl=getKlasse(kId),ff=kl?(kl.faecher||[]):[];
    fS.innerHTML='<option value="">Fach wählen…</option>'+ff.map(fId=>{const f=getFach(fId);return f?`<option value="${fId}">${f.name}</option>`:''}).join('');
  }
  if(cur&&fS.querySelector(`option[value="${cur}"]`))fS.value=cur;
}
function jpChanged(){
  jpSchoolWeeks=null;
  updateJpFaecher();renderPlanung();renderKiPanel();
}

// KI Panel toggle
function showPanel(){
  const panel=document.getElementById('pl-panel');
  const overlay=document.getElementById('pl-panel-overlay');
  panel.classList.add('open');
  panel.classList.remove('hidden');
  if(overlay)overlay.classList.add('open');
  _updatePanelToggleBtn();
  const view=document.getElementById('view-planung');
  if(view)view.classList.add('panel-open');
  renderKiPanel();
}
function hidePanel(){
  const panel=document.getElementById('pl-panel');
  const overlay=document.getElementById('pl-panel-overlay');
  panel.classList.remove('open');
  panel.classList.add('hidden');
  if(overlay)overlay.classList.remove('open');
  _updatePanelToggleBtn();
  const view=document.getElementById('view-planung');
  if(view)view.classList.remove('panel-open');
}
function toggleKiPanel(){
  const panel=document.getElementById('pl-panel');
  if(panel.classList.contains('open')) hidePanel(); else showPanel();
}
function _updatePanelToggleBtn(){
  const btn=document.getElementById('pl-panel-toggle-btn');
  if(!btn) return;
  const isOpen=document.getElementById('pl-panel')?.classList.contains('open');
  btn.textContent=isOpen?'📋 Lehrplan ◀':'📋 Lehrplan ▶';
}

// === EMBEDDED LEHRPLAN DATA (Alle Bundeslaender + AT/CH) ===
const LEHRPLAN_DB = {
  BY:{
  // === MITTELSCHULE — Quelle: ISB Bayern LehrplanPLUS (Regelklasse) ===
  Mittelschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Ganze Zahlen",ue:20},{n:"Geometrische Figuren und Lagebeziehungen",ue:22},{n:"Flächeninhalt – Rechtecke",ue:18},{n:"Größen im Alltag",ue:20},{n:"Daten",ue:16},{n:"Gleichungen und Formeln",ue:26}],
      6:[{n:"Bruchzahlen",ue:24},{n:"Rationale Zahlen",ue:22},{n:"Geometrische Figuren, Körper und Lagebeziehungen",ue:20},{n:"Flächeninhalt – Oberflächeninhalt von Quadern",ue:20},{n:"Rauminhalt – Quader",ue:18},{n:"Daten",ue:16},{n:"Gleichungen und Formeln",ue:24}],
      7:[{n:"Prozentrechnung",ue:20},{n:"Rationale Zahlen – Rechenregeln",ue:18},{n:"Geometrische Figuren, Körper und Lagebeziehungen",ue:18},{n:"Flächeninhalt – Parallelogramme und Dreiecke",ue:18},{n:"Rauminhalt – gerade Prismen",ue:16},{n:"Diagramme und statistische Kennwerte",ue:16},{n:"Gleichungen",ue:18},{n:"Proportionalität",ue:20}],
      8:[{n:"Prozentrechnung",ue:20},{n:"Quadratzahlen und Quadratwurzeln",ue:16},{n:"Geometrische Figuren, Körper und Lagebeziehungen",ue:18},{n:"Flächeninhalt – Kreise",ue:18},{n:"Rauminhalt – Zylinder",ue:16},{n:"Zufallsexperimente",ue:16},{n:"Gleichungen",ue:20},{n:"Funktionale Zusammenhänge",ue:20}],
      9:[{n:"Prozent- und Zinsrechnung",ue:20},{n:"Potenzen",ue:16},{n:"Geometrische Figuren, Körper und Lagebeziehungen",ue:18},{n:"Flächeninhalt – Vielecke",ue:16},{n:"Rauminhalt – Prismen, Pyramiden, Kegel",ue:20},{n:"Wahrscheinlichkeiten",ue:18},{n:"Gleichungen",ue:18},{n:"Funktionale Zusammenhänge",ue:18}]
    },
    deutsch:{
      5:[{n:"Sprechen und Zuhören",ue:38},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:38},{n:"Schreiben",ue:38},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:30}],
      6:[{n:"Sprechen und Zuhören",ue:38},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:38},{n:"Schreiben",ue:38},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:30}],
      7:[{n:"Sprechen und Zuhören",ue:38},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:38},{n:"Schreiben",ue:38},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:30}],
      8:[{n:"Sprechen und Zuhören",ue:38},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:38},{n:"Schreiben",ue:38},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:30}],
      9:[{n:"Sprechen und Zuhören",ue:38},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:38},{n:"Schreiben",ue:38},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:30}]
    },
    englisch:{
      5:[{n:"Kommunikative Kompetenzen",ue:26},{n:"Interkulturelle Kompetenzen",ue:20},{n:"Text- und Medienkompetenzen",ue:20},{n:"Methodische Kompetenzen",ue:20},{n:"Themengebiete",ue:26}],
      6:[{n:"Kommunikative Kompetenzen",ue:26},{n:"Interkulturelle Kompetenzen",ue:20},{n:"Text- und Medienkompetenzen",ue:20},{n:"Methodische Kompetenzen",ue:20},{n:"Themengebiete",ue:26}],
      7:[{n:"Kommunikative Kompetenzen",ue:26},{n:"Interkulturelle Kompetenzen",ue:20},{n:"Text- und Medienkompetenzen",ue:20},{n:"Methodische Kompetenzen",ue:20},{n:"Themengebiete",ue:26}],
      8:[{n:"Kommunikative Kompetenzen",ue:26},{n:"Interkulturelle Kompetenzen",ue:20},{n:"Text- und Medienkompetenzen",ue:20},{n:"Methodische Kompetenzen",ue:20},{n:"Themengebiete",ue:26}],
      9:[{n:"Kommunikative Kompetenzen",ue:26},{n:"Interkulturelle Kompetenzen",ue:20},{n:"Text- und Medienkompetenzen",ue:20},{n:"Methodische Kompetenzen",ue:20},{n:"Themengebiete",ue:26}]
    },
    nt:{
      5:[{n:"Naturwissenschaftliches Arbeiten",ue:26},{n:"Lebensgrundlage Sonne",ue:28},{n:"Mensch und Gesundheit",ue:26},{n:"Materie, Stoffe und Technik",ue:28}],
      6:[{n:"Naturwissenschaftliches Arbeiten",ue:26},{n:"Lebensgrundlagen Wasser und Boden",ue:28},{n:"Mensch und Gesundheit – Pubertät und vorgeburtliche Entwicklung",ue:26},{n:"Materie, Stoffe und Technik",ue:28}],
      7:[{n:"Naturwissenschaftliches Arbeiten",ue:26},{n:"Lebensgrundlage Luft",ue:28},{n:"Mensch und Gesundheit",ue:26},{n:"Materie, Stoffe und Technik",ue:28}],
      8:[{n:"Naturwissenschaftliches Arbeiten",ue:26},{n:"Lebensgrundlage Energie",ue:28},{n:"Mensch und Gesundheit",ue:26},{n:"Materie, Stoffe und Technik",ue:28}],
      9:[{n:"Naturwissenschaftliches Arbeiten",ue:26},{n:"Lebensgrundlage Kohlenstoff",ue:28},{n:"Mensch und Gesundheit",ue:26},{n:"Materie, Stoffe und Technik",ue:28}]
    },
    gpg:{
      5:[{n:"Lebensraum Erde",ue:28},{n:"Zeit und Wandel",ue:28},{n:"Politik und Gesellschaft",ue:26},{n:"Lebenswelt",ue:26}],
      6:[{n:"Lebensraum Erde",ue:28},{n:"Zeit und Wandel",ue:28},{n:"Politik und Gesellschaft",ue:26},{n:"Lebenswelt",ue:26}],
      7:[{n:"Lebensraum Erde",ue:28},{n:"Zeit und Wandel",ue:28},{n:"Politik und Gesellschaft",ue:26},{n:"Lebenswelt",ue:26}],
      8:[{n:"Lebensraum Erde",ue:28},{n:"Zeit und Wandel",ue:28},{n:"Politik und Gesellschaft",ue:26},{n:"Lebenswelt",ue:26}],
      9:[{n:"Lebensraum Erde",ue:28},{n:"Zeit und Wandel",ue:28},{n:"Politik und Gesellschaft",ue:26},{n:"Lebenswelt",ue:26}]
    },
    wib:{
      7:[{n:"Projekt",ue:18},{n:"Arbeit",ue:14},{n:"Berufsorientierung",ue:20},{n:"Wirtschaft",ue:14},{n:"Recht",ue:12},{n:"Technik",ue:14}],
      8:[{n:"Projekt",ue:20},{n:"Berufsorientierung",ue:22},{n:"Wirtschaft",ue:16},{n:"Recht",ue:14},{n:"Technik",ue:16}],
      9:[{n:"Projekt",ue:18},{n:"Arbeit",ue:14},{n:"Berufsorientierung",ue:22},{n:"Wirtschaft",ue:14},{n:"Recht",ue:12},{n:"Technik",ue:12}]
    },
    sport:{
      5:[{n:"Gesundheit und Fitness",ue:28},{n:"Fairness/Kooperation/Selbstkompetenz",ue:26},{n:"Freizeit und Umwelt",ue:24},{n:"Sportliche Handlungsfelder",ue:30}],
      6:[{n:"Gesundheit und Fitness",ue:28},{n:"Fairness/Kooperation/Selbstkompetenz",ue:26},{n:"Freizeit und Umwelt",ue:24},{n:"Sportliche Handlungsfelder",ue:30}],
      7:[{n:"Gesundheit und Fitness",ue:28},{n:"Fairness/Kooperation/Selbstkompetenz",ue:26},{n:"Freizeit und Umwelt",ue:24},{n:"Sportliche Handlungsfelder",ue:30}],
      8:[{n:"Gesundheit und Fitness",ue:28},{n:"Fairness/Kooperation/Selbstkompetenz",ue:26},{n:"Freizeit und Umwelt",ue:24},{n:"Sportliche Handlungsfelder",ue:30}],
      9:[{n:"Gesundheit und Fitness",ue:28},{n:"Fairness/Kooperation/Selbstkompetenz",ue:26},{n:"Freizeit und Umwelt",ue:24},{n:"Sportliche Handlungsfelder",ue:30}]
    }
  },
  // === GYMNASIUM — Mathe + Deutsch: ISB Bayern LehrplanPLUS; andere Fächer: Annäherungswerte, Verifizierung folgt ===
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen und ganze Zahlen",ue:30},{n:"Geometrische Figuren und Lagebeziehungen",ue:20},{n:"Multiplikation, Division und Verbindung der Grundrechenarten",ue:20},{n:"Geld, Länge, Masse, Zeit und Flächeninhalt",ue:20}],
      6:[{n:"Bruchzahlen und Dezimalbrüche",ue:36},{n:"Flächeninhalt und Volumen",ue:26},{n:"Prozentrechnung, Daten und Diagramme",ue:22}],
      7:[{n:"Terme",ue:22},{n:"Symmetrische Figuren und Winkel",ue:20},{n:"Lineare Gleichungen und Prozentrechnung",ue:24},{n:"Kenngrößen von Daten",ue:18},{n:"Kongruenz, Dreiecke und Dreieckskonstruktionen",ue:22}],
      8:[{n:"Funktion und Term",ue:20},{n:"Lineare Funktionen",ue:22},{n:"Elementare gebrochen-rationale Funktionen",ue:16},{n:"Bruchterme und Bruchgleichungen",ue:18},{n:"Laplace-Experimente",ue:16},{n:"Lineare Gleichungssysteme",ue:16},{n:"Kreis und Zylinder",ue:20}],
      9:[{n:"Quadratwurzeln",ue:16},{n:"Quadratische Funktionen und quadratische Gleichungen",ue:30},{n:"Wahrscheinlichkeit verknüpfter Ereignisse",ue:18},{n:"Ähnlichkeit und Strahlensatz",ue:20},{n:"Potenzfunktionen",ue:16},{n:"Satz des Pythagoras",ue:16},{n:"Trigonometrie",ue:20}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Sprechen und Zuhören",ue:36},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:36},{n:"Schreiben",ue:36},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:32}],
      6:[{n:"Sprechen und Zuhören",ue:36},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:36},{n:"Schreiben",ue:36},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:32}],
      7:[{n:"Sprechen und Zuhören",ue:36},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:36},{n:"Schreiben",ue:36},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:32}],
      8:[{n:"Sprechen und Zuhören",ue:30},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:30},{n:"Schreiben",ue:30},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:28},{n:"Profilbereich am MuG",ue:22}],
      9:[{n:"Sprechen und Zuhören",ue:30},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:30},{n:"Schreiben",ue:30},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:28},{n:"Profilbereich am MuG",ue:22}],
      10:[{n:"Sprechen und Zuhören",ue:30},{n:"Lesen – mit Texten und weiteren Medien umgehen",ue:30},{n:"Schreiben",ue:30},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:28},{n:"Profilbereich am MuG",ue:22}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    // === MATHE — Quelle: ISB Bayern LehrplanPLUS Realschule ===
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:24},{n:"Ganze Zahlen",ue:18},{n:"Geometrische Grundbegriffe und ebene Figuren",ue:22},{n:"Flächeninhalt und Umfang",ue:18},{n:"Brüche",ue:18},{n:"Daten",ue:14}],
      6:[{n:"Brüche und Dezimalzahlen",ue:24},{n:"Proportionalität und Dreisatz",ue:18},{n:"Prozentrechnung",ue:18},{n:"Geometrie: Kreis und Körper",ue:20},{n:"Terme und Gleichungen",ue:18},{n:"Daten und Zufall",ue:14}],
      7:[{n:"Rationale Zahlen",ue:20},{n:"Terme und lineare Gleichungen",ue:20},{n:"Prozent- und Zinsrechnung",ue:18},{n:"Geometrie: Pythagoras und Ähnlichkeit",ue:20},{n:"Lineare Funktionen",ue:16},{n:"Stochastik",ue:14}],
      8:[{n:"Potenzen und Wurzeln",ue:16},{n:"Lineare Gleichungssysteme",ue:18},{n:"Geometrie: Kreis, Ähnlichkeit, Körper",ue:20},{n:"Körperberechnungen",ue:18},{n:"Quadratische Gleichungen Einführung",ue:16},{n:"Stochastik",ue:14}],
      9:[{n:"Quadratische Gleichungen und Funktionen",ue:22},{n:"Trigonometrie",ue:20},{n:"Körperberechnungen vertieft",ue:16},{n:"Stochastik",ue:16},{n:"Prüfungsvorbereitung",ue:18}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Analytische Geometrie Einführung",ue:16},{n:"Stochastik vertieft",ue:16},{n:"Lineare Optimierung",ue:14},{n:"Prüfungsvorbereitung",ue:22}]
    },
    // === DEUTSCH — Quelle: ISB Bayern LehrplanPLUS Realschule ===
    deutsch:{
      5:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}],
      6:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}],
      7:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}],
      8:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}],
      9:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}],
      10:[{n:"Sprechen und Zuhören",ue:34},{n:"Lesen – mit Texten und Medien umgehen",ue:34},{n:"Schreiben",ue:34},{n:"Sprachgebrauch und Sprache untersuchen und reflektieren",ue:26}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Berufsschule:{
    deutsch:{
      1:[{n:"Kommunikation im Beruf",ue:20},{n:"Berufliche Schriftstücke",ue:16},{n:"Präsentieren & Moderieren",ue:14},{n:"Lesetechniken & Textanalyse",ue:14},{n:"Reflexion über Sprache",ue:10}],
      2:[{n:"Bewerbung & Lebenslauf",ue:18},{n:"Protokoll & Bericht",ue:16},{n:"Argumentation & Diskussion",ue:16},{n:"Literatur & Medien",ue:14},{n:"Sprachreflexion",ue:10}],
      3:[{n:"Berufliche Kommunikation vertieft",ue:16},{n:"Präsentation & Rhetorik",ue:14},{n:"Textproduktion vertieft",ue:16},{n:"Prüfungsvorbereitung Deutsch",ue:20},{n:"Mündliche Abschlussprüfung",ue:10}]
    },
    politik:{
      1:[{n:"Demokratie & Rechtsstaat",ue:14},{n:"Wirtschaftsordnung",ue:12},{n:"Arbeitnehmerrechte",ue:14},{n:"Sozialversicherungssystem",ue:12}],
      2:[{n:"Tarifvertrag & Mitbestimmung",ue:14},{n:"Globalisierung",ue:12},{n:"Politisches System BRD",ue:12},{n:"Aktuelle gesellschaftliche Themen",ue:14}],
      3:[{n:"Europa & EU",ue:14},{n:"Soziale Gerechtigkeit",ue:12},{n:"Umwelt & Nachhaltigkeit",ue:12},{n:"Politische Partizipation",ue:10}]
    },
    religion:{
      1:[{n:"Sinn der Arbeit & Berufsethos",ue:14},{n:"Werte & Normen im Berufsalltag",ue:12},{n:"Gewissen & Verantwortung",ue:12},{n:"Religionen & Weltanschauungen",ue:10}],
      2:[{n:"Gerechtigkeit & Berufsethik",ue:14},{n:"Familie & Partnerschaft",ue:12},{n:"Mensch & Technik",ue:12},{n:"Sinn & Transzendenz",ue:10}],
      3:[{n:"Bioethik & Technikethik",ue:14},{n:"Tod & Trauer",ue:10},{n:"Glaubensfragen heute",ue:12},{n:"Abschlussreflexion",ue:10}]
    },
    sport:{
      1:[{n:"Fitness & Gesundheit",ue:14},{n:"Rückenschule / Ausgleichssport",ue:14},{n:"Mannschaftssport",ue:14},{n:"Entspannung & Stressbewältigung",ue:10}],
      2:[{n:"Ausdauer & Kraft",ue:14},{n:"Individualsport",ue:14},{n:"Sportspiele",ue:12},{n:"Gesundheitsprävention",ue:12}],
      3:[{n:"Fitness & Lifestyle",ue:14},{n:"Sportarten nach Wahl",ue:14},{n:"Gesundheitssport vertieft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    englisch:{
      1:[{n:"Workplace Communication",ue:16},{n:"Job Application",ue:14},{n:"Company & Profession",ue:14},{n:"Technical Vocabulary",ue:12},{n:"Business Correspondence",ue:12}],
      2:[{n:"International Business",ue:14},{n:"Customer Communication",ue:14},{n:"Presentations & Reports",ue:14},{n:"Technology & Innovation",ue:12},{n:"Exam Preparation",ue:14}],
      3:[{n:"Advanced Business English",ue:14},{n:"Global Trade",ue:12},{n:"Professional Writing",ue:14},{n:"Exam Preparation",ue:18},{n:"Oral Presentation",ue:12}]
    },
    lernfeld:{
      1:[{n:"LF 1: Betrieb & Berufsfeld erkunden",ue:20},{n:"LF 2: Geschäftsprozesse verstehen",ue:24},{n:"LF 3: Aufgaben & Abläufe planen",ue:20},{n:"LF 4: Informationsquellen nutzen",ue:18},{n:"LF 5: Kommunizieren & Kooperieren",ue:18}],
      2:[{n:"LF 6: Kernprozesse ausführen",ue:24},{n:"LF 7: Qualität sichern",ue:20},{n:"LF 8: Wirtschaftliche Aspekte beachten",ue:20},{n:"LF 9: Projekte durchführen",ue:22},{n:"LF 10: Fachspezifische Vertiefung",ue:20}],
      3:[{n:"LF 11: Komplexe Aufgaben lösen",ue:24},{n:"LF 12: Abschlussprojekt vorbereiten",ue:20},{n:"LF 13: Prüfungsvorbereitung Fachpraxis",ue:22},{n:"LF 14: Abschlusspräsentation",ue:14}]
    }
  },
  'Fachoberschule (FOS)':{
    mathe:{
      11:[{n:"Mengenlehre & Logik",ue:16},{n:"Vektoren & Matrizen",ue:22},{n:"Analytische Geometrie",ue:20},{n:"Stochastik: Wahrscheinlichkeitsrechnung",ue:18},{n:"Finanzmathematik",ue:14}],
      12:[{n:"Differentialrechnung",ue:24},{n:"Integralrechnung",ue:22},{n:"Kurvendiskussion",ue:20},{n:"Stochastik vertieft",ue:16},{n:"Prüfungsvorbereitung",ue:14}]
    },
    deutsch:{
      11:[{n:"Textsorten & Textanalyse",ue:18},{n:"Erörterung",ue:16},{n:"Literaturanalyse: Epik",ue:14},{n:"Rhetorische Analyse",ue:14},{n:"Sprachreflexion",ue:12}],
      12:[{n:"Literaturanalyse vertieft",ue:18},{n:"Aufsatzformen: Fachabitur",ue:20},{n:"Lyrik & Drama",ue:14},{n:"Wissenschaftliches Schreiben",ue:14},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      11:[{n:"Reading & Text Analysis",ue:16},{n:"Grammar Review",ue:14},{n:"Writing Skills",ue:14},{n:"Listening & Speaking",ue:14},{n:"Cultural Studies",ue:12}],
      12:[{n:"Advanced Writing",ue:16},{n:"Literature & Media",ue:14},{n:"Current Affairs",ue:14},{n:"Exam Preparation: Writing",ue:16},{n:"Exam Preparation: Speaking",ue:12}]
    },
    physik:{
      11:[{n:"Mechanik: Kinematik & Dynamik",ue:20},{n:"Wärmelehre",ue:16},{n:"Elektrizitätslehre",ue:18},{n:"Optik",ue:14},{n:"Schwingungen & Wellen",ue:12}],
      12:[{n:"Elektrodynamik",ue:20},{n:"Quantenmechanik Grundlagen",ue:16},{n:"Kernphysik",ue:14},{n:"Atombau",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    chemie:{
      11:[{n:"Atombau & Bindungen",ue:18},{n:"Organische Chemie: Kohlenwasserstoffe",ue:20},{n:"Reaktionskinetik",ue:14},{n:"Chemisches Gleichgewicht",ue:14},{n:"Elektrochemie",ue:14}],
      12:[{n:"Organische Chemie vertieft",ue:18},{n:"Polymere & Kunststoffe",ue:14},{n:"Analytische Chemie",ue:16},{n:"Umweltchemie",ue:12},{n:"Prüfungsvorbereitung",ue:16}]
    },
    bwr:{
      11:[{n:"Grundlagen BWL: Betrieb & Umwelt",ue:16},{n:"Buchführung: Grundlagen",ue:20},{n:"Jahresabschluss",ue:18},{n:"Kostenrechnung",ue:16},{n:"Finanzierung",ue:14}],
      12:[{n:"Investitionsrechnung",ue:18},{n:"Controlling",ue:16},{n:"Jahresabschlussanalyse",ue:18},{n:"Steuerlehre Grundlagen",ue:14},{n:"Prüfungsvorbereitung",ue:14}]
    },
    vwl:{
      11:[{n:"Wirtschaftskreislauf",ue:14},{n:"Angebot & Nachfrage",ue:16},{n:"Marktformen",ue:14},{n:"Konjunktur & Wachstum",ue:14},{n:"Wirtschaftspolitik",ue:14}],
      12:[{n:"Geld & Geldpolitik",ue:14},{n:"Außenwirtschaft & EU",ue:16},{n:"Soziale Marktwirtschaft",ue:14},{n:"Globalisierung",ue:14},{n:"Prüfungsvorbereitung",ue:14}]
    },
    rechtslehre:{
      11:[{n:"BGB Grundlagen: Rechtsgeschäfte",ue:16},{n:"Kaufvertrag & Störungen",ue:18},{n:"Arbeitsrecht",ue:16},{n:"Gesellschaftsrecht Überblick",ue:14},{n:"Handelsrecht",ue:12}],
      12:[{n:"Vertragsrecht vertieft",ue:16},{n:"Schuldrecht",ue:16},{n:"Öffentliches Recht",ue:14},{n:"Steuerrecht Grundlagen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    paedagogik:{
      11:[{n:"Grundbegriffe der Pädagogik",ue:16},{n:"Lerntheorien",ue:16},{n:"Entwicklungspsychologie",ue:18},{n:"Sozialisation",ue:14},{n:"Erziehung & Bildung",ue:14}],
      12:[{n:"Didaktik & Methodik",ue:16},{n:"Klinische Psychologie Grundlagen",ue:14},{n:"Sozialpsychologie",ue:16},{n:"Inklusion & Diversität",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    soziologie:{
      11:[{n:"Grundbegriffe der Soziologie",ue:14},{n:"Soziale Ungleichheit",ue:16},{n:"Familie & Gesellschaft",ue:14},{n:"Sozialisation & Identität",ue:14},{n:"Migration & Integration",ue:14}],
      12:[{n:"Sozialstruktur Deutschlands",ue:14},{n:"Abweichendes Verhalten",ue:12},{n:"Gesellschaftlicher Wandel",ue:14},{n:"Sozialpolitik",ue:14},{n:"Prüfungsvorbereitung",ue:14}]
    },
    informatik:{
      11:[{n:"Datenstrukturen & Algorithmen",ue:18},{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken: SQL",ue:16},{n:"Betriebssysteme & Netzwerke",ue:14},{n:"Datenschutz & IT-Sicherheit",ue:10}],
      12:[{n:"Softwareentwicklung: Projekte",ue:18},{n:"Web-Technologien",ue:16},{n:"KI & Digitalisierung",ue:14},{n:"IT-Recht",ue:12},{n:"Prüfungsvorbereitung",ue:16}]
    },
    sport:{
      11:[{n:"Fitness & Gesundheitssport",ue:16},{n:"Mannschaftssport",ue:14},{n:"Sporttheorie: Anatomie",ue:12},{n:"Individualsport",ue:12},{n:"Entspannung",ue:8}],
      12:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Sporttheorie: Trainingslehre",ue:14},{n:"Gesundheitssport",ue:14},{n:"Wahlsport",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  'Berufsoberschule (BOS)':{
    mathe:{
      12:[{n:"Differentialrechnung Vertiefung",ue:22},{n:"Integralrechnung",ue:20},{n:"Lineare Algebra",ue:18},{n:"Stochastik",ue:16},{n:"Finanzmathematik",ue:14}],
      13:[{n:"Analysis vertieft",ue:24},{n:"Kurvendiskussion komplex",ue:20},{n:"Stochastik: Hypothesentests",ue:18},{n:"Abituraufgaben üben",ue:20},{n:"Prüfungsvorbereitung",ue:14}]
    },
    deutsch:{
      12:[{n:"Literaturepochen: Überblick",ue:16},{n:"Lektüre: Prosa analysieren",ue:18},{n:"Aufsatzformen",ue:16},{n:"Lyrik & Drama",ue:14},{n:"Wissenschaftliches Schreiben",ue:12}],
      13:[{n:"Abituraufsatz",ue:20},{n:"Literaturanalyse vertieft",ue:18},{n:"Rhetorische Analyse",ue:14},{n:"Sprache & Gesellschaft",ue:12},{n:"Prüfungsvorbereitung",ue:16}]
    },
    englisch:{
      12:[{n:"Advanced Reading & Analysis",ue:16},{n:"Essay Writing",ue:16},{n:"Cultural Studies: Britain & USA",ue:14},{n:"Listening Comprehension",ue:12},{n:"Grammar in Context",ue:14}],
      13:[{n:"Abitur Writing",ue:18},{n:"Abitur Speaking",ue:14},{n:"Literature Analysis",ue:16},{n:"Current Affairs",ue:12},{n:"Prüfungsvorbereitung",ue:18}]
    },
    bwr:{
      12:[{n:"Buchführung vertieft",ue:20},{n:"Kosten- & Leistungsrechnung",ue:18},{n:"Jahresabschluss & Analyse",ue:18},{n:"Investition & Finanzierung",ue:14},{n:"Unternehmensplanung",ue:10}],
      13:[{n:"Strategisches Management",ue:16},{n:"Controlling vertieft",ue:16},{n:"Steuern & Recht",ue:16},{n:"Wirtschaftsprüfung Grundlagen",ue:12},{n:"Prüfungsvorbereitung",ue:20}]
    },
    paedagogik:{
      12:[{n:"Lerntheorien vertieft",ue:16},{n:"Entwicklungspsychologie vertieft",ue:16},{n:"Didaktik Vertiefung",ue:14},{n:"Sonderpädagogik",ue:14},{n:"Diagnostik",ue:12}],
      13:[{n:"Forschungsmethoden",ue:14},{n:"Klinische Psychologie",ue:14},{n:"Pädagogische Institutionen",ue:12},{n:"Fallanalysen",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    }
  },
  Wirtschaftsschule:{
    bwp:{
      7:[{n:"Was ist ein Betrieb?",ue:18},{n:"Kaufvertrag & Ablauf",ue:16},{n:"Einkauf & Beschaffung",ue:14},{n:"Rechnungslegung Grundlagen",ue:14}],
      8:[{n:"Personalwesen",ue:16},{n:"Marketing & Absatz",ue:16},{n:"Lagerwirtschaft",ue:14},{n:"Zahlungsverkehr",ue:12},{n:"Rechtliche Grundlagen",ue:12}],
      9:[{n:"Finanz- & Rechnungswesen",ue:18},{n:"Unternehmensführung",ue:14},{n:"E-Commerce & Digitalisierung",ue:14},{n:"Unternehmensgründung",ue:14},{n:"Projektarbeit",ue:12}],
      10:[{n:"Jahresabschluss",ue:18},{n:"Betriebliche Planung",ue:14},{n:"Unternehmenssimulation ERP",ue:16},{n:"Fallstudien",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    mathe:{
      7:[{n:"Prozent- und Zinsrechnung",ue:18},{n:"Dreisatz & Proportionalität",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Geometrie",ue:14},{n:"Daten & Statistik",ue:10}],
      8:[{n:"Gleichungssysteme",ue:16},{n:"Finanzmathematik",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik Grundlagen",ue:14},{n:"Sachrechnen",ue:12}],
      9:[{n:"Funktionen",ue:18},{n:"Finanzmathematik vertieft",ue:16},{n:"Statistik vertieft",ue:14},{n:"Sachrechnen komplex",ue:14},{n:"Prüfungsvorbereitung",ue:10}],
      10:[{n:"Differentialrechnung Einführung",ue:14},{n:"Finanzmathematik Abschluss",ue:16},{n:"Stochastik",ue:14},{n:"Sachrechnen & Anwendung",ue:16},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      7:[{n:"Geschäftliche Kommunikation",ue:16},{n:"Inhaltsangabe & Texte",ue:16},{n:"Rechtschreibung & Grammatik",ue:18},{n:"Präsentieren",ue:12},{n:"Medien",ue:10}],
      8:[{n:"Bewerbungsunterlagen",ue:16},{n:"Textanalyse",ue:16},{n:"Argumentieren & Erörtern",ue:16},{n:"Protokoll & Bericht",ue:14},{n:"Literatur",ue:10}],
      9:[{n:"Erörterungsaufsatz",ue:18},{n:"Literaturanalyse",ue:14},{n:"Berufliche Textsorten",ue:14},{n:"Präsentation & Referat",ue:12},{n:"Rechtschreibung",ue:12}],
      10:[{n:"Aufsatz Vorbereitung",ue:16},{n:"Literaturanalyse vertieft",ue:16},{n:"Sprachreflexion",ue:12},{n:"Präsentation",ue:12},{n:"Prüfungsvorbereitung",ue:18}]
    },
    englisch:{
      7:[{n:"Business Vocabulary",ue:14},{n:"Company & Professions",ue:14},{n:"Written Correspondence",ue:14},{n:"Listening & Speaking",ue:14},{n:"Grammar",ue:12}],
      8:[{n:"International Trade",ue:14},{n:"Customer Service",ue:14},{n:"Business Letters",ue:14},{n:"Presentations",ue:12},{n:"Grammar vertieft",ue:12}],
      9:[{n:"Marketing & Advertising",ue:14},{n:"Job Application",ue:14},{n:"Company Visits & Reports",ue:14},{n:"Grammar & Writing",ue:14},{n:"Reading Comprehension",ue:10}],
      10:[{n:"Advanced Business English",ue:14},{n:"Case Studies",ue:14},{n:"Exam Writing",ue:14},{n:"Oral Exam Preparation",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    iv:{
      7:[{n:"Textverarbeitung: Word / Google Docs",ue:16},{n:"Tabellenkalkulation: Grundlagen",ue:16},{n:"Präsentation: PowerPoint",ue:12},{n:"Digitale Kommunikation",ue:10}],
      8:[{n:"Tabellenkalkulation vertieft",ue:18},{n:"Datenbanken Grundlagen",ue:14},{n:"ERP-Software Einführung",ue:14},{n:"Datenschutz",ue:8}],
      9:[{n:"ERP-Software vertieft",ue:18},{n:"Unternehmenssimulation",ue:16},{n:"Digitale Geschäftsprozesse",ue:14},{n:"Internet & E-Commerce",ue:12}],
      10:[{n:"ERP-Abschlussübung",ue:16},{n:"Digitale Projekte",ue:14},{n:"IT-Sicherheit",ue:12},{n:"Prüfungsvorbereitung",ue:16}]
    },
    geografie:{
      7:[{n:"Wirtschaftsgeografie: Europa",ue:16},{n:"Standortfaktoren",ue:14},{n:"Landwirtschaft & Industrie",ue:14},{n:"Deutschland als Wirtschaftsstandort",ue:14}],
      8:[{n:"Globalisierung & Welthandel",ue:16},{n:"Entwicklungsländer",ue:14},{n:"Rohstoffe & Energie",ue:14},{n:"Umwelt & Nachhaltigkeit",ue:12}],
      9:[{n:"Europäische Union",ue:16},{n:"Ostasien als Wirtschaftsraum",ue:14},{n:"BRIC-Staaten",ue:14},{n:"Migration & Bevölkerung",ue:12}],
      10:[{n:"Weltwirtschaft",ue:14},{n:"Globale Probleme",ue:14},{n:"Geopolitik",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    }
  },
  'Berufsfachschule (BFS)':{
    deutsch:{
      1:[{n:"Kommunikation im Pflegealltag",ue:18},{n:"Berichte & Dokumentation",ue:16},{n:"Fachsprachliche Texte",ue:14},{n:"Präsentation",ue:12}],
      2:[{n:"Fachkommunikation vertieft",ue:16},{n:"Textanalyse & Reflexion",ue:14},{n:"Berufliche Schriftstücke",ue:16},{n:"Prüfungsvorbereitung",ue:20}]
    },
    pflege:{
      1:[{n:"Pflegeplanung & Pflegeprozess",ue:24},{n:"Grundpflege",ue:20},{n:"Anatomie & Physiologie",ue:20},{n:"Hygiene & Infektionsschutz",ue:16},{n:"Pflege älterer Menschen",ue:16}],
      2:[{n:"Pflege chronisch kranker Menschen",ue:20},{n:"Aktivierung & Rehabilitation",ue:18},{n:"Palliativpflege",ue:14},{n:"Medikamentenkunde",ue:16},{n:"Prüfungsvorbereitung",ue:22}]
    },
    englisch:{
      1:[{n:"Medical English: Body & Health",ue:14},{n:"Patient Communication",ue:14},{n:"Medical Vocabulary",ue:14},{n:"Healthcare Systems",ue:10}],
      2:[{n:"Clinical Documentation",ue:14},{n:"Intercultural Communication",ue:12},{n:"Healthcare English vertieft",ue:14},{n:"Exam Preparation",ue:16}]
    },
    sport:{
      1:[{n:"Ergonomie & Rückenschule",ue:16},{n:"Entspannung & Stressbewältigung",ue:14},{n:"Erste Hilfe & Prävention",ue:14},{n:"Ausdauer & Kraft",ue:12}],
      2:[{n:"Gesundheitssport",ue:14},{n:"Pflegespezifische Bewegungsübungen",ue:14},{n:"Abschluss",ue:10}]
    }
  },
  Fachschule:{
    bwr:{
      1:[{n:"Betriebswirtschaft: Grundlagen",ue:20},{n:"Buchführung & Jahresabschluss",ue:22},{n:"Kosten- und Leistungsrechnung",ue:18},{n:"Personalwesen",ue:16},{n:"Marketing",ue:14}],
      2:[{n:"Investition & Finanzierung",ue:18},{n:"Unternehmensführung",ue:16},{n:"Controlling & Planung",ue:18},{n:"Projektmanagement",ue:14},{n:"Technikerarbeit / Abschlussarbeit",ue:24}]
    },
    technologie:{
      1:[{n:"Werkstofftechnik",ue:20},{n:"Fertigungstechnik",ue:20},{n:"Konstruktion & CAD",ue:18},{n:"Qualitätsmanagement",ue:14},{n:"Arbeitssicherheit",ue:12}],
      2:[{n:"Produktionssysteme",ue:18},{n:"CNC & Automation",ue:18},{n:"Projekttechnik",ue:16},{n:"Messtechnik",ue:14},{n:"Technikerarbeit",ue:24}]
    },
    mathe:{
      1:[{n:"Höhere Mathematik: Grundlagen",ue:18},{n:"Differentialrechnung",ue:18},{n:"Integralrechnung",ue:16},{n:"Statistik & Wahrscheinlichkeit",ue:14},{n:"Technische Anwendungen",ue:14}],
      2:[{n:"Numerische Methoden",ue:16},{n:"Lineare Algebra",ue:16},{n:"Technische Mathematik vertieft",ue:18},{n:"Anwendungsaufgaben",ue:14},{n:"Prüfungsvorbereitung",ue:14}]
    }
  },
  Fachakademie:{
    paedagogik:{
      1:[{n:"Grundlagen der Erziehungswissenschaft",ue:20},{n:"Entwicklungspsychologie",ue:18},{n:"Lerntheorien & Didaktik",ue:16},{n:"Sozialisation & Familie",ue:14},{n:"Inklusion Grundlagen",ue:14}],
      2:[{n:"Klinische Psychologie",ue:16},{n:"Frühpädagogik vertieft",ue:16},{n:"Forschungsmethoden",ue:14},{n:"Berufspraktikum Reflexion",ue:18},{n:"Abschlussarbeit",ue:26}]
    },
    deutsch:{
      1:[{n:"Wissenschaftliches Schreiben",ue:18},{n:"Fachsprachliche Kommunikation",ue:16},{n:"Literaturrecherche & Zitieren",ue:14},{n:"Präsentation & Vortrag",ue:14}],
      2:[{n:"Hausarbeit & Dokumentation",ue:18},{n:"Kommunikation im pädagogischen Alltag",ue:14},{n:"Fachsprache vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    sport:{
      1:[{n:"Bewegungspädagogik",ue:16},{n:"Sport & Spiel für Kinder",ue:16},{n:"Psychomotorik",ue:14},{n:"Entspannungspädagogik",ue:12}],
      2:[{n:"Bewegungsförderung für Kinder",ue:14},{n:"Inklusive Sportangebote",ue:14},{n:"Sporttherapie Grundlagen",ue:12},{n:"Abschlussreflexion",ue:10}]
    }
  },
  // === FÖRDERSCHULE (Förderschwerpunkt Lernen) — Quelle: ISB Bayern LehrplanPLUS ===
  Förderschule:{
    mathe:{
      1:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:22},{n:"Methodenkompetenzen",ue:16}],
      2:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:22},{n:"Methodenkompetenzen",ue:16}],
      3:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:22},{n:"Methodenkompetenzen",ue:16}],
      4:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:22},{n:"Methodenkompetenzen",ue:16}],
      5:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:26},{n:"Methodenkompetenzen",ue:20}],
      6:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:26},{n:"Methodenkompetenzen",ue:20}],
      7:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:26},{n:"Methodenkompetenzen",ue:20}],
      8:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:26},{n:"Methodenkompetenzen",ue:20}],
      9:[{n:"Zahlen und Operationen",ue:38},{n:"Raum und Form",ue:28},{n:"Größen und Messen",ue:28},{n:"Daten, Häufigkeit und Wahrscheinlichkeit",ue:26},{n:"Methodenkompetenzen",ue:20}]
    },
    deutsch:{
      1:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      2:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      3:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      4:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      5:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      6:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      7:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      8:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}],
      9:[{n:"Sprechen und Zuhören",ue:46},{n:"Lesen – mit Texten und Medien umgehen",ue:46},{n:"Schreiben",ue:42},{n:"Methodenkompetenzen",ue:26}]
    },
    englisch:{
      3:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      4:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      5:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      6:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      7:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      8:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}],
      9:[{n:"Mündliche Kompetenzen",ue:28},{n:"Schriftliche Kompetenzen",ue:22},{n:"Wortschatz, Formen und Funktionen",ue:22},{n:"Landeskundliche und interkulturelle Kompetenzen",ue:18},{n:"Methodenkompetenzen",ue:16}]
    },
    gpg:{
      5:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      6:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      7:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      8:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      9:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}]
    },
    nt:{
      5:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      6:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      7:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      8:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}],
      9:[{n:"Demokratie und Gesellschaft",ue:18},{n:"Mensch und Natur",ue:18},{n:"Zeit und Wandel",ue:18},{n:"Lebensraum und Mobilität",ue:18},{n:"Technik und Kultur",ue:16},{n:"Methodenkompetenzen",ue:12}]
    },
    sport:{
      1:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      2:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      3:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      4:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      5:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      6:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      7:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      8:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}],
      9:[{n:"Gesundheit und Fitness",ue:30},{n:"Fairness, Kooperation, Selbstkompetenz",ue:28},{n:"Spielen, gestalten und leisten",ue:32},{n:"Methodenkompetenzen",ue:18}]
    },
    musik:{
      1:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      2:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      3:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      4:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      5:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      6:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      7:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      8:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}],
      9:[{n:"Singen und Sprechen",ue:28},{n:"Mit Instrumenten spielen",ue:26},{n:"Hören und Gestalten von Musik",ue:26},{n:"Methodenkompetenzen",ue:20}]
    },
    kunst:{
      1:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      2:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      3:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      4:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      5:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      6:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      7:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      8:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}],
      9:[{n:"Gestalten",ue:32},{n:"Bilder und Objekte betrachten",ue:30},{n:"Methodenkompetenzen",ue:22}]
    },
    hsb:{
      5:[{n:"Arbeitsprozess",ue:20},{n:"Gestaltung",ue:20},{n:"Werkzeuge, Geräte und Maschinen",ue:18},{n:"Technisches Zeichnen",ue:16},{n:"Methodenkompetenzen",ue:14}],
      6:[{n:"Arbeitsprozess",ue:20},{n:"Gestaltung",ue:20},{n:"Werkzeuge, Geräte und Maschinen",ue:18},{n:"Technisches Zeichnen",ue:16},{n:"Methodenkompetenzen",ue:14}],
      7:[{n:"Arbeitsprozess",ue:20},{n:"Gestaltung",ue:20},{n:"Werkzeuge, Geräte und Maschinen",ue:18},{n:"Technisches Zeichnen",ue:16},{n:"Methodenkompetenzen",ue:14}],
      8:[{n:"Arbeitsprozess",ue:20},{n:"Gestaltung",ue:20},{n:"Werkzeuge, Geräte und Maschinen",ue:18},{n:"Technisches Zeichnen",ue:16},{n:"Methodenkompetenzen",ue:14}],
      9:[{n:"Arbeitsprozess",ue:20},{n:"Gestaltung",ue:20},{n:"Werkzeuge, Geräte und Maschinen",ue:18},{n:"Technisches Zeichnen",ue:16},{n:"Methodenkompetenzen",ue:14}]
    },
    religion:{
      1:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      2:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      3:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      4:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      5:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      6:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      7:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      8:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}],
      9:[{n:"Mensch und Welt",ue:14},{n:"Die Frage nach Gott",ue:14},{n:"Biblische Botschaft",ue:14},{n:"Jesus Christus",ue:14},{n:"Kirche und Gemeinde",ue:12},{n:"Andere Religionen – Weltanschauungen",ue:12},{n:"Methodenkompetenzen",ue:12}]
    },
    informatik:{
      7:[{n:"Hardware und Betriebssysteme",ue:22},{n:"Digitaler Informationsaustausch",ue:18},{n:"Datenverarbeitung",ue:18},{n:"Programmieren",ue:24},{n:"Methodenkompetenzen",ue:14}],
      8:[{n:"Hardware und Betriebssysteme",ue:22},{n:"Digitaler Informationsaustausch",ue:18},{n:"Datenverarbeitung",ue:18},{n:"Programmieren",ue:24},{n:"Methodenkompetenzen",ue:14}],
      9:[{n:"Hardware und Betriebssysteme",ue:22},{n:"Digitaler Informationsaustausch",ue:18},{n:"Datenverarbeitung",ue:18},{n:"Programmieren",ue:24},{n:"Methodenkompetenzen",ue:14}]
    }
  }
  },
  BW:{
  Gemeinschaftsschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:22},{n:"Geometrische Grundbegriffe",ue:18},{n:"Größen",ue:18},{n:"Daten",ue:12}],
      6:[{n:"Teilbarkeit & Brüche",ue:20},{n:"Dezimalzahlen",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionale Zuordnungen",ue:16},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent & Zins",ue:16},{n:"Geometrie: Dreiecke",ue:16},{n:"Zufall & Wahrscheinlichkeit",ue:12}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistik",ue:14},{n:"Sachrechnen",ue:12}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Quadratische Gleichungen",ue:16},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Wahrscheinlichkeit",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Analytische Geometrie",ue:16},{n:"Stochastik",ue:14},{n:"Prüfungsvorbereitung",ue:18},{n:"Finanzmathematik",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Werkrealschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie: Grundbegriffe",ue:16},{n:"Größen & Messen",ue:16},{n:"Daten",ue:10}],
      6:[{n:"Brüche",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Prozent- & Zinsrechnung",ue:20},{n:"Geometrie: Dreiecke",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Dreisatz",ue:10}],
      8:[{n:"Terme & Gleichungen vertieft",ue:18},{n:"Lineare Funktionen",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistische Auswertungen",ue:12},{n:"Sachrechnen",ue:10}],
      9:[{n:"Quadratische Gleichungen",ue:16},{n:"Körperberechnung",ue:16},{n:"Trigonometrie Einführung",ue:14},{n:"Sachbezogene Mathematik",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  BE:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Hauptschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie: Grundbegriffe",ue:16},{n:"Größen & Messen",ue:16},{n:"Daten",ue:10}],
      6:[{n:"Brüche",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Prozent- & Zinsrechnung",ue:20},{n:"Geometrie: Dreiecke",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Dreisatz",ue:10}],
      8:[{n:"Terme & Gleichungen vertieft",ue:18},{n:"Lineare Funktionen",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistische Auswertungen",ue:12},{n:"Sachrechnen",ue:10}],
      9:[{n:"Quadratische Gleichungen",ue:16},{n:"Körperberechnung",ue:16},{n:"Trigonometrie Einführung",ue:14},{n:"Sachbezogene Mathematik",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  BB:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Oberschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  HB:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Oberschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  HH:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Stadtteilschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  HE:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Hauptschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie: Grundbegriffe",ue:16},{n:"Größen & Messen",ue:16},{n:"Daten",ue:10}],
      6:[{n:"Brüche",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Prozent- & Zinsrechnung",ue:20},{n:"Geometrie: Dreiecke",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Dreisatz",ue:10}],
      8:[{n:"Terme & Gleichungen vertieft",ue:18},{n:"Lineare Funktionen",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistische Auswertungen",ue:12},{n:"Sachrechnen",ue:10}],
      9:[{n:"Quadratische Gleichungen",ue:16},{n:"Körperberechnung",ue:16},{n:"Trigonometrie Einführung",ue:14},{n:"Sachbezogene Mathematik",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  MV:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  NI:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Hauptschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie: Grundbegriffe",ue:16},{n:"Größen & Messen",ue:16},{n:"Daten",ue:10}],
      6:[{n:"Brüche",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Prozent- & Zinsrechnung",ue:20},{n:"Geometrie: Dreiecke",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Dreisatz",ue:10}],
      8:[{n:"Terme & Gleichungen vertieft",ue:18},{n:"Lineare Funktionen",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistische Auswertungen",ue:12},{n:"Sachrechnen",ue:10}],
      9:[{n:"Quadratische Gleichungen",ue:16},{n:"Körperberechnung",ue:16},{n:"Trigonometrie Einführung",ue:14},{n:"Sachbezogene Mathematik",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Oberschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  NW:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Hauptschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie: Grundbegriffe",ue:16},{n:"Größen & Messen",ue:16},{n:"Daten",ue:10}],
      6:[{n:"Brüche",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Geometrie: Flächen",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Prozent- & Zinsrechnung",ue:20},{n:"Geometrie: Dreiecke",ue:16},{n:"Terme & Gleichungen",ue:18},{n:"Dreisatz",ue:10}],
      8:[{n:"Terme & Gleichungen vertieft",ue:18},{n:"Lineare Funktionen",ue:16},{n:"Geometrie: Körper",ue:16},{n:"Statistische Auswertungen",ue:12},{n:"Sachrechnen",ue:10}],
      9:[{n:"Quadratische Gleichungen",ue:16},{n:"Körperberechnung",ue:16},{n:"Trigonometrie Einführung",ue:14},{n:"Sachbezogene Mathematik",ue:14},{n:"Prüfungsvorbereitung",ue:16}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  RP:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  SL:{
  Gemeinschaftsschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  SN:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Mittelschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Oberschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  ST:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Sekundarschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  SH:{
  Gemeinschaftsschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Realschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  TH:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Gesamtschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Regelschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  AT:{
  AHS:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Erzählen & Nacherzählen",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Wortlehre & Grammatik",ue:18},{n:"Rechtschreibung",ue:18},{n:"Sachbericht & Beschreibung",ue:12}],
      6:[{n:"Sachtexte erschließen",ue:16},{n:"Gedichte & lyrische Texte",ue:14},{n:"Grammatik vertieft",ue:16},{n:"Schriftlicher Aufsatz",ue:14},{n:"Sprechen & Präsentieren",ue:12}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Erörterung",ue:16},{n:"Sprachbetrachtung",ue:14},{n:"Kurzprosa",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textanalyse",ue:16},{n:"Dramenanalyse",ue:16},{n:"Sprachgeschichte",ue:12},{n:"Schreiben vertieft",ue:14},{n:"Präsentation",ue:10}],
      9:[{n:"Literatur & Gesellschaft",ue:14},{n:"Medienanalyse",ue:14},{n:"Stilistik",ue:12},{n:"Kreatives Schreiben",ue:12},{n:"Prüfungsvorbereitung",ue:12}],
      10:[{n:"Reifeprüfung: Textanalyse",ue:16},{n:"Reifeprüfung: Aufsatz",ue:16},{n:"Literarische Epochen",ue:12},{n:"Rhetorik",ue:10},{n:"Prüfungsvorbereitung",ue:12}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  NMS:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  },
  CH:{
  Gymnasium:{
    mathe:{
      5:[{n:"Natürliche Zahlen & Grundrechenarten",ue:24},{n:"Geometrie: Grundbegriffe",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:16},{n:"Daten & Häufigkeiten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:22},{n:"Dezimalbrüche",ue:16},{n:"Flächeninhalt & Umfang",ue:16},{n:"Proportionale Zuordnungen",ue:14},{n:"Achsensymmetrie",ue:12},{n:"Daten & Zufall",ue:10}],
      7:[{n:"Rationale Zahlen",ue:16},{n:"Terme & Gleichungen",ue:22},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke & Kongruenz",ue:18},{n:"Dreisatz & Proportionalität",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Potenzen & Wurzeln",ue:14},{n:"Lineare Funktionen",ue:20},{n:"Gleichungssysteme",ue:18},{n:"Geometrie: Aehnlichkeit",ue:16},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:20},{n:"Quadratische Gleichungen",ue:18},{n:"Trigonometrie",ue:18},{n:"Satz des Pythagoras vertieft",ue:12},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12}],
      10:[{n:"Exponentialfunktionen",ue:16},{n:"Logarithmus",ue:12},{n:"Analytische Geometrie",ue:18},{n:"Differentialrechnung Einführung",ue:20},{n:"Stochastik: Binomialverteilung",ue:16},{n:"Prüfungsvorbereitung",ue:12}]
    },
    deutsch:{
      5:[{n:"Aufsatz & Erzählen",ue:16},{n:"Lesen: Jugendbuch",ue:16},{n:"Grammatik: Wortarten",ue:16},{n:"Rechtschreibung",ue:18},{n:"Sprechen & Vortragen",ue:12}],
      6:[{n:"Beschreiben & Berichten",ue:14},{n:"Lesen: Sachtexte",ue:14},{n:"Grammatik: Satzlehre",ue:16},{n:"Rechtschreibung vertieft",ue:14},{n:"Kreatives Schreiben",ue:10}],
      7:[{n:"Inhaltsangabe & Analyse",ue:16},{n:"Argumentieren",ue:16},{n:"Grammatik vertieft",ue:12},{n:"Kurzgeschichten",ue:14},{n:"Medien & Kommunikation",ue:10}],
      8:[{n:"Erörterung",ue:16},{n:"Epische Texte",ue:14},{n:"Drama",ue:14},{n:"Sprache & Stil",ue:12},{n:"Präsentation",ue:10}],
      9:[{n:"Literaturgeschichte",ue:14},{n:"Textinterpretation",ue:14},{n:"Bewerbung & Lebenslauf",ue:12},{n:"Lyrik",ue:12},{n:"Prüfungsvorbereitung",ue:10}],
      10:[{n:"Vertiefung Textanalyse",ue:14},{n:"Rhetorische Mittel",ue:14},{n:"Schriftliche Prüfung",ue:16},{n:"Literarische Epochen",ue:12},{n:"Maturavorbereitung",ue:12}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  },
  Sekundarschule:{
    mathe:{
      5:[{n:"Natürliche Zahlen",ue:22},{n:"Grundrechenarten",ue:20},{n:"Geometrie",ue:18},{n:"Größen & Messen",ue:16},{n:"Ganze Zahlen",ue:12},{n:"Daten",ue:10}],
      6:[{n:"Brüche & Bruchrechnen",ue:20},{n:"Dezimalbrüche",ue:18},{n:"Flächeninhalte",ue:16},{n:"Proportionalität",ue:14},{n:"Daten & Zufall",ue:12}],
      7:[{n:"Rationale Zahlen",ue:18},{n:"Terme & Gleichungen",ue:20},{n:"Prozent- & Zinsrechnung",ue:18},{n:"Geometrie: Dreiecke",ue:14},{n:"Dreisatz & Zuordnungen",ue:12},{n:"Wahrscheinlichkeit",ue:10}],
      8:[{n:"Lineare Funktionen",ue:18},{n:"Gleichungssysteme",ue:16},{n:"Geometrie: Aehnlichkeit",ue:14},{n:"Körper: Oberfläche & Volumen",ue:16},{n:"Stochastik",ue:10}],
      9:[{n:"Quadratische Funktionen",ue:18},{n:"Trigonometrie",ue:16},{n:"Körperberechnung",ue:14},{n:"Stochastik vertieft",ue:12},{n:"Sachrechnen",ue:10}],
      10:[{n:"Exponentialfunktionen Einführung",ue:14},{n:"Analytische Geometrie",ue:14},{n:"Stochastik",ue:14},{n:"Sachrechnen vertieft",ue:14},{n:"Prüfungsvorbereitung",ue:18}]
    },
    deutsch:{
      5:[{n:"Erzählen & Kreatives Schreiben",ue:18},{n:"Lesen: Jugendbuch",ue:16},{n:"Sprachbetrachtung: Wortarten",ue:18},{n:"Rechtschreibung & Zeichensetzung",ue:18},{n:"Berichten & Beschreiben",ue:12}],
      6:[{n:"Vorgangsbeschreibung",ue:14},{n:"Lesen: Märchen & Fabeln",ue:16},{n:"Grammatik: Satzglieder & Satzarten",ue:18},{n:"Gedichte erschließen",ue:12},{n:"Rechtschreibstrategien",ue:14},{n:"Präsentieren",ue:10}],
      7:[{n:"Inhaltsangabe & Charakterisierung",ue:16},{n:"Argumentieren & Begründen",ue:16},{n:"Kurzgeschichten analysieren",ue:16},{n:"Sprachbetrachtung: Satzstrukturen",ue:14},{n:"Medien & Kommunikation",ue:12}],
      8:[{n:"Textgebundene Erörterung",ue:18},{n:"Epische Texte analysieren",ue:16},{n:"Drama erschließen",ue:16},{n:"Sprachreflexion & Stilistik",ue:12},{n:"Präsentation & Referat",ue:12}],
      9:[{n:"Lektüre: Roman analysieren",ue:18},{n:"Textinterpretation vertieft",ue:16},{n:"Sprachgeschichte & Varietäten",ue:12},{n:"Bewerbung & Lebenslauf",ue:14},{n:"Journalistische Textsorten",ue:10},{n:"Mündliche Prüfungsvorbereitung",ue:10}],
      10:[{n:"Rhetorische Analyse",ue:16},{n:"Lyrik: Analyse & Interpretation",ue:16},{n:"Prüfungsaufsatz",ue:18},{n:"Wissenschaftliche Texte",ue:12},{n:"Literarische Epochen",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    englisch:{
      5:[{n:"Welcome - Getting to know each other",ue:14},{n:"School & Friends",ue:16},{n:"Family & Home",ue:16},{n:"Free Time & Hobbies",ue:16},{n:"Animals & Nature",ue:12}],
      6:[{n:"Holidays & Travel",ue:16},{n:"Daily Routines",ue:14},{n:"Food & Shopping",ue:14},{n:"Health & Sports",ue:14},{n:"Media & Technology",ue:12},{n:"The English-speaking World",ue:12}],
      7:[{n:"Identity & Belonging",ue:16},{n:"Jobs & Career",ue:14},{n:"Environment & Nature",ue:14},{n:"Multiculturalism",ue:12},{n:"Media & Film",ue:12},{n:"USA - Land & People",ue:16}],
      8:[{n:"Global Issues",ue:16},{n:"Technology & Innovation",ue:14},{n:"Literature & Short Stories",ue:14},{n:"Coming of Age",ue:14},{n:"Australia & New Zealand",ue:14},{n:"Intercultural Communication",ue:12}],
      9:[{n:"The English-speaking World",ue:16},{n:"Globalization",ue:16},{n:"Media & Society",ue:14},{n:"Politics & Democracy",ue:14},{n:"Advanced Writing Skills",ue:14},{n:"Prüfungsvorbereitung",ue:16}],
      10:[{n:"Current Affairs & Society",ue:16},{n:"Cultural Studies",ue:14},{n:"Literature Analysis",ue:16},{n:"Academic Writing & Presentation",ue:14},{n:"Exam Preparation - Speaking",ue:12},{n:"Exam Preparation - Writing",ue:14}]
    },
    biologie:{
      5:[{n:"Vielfalt der Lebewesen",ue:16},{n:"Bau & Funktion der Pflanzenzelle",ue:14},{n:"Ökosystem Wald",ue:16},{n:"Stoff- & Energiewechsel der Pflanze",ue:14},{n:"Sinnesorgane & Wahrnehmung",ue:12}],
      6:[{n:"Tierkunde: Wirbeltiere",ue:16},{n:"Ernährung & Verdauung",ue:14},{n:"Ökosystem Gewässer",ue:14},{n:"Sexualerziehung & Pubertät",ue:12},{n:"Skelett & Bewegungsapparat",ue:12}],
      7:[{n:"Zellbiologie vertieft",ue:14},{n:"Genetik: Vererbung",ue:16},{n:"Evolution",ue:14},{n:"Ökologie: Biotop & Biozönose",ue:14},{n:"Verhaltensbiologie",ue:10}],
      8:[{n:"Immunsystem",ue:12},{n:"Atmung & Blutkreislauf",ue:16},{n:"Genetik vertieft",ue:16},{n:"Neurobiologie Einführung",ue:14},{n:"Stoff- & Energiewechsel",ue:12}],
      9:[{n:"Gentechnik & Biotechnologie",ue:14},{n:"Ökologie vertieft",ue:16},{n:"Neurobiologie vertieft",ue:14},{n:"Evolution vertieft",ue:14},{n:"Humanbiologie",ue:12}],
      10:[{n:"Molekularbiologie",ue:14},{n:"Ökosysteme & Klimawandel",ue:14},{n:"Aktuelle Themen der Biologie",ue:12},{n:"Fächerübergreifende Aspekte",ue:10},{n:"Prüfungsvorbereitung Biologie",ue:12}]
    },
    physik:{
      7:[{n:"Optik: Licht & Sehen",ue:16},{n:"Akustik: Schall & Hören",ue:12},{n:"Mechanik: Kräfte & Druck",ue:16},{n:"Elektrizitätslehre Einführung",ue:16},{n:"Wärmelehre",ue:12}],
      8:[{n:"Mechanik: Bewegung",ue:18},{n:"Elektrischer Strom",ue:16},{n:"Optik vertieft",ue:14},{n:"Magnetismus & Elektromagnetismus",ue:14},{n:"Energie & Energieerhaltung",ue:12}],
      9:[{n:"Mechanik: Arbeit, Leistung, Energie",ue:16},{n:"Schwingungen & Wellen",ue:14},{n:"Atombau & Atomkern",ue:14},{n:"Radioaktivität",ue:12},{n:"Elektrizität vertieft",ue:14}],
      10:[{n:"Elektromagnetische Induktion",ue:14},{n:"Relativitätstheorie Einführung",ue:12},{n:"Quantenphysik Einführung",ue:14},{n:"Kernphysik",ue:12},{n:"Prüfungsvorbereitung Physik",ue:12}]
    },
    chemie:{
      8:[{n:"Stoffe & Stoffgemische",ue:14},{n:"Atombau & PSE",ue:16},{n:"Chemische Bindungen",ue:14},{n:"Chemische Reaktionen",ue:16},{n:"Metallgewinnung & Korrosion",ue:12}],
      9:[{n:"Ionenverbindungen & Salze",ue:14},{n:"Säuren & Basen",ue:16},{n:"Redoxreaktionen",ue:14},{n:"Organische Chemie: Kohlenwasserstoffe",ue:16},{n:"Kunststoffe",ue:10}],
      10:[{n:"Organische Chemie vertieft",ue:16},{n:"Elektrochemie",ue:14},{n:"Reaktionskinetik",ue:12},{n:"Chemische Gleichgewichte",ue:12},{n:"Chemie & Umwelt",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    geschichte:{
      5:[{n:"Urgeschichte & Frühkulturen",ue:14},{n:"Antikes Griechenland",ue:16},{n:"Römisches Reich",ue:18},{n:"Frühes Mittelalter",ue:12}],
      6:[{n:"Mittelalter: Gesellschaft & Kirche",ue:16},{n:"Kreuzzüge & Stadtentwicklung",ue:14},{n:"Reformation & Glaubensspaltung",ue:14},{n:"Frühmoderne & Entdeckungen",ue:12}],
      7:[{n:"Absolutismus",ue:12},{n:"Aufklärung",ue:14},{n:"Amerikanische & Französische Revolution",ue:16},{n:"Industrielle Revolution",ue:14},{n:"Nationalismus",ue:10}],
      8:[{n:"Deutsches Kaiserreich",ue:14},{n:"Imperialismus & Kolonialismus",ue:12},{n:"Erster Weltkrieg",ue:14},{n:"Weimarer Republik",ue:14},{n:"Nationalsozialismus & Machtergreifung",ue:16}],
      9:[{n:"Zweiter Weltkrieg & Holocaust",ue:18},{n:"Nachkriegszeit & Besatzung",ue:14},{n:"Deutsche Teilung",ue:12},{n:"Kalter Krieg",ue:12},{n:"Dekolonisierung",ue:10}],
      10:[{n:"Bundesrepublik & DDR im Vergleich",ue:14},{n:"Wiedervereinigung",ue:12},{n:"Europäische Integration",ue:12},{n:"Globalisierung & Weltpolitik",ue:12},{n:"Aktuelle Geschichte",ue:10},{n:"Methodenkompetenz & Prüfung",ue:10}]
    },
    geografie:{
      5:[{n:"Orientierung im Raum & Kartenkunde",ue:16},{n:"Deutschland: Landschaften & Klima",ue:16},{n:"Europa: Überblick",ue:14},{n:"Wetter & Klima",ue:12},{n:"Natürliche Lebensgrundlagen",ue:10}],
      6:[{n:"Deutschland: Wirtschaft & Bevölkerung",ue:14},{n:"Europa: Staaten & Räume",ue:16},{n:"Küsten & Gebirge",ue:12},{n:"Landwirtschaft & Ernährung",ue:12},{n:"Tourismus & Freizeit",ue:10}],
      7:[{n:"Asien: Naturräume & Bevölkerung",ue:16},{n:"Klimazonen der Erde",ue:14},{n:"Wasser als Ressource",ue:12},{n:"Migration & Urbanisierung",ue:14},{n:"Entwicklungsländer",ue:12}],
      8:[{n:"Afrika: Natur & Entwicklung",ue:16},{n:"Südamerika & Tropischer Regenwald",ue:14},{n:"Globalisierung & Welthandel",ue:14},{n:"Energie & Rohstoffe",ue:12},{n:"Stadtentwicklung",ue:12}],
      9:[{n:"Nordamerika",ue:16},{n:"Klimawandel & Folgen",ue:14},{n:"Nachhaltigkeit & Umwelt",ue:14},{n:"Geopolitik & Konflikte",ue:12},{n:"Industrie & Wirtschaftsräume",ue:10}],
      10:[{n:"Weltregionen im Vergleich",ue:14},{n:"Demographischer Wandel",ue:12},{n:"Globale Herausforderungen",ue:14},{n:"Kartenprojekte & Methoden",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    franzoesisch:{
      6:[{n:"Bonjour - Kennenlernen",ue:16},{n:"La famille et les amis",ue:14},{n:"A lecole",ue:14},{n:"Mon quotidien",ue:14},{n:"Les loisirs",ue:12}],
      7:[{n:"Paris et la France",ue:16},{n:"Manger et vivre",ue:14},{n:"Les vacances",ue:14},{n:"Sortir et les medias",ue:12},{n:"Grammaire intermediaire",ue:14}],
      8:[{n:"Le monde francophone",ue:14},{n:"Le travail et les metiers",ue:14},{n:"Environnement",ue:12},{n:"Les jeunes et la societe",ue:14},{n:"Kommunikationsstrategien",ue:12}],
      9:[{n:"La France: politique et societe",ue:14},{n:"Actualites et medias",ue:14},{n:"Litterature: textes courts",ue:12},{n:"Europe francophone",ue:12},{n:"Prüfungsvorbereitung",ue:14}],
      10:[{n:"Themes actuels",ue:14},{n:"Analyse de textes",ue:14},{n:"Expression ecrite et orale",ue:12},{n:"Civilisation francaise",ue:12},{n:"Prüfungsvorbereitung",ue:14}]
    },
    musik:{
      5:[{n:"Musizieren: Grundlagen",ue:16},{n:"Rhythmus & Notation",ue:14},{n:"Musikgeschichte: Antike bis Barock",ue:12},{n:"Stimme & Singen",ue:12},{n:"Musikhören",ue:10}],
      6:[{n:"Tonarten & Harmonik",ue:14},{n:"Klassik & Romantik",ue:14},{n:"Instrumentenkunde",ue:12},{n:"Komponisten kennenlernen",ue:12},{n:"Musikgestaltung",ue:10}],
      7:[{n:"Musikalische Analyse",ue:14},{n:"Populäre Musik",ue:14},{n:"Musik & Gefühle",ue:12},{n:"Filmmusik",ue:12},{n:"Komposition & Arrangement",ue:12}],
      8:[{n:"Klassische Musik im Überblick",ue:14},{n:"Jazz & Blues",ue:12},{n:"Musikgeschichte 20. Jh.",ue:14},{n:"Medien & Musik",ue:12},{n:"Musik & Tanz",ue:10}],
      9:[{n:"Musik & Gesellschaft",ue:14},{n:"Stilistik & Analyse",ue:14},{n:"Musizieren vertieft",ue:12},{n:"Weltmusik",ue:12},{n:"Kreative Musikgestaltung",ue:10}],
      10:[{n:"Musik & Identität",ue:12},{n:"Analyse von Musikwerken",ue:14},{n:"Musikpraxis vertieft",ue:12},{n:"Musikgeschichte Überblick",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    kunst:{
      5:[{n:"Zeichnen: Grundlagen",ue:16},{n:"Farblehre",ue:14},{n:"Druckgrafik",ue:12},{n:"Kunstgeschichte: Einführung",ue:10},{n:"Collage & Plastik",ue:10}],
      6:[{n:"Perspektive & Raum",ue:16},{n:"Malerei: Techniken",ue:14},{n:"Kunstgeschichte: Renaissance",ue:12},{n:"Plastisches Gestalten",ue:12},{n:"Grafik & Design",ue:10}],
      7:[{n:"Menschendarstellung",ue:14},{n:"Fotografie & Medienkunst",ue:12},{n:"Kunstgeschichte: Barock",ue:12},{n:"Experimentelles Gestalten",ue:12},{n:"Architektur",ue:10}],
      8:[{n:"Kunstgeschichte: Impressionismus",ue:14},{n:"Abstrakte Kunst",ue:12},{n:"Illustration & Storytelling",ue:12},{n:"3D-Gestalten",ue:12},{n:"Digitale Medien",ue:10}],
      9:[{n:"Kunstgeschichte: Moderne",ue:14},{n:"Konzeptkunst",ue:12},{n:"Freie künstlerische Arbeit",ue:16},{n:"Kunst & Gesellschaft",ue:10},{n:"Portfolio & Präsentation",ue:10}],
      10:[{n:"Kunstgeschichte Überblick",ue:14},{n:"Kunst analysieren & interpretieren",ue:14},{n:"Eigene Werkmappe",ue:16},{n:"Ausstellungsgestaltung",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    },
    religion:{
      5:[{n:"Ich & meine Welt",ue:14},{n:"Bibel: Entstehung & Aufbau",ue:14},{n:"Glaube & Gemeinschaft",ue:12},{n:"Schöpfung & Verantwortung",ue:12},{n:"Weltreligionen: Überblick",ue:10}],
      6:[{n:"Jesus von Nazareth",ue:16},{n:"Kirche: Geschichte & Gegenwart",ue:14},{n:"Islam & Judentum",ue:14},{n:"Ethik: Gerechtigkeit",ue:12},{n:"Fragen nach Gott",ue:10}],
      7:[{n:"Bibel: Propheten",ue:12},{n:"Ethik: Menschenwürde",ue:14},{n:"Christentum weltweit",ue:12},{n:"Hinduismus & Buddhismus",ue:14},{n:"Tod & Auferstehung",ue:10}],
      8:[{n:"Kirchengeschichte",ue:14},{n:"Ethik: Bioethik",ue:14},{n:"Glaube & Vernunft",ue:12},{n:"Religionen im Dialog",ue:12},{n:"Gewissen & Entscheidung",ue:10}],
      9:[{n:"Ethik: Gerechtigkeit & Politik",ue:14},{n:"Theodizee",ue:12},{n:"Ökumene & Weltkirche",ue:12},{n:"Religionskritik",ue:12},{n:"Friedensethik",ue:10}],
      10:[{n:"Ethik vertieft",ue:14},{n:"Eschatologie",ue:12},{n:"Religiöse Biographien",ue:12},{n:"Religion & Gesellschaft heute",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    informatik:{
      7:[{n:"Informationsverarbeitung Grundlagen",ue:14},{n:"Betriebssysteme & Dateiorganisation",ue:12},{n:"Programmierung Einführung",ue:20},{n:"Textverarbeitung & Präsentation",ue:12}],
      8:[{n:"Algorithmen & Datenstrukturen",ue:18},{n:"Programmierung vertieft",ue:20},{n:"Tabellenkalkulation",ue:12},{n:"Internet & Datenschutz",ue:12}],
      9:[{n:"Objektorientierte Programmierung",ue:20},{n:"Datenbanken Einführung",ue:16},{n:"Netzwerke & Sicherheit",ue:14},{n:"Informatik & Gesellschaft",ue:10}],
      10:[{n:"Informatik vertieft",ue:18},{n:"KI & maschinelles Lernen",ue:14},{n:"Webentwicklung Einführung",ue:14},{n:"Prüfungsvorbereitung",ue:10}]
    },
    sport:{
      5:[{n:"Leichtathletik Grundlagen",ue:16},{n:"Turnen & Gymnasik",ue:14},{n:"Ballspiele Einführung",ue:14},{n:"Schwimmen",ue:14},{n:"Spielerziehung",ue:10}],
      6:[{n:"Leichtathletik vertieft",ue:14},{n:"Turnen: Boden & Geräte",ue:14},{n:"Volleyball / Basketball",ue:14},{n:"Schwimmen & Ausdauer",ue:14},{n:"Tanz & Bewegungsgestaltung",ue:10}],
      7:[{n:"Ausdauer & Fitness",ue:14},{n:"Turnen vertieft",ue:12},{n:"Rückschlagspiele",ue:14},{n:"Mannschaftssport",ue:14},{n:"Körper & Gesundheit",ue:10}],
      8:[{n:"Konditionstraining",ue:14},{n:"Sportspiele Taktik",ue:16},{n:"Turnen: Kür",ue:12},{n:"Kampfsport Einführung",ue:12},{n:"Freizeit & Trendsport",ue:10}],
      9:[{n:"Leistungssport & Wettkampf",ue:14},{n:"Mannschaftssport vertieft",ue:14},{n:"Gesundheitssport",ue:12},{n:"Sporttheorie Einführung",ue:12},{n:"Wahlsport",ue:10}],
      10:[{n:"Abiturvorb.: Leichtathletik",ue:12},{n:"Abiturvorb.: Mannschaftssport",ue:12},{n:"Sporttheorie",ue:12},{n:"Ausdauer & Kraft",ue:12},{n:"Prüfungsvorbereitung",ue:10}]
    },
    wib:{
      7:[{n:"Wirtschaft im Alltag",ue:14},{n:"Berufsfelder erkunden",ue:12},{n:"Haushalt & Finanzen",ue:12},{n:"Konsum & Werbung",ue:10}],
      8:[{n:"Unternehmen & Betrieb",ue:14},{n:"Arbeit & Arbeitsrecht",ue:12},{n:"Sozialversicherung",ue:10},{n:"Berufsorientierung",ue:14}],
      9:[{n:"Wirtschaftsordnung BRD",ue:14},{n:"Globale Wirtschaft",ue:12},{n:"Bewerbung & Praktikum",ue:14},{n:"Verbraucherschutz",ue:10}],
      10:[{n:"Ausbildung & Studium",ue:14},{n:"Wirtschaft & Politik",ue:12},{n:"Nachhaltiges Wirtschaften",ue:10},{n:"Prüfungsvorbereitung",ue:10}]
    }
  }
  }
};

function extractJgst(className){const m=className.match(/(\d+)/);return m?m[1]:null}

// Live-Lehrplan-Cache: wird pro Kombination (BL|SA|Fach|Jgst) befüllt
let _lehrplanLiveCache = { key: null, lbs: null };

function _lehrplanCacheKey(){
  const bl=state.bundesland, sa=state.schulart;
  const fachId=document.getElementById('jp-fach')?.value;
  const klasseId=document.getElementById('jp-klasse')?.value;
  if(!bl||!sa||!fachId||!klasseId) return null;
  const klasse=getKlasse(klasseId);
  const jgst=klasse?extractJgst(klasse.name):null;
  const fach=getFach(fachId);
  if(!jgst||!fach) return null;
  return `${bl}|${sa}|${fach.name}|${jgst}`;
}

async function _loadLehrplanLive(){
  const key=_lehrplanCacheKey();
  if(!key || _lehrplanLiveCache.key===key) return; // Cache aktuell
  const [bl,sa,fachName,jgst]=key.split('|');
  try {
    const resp=await fetch(TS_API+'/api/lehrplan',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TS_API_TOKEN},
      body:JSON.stringify({bundesland:bl,schulart:sa,fach:fachName,jgst})
    });
    if(!resp.ok) return;
    const data=await resp.json();
    if(data.lernbereiche&&data.lernbereiche.length>0){
      // Gleichmäßige UE-Schätzung; Nutzer kann per +/− anpassen
      const klasseId=document.getElementById('jp-klasse')?.value;
      const fachId=document.getElementById('jp-fach')?.value;
      const totalUE=(klasseId&&fachId)?getSchoolWeeks(klasseId,fachId).reduce((s,w)=>s+(w.isFerien?0:(w.ue||0)),0):160;
      const ueEach=Math.max(10,Math.round(totalUE/data.lernbereiche.length));
      _lehrplanLiveCache.key=key;
      _lehrplanLiveCache.lbs=data.lernbereiche.map(n=>({n,ue:ueEach}));
    }
  } catch(e){ /* silent — Fallback auf lokale DB */ }
}

function getLehrplanForSelection(){
  // 1. Live-Cache bevorzugen (aktuell vom ISB)
  const key=_lehrplanCacheKey();
  if(key && _lehrplanLiveCache.key===key && _lehrplanLiveCache.lbs){
    return _lehrplanLiveCache.lbs;
  }
  // 2. Fallback: lokale DB
  const bl=state.bundesland,sa=state.schulart,fachId=document.getElementById('jp-fach').value;
  const klasseId=document.getElementById('jp-klasse').value;
  if(!bl||!sa||!fachId||!klasseId) return null;
  const klasse=getKlasse(klasseId);
  if(!klasse) return null;
  const jgst=extractJgst(klasse.name);
  if(!jgst) return null;
  const blCode = Object.entries({
    'Baden-Württemberg':'BW','Bayern':'BY','Berlin':'BE','Brandenburg':'BB','Bremen':'HB','Hamburg':'HH',
    'Hessen':'HE','Mecklenburg-Vorpommern':'MV','Niedersachsen':'NI','Nordrhein-Westfalen':'NW',
    'Rheinland-Pfalz':'RP','Saarland':'SL','Sachsen':'SN','Sachsen-Anhalt':'ST','Schleswig-Holstein':'SH','Thüringen':'TH',
    'Österreich':'AT','Schweiz':'CH'
  }).find(([k])=>k===bl);
  if(!blCode) return null;
  const blData = LEHRPLAN_DB[blCode[1]];
  if(!blData) return null;
  let saData = blData[sa];
  if(!saData || !saData[fachId]) return null;
  return saData[fachId][jgst] || null;
}

async function renderKiPanel(){
  const container=document.getElementById('pl-ki-lernbereiche');
  const infoEl=document.getElementById('pl-ki-lehrplan-info');
  const plan=getJpPlan();

  // Fetch live Lehrplan wenn noch nicht gecacht
  const key=_lehrplanCacheKey();
  if(key && _lehrplanLiveCache.key!==key){
    infoEl.textContent='🔄 Lehrplan wird geladen…';
    container.innerHTML='<div style="font-size:.78rem;color:var(--ts-text-muted);padding:12px 0">Lade aktuellen Lehrplan vom ISB…</div>';
    await _loadLehrplanLive();
  }

  const lbs=getLehrplanForSelection();

  if(!lbs){
    infoEl.textContent='Kein Lehrplan gefunden für diese Auswahl.';
    container.innerHTML='<div style="font-size:.78rem;color:var(--ts-text-muted);padding:8px 0">Wähle Klasse + Fach, um Lehrplan-Inhalte zu laden.</div>';
    return;
  }
  
  const klasse=getKlasse(document.getElementById('jp-klasse').value);
  const fach=getFach(document.getElementById('jp-fach').value);
  const isLive=key&&_lehrplanLiveCache.key===key&&_lehrplanLiveCache.lbs;
  infoEl.innerHTML=`${esc(state.bundesland||'')} · ${esc(state.schulart||'')} · Jgst. ${klasse?extractJgst(klasse.name):''} · ${fach?esc(fach.name):''}${isLive?' <span style="color:var(--ts-teal);font-size:.7rem">✓ aktuell</span>':`<span style="font-size:.7rem;color:var(--ts-text-muted)"> · lokale DB</span>`}`;
  
  const existingNames = plan ? plan.lernbereiche.map(l=>l.name) : [];
  
  let html='<div style="font-size:.72rem;color:var(--ts-text-muted);margin-bottom:8px">Greife einen Punkt und ziehe ihn in den Kalender, oder nutze die Buttons unten.</div>';
  
  lbs.forEach((lb,i)=>{
    const col=JP_LB_COLORS[i%JP_LB_COLORS.length];
    const exists=existingNames.includes(lb.n);
    const existing=plan?plan.lernbereiche.find(l=>l.name===lb.n):null;
    const ue=existing?existing.ue:lb.ue;
    
    html+=`<div class="pl-ki-item${exists?' in-plan':''} pl-draggable" onmousedown="dragFromPanel(${i},event)" ontouchstart="dragFromPanel(${i},event)">
      <div class="pl-ki-dot" style="background:${col}"></div>
      <div class="pl-ki-name">${lb.n}</div>
      <div class="pl-ki-ue-adj">
        <button onclick="event.stopPropagation();adjustKiUe(${i},-1)">−</button>
        <span id="ki-ue-${i}">${ue}</span>
        <button onclick="event.stopPropagation();adjustKiUe(${i},1)">+</button>
      </div>
      ${exists?'<span style="color:var(--ts-teal);font-size:.7rem;flex-shrink:0">✓</span>':''}
    </div>`;
  });
  
  container.innerHTML=html;
}

function adjustKiUe(idx, dir){
  const lbs=getLehrplanForSelection(); if(!lbs||!lbs[idx]) return;
  const plan=getJpPlan();
  const existing=plan?plan.lernbereiche.find(l=>l.name===lbs[idx].n):null;
  
  const el=document.getElementById('ki-ue-'+idx);
  if(!el) return;
  let val=parseInt(el.textContent)||lbs[idx].ue;
  val=Math.max(1,val+dir);
  el.textContent=val;
  
  // Update existing LB if already in plan
  if(existing){existing.ue=val;_scheduleCache.hash='';saveJpData();renderPlanung();}
  // Update the source data too for next drag
  lbs[idx].ue=val;
}

function addFromLehrplan(idx){
  const lbs=getLehrplanForSelection();
  if(!lbs||!lbs[idx]) return;
  const plan=getJpPlan();if(!plan) return;
  const lb=lbs[idx];
  if(plan.lernbereiche.some(l=>l.name===lb.n)) return;
  // Pin after last existing LB's end
  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  const weeks=getSchoolWeeks(klasseId,fachId);
  const schedule=computeSchedule(plan,weeks);
  let pin=0;
  schedule.forEach((s,i)=>{if(s.assignments.length && i>=pin) pin=i+1});
  // Skip ferien
  while(pin<weeks.length && weeks[pin].isFerien) pin++;
  plan.lernbereiche.push({id:'lb_'+Date.now()+'_'+idx,name:lb.n,ue:lb.ue,notes:'',color:JP_LB_COLORS[plan.lernbereiche.length%JP_LB_COLORS.length],sequenzen:[],pinWeek:pin});
  _scheduleCache.hash='';_scheduleCache.hash='';saveJpData();renderPlanung();renderKiPanel();
}

function addAllFromLehrplan(){
  const lbs=getLehrplanForSelection();if(!lbs) return;
  const plan=getJpPlan();if(!plan) return;
  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  
  lbs.forEach((lb,i)=>{
    if(plan.lernbereiche.some(l=>l.name===lb.n)) return;
    // Compute current schedule to find next free slot
    const weeks=getSchoolWeeks(klasseId,fachId);
    const schedule=computeSchedule(plan,weeks);
    let pin=0;
    schedule.forEach((s,i)=>{if(s.assignments.length && i>=pin) pin=i+1});
    while(pin<weeks.length && weeks[pin].isFerien) pin++;
    plan.lernbereiche.push({id:'lb_'+Date.now()+'_'+i,name:lb.n,ue:lb.ue,notes:'',color:JP_LB_COLORS[(plan.lernbereiche.length)%JP_LB_COLORS.length],sequenzen:[],pinWeek:pin});
  });
  _scheduleCache.hash='';_scheduleCache.hash='';saveJpData();renderPlanung();renderKiPanel();
}

// Auto-distribute: set pinWeeks sequentially so LBs flow one after another
function autoDistribute(){
  const plan=getJpPlan();if(!plan) return;
  jpSchoolWeeks=null; // Cache invalidieren (ggf. neue Feriendaten)
  // Add all Lehrplan LBs first
  const lbs=getLehrplanForSelection();
  if(lbs) lbs.forEach((lb,i)=>{
    if(!plan.lernbereiche.some(l=>l.name===lb.n)){
      plan.lernbereiche.push({id:'lb_'+Date.now()+'_'+i,name:lb.n,ue:lb.ue,notes:'',color:JP_LB_COLORS[plan.lernbereiche.length%JP_LB_COLORS.length],sequenzen:[]});
    }
  });
  if(!plan.lernbereiche.length){alert('Füge zuerst Lernbereiche hinzu.');return}

  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  const weeks=getSchoolWeeks(klasseId,fachId);
  const totalAvail=weeks.reduce((s,w)=>s+(w.isFerien?0:(w.ue||0)),0);

  // Skaliere LB-UEs proportional auf verfügbare UEs, damit kein Überlauf entsteht
  const totalLbUe=plan.lernbereiche.reduce((s,lb)=>s+(lb.ue||0),0);
  if(totalLbUe>0 && totalAvail>0 && totalLbUe!==totalAvail){
    const factor=totalAvail/totalLbUe;
    let distributed=0;
    plan.lernbereiche.forEach((lb,i)=>{
      if(i<plan.lernbereiche.length-1){
        lb.ue=Math.max(1,Math.round((lb.ue||0)*factor));
        distributed+=lb.ue;
      } else {
        lb.ue=Math.max(1,totalAvail-distributed); // letzter LB füllt Rest exakt
      }
    });
  }

  // Assign pinWeeks sequentially — weekRemaining verfolgt, ob eine Woche noch Kapazität hat.
  // Endet ein LB mitten in einer Woche, startet der nächste in DERSELBEN Woche (kein Versatz).
  let pin=0;
  let weekRemaining=0;
  plan.lernbereiche.forEach(lb=>{
    // Zur nächsten Woche mit verfügbaren UEs vorrücken
    while(pin<weeks.length && (weeks[pin].isFerien || (weekRemaining<=0 && weeks[pin].ue<=0))){
      weekRemaining=0; pin++;
    }
    if(weekRemaining<=0 && pin<weeks.length) weekRemaining=weeks[pin].ue||0;
    lb.pinWeek=pin;
    let rem=lb.ue||0;
    while(rem>0 && pin<weeks.length){
      if(weeks[pin].isFerien){ weekRemaining=0; pin++; continue; }
      if(weekRemaining<=0){ pin++; weekRemaining=pin<weeks.length?weeks[pin].ue||0:0; continue; }
      const use=Math.min(rem,weekRemaining);
      weekRemaining-=use;
      rem-=use;
      // Woche voll verbraucht: zur nächsten
      if(rem>0 && weekRemaining<=0){ pin++; weekRemaining=pin<weeks.length?weeks[pin].ue||0:0; }
    }
    // Woche komplett verbraucht → nächster LB fängt neue Woche an
    if(weekRemaining<=0 && pin<weeks.length){ pin++; weekRemaining=pin<weeks.length?weeks[pin].ue||0:0; }
    // Sonst: weekRemaining > 0 → nächster LB startet in derselben Woche (Restkapazität wird genutzt)
  });

  _scheduleCache.hash='';saveJpData();renderPlanung();renderKiPanel();
}

function clearAllLBs(){
  if(!confirm('Alle Lernbereiche löschen?')) return;
  const plan=getJpPlan();if(!plan) return;
  plan.lernbereiche=[];
  _scheduleCache.hash='';_scheduleCache.hash='';saveJpData();renderPlanung();renderKiPanel();
}

// ═══ DRAG & DROP ENGINE (mouse + touch) ═══
let dragState = null; // {type:'lb'|'lp', lbId?, lpIdx?, name, ue, color, ghost, startX, startY}

function initDrag(el, type, data, evt){
  evt.preventDefault();
  evt.stopPropagation();
  const touch = evt.touches ? evt.touches[0] : evt;
  const startX = touch.clientX, startY = touch.clientY;
  let started = false;
  let ghost = null;
  let scrollRAF = null;
  const scrollEl = document.getElementById('content');
  const SCROLL_ZONE = 90;   // px near top/bottom edge that triggers scroll
  const SCROLL_MAX  = 18;   // max px per frame

  function stopAutoScroll(){ if(scrollRAF){ cancelAnimationFrame(scrollRAF); scrollRAF=null; } }

  function startAutoScroll(clientY){
    stopAutoScroll();
    const viewH = window.innerHeight;
    let speed = 0;
    if(clientY < SCROLL_ZONE)              speed = -SCROLL_MAX * (1 - clientY / SCROLL_ZONE);
    else if(clientY > viewH - SCROLL_ZONE) speed =  SCROLL_MAX * ((clientY - (viewH - SCROLL_ZONE)) / SCROLL_ZONE);
    if(speed === 0) return;
    function tick(){
      if(!scrollEl) return;
      scrollEl.scrollTop += speed;
      // Re-highlight drop target after scroll
      if(ghost && lastClientY !== null){
        document.querySelectorAll('.pl-wk.drop-target-over').forEach(e=>e.classList.remove('drop-target-over'));
        ghost.style.display='none';
        const hit = document.elementFromPoint(lastClientX, lastClientY);
        ghost.style.display='';
        if(hit){ const wk=hit.closest('.pl-wk.drop-target'); if(wk) wk.classList.add('drop-target-over'); }
      }
      scrollRAF = requestAnimationFrame(tick);
    }
    scrollRAF = requestAnimationFrame(tick);
  }

  let lastClientX = startX, lastClientY = startY;

  function onMove(e){
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if(!started && Math.abs(dx)+Math.abs(dy) < 8) return;
    e.preventDefault();
    if(!started){
      started = true;
      ghost = document.createElement('div');
      ghost.className = 'pl-drag-ghost';
      ghost.textContent = data.name + ' (' + data.ue + ' UE)';
      ghost.style.background = data.color || '#3BA89B';
      document.body.appendChild(ghost);
      document.body.classList.add('is-dragging');
      document.querySelectorAll('.pl-wk:not(.ferien)').forEach(wk => wk.classList.add('drop-target'));
      dragState = { ...data, type, ghost, el };
    }
    lastClientX = t.clientX;
    lastClientY = t.clientY;
    ghost.style.left = (t.clientX - 20) + 'px';
    ghost.style.top  = (t.clientY - 40) + 'px';

    document.querySelectorAll('.pl-wk.drop-target-over').forEach(e=>e.classList.remove('drop-target-over'));
    ghost.style.display='none';
    const target = document.elementFromPoint(t.clientX, t.clientY);
    ghost.style.display='';
    if(target){ const wk=target.closest('.pl-wk.drop-target'); if(wk) wk.classList.add('drop-target-over'); }

    startAutoScroll(t.clientY);
  }

  function onEnd(e){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    stopAutoScroll();

    if(!started) return; // was a click, let onclick handle it

    const t = e.changedTouches ? e.changedTouches[0] : e;
    ghost.style.display='none';
    const target = document.elementFromPoint(t.clientX, t.clientY);
    ghost.remove();
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.pl-wk.drop-target,.pl-wk.drop-target-over').forEach(e=>e.classList.remove('drop-target','drop-target-over'));

    const wk = target ? target.closest('.pl-wk[data-wi]') : null;
    if(wk) executeDrop(parseInt(wk.dataset.wi));
    dragState = null;
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
}

function executeDrop(wi){
  if(!dragState) return;
  const plan = getJpPlan(); if(!plan) return;
  
  if(dragState.type === 'lb'){
    // Move existing LB to new pinWeek
    const lb = plan.lernbereiche.find(l=>l.id===dragState.lbId);
    if(lb) lb.pinWeek = wi;
  } else if(dragState.type === 'lp'){
    // Add from Lehrplan and pin to this week
    if(!plan.lernbereiche.some(l=>l.name===dragState.name)){
      // Gespeicherte Position wiederherstellen, wenn vorhanden
      const savedPin = plan._savedPositions?.[dragState.name];
      plan.lernbereiche.push({
        id:'lb_'+Date.now(), name:dragState.name, ue:dragState.ue,
        notes:'', color:dragState.color, sequenzen:[],
        pinWeek: savedPin !== undefined ? savedPin : wi
      });
    } else {
      // Already exists — just move its pin
      const lb = plan.lernbereiche.find(l=>l.name===dragState.name);
      if(lb) lb.pinWeek = wi;
    }
  } else if(dragState.type === 'seq'){
    // Reorder sequence within LB based on drop position
    const lb = plan.lernbereiche.find(l=>l.id===dragState.lbId);
    if(lb && lb.sequenzen && dragState.seqIdx >= 0){
      const [seq] = lb.sequenzen.splice(dragState.seqIdx, 1);
      // Calculate insert position based on target week
      const weeks = getSchoolWeeks(document.getElementById('jp-klasse').value, document.getElementById('jp-fach').value);
      const schedule = computeSchedule(plan, weeks);
      const targetA = schedule[wi]?.assignments.find(a=>a.lbId===dragState.lbId);
      let insertAt = targetA && targetA.seqIdx >= 0 ? targetA.seqIdx : lb.sequenzen.length;
      lb.sequenzen.splice(insertAt, 0, seq);
    }
  }
  
  saveJpData(); renderPlanung(); renderKiPanel();
}

// Start drag from KI panel item
function dragFromPanel(idx, evt){
  const lbs = getLehrplanForSelection(); if(!lbs||!lbs[idx]) return;
  const lb = lbs[idx];
  const plan = getJpPlan();
  const existing = plan ? plan.lernbereiche.find(l=>l.name===lb.n) : null;
  const col = existing ? existing.color : JP_LB_COLORS[idx % JP_LB_COLORS.length];
  // Check UE from panel (may have been adjusted)
  const ueEl = document.getElementById('ki-ue-'+idx);
  const ue = ueEl ? parseInt(ueEl.textContent)||lb.ue : lb.ue;
  initDrag(evt.target, existing ? 'lb' : 'lp', {
    name: lb.n, ue, color: col, lbId: existing ? existing.id : null, lpIdx: idx
  }, evt);
}

// Start drag from calendar LB bar
function dragLbFromGrid(lbId, evt){
  const plan = getJpPlan(); if(!plan) return;
  const lb = plan.lernbereiche.find(l=>l.id===lbId);
  if(!lb) return;
  initDrag(evt.target, 'lb', { lbId, name:lb.name, ue:lb.ue, color:lb.color||'var(--ts-teal)' }, evt);
}

// Start drag from calendar seq block
function dragSeqFromGrid(lbId, seqIdx, evt){
  const plan = getJpPlan(); if(!plan) return;
  const lb = plan.lernbereiche.find(l=>l.id===lbId);
  if(!lb||!lb.sequenzen[seqIdx]) return;
  const s = lb.sequenzen[seqIdx];
  initDrag(evt.target, 'seq', { lbId, seqIdx, name:s.title, ue:s.ue, color:lb.color||'var(--ts-teal)' }, evt);
}

async function kiDistribute(){
  const klasseId = document.getElementById('jp-klasse')?.value;
  const fachId   = document.getElementById('jp-fach')?.value;
  if (!klasseId || !fachId) { alert('Bitte Klasse und Fach wählen.'); return; }

  const klasse = getKlasse(klasseId);
  const fach   = getFach(fachId);
  const weeks  = getSchoolWeeks(klasseId, fachId);
  const totalUE = weeks.reduce((s, w) => s + (w.ue || 0), 0);

  // Stundenplan-Check: ohne konfigurierte UE kann nichts platziert werden
  if (totalUE === 0) {
    _showToast('Bitte erst den Stundenplan unter Mein Profil einrichten (UE pro Woche für dieses Fach).', 'error');
    return;
  }

  // Show loading on button
  const btn = document.querySelector('[onclick="kiDistribute()"]');
  if (btn) { btn.textContent = '⏳ KI denkt...'; btn.disabled = true; }

  // Worker fetches current Lehrplan live from official source (ISB, etc.)
  const result = await callKI('jahresplanung', {
    bundesland:    state.bundesland || '',
    schulart:      state.schulart || '',
    fach:          fach?.name || '',
    jgst:          klasse ? extractJgst(klasse.name) : '',
    wochenstunden: countWeeklyUE(),
    totalUE,
    schwerpunkte:  state.schwerpunkte || '',
    schulbuch:     getJpPlan()?.schulbuch || '',
  });

  if (btn) { btn.textContent = '🧠 Mit KI-Hilfe verteilen'; btn.disabled = false; }

  if (!result) { alert('KI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen.'); return; }
  if (!Array.isArray(result)) { alert('KI-Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen.'); console.error('KI result:', result); return; }

  if (result && Array.isArray(result)) {
    const plan = getJpPlan();
    if (!plan) return;
    if (!confirm(`Die KI schlägt ${result.length} Lernbereiche vor. Bestehende Lernbereiche ersetzen?`)) return;

    plan.lernbereiche = [];
    let pinCursor = 0;
    result.forEach((lb, i) => {
      const newLb = {
        id: 'lb_' + Date.now() + '_' + i,
        name: lb.name,
        ue: lb.ue || 10,
        notes: '',
        color: JP_LB_COLORS[i % JP_LB_COLORS.length],
        sequenzen: (lb.sequenzen || []).map(s => ({ title: s.title || s.name || '', ue: s.ue || 2 })),
        pinWeek: pinCursor,
      };
      plan.lernbereiche.push(newLb);
      let rem = newLb.ue;
      while (rem > 0 && pinCursor < weeks.length) {
        if (!weeks[pinCursor].isFerien && (weeks[pinCursor].ue || 0) > 0) rem -= weeks[pinCursor].ue;
        pinCursor++;
      }
    });

    _scheduleCache.hash = '';
    saveJpData();
    renderPlanung();
    renderKiPanel();
  }
}

// Move LB via ▲▼ buttons
function moveLb(idx, dir){
  const plan=getJpPlan();if(!plan) return;
  const lbs=plan.lernbereiche;
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=lbs.length) return;
  const pinA=lbs[idx].pinWeek;
  const pinB=lbs[newIdx].pinWeek;
  lbs[idx].pinWeek=pinB;
  lbs[newIdx].pinWeek=pinA;
  [lbs[idx],lbs[newIdx]]=[lbs[newIdx],lbs[idx]];
  _scheduleCache.hash='';saveJpData();renderPlanung();
}

// ═══ MAIN RENDER ═══
function renderPlanung(){
  const container=document.getElementById('jp-content');
  const scrollParent=document.getElementById('content');
  const savedScroll=scrollParent?scrollParent.scrollTop:0;
  const key=getJpKey();
  if(!key){
    container.innerHTML='<div class="pl-empty"><div class="pl-empty-icon">📋</div><div style="font-size:.9rem;max-width:400px;margin:0 auto">Wähle eine Klasse und ein Fach, um die Jahresplanung zu starten.</div></div>';
    return;
  }
  
  const plan=getJpPlan();
  const lbs=plan.lernbereiche;
  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  const weeks=getSchoolWeeks(klasseId,fachId);
  const weeklyUE=countWeeklyUE();
  const totalAvail=weeks.reduce((s,w)=>s+w.ue,0);
  const totalPlanned=lbs.reduce((s,l)=>s+(l.ue||0),0);
  const pct=totalAvail>0?Math.min(100,Math.round(totalPlanned/totalAvail*100)):0;
  const overBudget=totalPlanned>totalAvail&&totalAvail>0;
  const fach=getFach(fachId);
  const fachColor=fach?fach.color:'var(--ts-teal)';
  
  const today=new Date();
  const todayStr=dateStr(today);
  const pruefungen = plan.pruefungen || {};

  const _pruefTag = wi => {
    const p = pruefungen[wi];
    if(p) return `<div class="pl-pruef-bar" onclick="event.stopPropagation();jpOpenPruefungModal(${wi})" title="Klicken zum Bearbeiten / Entfernen">📝 ${p.label||'Prüfung'}${p.thema?' <span class="pl-pruef-note">'+p.thema+'</span>':''}${p.note?' <span class="pl-pruef-note">· '+p.note+'</span>':''}</div>`;
    return `<div class="pl-pruef-add" onclick="event.stopPropagation();jpOpenPruefungModal(${wi})" title="Klausur / Prüfung / Probe hinzufügen">+ 📝</div>`;
  };

  let html='';
  
  // Compute schedule
  const schedule = computeSchedule(plan, weeks);
  const spans = getLbWeekSpans(plan, schedule, weeks);
  const totalScheduledUE = Object.values(spans).reduce((s,sp)=>s+sp.totalScheduled,0);
  
  // Budget
  html+=`<div class="pl-budget">
    <div class="pl-budget-card"><div class="pl-budget-val">${weeklyUE}</div><div class="pl-budget-label">UE/Wo</div></div>
    <div class="pl-budget-card"><div class="pl-budget-val" style="color:${overBudget?'var(--ts-error)':'var(--ts-navy)'}">${totalPlanned}</div><div class="pl-budget-label">geplant</div></div>
    <div class="pl-budget-card"><div class="pl-budget-val">${totalAvail}</div><div class="pl-budget-label">verfügbar</div></div>
    <div class="pl-budget-bar"><div class="pl-budget-fill" style="width:${pct}%;background:${overBudget?'var(--ts-error)':fachColor}"></div></div>
  </div>`;
  
  // Week grid
  html+='<div class="pl-weeks">';
  let lastMonth=-1;
  
  weeks.forEach((w,wi)=>{
    if(w.monday.getMonth()!==lastMonth){
      lastMonth=w.monday.getMonth();
      html+=`<div class="pl-month-sep">${MONATE[lastMonth]} ${w.monday.getFullYear()}<div class="pl-month-sep-line"></div></div>`;
    }
    
    const isCurrent=todayStr>=dateStr(w.monday)&&todayStr<=dateStr(w.friday);
    const _pd=n=>String(n).padStart(2,'0');
    const dateLabel=`${_pd(w.monday.getDate())}.${_pd(w.monday.getMonth()+1)}.–${_pd(w.friday.getDate())}.${_pd(w.friday.getMonth()+1)}.`;
    const sched = schedule[wi];
    
    // Blocking events for this week
    const _wkBlockEvts = getBlockingEventsForWeek(w);
    const _evtBanners = _wkBlockEvts.map(e => {
      const et = (typeof EVENT_TYPES !== 'undefined') ? EVENT_TYPES.find(t=>t.id===e.type) : null;
      const icon = et ? et.icon : '📌';
      const col  = et ? et.color : '#9AABB8';
      const name = e.type==='custom' && e.customName ? e.customName : (et ? et.name : e.title);
      const blockedUE = (function(){
        let b=0;
        for(let wd=0;wd<5;wd++){
          if(!w.slotsPerDay||!w.slotsPerDay[wd]) continue;
          const dd=new Date(w.monday); dd.setDate(dd.getDate()+wd);
          const ds=dateStr(dd);
          const end=(e.dateEnd&&e.dateEnd>=e.date)?e.dateEnd:e.date;
          if(ds>=e.date&&ds<=end) b+=w.slotsPerDay[wd];
        }
        return b;
      })();
      return `<div class="pl-wk-evt-banner" style="background:${col}20;border-left:3px solid ${col};color:${col}" onclick="event.stopPropagation();openEventModal(null,'${e.id}')" title="${e.title}">${icon} ${name}${blockedUE?' · −'+blockedUE+' UE':''}</div>`;
    }).join('');

    if(w.isFerien){
      html+=`<div class="pl-wk ferien${isCurrent?' today':''}" data-wi="${wi}">
        <div class="pl-wk-kw">${w.kw}</div><div class="pl-wk-date">${dateLabel}</div>
        <div class="pl-wk-slot" style="flex-direction:column;align-items:stretch">🏖️ ${w.ferienName||'Ferien'}${_evtBanners?'<div style="margin-top:4px">'+_evtBanners+'</div>':''}</div>
        <div class="pl-wk-ue">–</div>
      </div>`;
    } else if(sched.assignments.length > 0){
      const lbGroups={};
      sched.assignments.forEach(a=>{
        if(!lbGroups[a.lbId]) lbGroups[a.lbId]={lbName:a.lbName, color:a.color, lbId:a.lbId, seqs:[], totalUE:0};
        lbGroups[a.lbId].seqs.push(a);
        lbGroups[a.lbId].totalUE+=a.ue;
      });
      const groups=Object.values(lbGroups);
      
      let slotHtml='<div class="pl-wk-layers">';
      groups.forEach(g=>{
        const lbIdx=lbs.findIndex(l=>l.id===g.lbId);
        slotHtml+=`<div class="pl-wk-lb-bar" style="background:${g.color}" title="${g.lbName} (${g.totalUE} UE)"><span class="pl-blk-label" onclick="openWeekModal(${wi},'${g.lbId}')">${g.lbName} · ${g.totalUE} UE</span></div>`;
        const namedSeqs=g.seqs.filter(s=>s.seqTitle);
        if(namedSeqs.length){
          slotHtml+='<div class="pl-wk-seq-row">';
          namedSeqs.forEach(s=>{
            slotHtml+=`<div class="pl-wk-block" style="flex:${s.ue};background:${s.color};opacity:.75" onclick="openWeekModal(${wi},'${s.lbId}')" title="→ ${s.seqTitle} (${s.ue} UE)"><span class="pl-wk-block-title">→ ${s.seqTitle}</span><span class="pl-wk-block-seq">${s.ue}</span></div>`;
          });
          const unnamedUE=g.seqs.filter(s=>!s.seqTitle).reduce((s,a)=>s+a.ue,0);
          if(unnamedUE>0) slotHtml+=`<div class="pl-wk-block" style="flex:${unnamedUE};background:${g.color};opacity:.5"><span class="pl-wk-block-seq">${unnamedUE}</span></div>`;
          slotHtml+='</div>';
        }
      });
      if(sched.remaining > 0) slotHtml+=`<div class="pl-wk-lb-bar" style="background:var(--ts-border-light);color:var(--ts-text-muted);border-radius:0 0 4px 4px;cursor:pointer;font-weight:400" onclick="openWeekModal(${wi})">${sched.remaining} UE frei</div>`;
      slotHtml+='</div>';
      const hasPruef = !!pruefungen[wi];
      const ueLabel = sched.blockedUE ? `${w.ue} <span style="color:var(--ts-error);font-size:.7rem">−${sched.blockedUE}</span>` : `${w.ue}`;
      html+=`<div class="pl-wk${isCurrent?' today':''}${hasPruef?' has-pruef':''}${_wkBlockEvts.length?' has-block-evt':''}" data-wi="${wi}">
        <div class="pl-wk-kw">${w.kw}</div><div class="pl-wk-date">${dateLabel}</div>
        <div class="pl-wk-slot" style="padding:2px;flex-direction:column;align-items:stretch"><div onclick="openWeekModal(${wi},'${Object.keys(Object.fromEntries(sched.assignments.map(a=>[a.lbId,1])))[0]||''}')">${slotHtml}</div>${_evtBanners}${_pruefTag(wi)}</div>
        <div class="pl-wk-ue">${ueLabel}</div>
      </div>`;
    } else {
      const hasPruef = !!pruefungen[wi];
      const ueLabel = sched.blockedUE ? `${w.ue} <span style="color:var(--ts-error);font-size:.7rem">−${sched.blockedUE}</span>` : `${w.ue}`;
      // No usable UE this week (all blocked by events or 0-UE fach day) → grayed, no action
      const noCapacity = sched.capacity <= 0;
      html+=`<div class="pl-wk${isCurrent?' today':''}${hasPruef?' has-pruef':''}${_wkBlockEvts.length?' has-block-evt':''}${noCapacity?' no-capacity':''}" data-wi="${wi}">
        <div class="pl-wk-kw">${w.kw}</div><div class="pl-wk-date">${dateLabel}</div>
        <div class="pl-wk-slot${noCapacity?'':' pl-wk-empty'}" style="flex-direction:column;align-items:stretch">${noCapacity?'<span style="font-size:.65rem;color:var(--ts-text-muted);font-style:italic">–</span>':`<span class="pl-wk-hint" onclick="openWeekModal(${wi})">+ Lernbereich</span>`}${_evtBanners}${_pruefTag(wi)}</div>
        <div class="pl-wk-ue">${ueLabel}</div>
      </div>`;
    }
  });
  
  html+='</div>';
  
  // LB list with reorder
  if(lbs.length){
    html+=`<div style="margin-top:var(--sp-lg)">
      <div style="font-size:.75rem;font-weight:600;color:var(--ts-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-sm)">Lernbereiche · ▲▼ zum Verschieben, Positionen bleiben beim Löschen erhalten</div>`;
    lbs.forEach((lb,i)=>{
      const col=lb.color||JP_LB_COLORS[i%JP_LB_COLORS.length];
      const sp=spans[lb.id]||{};
      const weekLabel=sp.first>=0?`KW ${sp.kw1}–${sp.kw2} · ${sp.totalScheduled} UE geplant`:'⚠️ Kein Platz';
      html+=`<div style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--ts-bg-card);border:1px solid var(--ts-border-light);border-radius:var(--radius-sm);margin-bottom:4px;min-height:44px;cursor:pointer" onclick="openWeekModal(${sp.first>=0?sp.first:-1},'${lb.id}')">
        <div style="display:flex;flex-direction:column;gap:2px">
          <button style="background:none;border:none;cursor:pointer;font-size:.7rem;padding:0;color:${i>0?'var(--ts-text-muted)':'transparent'}" onclick="event.stopPropagation();moveLb(${i},-1)" ${i===0?'disabled':''}>▲</button>
          <button style="background:none;border:none;cursor:pointer;font-size:.7rem;padding:0;color:${i<lbs.length-1?'var(--ts-text-muted)':'transparent'}" onclick="event.stopPropagation();moveLb(${i},1)" ${i===lbs.length-1?'disabled':''}>▼</button>
        </div>
        <div style="width:12px;height:12px;border-radius:3px;background:${col};flex-shrink:0"></div>
        <div style="flex:1;font-weight:500;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lb.name}</div>
        <div style="font-size:.68rem;color:${sp.first>=0?'var(--ts-text-muted)':'var(--ts-warning)'}">${weekLabel}</div>
        <div style="font-family:var(--font-display);font-weight:600;font-size:.85rem;min-width:45px;text-align:right">${lb.ue} UE</div>
      </div>`;
    });
    html+='</div>';
  }
  
  container.innerHTML=html;
  
  // Restore scroll position (prevent jump)
  if(scrollParent && savedScroll > 0){
    scrollParent.scrollTop = savedScroll;
  } else {
    // First render: scroll to today
    const todayRow=container.querySelector('.pl-wk.today');
    if(todayRow) setTimeout(()=>todayRow.scrollIntoView({behavior:'smooth',block:'center'}),200);
  }
}

// ═══ WEEK CONTEXT MODAL ═══
let wmWeekIdx = -1;
let wmLbId = null;
let wmTempSeqs = [];

function openWeekModal(wi, lbIdOverride){
  const plan = getJpPlan(); if(!plan) return;
  const klasseId = document.getElementById('jp-klasse').value;
  const fachId = document.getElementById('jp-fach').value;
  const weeks = getSchoolWeeks(klasseId, fachId);
  
  wmWeekIdx = wi;
  
  // Find LB at this week using computed schedule
  let lb = null;
  if(lbIdOverride) lb = plan.lernbereiche.find(l=>l.id===lbIdOverride);
  else if(wi >= 0){
    const sched = computeSchedule(plan, getSchoolWeeks(document.getElementById('jp-klasse').value, document.getElementById('jp-fach').value));
    if(sched[wi] && sched[wi].assignments.length){
      const firstA = sched[wi].assignments[0];
      lb = plan.lernbereiche.find(l=>l.id===firstA.lbId);
    }
  }
  wmLbId = lb ? lb.id : null;
  
  const container = document.getElementById('pl-wm-content');
  const w = wi >= 0 && wi < weeks.length ? weeks[wi] : null;
  const _pd2=n=>String(n).padStart(2,'0');
  const weekLabel = w ? `KW ${w.kw} · ${_pd2(w.monday.getDate())}.${_pd2(w.monday.getMonth()+1)}.–${_pd2(w.friday.getDate())}.${_pd2(w.friday.getMonth()+1)}. · ${w.ue} UE` : '';
  
  if(lb){
    // ═══ EDIT MODE: Show LB details ═══
    const col = lb.color || 'var(--ts-teal)';
    wmTempSeqs = JSON.parse(JSON.stringify(lb.sequenzen || []));
    
    // Compute where this LB falls
    const klasseId=document.getElementById('jp-klasse').value;
    const fachId=document.getElementById('jp-fach').value;
    const weeks=getSchoolWeeks(klasseId,fachId);
    const schedule=computeSchedule(plan,weeks);
    const sp=getLbWeekSpans(plan,schedule,weeks)[lb.id]||{};
    const posLabel=sp.first>=0?`KW ${sp.kw1}–${sp.kw2} · ${sp.totalScheduled} UE verplant`:'Noch nicht platziert';
    
    // Start week options
    const _pd3=n=>String(n).padStart(2,'0');
    const kwOptions = weeks.map((wk,i)=> wk.isFerien ? '' : `<option value="${i}"${i===lb.pinWeek?' selected':''}>${'KW '+wk.kw+' ('+_pd3(wk.monday.getDate())+'.'+_pd3(wk.monday.getMonth()+1)+'.'+')'}</option>`).join('');
    
    let html = `
      <div class="pl-wm-header" style="background:${col};color:#fff">
        <div style="flex:1">
          <div class="pl-wm-header-name">${lb.name||'Neuer Lernbereich'}</div>
          <div class="pl-wm-header-meta">${posLabel}</div>
        </div>
      </div>
      
      <div class="pl-wm-section">Name & UE</div>
      <div style="display:flex;gap:var(--sp-sm);margin-bottom:var(--sp-md)">
        <input class="evt-form-input" id="wm-lb-name" value="${lb.name}" placeholder="Lernbereich-Name" style="flex:1;min-height:40px;font-size:.88rem">
        <input class="evt-form-input" id="wm-lb-ue" type="number" value="${lb.ue}" min="1" max="200" style="width:70px;min-height:40px;font-size:.88rem;text-align:center">
        <span style="font-size:.82rem;color:var(--ts-text-muted);align-self:center">UE</span>
      </div>
      
      <div class="pl-wm-section">Startwoche</div>
      <div style="margin-bottom:var(--sp-md)">
        <select class="pl-select" id="wm-pin-week" style="width:100%">${kwOptions}</select>
        <div style="font-size:.72rem;color:var(--ts-text-muted);margin-top:4px">Lernbereich beginnt in dieser Woche. Andere Lernbereiche bleiben an ihrem Platz.</div>
      </div>
      
      <div class="pl-wm-section" style="display:flex;align-items:center;justify-content:space-between">
        <span>Sequenzen (Stundenkette)</span>
        <button class="pl-wand-btn" onclick="wmGenerateSeqs()">
          🪄 KI
          <span class="pl-wand-tip">Sequenzen mit KI generieren lassen</span>
        </button>
      </div>
      <div id="wm-seq-list"></div>
      <button class="pl-ki-btn pl-ki-btn-secondary" onclick="wmAddSeq()" style="font-size:.78rem;min-height:36px;padding:6px;margin-bottom:var(--sp-md)">+ Sequenz hinzufügen</button>
      
      <div class="pl-wm-section">Notizen</div>
      <input class="evt-form-input" id="wm-lb-notes" value="${lb.notes||''}" placeholder="Lehrplan-Bezug, Hinweise…" style="margin-bottom:var(--sp-md)">
      
      <div class="evt-btn-row">
        <button style="background:#FFEBEE;color:var(--ts-error);border:none;padding:12px;border-radius:var(--radius-sm);font-family:var(--font-body);font-weight:600;cursor:pointer" onclick="wmDeleteLb()">Löschen</button>
        <button style="background:var(--ts-teal);color:#fff;border:none;padding:12px;border-radius:var(--radius-sm);font-family:var(--font-body);font-weight:600;cursor:pointer;flex:2" onclick="wmSaveLb()">Speichern</button>
      </div>`;
    
    container.innerHTML = html;
    wmRenderSeqList();
    
  } else {
    // ═══ CHOOSE MODE: Pick or create a LB ═══
    const lehrplan = getLehrplanForSelection();
    const existingNames = plan.lernbereiche.map(l=>l.name);
    
    let html = `<h3 style="font-family:var(--font-display);font-size:1.1rem;font-weight:600;margin-bottom:4px">${weekLabel || 'Lernbereich hinzufügen'}</h3>
      <div style="font-size:.82rem;color:var(--ts-text-secondary);margin-bottom:var(--sp-md)">Lernbereich für diese Woche wählen oder neu anlegen.</div>`;
    
    // Show Lehrplan suggestions not yet in plan
    if(lehrplan){
      html += '<div class="pl-wm-section">Aus dem Lehrplan</div>';
      lehrplan.forEach((lb, i) => {
        if(existingNames.includes(lb.n)) return; // skip already added
        const col = JP_LB_COLORS[i % JP_LB_COLORS.length];
        html += `<div class="pl-wm-lb-option" onclick="wmAddFromLehrplan(${i},${wi})">
          <div class="pl-wm-lb-dot" style="background:${col}"></div>
          <div class="pl-wm-lb-name">${lb.n}</div>
          <div class="pl-wm-lb-ue">${lb.ue} UE</div>
        </div>`;
      });
    }
    
    // Manual
    html += '<div class="pl-wm-section">Oder</div>';
    html += `<div class="pl-wm-lb-option" onclick="wmCreateNew(${wi})" style="border-style:dashed;color:var(--ts-teal)">
      <span style="font-size:1.1rem">+</span>
      <div class="pl-wm-lb-name" style="color:var(--ts-teal)">Neuen Lernbereich anlegen</div>
    </div>`;

    // Show existing blocking events for this week
    if(wi >= 0){
      const wk = getSchoolWeeks(document.getElementById('jp-klasse').value, document.getElementById('jp-fach').value)[wi];
      if(wk){
        const bEvts = getBlockingEventsForWeek(wk);
        if(bEvts.length){
          html += '<div class="pl-wm-section" style="margin-top:var(--sp-md)">Blockierende Termine</div>';
          bEvts.forEach(e=>{
            const et = EVENT_TYPES.find(t=>t.id===e.type);
            const icon = et ? et.icon : '📌';
            const name = e.type==='custom'&&e.customName ? e.customName : (et?et.name:e.title);
            const dateRange = e.dateEnd&&e.dateEnd>e.date ? `${e.date} – ${e.dateEnd}` : e.date;
            html+=`<div class="pl-wm-lb-option" style="border-left:3px solid ${et?et.color:'#9AABB8'}" onclick="closeWeekModal();openEventModal(null,'${e.id}')">
              <span>${icon}</span>
              <div class="pl-wm-lb-name">${e.title}</div>
              <div class="pl-wm-lb-ue" style="font-size:.72rem">${dateRange}</div>
            </div>`;
          });
        }
      }
    }

    html += '<div class="pl-wm-section" style="margin-top:var(--sp-md)">Blockierenden Termin anlegen</div>';
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:var(--sp-md)">`;
    ['klassenfahrt','praktikum','ausflug','schulfest'].forEach(tid=>{
      const et = EVENT_TYPES.find(t=>t.id===tid);
      if(!et) return;
      html+=`<button onclick="wmAddBlockingEvent(${wi},'${tid}')" style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--ts-bg-card);border:1px solid var(--ts-border);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:.8rem;cursor:pointer;color:var(--ts-text)">${et.icon} ${et.name}</button>`;
    });
    html += `<button onclick="wmAddBlockingEvent(${wi},null)" style="display:flex;align-items:center;gap:5px;padding:6px 10px;background:var(--ts-bg-card);border:1px dashed var(--ts-border);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:.8rem;cursor:pointer;color:var(--ts-text-muted)">+ Anderer Termin</button>`;
    html += `</div>`;

    html += `<div style="margin-top:var(--sp-md)"><button style="background:var(--ts-bg-warm);color:var(--ts-text);border:none;padding:10px;border-radius:var(--radius-sm);font-family:var(--font-body);font-weight:600;cursor:pointer;width:100%" onclick="closeWeekModal()">Abbrechen</button></div>`;
    
    container.innerHTML = html;
  }
  
  document.getElementById('pl-week-modal').classList.add('open');
}

function closeWeekModal(){
  document.getElementById('pl-week-modal').classList.remove('open');
  wmWeekIdx=-1; wmLbId=null; wmTempSeqs=[];
}

function wmAddBlockingEvent(wi, preType){
  const klasseId = document.getElementById('jp-klasse').value;
  const fachId   = document.getElementById('jp-fach').value;
  const weeks    = getSchoolWeeks(klasseId, fachId);
  const w        = wi >= 0 && wi < weeks.length ? weeks[wi] : null;
  closeWeekModal();
  const startStr = w ? dateStr(w.monday) : new Date().toISOString().split('T')[0];
  const endStr   = w ? dateStr(w.friday)  : startStr;
  openEventModal(startStr);
  // Pre-fill end date and type after modal renders
  setTimeout(() => {
    setDateInput('evt-date-end', endStr);
    document.getElementById('evt-date-end').dataset.minIso = startStr;
    document.getElementById('evt-ganztag').checked = true;
    evtToggleGanztag();
    if(preType) selectEventType(preType);
  }, 30);
}

// ═══ CHOOSE MODE actions ═══
function wmAssignExisting(lbId, wi){
  // LB is already in the plan - just close modal, schedule auto-computes
  closeWeekModal(); renderPlanung();
}

function wmAddFromLehrplan(idx, wi){
  const lbs=getLehrplanForSelection(); if(!lbs||!lbs[idx]) return;
  const plan=getJpPlan(); if(!plan) return;
  const lb=lbs[idx];
  if(!plan.lernbereiche.some(l=>l.name===lb.n)){
    plan.lernbereiche.push({id:'lb_'+Date.now(),name:lb.n,ue:lb.ue,notes:'',color:JP_LB_COLORS[plan.lernbereiche.length%JP_LB_COLORS.length],sequenzen:[],pinWeek:wi>=0?wi:undefined});
    saveJpData();
  }
  closeWeekModal(); renderPlanung(); renderKiPanel();
}

function wmCreateNew(wi){
  closeWeekModal();
  const plan=getJpPlan(); if(!plan) return;
  const newLb={id:'lb_'+Date.now(),name:'',ue:10,notes:'',color:JP_LB_COLORS[plan.lernbereiche.length%JP_LB_COLORS.length],sequenzen:[],pinWeek:wi>=0?wi:0};
  plan.lernbereiche.push(newLb);
  saveJpData();
  setTimeout(()=>openWeekModal(-1, newLb.id), 100);
}

// ═══ EDIT MODE actions ═══
function wmRenderSeqList(){
  const c=document.getElementById('wm-seq-list'); if(!c) return;
  const totalSeqUE = wmTempSeqs.reduce((s,q)=>s+(parseInt(q.ue)||0),0);
  const lbUeEl = document.getElementById('wm-lb-ue');
  const lbUE = lbUeEl ? (parseInt(lbUeEl.value)||0) : 0;
  const seqHtml = wmTempSeqs.map((s,i)=>`
    <div class="pl-seq-row" id="pl-seq-row-${i}" data-seqi="${i}">
      <div class="pl-seq-handle" onmousedown="initSeqDrag(${i},event)" ontouchstart="initSeqDrag(${i},event)" title="Ziehen zum Umordnen">⠿</div>
      <span class="pl-seq-num">${i+1}.</span>
      <input class="evt-form-input" value="${(s.title||'').replace(/"/g,'&quot;')}" oninput="wmTempSeqs[${i}].title=this.value" placeholder="Sequenz-Titel, z.B. Brüche einführen" style="min-height:36px;font-size:.82rem;flex:1">
      <input class="evt-form-input ue-input" type="number" value="${s.ue||''}" min="1" max="99" oninput="wmTempSeqs[${i}].ue=parseInt(this.value)||0;wmRefreshSeqUeTotal()" placeholder="UE" style="min-height:36px;font-size:.82rem;width:60px" title="Unterrichtseinheiten für diese Sequenz">
      <button class="pl-seq-remove" onclick="wmTempSeqs.splice(${i},1);wmRenderSeqList()" title="Sequenz entfernen">✕</button>
    </div>`).join('');
  const totalBar = wmTempSeqs.length ?
    `<div class="pl-seq-total${totalSeqUE>lbUE&&lbUE>0?' over':totalSeqUE===lbUE?' match':''}">
       Σ <strong>${totalSeqUE} UE</strong>${lbUE>0?(totalSeqUE===lbUE?' = LB ✓':' von '+lbUE+' LB-UE '+(totalSeqUE<lbUE?'('+((lbUE-totalSeqUE))+' UE unverplant)':'('+((totalSeqUE-lbUE))+' UE zu viel)')):''}
       ${lbUE>0&&totalSeqUE!==lbUE?'<button class="pl-seq-sync" onclick="wmSyncLbUe()" title="LB-UE auf Sequenzsumme setzen">↕ sync</button>':''}
     </div>` : '';
  c.innerHTML = seqHtml + totalBar;
}

// Drag-to-reorder für Sequenz-Liste im Week-Modal
function initSeqDrag(fromIdx, evt){
  evt.preventDefault();
  evt.stopPropagation();
  const touch = evt.touches ? evt.touches[0] : evt;
  const startY = touch.clientY;
  let lastOver = fromIdx;

  const rows = () => document.querySelectorAll('.pl-seq-row');
  const ghost = document.createElement('div');
  ghost.className = 'pl-seq-ghost';
  ghost.textContent = (wmTempSeqs[fromIdx].title||'Sequenz') + ' (' + (wmTempSeqs[fromIdx].ue||'?') + ' UE)';
  document.body.appendChild(ghost);

  function onMove(e){
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    ghost.style.top = (t.clientY - 20) + 'px';
    ghost.style.left = (t.clientX - 60) + 'px';

    // Highlight drop target row
    ghost.style.display='none';
    const el = document.elementFromPoint(t.clientX, t.clientY);
    ghost.style.display='';
    const targetRow = el ? el.closest('.pl-seq-row[data-seqi]') : null;
    rows().forEach(r => r.classList.remove('drop-over'));
    if(targetRow){
      const ti = parseInt(targetRow.dataset.seqi);
      if(ti !== fromIdx){ targetRow.classList.add('drop-over'); lastOver = ti; }
    }
  }

  function onEnd(e){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    ghost.remove();
    rows().forEach(r => r.classList.remove('drop-over'));

    if(lastOver !== fromIdx){
      const [seq] = wmTempSeqs.splice(fromIdx, 1);
      wmTempSeqs.splice(lastOver, 0, seq);
      wmRenderSeqList();
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
}

function wmMoveSeq(i, dir){
  const j = i + dir;
  if(j < 0 || j >= wmTempSeqs.length) return;
  [wmTempSeqs[i], wmTempSeqs[j]] = [wmTempSeqs[j], wmTempSeqs[i]];
  wmRenderSeqList();
}

function wmRefreshSeqUeTotal(){
  const totalSeqUE = wmTempSeqs.reduce((s,q)=>s+(parseInt(q.ue)||0),0);
  const lbUE = parseInt(document.getElementById('wm-lb-ue')?.value)||0;
  const el = document.querySelector('.pl-seq-total');
  if(!el) return;
  el.className = 'pl-seq-total'+(totalSeqUE>lbUE&&lbUE>0?' over':totalSeqUE===lbUE?' match':'');
}

function wmSyncLbUe(){
  const total = wmTempSeqs.reduce((s,q)=>s+(parseInt(q.ue)||0),0);
  const el = document.getElementById('wm-lb-ue');
  if(el){ el.value = total; wmRenderSeqList(); }
}

function wmAddSeq(){
  // Pre-fill UE: remaining from LB budget or 2
  const lbUE = parseInt(document.getElementById('wm-lb-ue')?.value)||0;
  const used = wmTempSeqs.reduce((s,q)=>s+(parseInt(q.ue)||0),0);
  const rem = Math.max(2, lbUE - used);
  wmTempSeqs.push({title:'', ue:Math.min(rem, lbUE||rem)});
  wmRenderSeqList();
  // Focus the new title input
  setTimeout(()=>{
    const rows = document.querySelectorAll('.pl-seq-row');
    if(rows.length) rows[rows.length-1].querySelector('input')?.focus();
  }, 50);
}

async function wmGenerateSeqs(){
  const plan = getJpPlan();
  if (!plan || !wmLbId) return;
  const lb    = plan.lernbereiche.find(l => l.id === wmLbId);
  if (!lb) return;

  const klasseId = document.getElementById('jp-klasse')?.value;
  const fachId   = document.getElementById('jp-fach')?.value;
  const klasse = getKlasse(klasseId);
  const fach   = getFach(fachId);

  const btn = document.querySelector('[onclick="wmGenerateSeqs()"]');
  if (btn) { btn.textContent = '⏳ Generiere...'; btn.disabled = true; }

  // Aktuelle Eingabewerte aus dem Modal nehmen (nicht gespeichertes lb-Objekt)
  const currentName = document.getElementById('wm-lb-name')?.value.trim() || lb.name;
  const currentUE   = parseInt(document.getElementById('wm-lb-ue')?.value) || lb.ue;
  const currentNotes = document.getElementById('wm-lb-notes')?.value.trim() || lb.notes || '';

  const result = await callKI('sequenzplanung', {
    lernbereich:    currentName,
    ue:             currentUE,
    lehrplaninhalt: currentNotes,
    fach:           fach?.name || '',
    jgst:           klasse ? extractJgst(klasse.name) : '',
    schulart:       state.schulart || '',
    bundesland:     state.bundesland || '',
    schulbuch:      plan.schulbuch || '',
  });

  if (btn) { btn.textContent = '🪄 KI'; btn.disabled = false; }

  if (result && Array.isArray(result)) {
    wmTempSeqs = result.map(s => ({
      title: s.title || s.name || '',
      ue:    s.ue || 2,
    }));
    wmRenderSeqList();
  }
}

function wmUpdateRange(){
  // Called when start/end selects change - just visual feedback for now
}

function wmSaveLb(){
  const plan=getJpPlan(); if(!plan||!wmLbId) return;
  const lb=plan.lernbereiche.find(l=>l.id===wmLbId);
  if(!lb) return;
  
  const name=document.getElementById('wm-lb-name').value.trim();
  const ue=parseInt(document.getElementById('wm-lb-ue').value)||0;
  if(!name||ue<1){alert('Bitte Name und mindestens 1 UE.');return}
  
  lb.name=name;
  lb.ue=ue;
  lb.notes=document.getElementById('wm-lb-notes').value.trim();
  lb.sequenzen=wmTempSeqs.filter(s=>s.title&&s.title.trim());
  // Update pinWeek if changed
  const pinSel=document.getElementById('wm-pin-week');
  if(pinSel) lb.pinWeek=parseInt(pinSel.value);
  // Recalculate ue from sequenzen if present
  if(lb.sequenzen.length){
    const seqTotal=lb.sequenzen.reduce((s,q)=>s+(q.ue||0),0);
    if(seqTotal>0) lb.ue=seqTotal;
    document.getElementById('wm-lb-ue').value=lb.ue;
  }
  
  _scheduleCache.hash=''; saveJpData(); closeWeekModal(); renderPlanung(); renderKiPanel();
}

function wmRemoveAssignment(){closeWeekModal()}

function wmDeleteLb(){
  if(!confirm('Lernbereich komplett löschen?')) return;
  const plan=getJpPlan(); if(!plan) return;
  const lb = plan.lernbereiche.find(l=>l.id===wmLbId);
  if(lb && lb.pinWeek !== undefined){
    if(!plan._savedPositions) plan._savedPositions = {};
    plan._savedPositions[lb.name] = lb.pinWeek;
  }
  plan.lernbereiche=plan.lernbereiche.filter(l=>l.id!==wmLbId);
  _scheduleCache.hash=''; saveJpData(); closeWeekModal(); renderPlanung(); renderKiPanel();
}

// Legacy aliases
function openJpModal(lbId){if(lbId)openWeekModal(-1,lbId);else{
  const plan=getJpPlan();if(!plan)return;
  const klasseId=document.getElementById('jp-klasse').value;
  const fachId=document.getElementById('jp-fach').value;
  const weeks=getSchoolWeeks(klasseId,fachId);
  const schedule=computeSchedule(plan,weeks);
  let pin=0;schedule.forEach((s,i)=>{if(s.assignments.length&&i>=pin)pin=i+1});
  while(pin<weeks.length&&weeks[pin].isFerien)pin++;
  const newLb={id:'lb_'+Date.now(),name:'',ue:10,notes:'',color:JP_LB_COLORS[plan.lernbereiche.length%JP_LB_COLORS.length],sequenzen:[],pinWeek:pin};
  plan.lernbereiche.push(newLb);saveJpData();openWeekModal(-1,newLb.id);
}}
function editJpLb(lbId){openWeekModal(-1,lbId)}
function confirmDeleteJpLb(lbId){
  if(!confirm('Lernbereich wirklich löschen?'))return;
  const plan=getJpPlan();if(!plan)return;
  const lb = plan.lernbereiche.find(l=>l.id===lbId);
  if(lb && lb.pinWeek !== undefined){
    if(!plan._savedPositions) plan._savedPositions = {};
    plan._savedPositions[lb.name] = lb.pinWeek;
  }
  plan.lernbereiche=plan.lernbereiche.filter(l=>l.id!==lbId);
  _scheduleCache.hash='';saveJpData();renderPlanung();renderKiPanel();
}

// Alias for backward compatibility
function renderJahresplan(){renderPlanung()}

/* ── Klausur / Prüfung / Probe Modal ── */
function jpOpenPruefungModal(wi){
  const plan = getJpPlan(); if(!plan) return;
  const weeks = getSchoolWeeks(document.getElementById('jp-klasse').value, document.getElementById('jp-fach').value);
  const w = weeks[wi];
  const existing = plan.pruefungen[wi];
  const _pd = n => String(n).padStart(2,'0');
  const dateLabel = w ? `KW ${w.kw} · ${_pd(w.monday.getDate())}.${_pd(w.monday.getMonth()+1)}.–${_pd(w.friday.getDate())}.${_pd(w.friday.getMonth()+1)}.` : '';

  document.getElementById('jp-pruef-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'jp-pruef-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:var(--ts-bg-card);border-radius:16px;padding:1.5rem;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ts-text-muted);margin-bottom:.25rem">${dateLabel}</div>
      <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;margin-bottom:1rem;color:var(--ts-navy)">📝 Klausur / Prüfung / Probe</div>
      <label style="font-size:.75rem;font-weight:600;color:var(--ts-text-secondary);text-transform:uppercase;letter-spacing:.04em">Bezeichnung</label>
      <input id="jp-pruef-label" type="text" value="${existing?.label||''}" placeholder="z. B. Klausur, Probe, Schulaufgabe…" style="width:100%;margin-top:4px;margin-bottom:.75rem;padding:8px 10px;border:1.5px solid var(--ts-border);border-radius:var(--radius-sm);font-size:.88rem;font-family:var(--font-body);background:var(--ts-bg);color:var(--ts-text);outline:none">
      <label style="font-size:.75rem;font-weight:600;color:var(--ts-text-secondary);text-transform:uppercase;letter-spacing:.04em">Thema</label>
      <input id="jp-pruef-thema" type="text" value="${existing?.thema||''}" placeholder="z. B. Bruchrechnung, Weimarer Republik…" style="width:100%;margin-top:4px;margin-bottom:.75rem;padding:8px 10px;border:1.5px solid var(--ts-border);border-radius:var(--radius-sm);font-size:.88rem;font-family:var(--font-body);background:var(--ts-bg);color:var(--ts-text);outline:none">
      <label style="font-size:.75rem;font-weight:600;color:var(--ts-text-secondary);text-transform:uppercase;letter-spacing:.04em">Notiz (optional)</label>
      <input id="jp-pruef-note" type="text" value="${existing?.note||''}" placeholder="z. B. mündlich, 45 Min., offene Bücher…" style="width:100%;margin-top:4px;margin-bottom:1rem;padding:8px 10px;border:1.5px solid var(--ts-border);border-radius:var(--radius-sm);font-size:.88rem;font-family:var(--font-body);background:var(--ts-bg);color:var(--ts-text);outline:none">
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button onclick="jpSavePruefung(${wi})" style="flex:1;padding:10px;background:var(--ts-navy);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;font-weight:600;font-family:var(--font-body);font-size:.88rem">Speichern</button>
        ${existing?`<button onclick="jpRemovePruefung(${wi})" style="padding:10px 14px;background:none;border:1.5px solid var(--ts-error);color:var(--ts-error);border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-body);font-size:.85rem">Entfernen</button>`:''}
        <button onclick="document.getElementById('jp-pruef-modal').remove()" style="padding:10px;border:none;background:none;color:var(--ts-text-muted);cursor:pointer;font-family:var(--font-body);font-size:.85rem">Abbrechen</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  document.getElementById('jp-pruef-label').focus();
}

function jpSavePruefung(wi){
  const plan = getJpPlan(); if(!plan) return;
  const label = document.getElementById('jp-pruef-label')?.value.trim() || '';
  const thema = document.getElementById('jp-pruef-thema')?.value.trim() || '';
  const note  = document.getElementById('jp-pruef-note')?.value.trim()  || '';
  plan.pruefungen[wi] = { label, thema, note };
  saveJpData(); renderPlanung();
  document.getElementById('jp-pruef-modal')?.remove();
}

function jpRemovePruefung(wi){
  const plan = getJpPlan(); if(!plan) return;
  delete plan.pruefungen[wi];
  saveJpData(); renderPlanung();
  document.getElementById('jp-pruef-modal')?.remove();
}

/* ── Jahresplanung drucken ── */
function jpPrint(){
  const key = getJpKey();
  if(!key){ alert('Bitte zuerst Klasse und Fach wählen.'); return; }
  const plan  = getJpPlan();
  const pruef = plan.pruefungen || {};
  const klasseId = document.getElementById('jp-klasse').value;
  const fachId   = document.getElementById('jp-fach').value;
  const klasse   = getKlasse?.(klasseId);
  const fach     = getFach?.(fachId);
  const klasseName = klasse?.name || klasseId;
  const fachName   = fach?.name   || fachId;
  const fachColor  = fach?.color  || '#1A3C5E';
  const weeks  = getSchoolWeeks(klasseId, fachId);
  const schedule = computeSchedule(plan, weeks);
  const lbs = plan.lernbereiche;
  const E = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Lernbereich-Legende
  let legendHtml = lbs.map(lb=>`<span style="display:inline-flex;align-items:center;gap:5px;margin:3px 8px 3px 0;font-size:.75rem">
    <span style="width:10px;height:10px;border-radius:2px;background:${lb.color||'#999'};display:inline-block;flex-shrink:0"></span>${E(lb.name)} (${lb.ue} UE)
  </span>`).join('');

  // Wochen-Tabelle
  const _pd = n => String(n).padStart(2,'0');
  let rowsHtml = '';
  let lastMonth = -1;
  weeks.forEach((w, wi)=>{
    if(w.monday.getMonth() !== lastMonth){
      lastMonth = w.monday.getMonth();
      const MONATE_P = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
      rowsHtml += `<tr><td colspan="4" style="background:#f0ede7;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#888;padding:6px 8px;border-bottom:1px solid #ddd">${MONATE_P[lastMonth]} ${w.monday.getFullYear()}</td></tr>`;
    }
    const dateLabel = `${_pd(w.monday.getDate())}.${_pd(w.monday.getMonth()+1)}.–${_pd(w.friday.getDate())}.${_pd(w.friday.getMonth()+1)}.`;
    if(w.isFerien){
      rowsHtml += `<tr style="background:#fafafa"><td style="padding:5px 8px;color:#aaa;font-size:.72rem;border-bottom:1px solid #eee">KW ${w.kw}</td><td style="color:#aaa;font-size:.72rem;border-bottom:1px solid #eee">${dateLabel}</td><td colspan="2" style="color:#aaa;font-size:.72rem;border-bottom:1px solid #eee">🏖️ ${E(w.ferienName||'Ferien')}</td></tr>`;
    } else {
      const sched = schedule[wi];
      const assignments = sched?.assignments || [];
      let assignHtml = '';
      if(assignments.length){
        // group by lb
        const seen = {};
        assignments.forEach(a=>{
          if(!seen[a.lbId]) seen[a.lbId] = {name:a.lbName,color:a.color,seqs:[],ue:0};
          seen[a.lbId].ue += a.ue;
          if(a.seqTitle) seen[a.lbId].seqs.push(a.seqTitle);
        });
        assignHtml = Object.values(seen).map(g=>
          `<span style="display:inline-flex;align-items:center;gap:4px;margin:1px 4px 1px 0;font-size:.75rem">
            <span style="width:8px;height:8px;border-radius:2px;background:${g.color||'#999'};flex-shrink:0;display:inline-block"></span>
            <b>${E(g.name)}</b>${g.seqs.length ? ' → '+g.seqs.map(E).join(', '):''}
          </span>`
        ).join('');
      } else {
        assignHtml = `<span style="color:#bbb;font-size:.72rem">–</span>`;
      }
      const p = pruef[wi];
      const pruefCell = p ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:700;color:#c0392b;background:#fdecea;border-radius:4px;padding:2px 7px;white-space:nowrap">📝 ${E(p.label||'Prüfung')}${p.thema?' · '+E(p.thema):''}${p.note?' · '+E(p.note):''}</span>` : '';
      rowsHtml += `<tr style="border-bottom:1px solid #eee${p?';border-left:3px solid #D4574E;background:#fffafa':''}">
        <td style="padding:5px 8px;font-size:.72rem;color:#888;white-space:nowrap">KW ${w.kw}</td>
        <td style="font-size:.72rem;color:#888;white-space:nowrap">${dateLabel}</td>
        <td style="font-size:.75rem;padding:4px 8px">${assignHtml}${pruefCell?'<br>'+pruefCell:''}</td>
        <td style="font-size:.72rem;text-align:right;color:#aaa;white-space:nowrap;padding:4px 8px">${w.ue} UE</td>
      </tr>`;
    }
  });

  const totalPlanned = lbs.reduce((s,l)=>s+(l.ue||0),0);

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Jahresplanung – ${E(klasseName)} – ${E(fachName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f5f3ef;padding:0}
.bar{position:fixed;top:0;left:0;right:0;background:#1A3C5E;color:#fff;display:flex;align-items:center;gap:12px;padding:10px 20px;z-index:9}
.bar strong{flex:1;font-size:.9rem}
.bar button{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.8rem}
.page{max-width:900px;margin:0 auto;padding:64px 20px 40px}
.hd{background:${fachColor};color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:16px}
.hd h1{font-size:1.1rem;font-weight:700}
.hd p{font-size:.8rem;opacity:.8;margin-top:3px}
.legend{background:#fff;border-radius:8px;padding:12px 16px;margin-bottom:16px;border:1px solid #e0dbd2;font-size:.8rem;line-height:1.8}
.legend h2{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:8px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0dbd2}
th{background:#1A3C5E;color:#fff;font-size:.72rem;padding:7px 8px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
@media print{.bar{display:none}.page{padding:0;max-width:100%}body{background:#fff}}
</style></head><body>
<div class="bar"><strong>Jahresplanung · ${E(klasseName)} · ${E(fachName)}</strong><button onclick="window.print()">🖨️ Drucken / PDF</button></div>
<div class="page">
  <div class="hd">
    <h1>Jahresplanung · ${E(fachName)}</h1>
    <p>${E(klasseName)} · ${totalPlanned} UE geplant</p>
  </div>
  <div class="legend">
    <h2>Lernbereiche</h2>
    ${legendHtml}
  </div>
  <table>
    <thead><tr><th>KW</th><th>Zeitraum</th><th>Inhalt</th><th style="text-align:right">UE</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>
</body></html>`;

  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}


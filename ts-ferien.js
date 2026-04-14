   /* FERIEN & FEIERTAGE
   ═══════════════════════════════════════════ */

// ── Deutschland ─────────────────────────────
const BL_CODES_DE = {
  'Baden-Württemberg':'BW','Bayern':'BY','Berlin':'BE','Brandenburg':'BB',
  'Bremen':'HB','Hamburg':'HH','Hessen':'HE','Mecklenburg-Vorpommern':'MV',
  'Niedersachsen':'NI','Nordrhein-Westfalen':'NW','Rheinland-Pfalz':'RP',
  'Saarland':'SL','Sachsen':'SN','Sachsen-Anhalt':'ST','Schleswig-Holstein':'SH','Thüringen':'TH',
};
const BL_NAGER_DE = {
  'Baden-Württemberg':'DE-BW','Bayern':'DE-BY','Berlin':'DE-BE','Brandenburg':'DE-BB',
  'Bremen':'DE-HB','Hamburg':'DE-HH','Hessen':'DE-HE','Mecklenburg-Vorpommern':'DE-MV',
  'Niedersachsen':'DE-NI','Nordrhein-Westfalen':'DE-NW','Rheinland-Pfalz':'DE-RP',
  'Saarland':'DE-SL','Sachsen':'DE-SN','Sachsen-Anhalt':'DE-ST','Schleswig-Holstein':'DE-SH','Thüringen':'DE-TH',
};
// ── Österreich ──────────────────────────────
const BL_CODES_AT = {
  'Wien':'AT_W','Niederösterreich':'AT_NOE','Oberösterreich':'AT_OOE',
  'Steiermark':'AT_STMK','Tirol':'AT_T','Vorarlberg':'AT_V',
  'Salzburg':'AT_S','Kärnten':'AT_K','Burgenland':'AT_B',
};
const BL_NAGER_AT = {
  'Wien':'AT','Niederösterreich':'AT','Oberösterreich':'AT','Steiermark':'AT',
  'Tirol':'AT','Vorarlberg':'AT','Salzburg':'AT','Kärnten':'AT','Burgenland':'AT',
};
// ── Schweiz ─────────────────────────────────
const BL_CODES_CH = {
  'Zürich':'CH_ZH','Bern':'CH_BE','Luzern':'CH_LU','Uri':'CH_UR','Schwyz':'CH_SZ',
  'Obwalden':'CH_OW','Nidwalden':'CH_NW','Glarus':'CH_GL','Zug':'CH_ZG',
  'Freiburg':'CH_FR','Solothurn':'CH_SO','Basel-Stadt':'CH_BS','Basel-Landschaft':'CH_BL',
  'Schaffhausen':'CH_SH','Appenzell Ausserrhoden':'CH_AR','Appenzell Innerrhoden':'CH_AI',
  'St. Gallen':'CH_SG','Graubünden':'CH_GR','Aargau':'CH_AG','Thurgau':'CH_TG',
  'Tessin':'CH_TI','Waadt':'CH_VD','Wallis':'CH_VS','Neuenburg':'CH_NE',
  'Genf':'CH_GE','Jura':'CH_JU',
};
const BL_NAGER_CH = Object.fromEntries(Object.keys(BL_CODES_CH).map(k => [k, 'CH']));

// Unified maps (all countries)
const BL_CODES  = { ...BL_CODES_DE, ...BL_CODES_AT, ...BL_CODES_CH };
const BL_NAGER  = { ...BL_NAGER_DE, ...BL_NAGER_AT, ...BL_NAGER_CH };

// ═══ EMBEDDED FERIEN DATA (offline-fähig, offiziell) ═══
// Quelle: KMK – Übersicht Schulferien; Kultusministerien der Länder
// Stand: Schuljahre 2025/2026 und 2026/2027
// WICHTIG: Pfingstferien als Ferienblock NUR in Bayern!
// Pfingstmontag ist Feiertag (feiertageData), keine Schulferien.
const FERIEN_EMBEDDED = {

  BY: [ // ── Bayern ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-11-03',end:'2025-11-07'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-05'},
    {name:'Faschingsferien', start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-10'},
    {name:'Pfingstferien',   start:'2026-05-26',end:'2026-06-05'},
    {name:'Sommerferien',    start:'2026-08-03',end:'2026-09-14'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-11-02',end:'2026-11-06'},
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-08'},
    {name:'Faschingsferien', start:'2027-02-08',end:'2027-02-12'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-02'},
    {name:'Pfingstferien',   start:'2027-05-18',end:'2027-05-28'},
    {name:'Sommerferien',    start:'2027-08-02',end:'2027-09-13'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-11-02',end:'2027-11-05'},
    {name:'Weihnachtsferien',start:'2027-12-24',end:'2028-01-07'},
    {name:'Faschingsferien', start:'2028-02-28',end:'2028-03-03'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-21'},
    {name:'Pfingstferien',   start:'2028-06-06',end:'2028-06-16'},
    {name:'Sommerferien',    start:'2028-07-31',end:'2028-09-11'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-30',end:'2028-11-03'},
    {name:'Weihnachtsferien',start:'2028-12-23',end:'2029-01-05'},
    {name:'Faschingsferien', start:'2029-02-12',end:'2029-02-16'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-06'},
    {name:'Pfingstferien',   start:'2029-05-22',end:'2029-06-01'},
    {name:'Sommerferien',    start:'2029-07-30',end:'2029-09-10'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-29',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-24',end:'2030-01-04'},
  ],

  BW: [ // ── Baden-Württemberg ───────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-05'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-11'},
    {name:'Pfingstferien',   start:'2026-05-26',end:'2026-06-05'},
    {name:'Sommerferien',    start:'2026-07-30',end:'2026-09-12'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-31'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-09'},
    {name:'Osterferien',     start:'2027-03-25',end:'2027-04-03'},
    {name:'Pfingstferien',   start:'2027-05-18',end:'2027-05-29'},
    {name:'Sommerferien',    start:'2027-07-29',end:'2027-09-11'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-11-02',end:'2027-11-06'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-08'},
    {name:'Osterferien',     start:'2028-04-13',end:'2028-04-22'},
    {name:'Pfingstferien',   start:'2028-06-06',end:'2028-06-17'},
    {name:'Sommerferien',    start:'2028-07-27',end:'2028-09-09'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-30',end:'2028-11-03'},
    {name:'Weihnachtsferien',start:'2028-12-23',end:'2029-01-05'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-07'},
    {name:'Pfingstferien',   start:'2029-05-22',end:'2029-06-01'},
    {name:'Sommerferien',    start:'2029-07-26',end:'2029-09-08'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-29',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-22',end:'2030-01-05'},
  ],

  NW: [ // ── Nordrhein-Westfalen ─────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-25'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-06'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-11'},
    {name:'Sommerferien',    start:'2026-07-20',end:'2026-09-01'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-17',end:'2026-10-31'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-06'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-03'},
    {name:'Sommerferien',    start:'2027-07-19',end:'2027-08-31'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-23',end:'2027-11-06'},
    {name:'Weihnachtsferien',start:'2027-12-24',end:'2028-01-08'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-07-10',end:'2028-08-22'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-11-04'},
    {name:'Weihnachtsferien',start:'2028-12-21',end:'2029-01-05'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-07'},
    {name:'Sommerferien',    start:'2029-07-02',end:'2029-08-14'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-15',end:'2029-10-27'},
    {name:'Weihnachtsferien',start:'2029-12-20',end:'2030-01-04'},
  ],

  NI: [ // ── Niedersachsen ───────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-20',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-05'},
    {name:'Winterferien',    start:'2026-02-02',end:'2026-02-03'},
    {name:'Osterferien',     start:'2026-03-23',end:'2026-04-07'},
    {name:'Sommerferien',    start:'2026-07-02',end:'2026-08-12'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-09'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-02'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-03'},
    {name:'Sommerferien',    start:'2027-07-08',end:'2027-08-18'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-16',end:'2027-10-30'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-08'},
    {name:'Winterferien',    start:'2028-01-31',end:'2028-02-01'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-07-20',end:'2028-08-30'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-11-04'},
    {name:'Weihnachtsferien',start:'2028-12-27',end:'2029-01-06'},
    {name:'Winterferien',    start:'2029-02-01',end:'2029-02-02'},
    {name:'Osterferien',     start:'2029-03-19',end:'2029-04-03'},
    {name:'Sommerferien',    start:'2029-07-19',end:'2029-08-29'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-05'},
  ],

  BE: [ // ── Berlin ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-20',end:'2025-11-01'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-02'},
    {name:'Winterferien',    start:'2026-02-02',end:'2026-02-07'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-09',end:'2026-08-22'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-19',end:'2026-10-31'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-06'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-02'},
    {name:'Sommerferien',    start:'2027-07-01',end:'2027-08-14'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-11',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-22',end:'2027-12-31'},
    {name:'Winterferien',    start:'2028-01-31',end:'2028-02-05'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-07-01',end:'2028-08-12'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-02',end:'2028-10-14'},
    {name:'Weihnachtsferien',start:'2028-12-22',end:'2029-01-02'},
    {name:'Winterferien',    start:'2029-01-29',end:'2029-02-03'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-07-01',end:'2029-08-11'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-01',end:'2029-10-12'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-04'},
  ],

  BB: [ // ── Brandenburg ─────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-20',end:'2025-11-01'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-02'},
    {name:'Winterferien',    start:'2026-02-02',end:'2026-02-07'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-09',end:'2026-08-22'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-19',end:'2026-10-30'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-06'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-03'},
    {name:'Sommerferien',    start:'2027-07-01',end:'2027-08-14'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-11',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2027-12-31'},
    {name:'Winterferien',    start:'2028-01-31',end:'2028-02-05'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-06-29',end:'2028-08-12'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-02',end:'2028-10-14'},
    {name:'Weihnachtsferien',start:'2028-12-22',end:'2029-01-02'},
    {name:'Winterferien',    start:'2029-01-29',end:'2029-02-03'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-06-28',end:'2029-08-11'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-01',end:'2029-10-12'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-04'},
  ],

  HE: [ // ── Hessen ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-06',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-10'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-06-29',end:'2026-08-07'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-05',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-12'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-02'},
    {name:'Sommerferien',    start:'2027-06-28',end:'2027-08-06'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-04',end:'2027-10-16'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-11'},
    {name:'Osterferien',     start:'2028-04-03',end:'2028-04-14'},
    {name:'Sommerferien',    start:'2028-07-03',end:'2028-08-11'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-09',end:'2028-10-20'},
    {name:'Weihnachtsferien',start:'2028-12-27',end:'2029-01-12'},
    {name:'Osterferien',     start:'2029-03-29',end:'2029-04-13'},
    {name:'Sommerferien',    start:'2029-07-16',end:'2029-08-24'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-15',end:'2029-10-26'},
    {name:'Weihnachtsferien',start:'2029-12-24',end:'2030-01-11'},
  ],

  MV: [ // ── Mecklenburg-Vorpommern ──────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-06',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-20',end:'2026-01-03'},
    {name:'Winterferien',    start:'2026-02-09',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-08'},
    {name:'Pfingstferien',   start:'2026-05-22',end:'2026-05-26'},
    {name:'Sommerferien',    start:'2026-07-13',end:'2026-08-22'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-15',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-08',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-24',end:'2027-04-02'},
    {name:'Pfingstferien',   start:'2027-05-14',end:'2027-05-18'},
    {name:'Sommerferien',    start:'2027-07-05',end:'2027-08-14'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-14',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-22',end:'2028-01-04'},
    {name:'Winterferien',    start:'2028-02-05',end:'2028-02-17'},
    {name:'Osterferien',     start:'2028-04-12',end:'2028-04-21'},
    {name:'Pfingstferien',   start:'2028-06-02',end:'2028-06-06'},
    {name:'Sommerferien',    start:'2028-06-26',end:'2028-08-05'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-10-28'},
    {name:'Weihnachtsferien',start:'2028-12-22',end:'2029-01-02'},
    {name:'Winterferien',    start:'2029-02-05',end:'2029-02-16'},
    {name:'Osterferien',     start:'2029-03-28',end:'2029-04-06'},
    {name:'Pfingstferien',   start:'2029-05-18',end:'2029-05-22'},
    {name:'Sommerferien',    start:'2029-06-18',end:'2029-07-28'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-10-27'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-04'},
  ],

  HH: [ // ── Hamburg ─────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-03',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-17',end:'2026-01-02'},
    {name:'Frühjahrsferien', start:'2026-03-02',end:'2026-03-13'},
    {name:'Sommerferien',    start:'2026-07-09',end:'2026-08-19'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-01',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-01'},
    {name:'Frühjahrsferien', start:'2027-03-01',end:'2027-03-12'},
    {name:'Sommerferien',    start:'2027-07-01',end:'2027-08-11'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-11',end:'2027-10-22'},
    {name:'Weihnachtsferien',start:'2027-12-20',end:'2027-12-31'},
    {name:'Frühjahrsferien', start:'2028-03-06',end:'2028-03-17'},
    {name:'Sommerferien',    start:'2028-07-03',end:'2028-08-11'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-02',end:'2028-10-13'},
    {name:'Weihnachtsferien',start:'2028-12-18',end:'2028-12-31'},
    {name:'Frühjahrsferien', start:'2029-03-05',end:'2029-03-16'},
    {name:'Sommerferien',    start:'2029-07-02',end:'2029-08-10'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-01',end:'2029-10-12'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-04'},
  ],

  HB: [ // ── Bremen ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-25'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-05'},
    {name:'Winterferien',    start:'2026-02-02',end:'2026-02-03'},
    {name:'Osterferien',     start:'2026-03-23',end:'2026-04-07'},
    {name:'Sommerferien',    start:'2026-07-02',end:'2026-08-12'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-09'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-02'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-03'},
    {name:'Sommerferien',    start:'2027-07-08',end:'2027-08-18'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-18',end:'2027-10-30'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-08'},
    {name:'Winterferien',    start:'2028-01-31',end:'2028-02-01'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-07-20',end:'2028-08-30'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-11-04'},
    {name:'Weihnachtsferien',start:'2028-12-27',end:'2029-01-06'},
    {name:'Winterferien',    start:'2029-02-01',end:'2029-02-02'},
    {name:'Osterferien',     start:'2029-03-19',end:'2029-04-03'},
    {name:'Sommerferien',    start:'2029-07-19',end:'2029-08-29'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-05'},
  ],

  SH: [ // ── Schleswig-Holstein ──────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-20',end:'2025-10-30'},
    {name:'Weihnachtsferien',start:'2025-12-19',end:'2026-01-06'},
    {name:'Winterferien',    start:'2026-02-02',end:'2026-02-03'},
    {name:'Osterferien',     start:'2026-03-26',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-15'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-06'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-02'},
    {name:'Osterferien',     start:'2027-03-30',end:'2027-04-10'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-14'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-11',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-08'},
    {name:'Osterferien',     start:'2028-04-03',end:'2028-04-15'},
    {name:'Sommerferien',    start:'2028-06-24',end:'2028-08-04'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-02',end:'2028-10-30'},
    {name:'Weihnachtsferien',start:'2028-12-21',end:'2029-01-05'},
    {name:'Osterferien',     start:'2029-03-23',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-06-23',end:'2029-08-03'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-08',end:'2029-10-19'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-08'},
  ],

  RP: [ // ── Rheinland-Pfalz ─────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-07'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-06-29',end:'2026-08-07'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-05',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-08'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-02'},
    {name:'Sommerferien',    start:'2027-06-28',end:'2027-08-06'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-04',end:'2027-10-15'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-07'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-21'},
    {name:'Sommerferien',    start:'2028-07-03',end:'2028-08-11'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-09',end:'2028-10-20'},
    {name:'Weihnachtsferien',start:'2028-12-21',end:'2029-01-08'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-07-16',end:'2029-08-24'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-24',end:'2030-01-09'},
  ],

  SL: [ // ── Saarland ────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-02'},
    {name:'Winterferien',    start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-04-07',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-29',end:'2026-08-07'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-05',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2026-12-31'},
    {name:'Winterferien',    start:'2027-02-08',end:'2027-02-12'},
    {name:'Osterferien',     start:'2027-03-30',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-06-28',end:'2027-08-06'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-04',end:'2027-10-15'},
    {name:'Weihnachtsferien',start:'2027-12-20',end:'2027-12-31'},
    {name:'Winterferien',    start:'2028-02-21',end:'2028-02-29'},
    {name:'Osterferien',     start:'2028-04-12',end:'2028-04-21'},
    {name:'Sommerferien',    start:'2028-07-03',end:'2028-08-11'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-09',end:'2028-10-20'},
    {name:'Weihnachtsferien',start:'2028-12-20',end:'2029-01-02'},
    {name:'Winterferien',    start:'2029-02-12',end:'2029-02-16'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-07-16',end:'2029-08-24'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-04'},
  ],

  SN: [ // ── Sachsen ─────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-06',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-02'},
    {name:'Winterferien',    start:'2026-02-09',end:'2026-02-21'},
    {name:'Osterferien',     start:'2026-04-03',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-14'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-08',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-26',end:'2027-04-02'},
    {name:'Sommerferien',    start:'2027-07-10',end:'2027-08-20'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-11',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2028-01-01'},
    {name:'Winterferien',    start:'2028-02-14',end:'2028-02-26'},
    {name:'Osterferien',     start:'2028-04-14',end:'2028-04-22'},
    {name:'Sommerferien',    start:'2028-07-22',end:'2028-09-01'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-11-03'},
    {name:'Weihnachtsferien',start:'2028-12-23',end:'2029-01-03'},
    {name:'Winterferien',    start:'2029-02-05',end:'2029-02-16'},
    {name:'Osterferien',     start:'2029-03-29',end:'2029-04-06'},
    {name:'Sommerferien',    start:'2029-07-21',end:'2029-08-31'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-22',end:'2030-01-04'},
  ],

  ST: [ // ── Sachsen-Anhalt ──────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-25'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-05'},
    {name:'Winterferien',    start:'2026-01-31',end:'2026-02-06'},
    {name:'Osterferien',     start:'2026-03-30',end:'2026-04-04'},
    {name:'Pfingstferien',   start:'2026-05-26',end:'2026-05-29'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-14'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-19',end:'2026-10-30'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-06'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-03-27'},
    {name:'Pfingstferien',   start:'2027-05-15',end:'2027-05-22'},
    {name:'Sommerferien',    start:'2027-07-10',end:'2027-08-20'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-18',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-20',end:'2027-12-31'},
    {name:'Winterferien',    start:'2028-02-07',end:'2028-02-12'},
    {name:'Osterferien',     start:'2028-04-10',end:'2028-04-22'},
    {name:'Pfingstferien',   start:'2028-06-03',end:'2028-06-10'},
    {name:'Sommerferien',    start:'2028-07-22',end:'2028-09-01'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-30',end:'2028-11-03'},
    {name:'Weihnachtsferien',start:'2028-12-21',end:'2029-01-02'},
    {name:'Winterferien',    start:'2029-02-05',end:'2029-02-10'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-03-31'},
    {name:'Pfingstferien',   start:'2029-05-11',end:'2029-05-25'},
    {name:'Sommerferien',    start:'2029-07-21',end:'2029-08-31'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-29',end:'2029-11-02'},
    {name:'Weihnachtsferien',start:'2029-12-21',end:'2030-01-05'},
  ],

  TH: [ // ── Thüringen ───────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-06',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-03'},
    {name:'Winterferien',    start:'2026-02-16',end:'2026-02-21'},
    {name:'Osterferien',     start:'2026-04-07',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-14'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-23',end:'2027-01-02'},
    {name:'Winterferien',    start:'2027-02-01',end:'2027-02-06'},
    {name:'Osterferien',     start:'2027-03-22',end:'2027-04-03'},
    {name:'Sommerferien',    start:'2027-07-10',end:'2027-08-20'},
    // 2027/2028
    {name:'Herbstferien',    start:'2027-10-09',end:'2027-10-23'},
    {name:'Weihnachtsferien',start:'2027-12-23',end:'2027-12-31'},
    {name:'Winterferien',    start:'2028-02-07',end:'2028-02-12'},
    {name:'Osterferien',     start:'2028-04-03',end:'2028-04-15'},
    {name:'Sommerferien',    start:'2028-07-22',end:'2028-09-01'},
    // 2028/2029
    {name:'Herbstferien',    start:'2028-10-23',end:'2028-11-03'},
    {name:'Weihnachtsferien',start:'2028-12-23',end:'2029-01-05'},
    {name:'Winterferien',    start:'2029-02-12',end:'2029-02-17'},
    {name:'Osterferien',     start:'2029-03-26',end:'2029-04-07'},
    {name:'Sommerferien',    start:'2029-07-21',end:'2029-08-31'},
    // 2029/2030
    {name:'Herbstferien',    start:'2029-10-22',end:'2029-11-03'},
    {name:'Weihnachtsferien',start:'2029-12-22',end:'2030-01-04'},
  ],

  // ══════════════════════════════════════════════════════════════
  // ÖSTERREICH
  // Quelle: Bundesministerium für Bildung (bmbwf.gv.at)
  // Semesterferien rotieren: Gruppe A=W/NÖ/Bgld, B=OÖ/S/T/V, C=K/Stmk
  // Sommerferien: bundesweit einheitlich 9 Wochen
  // ══════════════════════════════════════════════════════════════

  AT_W: [ // ── Wien (Semesterferien Gruppe A) ──────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-09',end:'2026-02-13'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-08',end:'2027-02-12'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_NOE: [ // ── Niederösterreich (Semesterferien Gruppe A) ─────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-09',end:'2026-02-13'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-08',end:'2027-02-12'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_B: [ // ── Burgenland (Semesterferien Gruppe A) ────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-09',end:'2026-02-13'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-11',end:'2026-09-13'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-08',end:'2027-02-12'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-10',end:'2027-09-12'},
  ],

  AT_OOE: [ // ── Oberösterreich (Semesterferien Gruppe B) ───────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-15',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_S: [ // ── Salzburg (Semesterferien Gruppe B) ─────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-15',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_T: [ // ── Tirol (Semesterferien Gruppe B) ─────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-15',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_V: [ // ── Vorarlberg (Semesterferien Gruppe B) ─────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-16',end:'2026-02-20'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-15',end:'2027-02-19'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_K: [ // ── Kärnten (Semesterferien Gruppe C) ───────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-23',end:'2026-02-27'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-22',end:'2027-02-26'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  AT_STMK: [ // ── Steiermark (Semesterferien Gruppe C) ──────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-27',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-24',end:'2026-01-06'},
    {name:'Semesterferien',  start:'2026-02-23',end:'2026-02-27'},
    {name:'Osterferien',     start:'2026-03-28',end:'2026-04-10'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-09-06'},
    {name:'Herbstferien',    start:'2026-10-26',end:'2026-10-30'},
    // 2026/2027
    {name:'Weihnachtsferien',start:'2026-12-24',end:'2027-01-06'},
    {name:'Semesterferien',  start:'2027-02-22',end:'2027-02-26'},
    {name:'Osterferien',     start:'2027-03-27',end:'2027-04-09'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-09-05'},
  ],

  // ══════════════════════════════════════════════════════════════
  // SCHWEIZ  (Schuljahresbeginn: August; Ferien kantonsweise)
  // Quelle: Kantonale Erziehungsdirektionen
  // ══════════════════════════════════════════════════════════════

  CH_ZH: [ // ── Zürich ──────────────────────────────────────────
    // 2025/2026 (SJ-Start ~18.08.2025)
    {name:'Herbstferien',    start:'2025-09-27',end:'2025-10-11'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-18'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    // 2026/2027 (SJ-Start ~17.08.2026)
    {name:'Herbstferien',    start:'2026-09-26',end:'2026-10-10'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-17'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_BE: [ // ── Bern ─────────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-06',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-02'},
    {name:'Sportferien',     start:'2026-02-02',end:'2026-02-13'},
    {name:'Frühlingsferien', start:'2026-04-06',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-29',end:'2026-08-02'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-05',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-01'},
    {name:'Sportferien',     start:'2027-02-01',end:'2027-02-12'},
    {name:'Frühlingsferien', start:'2027-04-05',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-28',end:'2027-08-01'},
  ],

  CH_LU: [ // ── Luzern ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_AG: [ // ── Aargau ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-23',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-13',end:'2026-04-24'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-09'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-22',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-12',end:'2027-04-23'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-08'},
  ],

  CH_SG: [ // ── St. Gallen ───────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_BS: [ // ── Basel-Stadt ──────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-16'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-15'},
  ],

  CH_BL: [ // ── Basel-Landschaft ─────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-09'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-08'},
  ],

  CH_TG: [ // ── Thurgau ──────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_GR: [ // ── Graubünden ───────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-25'},
    {name:'Weihnachtsferien',start:'2025-12-20',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-24'},
    {name:'Weihnachtsferien',start:'2026-12-19',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_SO: [ // ── Solothurn ────────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_SH: [ // ── Schaffhausen ─────────────────────────────────────
    // 2025/2026
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-18'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    // 2026/2027
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-17'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_AR: [ // ── Appenzell Ausserrhoden ───────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_AI: [ // ── Appenzell Innerrhoden ────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-15'},
  ],

  CH_GL: [ // ── Glarus ──────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_ZG: [ // ── Zug ─────────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_SZ: [ // ── Schwyz ──────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_OW: [ // ── Obwalden ────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_NW: [ // ── Nidwalden ────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_UR: [ // ── Uri ──────────────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-04',end:'2025-10-17'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Fasnachtsferien', start:'2026-03-02',end:'2026-03-06'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-07-04',end:'2026-08-09'},
    {name:'Herbstferien',    start:'2026-10-03',end:'2026-10-16'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Fasnachtsferien', start:'2027-03-01',end:'2027-03-05'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-07-03',end:'2027-08-08'},
  ],

  CH_FR: [ // ── Freiburg / Fribourg (zweisprachig) ───────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-16',end:'2026-02-27'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-23'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-15',end:'2027-02-26'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-15'},
  ],

  CH_TI: [ // ── Tessin / Ticino (ital.) ──────────────────────────
    // Schuljahr beginnt Mitte September
    {name:'Herbstferien',    start:'2025-10-25',end:'2025-11-02'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-07'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-13',end:'2026-09-13'},
    {name:'Herbstferien',    start:'2026-10-24',end:'2026-11-01'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-06'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-12',end:'2027-09-12'},
  ],

  CH_VD: [ // ── Waadt / Vaud (franz.) ────────────────────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-16',end:'2026-02-27'},
    {name:'Frühlingsferien', start:'2026-04-13',end:'2026-04-24'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-31'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-23'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-15',end:'2027-02-26'},
    {name:'Frühlingsferien', start:'2027-04-12',end:'2027-04-23'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-29'},
  ],

  CH_GE: [ // ── Genf / Genève (franz.) ───────────────────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-31'},
    {name:'Weihnachtsferien',start:'2025-12-20',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-09',end:'2026-02-20'},
    {name:'Frühlingsferien', start:'2026-04-13',end:'2026-04-24'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-31'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-30'},
    {name:'Weihnachtsferien',start:'2026-12-19',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-08',end:'2027-02-19'},
    {name:'Frühlingsferien', start:'2027-04-12',end:'2027-04-23'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-29'},
  ],

  CH_VS: [ // ── Wallis / Valais (zweisprachig) ───────────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-16',end:'2026-02-27'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-23'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-15',end:'2027-02-26'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-15'},
  ],

  CH_NE: [ // ── Neuenburg / Neuchâtel (franz.) ───────────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-16',end:'2026-02-27'},
    {name:'Frühlingsferien', start:'2026-04-13',end:'2026-04-24'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-23'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-15',end:'2027-02-26'},
    {name:'Frühlingsferien', start:'2027-04-12',end:'2027-04-23'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-15'},
  ],

  CH_JU: [ // ── Jura (franz.) ────────────────────────────────────
    {name:'Herbstferien',    start:'2025-10-13',end:'2025-10-24'},
    {name:'Weihnachtsferien',start:'2025-12-22',end:'2026-01-04'},
    {name:'Sportferien',     start:'2026-02-16',end:'2026-02-27'},
    {name:'Frühlingsferien', start:'2026-04-04',end:'2026-04-17'},
    {name:'Sommerferien',    start:'2026-06-27',end:'2026-08-16'},
    {name:'Herbstferien',    start:'2026-10-12',end:'2026-10-23'},
    {name:'Weihnachtsferien',start:'2026-12-21',end:'2027-01-03'},
    {name:'Sportferien',     start:'2027-02-15',end:'2027-02-26'},
    {name:'Frühlingsferien', start:'2027-04-03',end:'2027-04-16'},
    {name:'Sommerferien',    start:'2027-06-26',end:'2027-08-15'},
  ],
};

let ferienData = [];
let feiertageData = [];

// Normalisiert API-Ferien-Namen auf korrekte deutsche Schreibung:
// "pfingstferien" → "Pfingstferien", "pfingstferien Bayern 2026" → "Pfingstferien"
function normFerienName(n) {
  if (!n) return n;
  const w = n.trim().split(/\s+/)[0]; // nur erstes Wort (entfernt ggf. "Bayern 2026" etc.)
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

async function loadHolidays() {
  const land = state.land || 'DE';
  const bundesland = state.bundesland || '';
  const blCode = BL_CODES[bundesland];
  const year = new Date().getFullYear();
  const cacheKey = `ts_holidays_${land}_${bundesland}_${year}_v4`;

  // Try cache first (7 day TTL)
  try {
    const cached = localStorage.getItem(cacheKey); const _parsed = cached ? JSON.parse(cached) : null;
    if (cached) {
      const parsed = _parsed;
      if (parsed.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000) {
        ferienData = (parsed.ferien || []).map(f => ({ ...f, name: normFerienName(f.name), start: new Date(f.start), end: new Date(f.end) }));
        feiertageData = (parsed.feiertage || []).map(f => ({ ...f, date: new Date(f.date) }));
        if(typeof renderHeute==="function") renderHeute();
        if(typeof renderWoche==="function") renderWoche();
        if(typeof renderMonat==="function") renderMonat();
        if(currentView==="planung" && typeof renderPlanung==="function") renderPlanung();
        return;
      }
    }
  } catch(e) {}

  const results = { ferien: [], feiertage: [], timestamp: Date.now() };

  // 1. SCHULFERIEN
  const deCode = BL_CODES_DE[bundesland]; // only set for DE states
  if (land === 'DE' && deCode) {
    // Primary: fetch live from Worker proxy (ferien-api.de) for current + next year
    let apiOk = false;
    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TS_API_TOKEN };
      const fetches = [year - 1, year, year + 1].map(yr =>
        fetch(`${TS_API}/api/schulferien?state=${deCode}&year=${yr}`, { headers, signal: AbortSignal.timeout(6000) })
          .then(r => r.ok ? r.json() : []).catch(() => [])
      );
      const [prev, cur, nxt] = await Promise.all(fetches);
      const apiFerien = [...prev, ...cur, ...nxt].filter(f => f.name && f.start && f.end);
      if (apiFerien.length > 0) {
        results.ferien = apiFerien;
        apiOk = true;
      }
    } catch(e) { console.log('Schulferien API nicht erreichbar:', e); }

    // Fallback: embedded data
    if (!apiOk && FERIEN_EMBEDDED[deCode]) {
      results.ferien = FERIEN_EMBEDDED[deCode].map(f => ({ name: f.name, start: f.start, end: f.end }));
    }
  } else if (blCode && FERIEN_EMBEDDED[blCode]) {
    // AT/CH: always use embedded data
    results.ferien = FERIEN_EMBEDDED[blCode].map(f => ({ name: f.name, start: f.start, end: f.end }));
  }

  // 2. FEIERTAGE: Fetch from API (has CORS support) — 5s Timeout
  const iso = { DE:'DE', AT:'AT', CH:'CH' }[land] || 'DE';
  for (const yr of [year - 1, year, year + 1]) {
    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${yr}/${iso}`, { signal: controller.signal });
      clearTimeout(tId);
      if (res.ok) {
        const data = await res.json();
        const nagerCode = BL_NAGER[bundesland];
        const filtered = data
          .filter(f => !f.counties || f.counties.length === 0 || (nagerCode && f.counties.includes(nagerCode)))
          .map(f => ({ name: f.localName || f.name, date: f.date }));
        results.feiertage.push(...filtered);
      }
    } catch(e) { console.log(`Feiertage API ${yr} nicht erreichbar:`, e); }
  }

  // Cache results
  try { localStorage.setItem(cacheKey, JSON.stringify(results)); } catch(e) {}

  // Parse into usable format
  ferienData = results.ferien.map(f => ({ name: normFerienName(f.name), start: new Date(f.start + 'T00:00:00'), end: new Date(f.end + 'T00:00:00') }));
  feiertageData = results.feiertage.map(f => ({ name: f.name, date: new Date(f.date + 'T00:00:00') }));

  if(typeof renderHeute==="function") renderHeute();
  if(typeof renderWoche==="function") renderWoche();
  if(typeof renderMonat==="function") renderMonat();
  if(currentView==="planung" && typeof renderPlanung==="function") renderPlanung();
  if(currentView==="ferien-countdown" && typeof renderFerienCountdown==="function") renderFerienCountdown();
}

function isFerien(date) {
  const ds = dateStr(date);
  return ferienData.find(f => ds >= dateStr(f.start) && ds <= dateStr(f.end));
}

function isFeiertag(date) {
  const ds = dateStr(date);
  return feiertageData.find(f => dateStr(f.date) === ds);
}

function getHolidayInfo(date) {
  const ferien = isFerien(date);
  const feiertag = isFeiertag(date);
  return { ferien, feiertag, isHoliday: !!(ferien || feiertag) };
}

/* ═══════════════════════════════════════════
   FERIEN-COUNTDOWN
   ═══════════════════════════════════════════ */
function renderFerienCountdown() {
  const container = document.getElementById('view-ferien-countdown');
  if (!container) return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const _sj = getSchuljahrStart();
    const sjYear  = typeof _sj === 'number' ? _sj : _sj.getFullYear();
    const land    = (state && state.land) || 'DE';
    // CH Schuljahr beginnt im August; AT/DE im September
    const sjMonth = land === 'CH' ? 7 : 8;
    const sjStart = new Date(sjYear, sjMonth, 1);
    const sjEnd   = new Date(sjYear + 1, 8, 30); // 30. Sep — Sommerferien enden spätestens Mitte Sep; Herbstferien (Okt) gehören zum nächsten SJ

    // Build Ferien list — ferienData is already populated from embedded (no separate Schulferien API).
    // Fall back to embedded only if ferienData is empty (e.g. loadHolidays not yet called).
    const bl = (state && state.bundesland) || '';
    const blCode = BL_CODES[bl] || bl;
    const toDate = s => s instanceof Date ? new Date(s) : new Date(s + 'T00:00:00');
    const source = ferienData.length > 0
      ? ferienData.map(f => ({ name: f.name, start: toDate(f.start), end: toDate(f.end) }))
      : (FERIEN_EMBEDDED[blCode] || FERIEN_EMBEDDED[bl] || []).map(f => ({ name: f.name, start: toDate(f.start), end: toDate(f.end) }));
    const allFerien = source
      .filter(f => f.end >= sjStart && f.start <= sjEnd)
      .sort((a, b) => a.start - b.start);

    const inFerien   = allFerien.find(f => f.start <= today && f.end >= today);
    const upcoming   = allFerien.filter(f => f.start > today);

    // ── Segment-Start für jeden Ferien bestimmen ──
    // Sommerferien: ab Schuljahresbeginn
    // Alle anderen: ab dem Tag nach dem Ende der vorherigen Ferien
    const isSommer = n => n.toLowerCase().includes('sommer');
    allFerien.forEach((f, i) => {
      if(isSommer(f.name) || i === 0) {
        f._segStart = new Date(sjStart);
      } else {
        const prev = allFerien[i - 1];
        const afterPrev = new Date(prev.end);
        afterPrev.setDate(afterPrev.getDate() + 1);
        f._segStart = afterPrev;
      }
    });

    const _d  = d => `${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
    const _ds = d => `${d.getDate()}. ${MONATE[d.getMonth()]}`;
    const ICONS = { Sommer:'☀️', Herbst:'🍂', Weihnacht:'🎄', Oster:'🐣', Pfingst:'🌿', Frühjahr:'🌸', Faschings:'🎭', Winter:'❄️' };
    const fIcon = n => { for(const [k,v] of Object.entries(ICONS)) if(n.toLowerCase().includes(k.toLowerCase())) return v; return '🏖️'; };

    function schoolDays(from, target) {
      let c = 0, d = new Date(from < target ? from : today);
      while(d < target){ const dw = d.getDay(); if(dw>=1&&dw<=5&&!getHolidayInfo(d).isHoliday) c++; d.setDate(d.getDate()+1); }
      return c;
    }
    function schoolWeeks(from, target) {
      const d = new Date(from < target ? from : today);
      const dw = (d.getDay()+6)%7; if(dw>0) d.setDate(d.getDate()+(7-dw));
      let w = 0;
      while(d < target){
        for(let i=0;i<5;i++){const dd=new Date(d);dd.setDate(dd.getDate()+i);if(dd<target&&!getHolidayInfo(dd).isHoliday){w++;break;}}
        d.setDate(d.getDate()+7);
      }
      return w;
    }

    // Fortschrittsbalken-Prozent für Ferien f (segmentStart → f.start)
    function segPct(f) {
      const total = f.start - f._segStart;
      if(total <= 0) return 100;
      const passed = today - f._segStart;
      if(passed <= 0) return 0;
      if(passed >= total) return 100;
      return Math.round(passed / total * 100);
    }

    const isPast    = f => f.end < today;
    const isCurrent = f => f.start <= today && f.end >= today;
    const isNext    = (f, i) => !isCurrent(f) && !isPast(f) && allFerien.filter(x => !isPast(x) && !isCurrent(x)).indexOf(f) === 0;

    let html = `<div style="padding:var(--sp-lg)">`;

    // ── Header ──
    html += `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px">
      <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--ts-navy)">🏖️ Ferien-Countdown</div>
    </div>
    <div style="font-size:.82rem;color:var(--ts-text-muted);margin-bottom:var(--sp-lg)">Schuljahr ${sjYear}/${sjYear+1}${bl?' · '+bl:''}</div>`;

    if(!allFerien.length) {
      html += `<div style="text-align:center;padding:40px;color:var(--ts-text-muted)">Keine Feriendaten verfügbar.<br>Bitte prüfe dein Bundesland in den Einstellungen.</div>`;
    } else {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">`;

      allFerien.forEach((f, i) => {
        const past    = isPast(f);
        const current = isCurrent(f);
        const next    = isNext(f, i);
        const pct     = segPct(f);
        const dauer   = Math.ceil((f.end - f.start) / 86400000) + 1;
        const calDays = Math.ceil((f.start - today) / 86400000);
        const sDays   = !past && !current ? schoolDays(today, f.start) : 0;
        const sWeeks  = !past && !current ? schoolWeeks(today, f.start) : 0;

        // Segment-Label für Fortschrittsbalken
        const segLabel = isSommer(f.name)
          ? `🏫 ${sjYear < 100 ? sjYear : sjYear} Schulstart`
          : `🔔 Nach ${allFerien[i-1] ? allFerien[i-1].name.replace('ferien','ferien') : 'Schulstart'}`;

        // Farben je Status
        const borderCol  = current ? '#3BA89B' : next ? '#3BA89B' : past ? 'var(--ts-border-light)' : 'var(--ts-border-light)';
        const borderWidth = (current || next) ? '2px' : '1px';
        const opacity     = past ? '.55' : '1';
        const barColor    = current ? '#3BA89B' : next ? '#3BA89B' : past ? '#9AABB8' : '#5B8EC9';

        let card = `<div style="background:var(--ts-bg-card);border:${borderWidth} solid ${borderCol};border-radius:14px;padding:18px;opacity:${opacity};display:flex;flex-direction:column;gap:12px">`;

        // Status-Badge
        if(current) card += `<div style="display:inline-flex;align-items:center;gap:5px;background:#3BA89B20;color:#3BA89B;font-size:.65rem;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:20px;width:fit-content">🎉 Gerade Ferien</div>`;
        else if(next) card += `<div style="display:inline-flex;align-items:center;gap:5px;background:#3BA89B15;color:#3BA89B;font-size:.65rem;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:20px;width:fit-content">⏭ Nächste Ferien</div>`;
        else if(past) card += `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--ts-bg-warm);color:var(--ts-text-muted);font-size:.65rem;font-weight:700;letter-spacing:.08em;padding:3px 8px;border-radius:20px;width:fit-content">✓ Vorbei</div>`;

        // Name + Datum
        card += `<div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:2.2rem;line-height:1">${fIcon(f.name)}</div>
          <div>
            <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--ts-navy)">${f.name}</div>
            <div style="font-size:.75rem;color:var(--ts-text-muted)">${_d(f.start)} – ${_ds(f.end)}. &nbsp;·&nbsp; ${dauer} Tage</div>
          </div>
        </div>`;

        // Fortschrittsbalken
        const barPct  = past ? 100 : current ? 100 : pct;
        const barPctDisplay = past ? 100 : pct;
        card += `<div>
          <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--ts-text-muted);margin-bottom:5px">
            <span>${segLabel}</span>
            <span style="font-weight:600;color:${past?'var(--ts-text-muted)':barColor}">${barPctDisplay}%</span>
            <span>🌴 Ferien</span>
          </div>
          <div style="position:relative;height:22px;background:var(--ts-bg-warm);border-radius:11px;overflow:visible">
            <div style="position:absolute;inset:0;width:${Math.min(100,barPct)}%;background:linear-gradient(90deg,${barColor},${barColor}cc);border-radius:11px"></div>`;
        if(!past) {
          const emojiLeft = Math.min(95, Math.max(2, barPct));
          card += `<div style="position:absolute;top:50%;transform:translate(-50%,-50%);left:${emojiLeft}%;font-size:1.1rem;line-height:1;z-index:1">${current ? '😎' : '🧑‍🏫'}</div>`;
        }
        card += `</div>
          <div style="text-align:right;font-size:.65rem;color:var(--ts-text-muted);margin-top:3px">🏖️ Strand wartet…</div>
        </div>`;

        // Countdown-Zahlen (nur für zukünftige)
        if(!past && !current) {
          card += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center">
            <div style="background:${next?'var(--ts-teal)':'var(--ts-bg-warm)'};border-radius:10px;padding:8px 4px;${next?'color:#fff':'color:var(--ts-navy)'}">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;line-height:1">${calDays}</div>
              <div style="font-size:.62rem;opacity:.85;margin-top:2px">Tage 📅</div>
            </div>
            <div style="background:${next?'var(--ts-navy)':'var(--ts-bg-warm)'};border-radius:10px;padding:8px 4px;${next?'color:#fff':'color:var(--ts-navy)'}">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;line-height:1">${sDays}</div>
              <div style="font-size:.62rem;opacity:.85;margin-top:2px">Schultage 📚</div>
            </div>
            <div style="background:${next?'#5B8EC9':'var(--ts-bg-warm)'};border-radius:10px;padding:8px 4px;${next?'color:#fff':'color:var(--ts-navy)'}">
              <div style="font-family:var(--font-display);font-size:1.5rem;font-weight:700;line-height:1">${sWeeks}</div>
              <div style="font-size:.62rem;opacity:.85;margin-top:2px">Schulwochen 📆</div>
            </div>
          </div>`;
        } else if(current) {
          const daysLeft = Math.ceil((f.end - today) / 86400000) + 1;
          card += `<div style="text-align:center;padding:6px;background:#3BA89B15;border-radius:10px;color:#3BA89B;font-family:var(--font-display);font-size:1.1rem;font-weight:700">
            Noch ${daysLeft} Tag${daysLeft!==1?'e':''} genießen! 🌴
          </div>`;
        }

        card += `</div>`;
        html += card;
      });

      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<div style="padding:var(--sp-lg);color:var(--ts-error);font-size:.85rem">Fehler beim Laden: ${e.message}<br><small style="opacity:.6">${e.stack||''}</small></div>`;
  }
}



# TeachSmarter Dashboard — Projektkontext

## Was ist das?
iPad-optimierter Lehrerkalender als PWA (Vanilla HTML/CSS/JS, kein Framework).
Zielmarkt: DACH, alle Schularten. Domain: app.teachsmarter.de

## Branding
- Teal: #3BA89B, Navy: #1A3C5E, Bg: #FAF8F5
- Fonts: Source Serif 4 (Display) + DM Sans (Body)
- Touch-Targets: min 48px, Tablet-First (max 960px)

---

## Dateistruktur (aktuell — Multi-File-Split ist FERTIG)

```
TeachSmarter_Dashboard.html  — Shell: Nav, Views, CSS, Script-Tags
ts-core.js                   — State, CryptoManager, navigate(), callKI(), esc()
ts-app.js                    — DOMContentLoaded, initApp(), PIN-Screen, Einstellungen
ts-kalender.js               — Heute/Woche/Monat-Views, Stundenplan-Kacheln
ts-events.js                 — Termine (CRUD, Modal, Kategorien)
ts-ferien.js                 — Ferien/Feiertage (embedded + date.nager.at)
ts-planung.js                — Jahres- & Sequenzplanung, Drag & Drop
ts-stunde.js                 — Stundenvorbereitung, PIN-Screen-Logic,
                               MediaDB-Helpers, AB-Panel, svSaveTafelbildAsMedia
ts-tools.js                  — Alle 6 KI-Werkzeuge, Materialdatenbank-View
ts-klassen.js                — Klassendetail-View, Noten, SuS-Verwaltung
worker.js                    — Cloudflare Worker: KI-Proxy, Lizenz, Credits
sw.js                        — Service Worker (Cache, Offline)
```

---

## Architektur & State

### Storage (IndexedDB via TSStore + CryptoManager)
| Key | Inhalt | Verschlüsselt |
|-----|--------|---------------|
| `ts_state` | Vorname, Schulname, Klassen, Stundenplan, Fächer | ✓ AES-256-GCM |
| `ts_events` | Termine | ✓ |
| `ts_jahresplan_v2` | Jahresplanung (Lernbereiche, Sequenzen) | ✓ |
| `ts_notizen` | Tages/Wochen/Monatsnotizen | ✓ |
| `ts_stunden` | Stundenvorbereitungen (stundenCache) | ✓ |
| `ts_material_db` | Materialien/Medien (mediaCache) | ✓ |
| `ts_crypto_salt` | PBKDF2-Salt | — |
| `ts_pin_verify` | AES-verschlüsseltes "ts-ok" (PIN-Check) | — |

### CryptoManager (ts-core.js)
- AES-256-GCM, PBKDF2 (200.000 Iterationen, SHA-256)
- Key ist `extractable: true` → wird nach PIN-Eingabe als Rohbytes in `sessionStorage` ('ts_session_key') gespeichert
- Beim nächsten Seitenload: `restoreSession()` importiert Key aus sessionStorage → **kein PIN-Dialog bei F5**
- Tab schließen → sessionStorage leer → PIN wird wieder abgefragt
- `lockSession()` löscht sessionStorage-Key manuell (Button "🔒 Sitzung sperren" in Einstellungen)
- PIN-Änderung → `saveSession()` aktualisiert sessionStorage-Key

### Klassen-Objekte (state.klassen)
```js
{ id: 'kl_abc123', name: '7a', sus: 26, faecher: ['fach-id-1', 'fach-id-2'] }
```
Klassenstufe wird per Regex `(\d+)` aus dem Namen extrahiert (z.B. "7a" → "7", "Klasse 7a" → "7").

---

## Materialien/Medien (MediaDB)

### Item-Schema
```js
{
  id: 'media_...',
  name: 'Titel',
  type: 'html' | 'pdf' | 'image' | 'video' | 'link' | 'doc',
  content: '...',        // für html: vollständiges HTML-Dokument
  rawData: '...',        // JSON-String des KI-Outputs (für Re-Generierung)
  fachTags: ['fach-id'], // IDs aus getAllFaecher()
  klassenIds: ['kl_id'], // IDs aus state.klassen
  tags: ['arbeitsblatt', 'ki-generiert', ...],
  source: 'ki' | 'own',
  createdAt: ISO-String,
  isTafelbild: true,     // nur bei Tafelbildern
}
```

### Virtueller Typ 'html-tb'
Tafelbilder haben `type:'html'` + `isTafelbild:true`.
Filter/Darstellung nutzen den virtuellen Key `'html-tb'` für separates Icon (🪟) und Farbe (#E8F5E9).

### Klassen-Filter-Logik
`_svFilter.klasse` enthält Klassenstufen-String ('7').
`m.klassenIds` enthält Klassen-IDs ('kl_abc123').
→ Auflösung: alle Klassen-Objekte mit passender Stufe (via `(\d+)`-Regex) holen, deren IDs mit `m.klassenIds` vergleichen.

### Fach/Klasse-Zuweisung beim Erstellen
**Wichtig:** Fach und Klassen werden BEIM ERSTELLEN im Formular erfasst — nicht in einem nachträglichen Save-Dialog.
- AB-Tool & Tafelbild-Tool: Fach = `<select>` aus `getAllFaecher()` (value = fach.id), Klassen = Checkboxen aus `state.klassen`
- Stundenvorbereitung: Fach + Klasse kommen aus `svContext.fachId` / `svContext.klasseId`
- `getAllFaecher()` liefert builtin FAECHER + state.customFaecher — immer diese verwenden, nie nur `state.faecher`

---

## KI-Werkzeuge (ts-tools.js)

### Implementierte Werkzeuge (alle mit Lizenzschlüssel-Gate)
| Tool | View-ID | Funktion | Credits |
|------|---------|----------|---------|
| Arbeitsblatt-Generator | tool-arbeitsblatt | _abShowForm/generateArbeitsblatt | 2 |
| Tafelbild-Planer | tool-tafelbild | _tbShowForm/generateTafelbild | 2 |
| Präsentations-Wizard | tool-praesentation | _prShowForm/generatePraesentation | 2 |
| Differenzierungshelfer | tool-differenzierung | _difShowForm/generateDifferenzierung | 2 |
| Exit-Ticket-Generator | tool-exitticket | _etShowForm/generateExitticket | 1 |
| Elternbrief-Assistent | tool-elternbrief | _ebShowForm/generateElternbrief | 2 |
| Interaktive Arbeitsblätter | tool-interaktiv | _ivShowForm/generateInteraktiv | 2–8 (je Umfang) |
| App-Baukasten | tool-appbaukasten | renderToolAppBaukasten/_abkGenerate | 1 pro Raum |

### Navigate-Hooks (ts-core.js navigate())
Alle Tools + Materialdatenbank sind in `navigate()` eingehängt:
```js
if(viewId === 'tool-tafelbild'){ renderToolTafelbild(); }
if(viewId === 'materialdatenbank'){ renderMaterialdatenbank(); }
// ... etc.
```

### Tafelbild-SVG-Diagramme
Worker gibt optional `diagramm`-Feld zurück:
```json
{ "typ": "dreieck|pfeilkette|kreislauf|pyramide|keine", "ecken": [...], ... }
```
`_tbDiagramSvg(diag, isTafel)` in ts-tools.js rendert inline SVG.
Feuerdreieck → `typ:'dreieck'`, 3 ecken, Seiten-Labels via `inset()`-Helper.

### Tafelbild speichern
`_tbBuildStandaloneHtml()` erzeugt vollständiges `<!DOCTYPE html>` mit expliziten Hex-Farben (keine CSS-Variablen) — funktioniert in neuem Tab ohne App-Kontext.
`_tbSaveToDb()` nutzt `_tb.form.fachId` und `_tb.form.klassenIds` direkt (aus dem Formular, kein Dialog).

---

## Materialdatenbank (ts-tools.js renderMaterialdatenbank)
- Vollseiten-View mit Suchfeld + Typ/Fach/Sort-Filter
- `_mdbRefresh()` filtert aus `getMediaDb()`, löst Klassen-IDs zu Namen auf
- Kein separater Klassen-Filter in dieser View (nur Fach-Filter + Volltextsuche)
- Volltextsuche prüft: `name`, `fachTags` (via Fach-Name), `tags[]`
- Typ-Filter `own` zeigt nur Items mit `source:'own'`

### Eigenes Material hinzufügen
- Button `+ Material hinzufügen` ruft `svAddMedia()` (aus ts-stunde.js) auf — identisches Modal wie in der Stundenvorbereitung
- Nach Speichern: `_svAfterSave()` in ts-stunde.js ruft `_mdbRefresh()` auf → Materialdatenbank-Grid aktualisiert sich
- Eigene Uploads bekommen `source:'own'` und `tags:['eigenes-material']` (gesetzt von `svSaveNewMedia`)
- **Kein eigenes Upload-Modal** in ts-tools.js — die alten Funktionen `_mdbShowUploadModal`, `_mdbUpSelectType`, `_mdbUpFileChanged`, `_mdbSaveUpload` wurden entfernt

---

## Worker.js (Cloudflare)

### KI-Kosten
```js
const KI_COSTS = {
  jahresplanung:2, sequenzplanung:2, stundenvorbereitung:1, feld_refresh:1,
  arbeitsblatt:2, tafelbild:2,
  exitticket:1, differenzierung:2, elternbrief:2, praesentation:2,
  interaktiv: dynamisch (s=2, m=3, l=5, xl=8, via creditsOverride),
  appbaukasten: 1,           // pro Raum
  appbaukasten_themen: 1,    // KI-Themenvorschläge für alle Räume
};
```

### buildPrompt() Cases
`jahresplanung`, `sequenzplanung`, `stundenvorbereitung`, `feld_refresh`,
`arbeitsblatt`, `tafelbild` (inkl. optionalem `diagramm`-JSON),
`exitticket`, `differenzierung`, `elternbrief`, `praesentation`,
`interaktiv`, `appbaukasten`, `appbaukasten_themen`

### Pläne / Credits
- `credits`: Pay-per-use
- `founder`: Einmalig, unbegrenzt (50 Starter-Credits + alle Features dauerhaft)
- `abo`: Monatlich 29 Credits + Rollover bis 58
- `premium`: wie founder

---

## Authentifizierung / Lizenz
- `licenseKey` global in localStorage 'ts_license_key'
- `isPremiumUser()` → plan ∈ ['founder','abo','premium']
- `_toolLockedView(viewId)` → Lock-Screen wenn kein licenseKey
- `verifyLicense()` → POST /verify → aktualisiert Credits-Anzeige

---

## Wichtige Konstanten & Konventionen
- `TS_API_TOKEN` in ts-core.js muss mit `API_AUTH_TOKEN` im Worker übereinstimmen
- `esc(s)` — XSS-Schutz, IMMER für nutzerkontrollierte Strings in innerHTML
- `getAllFaecher()` = [...FAECHER, ...state.customFaecher] — nie nur state.faecher
- `getKlasse(id)` — gibt Klassen-Objekt aus state.klassen
- `svContext` — aktiver Stundenkontext: `{ datum, fachId, klasseId, slotIdx }`
- SW-Version: `teachsmarter-v20` (sw.js)
- Stripe-Links: noch TEST-Links — vor Launch auf Live-Links umstellen!

---

## DSGVO
- Alle Daten lokal + verschlüsselt (AES-256-GCM in IndexedDB)
- Keine Schülerdaten an KI
- sessionStorage für Session-Key: tab-gebunden, nicht persistent

---

## Offene Punkte / Nächste Schritte
- ✓ Stripe TEST-Links → Live-Links ersetzen
- ✓ Präsentations-Wizard entfernt (aus dem Produkt genommen)
- ✓ End-to-End-Test aller KI-Werkzeuge
- ✓ Tafelbild-Diagramm-Test (Feuerdreieck → SVG-Dreieck)

→ App ist marktreif.

## ⚠️ UNBEDINGTES TODO: Electron-Desktop-App

**Warum zwingend notwendig:**
Die App sammelt hochsensible personenbezogene Daten (Schülernamen, Adressen, Noten). Auch wenn die Daten lokal in IndexedDB liegen — die App-Dateien (JS/HTML) kommen bei der gehosteten Version bei jedem Start vom Server. Ein kompromittierter Server könnte theoretisch Code einschleusen, der Daten abgreift. Für Schulen und DSGVO-konforme Umgebungen ist das nicht akzeptabel.

**Lösung: Electron-Wrapper**
- App läuft vollständig lokal — keine Server-Abhängigkeit nach Installation
- KI-Features funktionieren weiterhin über WLAN (Cloudflare Worker URL bleibt)
- Schülerdaten verlassen das Gerät physisch niemals
- Code ist für IT-Admins prüfbar und signierbar (Windows .exe / Mac .dmg)
- Installer kann Code-signiert werden → kein "unbekannter Entwickler"-Warning

**Aufwand:** gering — bestehende Codebasis braucht kaum Änderungen, nur `main.js` + `package.json` für Electron-Shell.

### Sitzung 2026-04-13 — Erledigtes
| Was | Status |
|-----|--------|
| Interaktive ABs — Inhalt-Fix (leere Arrays/Platzhalter im Prompt) | ✓ Deployed |
| Elternbrief DSGVO-konform (Platzhalter-Pflicht + Ausgabe-Checkliste) | ✓ |
| Alle Tool-Formulare Vollbreiten-Layout (`.tool-grid` 2-Spalten-CSS) | ✓ |
| Interaktive ABs in Materialdatenbank als eigener Typ ⚡ (`html-iv`) | ✓ |
| Delimiter-Format `---HTML---` statt JSON für HTML-Output | ✓ |
| **iPad Touch-Interaktion bei interaktiven ABs** | ✓ Erledigt in Sitzung 2026-04-14 |

### Sitzung 2026-04-14 (Teil 2) — Erledigtes
| Was | Status |
|-----|--------|
| `sprache` (Duolingo-Stil) aus `_IV_TYPES` entfernt — Markenname | ✓ |
| `lernpfad` (Anton-Stil) aus `_IV_TYPES` entfernt | ✓ |
| `dungeon` aus `_IV_TYPES` entfernt — lebt jetzt im App-Baukasten | ✓ |
| Neues Werkzeug **App-Baukasten** (`tool-appbaukasten`) in ts-tools.js | ✓ |
| App-Baukasten Sidebar-Button + View-Div in Dashboard.html | ✓ |
| navigate() + Titel-Map in ts-core.js erweitert | ✓ |
| Worker: `case 'appbaukasten'` (1 Credit/Raum, Fragment-Output) | ✓ |
| Worker: `case 'appbaukasten_themen'` (1 Credit, JSON-Array von Unterthemen) | ✓ |
| Worker: `KI_COSTS.appbaukasten = 1`, `appbaukasten_themen = 1` | ✓ |
| Worker: interaktiv-case aufgeräumt (lernpfad/sprache/dungeon raus) | ✓ |
| App-Baukasten: KI-Themenvorschläge (`_abkSuggestThemen`) — 1 Credit | ✓ |
| App-Baukasten: Raumkontext — `alleTitel[]` wird bei jeder Raum-Generierung mitgesendet | ✓ |
| **Materialdatenbank**: Upload-Button ruft jetzt `svAddMedia()` (SV-Modal) statt eigenem Modal auf | ✓ |
| `ts-stunde.js`: `html-iv` zu `SV_MEDIA_TYPES` hinzugefügt (Interaktiv-Filter in SV-Dropdown) | ✓ |
| `ts-stunde.js`: `_svAfterSave()` ruft nach Speichern auch `_mdbRefresh()` auf | ✓ |
| Totes Upload-Modal-Code entfernt (`_mdbShowUploadModal`, `_mdbUpSelectType`, `_mdbUpFileChanged`, `_mdbSaveUpload`) | ✓ |
| Materialdatenbank: Typ-Filter `own` für eigene Materialien (via `source:'own'`) | ✓ |
| Frontend deployed | ✓ |

### Sitzung 2026-04-14 — Erledigtes
| Was | Status |
|-----|--------|
| iPad Touch-Fix (ontouchend + touch-action:manipulation, 48px Targets, kein user-select) | ✓ |
| Token-Limit interaktiv: 8.000 → 14.000 | ✓ |
| Design-Upgrade: Google Fonts, Cards, Progress-Bar, animiertes Feedback, Sterne-Abschluss | ✓ |
| **Root-Cause-Fix**: `baseSystem` hatte "IMMER JSON" — interaktiv bekommt eigenen `interaktivBase` ohne JSON-Pflicht | ✓ |
| Credits-Fix: dynamisch je Umfang (s=2, m=3, l=5, xl=8) statt fix 1 — Worker + `callKI(creditsOverride)` | ✓ |
| `lernpfad`-Bug: `moduleCount` (max 5) → `itemCount` (10 für Standard) | ✓ |
| Parser-Fallback: `_kiParseResult` erkennt `<!DOCTYPE html>` auch ohne `---HTML---`-Delimiter | ✓ |
| iframe sandbox: `allow-same-origin` entfernt (generiertes HTML läuft isoliert, nicht unter Parent-CSP) | ✓ |
| Neuer Typ **Forscher-Dungeon** (`dungeon`): Text-Adventure, div-show/hide, Rettungsfrage mit auto-advance | ✓ |
| **Anton-Stil** (`lernpfad`): #005FCC Blau, Maskottchen, Sterne, Erklärungs-Box bei Fehler | ✓ |
| **Duolingo-Stil** (`sprache`): #58CC02 Grün, Herzen, XP, Bottom-Sheet-Feedback, Konfetti | ✓ |
| `dungeonRooms`-Formel: s=3, m=4, l/xl=5 (eigene Variable, unabhängig von `moduleCount`) | ✓ |
| Dungeon Rettungsfrage: auto-advance nach 1,5s via `setTimeout` (kein manueller Button mehr) | ✓ |

### Interaktive Arbeitsblätter — Architektur (Stand 2026-04-14, aktualisiert 2026-04-14)

#### Typen (`_IV_TYPES` in ts-tools.js) — nach Umbau
| ID | Stil | Credits (s/m/l/xl) |
|----|------|---------------------|
| `quiz` | Standard Teal | 2/3/5/8 |
| `lueckentext` | Standard Teal | 2/3/5/8 |
| `zuordnung` | Standard Teal | 2/3/5/8 |
| `memory` | Standard Teal | 2/3/5/8 |
| `karteikarten` | Standard Teal | 2/3/5/8 |

**Entfernt:** `lernpfad` (Anton-Stil), `sprache` (Duolingo-Stil, Markenverweis), `dungeon` → umgezogen in App-Baukasten

#### Wichtige Architektur-Entscheidungen
- `interaktiv` nutzt **eigenen** `interaktivBase` (NICHT `baseSystem`) — weil `baseSystem` "IMMER JSON" anweist, was das `---HTML---`-Format zerstört
- Parser (`_kiParseResult`) hat Fallback auf `<!DOCTYPE html>` falls Delimiter fehlen
- iframe hat kein `allow-same-origin` → kein Parent-CSP-Konflikt
- Credits-Override: `callKI('interaktiv', ctx, umfangCfg.credits)` → `_kiConfirmDialog` zeigt korrekte Zahl

---

### App-Baukasten — Architektur (neu, Stand 2026-04-14)

**Konzept:** Token-Problem umgehen durch Seite-für-Seite-Generierung. Jede Seite = 1 Credit.

**Flow:**
1. Formular: Hauptthema + Template (Forscher-Dungeon) + Anzahl Räume (2–8)
2. Edit-View: Liste aller Räume mit editierbaren Titeln, einzeln generierbar
3. Download: alle Räume + CSS/JS-Wrapper in eine `.html`-Datei

**State (`_abk`):**
- `mode`: `'setup'` | `'edit'`
- `form.hauptthema`, `form.template` (`'dungeon'`), `form.seitenanzahl`
- `seiten[]`: `{ nr, titel, status:'empty'|'loading'|'done'|'error', html }`

**Worker case `appbaukasten`:**
- Input: `{ hauptthema, seitenthema, raumNr, gesamtRaeume, fach, jgst, kontext }`
- Output: Delimiter-Format `---HTML---` → 4 `div.screen`-Elemente (Fragment, kein HTML-Dokument)
- Cost: `KI_COSTS.appbaukasten = 1` im Worker

**Dungeon-CSS-Wrapper** ist im Frontend (`_abkBuildFullHtml`) hardcodiert — kein externer CSS:
- Body: `#1C1C1E` dark, max-width 600px
- CSS-Klassen: `.screen`, `.progress`, `.room-title`, `.narrative`, `.question`, `.choices`, `.choice-btn`, `.correct-box`, `.wrong-box`, `.trap-box`, `.next-btn`
- JS: `show(id)` Funktion, `DOMContentLoaded` → `show('r1-q')`

**Screen-IDs pro Raum N:** `rN-q`, `rN-correct`, `rN-wrong-a`, `rN-wrong-b`; Nächster: `r(N+1)-q` oder `end`

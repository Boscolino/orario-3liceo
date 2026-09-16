# orario-3liceo

Sincronizza l'orario della classe **3 Liceo** pubblicato su
`orario.rainerum.delugan.net` con un calendario che puoi sottoscrivere
sull'iPhone, e ti notifica le variazioni. Due modalità, un solo workflow:

```
alle 06:00 (mattina)              07:00-13:00 ogni ora, +16:00, 18:00, 21:00
        │                                        │
        ├─ scarica ogni settimana                ├─ stesso controllo
        │  pubblicata dal sito                   │
        ├─ confronta con la copia salvata        ├─ se NON è cambiato nulla
        ├─ se NON è cambiato nulla                │  → nessuna notifica, silenzio
        │  → notifica "📚 Orario invariato"       │
        └─ se è cambiato qualcosa                 └─ se è cambiato qualcosa
           → rigenera docs/scuola.ics                → rigenera docs/scuola.ics
           → commit nel repo                          → commit nel repo
           → notifica "📚 Orario aggiornato"           → notifica "📚 Orario aggiornato"
```

Un solo cron gira ogni ora (`src/main.ts check auto` decide da solo, in
base all'ora locale Europe/Rome, se è il controllo del mattino o uno dei
controlli successivi — dettagli più sotto in "Modalità del controllo").

Il tuo iPhone tiene il calendario **📚 Scuola** allineato al file
`docs/scuola.ics` servito da GitHub Pages. Il Mac non serve: gira tutto
su GitHub Actions.

## Come recupera i dati (in breve)

Il sito è un'app Next.js senza login per le viste pubbliche. Espone, per
ogni classe, endpoint strutturati usati anche dal pulsante "Condividi
l'orario":

| Endpoint | Uso qui |
|---|---|
| `GET /orario/{lunedì}/classi/{slug}?giorno=…&scuola=media` | pagina settimana; da qui si legge il `publicationId` |
| `GET /api/publications/{publicationId}/json?class={slug}` | dati strutturati della settimana (fonte principale) |
| blocchi incorporati nell'HTML | usati come fallback se l'endpoint JSON non risponde |

Niente scraping "a tappeto": si scarica **solo** la classe configurata,
2 settimane, una volta al giorno (≈4–8 richieste). Coerente con i
Termini di servizio del sito, che indicano viste pubbliche / PDF / feed
ICS come output pubblici e vietano l'estrazione massiva.

Modello dati: una "publication" = una settimana, con `version` incrementale.
Ogni lezione ha un `occurrenceId` stabile, usato come UID del calendario
(niente duplicati). **Il sito non pubblica la materia**: ogni lezione è
"Lezione", quindi titoli ed eventuali variazioni sono espressi come
**docente / aula / ora / tipo attività**, non come nome della materia.

## Requisiti

- Un account GitHub (repo **pubblico**: i dati dell'orario sono già pubblici e GitHub Pages gratuito richiede repo pubblico).
- L'app **ntfy** sull'iPhone (App Store, gratis).
- Nessun server, nessun costo.

## Installazione

### 1. Repo
Metti questo progetto in un repo GitHub pubblico (es. `orario-3liceo`).

### 2. Notifiche ntfy
1. Installa l'app **ntfy** sull'iPhone.
2. Scegli un nome di *topic* lungo e non indovinabile, es.
   `orario-3liceo-8Kf2p-privato`. Chi conosce il topic può leggere le
   notifiche: trattalo come una password.
3. Nell'app: **+** → incolla il topic → *Subscribe*.
4. Su GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**
   - Name: `NTFY_TOPIC`
   - Secret: il nome del topic (solo il nome, non l'URL).

### 3. GitHub Pages (serve il calendario)
**Settings → Pages → Build and deployment → Source: Deploy from a branch**
→ Branch `main`, cartella `/docs` → *Save*.
Dopo qualche minuto il file sarà su:
`https://<tuo-utente>.github.io/orario-3liceo/scuola.ics`

### 4. Primo avvio
**Actions → "Controllo orario" → Run workflow.**
Il primo run inizializza lo stato e crea `docs/scuola.ics` **senza
inviare notifiche**. Da qui in poi parte da solo con il cron.

### 5. Sottoscrivi il calendario sull'iPhone
**Impostazioni → App → Calendario → Account calendario → Aggiungi
account → Altro → Aggiungi calendario con sottoscrizione** → incolla
l'URL `…github.io/orario-3liceo/scuola.ics` → *Avanti* → *Salva*.

Comparirà il calendario **📚 Scuola – 3 Liceo**. iOS lo aggiorna da
solo (di norma ogni poche ore; puoi forzare con "Aggiorna calendari"
tirando giù la lista dei calendari).

## Modalità del controllo

`node src/main.ts check [modo]`:

| Modo | Quando | Se NON cambia nulla | Se cambia qualcosa |
|---|---|---|---|
| `morning` (default) | alle 06:00 (`MORNING_HOUR`) | notifica "📚 Orario invariato" (una volta al giorno) | notifica le variazioni |
| `daytime` | 07:00-13:00 ogni ora, poi 16:00, 18:00, 21:00 (`DAYTIME_HOURS`) | **nessuna notifica**, silenzio | notifica le variazioni |
| `auto` | usato dal cron | sceglie da solo `morning`/`daytime`/niente in base all'ora locale Europe/Rome | — |

Un cron GitHub Actions solo (ogni ora) con `check auto` copre tutte le
fasce: alle 06:00 fa il controllo del mattino, dalle 07:00 alle 13:00 —
più un controllo alle 16:00, 18:00 e 21:00 — il controllo "silenzioso",
il resto della giornata non fa nulla (niente chiamate al sito). Così, se
durante le lezioni (o in serata) viene pubblicata una supplenza, la
ricevi entro un'ora — ma non vieni disturbato se non cambia niente. Le
ore esatte si cambiano con `MORNING_HOUR` / `DAYTIME_HOURS` (vedi
Configurazione), senza toccare il codice.

## Uso locale (facoltativo)

```bash
cp .env.example .env             # opzionale: personalizza le variabili
npm run print                    # stampa l'orario, non scrive nulla
npm run check                    # ciclo completo, modo "morning" (notifica sempre)
node src/main.ts check daytime   # come sopra, ma notifica solo se ci sono variazioni
npm run selftest                 # verifica confronto + .ics su dati simulati
node src/main.ts test-notify     # invia una notifica di prova su ntfy
```

Per una notifica di prova senza terminale: **Actions → "Controllo orario"
→ Run workflow** e spunta *"Invia una notifica di prova"*.

Richiede **Node ≥ 22.6** (esegue i file `.ts` direttamente, nessuna
dipendenza da installare).

## Configurazione

Variabili (in `.env` per l'uso locale, nel blocco `env:` del workflow
per GitHub Actions):

| Variabile | Default | Note |
|---|---|---|
| `CLASS_SLUG` | `3liceo` | slug della classe nell'URL del sito |
| `CLASS_NAME` | `3 Liceo` | etichetta per log e notifiche |
| `SITE_HOST` | `orario.rainerum.delugan.net` | se un domani passa a `orario.rainerum.it`, cambia solo qui |
| `CHECK_WEEKS` | `4` | minimo di settimane controllate sempre (corrente + successive) |
| `MAX_WEEKS` | `45` | tetto di settimane guardate avanti; ci si ferma dopo 3 settimane consecutive non pubblicate |
| `TIMEZONE` | `Europe/Rome` | |
| `MORNING_HOUR` | `6` | ora locale del controllo che notifica sempre |
| `DAYTIME_HOURS` | `7,8,9,10,11,12,13,16,18,21` | ore locali dei controlli che notificano solo le variazioni |
| `CALENDAR_NAME` | `📚 Scuola` | nome del calendario nell'`.ics` |
| `SCHOOL_VENUE` | `Scuola Salesiani Rainerum, Piazza Domenicani 15, 39100 Bolzano` | campo Luogo di ogni lezione (l'aula resta nelle note) |
| `NTFY_TOPIC` | *(vuoto)* | vuoto = notifiche disattivate, solo log |
| `NTFY_SERVER` | `https://ntfy.sh` | |

Nessuna password o credenziale nel repo: il topic ntfy sta nei Secrets.

## Materie (config/materie.json)

Il sito non pubblica la materia, quindi la ricaviamo dal docente tramite
`config/materie.json`:

- `byLastName`: `"cognome": "Materia"` (cognome minuscolo, senza accenti).
  Titolo evento → `Lezione di <Materia>`. I docenti non elencati restano
  col cognome come titolo.
- `biweekly`: docenti che alternano due materie a settimane. `altWeeks` è
  l'elenco dei **lunedì** (`YYYY-MM-DD`) in cui si fa `alt`; tutte le altre
  settimane usano `default`. Esempio: Pontalti fa `Storia dell'arte` di
  default e `Disegno tecnico` nelle settimane elencate in `altWeeks`.

Modifica il file, commit & push: al run successivo i titoli si aggiornano.

## Vacanze (config/vacanze.json)

Periodi senza lezioni per le scuole in lingua italiana della Provincia di
Bolzano, a.s. 2026/27 (pausa autunnale, Immacolata, Natale, Carnevale,
Pasqua, Festa della Repubblica). Le lezioni che cadono in questi giorni
**non vengono messe in calendario**. Con `addAllDayMarkers: true` il feed
aggiunge un evento "tutto il giorno" 🏖️ per ogni periodo.

## Filtri (config/filtri.json)

`escludiSeContiene`: elenco di parole (minuscole). Una lezione che le
contiene — nel titolo, docente, nota, aula o tipo — viene esclusa dal
calendario. Preimpostate: `banda`, `oboe`. (Nota: la sorgente della classe
3 Liceo non contiene queste attività; il filtro è un paracadute nel caso
comparissero.)

## Cosa NON fa / limiti noti

- **Materia**: ricavata dal docente via `config/materie.json` (vedi sopra);
  dove il docente non è mappato resta il cognome.
- **Orari cron e ora legale**: GitHub Actions usa UTC; il cron gira ogni
  ora (04:00-12:00 UTC) ed è `check auto` a decidere il da farsi in base
  all'ora locale Europe/Rome, quindi resta corretto sia d'inverno sia
  d'estate senza bisogno di cron diversi per stagione. Il cron può
  comunque ritardare di qualche minuto.
- **Latenza calendario**: la sottoscrizione `.ics` è aggiornata da iOS,
  non in tempo reale. La notifica ntfy però arriva subito.
- **Settimane future**: il sito pubblica una settimana per volta. Il
  sistema guarda avanti finché trova settimane pubblicate (fino a
  `MAX_WEEKS`), quindi quando esce l'orario definitivo — anche se
  pubblicato molte settimane in blocco — finisce tutto in calendario da
  solo. Le settimane non ancora pubblicate vengono ignorate.
- **Heartbeat**: `state/last-run.txt` viene aggiornato a ogni run e
  committato, così il cron non viene disattivato per inattività.
- Se il feed `.ics` del sito, quando pubblicheranno più settimane
  insieme, cambierà comportamento, va riverificato: il codice comunque
  non dipende da quel feed (usa le pagine settimana per settimana).

## Struttura

```
src/
  config.ts     lettura variabili d'ambiente (+ .env)
  dates.ts      calcoli su settimane/giorni/minuti
  fetch.ts      download dal sito (richieste condizionali, ritardo tra chiamate)
  parse.ts      normalizzazione JSON + fallback dai blocchi nell'HTML
  diff.ts       confronto orario precedente vs attuale
  summary.ts    testo di notifica e righe di dettaglio
  ics.ts        generazione docs/scuola.ics (UID stabili, folding RFC 5545)
  notify.ts     POST a ntfy
  render.ts     stampa a terminale
  state.ts      lettura/scrittura di state/*.json
  selftest.ts   scenario di prova
  main.ts       comandi: print | check | selftest
state/          copia dell'ultimo orario + cache HTTP (committati dal workflow)
docs/scuola.ics il calendario da sottoscrivere (GitHub Pages)
```

# orario-3liceo

Sincronizza l'orario della classe **3 Liceo** pubblicato su
`orario.rainerum.delugan.net` con un calendario che puoi sottoscrivere
sull'iPhone, e ti manda una notifica **solo quando qualcosa cambia**.

```
ogni mattina (cron GitHub Actions, ~06:00)
        │
        ├─ scarica l'orario della settimana corrente e della successiva
        ├─ lo confronta con la copia salvata nel repo
        ├─ se NON è cambiato nulla  → fine, nessuna notifica
        └─ se è cambiato qualcosa   → rigenera docs/scuola.ics
                                      + commit nel repo
                                      + notifica push su ntfy → iPhone
```

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

## Uso locale (facoltativo)

```bash
cp .env.example .env      # opzionale: personalizza le variabili
npm run print             # stampa l'orario, non scrive nulla
npm run check             # fa un ciclo completo (stato, .ics, notifica)
npm run selftest          # verifica confronto + .ics su dati simulati
```

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
| `CHECK_WEEKS` | `2` | quante settimane controllare (corrente + successive) |
| `TIMEZONE` | `Europe/Rome` | |
| `CALENDAR_NAME` | `📚 Scuola` | nome del calendario nell'`.ics` |
| `NTFY_TOPIC` | *(vuoto)* | vuoto = notifiche disattivate, solo log |
| `NTFY_SERVER` | `https://ntfy.sh` | |

Nessuna password o credenziale nel repo: il topic ntfy sta nei Secrets.

## Cosa NON fa / limiti noti

- **Materia**: il sito non la espone. Non si può mostrare "Matematica → Fisica".
- **Orari cron e ora legale**: GitHub Actions usa UTC; il workflow lancia
  alle 04:00 e alle 05:00 UTC per cadere vicino alle 06:00 locali sia
  d'inverno sia d'estate. Il cron può ritardare di qualche minuto.
- **Latenza calendario**: la sottoscrizione `.ics` è aggiornata da iOS,
  non in tempo reale. La notifica ntfy però arriva subito.
- **Settimane future**: se la settimana successiva non è ancora
  pubblicata viene semplicemente ignorata.
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

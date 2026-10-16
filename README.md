# OpenCode Workspace — MVP multiutente (v0.6)

Piattaforma di chat multiutente con account personali e agenti OpenCode **installati sui PC Windows degli utenti**. Il server centrale autentica gli utenti e salva le chat, mentre un connettore residente su ciascun PC comunica con l'API locale di `opencode serve`.

> **Stato:** prototipo utilizzabile come base di sviluppo, non prodotto pronto per essere esposto pubblicamente. Prima di usarlo su Internet, eseguire test di integrazione, hardening, backup e revisione di sicurezza. Le password e i token non sono inclusi nel repository.

## Requisiti

- Windows 10/11 sui PC con connettore; Node.js 20 o superiore
- OpenCode CLI installato e funzionante (`opencode --version`)
- Server centrale con Node.js 20+ e MySQL **8.x** (o MySQL 5.7.8+ con funzionalità JSON)
- Almeno un provider/modello configurato **individualmente** su OpenCode nel PC dell'utente
- HTTPS pubblico e reverse proxy per uso remoto; l'esempio HTTP vale solo per localhost

## Struttura

```text
apps/
  server/       Express + MySQL + WebSocket + endpoint SSE
  web/          React + Vite, login, chat, dispositivi, utenti
  connector/    Node.js, OpenCode REST + SSE e WSS verso il server
  desktop/      Connettore GUI Electron + tray + configurazione cifrata (Windows)
```

Le chat vengono filtrate sempre dal server per `user_id`, e ogni PC è assegnato al suo proprietario. Non c'è condivisione di PC fra utenti in questa versione. Il browser **non** si connette mai direttamente a OpenCode.

## Novità v0.6 — attività dettagliate e recupero verificabile

- La chat mostra comandi e modifiche ai file in schede espandibili, con stato, percorso, patch ed eventuale output/errore; i testi lunghi vengono troncati nella UI. L'intero oggetto di input non viene mostrato indiscriminatamente.
- I tool in esecuzione sono aggiornati dai messaggi `message.part.updated`; i frammenti di testo sono gestiti separatamente per ID, anche con `message.part.delta`.
- Dopo il refresh o il ricollegamento dello stream, la chat ricarica dal database i messaggi e i risultati degli strumenti già sincronizzati.
- Una sessione recuperata da una disconnessione **non viene mai dichiarata completata solo perché OpenCode è tornato `idle`**. Rimane in stato incerto fino a verifica o interruzione esplicita.
- Per sbloccare un job incerto è disponibile `POST /api/chats/:id/resolve` con `{ "reviewed": true }`: il server verifica proprietario, PC online e stato OpenCode `idle`, sincronizza la chat, poi registra il job come **interrotto/non verificato**, non come completato.
- Gli eventi `session.idle` ritardati non possono chiudere un nuovo prompt se manca una nuova risposta assistant successiva agli ID preesistenti.
- `abort` non segnala un completamento positivo nel backend.

**Test:** `npm test` esegue 17 controlli automatici (mock OpenCode, UI activity, riconnessione, evento idle tardivo). È stato eseguito anche il parsing JSX; la build completa richiede dipendenze npm non disponibili nell'ambiente di generazione. Il flusso Windows+MySQL+OpenCode reale va ancora collaudato.

**Sicurezza operativa:** mostrare comandi e output potrebbe visualizzare informazioni sensibili se un utente le inserisce nei prompt o nei comandi. Non inserire token e password nelle chat; eseguire OpenCode con un utente Windows non amministratore e una cartella dedicata. La v0.6 rimane un prototipo da testare, non un prodotto pronto da esporre pubblicamente.

## Novità v0.5 — selezione modelli e stato delle sessioni

Quando apri una chat su un PC **online**, l’interfaccia carica i modelli dei provider già connessi sul suo OpenCode. Nel compositore puoi scegliere **Predefinito OpenCode** oppure un modello specifico. La scelta vale per **quel messaggio** e viene azzerata passando a un’altra chat; non modifica la configurazione globale di OpenCode e non viene persistita nel database.

Il connettore legge `/provider`, ma invia al browser esclusivamente `providerID`, `modelID` e nomi pubblici: **mai token, chiavi o opzioni di autenticazione**. Il modello è verificato di nuovo sul PC prima del prompt. Se il provider non è collegato, la richiesta viene rifiutata. Un modello presente nell’elenco non garantisce che il provider ne consenta l’uso o che non generi costi.

Nella barra superiore della chat trovi il pulsante **Stato OpenCode**: restituisce `busy`, `idle`, `retry` o `unknown` e conta le operazioni pendenti salvate dal server. Uno stato `idle` **non** garantisce che un job in stato incerto possa essere ritentato senza duplicazioni: in quel caso è necessario verificare/sincronizzare o interrompere.

Nuove API protette: `GET /api/devices/:id/models`, `GET /api/chats/:id/status`. L’utente può consultare solo i PC e le chat di sua proprietà.

**Test locali v0.5:** `npm test` (11 test con mock); per la build reale `npm install` e `npm run build` su una macchina con accesso al registro npm. Test su OpenCode e MySQL reali ancora necessari.

## Novità v0.4 — connettore desktop Windows

Aggiunto **OpenCode Workspace Connector** in Electron: finestra di configurazione, associazione via codice senza modificare file `.env`, icona nella tray, avvio automatico facoltativo con Windows e credenziali salvate con `safeStorage`/DPAPI. Il processo locale usa la stessa logica OpenCode del connettore Node.js. La build `.exe` NSIS è predisposta attraverso la GitHub Action manuale **Windows connector installer**.

- Documentazione: [Installazione connettore Windows](docs/WINDOWS-INSTALLER.md)
- Build su Windows: `npm install`, `npm test`, `npm run dist:windows`
- Sviluppo GUI: `npm run dev:desktop`

**Nota:** installer `.exe` non ancora compilato né collaudato su Windows in questo ambiente; la repository contiene il sorgente e lo script CI per generarlo. Il Connector GUI richiede OpenCode CLI installato a parte e non fa girare un utente Windows per altri utenti.

## Prima installazione su Windows (sviluppo locale)

### 1. Database MySQL

In HeidiSQL / MySQL Workbench, con un utente amministratore, esegui `apps/server/db/schema.sql`. Poi crea l'utente SQL applicativo:

```sql
CREATE USER 'workspace_user'@'localhost' IDENTIFIED BY 'SCEGLI_UNA_PASSWORD_FORTE';
GRANT SELECT, INSERT, UPDATE, DELETE ON opencode_workspace.* TO 'workspace_user'@'localhost';
FLUSH PRIVILEGES;
```

Se la connessione usa `127.0.0.1`, verifica che l'account MySQL sia abilitato per l'host effettivamente utilizzato. Usa un'istanza MySQL aggiornata e non esporre la porta 3306 su Internet.

### 2. Installa il progetto

Apri PowerShell nella cartella estratta:

```powershell
npm install
Copy-Item apps\server\.env.example apps\server\.env
notepad apps\server\.env
```

Imposta `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` e `APP_ORIGIN` nel file `.env` del server.

### 3. Crea l'amministratore

```powershell
npm run admin:create
```

Inserisci username e password personale (minimo 12 caratteri). Non riutilizzare credenziali di ChatGPT, GitHub o MySQL.

### 4. Avvia backend e frontend (due finestre PowerShell)

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

Apri **http://localhost:5173** ed effettua il login con il tuo account amministratore. Nella sezione **Amministrazione** crea altri utenti.

### 5. Installa OpenCode sul PC da controllare

Accertati che funzioni `opencode --version`. Configura un provider/modello locale con l'interfaccia ufficiale OpenCode, per esempio tramite `opencode auth login` quando applicabile. L'autenticazione al sito Workspace **non** dà diritto a condividere abbonamenti personali o credenziali AI.

Nel sito Workspace, vai su **I miei PC → Genera codice**. Il codice vale 10 minuti e si usa una sola volta.

Sul PC da associare:

```powershell
Copy-Item apps\connector\.env.example apps\connector\.env
notepad apps\connector\.env
```

Compila:

- `WORKSPACE_URL=http://localhost:3000` per test sullo stesso PC, altrimenti URL HTTPS pubblico del server
- `PAIR_CODE=` con il codice temporaneo (rimuovilo dal `.env` dopo la prima associazione)
- `DEVICE_NAME=` con il nome del computer
- `OPENCODE_WORKDIR=C:\AI-Workspace` oppure una cartella di progetti dedicata
- `OPENCODE_SERVER_PASSWORD=` con una password **unica** di almeno 16 caratteri
- `AUTO_START_OPENCODE=true` per far avviare automaticamente il server locale al connettore

Avvia:

```powershell
npm run dev:connector
```

Alla prima associazione il token del PC viene salvato in `%USERPROFILE%\.opencode-workspace\device.json` (non è incluso in Git). Conserva questo file come una credenziale sensibile; per disassociare un PC usa **revoca dispositivo** lato backend. In seguito il connettore userà il token senza richiedere un nuovo codice.

Se `AUTO_START_OPENCODE=false`, avvia separatamente il processo nella cartella configurata, con **la stessa password**:

```powershell
$env:OPENCODE_SERVER_PASSWORD = 'LA_TUA_PASSWORD_LOCALE'
opencode serve --hostname 127.0.0.1 --port 4096
```

Per le versioni di OpenCode più recenti, il connettore applica via `OPENCODE_CONFIG_CONTENT` la configurazione con approvazione necessaria per modifiche e comandi. Se avvii OpenCode manualmente, **configura anche i permessi manualmente** (vedi sicurezza).

### 6. Invia un messaggio

Aggiorna la pagina Workspace, seleziona il PC online, crea una chat e prova con:

`Elenca i file del progetto e spiegami quali componenti trovi. Non modificare nulla.`

La cronologia testuale viene salvata nel database centrale. OpenCode conserva sul PC la propria sessione completa. Dalla testata chat puoi richiedere la sincronizzazione della cronologia in caso di disconnessione.

## Novità v0.3 — gestione chat e affidabilità

- **Diagnostica PC:** da **I miei PC → Diagnostica OpenCode** vengono mostrati salute, versione, porta e directory di lavoro del server OpenCode locale. Il PC deve essere online e appartenere all’utente.
- **Rinomina ed elimina chat:** pulsanti nella barra superiore. La cancellazione richiede il PC online e prima elimina la sessione OpenCode locale, poi i relativi dati dal server. Se il PC è offline non finge di cancellare la sessione locale.
- **Account disattivabili:** l'amministratore può disattivare/riattivare utenti. Alla disattivazione vengono revocate le sessioni web e chiuse le connessioni dei PC. Non è consentito disattivare sé stessi o l'ultimo amministratore attivo.
- **Consegna incerta:** in caso di timeout del canale RPC il backend non considera il prompt fallito. Blocca l'invio di nuovi prompt su quella chat finché l'utente non sincronizza, verifica o interrompe la sessione. **Non reinviare manualmente lo stesso prompt senza verificare:** potrebbe aver già eseguito modifiche.
- **Risposte rapide:** il connettore individua le risposte assistant nuove rispetto alla cronologia prima del prompt, anche se non ha osservato lo stato `busy`.
- **Recupero prudente:** una vecchia risposta assistant non viene scambiata per la conclusione di un job pendente dopo riconnessione.

### Procedura di verifica v0.3

1. Connetti un PC e apri **Diagnostica OpenCode**; verifica che il risultato sia `healthy`.
2. Avvia una chat e invia un prompt di sola lettura. Verifica che risposta e attività arrivino e siano persistenti dopo ricarica.
3. Rinomina la chat. Prova la cancellazione quando il PC è online, poi ripeti quando è offline (deve essere impedita).
4. Crea un secondo utente e controlla che non possa leggere le chat o i PC del primo.
5. Disattiva il secondo utente e verifica che le sue sessioni e il connettore vengano scollegati; riattivalo e prova un nuovo login.
6. Simula un timeout di rete durante un prompt: il backend deve segnalare esito incerto e non consentire un doppio invio. Usa sincronizzazione/interruzione prima di riprovare.

**Limite noto:** il recupero dei job dopo interruzioni improvvise rimane conservativo; se non è certo che l'ultimo prompt sia concluso, potrebbe essere necessario intervenire manualmente. La build React completa richiede `npm install` e non è stata validata nell'ambiente senza accesso a npm. Per la produzione sono ancora necessari audit di sicurezza, reverse proxy HTTPS, sandbox di esecuzione e collaudo reale su Windows.

## Sicurezza: aspetti essenziali

1. **Un utente per PC.** In questo prototipo la proprietà dei PC è esclusiva. Non attribuire a più utenti la stessa istanza OpenCode: isolare le chat non significa isolare il filesystem.
2. **OpenCode solo su localhost.** Il connettore non apre OpenCode verso la LAN né verso Internet. Non creare inoltri della porta 4096.
3. **Identità separate.** Cookie HttpOnly + SameSite strict per il sito; token dispositivo indipendente con hash SHA-256 sul server; associazione con codice monouso a scadenza.
4. **Permessi.** `edit` e `bash` sono impostati su `ask`; `external_directory` su `deny`. Non equivale a una sandbox: processi shell con i privilegi dell'utente Windows possono accedere a risorse del suo account. Usa account Windows dedicati con privilegi minimi e non eseguire il connettore come amministratore.
5. **HTTPS obbligatorio in produzione.** Termina TLS sul reverse proxy, imposta `APP_ORIGIN=https://workspace.tuodominio.it` e `WORKSPACE_URL=https://workspace.tuodominio.it`. Non pubblicare la porta MySQL né OpenCode. I cookie `Secure` si attivano con `NODE_ENV=production`.
6. **Contenuti privati.** I messaggi non sono cifrati end-to-end: chi amministra MySQL o i backup può tecnicamente leggerli. Proteggi database, copie di sicurezza e accessi di amministrazione.
7. **Hardening prima della produzione.** Implementare reset password, MFA, rotazione credenziali PC, audit log, limiti di consumo, pulizia sessioni scadute, job recovery, verifiche di origine via reverse proxy, limitazione di rate distribuita, monitoraggio e test di sicurezza.
8. **In caso di guasto.** Se perdi un riscontro dall'agente, non reinviare automaticamente lo stesso prompt: potrebbe essere già in esecuzione. Verifica la sessione e usa il pulsante di sincronizzazione.

## API principali

| Metodo | Endpoint | Note |
|---|---|---|
| POST | `/api/auth/login` | Cookie HttpOnly |
| POST | `/api/auth/logout` | Disconnessione |
| GET | `/api/me` | Account corrente |
| POST | `/api/admin/users` | Solo amministratore |
| GET | `/api/devices` | PC dell'utente |
| POST | `/api/devices/pairing-code` | Codice monouso |
| POST | `/api/connectors/pair` | Associa connettore |
| GET, POST | `/api/chats` | Solo proprie chat |
| GET | `/api/chats/:id/messages` | Cronologia |
| POST | `/api/chats/:id/messages` | Prompt OpenCode |
| GET | `/api/chats/:id/stream` | Streaming SSE |
| POST | `/api/chats/:id/permissions/:requestId` | Consenti una volta / rifiuta |
| POST | `/api/chats/:id/abort` | Interruzione |
| POST | `/api/chats/:id/sync` | Risincronizzazione |
| WS | `/agent` | Canale autenticato per connettori |

Il connettore usa API OpenCode `POST /session`, `POST /session/:id/prompt_async`, `GET /session/:id/message`, `GET /event`, approvazioni e `POST /session/:id/abort`. Aggiornamenti di OpenCode possono modificare questi endpoint: controllare la specifica locale `http://127.0.0.1:4096/doc`.

## Test

```powershell
npm test
npm run build
```

I test inclusi verificano struttura base dello schema e riconoscimento degli eventi di sessione. Un test end-to-end richiede MySQL, OpenCode configurato, dipendenze npm e almeno un PC autorizzato.

## Pubblicazione GitHub (repository esistente)

La repository di riferimento è **https://github.com/sebastianosalzillo/OpenCodeWorkspace**. Al momento è **pubblica**: non caricare mai password, file `.env`, token dei PC, backup del database o altri segreti.

Per inviare gli aggiornamenti da Windows, installa Git e GitHub CLI (`gh`), poi esegui:

```powershell
gh auth login
.\publish-github.ps1
```

Lo script collega la cartella alla repository esistente e conserva il file `LICENSE` già presente, se avviato su una cartella di progetto senza repository Git inizializzata. Verifica sempre `git status` prima di confermare il push. Le `.env` e i token dei dispositivi sono esclusi dal `.gitignore`.

## Aggiornamenti v0.2

La versione 0.2 ripristina la mappa di sessioni OpenCode al ricollegamento del PC, recupera i messaggi già presenti senza reinviare prompt, blocca i job concorrenti anche dopo un refresh e permette di revocare un PC dall’interfaccia. Sono stati aggiunti test con un server OpenCode simulato e GitHub Actions. I job incerti richiedono una verifica o un’interruzione manuale. Dettagli in `CHANGELOG.md` e procedura completa in `docs/TEST-PLAN.md`.

## Roadmap

- Installer Windows `.exe` e icona nella barra di sistema
- Inviti e reset password, MFA e gestione/revoca device dalla UI
- Sessioni concorrenti più robuste (coda di job, idempotenza e ripristino dopo riavvio)
- Supporto multi-progetto e isolamento degli account Windows
- Rendere Markdown, diff e log strumenti dettagliati
- Test API, E2E e deployment sicuro

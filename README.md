# OpenCode Workspace — MVP multiutente (v0.1)

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
  connector/    Node.js Windows, OpenCode REST + SSE e WSS verso il server
```

Le chat vengono filtrate sempre dal server per `user_id`, e ogni PC è assegnato al suo proprietario. Non c'è condivisione di PC fra utenti in questa versione. Il browser **non** si connette mai direttamente a OpenCode.

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

Se avviato da una cartella ZIP senza `.git`, lo script clona la repository nella cartella sorella `OpenCodeWorkspace-clone`, copia i sorgenti, conserva `LICENSE`, crea un commit e lo pubblica dopo la tua conferma. Se avviato da un clone Git già associato alla repository, aggiorna il ramo `main` senza cancellare la cronologia. Le `.env` e i token sono esclusi dal `.gitignore`; controlla comunque il contenuto prima del push.

## Roadmap

- Installer Windows `.exe` e icona nella barra di sistema
- Inviti e reset password, MFA e gestione/revoca device dalla UI
- Sessioni concorrenti più robuste (coda di job, idempotenza e ripristino dopo riavvio)
- Supporto multi-progetto e isolamento degli account Windows
- Rendere Markdown, diff e log strumenti dettagliati
- Test API, E2E e deployment sicuro
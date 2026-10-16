# Changelog

## v0.5.0 — 16 ottobre 2026

- Selezione del modello AI per singolo messaggio nella chat web; scelta "Predefinito OpenCode" sempre disponibile.
- Nuove RPC `models` e `status` nel connettore; elenco modelli limitato ai provider collegati sul PC, senza chiavi o opzioni sensibili.
- Nuove API `/api/devices/:id/models` e `/api/chats/:id/status`, con controllo proprietà dell’utente e stato online.
- Controlli severi del modello scelto su backend e connettore, prima dell’invio a OpenCode.
- Nuovo pulsante stato sessione OpenCode nella barra chat; UI responsive per il selettore modello.
- Test HTTP simulato che verifica il payload `model` per `prompt_async`, rifiuto dei provider non connessi e non divulgazione di segreti.
- Limiti: non è stata verificata la build React con dipendenze installate né la comunicazione con OpenCode reale.


## v0.4.0 — 16 ottobre 2026

- Nuova app Windows Electron con pannello locale, tray e collegamento con il connettore OpenCode esistente.
- Associazione PC tramite codice temporaneo dalla GUI, nessun `PAIR_CODE` permanente.
- Protezione DPAPI dei token e della password OpenCode con `safeStorage`; nessun fallback in chiaro.
- Avvio a login Windows opzionale e avvio/stop manuale con diagnostica locale.
- Validazione URL HTTPS, cartelle su unità locali, porta e password.
- Test Node integrati e workflow manuale per produrre l'installer NSIS non firmato su Windows.
- Documentazione di installazione e note di sicurezza.


## 0.3.0 — Affidabilità e amministrazione utenti

- Diagnostica OpenCode di ogni PC con endpoint proprietario autenticato.
- Rinomina e cancellazione chat con eliminazione della sessione locale prima dei dati centrali.
- Disattivazione e riattivazione account: revoca sessioni, codici di pairing e WebSocket, blocco accesso a connettori di utenti disattivati.
- Risolti rischi di doppia esecuzione in caso di timeout/disconnessione RPC: job conservato come stato incerto.
- Corretto recupero job: una risposta storica assistant non marca concluso il job corrente.
- Polling di risposta rapida, confrontando ID assistant precedenti e successivi all'invio.
- Connessioni WebSocket obsolete non possono elaborare nuovi eventi.
- Aggiunto test per risposta rapida senza fase busy; ampliato mock OpenCode per diagnostica e cancellazione.


## 0.2.0 — Session recovery e affidabilità (16 ottobre 2026)

- Ripristino automatico della mappa delle sessioni OpenCode dopo riavvio/riallineamento del connettore.
- Sincronizzazione delle risposte salvate su OpenCode quando il PC torna online, senza re-inviare prompt già ricevuti.
- Recupero dei job ancora attivi con distinzione tra *busy*, *completed* e *unresolved*.
- Isolamento delle risposte RPC sul singolo WebSocket, anche durante riconnessioni.
- Correzione della gara tra evento di completamento e conferma dell'avvio del job.
- Blocco degli invii concorrenti tramite lock lato backend e controllo job persistenti nel database.
- UI: visualizzazione di un job in corso dopo il refresh, pulsante interrompi e revoca di un PC associato.
- Test con API OpenCode simulata e GitHub Actions per test e build.

### Limiti noti

- Test completo con MySQL reale e OpenCode reale non ancora effettuato.
- I job rimasti in stato `unresolved` non vengono ritrasmessi automaticamente: devono essere verificati o interrotti manualmente.
- Non c'è una sandbox forte di filesystem/processi Windows. Usare un account Windows dedicato e non amministratore.
- La sessione HTTP è nel cookie; per esposizione Internet servono HTTPS, rate limiting centralizzato, backup e revisione della sicurezza.

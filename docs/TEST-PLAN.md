# Piano test end-to-end — Windows

## Prerequisiti

Server Node.js 22, MySQL 8, OpenCode CLI con un provider funzionante, browser Chrome/Edge. Usare account e cartelle di test, senza credenziali reali.

1. `npm install`, importazione di `apps/server/db/schema.sql`, popolamento di `.env` da `.env.example`.
2. `npm run admin:create`, `npm run dev:server` e `npm run dev:web` in terminali separati.
3. Login amministratore e creazione di due utenti di test separati.
4. Per ogni utente: creare codice di associazione; avviare `npm run dev:connector` sul rispettivo PC dopo aver configurato `.env`.
5. Verificare che ogni utente veda solo il proprio dispositivo e solo le proprie chat.
6. Creare una chat, inviare un prompt in lettura, verificare risposta e cronologia dopo il refresh.
7. Inviare una richiesta di modifica innocua nella cartella di test: il permesso deve chiedere conferma prima di eseguire.
8. Interrompere un job lungo, poi riprendere la conversazione.
9. Durante un job riavviare il connettore e verificare che si riallinei senza eseguire nuovamente il prompt.
10. Revocare il dispositivo dal sito e verificare che non possa più riconnettersi.
11. Provare a chiamare `/api/chats/<id-altro-utente>/messages`: aspettarsi `404`, mai i dati altrui.

I test unitari e l'API simulata sono eseguiti da `npm test`. Il build UI da `npm run build`.

## Sicurezza

- Nessuna porta OpenCode 4096 pubblica, usare solo `127.0.0.1`.
- Nessuna password nel repository o nei log.
- Connettore avviato senza privilegi admin e workspace limitato a una cartella di test.
- Non usare abbonamenti personali condivisi per più utenti AI.
- Per deployment pubblico mettere server dietro HTTPS e reverse proxy, non esporre MySQL.


## V0.5: Modelli e stato chat

1. Collega due PC diversi con provider configurati diversamente; crea una chat sul PC A.
2. Verifica che il menu "Modello" mostri soltanto i provider connessi sul PC A e nessun dato segreto nelle API/browser.
3. Invia un prompt col modello predefinito, poi seleziona un modello esplicito e invia un secondo prompt. Verifica dal log OpenCode il modello effettivamente usato.
4. Cambia chat o PC: il selettore deve azzerarsi per evitare l’invio accidentale a un provider diverso.
5. Verifica il pulsante "Stato OpenCode" durante un'esecuzione e a lavoro concluso.
6. Scollega il PC: le API modelli/stato devono rispondere con errore e non esporre credenziali.
7. Accedi con il secondo utente: non può richiedere modelli o stati di PC/chat altrui.
8. Ricorda che uno stato `idle` senza riscontro del job non deve provocare un reinvio automatico.

## v0.6 — verifica strumenti e disconnessione

1. In una chat autorizzata chiedi a OpenCode di eseguire `npm --version` in una cartella di prova. La scheda `bash` deve mostrare comando, stato ed eventuale output.
2. Richiedi una modifica non distruttiva a un file di prova. Verifica la visualizzazione del percorso e della patch, quando OpenCode fornisce quei campi.
3. Aggiorna la pagina dopo il completamento: schede e messaggi devono riapparire dalla cronologia salvata.
4. Durante un'operazione, interrompi la connessione del connettore e riattivala. Il prompt **non** deve essere ritrasmesso automaticamente. Se l'esito è incerto, la chat deve segnalarlo.
5. Se la sessione è ancora `busy`, il pulsante di sblocco manuale deve rifiutare la richiesta. Quando è `idle`, dopo aver controllato i risultati, il proprietario può chiudere il job come **interrotto/non verificato**.
6. Due utenti, su due PC separati: un utente non deve poter vedere né aggiornare le chat o i job dell'altro, anche alterando l'ID nell'URL.

**Nota:** i test automatici simulano OpenCode. Non equivalgono a una verifica su dispositivo reale e non garantiscono isolamento completo dei processi Windows.

## v0.7 — connessione eventi, revoca e smoke reale

1. `npm test`: verifica il parser SSE quando il trasporto divide UTF-8, CRLF, blocchi multilinea e quando il payload è troppo grande.
2. Prova l'interruzione simulata del canale `/event`: il connettore deve riconnettersi, sincronizzare le risposte tramite `/session/:id/message` e **non** inviare `prompt_async` una seconda volta.
3. Da browser apri una chat e osserva l'indicatore "Chat live"; scollega temporaneamente il server per vedere "Riconnessione chat", poi verifica che al ritorno venga ricaricata la cronologia.
4. Con due account diversi, conferma che gli stream SSE non mostrino i dati di chat altrui; disattiva un account mentre lo stream è aperto e verifica la chiusura della connessione. Anche logout deve chiudere gli stream dell'utente.
5. Sul PC Windows con OpenCode già configurato e il relativo `.env` del connettore, esegui `npm run smoke:opencode`: deve ottenere il health check autenticato e l'elenco di modelli senza inviare prompt.
6. Per verificare creazione/eliminazione di una sessione di prova (non vengono eseguiti prompt): `npm run smoke -w @workspace/connector -- --session`.
7. Infine verifica con un *utente di test* il percorso browser → server MySQL → connettore Windows → OpenCode reale. **Questo collaudo non è sostituito dai test mock.**

Le credenziali OpenCode rimangono solo sul PC; non copiare `.env` o `device.json` in GitHub. Il progetto **non fornisce isolamento forte** contro comandi eseguiti dall'agente Windows; per test reali usare cartelle e account Windows a privilegi limitati.

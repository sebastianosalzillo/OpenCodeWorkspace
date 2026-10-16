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

# Changelog

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

# OpenCode Workspace Connector — installer Windows (v0.4)

## Stato e limiti

Questa versione introduce un'app Electron con tray di Windows, pannello configurazione, pairing monouso e avvio automatico opzionale. **Il codice è stato verificato staticamente, ma l'installer .exe non è stato ancora compilato né testato su Windows reale.** La pipeline GitHub Actions genera un EXE NSIS non firmato: Windows SmartScreen potrebbe mostrare un avviso. Non distribuire a utenti esterni senza una verifica di sicurezza e una firma del codice.

## Prerequisiti

- Windows 10/11 x64
- OpenCode CLI installato e raggiungibile dal PATH dell'utente Windows
- Un account personale sul server Workspace e un codice temporaneo dalla pagina `I miei PC`
- Server Workspace raggiungibile in **HTTPS** oppure HTTP solo su `localhost`
- Un provider/modello AI configurato su OpenCode nel profilo utente Windows (NON condividere credenziali di abbonamenti personali)
- Permessi limitati alle cartelle necessarie: l'agente non è una sandbox; non usarlo come amministratore e non condividere la stessa sessione Windows fra utenti non fidati

## Compilazione automatica su GitHub

1. Apri la repository GitHub, scheda **Actions**.
2. Seleziona **Windows connector installer**.
3. Clicca **Run workflow** sul ramo `main`.
4. Apri l'esecuzione e, se `package-windows` è completato, scarica l'artefatto `OpenCode-Workspace-Connector-v0.4-Windows`.
5. Estrai lo ZIP artefatto e avvia l'installer su un PC Windows di test.

Questa azione è **manuale**, non viene lanciata automaticamente a ogni push. Se la pipeline fallisce, il log del job mostra la causa: non significa che l'installer sia disponibile.

## Build locale su Windows

Dal repository Git:

```powershell
npm install
npm test
npm run dist:windows
```

L'EXE sarà in `release\desktop\`. Per provare l'interfaccia senza creare l'installer:

```powershell
npm run dev:desktop
```

## Prima configurazione

1. Apri il Connector. Inserisci URL HTTPS del server, nome PC, cartella di lavoro, porta OpenCode e una password locale unica di almeno 16 caratteri.
2. Lascia selezionato «Avvia automaticamente OpenCode» per avviare `opencode serve` sul loopback del PC con permessi `ask` per scrittura ed esecuzione comandi.
3. Salva. La configurazione e i token sono cifrati usando `safeStorage`/DPAPI Windows nell'area dati della app.
4. Nel browser Workspace, accedi e genera un codice temporaneo in **I miei PC**. Incolla il codice nel Connector e clicca **Associa**.
5. Clicca **Avvia**, controlla la diagnostica e verifica che il computer risulti online nel browser.
6. Crea una chat su quel PC e prova con un prompt che chieda solo di leggere i file.

L'app rimane nella tray quando chiudi la finestra. Per fermarla puoi usare il menu della tray. Se hai abilitato l'avvio all'accesso a Windows, il programma riparte nell'account Windows corrente.

## Protezione dei segreti

La GUI non mostra né conserva in chiaro token o password del connettore. Vengono salvati con la crittografia del profilo Windows corrente; non copiare il file `settings.secure.json` su altri PC. I dati sono disponibili al processo connettore tramite variabili d'ambiente, non tramite un file `device.json` non cifrato. Un utente Windows o malware con accesso al medesimo profilo potrebbe comunque comprometterli.

Il connettore da terminale `apps/connector` rimane una modalità separata: salva tuttora `device.json` nella home dell'utente. Preferire la GUI per l'utilizzo Windows quotidiano.

**Revoca:** la rimozione locale nella GUI cancella la credenziale da quel PC, ma non revoca il token sul server. Elimina/revoca il dispositivo dalla pagina **I miei PC** per impedirne ogni ulteriore collegamento.

## Diagnostica

- `OpenCode non risponde`: esegui `opencode --version`, verifica il PATH e l'eventuale conflitto sulla porta 4096.
- `401`: password OpenCode incoerente con il server già in esecuzione; arrestalo e usa la configurazione del Connector.
- `PC offline`: verifica URL HTTPS, firewall in uscita e collegamento WSS.
- `Impossibile cifrare`: il sistema Windows non rende disponibile DPAPI; il Connector rifiuta di salvare segreti senza protezione.
- `Cartella di lavoro`: scegli una sottocartella su un disco locale, non la radice del disco né una condivisione di rete.

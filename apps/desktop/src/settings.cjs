'use strict';
const path = require('node:path');

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Indirizzo del server non valido'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('È richiesto HTTPS (HTTP consentito solo su localhost)');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Inserisci solo l’indirizzo base del server, senza percorsi o credenziali');
  }
  return url.origin;
}
function normalizeWorkdir(value) {
  const input = String(value || '').trim();
  if (!/^[a-zA-Z]:[\\/]/.test(input)) throw new Error('Usa un percorso locale assoluto (esempio C:\\AI-Workspace)');
  const resolved = path.win32.normalize(input);
  if (/^[a-zA-Z]:\\$/.test(resolved)) throw new Error('Scegli una sottocartella, non la radice del disco');
  return resolved;
}
function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configurazione mancante');
  const serverUrl = normalizeBaseUrl(value.serverUrl);
  const workdir = normalizeWorkdir(value.workdir);
  const opencodePort = Number(value.opencodePort || 4096);
  if (!Number.isInteger(opencodePort) || opencodePort < 1024 || opencodePort > 65535) throw new Error('Porta OpenCode non valida');
  const name = String(value.name || '').trim();
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new Error('Nome PC: da 2 a 100 caratteri');
  const password = String(value.opencodePassword || '');
  if (password.length < 16 || password.length > 256) throw new Error('Password OpenCode: minimo 16, massimo 256 caratteri');
  return {serverUrl,workdir,opencodePort,name,opencodePassword:password,
    autoStartOpenCode:value.autoStartOpenCode === true,launchAtLogin:value.launchAtLogin === true};
}
module.exports = {normalizeBaseUrl,normalizeWorkdir,validateSettings};

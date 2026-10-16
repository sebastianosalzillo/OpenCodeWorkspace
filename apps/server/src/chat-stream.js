// SSE tra backend e browser: le autorizzazioni sono rivalidate anche DOPO
// l'apertura della connessione, perché logout/revoca possono avvenire durante lo stream.
const listeners = new Map();
const packet = value => `data: ${JSON.stringify(value)}\n\n`;

export function publish(chatId, data) {
  for (const entry of listeners.get(chatId) || []) {
    if (!entry.closed) entry.res.write(packet(data));
  }
}

export function disconnectUserStreams(userId) {
  for (const entries of listeners.values()) {
    for (const entry of [...entries]) {
      if (entry.userId === userId) entry.close();
    }
  }
}

export function subscribe(chatId, res, {userId, authorize, intervalMs = 10000} = {}) {
  if (!userId || typeof authorize !== 'function') throw new Error('La sottoscrizione SSE richiede autorizzazione');
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache, no-transform',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no'
  });
  res.flushHeaders();
  const entries=listeners.get(chatId) || new Set();
  listeners.set(chatId,entries);
  const entry={res,userId,closed:false,close:null};
  let verifying=false;
  let timer;
  entry.close=()=>{
    if(entry.closed)return;
    entry.closed=true;
    clearInterval(timer);
    entries.delete(entry);
    if(entries.size===0)listeners.delete(chatId);
    if(!res.writableEnded)res.end();
  };
  entries.add(entry);
  res.on('close',entry.close);
  res.write(packet({type:'connected'}));
  timer=setInterval(async()=>{
    if(entry.closed||verifying)return;
    verifying=true;
    try {
      if (!await authorize()) {entry.close();return;}
      if(!entry.closed)res.write(': heartbeat\n\n');
    } catch {entry.close();}
    finally {verifying=false;}
  },intervalMs);
  timer.unref?.();
  return entry;
}

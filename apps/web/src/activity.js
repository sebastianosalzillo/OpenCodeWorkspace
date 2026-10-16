// Proiezione dei tool OpenCode sulla UI: mostra solo campi espliciti, non l'intero payload.
const trimText = (value, max = 12000) => {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}\n… [testo troncato]` : value;
};
const readText = (value) => typeof value === 'string' ? value : '';

export function summarizeToolPart(part) {
  if (!part || part.type !== 'tool') return null;
  const state = part.state && typeof part.state === 'object' ? part.state : {};
  const input = state.input && typeof state.input === 'object' && !Array.isArray(state.input) ? state.input : {};
  const metadata = state.metadata && typeof state.metadata === 'object' ? state.metadata : {};
  const tool = trimText(part.tool || 'strumento', 80);
  const status = ['pending','running','completed','error'].includes(state.status) ? state.status : 'unknown';
  const target = trimText(readText(input.filePath || input.path || input.filename), 240);
  // Non serializzare input completi: possono contenere API key, env e altri valori non pertinenti.
  const command = trimText(readText(input.command), 5000);
  const patch = trimText(readText(input.patch || metadata.diff || metadata.patch), 12000);
  const output = trimText(readText(state.output), 12000);
  const error = trimText(readText(state.error), 3000);
  const title = trimText(readText(state.title), 240);
  return { id: String(part.id || `${tool}:${target}`), tool, status, target, command, patch, output, error, title };
}

export function updateLiveTools(previous, event, limit = 30) {
  if (!event || event.type !== 'message.part.updated') return previous;
  const tool = summarizeToolPart(event.properties?.part);
  if (!tool) return previous;
  const next = previous.filter(t => t.id !== tool.id);
  next.push(tool);
  return next.slice(-limit);
}

export function updatePartialText(previous, event) {
  if (!event || !['message.part.updated', 'message.part.delta'].includes(event.type)) return previous;
  const p = event.properties || {};
  if (event.type === 'message.part.updated' && p.part?.type === 'text') {
    const id = String(p.part.id || p.partID || 'text');
    const next = { ...previous, [id]: trimText(readText(p.part.text), 30000) };
    return next;
  }
  if (event.type === 'message.part.delta' && p.field === 'text' && typeof p.delta === 'string') {
    const id = String(p.partID || 'text');
    return { ...previous, [id]: trimText((previous[id] || '') + p.delta, 30000) };
  }
  return previous;
}

// Parser SSE incrementale: conserva i delimitatori CRLF e i caratteri UTF-8
// anche quando il trasporto spezza un evento tra due chunk.
export class SSEParser {
  constructor({maxBytes = 2 * 1024 * 1024} = {}) {
    this.decoder = new TextDecoder('utf-8', {fatal: false});
    this.buffer = '';
    this.lines = [];
    this.maxBytes = maxBytes;
  }
  push(chunk) {
    this.buffer += this.decoder.decode(chunk, {stream: true});
    return this.drain();
  }
  drain() {
    const messages = [];
    while (true) {
      // Se il chunk termina con CR, attendi per sapere se segue LF.
      const match = /\r\n|\n|\r(?!$)/.exec(this.buffer);
      if (!match) break;
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      if (line === '') {
        if (this.lines.length) messages.push(this.lines.join('\n'));
        this.lines = [];
      } else if (line.startsWith('data:')) {
        let value = line.slice(5);
        if (value.startsWith(' ')) value = value.slice(1);
        this.lines.push(value);
      }
      this.checkLimit();
    }
    this.checkLimit();
    return messages;
  }
  checkLimit() {
    const total = Buffer.byteLength(this.buffer, 'utf8') +
      this.lines.reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8'), 0);
    if (total > this.maxBytes) {
      this.buffer = '';
      this.lines = [];
      throw new Error('Evento SSE troppo grande: connessione da ristabilire');
    }
  }
}

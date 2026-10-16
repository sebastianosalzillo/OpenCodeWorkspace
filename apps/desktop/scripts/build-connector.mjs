import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints:[resolve(here,'../../connector/src/index.js')],
  outfile: resolve(here, '../dist/connector.cjs'),
  bundle:true, platform:'node', target:'node20', format:'cjs',
  packages:'bundle', logLevel:'info'
});

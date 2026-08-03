/**
 * Standalone sample render — bypasses the HTTP server and renders the
 * hardcoded HelloWorld composition straight to disk:
 *
 *   npm run render-sample
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderToMp4} from './render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const outDir = process.env.RENDER_OUT_DIR ?? path.join(REPO_ROOT, 'data', 'videos', 'renders');

const output = await renderToMp4({
  jobId: 'sample',
  outDir,
  onProgress: (p) => {
    process.stdout.write(`\rprogress: ${(p * 100).toFixed(1)}%`);
  },
});

console.log(`\ndone: ${output}`);

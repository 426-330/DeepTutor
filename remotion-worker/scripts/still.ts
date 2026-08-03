/**
 * Render a single frame of a spec to PNG (debugging / visual review):
 *
 *   npx tsx scripts/still.ts examples/sample_ep01.yaml 60 /tmp/still.png
 */
import path from 'node:path';
import {renderStill, selectComposition} from '@remotion/renderer';
import {parseVideoSpec} from '../src/parser/index.js';
import {serveMediaUrls} from '../src/asset-server.js';
import {getBundle, CONCEPT_COMPOSITION_ID, REMOTION_ENTRY} from '../src/render.js';

const [yamlPath, frameArg, out] = process.argv.slice(2);
if (!yamlPath || !frameArg || !out) {
  console.error('usage: tsx scripts/still.ts <yaml_path> <frame> <out.png>');
  process.exit(1);
}

const parsed = parseVideoSpec(yamlPath);
if (!parsed.ok) {
  console.error(JSON.stringify(parsed.errors, null, 2));
  process.exit(1);
}

const serveUrl = await getBundle(REMOTION_ENTRY);
const inputProps = await serveMediaUrls({ir: parsed.ir});
const composition = await selectComposition({
  serveUrl,
  id: CONCEPT_COMPOSITION_ID,
  inputProps,
});
await renderStill({
  composition,
  serveUrl,
  output: path.resolve(out),
  frame: Number(frameArg),
  inputProps,
  chromiumOptions: {gl: 'angle'},
});
console.log(`still written: ${path.resolve(out)}`);

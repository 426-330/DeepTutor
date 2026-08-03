/**
 * Scene template library access (video_dsl/concept-video-scene-templates.yaml).
 * Currently used for the `layout_aliases` table (DSL §11.2 alias resolution).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import {REPO_ROOT} from './validate.js';

const TEMPLATES_PATH = path.join(
  REPO_ROOT,
  'video_dsl',
  'concept-video-scene-templates.yaml',
);

interface TemplatesFile {
  layout_library?: Array<{name: string}>;
  layout_aliases?: Record<string, string>;
}

let cached: TemplatesFile | null = null;

function loadTemplates(): TemplatesFile {
  if (!cached) {
    cached = (yaml.load(fs.readFileSync(TEMPLATES_PATH, 'utf8')) ??
      {}) as TemplatesFile;
  }
  return cached;
}

/** layout_aliases → canonical layout id (e.g. `split-screen` → `split`). */
export function getLayoutAliases(): Record<string, string> {
  return loadTemplates().layout_aliases ?? {};
}

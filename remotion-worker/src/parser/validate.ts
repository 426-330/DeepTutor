/**
 * JSON Schema (draft 2020-12) machine validation (DSL §10, design D5).
 * Single schema source: video_dsl/schema/concept-video.schema.json — do NOT
 * maintain a copy here; the file is loaded from the repo at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type {ValidateFunction} from 'ajv';
import type {ValidationIssue} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/parser (dev via tsx) and dist/parser (built) are both 2 levels below
// remotion-worker/, which itself sits one level below the repo root.
const WORKER_ROOT = path.resolve(__dirname, '..', '..');
export const REPO_ROOT = path.resolve(WORKER_ROOT, '..');

const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'video_dsl',
  'schema',
  'concept-video.schema.json',
);

let validator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (!validator) {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv2020({allErrors: true, strict: false});
    validator = ajv.compile(schema);
  }
  return validator;
}

/** Validate a parsed YAML document against the DSL §10 schema. */
export function validateSpec(doc: unknown): ValidationIssue[] {
  const validate = getValidator();
  const valid = validate(doc);
  if (valid) return [];
  return (validate.errors ?? []).map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'schema violation',
    keyword: err.keyword,
    layer: 'schema' as const,
  }));
}

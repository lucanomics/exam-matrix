/**
 * Node-side loader: read the YAML, validate it against the schema, hand it to
 * the shared normaliser.
 *
 * The normalisation itself lives in normalize.js, which is pure and is bundled
 * into the browser editor — so the editor's preview and the committed PDFs come
 * out of exactly the same code path.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import { stripEmpty, normalizeExam } from './normalize.js';

export { visualLen } from './text.js';

export function loadSchema() {
  const p = path.join(process.cwd(), 'schema', 'exam.schema.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function loadExam(file, { today = new Date() } = {}) {
  const raw = stripEmpty(yaml.load(fs.readFileSync(file, 'utf8')));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(loadSchema());
  if (!validate(raw)) {
    const msg = validate.errors
      .map((e) => `  ${e.instancePath || '/'} ${e.message}`)
      .join('\n');
    throw new Error(`Schema validation failed for ${path.basename(file)}:\n${msg}`);
  }

  return normalizeExam(raw, { today });
}

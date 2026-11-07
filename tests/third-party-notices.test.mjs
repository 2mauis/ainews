import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);

function text(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('root MIT grant names 2mauis and excludes third-party code', () => {
  const license = text('LICENSE');
  assert.match(license, /Copyright \(c\) 2026 2mauis/);
  assert.match(license, /does not\nappl(y|ies) to third-party code/i);
  assert.doesNotMatch(license, /@mozilla\/readability/);
  assert.doesNotMatch(license, /linkedom/);
});

test('notices identify readability 0.6.0 and linkedom 0.18.13 from the bundle', () => {
  const note = text('THIRD-PARTY.md');
  assert.match(note, /@mozilla\/readability 0\.6\.0/);
  assert.match(note, /Apache-2\.0/);
  assert.match(note, /linkedom 0\.18\.13/);
  assert.match(note, /\bISC\b/);
  assert.match(note, /89a9453346369e7853c09b93982f8223b863a9e9/);
  assert.match(note, /已证明/);
  assert.match(note, /推断/);
  assert.match(note, /未知/);
  assert.match(note, /95eeebeb8fac8754d54eafe2b4743661ac1cf028/);
  assert.doesNotMatch(note, /精确复现/);
  assert.doesNotMatch(note, /readability is MIT/i);
  assert.doesNotMatch(note, /linkedom is MIT/i);
  const bundled = text('src/index.js');
  assert.match(bundled, /node_modules\/@mozilla\/readability\/Readability\.js/);
  assert.match(bundled, /node_modules\/linkedom\/worker\.js/);
  assert.match(bundled, /parsely-author/);
  assert.match(bundled, /var reChars = \/\[[^\n]+\/g;/);
});

test('vendored notice files match the recorded upstream bytes', () => {
  const manifest = JSON.parse(text('third-party/manifest.json'));
  assert.equal(manifest.readability.version, '0.6.0');
  assert.equal(manifest.linkedom.version, '0.18.13');
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(file.path, root));
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha, file.sha256, file.path);
  }
});

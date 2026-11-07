import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isReviewedCopyrightFile, scanText } from '../scripts/privacy-scan.mjs';

const BOOLBASE = 'third-party/npm/boolbase-2.0.0-LICENSE';
const HTMLPARSER = 'third-party/npm/htmlparser2-10.1.0-LICENSE';

test('已核对的上游许可证字节在原路径放行', () => {
  for (const file of [BOOLBASE, HTMLPARSER]) {
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 9).toString(), 'Copyright');
    assert.equal(isReviewedCopyrightFile(file, bytes), true);
    assert.ok(scanText(bytes.toString('utf8'), file).some((hit) => hit.endsWith(' email')));
  }
});

test('同一字节换路径，或原路径改一个字节，都不放行', () => {
  const bytes = readFileSync(BOOLBASE);
  assert.equal(isReviewedCopyrightFile('README.md', bytes), false);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  assert.equal(isReviewedCopyrightFile(BOOLBASE, changed), false);
  const extra = Buffer.concat([bytes, Buffer.from('\nperson@private.invalid\n')]);
  assert.equal(isReviewedCopyrightFile(BOOLBASE, extra), false);
  assert.ok(scanText(extra.toString('utf8'), BOOLBASE).some((hit) => hit.endsWith(' email')));
});

test('其他邮箱和凭据仍阻断', () => {
  assert.ok(scanText('person@private.invalid\n', 'notes.txt').some((hit) => hit.endsWith(' email')));
  assert.ok(scanText('ghp_' + 'a'.repeat(36) + '\n', 'notes.txt').some((hit) => hit.endsWith(' github-token')));
  assert.equal(scanText('person@example.com\n', 'notes.txt').length, 0);
});

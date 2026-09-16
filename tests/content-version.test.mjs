import test from 'node:test';
import assert from 'node:assert/strict';
import { previewIsCurrent } from '../content-version.js';

test('Publishing new photos supersedes older browser previews', () => {
  const published = { updatedAt: '2026-09-16T09:00:00.000Z' };
  assert.equal(previewIsCurrent(published, null), false);
  assert.equal(previewIsCurrent(published, {}), false);
  assert.equal(previewIsCurrent(published, { updatedAt: '2026-09-10T09:00:00.000Z' }), false);
  assert.equal(previewIsCurrent(published, { updatedAt: 'invalid' }), false);
  assert.equal(previewIsCurrent(published, { ...published }), true);
  assert.equal(previewIsCurrent(published, { updatedAt: '2026-09-16T09:01:00.000Z' }), true);
  assert.equal(previewIsCurrent({}, {}), true);
});

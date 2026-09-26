import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, segmentText, demoScores, sampleBook, buildExport, dominant, emotions, type Scores } from '../src/model.ts';
test('segmentation preserves every normalized character with stable contiguous offsets', () => {
  for (const text of ['word '.repeat(4301), '😀'.repeat(2011), 'a'.repeat(2400), 'first\n\nsecond\n\n' + 'third '.repeat(701)]) {
    for (const mode of ['pages', 'paragraphs'] as const) {
      const normalized = normalize(text), parts = segmentText(normalized, mode);
      assert.equal(parts.map(s => s.text).join(''), normalized);
      assert.deepEqual(parts, segmentText(normalized, mode));
      parts.forEach((s, i) => { assert.equal(s.start, i ? parts[i - 1].end : 0); assert.equal(s.text, normalized.slice(s.start, s.end)); assert.ok(s.text.length <= 1800); assert.ok(s.end > s.start); assert.ok(!/[\uD800-\uDBFF]$/.test(s.text)); });
    }
  }
});
test('normalization and paragraph boundaries are reproducible', () => {
  assert.equal(normalize('  cafe\u0301  \r\n\r\n\r\n next\tword '), 'café\n\nnext word');
  assert.deepEqual(segmentText('one\n\ntwo\n\nthree', 'paragraphs').map(p => p.text), ['one\n\n','two\n\n','three']);
  assert.deepEqual(segmentText('', 'pages'), []);
  assert.throws(() => segmentText('abc', 'pages', 0));
});
test('uploads remain unscored; demo is explicitly attributed in export', () => {
  const parts = segmentText('A happy day.', 'pages'); assert.equal(parts[0].scores, undefined);
  const dataset = buildExport(sampleBook, 'pages', demoScores(parts));
  assert.equal(dataset.book.demo, true); assert.equal(dataset.status, 'complete');
  assert.equal(dataset.segments[0].model, 'synthetic-demo-v1');
  assert.equal(buildExport(sampleBook, 'pages', parts).status, 'not-analyzed');
});
test('neutral text is not forced into an emotion', () => {
  const part = segmentText('Plain text', 'pages')[0];
  const scores = Object.fromEntries(emotions.map(e => [e.id, 0.1])) as Scores;
  assert.equal(dominant({ ...part, scores }), 'neutral');
  scores.joy = 0.8; assert.equal(dominant({ ...part, scores }), 'joy');
});
test('treemap conserves weighted area with bounded nonoverlapping rectangles', async () => {
  const { treemap } = await import('../src/model.ts');
  const rects = treemap([{ id: 'a', value: 7 }, { id: 'b', value: 2 }, { id: 'c', value: 1 }, { id: 'empty', value: 0 }]);
  assert.equal(rects.length, 3);
  for (const a of rects) {
    assert.ok(Math.abs(a.width * a.height / 10000 - a.value / 10) < 1e-9);
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= 100.001 && a.y + a.height <= 100.001);
    for (const b of rects) if (a.id !== b.id) assert.ok(a.x + a.width <= b.x + 1e-9 || b.x + b.width <= a.x + 1e-9 || a.y + a.height <= b.y + 1e-9 || b.y + b.height <= a.y + 1e-9);
  }
});

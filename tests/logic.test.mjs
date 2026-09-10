import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReasonBag, validateContent, validateQuestions, validateMultipleChoiceQuestions, safeImageSource, quizScore, isCorrectAnswer, applyPhotoEntries, validPhotoYear, siteStorageKey, upgradeContent } from '../logic.js';
const content = JSON.parse(await readFile(new URL('../content.json', import.meta.url)));
const reasons = JSON.parse(await readFile(new URL('../reasons.json', import.meta.url)));
const questions = [
  { question: 'Where did we go on holiday?', answers: ['New Delhi', 'Delhi'], challenge: 'Share a funny memory.' },
  { question: 'Our favorite cafe?', answers: ['Mum’s Cafe'] },
];

test('The gift has valid personal questions, 30 photos, and 200 distinct reasons', () => {
  assert.equal(validateContent(content), content);
  assert.ok(content.questions.length <= 10);
  assert.equal(content.photos.length, 30);
  assert.equal(reasons.length, 200);
  assert.equal(new Set(reasons).size, 200);
  assert.ok(!/thirty|30th|30 years/i.test(content.letter + reasons.join(' ')));
});
test('Every reason is shown before a repeat, including cycle boundaries', () => {
  const bag = createReasonBag(200); let last;
  for (let cycle = 0; cycle < 5; cycle++) {
    const values = Array.from({ length: 200 }, () => bag.next());
    assert.notEqual(values[0], last); assert.equal(new Set(values).size, 200);
    assert.ok(values.every(n => n >= 0 && n < 200)); last = values.at(-1);
  }
});
test('Personal quiz scores accepted spellings while ignoring case, spacing and final punctuation', () => {
  assert.equal(quizScore(questions, []), 0);
  assert.equal(quizScore(questions, ['  new   DELHI! ', "mum's cafe"]), 2);
  assert.equal(quizScore(questions, ['Delhi', 'wrong']), 1);
  assert.equal(quizScore(questions, ['New York', 'wrong']), 0);
  assert.equal(quizScore([], []), 0);
  assert.equal(isCorrectAnswer(questions[0], 0), false);
});
test('Questions allow an empty list and reject missing answers, repeats and more than ten', () => {
  assert.equal(validateQuestions(questions), questions);
  assert.deepEqual(validateQuestions([]), []);
  assert.throws(() => validateQuestions([{ question: 'Memory?', answers: [] }]), /answer/);
  assert.throws(() => validateQuestions([questions[0], questions[0]]), /repeats/);
  assert.throws(() => validateQuestions(Array(11).fill(questions[0])), /up to 10/);
  const legacy = { question: 'Memory?', options: ['A','B','C','D'], answer: 2 };
  assert.equal(quizScore([legacy], [2]), 1);
  assert.throws(() => validateQuestions([{ ...legacy, options: ['A','A','C','D'] }]), /distinct/);
});
test('Older browser previews lose generated starters and age copy, preserving custom edits', () => {
  const old = { ...structuredClone(content), version: 1, letter: 'Here’s to thirty, and to every day.', questions: [{ question: 'Thirty years of you. What’s my birthday wish?' }, questions[0]] };
  const updated = upgradeContent(old);
  assert.equal(updated.version, 3); assert.equal(updated.letter, 'Here’s to every day.');
  assert.deepEqual(updated.questions, [questions[0]]);
  assert.deepEqual(updated.photos, old.photos); assert.equal(old.version, 1);
  assert.deepEqual(upgradeContent(updated), updated);
});
test('Photos save a year into selected slots without changing other photos or questions', () => {
  const source = { ...content, questions };
  const updated = applyPhotoEntries(source, [{ slot: 4, src: './assets/test.jpg', year: 2020, caption: ' Our holiday ' }]);
  assert.equal(updated.photos[4].year, 2020); assert.equal(updated.photos[4].caption, 'Our holiday');
  assert.equal(updated.photos[4].placeholder, false);
  assert.deepEqual(updated.questions, questions); assert.deepEqual(updated.photos[3], source.photos[3]);
  assert.notDeepEqual(updated.photos[4], source.photos[4]);
  const entry = { slot: 0, src: './assets/test.jpg', year: 2020 };
  assert.throws(() => applyPhotoEntries(source, [entry, entry]), /Two photos/);
  assert.throws(() => applyPhotoEntries(source, [{ ...entry, slot: 30 }]), /position/);
  for (const year of [0, 1899, 2020.5, new Date().getFullYear() + 1, '2020']) {
    assert.equal(validPhotoYear(year), false);
    assert.throws(() => applyPhotoEntries(source, [{ ...entry, year }]), /year/);
  }
});
test('Main page and upload page share a preview under the same project path', () => {
  assert.equal(siteStorageKey('/rupade-turns-30/'), siteStorageKey('/rupade-turns-30/upload.html'));
  assert.equal(siteStorageKey('/'), siteStorageKey('/index.html'));
  assert.notEqual(siteStorageKey('/'), siteStorageKey('/other/'));
});
test('Imported image sources reject scripts, traversal and embedded credentials', () => {
  for (const src of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'https://user:password@example.com/p.jpg', '../../secret.png', './assets/../secret.jpg']) assert.equal(safeImageSource(src), '');
  assert.equal(safeImageSource('data:image/jpeg;base64,YWJj'), 'data:image/jpeg;base64,YWJj');
  const invalid = structuredClone(content); invalid.photos[0].src = 'javascript:alert(1)';
  assert.throws(() => validateContent(invalid), /Photo 1/);
});
test('Every bundled gallery image exists', async () => {
  for (const photo of content.photos) {
    const bytes = await readFile(new URL('../' + photo.src, import.meta.url));
    assert.ok(bytes.length > 1000, photo.src); assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
  }
});

test('Multiple-choice quizzes require four distinct choices and one selected answer', () => {
  const question = { question: 'Where did we first meet?', options: ['Delhi', 'Mumbai', 'Pune', 'Jaipur'], answer: 2, challenge: 'Share a memory.' };
  assert.deepEqual(validateMultipleChoiceQuestions([]), []);
  assert.deepEqual(validateMultipleChoiceQuestions([question]), [question]);
  for (const answer of [null, undefined, -1, 4, '2', true]) {
    assert.throws(() => validateMultipleChoiceQuestions([{ ...question, answer }]), /correct answer/);
  }
  for (const options of [['Delhi', 'Mumbai'], ['Delhi', 'Mumbai', '', 'Jaipur'], ['Delhi', 'Mumbai', ' delhi ', 'Jaipur']]) {
    assert.throws(() => validateMultipleChoiceQuestions([{ ...question, options }]), /four distinct choices/);
  }
  assert.throws(() => validateMultipleChoiceQuestions(questions), /four choices/);
  for (let answer = 0; answer < 4; answer++) {
    const q = { ...question, answer };
    assert.equal(quizScore([q], [answer]), 1);
    assert.equal(quizScore([q], [(answer + 1) % 4]), 0);
    assert.equal(quizScore([q], []), 0);
    assert.equal(quizScore([q], [String(answer)]), 0);
  }
});

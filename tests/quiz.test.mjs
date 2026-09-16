import assert from 'node:assert/strict';
import test from 'node:test';
import { isCorrectAnswer, normalizeAnswer, validateQuestions, validateMultipleChoiceQuestions } from '../quiz-logic.js';

const bali = {
  question: 'Bali you will go with whom',
  options: ['Yash', 'Your husband', 'Will not go', 'Prefer not to answer'],
  answer: 0,
  acceptedAnswers: [0, 1],
  challenge: '',
};

test('Equivalent multiple-choice answers both count as correct, including choice zero', () => {
  assert.equal(validateMultipleChoiceQuestions([bali])[0], bali);
  assert.equal(isCorrectAnswer(bali, 0), true);
  assert.equal(isCorrectAnswer(bali, 1), true);
  for (const answer of [2, 3, -1, 4, 0.5, '0', null, undefined, false]) {
    assert.equal(isCorrectAnswer(bali, answer), false);
  }
});

test('Single-answer questions remain backwards compatible', () => {
  const single = { ...bali, answer: 3 };
  delete single.acceptedAnswers;
  assert.equal(validateMultipleChoiceQuestions([single])[0], single);
  assert.equal(isCorrectAnswer(single, 3), true);
  assert.equal(isCorrectAnswer(single, 0), false);
  assert.equal(isCorrectAnswer(single, undefined), false);
});

test('Accepted choices must be unique valid indices and include the primary answer', () => {
  for (const acceptedAnswers of [[], [0, 0], [1], [0, -1], [0, 4], [0, 1.5], [0, '1'], [0, false], null, '0,1']) {
    assert.throws(() => validateQuestions([{ ...bali, acceptedAnswers }]), /accepted answers/);
  }
  assert.throws(() => validateQuestions([{ ...bali, answer: null }]), /correct answer/);
  assert.throws(() => validateQuestions([{ ...bali, options: ['Yash', 'Yash', 'No', 'Maybe'] }]), /distinct choices/);
});

test('Legacy text answers retain normalized alias matching', () => {
  const legacy = { question: 'A favourite place?', answers: ['Mum’s Cafe', 'Our cafe'] };
  assert.equal(validateQuestions([legacy])[0], legacy);
  assert.equal(normalizeAnswer('  MUM’S   CAFE!  '), "mum's cafe");
  assert.equal(isCorrectAnswer(legacy, "  Mum's cafe. "), true);
  assert.equal(isCorrectAnswer(legacy, 'Our cafe'), true);
  assert.equal(isCorrectAnswer(legacy, 'Somewhere else'), false);
  assert.equal(isCorrectAnswer(legacy, 0), false);
  assert.throws(() => validateMultipleChoiceQuestions([legacy]), /four choices/);
  assert.throws(() => validateQuestions([{ ...legacy, acceptedAnswers: [0] }]), /multiple-choice/);
});

test('Personal questions retain empty-list, duplicate and count validation', () => {
  assert.deepEqual(validateMultipleChoiceQuestions([]), []);
  assert.throws(() => validateQuestions([bali, { ...bali, question: ` ${bali.question.toUpperCase()} ` }]), /repeats/);
  assert.throws(() => validateQuestions(Array.from({ length: 11 }, (_, i) => ({ ...bali, question: `Question ${i}` }))), /up to 10/);
  assert.throws(() => validateQuestions([{ ...bali, challenge: 1 }]), /invalid challenge/);
});

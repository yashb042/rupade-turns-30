export function normalizeAnswer(value) {
  return String(value).normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/g, '').trim().replace(/\s+/g, ' ');
}

export function isCorrectAnswer(question, answer) {
  if (Array.isArray(question.options)) {
    if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) return false;
    return (question.acceptedAnswers || [question.answer]).includes(answer);
  }
  return typeof answer === 'string' && question.answers.some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
}

export function validateQuestions(questions) {
  const text = (s, max) => typeof s === 'string' && !!s.trim() && s.length <= max;
  if (!Array.isArray(questions) || questions.length > 10) throw new Error('Add up to 10 personal questions.');
  const seen = new Set();
  questions.forEach((q, i) => {
    if (!q || !text(q.question, 300)) throw new Error(`Question ${i + 1} needs a question.`);
    if (seen.has(q.question.trim().toLowerCase())) throw new Error(`Question ${i + 1} repeats an earlier question.`);
    seen.add(q.question.trim().toLowerCase());
    if (Array.isArray(q.options)) {
      if (q.options.length !== 4 || !q.options.every(s => text(s, 200)) || new Set(q.options.map(s => s.trim().toLowerCase())).size !== 4 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) throw new Error(`Question ${i + 1} needs four distinct choices and a correct answer.`);
      if (q.acceptedAnswers !== undefined && (!Array.isArray(q.acceptedAnswers) || !q.acceptedAnswers.length || !q.acceptedAnswers.every(answer => Number.isInteger(answer) && answer >= 0 && answer < q.options.length) || new Set(q.acceptedAnswers).size !== q.acceptedAnswers.length || !q.acceptedAnswers.includes(q.answer))) throw new Error(`Question ${i + 1} needs distinct valid accepted answers, including its correct answer.`);
    } else {
      if (!Array.isArray(q.answers) || !q.answers.length || q.answers.length > 10 || !q.answers.every(s => text(s, 200))) throw new Error(`Question ${i + 1} needs at least one answer.`);
      if (q.acceptedAnswers !== undefined) throw new Error(`Question ${i + 1} can only use accepted choices with multiple-choice answers.`);
    }
    if (q.challenge !== undefined && (typeof q.challenge !== 'string' || q.challenge.length > 500)) throw new Error(`Question ${i + 1} has an invalid challenge.`);
  });
  return questions;
}

export function validateMultipleChoiceQuestions(questions) {
  validateQuestions(questions);
  questions.forEach((q, i) => {
    if (!Array.isArray(q.options)) throw new Error(`Question ${i + 1} needs four choices and a correct answer. Add the choices in the editor.`);
  });
  return questions;
}

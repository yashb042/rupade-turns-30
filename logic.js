export const CATEGORIES = ['adventures', 'little-things', 'cozy'];

export function safeImageSource(source) {
  if (typeof source !== 'string') return '';
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(source)) return source;
  if (/^https:\/\//.test(source)) { try { const url = new URL(source); return url.username || url.password ? '' : url.href; } catch { return ''; } }
  if (/^(\.\/)?assets\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp|svg)$/.test(source) && !source.includes('..')) return source;
  return '';
}

export function validateContent(data) {
  const validText = (s, max = 2500) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  if (!data || !validText(data.wife, 60) || !validText(data.husband, 60) || !validText(data.letter)) throw new Error('Please add both names and a birthday letter.');
  if (!Array.isArray(data.questions) || data.questions.length !== 10) throw new Error('Your quiz needs exactly 10 questions.');
  data.questions.forEach((q, i) => {
    if (!validText(q.question, 300) || !Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(s => validText(s, 200)) || new Set(q.options.map(s => s.trim().toLowerCase())).size !== 4 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3 || !validText(q.challenge, 500)) throw new Error(`Question ${i + 1} needs a question, four distinct choices, a correct answer, and a challenge.`);
  });
  if (!Array.isArray(data.photos) || data.photos.length !== 30) throw new Error('The scrapbook needs exactly 30 photos.');
  data.photos.forEach((p, i) => {
    if (!safeImageSource(p.src) || !validText(p.caption, 120) || !CATEGORIES.includes(p.category)) throw new Error(`Photo ${i + 1} needs a valid image, caption, and category.`);
  });
  return data;
}

// Fisher–Yates bag: every reason is shown once before a new cycle begins.
export function createReasonBag(size, random = Math.random) {
  if (!Number.isInteger(size) || size < 2) throw new Error('At least two reasons are required.');
  let remaining = [], last = -1;
  return { next() {
    if (!remaining.length) {
      remaining = Array.from({ length: size }, (_, i) => i);
      for (let i = size - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [remaining[i], remaining[j]] = [remaining[j], remaining[i]]; }
      if (remaining.at(-1) === last) [remaining[0], remaining[size - 1]] = [remaining[size - 1], remaining[0]];
    }
    last = remaining.pop();
    return last;
  } };
}

export function quizScore(questions, answers) {
  return questions.reduce((score, q, i) => score + (Number.isInteger(answers[i]) && answers[i] === q.answer ? 1 : 0), 0);
}

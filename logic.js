import { isCorrectAnswer, validateQuestions } from './quiz-logic.js';
export { normalizeAnswer, isCorrectAnswer, validateQuestions, validateMultipleChoiceQuestions } from './quiz-logic.js';

export const CATEGORIES = ['adventures', 'little-things', 'cozy'];
export const MAX_UPLOAD_BATCH = 30;
export const MAX_GALLERY_PHOTOS = 200;

export function upgradeContent(data) {
  const updated = structuredClone(data);
  if (updated && (updated.version || 1) < 2) {
    if (typeof updated.letter === 'string') updated.letter = updated.letter.replace('Here’s to thirty, and to', 'Here’s to');
    updated.questions?.forEach(q => { if (typeof q.question === 'string') q.question = q.question.replace('Thirty years of you. ', ''); });
    updated.version = 2;
  }
  if (updated && (updated.version || 1) < 3) {
    const starters = new Set(['Where is my favorite place in the whole world?', 'If our love story had a mascot, what would it be?', 'What’s the secret ingredient in a perfect date?', 'What do I hope we never grow out of?', 'Which version of you is my favorite?', 'What’s our official rule for a rainy day?', 'What’s the right amount of birthday love?', 'What’s the best part of a new adventure?', 'What do I want more of in our next chapter?', 'What’s my birthday wish?']);
    if (Array.isArray(updated.questions)) updated.questions = updated.questions.filter(q => !starters.has(q.question));
    updated.version = 3;
  }
  return updated;
}

export function siteStorageKey(pathname) {
  return 'rupade-30:' + pathname.replace(/[^/]*$/, '');
}

export function validPhotoYear(year) {
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear();
}

export function applyPhotoEntries(content, entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_UPLOAD_BATCH) throw new Error(`Choose between 1 and ${MAX_UPLOAD_BATCH} photos in a batch.`);
  validateContent(content);
  const updated = structuredClone(content);
  const slots = new Set();
  for (const entry of entries) {
    if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= updated.photos.length) throw new Error('Choose a gallery position for every photo.');
    if (slots.has(entry.slot)) throw new Error(`Two photos use position ${entry.slot + 1}. Choose a different position for each photo.`);
    if (!validPhotoYear(entry.year)) throw new Error(`Photo ${entry.slot + 1} needs a year between 1900 and ${new Date().getFullYear()}.`);
    slots.add(entry.slot);
    updated.photos[entry.slot] = {
      src: entry.src,
      year: entry.year,
      caption: entry.caption?.trim() || `A little moment from ${entry.year}`,
      category: entry.category || 'little-things',
      placeholder: false,
    };
  }
  return validateContent(updated);
}

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
  validateQuestions(data.questions);
  if (!Array.isArray(data.photos) || !data.photos.length || data.photos.length > MAX_GALLERY_PHOTOS) throw new Error(`The scrapbook needs between 1 and ${MAX_GALLERY_PHOTOS} photos.`);
  data.photos.forEach((p, i) => {
    if (!safeImageSource(p.src) || !validText(p.caption, 120) || !CATEGORIES.includes(p.category)) throw new Error(`Photo ${i + 1} needs a valid image, caption, and category.`);
    if (p.year !== undefined && p.year !== null && !validPhotoYear(p.year)) throw new Error(`Photo ${i + 1} needs a year between 1900 and ${new Date().getFullYear()}.`);
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
  return questions.reduce((score, q, i) => score + (answers[i] !== undefined && isCorrectAnswer(q, answers[i]) ? 1 : 0), 0);
}

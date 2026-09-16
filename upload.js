import { MAX_UPLOAD_BATCH, applyPhotoEntries, safeImageSource, validPhotoYear, validateContent, validateMultipleChoiceQuestions, upgradeContent } from './logic.js';
import { resizePhoto } from './photo-tools.js';
import { previewStorage } from './storage.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yearMax = new Date().getFullYear();
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const apiBase = local ? location.origin : 'http://localhost:3030';
let content, session, pending, queue = [], busy = false, requestID = null;
let personalQuestions = [], quizRequestID = null;

function status(message, error = false) {
  $('#upload-status').textContent = message;
  $('#upload-status').classList.toggle('error', error);
}
function buttons() {
  $('#upload-controls').disabled = busy || !content;
  $('#upload-button').disabled = busy || !queue.length || !!pending;
  $('#retry-publish').hidden = !pending;
  $('#retry-publish').disabled = busy;
  $('#upload-button').textContent = busy ? 'Taking care of your memories…' : `Upload ${queue.length > 1 ? queue.length + ' photos' : 'to the website'} ↗`;
  $('#queue-count').textContent = queue.length;
  $('#empty-queue').hidden = queue.length > 0;
  $('#question-controls').disabled = busy || !content;
  $('#save-questions').disabled = busy || !content || !!pending;
  $('#add-personal-question').disabled = busy || personalQuestions.length >= 10;
  $('#retry-questions').hidden = !pending;
  $('#retry-questions').disabled = busy;
}
function fallback(img) { img.addEventListener('error', () => { img.src = './assets/cat.svg'; }, { once: true }); }
function renderExisting(previews = new Map()) {
  const real = content.photos.filter(photo => !photo.placeholder).length;
  $('#slot-count').textContent = `${real} personal photos · ${content.photos.length - real} sample photos to replace`;
  $('#existing-photos').innerHTML = content.photos.map((p, i) => `<figure class="existing-photo"><img src="${esc(previews.get(i) || safeImageSource(p.src))}" alt="${esc(p.caption)}" loading="lazy"><span class="photo-tag">${String(i + 1).padStart(2, '0')} · ${p.placeholder ? 'Sample' : (p.year || 'Memory')}</span><figcaption>${p.year ? `<span class="year-label">${p.year}</span> · ` : ''}${esc(p.caption)}</figcaption></figure>`).join('');
  document.querySelectorAll('.existing-photo img').forEach(fallback);
}
function renderQueue() {
  $('#upload-queue').innerHTML = queue.map((p, i) => `<article class="upload-row"><img src="${esc(p.src)}" alt="Selected photo ${i + 1}"><div class="upload-fields"><label>Year <span aria-hidden="true">*</span><input aria-label="Year for photo ${i + 1}" data-year="${i}" type="number" min="1900" max="${yearMax}" step="1" required inputmode="numeric" placeholder="e.g. 2024" value="${esc(p.year)}"></label><label>Caption <span>(optional)</span><input data-caption="${i}" aria-label="Caption for photo ${i + 1}" maxlength="120" value="${esc(p.caption)}" placeholder="A little moment to keep"></label><label class="slot-field">Place in the scrapbook<select data-slot="${i}" aria-label="Gallery position for photo ${i + 1}"><option value="">Choose a position</option>${content.photos.map((existing, slot) => `<option value="${slot}" ${p.slot === slot ? 'selected' : ''}>${String(slot + 1).padStart(2, '0')} · ${existing.placeholder ? 'Replace sample photo' : `Replace: ${esc(existing.caption)}`}${existing.year ? ' (' + existing.year + ')' : ''}</option>`).join('')}</select></label></div><button type="button" class="remove-upload" data-remove="${i}" aria-label="Remove selected photo ${i + 1}">×</button></article>`).join('');
  buttons();
}
function captureQueue() {
  document.querySelectorAll('[data-year]').forEach(input => queue[Number(input.dataset.year)].year = input.value);
  document.querySelectorAll('[data-caption]').forEach(input => queue[Number(input.dataset.caption)].caption = input.value);
  document.querySelectorAll('[data-slot]').forEach(input => queue[Number(input.dataset.slot)].slot = input.value === '' ? null : Number(input.value));
}
async function chooseFiles(files, fromFolder = false) {
  if (busy || !content) return;
  captureQueue();
  const chosen = fromFolder ? files.filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true })) : files;
  if (!chosen.length) { if (files.length) status('This folder has no JPG, PNG, or WebP photos. Export HEIC photos as JPG first.', true); return; }
  if (chosen.length + queue.length > MAX_UPLOAD_BATCH) { status(`Choose up to ${MAX_UPLOAD_BATCH} photos in a batch. Remove some selected photos before adding more.`, true); return; }
  busy = true; buttons(); $('#upload-success').hidden = true;
  try {
    const prepared = [];
    const reserved = new Set(queue.map(p => p.slot));
    const available = content.photos.map((p, i) => p.placeholder && !reserved.has(i) ? i : null).filter(i => i !== null);
    for (let i = 0; i < chosen.length; i++) {
      status(`Preparing photo ${i + 1} of ${chosen.length}…`);
      prepared.push({ src: await resizePhoto(chosen[i]), year: $('#batch-year').value, caption: '', slot: available[i] ?? null, category: 'little-things' });
    }
    queue.push(...prepared); requestID = null;
    status('Add the year for each photo, then press Upload.');
    renderQueue();
  } catch (error) { status(error.message, true); }
  finally { busy = false; buttons(); $('#photo-files').value = ''; $('#photo-folder').value = ''; }
}

async function connect() {
  const response = await fetch(apiBase + '/api/session', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('The local upload service is not available.');
  const data = await response.json();
  if (!data.token || !data.revision) throw new Error('Restart the birthday server to enable uploads.');
  validateContent(data.content);
  session = data;
  pending = data.pending;
  $('#connection-help').hidden = true;
  return data;
}
async function post(action, payload) {
  const response = await fetch(apiBase + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gift-Token': session.token },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(180000),
  });
  const data = await response.json();
  if (!response.ok && !data.saved) throw new Error(data.error || 'The upload could not be completed.');
  return data;
}
async function applyResult(data, entries = []) {
  content = validateContent(data.content);
  session.revision = data.revision;
  pending = data.pending || null;
  const preview = structuredClone(content);
  // New images are available immediately in this browser while Pages finishes its build.
  for (const entry of entries) preview.photos[entry.slot].src = entry.src;
  let previewSaved = true;
  try { await previewStorage(preview); } catch { previewSaved = false; }
  if (data.kind === 'photos') { queue = []; requestID = null; }
  else { quizRequestID = null; personalQuestions = content.questions.map(questionDraft); renderQuestions(); }
  renderQueue(); renderExisting(new Map(entries.map(p => [p.slot, p.src])));
  if (data.published) {
    $('#upload-success').hidden = false;
    $('#success-message').textContent = data.kind === 'questions' ? `${data.count} personal question${data.count === 1 ? '' : 's'} saved. The quiz will use only your questions and answers. The public site will update when GitHub finishes publishing, usually within a minute.` : `${data.count} photo${data.count === 1 ? '' : 's'} and ${data.count === 1 ? 'its year are' : 'their years are'} saved and sent to GitHub. The public gallery will update when GitHub finishes publishing, usually within a minute.`;
    status(previewSaved ? 'Uploaded. Your scrapbook has a new little story. ♡' : 'Uploaded successfully. Open the public gallery in a minute; this browser could not save an immediate preview.');
  } else status(data.error, true);
  if (data.kind === 'questions') {
    $('#questions-status').textContent = data.published ? 'Your questions are saved and sent to GitHub. The quiz will update shortly.' : data.error;
    $('#questions-status').classList.toggle('error', !data.published);
  }
}

function questionDraft(q = {}) {
  return {
    question: q.question || '',
    options: q.options ? [...q.options] : [q.answers?.[0] || '', '', '', ''],
    answer: q.options ? q.answer : q.answers?.[0] ? 0 : null,
    acceptedAnswers: q.options ? (q.acceptedAnswers || (Number.isInteger(q.answer) ? [q.answer] : [])) : q.answers?.[0] ? [0] : [],
    challenge: q.challenge || '',
  };
}
function renderQuestions() {
  $('#personal-questions').innerHTML = personalQuestions.map((q, i) => `<article class="personal-question"><div class="personal-question-heading"><h3>Question ${i + 1}</h3><button type="button" class="text-button" data-remove-question="${i}">Remove</button></div><label>Question<textarea data-personal-question="${i}" rows="2" maxlength="300" placeholder="e.g. Where did we go on our first holiday?">${esc(q.question)}</textarea></label><fieldset class="question-choices"><legend>Answer choices</legend><p class="choice-help">Fill in all four choices, then mark each answer that should count as correct.</p><div class="question-choice-grid">${q.options.map((option, j) => `<div class="question-choice"><label>Choice ${'ABCD'[j]}<input data-personal-option="${i}:${j}" maxlength="200" value="${esc(option)}" placeholder="Write choice ${'ABCD'[j]}" required></label><label class="correct-choice"><input type="checkbox" name="correct-question-${i}" data-personal-correct="${i}" value="${j}" ${q.acceptedAnswers.includes(j) ? 'checked' : ''} aria-label="Mark choice ${'ABCD'[j]} as correct for question ${i + 1}"><span>Correct answer</span></label></div>`).join('')}</div></fieldset><label>Wrong-answer challenge <span>(optional)</span><input data-personal-challenge="${i}" maxlength="500" value="${esc(q.challenge)}" placeholder="e.g. Share a funny memory of us"></label></article>`).join('');
  if (!personalQuestions.length) $('#personal-questions').innerHTML = '<p class="empty-queue">No questions yet. Add your first question below.</p>';
  buttons();
}
function captureQuestions() {
  personalQuestions = personalQuestions.map((_, i) => {
    const correct = [...document.querySelectorAll(`[data-personal-correct="${i}"]:checked`)].map(input => Number(input.value));
    return {
      question: document.querySelector(`[data-personal-question="${i}"]`).value.trim(),
      options: Array.from({ length: 4 }, (_, j) => document.querySelector(`[data-personal-option="${i}:${j}"]`).value.trim()),
      answer: correct[0] ?? null,
      ...(correct.length > 1 ? { acceptedAnswers: correct } : {}),
      challenge: document.querySelector(`[data-personal-challenge="${i}"]`).value.trim(),
    };
  }).map(questionDraft);
  return personalQuestions;
}
$('#add-personal-question').addEventListener('click', () => { captureQuestions(); if (personalQuestions.length >= 10) return; personalQuestions.push(questionDraft()); quizRequestID = null; renderQuestions(); document.querySelector(`[data-personal-question="${personalQuestions.length - 1}"]`).focus(); });
$('#personal-questions').addEventListener('input', () => { quizRequestID = null; });
$('#personal-questions').addEventListener('click', event => { const button = event.target.closest('[data-remove-question]'); if (!button || busy) return; captureQuestions(); personalQuestions.splice(Number(button.dataset.removeQuestion), 1); quizRequestID = null; renderQuestions(); });
$('#questions-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || pending) return;
  try { captureQuestions(); validateMultipleChoiceQuestions(personalQuestions); }
  catch (error) { $('#questions-status').textContent = error.message; $('#questions-status').classList.add('error'); return; }
  captureQueue(); busy = true; buttons();
  $('#questions-status').textContent = 'Saving your questions and publishing the quiz…'; $('#questions-status').classList.remove('error');
  try {
    if (!session) { const data = await connect(); content = data.content; renderExisting(); }
    quizRequestID ||= crypto.randomUUID();
    await applyResult(await post('/api/questions', { id: quizRequestID, revision: session.revision, questions: personalQuestions }));
  } catch (error) { $('#questions-status').textContent = error instanceof TypeError ? 'Keep the birthday server running on this computer, then try Save questions again.' : error.message; $('#questions-status').classList.add('error'); if (!session) $('#connection-help').hidden = false; }
  finally { busy = false; buttons(); }
});

$('#photo-files').addEventListener('change', event => chooseFiles([...event.target.files]));
$('#photo-folder').addEventListener('change', event => chooseFiles([...event.target.files], true));
$('#batch-year').max = String(yearMax);
$('#apply-year').addEventListener('click', () => {
  const value = Number($('#batch-year').value);
  if (!validPhotoYear(value)) { status(`Enter a year from 1900 to ${yearMax}.`, true); $('#batch-year').focus(); return; }
  captureQueue(); queue.forEach(p => p.year = String(value)); requestID = null; renderQueue(); status('Year applied. You can still change individual years.');
});
$('#upload-queue').addEventListener('input', () => { requestID = null; });
$('#upload-queue').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (!button || busy) return;
  captureQueue(); queue.splice(Number(button.dataset.remove), 1); requestID = null; renderQueue();
});
for (const name of ['dragenter', 'dragover']) $('#drop-zone').addEventListener(name, event => { event.preventDefault(); if (!busy) $('#drop-zone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('#drop-zone').addEventListener(name, event => { event.preventDefault(); $('#drop-zone').classList.remove('dragover'); });
$('#drop-zone').addEventListener('drop', event => chooseFiles([...event.dataTransfer.files]));
$('#upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !queue.length || pending) return;
  captureQueue();
  const entries = queue.map(photo => ({ ...photo, year: Number(photo.year) }));
  try { applyPhotoEntries(content, entries); }
  catch (error) { status(error.message, true); const i = queue.findIndex(p => !validPhotoYear(Number(p.year))); if (i >= 0) document.querySelector(`[data-year="${i}"]`).focus(); return; }
  busy = true; buttons();
  try {
    if (!session) {
      const data = await connect();
      if (JSON.stringify(data.content.photos) !== JSON.stringify(content.photos)) { content = data.content; renderExisting(); renderQueue(); throw new Error('The scrapbook has newer photos. Review the gallery positions, then press Upload again.'); }
    }
    requestID ||= crypto.randomUUID();
    status('Uploading your photos, saving their years, and publishing to GitHub…');
    const data = await post('/api/photos', { id: requestID, revision: session.revision, entries });
    await applyResult(data, entries);
  } catch (error) {
    status(error instanceof TypeError || error.name === 'TimeoutError' ? 'The upload connection was interrupted. Your selected photos are still here. Keep the birthday server running and try Upload again.' : error.message, true);
    if (!session) $('#connection-help').hidden = false;
  } finally { busy = false; buttons(); }
});
$('#retry-publish').addEventListener('click', async () => {
  if (busy || !pending) return;
  busy = true; buttons(); status('Finishing publication of your saved changes…');
  try { await applyResult(await post('/api/publish', { id: pending.id })); }
  catch (error) { status(error.message, true); }
  finally { busy = false; buttons(); }
});
$('#retry-questions').addEventListener('click', () => $('#retry-publish').click());

async function init() {
  try {
    const response = await fetch('./content.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not open the scrapbook. Refresh to try again.');
    content = validateContent(upgradeContent(await response.json()));
    try { content = (await connect()).content; }
    catch { $('#connection-help').hidden = false; }
    personalQuestions = content.questions.map(questionDraft);
    if (!personalQuestions.length) personalQuestions.push(questionDraft());
    renderExisting(); renderQueue(); renderQuestions();
    status(pending ? 'Your previous changes are saved. Use Finish publishing to put them on the public website.' : session ? 'Ready for your memories. Choose photos to begin.' : 'Choose your photos below. Uploading needs the birthday server running on this computer.');
  } catch (error) { status(error.message, true); }
  finally { buttons(); }
}
init();

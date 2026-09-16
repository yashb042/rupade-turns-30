import { previewIsCurrent } from './content-version.js';
import { CATEGORIES, MAX_UPLOAD_BATCH, safeImageSource, validateContent, createReasonBag, quizScore, upgradeContent, isCorrectAnswer } from './logic.js';
import { storageKey, previewStorage } from './storage.js';
import { resizePhoto } from './photo-tools.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
let content, reasons, draft, bag, currentReason = 0, questionIndex = 0, answers = [], challengeResolved = false;
let filter = 'all', filterYear = 'all', expanded = false, activePhotos = [], lightboxIndex = 0, toastTimer, photoBusy = false;
let saved = new Set();
try { const value = JSON.parse(localStorage.getItem(storageKey + ':notes') || '[]'); if (Array.isArray(value)) saved = new Set(value.filter(x => typeof x === 'string')); } catch { /* Storage can be unavailable in private browsing. */ }

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }

function imageFallback(img) {
  img.addEventListener('error', () => { img.src = './assets/cat.svg'; img.alt = 'Our two cats are keeping this photo’s place warm.'; }, { once: true });
}

function renderDetails() {
  $$('[data-wife]').forEach(el => el.textContent = content.wife);
  $$('[data-husband]').forEach(el => el.textContent = content.husband);
  document.title = `${content.wife}, you’re my favorite. ♡ Happy birthday`;
  $('#birthday-letter').textContent = content.letter;
  $('#hero-photo-one').src = safeImageSource(content.photos[0].src);
  $('#hero-photo-one').alt = content.photos[0].caption;
  const secondPhoto = content.photos[1] || content.photos[0];
  $('#hero-photo-two').src = safeImageSource(secondPhoto.src);
  $('#hero-photo-two').alt = secondPhoto.caption;
  $('.placeholder-note').hidden = !content.photos.some(p => p.placeholder);
}

function renderQuestion() {
  const total = content.questions.length;
  $('#quiz-progress').setAttribute('aria-valuemax', total || 1);
  $('#quiz-total').textContent = `${total} question${total === 1 ? '' : 's'}`;
  if (!total) {
    $('#question-count').textContent = 'OUR STORY';
    $('#quiz-score').textContent = '';
    $('#progress-fill').style.width = '0%';
    $('#quiz-progress').setAttribute('aria-valuenow', 0);
    $('#question-area').innerHTML = '<div class="quiz-result"><h3>A few memories to come back to.</h3><p>Our quiz is waiting for the questions that only we could write.</p><a class="button secondary" href="./upload.html#questions">Add our questions</a></div>';
    $('#quiz-feedback').innerHTML = '';
    $('.quiz-bottom').hidden = true;
    return;
  }
  const q = content.questions[questionIndex];
  challengeResolved = false;
  $('#question-count').textContent = `QUESTION ${pad(questionIndex + 1)} OF ${total}`;
  $('#quiz-score').textContent = `${quizScore(content.questions, answers)} correct`;
  $('#progress-fill').style.width = `${questionIndex / total * 100}%`;
  $('#quiz-progress').setAttribute('aria-valuenow', questionIndex);
  $('#question-area').innerHTML = `<h3 class="question-title" id="current-question" tabindex="-1">${esc(q.question)}</h3>` + (q.options ? `<div class="answers" role="group" aria-labelledby="current-question">${q.options.map((option,i) => `<button class="answer" data-answer="${i}"><span class="answer-letter" aria-hidden="true">${'ABCD'[i]}</span><span>${esc(option)}</span></button>`).join('')}</div>` : '<form id="text-answer-form"><label for="text-answer">Your answer</label><input id="text-answer" type="text" autocomplete="off" maxlength="200" required placeholder="Write your answer here"><button class="button secondary" type="submit">Check answer</button></form>');
  $('#quiz-feedback').innerHTML = '';
  $('#next-question').disabled = true;
  $('#next-question').innerHTML = questionIndex === total - 1 ? 'See my results <span aria-hidden="true">→</span>' : 'Next question <span aria-hidden="true">→</span>';
  $('#quiz-hint').textContent = 'Take your time.';
  $('.quiz-bottom').hidden = false;
}

function answerQuestion(choice) {
  if (answers[questionIndex] !== undefined) return;
  answers[questionIndex] = choice;
  const q = content.questions[questionIndex], correct = isCorrectAnswer(q, choice);
  $$('.answer').forEach((button,i) => { button.disabled = true; if (isCorrectAnswer(q, i)) button.classList.add('correct'); if (i === choice && !correct) button.classList.add('wrong'); });
  $$('#text-answer-form input, #text-answer-form button').forEach(el => el.disabled = true);
  $('#quiz-score').textContent = `${quizScore(content.questions, answers)} correct`;
  $('#progress-fill').style.width = `${(questionIndex + 1) / content.questions.length * 100}%`;
  $('#quiz-progress').setAttribute('aria-valuenow', questionIndex + 1);
  if (correct) {
    challengeResolved = true;
    $('#quiz-feedback').innerHTML = '<div class="feedback"><strong>That’s right.</strong>A memory we share.</div>';
    $('#next-question').disabled = false;
  } else {
    const challenge = q.challenge?.trim();
    $('#quiz-feedback').innerHTML = `<div class="feedback"><strong>Not quite.</strong><p>The answer: ${esc(q.options ? (q.acceptedAnswers || [q.answer]).map(i => q.options[i]).join(' or ') : q.answers[0])}</p>${challenge ? `<p>${esc(challenge)}</p><div class="challenge-actions"><button class="button primary" id="challenge-done">Done ✓</button><button class="text-button" id="challenge-skip">Skip challenge</button></div>` : ''}</div>`;
    challengeResolved = !challenge;
    $('#next-question').disabled = !!challenge;
    $('#quiz-hint').textContent = challenge ? 'Complete or skip the challenge to continue.' : 'Continue when you’re ready.';
  }
}

function finishQuiz() {
  const score = quizScore(content.questions, answers);
  $('#question-count').textContent = 'OUR MEMORIES, TOGETHER';
  $('#question-area').innerHTML = `<div class="quiz-result"><img src="./assets/cat.svg" alt="Our two cats beside the quiz results"><h3>A little more of our story.</h3><p><strong>${score} out of ${content.questions.length} correct.</strong><br>Here’s to making more memories together.</p><button class="button primary" id="restart-quiz">Play again ↻</button></div>`;
  $('#quiz-feedback').innerHTML = '';
  $('.quiz-bottom').hidden = true;
  celebrate();
}

function renderGallery() {
  $('[data-filter="all"] span').textContent = content.photos.length;
  const years = [...new Set(content.photos.map(p => p.year).filter(Number.isInteger))].sort((a, b) => b - a);
  if (filterYear !== 'all' && !years.includes(Number(filterYear))) filterYear = 'all';
  $('#year-filter').innerHTML = '<option value="all">All years</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  $('#year-filter').value = filterYear;
  activePhotos = content.photos.map((p,i) => ({...p, originalIndex:i})).filter(p => (filter === 'all' || p.category === filter) && (filterYear === 'all' || p.year === Number(filterYear)));
  const visiblePhotos = expanded ? activePhotos : activePhotos.slice(0,8);
  $('#photo-grid').innerHTML = visiblePhotos.map((p,i) => `<button class="memory" data-photo="${i}" style="--tilt:${[-2,1.5,-1,2][i%4]}deg" aria-label="Open photo ${p.originalIndex+1}: ${esc(p.caption)}"><div class="memory-image"><span class="memory-number">${pad(p.originalIndex+1)}</span><img src="${esc(safeImageSource(p.src))}" alt="${esc(p.caption)}" loading="lazy" decoding="async" width="260" height="300"></div><span class="memory-caption">${esc(p.caption)}</span><span class="memory-heart" aria-hidden="true">♡</span></button>`).join('');
  $$('#photo-grid img').forEach(imageFallback);
  $$('#photo-grid .memory-image').forEach((el, i) => { if (visiblePhotos[i].year) { const badge = document.createElement('span'); badge.className = 'memory-year'; badge.textContent = visiblePhotos[i].year; el.append(badge); } });
  if (!activePhotos.length) $('#photo-grid').innerHTML = '<p class="empty-queue">No photos for this year and category yet. Try another filter.</p>';
  $('#gallery-count').textContent = `${activePhotos.length} moments & counting`;
  $('#gallery-more').hidden = activePhotos.length <= 8;
  $('#gallery-more').innerHTML = expanded ? 'Fold the scrapbook back up <span aria-hidden="true">↑</span>' : `Unfold the rest of our scrapbook <span aria-hidden="true">↓</span>`;
  $$('.filter').forEach(button => { const selected = button.dataset.filter === filter; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected); });
}

function renderLightbox() {
  const photo = activePhotos[lightboxIndex];
  $('#lightbox-image').src = safeImageSource(photo.src);
  $('#lightbox-image').alt = photo.caption;
  $('#lightbox-caption').textContent = photo.caption;
  $('#lightbox-number').textContent = `${pad(photo.originalIndex+1)} / ${content.photos.length}${photo.year ? ' · ' + photo.year : ''} · ${photo.placeholder ? 'A temporary internet photo' : 'A little moment to keep'}`;
}
function movePhoto(direction) { lightboxIndex = (lightboxIndex + direction + activePhotos.length) % activePhotos.length; renderLightbox(); }

function renderReason() {
  $('#reason-number').textContent = `LOVE NOTE NO. ${String(currentReason+1).padStart(3,'0')} / 200`;
  $('#reason-text').textContent = reasons[currentReason];
  const isSaved = saved.has(reasons[currentReason]);
  $('#save-reason').textContent = isSaved ? '♥' : '♡';
  $('#save-reason').setAttribute('aria-pressed', isSaved);
  $('#save-reason').setAttribute('aria-label', isSaved ? 'Unsave this reason' : 'Save this reason');
  $('#saved-count').textContent = `(${saved.size})`;
  renderSavedReasons();
}
function renderSavedReasons() {
  const list = [...saved];
  $('#saved-reasons').innerHTML = list.length ? `<ul>${list.map((r,i) => `<li><span>${esc(r)}</span><button class="text-button" data-remove-note="${i}" aria-label="Remove saved love note ${i+1}">Remove</button></li>`).join('')}</ul>` : '<p class="tiny-note">Tap the heart on a reason to keep it here.</p>';
}
function persistNotes() {
  try { localStorage.setItem(storageKey + ':notes', JSON.stringify([...saved])); }
  catch { toast('Kept for this visit. Browser storage is unavailable.'); }
  renderReason();
}

function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast('Happy birthday! Sending you all the birthday love. ♡'); return; }
  $('#confetti').replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let i=0;i<75;i++) {
    const piece = document.createElement('i'); piece.className = 'confetti-piece';
    piece.style.cssText = `--x:${Math.random()*100}%;--duration:${2.5+Math.random()*2}s;--delay:${Math.random()*.6}s;--drift:${Math.random()*240-120}px;--color:${['#b6493d','#c99467','#91a17b','#ead5ad','#dc8c76'][i%5]}`;
    fragment.append(piece);
  }
  $('#confetti').append(fragment);
  setTimeout(() => $('#confetti').replaceChildren(), 5300);
}

function photoEditor() {
  $('#photo-editor-list').innerHTML = draft.photos.map((p,i) => `<div class="photo-edit-row"><img src="${esc(safeImageSource(p.src))}" alt="Photo ${i+1} preview" loading="lazy"><div class="photo-edit-fields"><label>${pad(i+1)} · Caption<input data-caption="${i}" value="${esc(p.caption)}" maxlength="120"></label><label>Image URL<input data-image-url="${i}" value="${p.src.startsWith('data:') ? '' : esc(p.src)}" placeholder="${p.src.startsWith('data:') ? 'Uploaded photo included' : 'https://…'}"></label><label>Category<select data-category="${i}">${CATEGORIES.map(c => `<option value="${c}" ${c===p.category?'selected':''}>${c.replace('-',' ')}</option>`).join('')}</select></label><label>Replace this photo<input type="file" data-upload="${i}" accept="image/jpeg,image/png,image/webp"></label></div></div>`).join('');
  $$('#photo-editor-list img').forEach(imageFallback);
  $$('#photo-editor-list .photo-edit-fields').forEach((el, i) => { const label = document.createElement('label'); label.textContent = 'Year (optional)'; const input = document.createElement('input'); input.type = 'number'; input.min = '1900'; input.max = String(new Date().getFullYear()); input.step = '1'; input.dataset.photoYear = i; input.value = draft.photos[i].year || ''; label.append(input); el.append(label); });
}
function questionEditor() {
  $('#question-editor-list').innerHTML = '<p>Write and publish your personal questions on the scrapbook editor.</p><a class="button secondary" href="./upload.html#questions">Edit questions &amp; answers ↗</a>';
}
function fillEditor() { $('#edit-wife').value = draft.wife; $('#edit-husband').value = draft.husband; $('#edit-letter').value = draft.letter; photoEditor(); questionEditor(); }
function captureDraft() {
  draft.wife = $('#edit-wife').value.trim(); draft.husband = $('#edit-husband').value.trim(); draft.letter = $('#edit-letter').value.trim();
  $$('[data-caption]').forEach(el => draft.photos[+el.dataset.caption].caption = el.value.trim());
  $$('[data-image-url]').forEach(el => { const p = draft.photos[+el.dataset.imageUrl], src = el.value.trim(); if (src && p.src !== src) { p.src = src; p.placeholder = false; delete p.sourceUrl; } else if (!src && !p.src.startsWith('data:')) p.src = ''; });
  $$('[data-category]').forEach(el => draft.photos[+el.dataset.category].category = el.value);
  $$('[data-photo-year]').forEach(el => { const p = draft.photos[+el.dataset.photoYear]; if (el.value) p.year = Number(el.value); else delete p.year; });
  return draft;
}
function selectTab(name, focus = false) {
  $$('.editor-tabs button').forEach(button => { const active = button.dataset.tab === name; button.setAttribute('aria-selected',active); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
  $$('.editor-panel').forEach(panel => panel.hidden = panel.id !== `panel-${name}`);
}
function editorError(error) { $('#editor-status').textContent = error.message || 'Something went wrong. Please try again.'; }

function setPhotoBusy(busy) { photoBusy = busy; $$('.editor-actions button, #bulk-photos, [data-upload], #import-content').forEach(el => el.disabled = busy); }
async function uploadPhotos(files, startIndex = 0) {
  if (!files.length || photoBusy) return;
  if (files.length > MAX_UPLOAD_BATCH) return editorError(new Error(`Choose up to ${MAX_UPLOAD_BATCH} photos at a time.`));
  if (files.length > draft.photos.length - startIndex) return editorError(new Error(`Only ${draft.photos.length - startIndex} gallery positions remain from this photo.`));
  captureDraft(); setPhotoBusy(true);
  try {
    const updated = [];
    for (let i=0;i<files.length;i++) { $('#editor-status').textContent = `Preparing photo ${i+1} of ${files.length}…`; updated.push(await resizePhoto(files[i])); }
    updated.forEach((src,i) => { draft.photos[startIndex+i].src = src; draft.photos[startIndex+i].placeholder = false; delete draft.photos[startIndex+i].sourceUrl; });
    photoEditor(); $('#editor-status').textContent = `${updated.length} photo${updated.length===1?'':'s'} ready. Save your preview or export to keep them.`;
  } catch (error) { editorError(error); }
  finally { setPhotoBusy(false); $('#bulk-photos').value = ''; }
}

function attachEvents() {
  $('#question-area').addEventListener('submit', event => { if (event.target.id !== 'text-answer-form') return; event.preventDefault(); const value = $('#text-answer').value.trim(); if (value) answerQuestion(value); });
  $('#question-area').addEventListener('click', event => { const button = event.target.closest('[data-answer]'); if (button) answerQuestion(+button.dataset.answer); if (event.target.closest('#restart-quiz')) { answers=[]; questionIndex=0; renderQuestion(); $('#current-question').focus({preventScroll:true}); } });
  $('#quiz-feedback').addEventListener('click', event => { if (event.target.closest('#challenge-done, #challenge-skip')) { challengeResolved=true; $('#next-question').disabled=false; $('#quiz-feedback').innerHTML='<div class="feedback">Ready for the next memory.</div>'; $('#quiz-hint').textContent='Continue when you’re ready.'; $('#next-question').focus({preventScroll:true}); } });
  $('#next-question').addEventListener('click', () => { if (!challengeResolved || answers[questionIndex]===undefined) return; if (questionIndex===content.questions.length - 1) finishQuiz(); else { questionIndex++; renderQuestion(); $('#current-question').focus({preventScroll:true}); } });
  $('.filter-group').addEventListener('click', event => { const button=event.target.closest('[data-filter]'); if (!button) return; filter=button.dataset.filter; expanded=false; renderGallery(); });
  $('#year-filter').addEventListener('change', event => { filterYear = event.target.value; expanded = false; renderGallery(); });
  $('#gallery-more').addEventListener('click', () => { const wasExpanded=expanded; expanded=!expanded; renderGallery(); if (wasExpanded) $('#memories').scrollIntoView({block:'start'}); });
  $('#photo-grid').addEventListener('click', event => { const button=event.target.closest('[data-photo]'); if (!button) return; lightboxIndex=+button.dataset.photo; renderLightbox(); $('#lightbox').showModal(); });
  $('#photo-prev').addEventListener('click', () => movePhoto(-1)); $('#photo-next').addEventListener('click', () => movePhoto(1));
  $('#lightbox').addEventListener('keydown', event => { if (event.key==='ArrowLeft') { event.preventDefault(); movePhoto(-1); } if (event.key==='ArrowRight') { event.preventDefault(); movePhoto(1); } });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => $('#'+button.dataset.close).close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r=dialog.getBoundingClientRect(); if (event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close(); }));
  $('#another-reason').addEventListener('click', () => { currentReason=bag.next(); renderReason(); });
  $('#save-reason').addEventListener('click', () => { const reason=reasons[currentReason]; if (saved.has(reason)) saved.delete(reason); else saved.add(reason); persistNotes(); });
  $('#copy-reason').addEventListener('click', async () => { try { await navigator.clipboard.writeText(reasons[currentReason]); toast('A little love, copied. ♡'); } catch { toast('Copy isn’t available here. You can select and copy the love note.'); } });
  $('#show-saved').addEventListener('click', () => { $('#saved-reasons').hidden=!$('#saved-reasons').hidden; $('#show-saved').setAttribute('aria-expanded',!$('#saved-reasons').hidden); });
  $('#saved-reasons').addEventListener('click', event => { const button=event.target.closest('[data-remove-note]'); if (button) { saved.delete([...saved][+button.dataset.removeNote]); persistNotes(); } });
  $('#celebrate').addEventListener('click', celebrate);
  $('#birthday-wish').addEventListener('click', () => { $('#wish-message').textContent='Close your eyes. Make a wish. Here’s to every wonderful thing ahead. ♡'; celebrate(); });
  $('#open-editor').addEventListener('click', () => { if (!photoBusy) { draft=structuredClone(content); fillEditor(); $('#editor-status').textContent=''; } selectTab('details'); $('#editor').showModal(); });
  $('.editor-tabs').addEventListener('click', event => { const button=event.target.closest('[data-tab]'); if (button) selectTab(button.dataset.tab); });
  $('.editor-tabs').addEventListener('keydown', event => { const tabs=$$('.editor-tabs button'), i=tabs.indexOf(document.activeElement); if (i<0) return; let next; if (event.key==='ArrowRight') next=(i+1)%3; else if (event.key==='ArrowLeft') next=(i+2)%3; else if (event.key==='Home') next=0; else if (event.key==='End') next=2; else return; event.preventDefault(); selectTab(tabs[next].dataset.tab,true); });
  $('#editor-form').noValidate=true;
  $('#editor-form').addEventListener('submit', async event => {
    event.preventDefault(); if (photoBusy) return;
    try { const updated=structuredClone(validateContent(captureDraft())); await previewStorage(updated); content=updated; renderDetails(); renderGallery(); answers=[]; questionIndex=0; renderQuestion(); $('#editor').close(); toast('Saved on this browser. Export to update the live gift.'); }
    catch (error) { editorError(error); }
  });
  $('#export-content').addEventListener('click', () => {
    if (photoBusy) return;
    try { const updated=validateContent(captureDraft()), blob=new Blob([JSON.stringify(updated,null,2)+'\n'],{type:'application/json'}), url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download='content.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); $('#editor-status').textContent='Exported. Replace content.json in your GitHub repository to publish these changes.'; }
    catch (error) { editorError(error); }
  });
  $('#bulk-photos').addEventListener('change', event => uploadPhotos([...event.target.files]));
  $('#photo-editor-list').addEventListener('change', event => { if (event.target.matches('[data-upload]')) uploadPhotos([...event.target.files],+event.target.dataset.upload); });
  $('#import-content').addEventListener('change', async event => { const file=event.target.files[0]; if (!file || photoBusy) return; try { if (file.size>50*1024*1024) throw new Error('Please import a content file smaller than 50 MB.'); const imported=validateContent(upgradeContent(JSON.parse(await file.text()))); draft=structuredClone(imported); fillEditor(); $('#editor-status').textContent='Imported into the editor. Save your preview or export when ready.'; } catch(error) { editorError(error); } finally { event.target.value=''; } });
}

async function init() {
  try {
    const responses=await Promise.all([fetch('./content.json', { cache: 'no-store' }),fetch('./reasons.json')]);
    if (responses.some(response=>!response.ok)) throw new Error('Your birthday content could not load. Please refresh to try again.');
    const [data,notes]=await Promise.all(responses.map(response=>response.json()));
    content=validateContent(upgradeContent(data));
    if (!Array.isArray(notes)||notes.length!==200||notes.some(n=>typeof n!=='string'||!n.trim())||new Set(notes).size!==200) throw new Error('The love notes need a little attention. Please check reasons.json.');
    reasons=notes;
    try { const preview=await previewStorage(); if(previewIsCurrent(content, preview)) content=validateContent(upgradeContent(preview)); } catch { /* A blocked or obsolete local preview does not prevent the published site loading. */ }
    saved=new Set([...saved].filter(reason=>reasons.includes(reason)));
    bag=createReasonBag(reasons.length); currentReason=bag.next();
    renderDetails(); renderQuestion(); renderGallery(); renderReason(); attachEvents();
    [$('#hero-photo-one'),$('#hero-photo-two'),$('#lightbox-image')].forEach(imageFallback);
  } catch(error) {
    const message=document.createElement('p'); message.className='load-error'; message.setAttribute('role','alert'); message.textContent=error.message; $('#question-area').replaceChildren(message); $('#photo-grid').textContent='Please refresh to open the birthday scrapbook.';
  }
}
init();
async function refreshPreview() {
  if (!content || $('#editor').open || $('#lightbox').open) return;
  try {
    const preview = await previewStorage();
    if (!previewIsCurrent(content, preview)) return;
    const updated = validateContent(upgradeContent(preview));
    const questionsChanged = JSON.stringify(content.questions) !== JSON.stringify(updated.questions);
    content = updated; renderDetails(); renderGallery();
    if (questionsChanged) { answers = []; questionIndex = 0; renderQuestion(); }
  } catch { /* Keep the current scrapbook if storage is unavailable. */ }
}
window.addEventListener('focus', refreshPreview);
window.addEventListener('pageshow', event => { if (event.persisted) refreshPreview(); });

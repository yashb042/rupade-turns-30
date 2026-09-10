import { CATEGORIES, safeImageSource, validateContent, createReasonBag, quizScore } from './logic.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const storageKey = 'rupade-30:' + location.pathname.replace(/index\.html$/, '');
let content, reasons, draft, bag, currentReason = 0, questionIndex = 0, answers = [], challengeResolved = false;
let filter = 'all', expanded = false, activePhotos = [], lightboxIndex = 0, toastTimer, photoBusy = false;
let saved = new Set();
try { const value = JSON.parse(localStorage.getItem(storageKey + ':notes') || '[]'); if (Array.isArray(value)) saved = new Set(value.filter(x => typeof x === 'string')); } catch { /* Storage can be unavailable in private browsing. */ }

function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageKey, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('gift');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function previewStorage(value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('gift', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('gift');
      const req = value === undefined ? store.get('content') : store.put(value, 'content');
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Your browser could not save this preview.'));
    });
  } finally { db.close(); }
}

function imageFallback(img) {
  img.addEventListener('error', () => { img.src = './assets/cat.svg'; img.alt = 'A little cat is keeping this photo’s place warm.'; }, { once: true });
}

function renderDetails() {
  $$('[data-wife]').forEach(el => el.textContent = content.wife);
  $$('[data-husband]').forEach(el => el.textContent = content.husband);
  document.title = `${content.wife}, you’re my favorite. ♡ Happy 30th`;
  $('#birthday-letter').textContent = content.letter;
  $('#hero-photo-one').src = safeImageSource(content.photos[0].src);
  $('#hero-photo-one').alt = content.photos[0].caption;
  $('#hero-photo-two').src = safeImageSource(content.photos[1].src);
  $('#hero-photo-two').alt = content.photos[1].caption;
  $('.placeholder-note').hidden = !content.photos.some(p => p.placeholder);
}

function renderQuestion() {
  const q = content.questions[questionIndex];
  challengeResolved = false;
  $('#question-count').textContent = `QUESTION ${pad(questionIndex + 1)} OF 10`;
  $('#quiz-score').textContent = `${quizScore(content.questions, answers)} hearts collected ♡`;
  $('#progress-fill').style.width = `${questionIndex * 10}%`;
  $('#quiz-progress').setAttribute('aria-valuenow', questionIndex);
  $('#question-area').innerHTML = `<h3 class="question-title" id="current-question" tabindex="-1">${esc(q.question)}</h3><div class="answers" role="group" aria-labelledby="current-question">${q.options.map((option,i) => `<button class="answer" data-answer="${i}"><span class="answer-letter" aria-hidden="true">${'ABCD'[i]}</span><span>${esc(option)}</span></button>`).join('')}</div>`;
  $('#quiz-feedback').innerHTML = '';
  $('#next-question').disabled = true;
  $('#next-question').innerHTML = questionIndex === 9 ? 'See my results <span aria-hidden="true">→</span>' : 'Next question <span aria-hidden="true">→</span>';
  $('#quiz-hint').textContent = 'Go with your heart. Or your best guess.';
  $('.quiz-bottom').hidden = false;
}

function answerQuestion(choice) {
  if (answers[questionIndex] !== undefined) return;
  answers[questionIndex] = choice;
  const q = content.questions[questionIndex], correct = choice === q.answer;
  $$('.answer').forEach((button,i) => { button.disabled = true; if (i === q.answer) button.classList.add('correct'); if (i === choice && !correct) button.classList.add('wrong'); });
  $('#quiz-score').textContent = `${quizScore(content.questions, answers)} hearts collected ♡`;
  $('#progress-fill').style.width = `${(questionIndex + 1) * 10}%`;
  $('#quiz-progress').setAttribute('aria-valuenow', questionIndex + 1);
  if (correct) {
    challengeResolved = true;
    $('#quiz-feedback').innerHTML = '<div class="feedback"><strong>That’s our kind of love. ♡</strong>One more heart collected. The cat is impressed.</div>';
    $('#next-question').disabled = false;
  } else {
    $('#quiz-feedback').innerHTML = `<div class="feedback"><strong>Oops. The cat has a challenge for you!</strong><p>${esc(q.challenge)}</p><div class="challenge-actions"><button class="button primary" id="challenge-done">Challenge completed ✓</button><button class="text-button" id="challenge-skip">I’ll take a rain check</button></div></div>`;
    $('#quiz-hint').textContent = 'Finish the challenge, or take a rain check.';
  }
}

function finishQuiz() {
  const score = quizScore(content.questions, answers);
  $('#question-count').textContent = 'TEN QUESTIONS. ALL THE LOVE.';
  $('#question-area').innerHTML = `<div class="quiz-result"><img src="./assets/cat.svg" alt="Your proud cat judge"><h3>${score === 10 ? 'Purr-fectly in love.' : score >= 6 ? 'You know a little thing about love.' : 'More mischief. Just as much love.'}</h3><p>You collected <strong>${score} out of 10 hearts</strong>.<br>The official verdict: you’re loved beyond any score.</p><button class="button primary" id="restart-quiz">Let’s play again ↻</button></div>`;
  $('#quiz-feedback').innerHTML = '';
  $('.quiz-bottom').hidden = true;
  celebrate();
}

function renderGallery() {
  activePhotos = content.photos.map((p,i) => ({...p, originalIndex:i})).filter(p => filter === 'all' || p.category === filter);
  const visiblePhotos = expanded ? activePhotos : activePhotos.slice(0,8);
  $('#photo-grid').innerHTML = visiblePhotos.map((p,i) => `<button class="memory" data-photo="${i}" style="--tilt:${[-2,1.5,-1,2][i%4]}deg" aria-label="Open photo ${p.originalIndex+1}: ${esc(p.caption)}"><div class="memory-image"><span class="memory-number">${pad(p.originalIndex+1)}</span><img src="${esc(safeImageSource(p.src))}" alt="${esc(p.caption)}" loading="lazy" decoding="async" width="260" height="300"></div><span class="memory-caption">${esc(p.caption)}</span><span class="memory-heart" aria-hidden="true">♡</span></button>`).join('');
  $$('#photo-grid img').forEach(imageFallback);
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
  $('#lightbox-number').textContent = `${pad(photo.originalIndex+1)} / 30 · ${photo.placeholder ? 'A temporary internet photo' : 'A little moment to keep'}`;
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast('Happy 30th! Sending you all the birthday love. ♡'); return; }
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
}
function questionEditor() {
  $('#question-editor-list').innerHTML = draft.questions.map((q,i) => `<fieldset class="question-edit"><legend>Question ${i+1}</legend><label>Question<input data-question="${i}" value="${esc(q.question)}" maxlength="300"></label><div class="option-edit-grid">${q.options.map((option,j) => `<label>Choice ${'ABCD'[j]}<input data-option="${i}:${j}" value="${esc(option)}" maxlength="200"></label>`).join('')}</div><label>Correct answer<select data-correct="${i}">${q.options.map((_,j) => `<option value="${j}" ${q.answer===j?'selected':''}>Choice ${'ABCD'[j]}</option>`).join('')}</select></label><label>Funny challenge<textarea data-challenge="${i}" rows="2" maxlength="500">${esc(q.challenge)}</textarea></label></fieldset>`).join('');
}
function fillEditor() { $('#edit-wife').value = draft.wife; $('#edit-husband').value = draft.husband; $('#edit-letter').value = draft.letter; photoEditor(); questionEditor(); }
function captureDraft() {
  draft.wife = $('#edit-wife').value.trim(); draft.husband = $('#edit-husband').value.trim(); draft.letter = $('#edit-letter').value.trim();
  $$('[data-caption]').forEach(el => draft.photos[+el.dataset.caption].caption = el.value.trim());
  $$('[data-image-url]').forEach(el => { const p = draft.photos[+el.dataset.imageUrl], src = el.value.trim(); if (src && p.src !== src) { p.src = src; p.placeholder = false; delete p.sourceUrl; } else if (!src && !p.src.startsWith('data:')) p.src = ''; });
  $$('[data-category]').forEach(el => draft.photos[+el.dataset.category].category = el.value);
  $$('[data-question]').forEach(el => draft.questions[+el.dataset.question].question = el.value.trim());
  $$('[data-option]').forEach(el => { const [i,j] = el.dataset.option.split(':').map(Number); draft.questions[i].options[j] = el.value.trim(); });
  $$('[data-correct]').forEach(el => draft.questions[+el.dataset.correct].answer = +el.value);
  $$('[data-challenge]').forEach(el => draft.questions[+el.dataset.challenge].challenge = el.value.trim());
  return draft;
}
function selectTab(name, focus = false) {
  $$('.editor-tabs button').forEach(button => { const active = button.dataset.tab === name; button.setAttribute('aria-selected',active); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
  $$('.editor-panel').forEach(panel => panel.hidden = panel.id !== `panel-${name}`);
}
function editorError(error) { $('#editor-status').textContent = error.message || 'Something went wrong. Please try again.'; }

async function resizePhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Please choose JPG, PNG, or WebP images.');
  if (file.size > 25*1024*1024) throw new Error('Please choose photos smaller than 25 MB each.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#fcf6ed'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  } finally { bitmap.close(); }
}
function setPhotoBusy(busy) { photoBusy = busy; $$('.editor-actions button, #bulk-photos, [data-upload], #import-content').forEach(el => el.disabled = busy); }
async function uploadPhotos(files, startIndex = 0) {
  if (!files.length || photoBusy) return;
  if (files.length > 30) return editorError(new Error('Choose up to 30 photos at a time.'));
  captureDraft(); setPhotoBusy(true);
  try {
    const updated = [];
    for (let i=0;i<files.length && startIndex+i<30;i++) { $('#editor-status').textContent = `Preparing photo ${i+1} of ${files.length}…`; updated.push(await resizePhoto(files[i])); }
    updated.forEach((src,i) => { draft.photos[startIndex+i].src = src; draft.photos[startIndex+i].placeholder = false; delete draft.photos[startIndex+i].sourceUrl; });
    photoEditor(); $('#editor-status').textContent = `${updated.length} photo${updated.length===1?'':'s'} ready. Save your preview or export to keep them.`;
  } catch (error) { editorError(error); }
  finally { setPhotoBusy(false); $('#bulk-photos').value = ''; }
}

function attachEvents() {
  $('#question-area').addEventListener('click', event => { const button = event.target.closest('[data-answer]'); if (button) answerQuestion(+button.dataset.answer); if (event.target.closest('#restart-quiz')) { answers=[]; questionIndex=0; renderQuestion(); $('#current-question').focus({preventScroll:true}); } });
  $('#quiz-feedback').addEventListener('click', event => { if (event.target.closest('#challenge-done, #challenge-skip')) { challengeResolved=true; $('#next-question').disabled=false; $('#quiz-feedback').innerHTML='<div class="feedback"><strong>Love the spirit. On we go! ♡</strong>The cat has recorded your very official effort.</div>'; $('#quiz-hint').textContent='Ready for another little question?'; $('#next-question').focus({preventScroll:true}); } });
  $('#next-question').addEventListener('click', () => { if (!challengeResolved || answers[questionIndex]===undefined) return; if (questionIndex===9) finishQuiz(); else { questionIndex++; renderQuestion(); $('#current-question').focus({preventScroll:true}); } });
  $('.filter-group').addEventListener('click', event => { const button=event.target.closest('[data-filter]'); if (!button) return; filter=button.dataset.filter; expanded=false; renderGallery(); });
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
  $('#import-content').addEventListener('change', async event => { const file=event.target.files[0]; if (!file || photoBusy) return; try { if (file.size>50*1024*1024) throw new Error('Please import a content file smaller than 50 MB.'); const imported=validateContent(JSON.parse(await file.text())); draft=structuredClone(imported); fillEditor(); $('#editor-status').textContent='Imported into the editor. Save your preview or export when ready.'; } catch(error) { editorError(error); } finally { event.target.value=''; } });
}

async function init() {
  try {
    const responses=await Promise.all([fetch('./content.json'),fetch('./reasons.json')]);
    if (responses.some(response=>!response.ok)) throw new Error('Your birthday content could not load. Please refresh to try again.');
    const [data,notes]=await Promise.all(responses.map(response=>response.json()));
    content=validateContent(data);
    if (!Array.isArray(notes)||notes.length!==200||notes.some(n=>typeof n!=='string'||!n.trim())||new Set(notes).size!==200) throw new Error('The love notes need a little attention. Please check reasons.json.');
    reasons=notes;
    try { const preview=await previewStorage(); if(preview) content=validateContent(preview); } catch { /* A blocked or obsolete local preview does not prevent the published site loading. */ }
    saved=new Set([...saved].filter(reason=>reasons.includes(reason)));
    bag=createReasonBag(reasons.length); currentReason=bag.next();
    renderDetails(); renderQuestion(); renderGallery(); renderReason(); attachEvents();
    [$('#hero-photo-one'),$('#hero-photo-two'),$('#lightbox-image')].forEach(imageFallback);
  } catch(error) {
    const message=document.createElement('p'); message.className='load-error'; message.setAttribute('role','alert'); message.textContent=error.message; $('#question-area').replaceChildren(message); $('#photo-grid').textContent='Please refresh to open the birthday scrapbook.';
  }
}
init();

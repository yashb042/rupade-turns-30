import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createUploadAPI, createGitPublisher } from '../upload-server.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const base = JSON.parse(await readFile(new URL('../content.json', import.meta.url)));
const photo = await readFile(new URL('../' + base.photos[0].src, import.meta.url));
const src = 'data:image/jpeg;base64,' + photo.toString('base64');
const entry = { slot: 0, src, year: 2020, caption: 'A test memory' };
const id = n => `test-request-0000-${n}`;
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'birthday-api-test-'));
  await writeFile(path.join(root, 'content.json'), JSON.stringify(base));
  const calls = { preflight: 0, commit: 0, push: 0 };
  const publisher = {
    async preflight() { calls.preflight++; if (options.preflightFail) throw Object.assign(new Error('Uncommitted edits'), { status: 409 }); },
    async commit(paths, kind) { calls.commit++; calls.paths = paths; calls.kind = kind; return 'test-commit'; },
    async push() { calls.push++; if (options.pushFail) { options.pushFail = false; throw new Error('Offline'); } },
  };
  const api = createUploadAPI({ root, publisher });
  const server = http.createServer(async (req, res) => { if (!await api(req, res, new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const session = () => fetch(url + '/api/session').then(r => r.json());
  const initial = await session();
  const post = async (endpoint, payload, headers = {}) => {
    const r = await fetch(url + endpoint, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', 'X-Gift-Token': initial.token, ...headers }, body: JSON.stringify(payload) });
    return { status: r.status, body: await r.json() };
  };
  const current = () => readFile(path.join(root, 'content.json'), 'utf8').then(JSON.parse);
  return { root, url, initial, post, session, current, calls };
}
test('Photo upload saves a real image and its year, publishes once, and accepts a safe retry', async t => {
  const f = await fixture(t);
  const payload = { id: id(1), revision: f.initial.revision, entries: [entry] };
  const result = await f.post('/api/photos', payload);
  assert.equal(result.status, 200); assert.equal(result.body.published, true);
  const updated = await f.current();
  assert.equal(updated.photos[0].year, 2020); assert.equal(updated.photos[0].placeholder, false);
  assert.match(updated.photos[0].src, /^\.\/assets\/memory-[a-f0-9]{24}\.jpg$/);
  assert.deepEqual(await readFile(path.join(f.root, updated.photos[0].src)), photo);
  assert.deepEqual(updated.photos.slice(1), base.photos.slice(1));
  assert.deepEqual(updated.questions, base.questions);
  assert.equal((await f.post('/api/photos', payload)).status, 200);
  assert.equal(f.calls.commit, 1); assert.equal(f.calls.push, 1);
  assert.equal((await readdir(path.join(f.root, 'assets'))).length, 1);
});
test('Questions replace the list, preserve the gallery, and can be cleared', async t => {
  const f = await fixture(t);
  const questions = [{ question: 'A shared memory?', options: ['A trip', 'A dinner', 'A walk', 'A concert'], answer: 2, challenge: '' }];
  let r = await f.post('/api/questions', { id: id(2), revision: f.initial.revision, questions });
  assert.equal(r.status, 200); assert.equal(f.calls.kind, 'questions');
  assert.deepEqual(r.body.content.questions, questions); assert.deepEqual(r.body.content.photos, base.photos);
  r = await f.post('/api/questions', { id: id(3), revision: r.body.revision, questions: [] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.content.questions, []);
});
test('A failed push retains saved changes and retries publishing without creating another commit', async t => {
  const f = await fixture(t, { pushFail: true });
  const r = await f.post('/api/photos', { id: id(4), revision: f.initial.revision, entries: [entry] });
  assert.equal(r.status, 502); assert.equal(r.body.saved, true); assert.equal(r.body.pending.status, 'committed');
  assert.equal((await f.session()).pending.id, id(4));
  const conflict = await f.post('/api/questions', { id: id(5), revision: r.body.revision, questions: [] });
  assert.equal(conflict.status, 409);
  const retried = await f.post('/api/publish', { id: id(4) });
  assert.equal(retried.status, 200); assert.equal(retried.body.published, true);
  assert.equal(f.calls.commit, 1); assert.equal(f.calls.push, 2); assert.equal((await f.session()).pending, null);
});
test('Invalid batches, malformed images and stale revisions leave the manifest unchanged', async t => {
  const f = await fixture(t);
  const cases = [
    { entries: [{ ...entry, year: 0 }] },
    { entries: [entry, entry] },
    { entries: [entry, { ...entry, slot: 1, src: 'data:image/jpeg;base64,YWJj' }] },
    { entries: [{ ...entry, src: 'https://example.com/photo.jpg' }] },
    { entries: [entry], revision: 'outdated' },
  ];
  for (const [i, changes] of cases.entries()) {
    const r = await f.post('/api/photos', { id: id(10+i), revision: f.initial.revision, ...changes });
    assert.equal(r.status, i === 4 ? 409 : 400);
    assert.deepEqual(await f.current(), base);
  }
  const invalidQuizzes = [
    [{ question: 'Missing answer' }],
    [{ question: 'Typed answer', answers: ['A walk'] }],
    [{ question: 'No selection', options: ['A', 'B', 'C', 'D'], answer: null }],
    [{ question: 'Repeated choice', options: ['A', 'B', 'A', 'D'], answer: 0 }],
  ];
  for (const [i, questions] of invalidQuizzes.entries()) {
    const badQuestions = await f.post('/api/questions', { id: id(20 + i), revision: f.initial.revision, questions });
    assert.equal(badQuestions.status, 400); assert.deepEqual(await f.current(), base);
  }
  assert.equal(f.calls.commit, 0);
  assert.deepEqual(await readdir(f.root), ['content.json']);
});
test('Foreign origins, wrong tokens and rebinding hosts cannot modify content', async t => {
  const f = await fixture(t);
  const payload = { id: id(30), revision: f.initial.revision, entries: [entry] };
  for (const headers of [{ Origin: 'https://untrusted.example' }, { 'X-Gift-Token': 'invalid' }]) {
    assert.equal((await f.post('/api/photos', payload, headers)).status, 403);
  }
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = http.get(f.url + '/api/session', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await fetch(f.url + '/api/session', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const cors = await fetch(f.url + '/api/photos', { method: 'OPTIONS', headers: { Origin: 'https://yashb042.github.io', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), 'https://yashb042.github.io');
  assert.equal(cors.headers.get('access-control-allow-private-network'), 'true');
  assert.deepEqual(await f.current(), base); assert.equal(f.calls.preflight, 0);
});
test('Preflight protects existing local edits before writing photos', async t => {
  const f = await fixture(t, { preflightFail: true });
  const r = await f.post('/api/photos', { id: id(40), revision: f.initial.revision, entries: [entry] });
  assert.equal(r.status, 409); assert.deepEqual(await f.current(), base);
  assert.deepEqual(await readdir(f.root), ['content.json']);
});

test('Git publisher commits new photos and the manifest without including unrelated staged edits', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'birthday-git-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = promisify(execFile);
  const git = (...args) => run('git', args, { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_EMAIL: 'test@example.com' } });
  await git('init', '-b', 'main');
  await writeFile(path.join(root, 'content.json'), '{}');
  await writeFile(path.join(root, 'other.txt'), 'Original');
  await git('add', '.'); await git('commit', '-m', 'test: seed temporary repository');
  await writeFile(path.join(root, 'content.json'), '{"photos":[]}');
  await writeFile(path.join(root, 'photo.jpg'), photo);
  await writeFile(path.join(root, 'other.txt'), 'Unrelated edit');
  await git('add', 'other.txt');
  const commit = await createGitPublisher(root).commit(['content.json', 'photo.jpg'], 'photos');
  assert.equal(commit, (await git('rev-parse', 'HEAD')).stdout.trim());
  assert.equal((await git('show', 'HEAD:other.txt')).stdout, 'Original');
  assert.equal((await git('diff', '--cached', '--name-only')).stdout.trim(), 'other.txt');
  assert.match((await git('show', '--pretty=', '--name-only', 'HEAD')).stdout, /photo.jpg/);
});

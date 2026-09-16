import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { applyPhotoEntries, validateContent, validateMultipleChoiceQuestions } from './logic.js';

const run = promisify(execFile);
const remote = 'https://github.com/yashb042/rupade-turns-30.git';
const liveURL = 'https://yashb042.github.io/rupade-turns-30/';
const publicOrigin = new URL(liveURL).origin;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function atomicWrite(filename, data) {
  const temporary = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
  await writeFile(temporary, data);
  await rename(temporary, filename);
}

export function createGitPublisher(root) {
  const git = (...args) => run('git', args, { cwd: root, timeout: 90000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Yash', GIT_COMMITTER_NAME: 'Yash', GIT_AUTHOR_EMAIL: 'yashb042@users.noreply.github.com', GIT_COMMITTER_EMAIL: 'yashb042@users.noreply.github.com' } });
  return {
    async preflight() {
      const origin = (await git('remote', 'get-url', 'origin')).stdout.trim();
      if (origin !== remote && origin !== 'git@github.com:yashb042/rupade-turns-30.git') throw fail('The upload server must run inside the birthday repository.', 409);
      if ((await git('branch', '--show-current')).stdout.trim() !== 'main') throw fail('Switch the birthday repository to main before uploading.', 409);
      try { await git('diff', '--quiet', 'HEAD', '--', 'content.json'); }
      catch { throw fail('There are unsaved edits to content.json on this computer. Commit them before uploading so nothing is overwritten.', 409); }
      try { await run('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd: root, timeout: 15000 }); }
      catch { throw fail('Sign in to GitHub on this computer with gh auth login, then try Upload again.', 503); }
    },
    async commit(paths, kind = 'photos') {
      // --only commits the photo files and manifest, leaving unrelated staged edits alone.
      await git('add', '--', ...paths);
      const changed = (await git('diff', '--name-only', 'HEAD', '--', ...paths)).stdout.trim();
      if (changed) await git('commit', '--only', '-m', kind === 'questions' ? 'feat: personalize the birthday quiz' : 'feat: add birthday memories with their years', '--', ...paths);
      return (await git('rev-parse', 'HEAD')).stdout.trim();
    },
    async push(commit) {
      if ((await git('rev-parse', 'HEAD')).stdout.trim() !== commit) throw fail('The repository changed after this upload. Finish publishing this commit from Git before adding more photos.', 409);
      await git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'origin', 'HEAD:main');
    },
  };
}

export function createUploadAPI({ root, publisher = createGitPublisher(root) }) {
  const token = randomBytes(32).toString('hex');
  const manifest = path.join(root, 'content.json');
  const journal = path.join(root, '.local', 'upload-state.json');
  let busy = false;
  const snapshot = async () => { const text = await readFile(manifest, 'utf8'); return { content: JSON.parse(text), revision: hash(text) }; };
  const readState = async () => { try { return JSON.parse(await readFile(journal, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const writeState = async state => { await mkdir(path.dirname(journal), { recursive: true }); await atomicWrite(journal, JSON.stringify(state)); };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

  async function finish(state) {
    if (state.status === 'published') return state;
    if (!state.commit) {
      state.commit = await publisher.commit(state.paths, state.kind);
      state.status = 'committed';
      await writeState(state);
    }
    await publisher.push(state.commit);
    state.status = 'published';
    await writeState(state);
    return state;
  }

  return async function handleUpload(req, res, pathname) {
    if (!pathname.startsWith('/api/')) return false;
    const allowedHosts = [`localhost:${req.socket.localPort}`, `127.0.0.1:${req.socket.localPort}`];
    if (!allowedHosts.includes(req.headers.host)) { json(res, 403, { error: 'This upload server is only available on localhost.' }); return true; }
    const origin = req.headers.origin;
    const allowedOrigin = origin === publicOrigin || origin === `http://${req.headers.host}`;
    if (origin && !allowedOrigin) { json(res, 403, { error: 'This origin cannot use the birthday upload server.' }); return true; }
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Gift-Token');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    if (pathname === '/api/session' && req.method === 'GET') {
      try {
        const current = await snapshot(), state = await readState();
        json(res, 200, { ...current, token, pending: state && state.status !== 'published' ? { id: state.id, status: state.status } : null });
      } catch { json(res, 500, { error: 'Could not open the scrapbook on this computer.' }); }
      return true;
    }
    if (!['/api/photos', '/api/questions', '/api/publish'].includes(pathname) || req.method !== 'POST') { json(res, 404, { error: 'Upload action not found.' }); return true; }
    if (!allowedOrigin || req.headers['x-gift-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) { json(res, 403, { error: 'Reload the upload page to reconnect securely.' }); return true; }
    if (busy) { json(res, 409, { error: 'Another upload is being published. Please wait and try again.' }); return true; }
    busy = true;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 50 * 1024 * 1024) throw fail('Please upload a smaller batch of photos.', 413); chunks.push(chunk); }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('The upload data could not be read. Please try again.'); }
      if (typeof payload.id !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(payload.id)) throw fail('This upload needs a valid request ID. Reload and try again.');
      let state = await readState();
      if (pathname === '/api/publish') {
        if (!state || state.id !== payload.id) throw fail('There is no matching upload waiting to publish.', 409);
      } else if (state?.id !== payload.id) {
        if (state && state.status !== 'published') throw fail('Finish publishing the previous upload before adding more photos.', 409);
        const current = await snapshot();
        if (payload.revision !== current.revision) throw fail('The scrapbook changed in another window. Reload this page before uploading so the latest photos are preserved.', 409);
        const kind = pathname === '/api/questions' ? 'questions' : 'photos';
        let updated;
        try { updated = kind === 'questions' ? validateContent({ ...structuredClone(current.content), questions: validateMultipleChoiceQuestions(payload.questions), version: 3 }) : applyPhotoEntries(current.content, payload.entries); }
        catch (error) { throw fail(error.message); }
        await publisher.preflight();
        const files = [];
        for (const entry of kind === 'photos' ? payload.entries : []) {
          const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(entry.src);
          if (!match) throw fail('Please upload image files using Choose photos or Choose a folder.');
          const bytes = Buffer.from(match[2], 'base64');
          const valid = match[1] === 'jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
          if (!valid || bytes.length < 12 || bytes.length > 25 * 1024 * 1024) throw fail('One of the photos is not a valid supported image.');
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          const relative = `assets/memory-${hash(bytes).slice(0,24)}.${ext}`;
          files.push({ relative, bytes });
          updated.photos[entry.slot].src = './' + relative;
        }
        // Validate the complete batch before writing any part of the gallery.
        if ((await snapshot()).revision !== current.revision) throw fail('The scrapbook changed during the upload. Reload and try again.', 409);
        await mkdir(path.join(root, 'assets'), { recursive: true });
        for (const file of files) await writeFile(path.join(root, file.relative), file.bytes);
        updated.updatedAt = new Date().toISOString();
        await atomicWrite(manifest, JSON.stringify(updated, null, 2) + '\n');
        state = { id: payload.id, kind, status: 'saved', commit: null, paths: ['content.json', ...new Set(files.map(f => f.relative))], count: kind === 'photos' ? payload.entries.length : payload.questions.length };
        await writeState(state);
      }
      try {
        await finish(state);
      } catch {
        json(res, 502, { saved: true, kind: state.kind, pending: { id: state.id, status: state.status }, ...(await snapshot()), error: 'Your changes are saved on this computer. GitHub publishing did not finish. Check the connection and GitHub login, then use Finish publishing.' });
        return true;
      }
      json(res, 200, { saved: true, published: true, kind: state.kind, count: state.count, commit: state.commit, liveURL, ...(await snapshot()) });
    } catch (error) { json(res, error.status || 400, { error: error.status ? error.message : 'The upload could not be saved. Check the photos and years, then try again.' }); }
    finally { busy = false; }
    return true;
  };
}

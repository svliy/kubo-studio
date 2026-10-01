import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const run = promisify(execFile);
const git = async (...args) => (await run('git', args, {
  cwd: root, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024,
})).stdout;

function parseStatus(raw) {
  const records = raw.split('\0');
  const files = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue;
    const x = records[i][0], y = records[i][1];
    const name = records[i].slice(3);
    const original = /[RC]/.test(x + y) ? records[++i] : null;
    files.push({ path: name, original, index: x, worktree: y, untracked: x === '?',
      staged: x !== ' ' && x !== '?', changed: y !== ' ' || x === '?' });
  }
  return files;
}

async function snapshot() {
  const [raw, branch, references, head] = await Promise.all([
    git('status', '--porcelain=v1', '-z'),
    git('symbolic-ref', '--short', 'HEAD').catch(() => git('rev-parse', '--short', 'HEAD')),
    git('for-each-ref', '--format=%(objectname)%00%(refname:short)', 'refs/heads'),
    git('rev-parse', '--verify', '--quiet', 'HEAD').catch(error => {
      if (error.code === 1) return ''; throw error;
    }),
  ]);
  const refs = references.trim().split('\n').filter(Boolean).map(row => {
    const [hash, name] = row.split('\0'); return { hash, name };
  });
  const history = head.trim() ? await git('log', '--all', '--topo-order', '-60', '--format=%H%x00%P%x00%s%x00%an%x00%aI%x1e') : '';
  return { repository: path.basename(root), branch: branch.trim(),
    branches: refs.map(ref => ref.name), files: parseStatus(raw),
    commits: history.split('\x1e').map(row => row.trim()).filter(Boolean).map(row => {
      const [hash, parents, subject, author, date] = row.split('\0');
      return { hash, shortHash: hash.slice(0, 7), parents: parents.split(' ').filter(Boolean), subject, author, date,
        refs: refs.filter(ref => ref.hash === hash).map(ref => ref.name), isHead: hash === head.trim() };
    }), head: head.trim(), historyLimit: 60, updatedAt: new Date().toISOString() };
}

async function resolveCommit(hash) {
  if (!/^[a-f0-9]{7,64}$/i.test(hash || '')) {
    throw Object.assign(new Error('无效的提交编号。'), { status: 400 });
  }
  try { return (await git('rev-parse', '--verify', `${hash}^{commit}`)).trim(); }
  catch { throw Object.assign(new Error('找不到这个提交。'), { status: 404 }); }
}

async function commitDetails(hash) {
  const sha = await resolveCommit(hash);
  const raw = await git('show', '-s', '--format=%H%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%B', sha);
  const [id, parentList, subject, author, email, date, message] = raw.split('\0');
  const parents = parentList.split(' ').filter(Boolean);
  const diff = parents.length ? ['diff', '--no-renames', parents[0], sha] : ['diff-tree', '--root', '--no-commit-id', '-r', '--no-renames', sha];
  const [changes, stats, previewAvailable] = await Promise.all([
    git(...diff.slice(0, 1), '--name-status', '-z', ...diff.slice(1), '--'),
    git(...diff.slice(0, 1), '--numstat', '-z', ...diff.slice(1), '--'),
    git('cat-file', '-e', `${sha}:preview.html`).then(() => true).catch(() => false),
  ]);
  const records = changes.split('\0'), files = [];
  const counts = new Map(stats.split('\0').filter(Boolean).map(row => {
    const first = row.indexOf('\t'), second = row.indexOf('\t', first + 1);
    return [row.slice(second + 1), { additions: row.slice(0, first), deletions: row.slice(first + 1, second) }];
  }));
  for (let i = 0; i < records.length - 1; i += 2) {
    if (records[i]) files.push({ status: records[i], path: records[i + 1], ...counts.get(records[i + 1]) });
  }
  return { hash: id, shortHash: id.slice(0, 7), parents, subject, author, email, date, message: message.trimEnd(), files, previewAvailable };
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']],
  ['/graph.mjs', ['graph.mjs', 'text/javascript']],
  ['/preview.html', ['preview.html', 'text/html']],
]);
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      if (!localOrigins.includes(`http://${req.headers.host}`) ||
          (req.headers.origin && !localOrigins.includes(req.headers.origin)) ||
          req.headers['sec-fetch-site'] === 'cross-site') {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const data = url.pathname === '/api/git' ? await snapshot() :
        url.pathname === '/api/commit' ? await commitDetails(url.searchParams.get('hash')) : null;
      if (!data) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data)); return;
    }
    const version = url.pathname.match(/^\/version\/([a-f0-9]{7,64})\/preview\.html$/i);
    if (version) {
      const sha = await resolveCommit(version[1]);
      let page;
      try { page = await git('show', `${sha}:preview.html`); }
      catch { throw Object.assign(new Error('这个提交没有可预览的 preview.html。'), { status: 404 }); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "sandbox allow-scripts; frame-ancestors 'self'" });
      res.end(page); return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const resource = publicFiles.get(url.pathname);
    if (!resource) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': resource[1] + '; charset=utf-8' });
    res.end(await readFile(path.join(root, resource[0])));
  } catch (error) {
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.status ? error.message : '读取 Git 失败。请确认 Git 已安装，且以仓库所属用户运行 npm start。' }));
    console.error(error.message);
  }
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Local workbench: http://127.0.0.1:${port}`));

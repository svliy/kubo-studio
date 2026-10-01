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
  const [raw, branch, branches, head] = await Promise.all([
    git('status', '--porcelain=v1', '-z'),
    git('symbolic-ref', '--short', 'HEAD').catch(() => git('rev-parse', '--short', 'HEAD')),
    git('for-each-ref', '--format=%(refname:short)', 'refs/heads'),
    git('rev-parse', '--verify', '--quiet', 'HEAD').catch(error => {
      if (error.code === 1) return ''; throw error;
    }),
  ]);
  const history = head.trim() ? await git('log', '-20', '--format=%h%x00%s%x00%an%x00%aI') : '';
  return { repository: path.basename(root), branch: branch.trim(),
    branches: branches.trim().split('\n').filter(Boolean), files: parseStatus(raw),
    commits: history.trim().split('\n').filter(Boolean).map(row => {
      const [hash, subject, author, date] = row.split('\0'); return { hash, subject, author, date };
    }), head: head.trim().slice(0, 7), updatedAt: new Date().toISOString() };
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']],
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
      const data = url.pathname === '/api/git' ? await snapshot() : null;
      if (!data) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data)); return;
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

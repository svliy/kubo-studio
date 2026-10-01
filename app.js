import { layoutGraph } from './graph.mjs';

const $ = id => document.getElementById(id);
let state = null, activeTab = 'history', busy = false;
let renderedSignature = '', toastTimer;
let selectedHash = null, detailRequest = 0, historyInitialized = false, previewCommit = null;
const labels = { '?': '未跟踪', M: '已修改', A: '新增', D: '已删除', R: '已重命名', C: '已复制', U: '存在冲突', T: '类型变化' };
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name); svg.append(use); return svg;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
async function request(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '读取失败');
  return data;
}
function empty(title, description, glyph = 'check') {
  const box = element('div', 'empty-state');
  const mark = element('span', 'empty-icon'); mark.append(icon(glyph));
  box.append(mark, element('h3', '', title), element('p', '', description));
  return box;
}

function svgElement(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function graphRow(row, width) {
  const { commit, lane, color } = row;
  const button = element('button', 'commit-row' + (commit.hash === selectedHash ? ' selected' : ''));
  button.dataset.hash = commit.hash;
  button.setAttribute('aria-pressed', String(commit.hash === selectedHash));
  button.title = commit.subject;
  const x = index => 15 + index * 18;
  const graph = svgElement('svg', { viewBox: `0 0 ${width} 82`, 'aria-hidden': 'true' });
  const edge = (from, y, to, stroke) => graph.append(svgElement('path', {
    d: `M ${x(from)} ${y} C ${x(from)} ${y + (82 - y) / 2}, ${x(to)} ${y + (82 - y) / 2}, ${x(to)} 82`,
    fill: 'none', stroke, 'stroke-width': 1.6,
  }));
  for (const link of row.continuations) edge(link.from, 0, link.to, link.color);
  if (!row.startsHere) graph.append(svgElement('path', { d: `M ${x(lane)} 0 V 41`, stroke: color, 'stroke-width': 1.6 }));
  for (const link of row.parents) edge(lane, 41, link.to, link.color);
  if (commit.hash === selectedHash) graph.append(svgElement('circle', { cx: x(lane), cy: 41, r: 11, fill: '#a8bd8020', stroke: '#b4c897', 'stroke-width': 1 }));
  graph.append(svgElement('circle', { cx: x(lane), cy: 41, r: 5, fill: commit.parents.length ? color : '#20261d', stroke: color, 'stroke-width': 2 }));
  const rail = element('span', 'commit-graph'); rail.append(graph);
  const info = element('span', 'commit-info');
  info.append(element('strong', 'commit-subject', commit.subject));
  const meta = element('span', 'commit-meta');
  for (const name of commit.refs) {
    const ref = element('span', 'ref-badge' + (name === state.branch ? ' current-ref' : ''), name);
    ref.style.setProperty('--ref-color', color); meta.append(ref);
  }
  if (commit.isHead) meta.append(element('span', 'head-badge', 'HEAD'));
  meta.append(element('code', '', commit.shortHash), element('span', 'commit-date', new Date(commit.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })));
  info.append(meta); button.append(rail, info);
  button.addEventListener('click', () => selectCommit(commit));
  return button;
}

async function selectCommit(commit) {
  const requestId = ++detailRequest;
  selectedHash = commit.hash;
  $('detail-subject').textContent = commit.subject;
  $('detail-body').replaceChildren(element('p', 'detail-loading', '正在读取提交信息…'));
  render();
  try {
    const details = await request('/api/commit?hash=' + encodeURIComponent(commit.hash));
    if (requestId !== detailRequest) return;
    const body = $('detail-body'); body.replaceChildren();
    const action = element('div', 'detail-action');
    const preview = element('button', 'version-button', '预览这个版本');
    preview.disabled = !details.previewAvailable;
    if (!details.previewAvailable) preview.title = '这个提交不包含 preview.html';
    preview.addEventListener('click', () => showPreview(details));
    action.append(preview, element('code', 'detail-hash', details.shortHash)); body.append(action);
    body.append(element('p', 'change-summary', (details.parents.length ? '相对第一个父提交' : '初始提交') + ' · ' + details.files.length + ' 个文件'));
    const metadata = element('details', 'commit-metadata');
    metadata.append(element('summary', '', '提交信息'));
    const fields = element('dl');
    for (const [key, value] of [['作者', details.author], ['时间', new Date(details.date).toLocaleString('zh-CN', { hour12: false })], ['提交', details.hash], ['父提交', details.parents.length ? details.parents.map(hash => hash.slice(0, 7)).join(' · ') : '无（初始提交）']]) {
      fields.append(element('dt', '', key), element('dd', '', value));
    }
    metadata.append(fields, element('pre', 'commit-message', details.message)); body.append(metadata);
    const files = element('div', 'changed-files');
    if (!details.files.length) files.append(element('p', 'change-summary', '此提交与第一个父提交没有文件差异。'));
    for (const file of details.files) {
      const row = element('div', 'changed-file');
      const info = element('span', 'changed-file-name', file.path); info.title = file.path;
      const stats = element('span', 'line-stats');
      if (file.additions === '-' || file.deletions === '-') stats.textContent = '二进制';
      else stats.append(element('span', 'lines-added', '+' + file.additions), element('span', 'lines-deleted', '−' + file.deletions));
      row.append(icon('file'), info, stats, element('span', 'change-status status-' + file.status, labels[file.status] || file.status)); files.append(row);
    }
    body.append(files);
  } catch (error) {
    if (requestId === detailRequest) $('detail-body').replaceChildren(element('p', 'detail-error', error.message));
  }
}

function previewUrl() { return previewCommit ? '/version/' + previewCommit.hash + '/preview.html' : '/preview.html'; }
function showPreview(commit) {
  previewCommit = commit;
  $('version-banner').hidden = !commit;
  $('preview-mode').textContent = commit ? '历史版本预览' : '工作区实时预览';
  $('preview-dot').classList.toggle('history-dot', !!commit);
  $('preview-address').textContent = commit ? commit.shortHash + ' / preview.html' : '/preview.html';
  $('version-description').textContent = commit ? commit.shortHash + ' · ' + commit.subject : '';
  $('preview-hint').textContent = commit ? '当前查看历史快照，Git 分支仍为 ' + state.branch : '编辑 preview.html 后，刷新即可查看';
  const frame = $('preview-frame');
  if (commit) frame.setAttribute('sandbox', 'allow-scripts'); else frame.removeAttribute('sandbox');
  frame.title = commit ? '历史网页版本 ' + commit.shortHash : '当前项目网页预览';
  frame.src = previewUrl(); $('open-preview').href = previewUrl();
  if (commit) toast('正在预览 ' + commit.shortHash + '，当前分支保持不变');
}

function render() {
  if (!state) return;
  const working = state.files.filter(file => file.changed), staged = state.files.filter(file => file.staged);
  $('repo-name').textContent = $('project-tag').textContent = state.repository;
  $('branch-name').textContent = state.branch;
  $('head-label').textContent = state.head ? 'HEAD · ' + state.head.slice(0, 7) : '尚无提交';
  $('repo-status').textContent = state.files.length ? '有更改' : '工作区干净';
  $('working-count').textContent = $('working-badge').textContent = working.length;
  $('staged-count').textContent = $('staged-badge').textContent = staged.length;
  $('commit-count').textContent = state.commits.length;
  $('commit-detail').hidden = activeTab !== 'history' || !selectedHash;
  const content = $('git-content');
  const graphScroll = content.querySelector('.commit-list')?.scrollTop || 0;
  content.replaceChildren();
  content.classList.toggle('history-content', activeTab === 'history');
  if (activeTab === 'history') {
    if (!state.commits.length) { content.append(empty('故事，从第一次提交开始', '这个仓库还没有提交记录。', 'clock')); return; }
    const caption = element('div', 'list-caption');
    caption.append(element('span', '', '所有本地分支'), element('span', '', state.commits.length + ' 个提交' + (state.commits.length === state.historyLimit ? '（最近）' : '')));
    content.append(caption);
    const graph = layoutGraph(state.commits), list = element('div', 'commit-list');
    list.style.setProperty('--graph-width', graph.width + 'px');
    for (const row of graph.rows) list.append(graphRow(row, graph.width));
    content.append(list);
    list.scrollTop = graphScroll;
    if (!historyInitialized) { historyInitialized = true; selectCommit(state.commits[0]); }
    return;
  }
  const files = activeTab === 'staged' ? staged : working;
  if (!files.length) {
    content.append(activeTab === 'staged' ? empty('暂存区，准备就绪', '还没有暂存的文件。使用 git add 选择要提交的更改。', 'file') : empty('工作区很整洁', '所有更改都已记录，继续创造吧。'));
    return;
  }
  const caption = element('div', 'list-caption');
  caption.append(element('span', '', files.length + ' 个更改的文件'), element('span', '', '文件状态'));
  content.append(caption);
  for (const file of files) {
    const code = file.untracked ? '?' : activeTab === 'staged' ? file.index : file.worktree;
    const row = element('div', 'file-row'); row.title = file.path;
    const extension = file.path.includes('.') ? file.path.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    const info = element('span', 'file-info');
    info.append(element('strong', '', file.path.split('/').pop()), element('small', '', file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) + ' / ' + (labels[code] || code) : labels[code] || code));
    row.append(element('span', 'file-type', extension), info, element('span', 'file-status' + (code === 'A' || code === '?' ? ' added' : code === 'D' ? ' deleted' : ''), code === '?' ? 'U' : code));
    content.append(row);
  }
}
async function refresh(manual = false) {
  if (busy) return;
  busy = true; $('refresh-git').classList.add('is-refreshing');
  try {
    const data = await request('/api/git');
    const signature = JSON.stringify([data.files, data.commits, data.branch]);
    state = data;
    if (signature !== renderedSignature || manual) {
      renderedSignature = signature; render();
    }
    $('connection-status').replaceChildren(element('i', 'live-dot'), document.createTextNode('Git 已连接 · ' + state.branch));
    $('updated-time').textContent = '上次同步 ' + new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false });
    if (manual) toast('Git 状态已刷新');
  } catch (error) {
    $('repo-status').textContent = '未连接';
    $('connection-status').textContent = 'Git 连接中断';
    const message = location.protocol === 'file:' ? '请运行 npm start，然后通过 http://127.0.0.1:5173 打开工作台。' : error.message;
    const box = empty('暂时无法读取 Git', message, 'branch'); box.classList.add('error-state');
    $('git-content').replaceChildren(box); renderedSignature = '';
  } finally { busy = false; $('refresh-git').classList.remove('is-refreshing'); }
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  activeTab = button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(item => {
    item.classList.toggle('active', item === button); item.setAttribute('aria-selected', String(item === button));
  });
  render();
}));
$('refresh-git').addEventListener('click', () => refresh(true));
$('reload-preview').addEventListener('click', () => { $('preview-frame').src = previewUrl() + '?t=' + Date.now(); toast('网页预览已刷新'); });
$('return-working').addEventListener('click', () => showPreview(null));
$('close-detail').addEventListener('click', () => { selectedHash = null; detailRequest++; render(); });
function device(mobile) {
  $('iframe-stage').classList.toggle('mobile', mobile);
  $('desktop-button').classList.toggle('active', !mobile); $('mobile-button').classList.toggle('active', mobile);
  $('desktop-button').setAttribute('aria-pressed', String(!mobile)); $('mobile-button').setAttribute('aria-pressed', String(mobile));
  $('viewport-label').textContent = mobile ? '手机视图 · 375 px' : '桌面视图';
}
$('desktop-button').addEventListener('click', () => device(false));
$('mobile-button').addEventListener('click', () => device(true));
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

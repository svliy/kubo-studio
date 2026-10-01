const $ = id => document.getElementById(id);
let state = null, activeTab = 'working', busy = false;
let renderedSignature = '', toastTimer;
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
function render() {
  if (!state) return;
  const working = state.files.filter(file => file.changed), staged = state.files.filter(file => file.staged);
  $('repo-name').textContent = $('project-tag').textContent = state.repository;
  $('branch-name').textContent = state.branch;
  $('head-label').textContent = state.head ? 'HEAD · ' + state.head : '尚无提交';
  $('repo-status').textContent = state.files.length ? '有更改' : '已同步';
  $('working-count').textContent = $('working-badge').textContent = working.length;
  $('staged-count').textContent = $('staged-badge').textContent = staged.length;
  $('commit-count').textContent = state.commits.length;
  const content = $('git-content'); content.replaceChildren();
  if (activeTab === 'history') {
    if (!state.commits.length) { content.append(empty('故事，从第一次提交开始', '这个仓库还没有提交记录。', 'clock')); return; }
    content.append(element('div', 'list-caption', '最近 ' + state.commits.length + ' 条提交'));
    for (const commit of state.commits) {
      const row = element('div', 'history-row'), info = element('div');
      const meta = element('p'); meta.append(element('code', '', commit.hash), document.createTextNode(commit.author + ' · ' + new Date(commit.date).toLocaleDateString('zh-CN')));
      info.append(element('strong', '', commit.subject), meta);
      row.append(element('span', 'history-marker'), info); content.append(row);
    }
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
$('reload-preview').addEventListener('click', () => { $('preview-frame').src = '/preview.html?t=' + Date.now(); toast('网页预览已刷新'); });
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

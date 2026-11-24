// 공유 링크 보기 페이지. 주소의 # 뒤를 풀어 묶음 목록을 보여 준다. 확장 프로그램 안에서도, 정적 페이지로 올려도 같은 파일이 동작한다.
import { decodeShare } from './lib/share-link.js';

const out = document.getElementById('out');
const toast = document.getElementById('toast');
let toastTimer = 0;

function say(text) {
  toast.textContent = text;
  toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('on'), 2200);
}

function message(text, warn) {
  out.textContent = '';
  const div = document.createElement('div');
  div.className = `msg${warn ? ' warn' : ''}`;
  div.textContent = text;
  out.append(div);
}

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

function asMarkdown(data) {
  const lines = data.tabs.map((t) => (t.title ? `- [${t.title.replace(/[\[\]]/g, '')}](${t.url})` : `- ${t.url}`));
  return `${data.title ? `# ${data.title}\n\n` : ''}${lines.join('\n')}\n`;
}

async function render() {
  const data = await decodeShare(location.hash);
  if (data.error) { message(data.error, true); return; }
  document.title = `${data.title || '공유된 묶음'} · Tabularium`;
  if (data.expired) {
    message(`이 링크는 ${fmtDate(data.expiresAt)}에 만료되었습니다. 보낸 사람에게 새 링크를 요청하세요.`, true);
    return;
  }
  if (!data.tabs.length) { message('이 묶음에는 열 수 있는 링크가 없습니다.'); return; }

  out.textContent = '';
  const h1 = document.createElement('h1');
  h1.textContent = data.title || '이름 없는 묶음';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `링크 ${data.tabs.length}개 · ${data.expiresAt ? `${fmtDate(data.expiresAt)}까지 보기 가능(안내용)` : '만료 기한 없음'}`;

  const bar = document.createElement('div');
  bar.className = 'bar';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'primary';
  copyBtn.textContent = '목록 복사';
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(asMarkdown(data)); say('목록을 복사했습니다.'); } catch { say('복사하지 못했습니다.'); }
  });
  const openBtn = document.createElement('button');
  openBtn.textContent = '모두 새 탭으로 열기';
  openBtn.addEventListener('click', () => {
    if (data.tabs.length > 10 && !confirm(`탭 ${data.tabs.length}개를 한꺼번에 엽니다. 계속할까요?`)) return;
    for (const t of data.tabs) window.open(t.url, '_blank', 'noopener,noreferrer');
  });
  bar.append(copyBtn, openBtn);

  const ul = document.createElement('ul');
  for (const t of data.tabs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = t.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const title = document.createElement('span');
    title.className = 't';
    title.textContent = t.title || hostOf(t.url);
    const url = document.createElement('span');
    url.className = 'u';
    url.textContent = t.url;
    a.append(title, url);
    li.append(a);
    ul.append(li);
  }
  out.append(h1, meta, bar, ul);
}

render();
window.addEventListener('hashchange', render);

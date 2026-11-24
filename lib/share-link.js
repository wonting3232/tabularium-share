// 묶음 공유 링크(링크에 담기). 서버 없이 묶음 내용을 주소의 # 뒤(프래그먼트)에 압축해 담는다.
// 형식: <보기 페이지 주소>#v1.<base64url(deflate-raw(JSON))>   JSON = { n: 제목, e: 만료 시각(ms, 0이면 없음), t: [[url, 제목?], …] }
// 프래그먼트는 브라우저가 서버로 보내지 않으므로 보기 페이지를 올린 서버에도 내용이 남지 않는다.
// 만료는 보기 페이지가 지난 링크를 가려 줄 뿐, 링크를 가진 사람이 직접 풀어 읽는 것은 막지 못한다. 공유 해제·수정은 할 수 없다.
// 이 파일은 확장 프로그램과 정적 보기 페이지(s.html)가 함께 쓴다. 다른 파일에 의존하지 않는다.

export const SHARE_VERSION = 'v1';
// 권장 한도: 메신저·문자 앱은 긴 링크를 줄이거나 끊을 수 있다. 넘으면 경고하고, 최대를 넘으면 만들지 않는다.
export const SHARE_SOFT_LIMIT = 2000;
export const SHARE_HARD_LIMIT = 8000;
// 보기 페이지를 인터넷에 올리면 그 주소(끝에 s.html 포함)를 여기에 적는다. 비어 있으면 확장 프로그램 안의 보기 화면을 쓴다.
export const SHARE_VIEWER_URL = '';

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// http·https 주소만 링크로 허용한다(javascript: 같은 주소가 보기 페이지에서 실행되지 않게).
export function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// 묶음의 탭으로 링크의 조각(#v1.…)을 만든다. withTitles가 false면 주소만 담아 훨씬 짧아진다.
export async function encodeShare({ title, tabs, expiresAt = 0, withTitles = true }) {
  const t = [];
  const seen = new Set();
  for (const tab of tabs || []) {
    const url = tab && tab.url;
    if (!url || !isSafeUrl(url) || seen.has(url)) continue;
    seen.add(url);
    t.push(withTitles && tab.title ? [url, String(tab.title)] : [url]);
  }
  const json = JSON.stringify({ n: String(title || ''), e: Number(expiresAt) || 0, t });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return { fragment: `${SHARE_VERSION}.${toB64url(packed)}`, count: t.length };
}

// 조각(#v1.… 또는 v1.…)을 풀어 묶음 내용으로 돌려준다. 형식이 틀리면 { error }.
export async function decodeShare(fragment, now = Date.now()) {
  const text = String(fragment || '').replace(/^#/, '').trim();
  const dot = text.indexOf('.');
  if (dot < 0) return { error: '공유 링크가 비어 있거나 형식이 맞지 않습니다.' };
  const version = text.slice(0, dot);
  if (version !== SHARE_VERSION) return { error: `이 링크는 지원하지 않는 형식(${version})입니다. 보기 페이지가 최신인지 확인하세요.` };
  let data;
  try {
    const unpacked = await pipe(fromB64url(text.slice(dot + 1)), new DecompressionStream('deflate-raw'));
    data = JSON.parse(new TextDecoder().decode(unpacked));
  } catch {
    return { error: '링크가 중간에 잘렸거나 손상되어 읽을 수 없습니다. 보낸 사람에게 다시 받아 주세요.' };
  }
  if (!data || !Array.isArray(data.t)) return { error: '링크 내용이 올바르지 않습니다.' };
  const tabs = [];
  for (const row of data.t) {
    const url = Array.isArray(row) ? row[0] : '';
    if (typeof url !== 'string' || !isSafeUrl(url)) continue;
    tabs.push({ url, title: typeof row[1] === 'string' ? row[1] : '' });
  }
  const expiresAt = Number(data.e) || 0;
  return { title: typeof data.n === 'string' ? data.n : '', tabs, expiresAt, expired: expiresAt > 0 && now > expiresAt };
}

// 확장 프로그램이 링크 전체를 만든다. 크기 한도를 넘으면 제목을 빼고 다시 시도한다.
// 반환: { url, length, count, withTitles, level: 'ok'|'long'|'too-long' }
export async function buildShareLink({ title, tabs, expiresAt = 0, base = SHARE_VIEWER_URL }) {
  let withTitles = true;
  let made = await encodeShare({ title, tabs, expiresAt, withTitles });
  let url = `${base}#${made.fragment}`;
  if (url.length > SHARE_SOFT_LIMIT) {
    withTitles = false;
    made = await encodeShare({ title, tabs, expiresAt, withTitles });
    url = `${base}#${made.fragment}`;
  }
  const level = url.length > SHARE_HARD_LIMIT ? 'too-long' : url.length > SHARE_SOFT_LIMIT ? 'long' : 'ok';
  return { url, length: url.length, count: made.count, withTitles, level };
}

/**
 * Thẻ gợi ý sửa lỗi.
 *
 * Dựng trong Shadow DOM để CSS của trang chủ không phá được — Facebook và
 * Gmail đều có reset toàn cục rất hung hãn, một thẻ div thường sẽ vỡ bố cục.
 */

const TAG_LABEL = {
  'hoi-nga': 'hỏi / ngã',
  'thieu-dau': 'thiếu dấu',
  'sai-dau': 'sai dấu',
  'ch-tr': 'ch / tr',
  's-x': 's / x',
  'd-gi-r': 'd / gi / r',
  'n-ng': 'âm cuối n / ng',
  'tu-vung': 'dùng sai từ',
  'chinh-ta': 'chính tả',
};

const CSS_TEXT = `
:host { all: initial; }
.card {
  position: fixed;
  z-index: 2147483647;
  max-width: 340px;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff;
  color: #1a1a1a;
  border: 1px solid rgba(0,0,0,.1);
  box-shadow: 0 6px 24px rgba(0,0,0,.14);
  font: 400 13px/1.5 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}
@media (prefers-color-scheme: dark) {
  .card { background: #222; color: #eee; border-color: rgba(255,255,255,.14); }
  .old { color: #999; }
  .btn { border-color: rgba(255,255,255,.22); color: #eee; }
  .btn:hover { background: rgba(255,255,255,.08); }
}
.row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.old { color: #888; text-decoration: line-through; }
.arrow { color: #888; }
.new { font-weight: 600; font-size: 14px; }
.badge {
  margin-left: auto; font-size: 11px; padding: 2px 7px; border-radius: 5px;
  background: rgba(217,48,37,.12); color: #c5221f; white-space: nowrap;
}
.badge.low { background: rgba(232,163,61,.16); color: #9a6212; }
.why { color: #555; margin-bottom: 10px; }
@media (prefers-color-scheme: dark) { .why { color: #bbb; } }
.tag { font-size: 11px; color: #999; margin-bottom: 8px; }
.actions { display: flex; gap: 6px; border-top: 1px solid rgba(128,128,128,.2); padding-top: 9px; }
.btn {
  font: inherit; font-size: 12px; cursor: pointer;
  padding: 5px 11px; border-radius: 6px;
  border: 1px solid rgba(0,0,0,.16); background: transparent; color: #1a1a1a;
}
.btn:hover { background: rgba(0,0,0,.05); }
.btn.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; }
.btn.primary:hover { background: #1666d0; }
.key { opacity: .6; margin-left: 4px; }
`;

let host = null;
let shadow = null;
let card = null;
let current = null;

function ensureHost() {
  if (host && host.isConnected) return;
  host = document.createElement('div');
  host.setAttribute('data-soat-overlay', '');
  shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS_TEXT;
  shadow.appendChild(style);
  card = document.createElement('div');
  card.className = 'card';
  card.style.display = 'none';
  shadow.appendChild(card);
  document.body.appendChild(host);
}

/** Đặt thẻ ngay dưới từ được gạch chân, tự lật lên trên nếu chạm đáy màn hình. */
function position(rect) {
  card.style.display = 'block';
  card.style.left = '0px';
  card.style.top = '0px';
  const size = card.getBoundingClientRect();

  let left = rect.left;
  if (left + size.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - size.width - 8);
  }

  let top = rect.bottom + 6;
  if (top + size.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - size.height - 6);
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

/**
 * Hiện thẻ gợi ý.
 * @param {DOMRect} rect    vị trí từ đang sai trên màn hình
 * @param {object} issue
 * @param {{onAccept: Function, onIgnore: Function}} handlers
 */
export function show(rect, issue, handlers) {
  ensureHost();
  current = { issue, handlers };

  const low = issue.confidence < 0.9;
  card.innerHTML = `
    <div class="row">
      <span class="old"></span>
      <span class="arrow">→</span>
      <span class="new"></span>
      <span class="badge ${low ? 'low' : ''}">${low ? 'Nên xem lại' : 'Chắc chắn sai'}</span>
    </div>
    <div class="why"></div>
    <div class="tag">${TAG_LABEL[issue.tag] || issue.tag}</div>
    <div class="actions">
      <button class="btn primary" data-act="accept">Sửa<span class="key">Tab</span></button>
      <button class="btn" data-act="ignore">Bỏ qua từ này</button>
    </div>`;

  // Gán bằng textContent, không nhét vào innerHTML — nội dung đến từ trang web.
  card.querySelector('.old').textContent = issue.original;
  card.querySelector('.new').textContent = issue.suggestion;
  card.querySelector('.why').textContent = issue.why;

  card.querySelector('[data-act="accept"]').onclick = (e) => {
    e.preventDefault();
    handlers.onAccept();
  };
  card.querySelector('[data-act="ignore"]').onclick = (e) => {
    e.preventDefault();
    handlers.onIgnore();
  };

  position(rect);
}

export function hide() {
  if (card) card.style.display = 'none';
  current = null;
}

export function isOpen() {
  return current !== null;
}

export function currentIssue() {
  return current ? current.issue : null;
}

export function accept() {
  if (current) current.handlers.onAccept();
}

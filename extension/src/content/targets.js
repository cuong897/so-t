/**
 * Tìm ô nhập liệu để soát — và quan trọng hơn, quyết định ô nào PHẢI BỎ QUA.
 *
 * Danh sách loại trừ ở đây quan trọng hơn danh sách nhận vào. Gạch chân vào ô
 * mật khẩu, ô thẻ ngân hàng hay trình soạn thảo code là cách nhanh nhất để
 * người dùng gỡ extension và để lại một review 1 sao. Thà bỏ sót vài ô hợp lệ
 * còn hơn chạm vào một ô nhạy cảm.
 */

/** Kiểu input tuyệt đối không đụng tới. */
const BLOCKED_INPUT_TYPES = new Set([
  'password', 'hidden', 'email', 'tel', 'number', 'url', 'date', 'time',
  'datetime-local', 'month', 'week', 'color', 'range', 'file', 'checkbox',
  'radio', 'submit', 'button', 'reset', 'image', 'search',
]);

/** Giá trị autocomplete báo hiệu dữ liệu nhạy cảm. */
const BLOCKED_AUTOCOMPLETE = [
  'password', 'current-password', 'new-password', 'one-time-code',
  'cc-number', 'cc-exp', 'cc-csc', 'cc-name', 'cc-type',
];

/** Selector của các trình soạn thảo code — gạch chân tên biến là thảm hoạ. */
const CODE_EDITOR_SELECTORS = [
  '.CodeMirror', '.cm-editor', '.monaco-editor', '.ace_editor',
  '.ProseMirror[data-code]', 'pre[contenteditable]', '[data-slate-editor][data-code]',
  '.hljs', '.language-javascript', '.language-python',
];

/** Từ khoá trong id/name/placeholder/aria-label báo hiệu ô tìm kiếm hoặc mã. */
const BLOCKED_HINTS = [
  'search', 'tìm kiếm', 'tim kiem', 'query', 'otp', 'captcha', 'code',
  'mã', 'coupon', 'promo', 'card', 'cvv', 'cvc', 'iban', 'swift',
];

/** Ô ngắn hơn ngưỡng này không có đủ ngữ cảnh để soát cho đúng. */
export const MIN_LENGTH = 12;

function attrBlob(el) {
  return [
    el.id, el.name, el.placeholder,
    el.getAttribute('aria-label'), el.getAttribute('data-testid'),
    el.getAttribute('title'),
  ].filter(Boolean).join(' ').toLowerCase();
}

/** True nếu phần tử nằm trong một trình soạn thảo code. */
function insideCodeEditor(el) {
  return CODE_EDITOR_SELECTORS.some((sel) => el.closest(sel));
}

/**
 * Có được phép soát phần tử này không.
 * Trả về false cho mọi trường hợp còn nghi ngờ.
 */
export function isEligible(el) {
  if (!el || !el.isConnected) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute('aria-readonly') === 'true') return false;
  if (el.closest('[data-soat-off]')) return false;

  const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (BLOCKED_AUTOCOMPLETE.some((b) => ac.includes(b))) return false;

  if (insideCodeEditor(el)) return false;

  const blob = attrBlob(el);
  if (BLOCKED_HINTS.some((h) => blob.includes(h))) return false;

  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;

  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (BLOCKED_INPUT_TYPES.has(type)) return false;
    // Ô input một dòng thường là tên, tiêu đề, ô tìm kiếm — ít giá trị, dễ
    // báo sai vì thiếu ngữ cảnh. Chỉ nhận khi đủ dài.
    return type === 'text';
  }

  if (el.isContentEditable) {
    // contenteditable lồng nhau: chỉ lấy phần tử gốc của vùng soạn thảo.
    const host = el.closest('[contenteditable="true"], [contenteditable=""]');
    return host === el;
  }

  return false;
}

/** Loại phần tử — quyết định dùng chiến lược gạch chân nào. */
export function kindOf(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return 'input';
  if (el.isContentEditable) return 'contenteditable';
  return null;
}

/** Đọc nội dung văn bản thuần của một ô. */
export function readText(el) {
  if (kindOf(el) === 'input') return el.value || '';
  return el.innerText || '';
}

/**
 * Quét toàn tài liệu tìm ô hợp lệ. Dùng lúc khởi tạo và khi DOM đổi nhiều.
 * Không quét liên tục — MutationObserver ở index.js lo phần tăng dần.
 */
export function findEditables(root = document) {
  const out = [];
  const nodes = root.querySelectorAll(
    'textarea, input, [contenteditable="true"], [contenteditable=""]',
  );
  for (const el of nodes) {
    if (isEligible(el)) out.push(el);
  }
  return out;
}

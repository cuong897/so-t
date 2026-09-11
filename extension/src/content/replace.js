/**
 * Thay chuỗi trong ô nhập liệu sao cho ứng dụng chủ nhận ra thay đổi.
 *
 * Đây là chỗ phần lớn extension loại này chết.
 *
 * Với input/textarea do React quản: React ghi đè property `value` trên chính
 * instance phần tử để theo dõi thay đổi. Gán `el.value = x` sẽ đổi hiển thị
 * nhưng React KHÔNG biết, nên ngay lần render sau giá trị cũ quay lại. Cách
 * đúng: gọi setter gốc trên prototype rồi tự phát sự kiện `input`.
 *
 * Với contenteditable (Facebook dùng Lexical, Gmail dùng editor riêng): sửa
 * DOM trực tiếp sẽ phá mô hình nội bộ của editor, hỏng undo và con trỏ. Cách
 * đáng tin cậy nhất vẫn là `execCommand('insertText')` — tuy đã deprecated
 * nhưng nó đi qua đúng đường ống soạn thảo của trình duyệt nên editor nhận
 * được `beforeinput`/`input` như người dùng gõ thật.
 */

/** Setter `value` gốc, lấy trước khi framework nào kịp ghi đè. */
const nativeInputSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value',
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype, 'value',
)?.set;

function setNativeValue(el, value) {
  const setter = el.tagName === 'TEXTAREA' ? nativeTextareaSetter : nativeInputSetter;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/**
 * Thay [start, end) trong một input/textarea.
 * Giữ con trỏ ở ngay sau chuỗi vừa thay.
 */
function replaceInInput(el, start, end, replacement) {
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = before + replacement + after;
  const caret = start + replacement.length;

  el.focus();

  // Thử đi qua đường ống soạn thảo trước — giữ được undo của trình duyệt.
  el.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, replacement);
  } catch {
    ok = false;
  }

  if (!ok) {
    setNativeValue(el, next);
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: 'insertReplacementText',
      data: replacement,
    }));
  }

  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* input type không hỗ trợ selection — bỏ qua */
  }
  return true;
}

/**
 * Thay nội dung một Range trong vùng contenteditable.
 * Không đụng vào DOM bằng tay; để trình duyệt tự làm qua execCommand.
 */
function replaceInContentEditable(host, range, replacement) {
  host.focus();

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  // Đường đi chuẩn, được Lexical / ProseMirror / Draft lắng nghe.
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, replacement);
  } catch {
    ok = false;
  }

  if (!ok) {
    // Dự phòng: báo ý định qua beforeinput rồi tự sửa text node.
    const ev = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: replacement,
    });
    const notPrevented = host.dispatchEvent(ev);
    if (notPrevented) {
      range.deleteContents();
      const node = document.createTextNode(replacement);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      host.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: replacement,
      }));
    }
  }
  return true;
}

/**
 * Áp một gợi ý sửa lỗi.
 *
 * @param {HTMLElement} el    ô đang soát
 * @param {'input'|'contenteditable'} kind
 * @param {{start:number,end:number,suggestion:string}} issue
 * @param {Range|null} range  Range đã dựng sẵn (chỉ dùng cho contenteditable)
 */
export function applyFix(el, kind, issue, range) {
  if (kind === 'input') {
    return replaceInInput(el, issue.start, issue.end, issue.suggestion);
  }
  if (!range) return false;
  return replaceInContentEditable(el, range, issue.suggestion);
}

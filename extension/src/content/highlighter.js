/**
 * Vẽ gạch chân dưới lỗi. Đây là phần khó nhất của extension, không phải model.
 *
 * Hai chiến lược, vì hai loại ô hoạt động khác hẳn nhau:
 *
 *   contenteditable  -> CSS Custom Highlight API.
 *        Tạo Range trên text node rồi đăng ký vào CSS.highlights. Không chèn
 *        thêm DOM node nào vào vùng soạn thảo — cực kỳ quan trọng, vì chèn
 *        node vào editor của Facebook/Gmail sẽ phá con trỏ và undo stack.
 *
 *   textarea / input -> lớp phủ "mirror".
 *        Không thể tô màu chữ bên trong textarea. Cách duy nhất: dựng một div
 *        sao chép y hệt font/padding/wrap, đặt chồng lên, cho chữ trong suốt
 *        và chỉ vẽ gạch chân. Chữ thật vẫn là chữ của textarea bên dưới.
 */

const HL_NAME_HIGH = 'soat-high';
const HL_NAME_LOW = 'soat-low';
const OVERLAY_ATTR = 'data-soat-overlay';

/** Ngưỡng chia màu: đỏ (chắc chắn) và cam (cần người dùng tự quyết). */
const HIGH_CONFIDENCE = 0.9;

const supportsHighlightAPI =
  typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && !!CSS.highlights;

// ---------------------------------------------------------------------------
// Ánh xạ offset ký tự <-> text node
// ---------------------------------------------------------------------------

/**
 * Gom text node của một vùng contenteditable, kèm offset tích luỹ.
 *
 * Cố tình KHÔNG dùng innerText: innerText chuẩn hoá khoảng trắng và thêm ngắt
 * dòng theo cách trình bày, nên offset của nó không khớp với text node. Ta tự
 * dựng chuỗi từ chính các node để offset luôn ánh xạ 1-1.
 */
export function collectTextNodes(root) {
  const nodes = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      // Bỏ qua nội dung không phải văn bản người dùng gõ.
      if (p.closest('script, style, code, pre, [data-soat-overlay]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  let prevBlock = null;
  while ((node = walker.nextNode())) {
    const block = node.parentElement.closest('div, p, li, br');
    if (prevBlock && block !== prevBlock && text && !text.endsWith('\n')) {
      text += '\n';
    }
    prevBlock = block;
    nodes.push({ node, start: text.length, end: text.length + node.data.length });
    text += node.data;
  }
  return { text, nodes };
}

/** Dựng Range phủ đúng khoảng [start, end) trong chuỗi đã gom. */
function rangeFor(map, start, end) {
  let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
  for (const entry of map.nodes) {
    if (startNode === null && start >= entry.start && start < entry.end) {
      startNode = entry.node;
      startOffset = start - entry.start;
    }
    if (end > entry.start && end <= entry.end) {
      endNode = entry.node;
      endOffset = end - entry.start;
      break;
    }
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  try {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
  } catch {
    return null;
  }
  return range;
}

// ---------------------------------------------------------------------------
// Chiến lược 1 — contenteditable qua CSS Custom Highlight API
// ---------------------------------------------------------------------------

const highlightHigh = supportsHighlightAPI ? new Highlight() : null;
const highlightLow = supportsHighlightAPI ? new Highlight() : null;
if (supportsHighlightAPI) {
  CSS.highlights.set(HL_NAME_HIGH, highlightHigh);
  CSS.highlights.set(HL_NAME_LOW, highlightLow);
}

/** Range đang hiển thị, nhóm theo phần tử, để xoá chọn lọc. */
const activeRanges = new WeakMap();

function clearHighlightAPI(el) {
  const prev = activeRanges.get(el);
  if (!prev) return;
  for (const r of prev.high) highlightHigh.delete(r);
  for (const r of prev.low) highlightLow.delete(r);
  activeRanges.delete(el);
}

function paintContentEditable(el, issues, map) {
  clearHighlightAPI(el);
  if (!supportsHighlightAPI) return [];

  const high = [], low = [], placed = [];
  for (const issue of issues) {
    const range = rangeFor(map, issue.start, issue.end);
    if (!range) continue;
    if (issue.confidence >= HIGH_CONFIDENCE) {
      highlightHigh.add(range);
      high.push(range);
    } else {
      highlightLow.add(range);
      low.push(range);
    }
    placed.push({ issue, range, node: null });
  }
  activeRanges.set(el, { high, low });
  return placed;
}

/** Hình chữ nhật trên màn hình của một issue đã vẽ, dùng để đặt tooltip. */
export function rectOf(placed) {
  if (placed.range) {
    const rects = placed.range.getClientRects();
    if (rects.length) return rects[0];
    return placed.range.getBoundingClientRect();
  }
  if (placed.node) return placed.node.getBoundingClientRect();
  return null;
}

// ---------------------------------------------------------------------------
// Chiến lược 2 — lớp phủ mirror cho textarea / input
// ---------------------------------------------------------------------------

/** Thuộc tính phải sao chép để mirror ngắt dòng y hệt textarea thật. */
const MIRRORED_STYLES = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent',
  'textAlign', 'whiteSpace', 'overflowWrap', 'wordBreak', 'direction',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'boxSizing',
];

const overlays = new WeakMap();

function ensureOverlay(el) {
  let ov = overlays.get(el);
  if (ov && ov.isConnected) return ov;

  ov = document.createElement('div');
  ov.setAttribute(OVERLAY_ATTR, '');
  ov.setAttribute('aria-hidden', 'true');
  Object.assign(ov.style, {
    position: 'fixed',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '2147483646',
    color: 'transparent',
    background: 'transparent',
    borderColor: 'transparent',
    borderStyle: 'solid',
    margin: '0',
    contain: 'strict',
  });
  document.body.appendChild(ov);
  overlays.set(el, ov);
  return ov;
}

/** Escape để nội dung người dùng không bao giờ được diễn giải thành HTML. */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function paintInput(el, issues) {
  const ov = ensureOverlay(el);
  const cs = getComputedStyle(el);
  for (const prop of MIRRORED_STYLES) ov.style[prop] = cs[prop];

  const rect = el.getBoundingClientRect();
  Object.assign(ov.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    whiteSpace: el.tagName === 'TEXTAREA' ? cs.whiteSpace || 'pre-wrap' : 'pre',
  });

  // Ô bị cuộn ra ngoài vùng nhìn thấy thì ẩn hẳn lớp phủ.
  ov.style.display = rect.width === 0 || rect.height === 0 ? 'none' : 'block';

  const text = el.value || '';
  let html = '';
  let cursor = 0;
  for (const issue of issues) {
    if (issue.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, issue.start));
    const cls = issue.confidence >= HIGH_CONFIDENCE ? 'soat-u-high' : 'soat-u-low';
    html += `<span class="${cls}">${escapeHtml(text.slice(issue.start, issue.end))}</span>`;
    cursor = issue.end;
  }
  html += escapeHtml(text.slice(cursor));

  // Ký tự cuối là xuống dòng thì thêm một khoảng trắng, nếu không dòng cuối
  // bị sụp và toàn bộ gạch chân lệch một dòng.
  ov.innerHTML = html + '​';
  ov.scrollTop = el.scrollTop;
  ov.scrollLeft = el.scrollLeft;

  // Trả kèm chính thẻ span để hitTest lấy được toạ độ — textarea không cho
  // dựng Range nên đây là nguồn toạ độ duy nhất.
  const spans = ov.querySelectorAll('span');
  return issues.map((issue, i) => ({ issue, range: null, node: spans[i] || null }));
}

function clearOverlay(el) {
  const ov = overlays.get(el);
  if (ov) ov.innerHTML = '';
}

// ---------------------------------------------------------------------------
// API công khai
// ---------------------------------------------------------------------------

/**
 * Vẽ gạch chân cho một ô.
 * @returns {{issue: object, range: Range|null}[]} issue đã đặt được lên màn hình
 */
export function paint(el, kind, issues, map = null) {
  if (kind === 'contenteditable') return paintContentEditable(el, issues, map);
  return paintInput(el, issues);
}

export function clear(el, kind) {
  if (kind === 'contenteditable') clearHighlightAPI(el);
  else clearOverlay(el);
}

/** Đồng bộ lại vị trí lớp phủ khi trang cuộn hoặc đổi kích thước. */
export function reposition(el, kind, issues) {
  if (kind === 'input' && overlays.has(el)) paintInput(el, issues);
}

export function destroy(el) {
  const ov = overlays.get(el);
  if (ov) ov.remove();
  overlays.delete(el);
  clearHighlightAPI(el);
}

export { supportsHighlightAPI, HIGH_CONFIDENCE };

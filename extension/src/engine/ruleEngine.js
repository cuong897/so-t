/**
 * Bộ khớp luật — tầng 1 và tầng 2 của pipeline.
 *
 * Chạy thuần CPU, không phụ thuộc DOM, không cần model. Đây là thứ khiến
 * extension có ích ngay từ ngày đầu, trước khi model ONNX được train xong.
 *
 * Hợp đồng đầu ra (tầng 3 sau này trả về đúng cấu trúc này):
 *
 *   Issue = {
 *     start, end      offset ký tự trong văn bản gốc
 *     original        chuỗi đang sai
 *     suggestion      chuỗi đề xuất, đã khớp hoa/thường với bản gốc
 *     why             giải thích ngắn hiện trong tooltip
 *     tag             nhóm lỗi: hoi-nga | ch-tr | s-x | d-gi-r | n-ng | tu-vung
 *     confidence      0..1
 *     source          'rule' | 'model'
 *   }
 */

import { tokenize, isWordLike } from './vi.js';
import { PHRASE_RULES, CONTEXT_RULES, CUE_WINDOW } from './rules.js';

// --- chỉ mục dựng sẵn một lần khi nạp module ---------------------------------

const PHRASE_INDEX = new Map();
let MAX_NGRAM = 1;
for (const [wrong, right, tag, why] of PHRASE_RULES) {
  const key = wrong.toLowerCase();
  PHRASE_INDEX.set(key, { right, tag, why });
  MAX_NGRAM = Math.max(MAX_NGRAM, key.split(/\s+/).length);
}

/** Dựng sẵn Set để tra cue trong O(1). */
function prepForm(form) {
  return {
    gloss: form.gloss,
    strict: !!form.strict,
    before: new Set(form.before || []),
    after: new Set(form.after || []),
  };
}

/** form (chữ thường) -> thông tin cặp đồng âm */
const CONTEXT_INDEX = new Map();
for (const rule of CONTEXT_RULES) {
  const names = Object.keys(rule.forms);
  for (const name of names) {
    const other = names.find((n) => n !== name);
    const entry = {
      tag: rule.tag,
      self: prepForm(rule.forms[name]),
      otherName: other,
      other: prepForm(rule.forms[other]),
    };
    // Một form có thể thuộc nhiều cặp (vd 'dở' vừa đối với 'dỡ' vừa với 'giở').
    if (!CONTEXT_INDEX.has(name)) CONTEXT_INDEX.set(name, []);
    CONTEXT_INDEX.get(name).push(entry);
  }
}

// --- tiện ích ----------------------------------------------------------------

/**
 * Áp kiểu hoa/thường của bản gốc lên chuỗi thay thế.
 * "Nổ lực" -> "Nỗ lực", "NỔ LỰC" -> "NỖ LỰC".
 */
export function applyCase(original, replacement) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Chấm điểm bằng chứng cho MỘT dạng tại vị trí i.
 *
 * Hướng là tín hiệu thật, không phải sự có mặt: "một" đứng trước thì ủng hộ
 * "nửa", nhưng chính từ "một" đó nằm gần "nữa" ở cuối câu lại chẳng nói lên gì.
 * Kề sát (khoảng cách 1) tính gấp đôi vì phần lớn kết hợp tiếng Việt là song tiết.
 */
function scoreForm(tokens, i, form) {
  let score = 0;
  const lo = Math.max(0, i - CUE_WINDOW);
  const hi = Math.min(tokens.length - 1, i + CUE_WINDOW);
  for (let j = lo; j <= hi; j++) {
    if (j === i) continue;
    const list = j < i ? form.before : form.after;
    if (list.has(tokens[j].lower)) score += Math.abs(j - i) === 1 ? 2 : 1;
  }
  return score;
}

/** Chênh lệch điểm tối thiểu để dám báo lỗi ở cặp cân bằng. */
const MARGIN = 2;

// --- tầng 1: cụm sai tuyệt đối -----------------------------------------------

function matchPhrases(tokens, text, taken) {
  const issues = [];
  for (let i = 0; i < tokens.length; i++) {
    if (taken.has(i)) continue;
    // Khớp cụm dài trước để "sữa chửa" thắng "chửa" đứng lẻ.
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      let blocked = false;
      for (let k = i; k < i + n; k++) if (taken.has(k)) { blocked = true; break; }
      if (blocked) continue;

      const slice = tokens.slice(i, i + n);
      const key = slice.map((t) => t.lower).join(' ');
      const hit = PHRASE_INDEX.get(key);
      if (!hit) continue;

      const start = slice[0].start;
      const end = slice[n - 1].end;
      const original = text.slice(start, end);
      issues.push({
        start,
        end,
        original,
        suggestion: applyCase(original, hit.right),
        why: hit.why,
        tag: hit.tag,
        confidence: 0.99,
        source: 'rule',
      });
      for (let k = i; k < i + n; k++) taken.add(k);
      i += n - 1;
      break;
    }
  }
  return issues;
}

// --- tầng 2: cặp đồng âm theo ngữ cảnh ---------------------------------------

function matchContext(tokens, text, taken) {
  const issues = [];
  for (let i = 0; i < tokens.length; i++) {
    if (taken.has(i)) continue;
    const entries = CONTEXT_INDEX.get(tokens[i].lower);
    if (!entries) continue;

    let best = null;
    for (const e of entries) {
      const selfScore = scoreForm(tokens, i, e.self);
      const otherScore = scoreForm(tokens, i, e.other);

      let confidence = 0;
      if (e.self.strict) {
        // Dạng hiếm chỉ sống trong vài kết hợp. Vắng cue của chính nó -> gần
        // như chắc chắn người viết muốn dạng phổ biến kia.
        if (selfScore > 0) continue;
        confidence = otherScore > 0 ? 0.93 : 0.88;
      } else {
        // Cặp cân bằng: chỉ báo khi bằng chứng cho dạng kia ÁP ĐẢO rõ rệt.
        if (otherScore - selfScore < MARGIN) continue;
        confidence = otherScore - selfScore >= 4 ? 0.9 : 0.85;
      }

      if (!best || confidence > best.confidence) {
        best = { entry: e, confidence, otherScore };
      }
    }
    if (!best) continue;

    const tok = tokens[i];
    const original = text.slice(tok.start, tok.end);
    const e = best.entry;
    issues.push({
      start: tok.start,
      end: tok.end,
      original,
      suggestion: applyCase(original, e.otherName),
      why: `"${e.otherName}" — ${e.other.gloss}. "${tokens[i].lower}" — ${e.self.gloss}.`,
      tag: e.tag,
      confidence: best.confidence,
      source: 'rule',
    });
    taken.add(i);
  }
  return issues;
}

// --- gỡ chồng lấn ------------------------------------------------------------

/**
 * Bỏ các issue chồng offset lên nhau. Ưu tiên: span dài hơn, rồi tin cậy cao hơn.
 * Tầng 3 sẽ đẩy issue của model qua đây cùng issue của luật, nên hàm này là
 * điểm hợp nhất duy nhất giữa hai nguồn.
 */
export function dedupe(issues) {
  const sorted = [...issues].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return b.confidence - a.confidence;
  });
  const out = [];
  let lastEnd = -1;
  for (const it of sorted) {
    if (it.start < lastEnd) continue;
    out.push(it);
    lastEnd = it.end;
  }
  return out;
}

// --- API chính ---------------------------------------------------------------

/**
 * @param {string} text
 * @param {{minConfidence?: number, ignored?: Set<string>}} [opts]
 *        ignored: từ người dùng đã bấm "bỏ qua" — từ điển cá nhân.
 * @returns {Issue[]} đã sắp theo vị trí, không chồng lấn
 */
export function checkText(text, opts = {}) {
  const minConfidence = opts.minConfidence ?? 0.8;
  const ignored = opts.ignored ?? new Set();

  const tokens = tokenize(text).filter(isWordLike);
  if (tokens.length === 0) return [];

  const taken = new Set();
  const issues = [
    ...matchPhrases(tokens, text, taken),
    ...matchContext(tokens, text, taken),
  ];

  return dedupe(issues).filter(
    (it) => it.confidence >= minConfidence && !ignored.has(it.original.toLowerCase()),
  );
}

export const RULE_STATS = {
  phrases: PHRASE_RULES.length,
  contextPairs: CONTEXT_RULES.length,
  forms: CONTEXT_INDEX.size,
};

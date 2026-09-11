/**
 * Lõi xử lý âm tiết tiếng Việt.
 *
 * Mọi tầng khác (luật, sinh ứng viên, model) đều dựng trên file này, nên nó
 * phải thuần tuý và không phụ thuộc DOM — file này chạy được cả trong Web
 * Worker lẫn Node (dùng cho test và cho việc đối chiếu với bản Python).
 *
 * Bản Python song song: ml/vi.py — hai bản BẮT BUỘC cho cùng kết quả.
 * test/parity.test.mjs kiểm tra điều đó.
 */

// ---------------------------------------------------------------------------
// Bảng nguyên âm: 12 nguyên âm gốc × 6 thanh điệu
// Thứ tự cột: ngang, huyền, sắc, hỏi, ngã, nặng
// ---------------------------------------------------------------------------

const VOWEL_TABLE = [
  ['a', 'à', 'á', 'ả', 'ã', 'ạ'],
  ['ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ'],
  ['â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ'],
  ['e', 'è', 'é', 'ẻ', 'ẽ', 'ẹ'],
  ['ê', 'ề', 'ế', 'ể', 'ễ', 'ệ'],
  ['i', 'ì', 'í', 'ỉ', 'ĩ', 'ị'],
  ['o', 'ò', 'ó', 'ỏ', 'õ', 'ọ'],
  ['ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ'],
  ['ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ'],
  ['u', 'ù', 'ú', 'ủ', 'ũ', 'ụ'],
  ['ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự'],
  ['y', 'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'],
];

export const TONE = { NGANG: 0, HUYEN: 1, SAC: 2, HOI: 3, NGA: 4, NANG: 5 };
export const TONE_NAMES = ['ngang', 'huyền', 'sắc', 'hỏi', 'ngã', 'nặng'];

/** ký tự có dấu -> { base: chỉ số nguyên âm gốc, tone: chỉ số thanh } */
const CHAR_INFO = new Map();
for (let b = 0; b < VOWEL_TABLE.length; b++) {
  for (let t = 0; t < 6; t++) {
    const ch = VOWEL_TABLE[b][t];
    CHAR_INFO.set(ch, { base: b, tone: t });
    CHAR_INFO.set(ch.toUpperCase(), { base: b, tone: t });
  }
}

const isUpper = (ch) => ch !== ch.toLowerCase();

/** Ghép nguyên âm gốc + thanh, giữ nguyên hoa/thường của ký tự nguồn. */
function composeVowel(baseIdx, toneIdx, upper) {
  const ch = VOWEL_TABLE[baseIdx][toneIdx];
  return upper ? ch.toUpperCase() : ch;
}

/**
 * Thanh điệu của một âm tiết và vị trí ký tự mang dấu.
 * Trả về null nếu âm tiết không chứa nguyên âm nào.
 */
export function getTone(syllable) {
  for (let i = 0; i < syllable.length; i++) {
    const info = CHAR_INFO.get(syllable[i]);
    if (info && info.tone !== TONE.NGANG) return { tone: info.tone, index: i };
  }
  // Không có dấu: xác định vị trí đặt dấu nếu sau này cần đổi thanh.
  const idx = tonePosition(syllable);
  return idx === -1 ? null : { tone: TONE.NGANG, index: idx };
}

/**
 * Vị trí ký tự mang dấu thanh theo quy tắc chính tả hiện hành.
 *
 * Sau khi bỏ nguyên âm lướt của 'qu'/'gi' (chúng thuộc phụ âm đầu, không mang
 * dấu) thì quy tắc thu về đúng hai trường hợp:
 *   - có âm cuối      -> nguyên âm CUỐI       (buồn, tiếng, nguyễn)
 *   - không có âm cuối -> nguyên âm ÁP CHÓT    (mùa, cuối, người, giày)
 * ê và ơ luôn thắng khi có mặt (tiền, người) — kiểm tra riêng cho chắc.
 */
export function tonePosition(syllable) {
  const lower = syllable.toLowerCase();
  const idxs = [];
  for (let i = 0; i < lower.length; i++) {
    if (CHAR_INFO.has(lower[i])) idxs.push(i);
  }
  if (idxs.length === 0) return -1;
  if (idxs.length === 1) return idxs[0];

  // 'qu' và 'gi' là phụ âm đầu — nguyên âm bên trong không mang dấu.
  let vowels = idxs;
  if ((lower.startsWith('qu') || lower.startsWith('gi')) && idxs[0] === 1 && idxs.length > 1) {
    vowels = idxs.slice(1);
  }
  if (vowels.length === 1) return vowels[0];

  // ê và ơ luôn nhận dấu khi có mặt.
  for (const i of vowels) {
    const b = CHAR_INFO.get(lower[i]).base;
    if (VOWEL_TABLE[b][0] === 'ê' || VOWEL_TABLE[b][0] === 'ơ') return i;
  }

  const last = vowels[vowels.length - 1];
  const hasFinalConsonant = last < lower.length - 1;
  return hasFinalConsonant ? last : vowels[vowels.length - 2];
}

/** Đổi thanh điệu của âm tiết. Trả về chuỗi mới. */
export function setTone(syllable, toneIdx) {
  const cur = getTone(syllable);
  if (!cur) return syllable;
  const ch = syllable[cur.index];
  const info = CHAR_INFO.get(ch);
  if (!info) return syllable;
  const replaced = composeVowel(info.base, toneIdx, isUpper(ch));
  return syllable.slice(0, cur.index) + replaced + syllable.slice(cur.index + 1);
}

/** Bỏ toàn bộ dấu thanh (giữ ă â ê ô ơ ư). Dùng để so khớp lỏng. */
export function stripTone(syllable) {
  let out = '';
  for (const ch of syllable) {
    const info = CHAR_INFO.get(ch);
    out += info ? composeVowel(info.base, TONE.NGANG, isUpper(ch)) : ch;
  }
  return out;
}

/** Bỏ hết dấu về ASCII — dùng cho khoá tra cứu và cho đầu vào không dấu. */
export function toAscii(str) {
  const MAP = { a: 'a', 'ă': 'a', 'â': 'a', e: 'e', 'ê': 'e', i: 'i', o: 'o', 'ô': 'o', 'ơ': 'o', u: 'u', 'ư': 'u', y: 'y' };
  let out = '';
  for (const ch of str) {
    const info = CHAR_INFO.get(ch);
    if (info) {
      const base = MAP[VOWEL_TABLE[info.base][0]];
      out += isUpper(ch) ? base.toUpperCase() : base;
    } else if (ch === 'đ') out += 'd';
    else if (ch === 'Đ') out += 'D';
    else out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phụ âm đầu
// ---------------------------------------------------------------------------

/** Sắp theo độ dài giảm dần để luôn khớp dài nhất trước ('ngh' trước 'ng'). */
const INITIALS = [
  'ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'th', 'tr', 'qu',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x',
];

/**
 * Tách âm tiết thành { initial, rime }.
 * 'gi' và 'qu' được coi là phụ âm đầu, trừ khi phần còn lại rỗng
 * ('gì' = gi + ì, nhưng 'gi' đứng một mình thì rime rỗng nên giữ nguyên).
 */
export function splitSyllable(syllable) {
  const lower = syllable.toLowerCase();
  for (const init of INITIALS) {
    if (!lower.startsWith(init)) continue;
    const rime = syllable.slice(init.length);
    // 'gi'/'qu' cần còn nguyên âm phía sau mới tính là phụ âm đầu.
    if ((init === 'gi' || init === 'qu') && !hasVowel(rime)) continue;
    return { initial: syllable.slice(0, init.length), rime };
  }
  return { initial: '', rime: syllable };
}

function hasVowel(str) {
  for (const ch of str) if (CHAR_INFO.has(ch)) return true;
  return false;
}

/** Giữ kiểu hoa/thường của phụ âm đầu cũ khi thay bằng phụ âm mới. */
function matchCase(sample, replacement) {
  if (!sample) return replacement;
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (isUpper(sample[0])) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Thay phụ âm đầu, có xử lý ràng buộc chính tả:
 *  - c / k / q  cùng một âm vị: c trước a ă â o ô ơ u ư, k trước e ê i y
 *  - g / gh, ng / ngh: dạng có 'h' đứng trước e ê i
 *  - gi + i  ->  gi   ('dì' -> 'gì', không phải 'giì')
 */
export function setInitial(syllable, newInitial) {
  const { initial, rime } = splitSyllable(syllable);
  let init = newInitial;
  let body = rime;

  const firstVowel = [...rime].find((c) => CHAR_INFO.has(c));
  const frontVowel = firstVowel
    ? ['e', 'ê', 'i', 'y'].includes(VOWEL_TABLE[CHAR_INFO.get(firstVowel).base][0])
    : false;

  if (init === 'c' || init === 'k') init = frontVowel ? 'k' : 'c';
  if (init === 'g' || init === 'gh') init = frontVowel ? 'gh' : 'g';
  if (init === 'ng' || init === 'ngh') init = frontVowel ? 'ngh' : 'ng';

  // gi + i... : nuốt một chữ i ('dì' -> 'gì', 'diết' -> 'giết' giữ nguyên)
  if (init === 'gi' && firstVowel) {
    const info = CHAR_INFO.get(body[0]);
    if (info && VOWEL_TABLE[info.base][0] === 'i') body = body.slice(1) || body;
  }

  return matchCase(initial || syllable, init) + body;
}

// ---------------------------------------------------------------------------
// Âm cuối
// ---------------------------------------------------------------------------

const FINALS = ['nh', 'ng', 'ch', 'c', 'm', 'n', 'p', 't'];

export function getFinal(syllable) {
  const lower = syllable.toLowerCase();
  for (const f of FINALS) {
    if (lower.endsWith(f)) return f;
  }
  return '';
}

export function setFinal(syllable, newFinal) {
  const cur = getFinal(syllable);
  const stem = cur ? syllable.slice(0, syllable.length - cur.length) : syllable;
  return stem + newFinal;
}

// ---------------------------------------------------------------------------
// Bộ nhãn biến đổi
//
// Model KHÔNG dự đoán từ — nó dự đoán một nhãn trong tập cố định dưới đây.
// Hệ quả: không gian đầu ra bé, model nhẹ, tổng quát hoá được sang từ chưa gặp,
// và về mặt cấu trúc KHÔNG THỂ sinh ra từ nằm ngoài tập ứng viên.
// ---------------------------------------------------------------------------

/** Mỗi nhãn: hàm biến đổi + mô tả hiển thị cho người dùng. */
export const TAGS = {
  KEEP: { apply: (s) => s, label: 'giữ nguyên' },

  HOI_NGA: { apply: (s) => setTone(s, TONE.NGA), label: 'hỏi → ngã', group: 'thanh' },
  NGA_HOI: { apply: (s) => setTone(s, TONE.HOI), label: 'ngã → hỏi', group: 'thanh' },

  L_N: { apply: (s) => setInitial(s, 'n'), label: 'l → n', group: 'phụ âm đầu' },
  N_L: { apply: (s) => setInitial(s, 'l'), label: 'n → l', group: 'phụ âm đầu' },

  CH_TR: { apply: (s) => setInitial(s, 'tr'), label: 'ch → tr', group: 'phụ âm đầu' },
  TR_CH: { apply: (s) => setInitial(s, 'ch'), label: 'tr → ch', group: 'phụ âm đầu' },

  S_X: { apply: (s) => setInitial(s, 'x'), label: 's → x', group: 'phụ âm đầu' },
  X_S: { apply: (s) => setInitial(s, 's'), label: 'x → s', group: 'phụ âm đầu' },

  D_GI: { apply: (s) => setInitial(s, 'gi'), label: 'd → gi', group: 'phụ âm đầu' },
  GI_D: { apply: (s) => setInitial(s, 'd'), label: 'gi → d', group: 'phụ âm đầu' },
  D_R: { apply: (s) => setInitial(s, 'r'), label: 'd → r', group: 'phụ âm đầu' },
  R_D: { apply: (s) => setInitial(s, 'd'), label: 'r → d', group: 'phụ âm đầu' },
  GI_R: { apply: (s) => setInitial(s, 'r'), label: 'gi → r', group: 'phụ âm đầu' },
  R_GI: { apply: (s) => setInitial(s, 'gi'), label: 'r → gi', group: 'phụ âm đầu' },

  N_NG: { apply: (s) => setFinal(s, 'ng'), label: 'n → ng (cuối)', group: 'âm cuối' },
  NG_N: { apply: (s) => setFinal(s, 'n'), label: 'ng → n (cuối)', group: 'âm cuối' },
  C_T: { apply: (s) => setFinal(s, 't'), label: 'c → t (cuối)', group: 'âm cuối' },
  T_C: { apply: (s) => setFinal(s, 'c'), label: 't → c (cuối)', group: 'âm cuối' },
};

export const TAG_NAMES = Object.keys(TAGS);
export const TAG_INDEX = Object.fromEntries(TAG_NAMES.map((t, i) => [t, i]));

/**
 * Nhãn nào ÁP DỤNG ĐƯỢC cho âm tiết này.
 *
 * Đây là "tầng 2" trong pipeline: thu hẹp không gian đầu ra trước khi gọi model.
 * Một nhãn chỉ hợp lệ khi nó thực sự đổi được chuỗi VÀ kết quả nằm trong từ
 * điển âm tiết (nếu có truyền vào).
 */
export function applicableTags(syllable, lexicon = null) {
  const out = ['KEEP'];
  const tone = getTone(syllable);
  const { initial } = splitSyllable(syllable);
  const init = initial.toLowerCase();
  const final = getFinal(syllable);

  const consider = (name) => {
    const next = TAGS[name].apply(syllable);
    if (next === syllable) return;
    if (lexicon && !lexicon.has(next.toLowerCase())) return;
    out.push(name);
  };

  if (tone && tone.tone === TONE.HOI) consider('HOI_NGA');
  if (tone && tone.tone === TONE.NGA) consider('NGA_HOI');

  if (init === 'l') consider('L_N');
  if (init === 'n') consider('N_L');
  if (init === 'ch') consider('CH_TR');
  if (init === 'tr') consider('TR_CH');
  if (init === 's') consider('S_X');
  if (init === 'x') consider('X_S');
  if (init === 'd') { consider('D_GI'); consider('D_R'); }
  if (init === 'gi') { consider('GI_D'); consider('GI_R'); }
  if (init === 'r') { consider('R_D'); consider('R_GI'); }

  if (final === 'n') consider('N_NG');
  if (final === 'ng') consider('NG_N');
  if (final === 'c') consider('C_T');
  if (final === 't') consider('T_C');

  return out;
}

// ---------------------------------------------------------------------------
// Tách token có giữ vị trí
// ---------------------------------------------------------------------------

// Chỉ chữ cái và dấu phụ — cố tình không lấy chữ số và gạch dưới, để khớp
// đúng với ml/vi.py (Python `re` không có \p{L}). Lệch tokenizer giữa lúc
// train và lúc chạy là lỗi im lặng, rất khó truy.
const WORD_RE = /[\p{L}\p{M}]+/gu;

/**
 * Tách văn bản thành token kèm offset gốc.
 * Offset là bắt buộc: tầng DOM cần nó để vẽ gạch chân đúng chỗ.
 */
export function tokenize(text) {
  const tokens = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** True nếu token trông như từ tiếng Việt (không phải số, mã, URL...). */
export function isWordLike(token) {
  return /^[\p{L}\p{M}]+$/u.test(token.text);
}

/**
 * Tầng 3 — chấm điểm bằng model ONNX chạy ngay trong trình duyệt.
 *
 * Trả về ĐÚNG cấu trúc Issue mà ruleEngine trả về, để index.js gộp hai nguồn
 * qua cùng một hàm dedupe() mà không cần biết issue đến từ đâu.
 *
 * Ba ràng buộc quyết định thiết kế:
 *
 *  1. KHÔNG BAO GIỜ được bịa. Model chỉ được chọn trong applicableTags(token,
 *     lexicon) — cùng tập ứng viên đã dùng lúc sinh dữ liệu train. Nhãn nào
 *     nằm ngoài tập đó bị che logit về -Infinity trước khi softmax.
 *
 *  2. Precision quan trọng hơn recall. Ngưỡng mặc định cao, và còn phải hơn
 *     KEEP một biên rõ rệt mới dám báo.
 *
 *  3. Model chưa nạp xong thì im lặng trả mảng rỗng — tầng luật vẫn hoạt động
 *     bình thường.
 *
 *     Chỗ này từng ghi "Không chặn luồng gõ. Chạy trong Web Worker". CẢ HAI VẾ
 *     ĐỀU SAI và đã sai từ đầu: không có Worker nào trong repo này, và
 *     `ort.env.wasm.proxy` không bật, nên `session.run` giữ luồng chính của
 *     trang suốt lượt chạy — 48ms cho một bài 280 ký tự, đo bằng
 *     `dev/bench-blocking.html`. Ai gọi check() nhiều lượt liên tiếp thì PHẢI
 *     tự nhả luồng giữa hai lượt; `await` không tự nhả cho ai cả.
 */

import { applicableTags, getTone, TAGS, TAG_NAMES, TONE, tokenize, isWordLike } from './vi.js';
import { loadTokenizer } from './bpe.js';

// 0.95 chứ không phải 0.90, và hai thay đổi này ĐI LIỀN NHAU: lượng tử hoá
// per-channel trả lại phần xác suất mà per-tensor làm tụt, nên ngưỡng cũ 0.90
// bỗng trở nên lỏng hơn ý định ban đầu. Nâng lên 0.95 giữ precision đúng mức
// cũ (0.9550 so với 0.9556) mà vẫn thu thêm 1,2 điểm recall.
//
// Đổi một mình per-channel mà quên ngưỡng thì precision tụt xuống 0.9420 —
// vẫn là đánh đổi hợp lý với nhiều người, nhưng KHÔNG phải đánh đổi mà sản
// phẩm này chọn.
const DEFAULT_THRESHOLD = 0.95;
const DEFAULT_MARGIN = 0.25;   // phải hơn KEEP ít nhất chừng này
const MAX_LEN = 128;

// Lớp phụ âm được hạ ngưỡng riêng xuống 0.90, thanh điệu giữ 0.95 (quyết định
// 29). Không phải chỉnh cho đẹp số: consonant_diagnose.py đo được 244 ca d/gi/r
// mà nhãn ĐÚNG đã dẫn đầu nhưng chưa vượt 0.95 — model biết mà chưa dám nói.
//
// Cái giá, đo rồi chứ không đoán: precision VSEC 0.9749 -> 0.9709, báo oan trên
// văn bản đúng 1.30%/1.00% -> 1.35%/1.05%. Đổi lại recall phụ âm 43.3% -> 48.2%
// và riêng d/gi/r 28.5% -> 33.9%.
//
// Chiều NGƯỢC LẠI đã thử và đã bỏ (quyết định 26): hạ thanh điệu xuống 0.85 làm
// báo oan lên 1.65%/1.75%. Lớp thanh điệu chiếm 91% lỗi thật nên nó nhạy hơn
// hẳn — đừng đụng vào 0.95 ở trên mà không đo lại cả ba phép đo.
const DEFAULT_CONSONANT_THRESHOLD = 0.90;
const CONSONANT_TAGS = [
  'L_N', 'N_L', 'CH_TR', 'TR_CH', 'S_X', 'X_S',
  'D_GI', 'GI_D', 'D_R', 'R_D', 'GI_R', 'R_GI',
  'N_NG', 'NG_N', 'C_T', 'T_C',
];

/** Bảng nhãn -> ngưỡng. Bản Python tương ứng: gate.thresholds_for(). */
export function thresholdsFor(base = DEFAULT_THRESHOLD,
  consonant = DEFAULT_CONSONANT_THRESHOLD) {
  const table = {};
  for (const t of TAG_NAMES) if (t !== 'KEEP') table[t] = base;
  if (consonant !== null) for (const t of CONSONANT_TAGS) table[t] = consonant;
  return table;
}

export class OnnxEngine {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.margin = opts.margin ?? DEFAULT_MARGIN;
    // Ngưỡng riêng theo nhãn. Mặc định là BẢNG ĐANG SHIP (phụ âm 0.90, thanh
    // điệu 0.95). Truyền `thresholds: null` tường minh để quay về một ngưỡng
    // dùng chung — cần khi dựng lại con số của cấu hình cũ.
    // Bản Python tương ứng: gate.prod_thresholds(). test/gate.test.mjs canh cho
    // hai bên khớp nhau từng nhãn.
    this.thresholds = opts.thresholds === undefined
      ? thresholdsFor(this.threshold)
      : opts.thresholds;
    this.maxLen = opts.maxLen ?? MAX_LEN;
    this.ready = false;
    this.session = null;
    this.tokenizer = null;
    this.lexicon = null;
    this.tagNames = TAG_NAMES;
    this._loading = null;
  }

  /**
   * Nạp model. Gọi được nhiều lần — lần sau dùng lại promise cũ.
   * @param {{ort: string, model: string, tokenizer: string, lexicon: string}} urls
   */
  load(urls) {
    if (this._loading) return this._loading;
    this._loading = this._load(urls).catch((err) => {
      // Model hỏng thì sản phẩm vẫn phải chạy bằng tầng luật.
      console.warn('[soát] không nạp được model, chỉ dùng tầng luật:', err.message);
      this.ready = false;
      return false;
    });
    return this._loading;
  }

  async _load(urls) {
    // import() động phân giải đường dẫn tương đối theo URL của CHÍNH MODULE
    // NÀY, không theo trang đang mở. Trong extension thì chrome.runtime.getURL
    // đã trả URL tuyệt đối nên không lộ, nhưng ở trang thử thì lệch thư mục.
    // Quy về tuyệt đối để cả hai nơi hành xử giống nhau.
    const ortUrl = new URL(urls.ort, self.location.href).href;
    const ort = await import(ortUrl);

    // Đóng gói kèm extension — MV3 cấm nạp code từ xa.
    // wasmPaths cũng phải tuyệt đối: onnxruntime nối chuỗi này với tên file
    // rồi import, nên đường dẫn tương đối sẽ bị phân giải sai thư mục.
    ort.env.wasm.wasmPaths = new URL(urls.wasmDir, self.location.href).href;
    // Luồng wasm cần SharedArrayBuffer, mà SAB đòi header COOP/COEP của
    // TRANG CHỦ — thứ một content script không kiểm soát được. Chạy một luồng.
    ort.env.wasm.numThreads = 1;

    const [session, tokenizer, lexicon, meta] = await Promise.all([
      ort.InferenceSession.create(urls.model, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }),
      loadTokenizer(urls.tokenizer),
      fetch(urls.lexicon).then((r) => r.json()),
      urls.meta ? fetch(urls.meta).then((r) => r.json()) : Promise.resolve(null),
    ]);

    this.ort = ort;
    this.session = session;
    this.tokenizer = tokenizer;
    this.lexicon = new Set(lexicon);
    if (meta) {
      this.tagNames = meta.tags ?? TAG_NAMES;
      this.maxLen = meta.max_len ?? this.maxLen;
    }

    // Bộ nhãn của model và của JS phải trùng cả nội dung lẫn THỨ TỰ — lệch
    // thứ tự là mọi dự đoán sai âm thầm, không có lỗi nào được ném ra.
    if (this.tagNames.length !== TAG_NAMES.length
        || this.tagNames.some((t, i) => t !== TAG_NAMES[i])) {
      throw new Error('bộ nhãn của model không khớp vi.js');
    }

    this.ready = true;
    return true;
  }

  /**
   * Soát một đoạn văn bản.
   * @returns {Promise<Array>} Issue[] — rỗng nếu model chưa sẵn sàng
   */
  async check(text) {
    if (!this.ready) return [];

    const spans = tokenize(text).filter(isWordLike);
    if (spans.length === 0) return [];

    const words = spans.map((s) => s.text);
    const { ids, wordIds } = this.tokenizer.encodeWords(words, this.maxLen);
    const firstIdx = this.tokenizer.firstSubwordIndex(wordIds, words.length);

    const n = ids.length;
    const feeds = {
      input_ids: new this.ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, n]),
      attention_mask: new this.ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]),
    };

    const out = await this.session.run(feeds);
    const logits = out.logits ?? out[Object.keys(out)[0]];
    const nTags = this.tagNames.length;
    const data = logits.data;

    const issues = [];
    for (let w = 0; w < words.length; w++) {
      const pos = firstIdx[w];
      if (pos < 0) continue;                       // từ bị cắt vì vượt maxLen

      const token = words[w];
      const allowed = applicableTags(token, this.lexicon);
      if (allowed.length <= 1) continue;           // chỉ còn KEEP, không có gì để đề xuất

      const issue = this._decode(data, pos * nTags, nTags, token, allowed);
      if (!issue) continue;

      issues.push({
        start: spans[w].start,
        end: spans[w].end,
        original: token,
        suggestion: issue.suggestion,
        why: `Model đề xuất "${issue.suggestion}" (${Math.round(issue.prob * 100)}%).`,
        tag: tagGroup(issue.tag, token, issue.suggestion),
        confidence: issue.prob,
        source: 'model',
      });
    }
    return issues;
  }

  /** Softmax CHỈ trên tập nhãn hợp lệ, rồi áp ngưỡng và biên so với KEEP. */
  _decode(data, offset, nTags, token, allowed) {
    const allowedSet = new Set(allowed);
    let max = -Infinity;
    for (let t = 0; t < nTags; t++) {
      if (!allowedSet.has(this.tagNames[t])) continue;
      const v = data[offset + t];
      if (v > max) max = v;
    }

    let sum = 0;
    const exp = new Float64Array(nTags);
    for (let t = 0; t < nTags; t++) {
      if (!allowedSet.has(this.tagNames[t])) continue;
      exp[t] = Math.exp(data[offset + t] - max);
      sum += exp[t];
    }

    const keepIdx = this.tagNames.indexOf('KEEP');
    const keepProb = exp[keepIdx] / sum;

    let bestIdx = -1;
    let bestProb = 0;
    for (let t = 0; t < nTags; t++) {
      if (t === keepIdx || !allowedSet.has(this.tagNames[t])) continue;
      const p = exp[t] / sum;
      if (p > bestProb) {
        bestProb = p;
        bestIdx = t;
      }
    }

    if (bestIdx < 0) return null;
    const tag = this.tagNames[bestIdx];
    // Ngưỡng tra SAU khi đã chọn nhãn mạnh nhất, không phải trước. Cách kia —
    // xét từng nhãn với ngưỡng riêng rồi lấy nhãn tốt nhất trong đám vượt được
    // — làm việc hạ ngưỡng một lớp có thể đổi cả ĐỀ XUẤT, chứ không chỉ đổi
    // chuyện có báo hay không. Giữ thế này thì đề xuất luôn là lựa chọn số một
    // của model, và bảng ngưỡng chỉ quyết định có dám nói ra hay không.
    const bar = (this.thresholds && this.thresholds[tag] !== undefined)
      ? this.thresholds[tag]
      : this.threshold;
    if (bestProb < bar) return null;
    if (bestProb - keepProb < this.margin) return null;

    const suggestion = TAGS[tag].apply(token);
    if (suggestion === token) return null;

    return { tag, suggestion, prob: bestProb };
  }
}

/**
 * Quy nhãn model về nhóm hiển thị.
 *
 * Nhãn TONE_* KHÔNG quy được về một nhóm cố định — phải nhìn cả thanh gốc.
 * TONE_NGA vừa có thể là "viết hỏi đáng lẽ ngã" (lỗi kiến thức) vừa là "quên
 * bỏ dấu" (lỗi gõ phím), và đó là hai nhóm khác hẳn nhau với người dùng.
 *
 * Bản đầu gán mọi TONE_* vào 'hoi-nga'. Sau khi đo được phân bố thật thì đó là
 * sai rõ ràng: chỉ 4.7% lỗi là hỏi/ngã, còn 87% là mất dấu hoặc sai dấu — tức
 * thống kê tuần sẽ báo "bạn sai hỏi/ngã 23 lần" trong khi hầu hết không phải.
 */
export function tagGroup(tag, original, suggestion) {
  if (tag.startsWith('TONE_')) {
    const from = getTone(original);
    const to = getTone(suggestion);
    const f = from ? from.tone : null;
    const t = to ? to.tone : null;
    const isHoiNga = (x) => x === TONE.HOI || x === TONE.NGA;
    if (isHoiNga(f) && isHoiNga(t)) return 'hoi-nga';
    if (f === TONE.NGANG && t !== TONE.NGANG) return 'thieu-dau';
    return 'sai-dau';
  }
  if (tag === 'CH_TR' || tag === 'TR_CH') return 'ch-tr';
  if (tag === 'S_X' || tag === 'X_S') return 's-x';
  if (tag.startsWith('D_') || tag.startsWith('GI_') || tag.startsWith('R_')) return 'd-gi-r';
  if (['N_NG', 'NG_N', 'C_T', 'T_C'].includes(tag)) return 'n-ng';
  return 'chinh-ta';
}

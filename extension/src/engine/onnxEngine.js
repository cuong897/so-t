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
 *  3. Không chặn luồng gõ. Chạy trong Web Worker; nếu model chưa nạp xong thì
 *     im lặng trả mảng rỗng — tầng luật vẫn hoạt động bình thường.
 */

import { applicableTags, TAGS, TAG_NAMES, tokenize, isWordLike } from './vi.js';
import { loadTokenizer } from './bpe.js';

const DEFAULT_THRESHOLD = 0.90;
const DEFAULT_MARGIN = 0.25;   // phải hơn KEEP ít nhất chừng này
const MAX_LEN = 128;

export class OnnxEngine {
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.margin = opts.margin ?? DEFAULT_MARGIN;
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
        tag: tagGroup(issue.tag),
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
    if (bestProb < this.threshold) return null;
    if (bestProb - keepProb < this.margin) return null;

    const tag = this.tagNames[bestIdx];
    const suggestion = TAGS[tag].apply(token);
    if (suggestion === token) return null;

    return { tag, suggestion, prob: bestProb };
  }
}

/** Quy nhãn model về nhóm hiển thị mà tooltip đã biết. */
function tagGroup(tag) {
  if (tag.startsWith('TONE_')) return 'hoi-nga';
  if (tag === 'CH_TR' || tag === 'TR_CH') return 'ch-tr';
  if (tag === 'S_X' || tag === 'X_S') return 's-x';
  if (tag.startsWith('D_') || tag.startsWith('GI_') || tag.startsWith('R_')) return 'd-gi-r';
  if (['N_NG', 'NG_N', 'C_T', 'T_C'].includes(tag)) return 'n-ng';
  return 'chinh-ta';
}

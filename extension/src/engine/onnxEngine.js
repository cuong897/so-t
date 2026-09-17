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
// 'F2' — cửa sổ trượt 64 subword, bước 32, cho câu dài quá cửa sổ (thường là văn
// bản không chấm câu). Chọn bằng luật ghi trước ở quyết định 34 (35fbf45), trên
// 216 bài không dấu câu và 40 văn bản mỗi cỡ, so bản cũ đo cùng lượt:
//   F2   precision 0,9671 · câu sạch bị gạch 0,87% · đứng hình p90 x0,75–1,09
//   F2s  precision 0,9586 · câu sạch bị gạch 1,16% · đứng hình p90 x0,63–1,04
//   none precision 0,9419 · recall 0,1553 (cắt cụt — bản đang ship trước đây)
// Cả F2 và F2s đều qua; luật chọn ít câu sạch bị gạch oan nhất. F2s đứng hình ít
// hơn — nếu muốn đổi sang nó thì đổi LUẬT trước, cho một đợt đo sau.
// Quyết định 33 từng giữ 'none' vì một điều kiện đứng hình đặt sai; xem 34.
const DEFAULT_FALLBACK = 'F2';

// Các ứng viên đường lui, mỗi cái cố định TRƯỚC đợt đo của nó — đừng chỉnh các
// số này để một phép đo đẹp lên rồi quên ghi lại.
const F1_PIECE = 40;           // quyết định 33: cắt cứng ở ranh giới từ, mảnh <= 40 subword
const SLIDING = {
  F2: { window: 64, stride: 32 },    // quyết định 33
  // Quyết định 34. Cửa sổ nhỏ hơn thì mỗi lượt chạy ngắn hơn (đỉnh đứng hình
  // thấp hơn) và mọi từ nằm nông hơn trong cửa sổ — nhưng ít ngữ cảnh hơn.
  // Chưa biết cái nào thắng; đó là lý do nó là một ứng viên chứ không phải một sửa.
  F2s: { window: 48, stride: 24 },
};

// Ranh giới câu nằm ở KHOẢNG TRỐNG giữa hai từ liền nhau. tokenize() chỉ trả từ,
// không trả dấu câu, nên nhìn vào khoảng trống là cách duy nhất vừa tách được câu
// vừa giữ nguyên offset gốc để vẽ gạch chân.
const SENTENCE_GAP = /[.!?…\n]/;

/**
 * Chia các span từ thành câu. Trả mảng [đầu, cuối) theo chỉ số span.
 * "TP.HCM" thành hai câu — tách thừa chỉ làm câu ngắn hơn, tức model đọc ở vị
 * trí nông hơn, không bao giờ làm tệ đi (quyết định 32).
 */
export function splitSentences(text, spans) {
  const out = [];
  let from = 0;
  for (let i = 1; i < spans.length; i++) {
    if (SENTENCE_GAP.test(text.slice(spans[i - 1].end, spans[i].start))) {
      out.push([from, i]);
      from = i;
    }
  }
  if (spans.length) out.push([from, spans.length]);
  return out;
}

/**
 * Lên kế hoạch các lượt chạy cho MỘT câu, theo số subword của từng từ.
 * Trả [{from, to}] theo chỉ số từ TRONG câu. Không bao giờ chia giữa một từ.
 *   budget : số subword tối đa cho nội dung (maxLen trừ <s> và </s>)
 */
export function planRuns(pieceCounts, budget, fallback) {
  const total = pieceCounts.reduce((a, b) => a + b, 0);
  const n = pieceCounts.length;
  if (total <= budget || fallback === 'none') return [{ from: 0, to: n }];

  if (fallback === 'F1') {
    const size = Math.min(F1_PIECE, budget);
    const out = [];
    let from = 0; let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > from && acc + pieceCounts[i] > size) { out.push({ from, to: i }); from = i; acc = 0; }
      acc += pieceCounts[i];
    }
    out.push({ from, to: n });
    return out;
  }

  if (SLIDING[fallback]) {
    const { window: size, stride } = SLIDING[fallback];
    const win = Math.min(size, budget);
    const offs = [0];                      // offset subword của đầu mỗi từ
    for (const c of pieceCounts) offs.push(offs[offs.length - 1] + c);
    const out = [];
    let from = 0;
    for (;;) {
      let to = from;
      while (to < n && (to === from || offs[to + 1] - offs[from] <= win)) to++;
      out.push({ from, to });
      if (to >= n) break;
      const target = offs[from] + stride;
      let next = from + 1;
      while (next < n && offs[next] < target) next++;
      from = Math.min(next, to);           // luôn tiến, và không bỏ sót từ nào
    }
    return out;
  }

  throw new Error(`fallback không hợp lệ: ${fallback}`);
}

// Nhả luồng chính. MessageChannel chứ không setTimeout: setTimeout lồng nhau bị
// kẹp tối thiểu 4ms, và ở tab nền bị bóp tới 1 giây một lần.
function yieldToMain() {
  if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
  });
}

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
    // Đường lui cho một "câu" dài quá cửa sổ — thường là văn bản không chấm câu.
    // 'F1' cắt cứng, 'F2'/'F2s' cửa sổ trượt, 'none' giữ hành vi cũ (chỉ chấm cửa
    // sổ đầu). Quyết định 33 và 34 chọn giữa chúng bằng phép đo, không bằng ý thích.
    this.fallback = opts.fallback ?? DEFAULT_FALLBACK;
    // Bộ nhớ đệm LOGIT theo nội dung câu, không phải kết quả đã qua ngưỡng — để
    // đổi ngưỡng trên một instance đang chạy vẫn ra đúng, không phải xoá cache.
    this.cacheSize = opts.cacheSize ?? 400;
    this._cache = new Map();
    this.stats = { runs: 0, cacheHits: 0 };
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
   *
   * Chấm TỪNG CÂU một, không nhét cả văn bản vào một cửa sổ (quyết định 32,
   * 33). Hai lý do, đều đã đo:
   *  - bản cũ cắt cụt ở maxLen, bỏ qua 42% bài 700 ký tự và 93% bài 6.000;
   *  - từ nằm sâu trong cửa sổ bị chấm tệ hơn hẳn — recall 0,7426 khi câu đứng
   *    một mình, 0,6202 khi câu nằm cuối cửa sổ. Mọi phép đo offline chấm câu
   *    đứng một mình, nên giờ sản phẩm đi đúng đường của phép đo.
   *
   * @param {string} text
   * @param {{signal?: {aborted: boolean}}} [opts] signal.aborted = true thì dừng
   *        sau lượt đang chạy và trả mảng rỗng — người gọi đã không cần nữa.
   * @returns {Promise<Array>} Issue[] đã sắp theo vị trí — rỗng nếu model chưa
   *          sẵn sàng hoặc bị huỷ
   */
  async check(text, opts = {}) {
    if (!this.ready) return [];
    const signal = opts.signal;

    const spans = tokenize(text).filter(isWordLike);
    if (spans.length === 0) return [];

    const issues = [];
    let ran = false;
    for (const [from, to] of splitSentences(text, spans)) {
      const words = spans.slice(from, to).map((s) => s.text);
      const key = `${this.fallback}\u0000${this.maxLen}\u0000${words.join(' ')}`;

      let rows = this._cacheGet(key);
      if (!rows) {
        if (signal?.aborted) return [];
        // Nhả luồng TRƯỚC mỗi lượt chạy trừ lượt đầu: lượt đầu chạy ngay để bài
        // ngắn không trễ thêm, các lượt sau nhường cho phím gõ và việc vẽ.
        if (ran) {
          await yieldToMain();
          if (signal?.aborted) return [];
        }
        rows = await this._scoreSentence(words, signal);
        if (!rows) return [];                      // bị huỷ giữa câu — KHÔNG cache nửa chừng
        this._cachePut(key, rows);
        ran = true;
      } else {
        this.stats.cacheHits++;
      }

      for (let w = 0; w < words.length; w++) {
        if (!rows[w]) continue;                    // bị cắt, hoặc chỉ còn KEEP
        const token = words[w];
        const issue = this._decode(rows[w].logits, 0, this.tagNames.length, token, rows[w].allowed);
        if (!issue) continue;

        const span = spans[from + w];
        issues.push({
          start: span.start,
          end: span.end,
          original: token,
          suggestion: issue.suggestion,
          why: `Model đề xuất "${issue.suggestion}" (${Math.round(issue.prob * 100)}%).`,
          tag: tagGroup(issue.tag, token, issue.suggestion),
          confidence: issue.prob,
          source: 'model',
        });
      }
    }
    return issues;
  }

  /**
   * Chạy model cho một câu. Trả mảng theo từ: {logits, allowed} ở subword đầu
   * của từ đó, hoặc null nếu từ không có ứng viên nào ngoài KEEP hay không được
   * lượt chạy nào phủ tới. Trả null nếu bị huỷ giữa chừng.
   */
  async _scoreSentence(words, signal) {
    const nTags = this.tagNames.length;
    const counts = words.map((w) => this.tokenizer.bpe(w).length);
    const runs = planRuns(counts, this.maxLen - 2, this.fallback);

    const offs = [0];
    for (const c of counts) offs.push(offs[offs.length - 1] + c);

    const rows = new Array(words.length).fill(null);
    const best = new Array(words.length).fill(-1);   // độ "ở giữa" của cửa sổ đã chọn

    for (let r = 0; r < runs.length; r++) {
      if (r > 0) {
        await yieldToMain();
        if (signal?.aborted) return null;
      }
      const { from, to } = runs[r];
      const part = words.slice(from, to);
      const { ids, wordIds } = this.tokenizer.encodeWords(part, this.maxLen);
      const first = this.tokenizer.firstSubwordIndex(wordIds, part.length);

      const n = ids.length;
      const out = await this.session.run({
        input_ids: new this.ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, n]),
        attention_mask: new this.ort.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]),
      });
      this.stats.runs++;
      const data = (out.logits ?? out[Object.keys(out)[0]]).data;

      for (let i = 0; i < part.length; i++) {
        if (first[i] < 0) continue;
        const w = from + i;
        // Một từ nằm trong nhiều cửa sổ (F2) thì lấy cửa sổ nó ở GIỮA nhất —
        // xa cả hai mép, tức có ngữ cảnh ở cả hai bên.
        const centred = Math.min(offs[w] - offs[from], offs[to] - offs[w + 1]);
        if (centred <= best[w]) continue;

        const allowed = applicableTags(words[w], this.lexicon);
        if (allowed.length <= 1) continue;
        rows[w] = { logits: data.slice(first[i] * nTags, first[i] * nTags + nTags), allowed };
        best[w] = centred;
      }
    }
    return rows;
  }

  _cacheGet(key) {
    const hit = this._cache.get(key);
    if (hit) { this._cache.delete(key); this._cache.set(key, hit); }  // làm mới thứ tự LRU
    return hit;
  }

  _cachePut(key, rows) {
    this._cache.set(key, rows);
    while (this._cache.size > this.cacheSize) {
      this._cache.delete(this._cache.keys().next().value);
    }
  }

  clearCache() { this._cache.clear(); }

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

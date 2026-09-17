/**
 * Hàng đợi chấm cho MỘT phiên onnxruntime dùng chung cả trình duyệt (quyết định 38).
 *
 * Trước offscreen, mỗi tab có OnnxEngine riêng và `signal` của index.js huỷ lượt cũ
 * khi văn bản đổi. Giờ mọi tab gửi về cùng một engine, nên hai việc đó chuyển về đây:
 *
 *  1. XẾP HÀNG. Hai tab chấm cùng lúc không được chen nhau vào session.run — check()
 *     nhả luồng giữa các câu, và một lượt chen vào giữa lượt kia là thứ onnxruntime
 *     không hứa sẽ đúng. Chạy lần lượt thì dễ lập luận, và tổng thời gian như nhau
 *     vì chỉ có một luồng wasm.
 *  2. HUỶ theo Ô. Mỗi ô (tab + frame + ô) có `key`; mỗi lần gửi tăng `seq`. Lượt mới
 *     tới thì lượt cũ của cùng ô dừng ở lần nhả luồng kế tiếp, hoặc không chạy luôn nếu
 *     còn đang xếp hàng — gõ liên tục vào một bài dài không được chất hàng đợi lên.
 *
 * Không đụng chrome.* hay Worker để test được bằng node với engine giả.
 */

// Mỗi ô từng gửi để lại một mục. Chặn trên để một phiên trình duyệt dài không làm
// Map này lớn mãi — mục cũ nhất là ô đã rời đi từ lâu.
const MAX_KEYS = 1000;

/**
 * @param {{check: Function, stats: {runs: number, cacheHits: number}}} engine
 * @param {Promise<boolean>} ready  kết quả engine.load()
 */
export function createCheckService(engine, ready) {
  const latest = new Map();   // key -> seq mới nhất đã nhận
  let chain = Promise.resolve();

  const isStale = (key, seq) => latest.get(key) !== seq;

  function handle({ key, seq, text }) {
    // Ghi seq NGAY khi nhận, trước khi xếp hàng: lượt đang chạy của cùng ô phải thấy
    // mình đã cũ ở lần nhả luồng kế tiếp, không phải đợi tới lượt của lượt mới.
    const prev = latest.get(key);
    if (prev !== undefined && prev > seq) return Promise.resolve({ ok: false, aborted: true });
    latest.delete(key);                     // đưa về cuối thứ tự chèn
    latest.set(key, seq);
    while (latest.size > MAX_KEYS) latest.delete(latest.keys().next().value);

    const run = async () => {
      if (!(await ready)) return { ok: false, error: 'model không nạp được' };
      if (isStale(key, seq)) return { ok: false, aborted: true };
      const runs0 = engine.stats.runs;
      const hits0 = engine.stats.cacheHits;
      const signal = { get aborted() { return isStale(key, seq); } };
      const issues = await engine.check(text, { signal });
      if (isStale(key, seq)) return { ok: false, aborted: true };
      return {
        ok: true,
        issues,
        runs: engine.stats.runs - runs0,
        cacheHits: engine.stats.cacheHits - hits0,
      };
    };

    const result = chain.then(run, run);
    chain = result.catch(() => {});
    return result.catch((err) => ({ ok: false, error: err?.message || String(err) }));
  }

  return { handle, pendingKeys: () => latest.size };
}

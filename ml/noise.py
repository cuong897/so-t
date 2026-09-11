"""Sinh lỗi nhân tạo từ văn bản sạch.

Đây là nguồn dữ liệu train: corpus sạch + bộ sinh lỗi = vô hạn cặp (sai, đúng),
không tốn một đồng gán nhãn nào.

CÁI BẪY, và cũng là điểm đáng nói nhất của dự án:

    Nếu đảo hỏi <-> ngã NGẪU NHIÊN ĐỀU thì model học một phân bố lỗi không
    giống đời thật. Thực tế người Việt sai "nỗ lực" liên tục nhưng gần như
    không bao giờ sai "mỹ". Model train trên nhiễu đều sẽ vừa bỏ sót lỗi thật
    vừa báo động giả ở chỗ chẳng ai sai.

Vì vậy bộ sinh này nhận một bảng xu hướng lỗi theo TỪNG TỪ, ước lượng từ văn
bản bẩn thật (bình luận, diễn đàn) bằng mine_errors.py. Không có bảng đó thì
lùi về đều-trong-lớp, nhưng phải biết rằng đó là phương án tạm.

Nguyên tắc thứ hai: TỶ LỆ LỖI PHẢI THẤP. Văn bản đời thật gần như toàn từ
đúng. Nếu làm hỏng 50% token thì model học prior sai và sẽ gạch chân tứ tung.
"""

from __future__ import annotations
import json
import random
from pathlib import Path

import vi

# --- tần suất tương đối giữa các lớp lỗi ---------------------------------------
# Ước lượng ban đầu dựa trên đặc điểm ngữ âm: hỏi và ngã đã nhập một trong
# giọng Nam và phần lớn giọng Trung, nên đây là lớp lỗi áp đảo. Các con số này
# PHẢI được thay bằng số đo thật từ mine_errors.py trước khi train bản chính.

CLASS_WEIGHTS: dict[str, float] = {
    "HOI_NGA": 0.30,
    "NGA_HOI": 0.30,
    "CH_TR": 0.05, "TR_CH": 0.05,
    "S_X": 0.05, "X_S": 0.05,
    "D_GI": 0.03, "GI_D": 0.03,
    "D_R": 0.01, "R_D": 0.01,
    "GI_R": 0.01, "R_GI": 0.01,
    "L_N": 0.03, "N_L": 0.03,
    "N_NG": 0.02, "NG_N": 0.01,
    "C_T": 0.005, "T_C": 0.005,
}

#: xác suất một token ĐỦ ĐIỀU KIỆN bị làm hỏng
DEFAULT_ERROR_RATE = 0.04

#: trần số lỗi trong một câu — câu thật hiếm khi sai quá vài chỗ
MAX_ERRORS_PER_SENTENCE = 4


class NoiseGenerator:
    """Làm hỏng câu đúng để tạo cặp huấn luyện.

    Nhãn vàng trả về là nhãn SỬA: nếu ta biến "nỗ" thành "nổ" bằng NGA_HOI thì
    nhãn vàng cho token "nổ" là HOI_NGA — tức là phép biến đổi đưa nó về đúng.
    """

    def __init__(
        self,
        lexicon: set[str] | None = None,
        propensity: dict[str, float] | None = None,
        error_rate: float = DEFAULT_ERROR_RATE,
        seed: int | None = None,
    ) -> None:
        self.lexicon = lexicon
        #: từ (chữ thường) -> hệ số nhân xu hướng bị viết sai
        self.propensity = propensity or {}
        self.error_rate = error_rate
        self.rng = random.Random(seed)

    # --- chọn cách làm hỏng cho một token ---------------------------------

    def _corruptions_for(self, token: str) -> list[tuple[str, str]]:
        """[(chuỗi sai, nhãn sửa)] — các cách làm hỏng hợp lệ cho token này.

        Chú ý chiều: applicable_tags trả về nhãn áp dụng được cho token ĐANG
        CÓ. Ở đây token là từ ĐÚNG, nên đó là nhãn PHÁ. Nhãn SỬA — thứ model
        phải học dự đoán — là nghịch đảo của nó.

        Cố tình KHÔNG lọc dạng hỏng theo từ điển: người ta thật sự gõ ra những
        chuỗi không phải từ như "trãi", "xãy", và model cần thấy chúng.
        """
        out = []
        for break_tag in vi.applicable_tags(token, lexicon=None):
            if break_tag == "KEEP":
                continue
            broken = vi.TAGS[break_tag](token)
            if broken == token:
                continue
            fix_tag = vi.INVERSE_TAG.get(break_tag)
            if not fix_tag:
                continue
            # Bất biến phải giữ: lúc chạy thật, model chỉ được chọn trong
            # applicable_tags(dạng_sai). Nhãn sửa bắt buộc nằm trong đó.
            if fix_tag not in vi.applicable_tags(broken, self.lexicon):
                continue
            out.append((broken, fix_tag))
        return out

    def _weight(self, token: str, fix_tag: str) -> float:
        base = CLASS_WEIGHTS.get(fix_tag, 0.0)
        return base * self.propensity.get(token.lower(), 1.0)

    # --- API chính ---------------------------------------------------------

    def corrupt_tokens(self, tokens: list[str]) -> tuple[list[str], list[str]]:
        """Trả về (token đã hỏng, nhãn sửa cho từng token).

        Trọng số lớp lỗi phải tác động ở CẢ HAI khâu — chọn token nào để làm
        hỏng, và chọn cách làm hỏng nào. Nếu chỉ áp ở khâu sau thì một token
        chỉ có mỗi lựa chọn C_T sẽ bị hỏng ngang với token có HOI_NGA, và phân
        bố thu được chẳng liên quan gì tới CLASS_WEIGHTS.
        """
        out_tokens = list(tokens)
        out_tags = ["KEEP"] * len(tokens)

        candidates = []
        for i, tok in enumerate(tokens):
            options = self._corruptions_for(tok)
            if not options:
                continue
            weights = [self._weight(tok, tag) for _, tag in options]
            total = sum(weights)
            if total > 0:
                candidates.append({"i": i, "options": options, "weights": weights, "total": total})

        if not candidates:
            return out_tokens, out_tags

        # Số lỗi cần tiêm: kỳ vọng = error_rate × số token có thể hỏng.
        n_target = sum(1 for _ in candidates if self.rng.random() < self.error_rate)
        n_target = min(n_target, MAX_ERRORS_PER_SENTENCE, len(candidates))
        if n_target == 0:
            return out_tokens, out_tags

        # Chọn token theo trọng số, không lặp lại.
        pool = list(candidates)
        for _ in range(n_target):
            totals = [c["total"] for c in pool]
            if sum(totals) <= 0:
                break
            chosen = self.rng.choices(pool, weights=totals, k=1)[0]
            pool.remove(chosen)
            broken, fix_tag = self.rng.choices(
                chosen["options"], weights=chosen["weights"], k=1,
            )[0]
            out_tokens[chosen["i"]] = broken
            out_tags[chosen["i"]] = fix_tag

        return out_tokens, out_tags

    def corrupt_sentence(self, text: str) -> tuple[str, list[str], list[str]]:
        """Làm hỏng nguyên câu, giữ nguyên dấu câu và khoảng trắng.

        Trả về (câu sai, token sai, nhãn sửa).
        """
        text = vi.normalize(text)
        spans = vi.tokenize(text)
        tokens = [t for t, _, _ in spans]
        broken, tags = self.corrupt_tokens(tokens)

        out, cursor = [], 0
        for (tok, start, end), new in zip(spans, broken):
            out.append(text[cursor:start])
            out.append(new)
            cursor = end
        out.append(text[cursor:])
        return "".join(out), broken, tags


# --- nạp bảng xu hướng --------------------------------------------------------

def load_propensity(path: str | Path) -> dict[str, float]:
    """Bảng {từ: hệ số} do mine_errors.py sinh ra từ văn bản bẩn thật."""
    p = Path(path)
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def load_lexicon(path: str | Path) -> set[str]:
    """Từ điển âm tiết, trích từ corpus sạch chứ không viết tay.

    Âm tiết nào xuất hiện đủ nhiều trong corpus lớn thì đó là âm tiết có thật —
    đây là định nghĩa thực nghiệm, đáng tin hơn mọi danh sách chép tay.
    """
    p = Path(path)
    if not p.exists():
        return set()
    return {line.split("\t")[0].strip().lower()
            for line in p.read_text(encoding="utf-8").splitlines() if line.strip()}


if __name__ == "__main__":
    import sys
    from collections import Counter

    # Console Windows mặc định cp1252, in tiếng Việt là vỡ.
    sys.stdout.reconfigure(encoding="utf-8")

    samples = [
        "Cả nhóm đã nỗ lực rất nhiều để giành chiến thắng.",
        "Mình xin chia sẻ một vài trải nghiệm khi đi làm.",
        "Tôi suy nghĩ rất kỹ trước khi quyết định nghỉ việc.",
        "Công ty bảo vệ quyền lợi của người lao động.",
        "Anh ấy bắt chước giọng nói rất giống.",
    ]

    print("=== ví dụ (tỷ lệ cao cho dễ thấy) ===")
    loud = NoiseGenerator(error_rate=0.5, seed=7)
    for s in samples:
        bad, toks, tags = loud.corrupt_sentence(s)
        changed = [(t, g) for t, g in zip(toks, tags) if g != "KEEP"]
        print(f"gốc : {s}")
        print(f"hỏng: {bad}")
        print(f"lỗi : {changed or 'không có'}\n")

    print("=== kiểm tra phân bố ở tỷ lệ thật ===")
    gen = NoiseGenerator(seed=1)
    tag_counts, n_tokens, n_errors, n_sent_with_error = Counter(), 0, 0, 0
    for _ in range(2000):
        for s in samples:
            _, toks, tags = gen.corrupt_sentence(s)
            n_tokens += len(toks)
            errs = [t for t in tags if t != "KEEP"]
            n_errors += len(errs)
            n_sent_with_error += 1 if errs else 0
            tag_counts.update(errs)

    print(f"token: {n_tokens}  lỗi: {n_errors}  tỷ lệ token sai: {n_errors / n_tokens:.3%}")
    print(f"câu có ít nhất một lỗi: {n_sent_with_error / (2000 * len(samples)):.1%}")
    print("phân bố lớp lỗi:")
    for tag, c in tag_counts.most_common():
        print(f"  {tag:<10} {c / n_errors:6.1%}")

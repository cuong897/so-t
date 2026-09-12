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

#: trọng số cho lỗi phụ âm đầu và âm cuối, khoá theo nhãn SỬA
CONSONANT_WEIGHTS: dict[str, float] = {
    "CH_TR": 0.05, "TR_CH": 0.05,
    "S_X": 0.05, "X_S": 0.05,
    "D_GI": 0.03, "GI_D": 0.03,
    "D_R": 0.01, "R_D": 0.01,
    "GI_R": 0.01, "R_GI": 0.01,
    "L_N": 0.03, "N_L": 0.03,
    "N_NG": 0.02, "NG_N": 0.01,
    "C_T": 0.005, "T_C": 0.005,
}

#: Lỗi thanh điệu không thể khoá theo nhãn sửa, vì TONE_NGA vừa có thể là
#: "viết hỏi đáng lẽ ngã" (lỗi kiến thức) vừa là "quên bỏ dấu" (lỗi gõ phím).
#: Hai loại đó tần suất khác hẳn nhau nên phải phân biệt theo CẶP thanh.
TONE_PAIR_WEIGHTS = {
    "hoi_nga": 0.34,    # hỏi <-> ngã: lỗi kiến thức, lớp lỗi áp đảo
    "missing": 0.24,    # mất dấu hoàn toàn (-> ngang): lỗi gõ phím / IME hỏng
    "other_tone": 0.10, # đổi sang thanh khác: hiếm hơn nhưng có thật
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
        class_weights: dict[str, float] | None = None,
        error_rate: float = DEFAULT_ERROR_RATE,
        seed: int | None = None,
    ) -> None:
        self.lexicon = lexicon
        #: từ (chữ thường) -> hệ số nhân xu hướng bị viết sai
        self.propensity = propensity or {}
        #: lớp lỗi -> tỷ trọng, ĐO ĐƯỢC bằng mine_errors.py. None thì lùi về
        #: bảng ước lượng bên dưới — nhưng đã đo được thì đừng dùng bảng đoán:
        #: chênh lệch giữa hai bảng đúng bằng 20 điểm F1 (xem docs/decisions.md).
        self.class_weights = class_weights
        self.error_rate = error_rate
        self.rng = random.Random(seed)
        # _corruptions_for tất định theo token, mà vốn từ chỉ vài chục nghìn.
        # Không cache thì mỗi token tốn ~8 lượt applicable_tags lồng nhau
        # (một lượt ngoài, một lượt bên trong tag_between cho từng ứng viên),
        # tức khoảng 80 phép biến đổi chuỗi — sinh 720k mẫu mất hàng chục phút.
        self._cache: dict[str, list[tuple[str, str]]] = {}

    # --- chọn cách làm hỏng cho một token ---------------------------------

    def _corruptions_for(self, token: str) -> list[tuple[str, str]]:
        """[(chuỗi sai, nhãn sửa)] — các cách làm hỏng hợp lệ cho token này.

        Chú ý chiều: applicable_tags trả về nhãn áp dụng được cho token ĐANG
        CÓ. Ở đây token là từ ĐÚNG, nên đó là nhãn PHÁ. Nhãn SỬA — thứ model
        phải học dự đoán — là nghịch đảo của nó.

        Cố tình KHÔNG lọc dạng hỏng theo từ điển: người ta thật sự gõ ra những
        chuỗi không phải từ như "trãi", "xãy", và model cần thấy chúng.
        """
        hit = self._cache.get(token)
        if hit is not None:
            return hit

        out = []
        for break_tag in vi.applicable_tags(token, lexicon=None):
            if break_tag == "KEEP":
                continue
            broken = vi.TAGS[break_tag](token)
            if broken == token:
                continue
            # Nhãn sửa phải TRA chứ không tra bảng được: với nhãn đặt-thanh thì
            # nghịch đảo phụ thuộc thanh gốc của chính từ đúng.
            # Đồng thời đây cũng là chốt cho bất biến sống còn — lúc chạy thật
            # model chỉ được chọn trong applicable_tags(dạng_sai, lexicon), nên
            # nhãn vàng bắt buộc nằm trong đó, nếu không nó vĩnh viễn bất khả thi.
            fix_tag = vi.tag_between(broken, token, self.lexicon)
            if not fix_tag or fix_tag == "KEEP":
                continue
            out.append((broken, fix_tag))
        self._cache[token] = out
        return out

    def _class_of(self, token: str, broken: str, fix_tag: str) -> str:
        """Lớp lỗi của một cách làm hỏng — đơn vị để phân bổ trọng số."""
        if not fix_tag.startswith("TONE_"):
            return fix_tag
        t_orig, t_bad = vi.get_tone(token), vi.get_tone(broken)
        o = t_orig[0] if t_orig else None
        b = t_bad[0] if t_bad else None
        if o in (vi.HOI, vi.NGA) and b in (vi.HOI, vi.NGA):
            return "hoi_nga"
        if b == vi.NGANG and o != vi.NGANG:
            return "missing"
        return "other_tone"

    def _class_weight(self, cls: str) -> float:
        if self.class_weights is not None:
            return self.class_weights.get(cls, 0.0)
        base = TONE_PAIR_WEIGHTS.get(cls)
        return base if base is not None else CONSONANT_WEIGHTS.get(cls, 0.0)

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

        # Gom ứng viên THEO LỚP, không theo token.
        #
        # Đây là điểm mấu chốt. Nếu bốc token trước rồi mới bốc lớp thì phân bố
        # thu được bị chi phối bởi việc lớp nào TÌNH CỜ có sẵn ở token nào:
        # hầu hết âm tiết đều có thể mất dấu, nhưng chỉ âm tiết bắt đầu bằng
        # l/n/ch/tr/s/x/d/gi/r mới có lỗi phụ âm. Kết quả là "missing" chiếm
        # 50% dù cấu hình 22%, còn phụ âm rơi xuống 5% dù cấu hình 37%.
        #
        # Bốc LỚP trước rồi mới bốc token trong lớp đó thì phân bố đúng bằng
        # thứ đã cấu hình, chỉ phụ thuộc lớp nào có mặt trong câu.
        by_class: dict[str, list[tuple[int, str, str]]] = {}
        n_eligible = 0
        for i, tok in enumerate(tokens):
            options = self._corruptions_for(tok)
            if not options:
                continue
            n_eligible += 1
            for broken, fix_tag in options:
                cls = self._class_of(tok, broken, fix_tag)
                by_class.setdefault(cls, []).append((i, broken, fix_tag))

        if not by_class:
            return out_tokens, out_tags

        n_target = sum(1 for _ in range(n_eligible) if self.rng.random() < self.error_rate)
        n_target = min(n_target, MAX_ERRORS_PER_SENTENCE, n_eligible)
        if n_target == 0:
            return out_tokens, out_tags

        used: set[int] = set()
        for _ in range(n_target):
            avail = [c for c, opts in by_class.items()
                     if any(i not in used for i, _, _ in opts)]
            if not avail:
                break
            weights = [self._class_weight(c) for c in avail]
            if sum(weights) <= 0:
                break
            cls = self.rng.choices(avail, weights=weights, k=1)[0]

            pool = [o for o in by_class[cls] if o[0] not in used]
            # Xu hướng lỗi của từng từ quyết định token nào trong lớp bị chọn.
            prop = [self.propensity.get(tokens[i].lower(), 1.0) for i, _, _ in pool]
            i, broken, fix_tag = self.rng.choices(pool, weights=prop, k=1)[0]

            out_tokens[i] = broken
            out_tags[i] = fix_tag
            used.add(i)

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


def load_class_weights(path: str | Path) -> dict[str, float] | None:
    """Bảng {lớp lỗi: tỷ trọng} do mine_errors.py đo từ dữ liệu người gán nhãn.

    None nghĩa là chưa đo — NoiseGenerator sẽ lùi về bảng ước lượng. Lần đo đầu
    tiên cho thấy ước lượng lệch rất xa: hoi_nga đoán 31.5% nhưng thực tế 4.7%,
    other_tone đoán 9.3% nhưng thực tế 43.6%.
    """
    p = Path(path)
    if not p.exists():
        return None
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
    samples_tokens = {s: [t for t, _, _ in vi.tokenize(vi.normalize(s))] for s in samples}
    tag_counts, class_counts = Counter(), Counter()
    n_tokens = n_errors = n_sent_with_error = 0
    for _ in range(2000):
        for s in samples:
            _, toks, tags = gen.corrupt_sentence(s)
            n_tokens += len(toks)
            errs = [t for t in tags if t != "KEEP"]
            n_errors += len(errs)
            n_sent_with_error += 1 if errs else 0
            tag_counts.update(errs)
            for tok, orig, tag in zip(toks, samples_tokens[s], tags):
                if tag != "KEEP":
                    class_counts[gen._class_of(orig, tok, tag)] += 1

    print(f"token: {n_tokens}  lỗi: {n_errors}  tỷ lệ token sai: {n_errors / n_tokens:.3%}")
    print(f"câu có ít nhất một lỗi: {n_sent_with_error / (2000 * len(samples)):.1%}")

    # Đo theo LỚP, không theo nhãn: TONE_HOI có thể thuộc lớp hoi_nga hoặc
    # other_tone tuỳ thanh gốc, nên bảng theo nhãn không kiểm chứng được cấu hình.
    print("\nphân bố theo LỚP (so với thiết kế):")
    target = dict(TONE_PAIR_WEIGHTS)
    target["phụ âm + âm cuối"] = sum(CONSONANT_WEIGHTS.values())
    tot_w = sum(target.values())
    grouped = Counter()
    for cls, c in class_counts.items():
        grouped[cls if cls in TONE_PAIR_WEIGHTS else "phụ âm + âm cuối"] += c
    for cls, w in sorted(target.items(), key=lambda kv: -kv[1]):
        got = grouped[cls] / n_errors if n_errors else 0
        print(f"  {cls:<18} thực tế {got:6.1%}   thiết kế {w / tot_w:6.1%}")

    print("\nphân bố theo nhãn:")
    for tag, c in tag_counts.most_common(8):
        print(f"  {tag:<12} {c / n_errors:6.1%}")

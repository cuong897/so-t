"""Kiểm tra logic đếm tp/fp/fn của evaluate.py.

Đây là phần dễ sai thầm lặng nhất trong cả pipeline: số sai ở đây không làm
chương trình đổ, nó chỉ khiến mọi báo cáo về sau vô nghĩa. Và vì con số đẹp
trông hợp lý hơn con số xấu, một lỗi ở đây rất dễ được cho qua.

Chạy:  python test_evaluate.py
"""

from __future__ import annotations
import sys

import vi
from evaluate import score


def rows(pairs):
    return [{"wrong": [w for w, _ in pairs], "right": [c for _, c in pairs]}]


def const(tags):
    """predict_fn giả, luôn trả đúng danh sách nhãn này."""
    return lambda words: tags


CASES = []


def case(name, r, tags, scoped, want):
    CASES.append((name, r, tags, scoped, want))


ERR = rows([("nổ", "nỗ"), ("trãi", "trải")])          # hai lỗi thật
CLEAN = rows([("nỗ", "nỗ"), ("trải", "trải")])        # hai từ vốn đã đúng
MIXED = rows([("nổ", "nỗ"), ("bức", "bước")])         # một trong tầm, một ngoài tầm

case("sửa đúng cả hai", ERR, ["TONE_NGA", "TONE_HOI"], False,
     dict(tp=2, fp=0, fn=0))

case("im lặng trước lỗi thật -> bỏ sót, không báo sai", ERR, ["KEEP", "KEEP"], False,
     dict(tp=0, fp=0, fn=2))

# Sửa sai hướng phải tính CẢ HAI: vừa không sửa được lỗi (fn), vừa tạo ra một
# sửa đổi hỏng mà người dùng nhìn thấy (fp). Chỉ đếm một bên là tự cho điểm.
case("sửa sai hướng -> vừa bỏ sót vừa báo sai", ERR, ["TONE_SAC", "TONE_SAC"], False,
     dict(tp=0, fp=2, fn=2))

case("động vào từ vốn đúng -> báo sai thuần", CLEAN, ["TONE_HOI", "TONE_NGA"], False,
     dict(tp=0, fp=2, fn=0))

case("im lặng trước từ đúng -> không đếm gì", CLEAN, ["KEEP", "KEEP"], False,
     dict(tp=0, fp=0, fn=0))

# 'bức'->'bước' đổi phẩm chất nguyên âm, bộ nhãn không biểu diễn được.
case("toàn bộ: lỗi ngoài tầm vẫn tính là bỏ sót", MIXED, ["TONE_NGA", "KEEP"], False,
     dict(tp=1, fp=0, fn=1))

case("trong tầm: loại lỗi ngoài tầm khỏi mẫu số", MIXED, ["TONE_NGA", "KEEP"], True,
     dict(tp=1, fp=0, fn=0))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    bad = 0
    for name, r, tags, scoped, want in CASES:
        got = score(r, const(tags), scoped=scoped, lexicon=None)
        ok = all(got[k] == v for k, v in want.items())
        bad += not ok
        print(f"{'ok  ' if ok else 'SAI '} {name:<48} "
              f"tp={got['tp']} fp={got['fp']} fn={got['fn']}"
              + ("" if ok else f"   mong đợi {want}"))

    # Kiểm tra chéo: precision và recall phải khớp với tp/fp/fn.
    m = score(ERR, const(["TONE_NGA", "TONE_SAC"]), scoped=False, lexicon=None)
    expect_p = m["tp"] / (m["tp"] + m["fp"])
    expect_r = m["tp"] / (m["tp"] + m["fn"])
    for label, got_v, want_v in (("precision", m["precision"], expect_p),
                                 ("recall", m["recall"], expect_r)):
        ok = abs(got_v - want_v) < 1e-9
        bad += not ok
        print(f"{'ok  ' if ok else 'SAI '} {label} khớp công thức{'':<28} {got_v:.4f}")

    print(f"\n{len(CASES) + 2 - bad}/{len(CASES) + 2} đúng")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

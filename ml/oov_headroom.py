"""Token KHÔNG có trong từ điển: KEEP là phương án sai chắc chắn, mà cổng vẫn
đòi p >= 0,95 như với từ thật.

Câu hỏi. `onnxEngine._decode` áp đúng một ngưỡng cho mọi token. Nhưng hai tình
huống này khác nhau về bản chất:

  * `dành` CÓ trong từ điển. KEEP là phương án hợp lệ — có thể người ta thật sự
    muốn viết `dành`. Đòi p >= 0,95 là đúng.
  * `mựng` KHÔNG có trong từ điển. KEEP nghĩa là "để nguyên một chuỗi không phải
    từ tiếng Việt". Tầng ① đã biết điều đó rồi, mà cổng vẫn không dùng.

Ca thật khiến phải viết file này — người dùng gõ trên Facebook:

    chúc mựng anh chị đã giành được phần quà trí giá 10 triệu đuồng

`mựng` là phi từ, có ĐÚNG MỘT ứng viên trong từ điển (`mừng`), model xếp nó
p = 0,802 — dưới 0,95 nên extension im lặng hoàn toàn.

File này KHÔNG đề xuất sửa gì. Nó chỉ đo hai con số quyết định chuyện đó đáng
làm hay không:

  A. LỜI  — trong số lỗi VSEC mà bộ nhãn biểu diễn được, bao nhiêu ca có token
            sai là phi từ kèm ứng viên có thật? Đó là trần trên của phần thu
            thêm được.
  B. LỖ   — trong văn bản ĐÚNG, bao nhiêu token là phi từ kèm ứng viên có thật?
            Mỗi token như vậy là một lần gạch oan tiềm năng. Tên riêng, từ mượn
            và thuật ngữ đều rơi vào đây, nên con số này mới là con số chặn.

Không có B thì A chỉ là một nửa đẹp của câu chuyện.

    python oov_headroom.py
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import vi
from evaluate import load_vsec
from noise import load_lexicon


def candidates(token: str, lexicon: set[str]) -> list[str]:
    """Nhãn khác KEEP mà áp vào cho ra một từ CÓ trong từ điển."""
    return [t for t in vi.applicable_tags(token, lexicon) if t != "KEEP"]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--test-data", type=Path, default=Path("data/test.jsonl"))
    ap.add_argument("--clean-limit", type=int, default=2000)
    ap.add_argument("--result", default="out/oov_headroom.json")
    args = ap.parse_args()

    lexicon = load_lexicon(args.lexicon)
    print(f"từ điển: {len(lexicon):,} âm tiết\n")

    # --- A. LỜI: lỗi thật có token sai là phi từ ------------------------------
    rows = load_vsec(args.vsec, split="eval")
    in_scope = oov_wrong = oov_single = 0
    by_n = Counter()
    examples = []

    for r in rows:
        for w, c in zip(r["wrong"], r["right"]):
            if w == c:
                continue
            tag = vi.tag_between(w, c, lexicon)
            if not tag or tag == "KEEP":
                continue                      # ngoài tầm bộ nhãn, không tính
            in_scope += 1
            if w.lower() in lexicon:
                continue                      # từ thật -> KEEP là phương án hợp lệ
            cands = candidates(w, lexicon)
            if not cands:
                continue                      # phi từ mà không ứng viên nào có thật
            oov_wrong += 1
            by_n[len(cands)] += 1
            if len(cands) == 1:
                oov_single += 1
            if len(examples) < 12:
                examples.append((w, c, len(cands)))

    print("=== A. LỜI — lỗi VSEC giữ kín, trong tầm bộ nhãn ===\n")
    print(f"  tổng lỗi trong tầm                        {in_scope:>6,}")
    print(f"  token sai là PHI TỪ, có ứng viên có thật  {oov_wrong:>6,}"
          f"  {oov_wrong / in_scope:>6.1%}")
    print(f"     trong đó có ĐÚNG MỘT ứng viên          {oov_single:>6,}"
          f"  {oov_single / in_scope:>6.1%}")
    print("\n  số ứng viên của các ca phi từ: "
          + ", ".join(f"{n} ứng viên: {c}" for n, c in sorted(by_n.items())))
    print("\n  ví dụ: " + ", ".join(f"{w}→{c} ({n})" for w, c, n in examples[:8]))

    # --- B. LỖ: token phi từ trong văn bản ĐÚNG ------------------------------
    # Dựng lại câu đúng từ tập test: áp nhãn sửa lên token đã bị làm hỏng.
    clean_tokens = clean_oov = clean_oov_single = 0
    clean_examples = []
    seen = Counter()
    with args.test_data.open(encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= args.clean_limit:
                break
            row = json.loads(line)
            words = [w if t == "KEEP" else vi.TAGS[t](w)
                     for w, t in zip(row["tokens"], row["tags"])]
            for w in words:
                clean_tokens += 1
                if w.lower() in lexicon:
                    continue
                cands = candidates(w, lexicon)
                if not cands:
                    continue
                clean_oov += 1
                seen[w] += 1
                if len(cands) == 1:
                    clean_oov_single += 1
                    if len(clean_examples) < 20:
                        clean_examples.append(f"{w}→{vi.TAGS[cands[0]](w)}")

    print(f"\n=== B. LỖ — {args.clean_limit:,} câu ĐÚNG (Wikipedia, chưa train) ===\n")
    print(f"  tổng token                                {clean_tokens:>6,}")
    print(f"  PHI TỪ mà có ứng viên có thật             {clean_oov:>6,}"
          f"  {clean_oov / clean_tokens:>6.2%}")
    print(f"     trong đó có ĐÚNG MỘT ứng viên          {clean_oov_single:>6,}"
          f"  {clean_oov_single / clean_tokens:>6.2%}")
    print("\n  ví dụ (mỗi ca này là một lần gạch oan nếu bỏ KEEP):")
    print("    " + ", ".join(clean_examples[:14]))
    print("\n  phi từ hay gặp nhất: "
          + ", ".join(f"{w}×{c}" for w, c in seen.most_common(10)))

    # --- tỷ lệ đánh đổi ------------------------------------------------------
    print("\n=== TỶ LỆ ===\n")
    if clean_oov_single:
        print(f"  Bỏ KEEP cho phi từ MỘT ứng viên: được tối đa {oov_single} lỗi thật"
              f" trên {len(rows):,} câu VSEC,")
        print(f"  đổi lấy tối đa {clean_oov_single} lần gạch oan trên"
              f" {args.clean_limit:,} câu đúng.")
        print(f"  Tức khoảng {clean_oov_single / args.clean_limit:.2%} số câu đúng bị"
              f" động vào — so với 1,30% hiện tại.")
    print("\n  CẢNH BÁO: cả hai con số là TRẦN TRÊN. Cột A giả định model luôn"
          "\n  chọn đúng ứng viên; cột B giả định mọi phi từ đều bị gạch. Muốn số"
          "\n  thật thì phải chạy model, không suy ra từ bảng này được.")

    res = Path(args.result)
    res.parent.mkdir(parents=True, exist_ok=True)
    res.write_text(json.dumps({
        "tu_dien": len(lexicon),
        "vsec": {"trong_tam": in_scope, "phi_tu": oov_wrong,
                 "phi_tu_mot_ung_vien": oov_single,
                 "theo_so_ung_vien": dict(by_n)},
        "van_ban_dung": {"cau": args.clean_limit, "token": clean_tokens,
                         "phi_tu": clean_oov,
                         "phi_tu_mot_ung_vien": clean_oov_single},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nđã lưu -> {res}")


if __name__ == "__main__":
    main()

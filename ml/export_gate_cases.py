"""Sinh fixture parity cho phép quyết định: gate.py phải khớp onnxEngine.js.

Vì sao cần. Luật quyết định từng có BỐN bản chép tay. `gate.py` gộp ba bản
Python lại, còn bản JS trong `onnxEngine.js` thì không gộp được — nó chạy trong
trình duyệt. Nên hai bản còn lại phải được CANH, đúng cách `vi.js`/`vi.py` đang
được canh: lệch nhau là lỗi im lặng, không crash, chỉ là sản phẩm quyết định
khác với thứ mình vừa đo.

Fixture ghi cả đầu vào lẫn đáp án của phía Python; `test/gate.test.mjs` chạy
đầu vào đó qua `onnxEngine._decode` rồi so.

Token là âm tiết THẬT lấy từ `data/lexicon.tsv`, và tập nhãn là đúng
`vi.applicable_tags` của nó — không bốc nhãn bừa. Lý do rất cụ thể:
`onnxEngine._decode` áp nhãn lên token rồi trả null nếu chuỗi không đổi, nên
một cặp (token, nhãn) không áp được sẽ làm JS im lặng vì lý do CHẲNG LIÊN QUAN
tới ngưỡng, và test sẽ báo lệch ở chỗ không có lỗi nào.

Còn logit thì sinh NGẪU NHIÊN chứ không lấy từ model thật, và cố ý: cần phủ cả
những vùng mà model thật hiếm khi rơi vào — ngay sát ngưỡng, biên vừa đúng
0,25, KEEP thắng sít sao. Đó là chỗ hai bản dễ lệch nhất, và là chỗ model thật
cho quá ít mẫu.

**Không phủ chế độ argmax** (threshold = margin = 0). Ở chế độ đó hai bên KHÁC
NHAU có chủ ý: `gate.py` lấy argmax trên cả tập kể cả KEEP — nếp cũ của
`evaluate.py` để mọi con số "năng lực thô" đã báo cáo vẫn tái lập được — còn
`onnxEngine.js` luôn chọn nhãn mạnh nhất khác KEEP. Sản phẩm không bao giờ chạy
ở chế độ đó; chỉ `dev/onnx-test.html?loose` dùng, để soi model đang nghĩ gì.

    python export_gate_cases.py
"""

from __future__ import annotations
import argparse
import json
import random
import sys
from pathlib import Path

import gate
import vi


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path,
                    default=Path("../extension/models/_gate_cases.json"))
    ap.add_argument("--n", type=int, default=1200)
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    from noise import load_lexicon

    rng = random.Random(args.seed)
    lexicon = load_lexicon(args.lexicon)
    non_keep = [t for t in vi.TAGS if t != "KEEP"]

    # Chỉ giữ âm tiết có từ hai nhãn trở lên, nếu không thì không có gì để quyết.
    pool = []
    for w in sorted(lexicon):
        allowed = vi.applicable_tags(w, lexicon)
        if len(allowed) >= 2:
            pool.append((w, allowed))
    rng.shuffle(pool)
    print(f"từ điển {len(lexicon):,} âm tiết -> {len(pool):,} âm tiết có ứng viên")

    # Ba bảng ngưỡng, và KHÔNG bảng nào là None: bên JS mặc định dùng bảng đang
    # ship, nên để None thì hai bên lệch nhau vì lý do cấu hình chứ không phải
    # vì logic, và test sẽ báo lệch ở chỗ không có lỗi nào. Luôn truyền bảng
    # tường minh, kể cả bảng "mọi nhãn bằng nhau".
    tables = [
        gate.prod_thresholds(),                          # bản đang ship
        gate.thresholds_for(0.95, consonant=None),       # mọi nhãn dùng chung
        {t: round(rng.uniform(0.5, 0.99), 3) for t in non_keep},   # lởm chởm
    ]

    cases = []
    for i in range(args.n):
        token, allowed = pool[i % len(pool)]
        # Thang logit hẹp cho nhiều ca sát ngưỡng; thang rộng cho ca dứt khoát.
        scale = rng.choice([0.5, 1.0, 2.0, 5.0, 9.0])
        logits = [round(rng.gauss(0, scale), 4) for _ in allowed]
        table = tables[i % len(tables)]
        threshold = rng.choice([0.5, 0.8, 0.9, 0.95, 0.99])
        margin = rng.choice([0.0, 0.1, 0.25, 0.4])

        tag, prob = gate.decide(logits, allowed, threshold, margin, table)
        cases.append({
            "token": token,
            "allowed": allowed,
            "logits": logits,
            "threshold": threshold,
            "margin": margin,
            "thresholds": table,
            "expected": tag,
            "prob": round(float(prob), 6),
        })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")

    fired = sum(1 for c in cases if c["expected"] != "KEEP")
    n_tags = len({t for c in cases for t in c["allowed"]})
    print(f"{len(cases):,} ca, phủ {n_tags} nhãn -> {args.out}")
    print(f"  báo: {fired:,}   im lặng: {len(cases) - fired:,}")
    if not 0.2 < fired / len(cases) < 0.8:
        print("  CẢNH BÁO: lệch hẳn về một phía thì fixture không canh được "
              "nhánh còn lại")


if __name__ == "__main__":
    main()

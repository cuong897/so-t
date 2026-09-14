"""Phép quyết định "có dám báo không" — MỘT bản duy nhất cho phía Python.

Trước file này luật quyết định nằm ở bốn bản chép tay: `onnxEngine.js`,
`evaluate.py::_gate`, `false_alarm.py::alarms`, `consonant_eval.py::decide`. Cả
ba bản Python giống hệt nhau về logic, nên gộp được mà không đổi con số nào —
và quyết định 28 đã phải viết bản thứ năm cho một thí nghiệm, đúng lúc nhận ra
rằng đổi cổng mà quên một bản thì phép đo và sản phẩm tách nhau ra âm thầm. Đó
đúng là hạng mục lỗi mà test parity `vi.js`/`vi.py` được dựng ra để chặn.

Giờ phía Python có một bản, và `test/gate.test.mjs` canh cho nó khớp với
`onnxEngine.js` trên fixture do `export_gate_cases.py` sinh ra.

Luật, viết đúng thứ tự:

  1. softmax CHỈ trên tập nhãn hợp lệ (`vi.applicable_tags`), không phải trên
     cả 23 nhãn — nhãn không sinh ra được từ có thật thì không được chia xác
     suất.
  2. lấy nhãn mạnh nhất trong đám KHÁC KEEP.
  3. nhãn đó phải vượt ngưỡng CỦA CHÍNH NÓ, và phải hơn KEEP một biên.

Bước 3 là chỗ duy nhất khác bản cũ: ngưỡng tra theo nhãn thay vì một số dùng
chung. Mặc định mọi nhãn vẫn là 0,95 nên hành vi không đổi cho tới khi có ai
truyền bảng ngưỡng riêng vào.

**Vì sao ngưỡng tra SAU bước 2, không phải trước.** Cách khác là xét từng nhãn
với ngưỡng riêng của nó rồi chọn nhãn tốt nhất trong đám vượt được — nhưng như
thế thì hạ ngưỡng một lớp có thể làm đổi cả ĐỀ XUẤT, chứ không chỉ đổi việc có
báo hay không. Giữ như hiện tại thì đề xuất luôn là lựa chọn số một của model,
và bảng ngưỡng chỉ quyết định có dám nói ra hay không. Dễ suy luận hơn nhiều
khi đọc một ca sai.
"""

from __future__ import annotations

import numpy as np

import vi

# Nhãn phụ âm đầu và âm cuối. Phần còn lại (ngoài KEEP) là thanh điệu.
CONSONANT_TAGS = frozenset({
    "L_N", "N_L", "CH_TR", "TR_CH", "S_X", "X_S",
    "D_GI", "GI_D", "D_R", "R_D", "GI_R", "R_GI",
    "N_NG", "NG_N", "C_T", "T_C",
})

PROD_THRESHOLD = 0.95      # phải khớp DEFAULT_THRESHOLD trong onnxEngine.js
PROD_MARGIN = 0.25         # phải khớp DEFAULT_MARGIN


def thresholds_for(default: float = PROD_THRESHOLD,
                   consonant: float | None = None) -> dict[str, float]:
    """Bảng nhãn -> ngưỡng. `consonant=None` nghĩa là dùng chung một ngưỡng."""
    table = {t: default for t in vi.TAGS if t != "KEEP"}
    if consonant is not None:
        for t in CONSONANT_TAGS:
            table[t] = consonant
    return table


def probabilities(logit_row, allowed: list[str]) -> np.ndarray:
    """Softmax trên ĐÚNG tập nhãn hợp lệ, trả mảng cùng thứ tự với `allowed`."""
    z = np.asarray(logit_row, dtype=np.float64)
    e = np.exp(z - z.max())
    return e / e.sum()


def decide(logit_row, allowed: list[str],
           threshold: float = PROD_THRESHOLD,
           margin: float = PROD_MARGIN,
           thresholds: dict[str, float] | None = None) -> tuple[str, float]:
    """-> (nhãn chọn, p của nhãn mạnh nhất khác KEEP).

    Trả về "KEEP" khi không đủ tự tin. `p` trả về kể cả khi quyết định là KEEP,
    để bên gọi soi được model đang nghĩ gì ở chỗ nó chưa dám nói.

    threshold = margin = 0 thì thoái về argmax không ngưỡng — nếp cũ của
    `evaluate.py`, giữ nguyên để mọi con số đã báo cáo vẫn tái lập được.
    """
    z = np.asarray(logit_row, dtype=np.float64)
    if threshold <= 0 and margin <= 0 and thresholds is None:
        return allowed[int(z.argmax())], 0.0

    p = probabilities(z, allowed)
    keep_p = float(p[allowed.index("KEEP")]) if "KEEP" in allowed else 0.0

    best, best_p = None, 0.0
    for j, t in enumerate(allowed):
        if t != "KEEP" and p[j] > best_p:
            best, best_p = t, float(p[j])
    if best is None:
        return "KEEP", 0.0

    bar = thresholds.get(best, threshold) if thresholds else threshold
    if best_p < bar or best_p - keep_p < margin:
        return "KEEP", best_p
    return best, best_p

"""Bản Python của extension/src/engine/vi.js.

Hai bản BẮT BUỘC cho cùng kết quả. Nếu lúc train tách âm tiết hay sinh nhãn
khác lúc chạy trong trình duyệt thì model sẽ hỏng âm thầm — không crash, chỉ
kém đi, và rất khó truy ra. test/parity.test.mjs so hai bản trên cùng bộ từ.
"""

from __future__ import annotations
import re
import unicodedata

# --- bảng nguyên âm: 12 nguyên âm gốc × 6 thanh --------------------------------
# cột: ngang, huyền, sắc, hỏi, ngã, nặng

VOWEL_TABLE = [
    ["a", "à", "á", "ả", "ã", "ạ"],
    ["ă", "ằ", "ắ", "ẳ", "ẵ", "ặ"],
    ["â", "ầ", "ấ", "ẩ", "ẫ", "ậ"],
    ["e", "è", "é", "ẻ", "ẽ", "ẹ"],
    ["ê", "ề", "ế", "ể", "ễ", "ệ"],
    ["i", "ì", "í", "ỉ", "ĩ", "ị"],
    ["o", "ò", "ó", "ỏ", "õ", "ọ"],
    ["ô", "ồ", "ố", "ổ", "ỗ", "ộ"],
    ["ơ", "ờ", "ớ", "ở", "ỡ", "ợ"],
    ["u", "ù", "ú", "ủ", "ũ", "ụ"],
    ["ư", "ừ", "ứ", "ử", "ữ", "ự"],
    ["y", "ỳ", "ý", "ỷ", "ỹ", "ỵ"],
]

NGANG, HUYEN, SAC, HOI, NGA, NANG = range(6)
TONE_NAMES = ["ngang", "huyền", "sắc", "hỏi", "ngã", "nặng"]

CHAR_INFO: dict[str, tuple[int, int]] = {}
for _b, _row in enumerate(VOWEL_TABLE):
    for _t, _ch in enumerate(_row):
        CHAR_INFO[_ch] = (_b, _t)
        CHAR_INFO[_ch.upper()] = (_b, _t)


def _is_upper(ch: str) -> bool:
    return ch != ch.lower()


def _compose(base: int, tone: int, upper: bool) -> str:
    ch = VOWEL_TABLE[base][tone]
    return ch.upper() if upper else ch


def tone_position(syllable: str) -> int:
    """Vị trí ký tự mang dấu thanh.

    Sau khi bỏ nguyên âm lướt của qu/gi:
      có âm cuối      -> nguyên âm CUỐI
      không có âm cuối -> nguyên âm ÁP CHÓT
    ê và ơ luôn thắng khi có mặt.
    """
    lower = syllable.lower()
    idxs = [i for i, ch in enumerate(lower) if ch in CHAR_INFO]
    if not idxs:
        return -1
    if len(idxs) == 1:
        return idxs[0]

    vowels = idxs
    if (lower.startswith("qu") or lower.startswith("gi")) and idxs[0] == 1 and len(idxs) > 1:
        vowels = idxs[1:]
    if len(vowels) == 1:
        return vowels[0]

    for i in vowels:
        b = CHAR_INFO[lower[i]][0]
        if VOWEL_TABLE[b][0] in ("ê", "ơ"):
            return i

    last = vowels[-1]
    has_final = last < len(lower) - 1
    return last if has_final else vowels[-2]


def get_tone(syllable: str):
    """(tone, index) hoặc None nếu không có nguyên âm."""
    for i, ch in enumerate(syllable):
        info = CHAR_INFO.get(ch)
        if info and info[1] != NGANG:
            return info[1], i
    idx = tone_position(syllable)
    return None if idx == -1 else (NGANG, idx)


def set_tone(syllable: str, tone: int) -> str:
    cur = get_tone(syllable)
    if cur is None:
        return syllable
    _, idx = cur
    info = CHAR_INFO.get(syllable[idx])
    if info is None:
        return syllable
    return syllable[:idx] + _compose(info[0], tone, _is_upper(syllable[idx])) + syllable[idx + 1:]


def strip_tone(s: str) -> str:
    out = []
    for ch in s:
        info = CHAR_INFO.get(ch)
        out.append(_compose(info[0], NGANG, _is_upper(ch)) if info else ch)
    return "".join(out)


def to_ascii(s: str) -> str:
    base = {"a": "a", "ă": "a", "â": "a", "e": "e", "ê": "e", "i": "i",
            "o": "o", "ô": "o", "ơ": "o", "u": "u", "ư": "u", "y": "y"}
    out = []
    for ch in s:
        info = CHAR_INFO.get(ch)
        if info:
            b = base[VOWEL_TABLE[info[0]][0]]
            out.append(b.upper() if _is_upper(ch) else b)
        elif ch == "đ":
            out.append("d")
        elif ch == "Đ":
            out.append("D")
        else:
            out.append(ch)
    return "".join(out)


# --- phụ âm đầu ---------------------------------------------------------------

INITIALS = ["ngh", "ng", "nh", "ch", "gh", "gi", "kh", "ph", "th", "tr", "qu",
            "b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "p", "r", "s",
            "t", "v", "x"]


def _has_vowel(s: str) -> bool:
    return any(ch in CHAR_INFO for ch in s)


def split_syllable(syllable: str) -> tuple[str, str]:
    lower = syllable.lower()
    for init in INITIALS:
        if not lower.startswith(init):
            continue
        rime = syllable[len(init):]
        if init in ("gi", "qu") and not _has_vowel(rime):
            continue
        return syllable[:len(init)], rime
    return "", syllable


def _match_case(sample: str, repl: str) -> str:
    if not sample:
        return repl
    if sample.isupper() and sample.lower() != sample:
        return repl.upper()
    if _is_upper(sample[0]):
        return repl[0].upper() + repl[1:]
    return repl


def set_initial(syllable: str, new_initial: str) -> str:
    initial, rime = split_syllable(syllable)
    init, body = new_initial, rime

    first_vowel = next((c for c in rime if c in CHAR_INFO), None)
    front = False
    if first_vowel:
        front = VOWEL_TABLE[CHAR_INFO[first_vowel][0]][0] in ("e", "ê", "i", "y")

    if init in ("c", "k"):
        init = "k" if front else "c"
    if init in ("g", "gh"):
        init = "gh" if front else "g"
    if init in ("ng", "ngh"):
        init = "ngh" if front else "ng"

    if init == "gi" and first_vowel:
        info = CHAR_INFO.get(body[0]) if body else None
        if info and VOWEL_TABLE[info[0]][0] == "i":
            body = body[1:] or body

    return _match_case(initial or syllable, init) + body


# --- âm cuối ------------------------------------------------------------------

FINALS = ["nh", "ng", "ch", "c", "m", "n", "p", "t"]


def get_final(syllable: str) -> str:
    lower = syllable.lower()
    for f in FINALS:
        if lower.endswith(f):
            return f
    return ""


def set_final(syllable: str, new_final: str) -> str:
    cur = get_final(syllable)
    stem = syllable[: len(syllable) - len(cur)] if cur else syllable
    return stem + new_final


# --- bộ nhãn biến đổi ---------------------------------------------------------
# Model dự đoán MỘT NHÃN trong tập cố định này, không dự đoán từ.
# Không gian đầu ra bé, model nhẹ, và về cấu trúc không thể sinh từ ngoài tập.

TAGS: dict[str, callable] = {
    "KEEP": lambda s: s,
    # Sáu nhãn "đặt thanh thành X" thay cho cặp HOI_NGA/NGA_HOI.
    # Đo trên VSEC: chỉ hỏi<->ngã phủ được 7.6% lỗi, sáu nhãn này phủ 49.7%,
    # cộng phụ âm và âm cuối thành 54.5%. Bốn nhãn thêm vào, gấp bảy lần
    # coverage — và hỏi/ngã vẫn nằm trọn trong đó.
    "TONE_NGANG": lambda s: set_tone(s, NGANG),
    "TONE_HUYEN": lambda s: set_tone(s, HUYEN),
    "TONE_SAC": lambda s: set_tone(s, SAC),
    "TONE_HOI": lambda s: set_tone(s, HOI),
    "TONE_NGA": lambda s: set_tone(s, NGA),
    "TONE_NANG": lambda s: set_tone(s, NANG),
    "L_N": lambda s: set_initial(s, "n"),
    "N_L": lambda s: set_initial(s, "l"),
    "CH_TR": lambda s: set_initial(s, "tr"),
    "TR_CH": lambda s: set_initial(s, "ch"),
    "S_X": lambda s: set_initial(s, "x"),
    "X_S": lambda s: set_initial(s, "s"),
    "D_GI": lambda s: set_initial(s, "gi"),
    "GI_D": lambda s: set_initial(s, "d"),
    "D_R": lambda s: set_initial(s, "r"),
    "R_D": lambda s: set_initial(s, "d"),
    "GI_R": lambda s: set_initial(s, "r"),
    "R_GI": lambda s: set_initial(s, "gi"),
    "N_NG": lambda s: set_final(s, "ng"),
    "NG_N": lambda s: set_final(s, "n"),
    "C_T": lambda s: set_final(s, "t"),
    "T_C": lambda s: set_final(s, "c"),
}

TAG_NAMES = list(TAGS.keys())
TAG_INDEX = {t: i for i, t in enumerate(TAG_NAMES)}

TONE_TAGS = ["TONE_NGANG", "TONE_HUYEN", "TONE_SAC", "TONE_HOI", "TONE_NGA", "TONE_NANG"]


def tag_between(src: str, dst: str, lexicon: set[str] | None = None) -> str | None:
    """Nhãn nào biến src thành dst? None nếu bộ nhãn không biểu diễn được.

    Thay cho bảng INVERSE_TAG tĩnh trước đây. Với nhãn đặt-thanh thì nghịch
    đảo không cố định — nó phụ thuộc thanh gốc của từ đúng — nên phải tra chứ
    không tra bảng được. Hàm này cũng chính là thứ evaluate.py cần để biết một
    cặp (sai, đúng) có nằm trong tầm với của model hay không.
    """
    if src == dst:
        return "KEEP"
    for tag in applicable_tags(src, lexicon):
        if tag != "KEEP" and TAGS[tag](src) == dst:
            return tag
    return None


def applicable_tags(syllable: str, lexicon: set[str] | None = None) -> list[str]:
    """Nhãn nào áp dụng được cho âm tiết này — tầng thu hẹp không gian đầu ra."""
    out = ["KEEP"]
    tone = get_tone(syllable)
    initial, _ = split_syllable(syllable)
    init = initial.lower()
    final = get_final(syllable)

    def consider(name: str) -> None:
        nxt = TAGS[name](syllable)
        if nxt == syllable:
            return
        if lexicon is not None and nxt.lower() not in lexicon:
            return
        out.append(name)

    # Mọi thanh khác thanh hiện tại đều là ứng viên. Từ điển lọc phần vô nghĩa.
    if tone is not None:
        for t, name in enumerate(TONE_TAGS):
            if t != tone[0]:
                consider(name)

    if init == "l": consider("L_N")
    if init == "n": consider("N_L")
    if init == "ch": consider("CH_TR")
    if init == "tr": consider("TR_CH")
    if init == "s": consider("S_X")
    if init == "x": consider("X_S")
    if init == "d": consider("D_GI"); consider("D_R")
    if init == "gi": consider("GI_D"); consider("GI_R")
    if init == "r": consider("R_D"); consider("R_GI")

    if final == "n": consider("N_NG")
    if final == "ng": consider("NG_N")
    if final == "c": consider("C_T")
    if final == "t": consider("T_C")

    return out


# --- tách token ---------------------------------------------------------------

WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


def tokenize(text: str) -> list[tuple[str, int, int]]:
    """(chuỗi, start, end) — offset phải khớp bản JS để ánh xạ được lên DOM."""
    return [(m.group(0), m.start(), m.end()) for m in WORD_RE.finditer(text)]


def normalize(text: str) -> str:
    """Chuẩn hoá Unicode về NFC. Tiếng Việt có hai cách mã hoá dấu; nếu không
    chuẩn hoá thì 'nỗ' dựng sẵn và 'nỗ' tổ hợp là hai chuỗi khác nhau."""
    return unicodedata.normalize("NFC", text)

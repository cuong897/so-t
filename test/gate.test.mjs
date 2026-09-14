import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OnnxEngine, thresholdsFor } from '../extension/src/engine/onnxEngine.js';
import { TAG_NAMES } from '../extension/src/engine/vi.js';

// Fixture do ml/export_gate_cases.py sinh ra, kèm sẵn đáp án của gate.py.
// Chưa chạy script đó thì bỏ qua thay vì fail — repo mới clone không có.
const casesPath = path.join(import.meta.dirname, '..', 'extension', 'models',
  '_gate_cases.json');
const hasFixture = fs.existsSync(casesPath);

/**
 * Gọi thẳng _decode mà KHÔNG nạp model.
 *
 * _decode đọc logit từ một mảng phẳng dài nTags theo ĐÚNG thứ tự tagNames, nên
 * phải rải logit của fixture về đúng ô của từng nhãn. Ô của nhãn không nằm
 * trong `allowed` để -Infinity: _decode bỏ qua chúng, và nếu có ngày nó quên bỏ
 * qua thì giá trị đó làm test đổ ngay thay vì lặng lẽ đổi kết quả.
 */
function decodeOne(engine, c) {
  const row = new Float32Array(TAG_NAMES.length).fill(-Infinity);
  c.allowed.forEach((tag, i) => { row[TAG_NAMES.indexOf(tag)] = c.logits[i]; });
  return engine._decode(row, 0, TAG_NAMES.length, c.token, c.allowed);
}

test('onnxEngine._decode quyết định GIỐNG HỆT gate.py bên Python',
  { skip: !hasFixture }, () => {
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
    assert.ok(cases.length > 500, `mới ${cases.length} ca, quá ít để tin`);

    let fired = 0;
    let mismatch = null;
    for (const c of cases) {
      const engine = new OnnxEngine({
        threshold: c.threshold,
        margin: c.margin,
        thresholds: c.thresholds,
      });
      const got = decodeOne(engine, c);
      const gotTag = got ? got.tag : 'KEEP';
      if (gotTag !== 'KEEP') fired++;
      if (!mismatch && gotTag !== c.expected) {
        mismatch = `token "${c.token}" ngưỡng ${c.threshold} biên ${c.margin}`
          + `${c.thresholds ? ' (có bảng ngưỡng riêng)' : ''}: `
          + `js=${gotTag} python=${c.expected}`;
      }
    }
    assert.equal(mismatch, null, mismatch ?? '');
    // Fixture phải có cả hai nhánh, nếu không thì nó chỉ canh được một nửa.
    assert.ok(fired > 50 && fired < cases.length - 50,
      `chỉ ${fired}/${cases.length} ca báo — fixture lệch hẳn về một phía`);
  });

test('bảng ngưỡng riêng thật sự được TRA, không phải dùng nhầm hằng số', () => {
  // Cùng một bộ logit, chỉ đổi ngưỡng của đúng nhãn thắng cuộc.
  const allowed = ['KEEP', 'TONE_NGA'];
  const logits = [0.0, 2.2];              // p(TONE_NGA) ~ 0.900
  const mk = (thresholds) => {
    const e = new OnnxEngine({ threshold: 0.95, margin: 0.25, thresholds });
    const row = new Float32Array(TAG_NAMES.length).fill(-Infinity);
    allowed.forEach((t, i) => { row[TAG_NAMES.indexOf(t)] = logits[i]; });
    return e._decode(row, 0, TAG_NAMES.length, 'ma', allowed);
  };

  assert.equal(mk(null), null, 'ở 0,95 thì p=0,90 phải im lặng');
  assert.ok(mk({ TONE_NGA: 0.85 }), 'hạ riêng ngưỡng của TONE_NGA thì phải báo');
  assert.equal(mk({ N_NG: 0.10 }), null,
    'hạ ngưỡng của nhãn KHÁC thì không được ảnh hưởng gì');
});

test('ngưỡng tra theo nhãn THẮNG, nên bảng ngưỡng không đổi ĐỀ XUẤT', () => {
  // TONE_NGA thắng argmax; hạ ngưỡng cho một nhãn yếu hơn không được phép
  // lôi nhãn yếu đó lên thành đề xuất.
  const allowed = ['KEEP', 'TONE_NGA', 'TONE_HOI'];
  const logits = [0.0, 2.2, 1.0];
  const e = new OnnxEngine({
    threshold: 0.95, margin: 0.25, thresholds: { TONE_HOI: 0.01 },
  });
  const row = new Float32Array(TAG_NAMES.length).fill(-Infinity);
  allowed.forEach((t, i) => { row[TAG_NAMES.indexOf(t)] = logits[i]; });
  assert.equal(e._decode(row, 0, TAG_NAMES.length, 'ma', allowed), null,
    'nhãn yếu được hạ ngưỡng không được trở thành đề xuất');
});

test('mặc định là BẢNG ĐANG SHIP: phụ âm 0,90, thanh điệu 0,95', () => {
  const tbl = thresholdsFor();
  assert.equal(tbl.TONE_NGA, 0.95, 'thanh điệu phải giữ 0,95');
  assert.equal(tbl.D_GI, 0.90, 'phụ âm phải là 0,90');
  assert.equal(tbl.N_NG, 0.90, 'âm cuối tính là phụ âm');
  // Dựng engine không truyền gì -> phải lấy đúng bảng đó.
  assert.deepEqual(new OnnxEngine().thresholds, tbl);
  // Truyền null TƯỜNG MINH -> quay về một ngưỡng dùng chung.
  assert.equal(new OnnxEngine({ thresholds: null }).thresholds, null);
});

test('mặc định: p = 0,92 thì nhãn phụ âm BÁO còn nhãn thanh điệu IM', () => {
  // Cùng một cặp logit, chỉ khác nhãn nào đang tranh với KEEP.
  const fire = (tag) => {
    const allowed = ['KEEP', tag];
    const logits = [0.0, 2.45];            // p(tag) ~ 0,921
    const e = new OnnxEngine();            // không truyền gì: bảng đang ship
    const row = new Float32Array(TAG_NAMES.length).fill(-Infinity);
    allowed.forEach((t, i) => { row[TAG_NAMES.indexOf(t)] = logits[i]; });
    return e._decode(row, 0, TAG_NAMES.length, 'da', allowed) !== null;
  };
  assert.equal(fire('D_GI'), true, 'phụ âm ở 0,92 phải vượt ngưỡng 0,90');
  assert.equal(fire('TONE_NGA'), false, 'thanh điệu ở 0,92 chưa tới 0,95');
});

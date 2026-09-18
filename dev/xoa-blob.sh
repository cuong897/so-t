#!/usr/bin/env bash
# Xoá blob 311MB khỏi LỊCH SỬ git (việc số 2 của bàn giao) — có kiểm chứng trước và sau.
#
# Vì sao là script chứ không phải một dòng lệnh: dán lệnh dài vào Git Bash bị terminal
# chèn mã bracketed-paste (^[[200~) vào đầu dòng và bash báo "command not found".
#
# Đã chạy thử trọn vẹn trên bản sao dùng một lần (git clone --mirror, D:/soat-thu-loc):
# cây HEAD giữ nguyên, vẫn 88 commit, chuỗi thông điệp trùng khít, .git 627 MB -> 2,6 MB.
#
# Chạy:  bash "D:/chua co idea/dev/xoa-blob.sh"
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONG_DOI_HEAD="64e3ea9d3a50de54b4c66256c4cdaf7af6bda537"
MONG_DOI_TREE="813ab3de657c77d00a140d0d697d18d416992953"
MONG_DOI_SO_COMMIT="88"
BACKUP="/d/soat-git-backup-2026-09-18"

cd "$REPO"

echo "== kiểm tra trước khi đụng gì =="
[ -d "$BACKUP" ] || { echo "DỪNG: không thấy backup $BACKUP"; exit 1; }
HEAD_HIEN_TAI="$(git rev-parse HEAD)"
if [ "$HEAD_HIEN_TAI" != "$MONG_DOI_HEAD" ]; then
  echo "DỪNG: HEAD là $HEAD_HIEN_TAI, không phải $MONG_DOI_HEAD."
  echo "      Repo đã có commit mới sau lúc chuẩn bị — kiểm lại mốc rồi hãy chạy."
  exit 1
fi
# File chưa theo dõi thì không sao (chính script này có thể là một); nhưng thay đổi đã
# theo dõi thì phải commit trước, vì rewrite đụng vào mọi commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "DỪNG: có thay đổi chưa commit. Commit hoặc cất tạm rồi chạy lại."; exit 1
fi
MSG_CU="$(git log --format='%s' HEAD | md5sum | cut -d' ' -f1)"
echo "   HEAD đúng, không có thay đổi chưa commit, backup có ($(du -sh "$BACKUP" | cut -f1))"
echo "   .git trước khi xoá: $(du -sh .git | cut -f1)"

echo
echo "== viết lại lịch sử (khoảng 40 giây) =="
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --index-filter "git rm --cached --ignore-unmatch extension/models/soat.fp32.onnx.data" \
  -- --all

echo
echo "== bỏ ref gốc, dọn rác =="
git for-each-ref --format='%(refname)' refs/original | xargs -r -n 1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now --quiet

echo
echo "== kiểm chứng =="
LOI=0
TREE_MOI="$(git rev-parse HEAD^{tree})"
SO_COMMIT="$(git rev-list --count HEAD)"
MSG_MOI="$(git log --format='%s' HEAD | md5sum | cut -d' ' -f1)"
BLOB_LON="$(git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" && $3 > 20000000 {print $4}' | head -3)"

[ "$TREE_MOI" = "$MONG_DOI_TREE" ] && echo "   OK  cây HEAD giữ nguyên: $TREE_MOI" \
  || { echo "   SAI cây HEAD đổi: $TREE_MOI (mong đợi $MONG_DOI_TREE)"; LOI=1; }
[ "$SO_COMMIT" = "$MONG_DOI_SO_COMMIT" ] && echo "   OK  vẫn $SO_COMMIT commit" \
  || { echo "   SAI còn $SO_COMMIT commit, mong đợi $MONG_DOI_SO_COMMIT"; LOI=1; }
[ "$MSG_MOI" = "$MSG_CU" ] && echo "   OK  chuỗi thông điệp commit trùng khít" \
  || { echo "   SAI chuỗi thông điệp commit đã đổi"; LOI=1; }
[ -z "$BLOB_LON" ] && echo "   OK  không còn blob nào trên 20 MB" \
  || { echo "   SAI vẫn còn blob lớn: $BLOB_LON"; LOI=1; }
echo "   .git sau khi xoá: $(du -sh .git | cut -f1)"

echo
if [ "$LOI" = 0 ]; then
  echo "XONG. Kiểm lại rồi chạy npm run test:all."
  echo "Khi yên tâm thì xoá $BACKUP và /d/soat-thu-loc để lấy lại ~632 MB."
else
  echo "CÓ KIỂM TRA KHÔNG ĐẠT. Khôi phục: xoá '$REPO/.git' rồi chép $BACKUP vào thay."
  exit 1
fi

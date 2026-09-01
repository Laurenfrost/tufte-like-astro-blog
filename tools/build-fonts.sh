#!/bin/bash
#
# Regenerate src/fonts/ from the upstream font files.
#
#   ./tools/build-fonts.sh <dir-with-original-ttfs>
#
# The originals are not kept in this repo — they are large, and everything the
# theme serves is derived from them. Grab them from upstream when you need to
# rebuild:
#
#   ET Book      https://github.com/edwardtufte/et-book
#   EB Garamond  https://fonts.google.com/specimen/EB+Garamond
#   霞鹜字体      https://github.com/lxgw
#
# Latin faces are converted whole: they are small, and EB Garamond has to keep
# its `wght` variation axis, which subsetting would drop.
#
# The CJK families are split into unicode-range slices. LXGWWenKai is 24MB as a
# TTF; sliced, a page pulls only the tens of KB covering the characters it
# renders. cn-font-split writes an index.css next to the slices, which
# src/styles/fonts.css imports.
#
# Requires: node (for npx), python3.
set -euo pipefail

SRC=${1:?usage: build-fonts.sh <dir-with-original-ttfs>}
THEME=$(cd "$(dirname "$0")/.." && pwd)
OUT=$THEME/src/fonts
VENV=$(mktemp -d)/venv

echo "==> Python 依赖"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q fonttools brotli

rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> CJK：按 unicode-range 分片"
split_cjk() {
  local file=$1 family=$2 dir=$3
  npx -y cn-font-split@7.4.3 run \
    -i "$file" -o "$OUT/$dir" \
    --css.fontFamily "$family" --css.fontDisplay swap \
    --css.fileName "index" --testHtml false --reporter false >/dev/null 2>&1
  rm -f "$OUT/$dir/index.proto"
  # cn-font-split writes the stylesheet without an extension.
  [ -f "$OUT/$dir/index" ] && mv "$OUT/$dir/index" "$OUT/$dir/index.css"
  printf "    %-18s %6s → %6s (%s 片)\n" "$family" \
    "$(du -h "$file" | cut -f1)" "$(du -sh "$OUT/$dir" | cut -f1)" \
    "$(ls "$OUT/$dir"/*.woff2 | wc -l | tr -d ' ')"
}

split_cjk "$SRC/LXGWNeoZhiSong.ttf"     "LXGWNeoZhiSong"   "Lxgw/LxgwNeoZhiSong"
split_cjk "$SRC/LXGWWenKai-Regular.ttf" "LXGWWenKai"       "Lxgw/LxgwWenKai"
split_cjk "$SRC/LXGWHeartSerifCL.ttf"   "LXGWHeartSerifCL" "Lxgw/LxgwHeartSerif"

echo "==> 拉丁：整体转 woff2"
"$VENV/bin/python" - "$SRC" "$OUT" <<'PYEOF'
import os, sys
from fontTools.ttLib import TTFont

src, out = sys.argv[1], sys.argv[2]
targets = [
    ("et-book-roman-old-style-figures.ttf", "et-book/et-book-roman-old-style-figures.woff2"),
    ("et-book-display-italic-old-style-figures.ttf", "et-book/et-book-display-italic-old-style-figures.woff2"),
    ("et-book-semi-bold-old-style-figures.ttf", "et-book/et-book-semi-bold-old-style-figures.woff2"),
    ("et-book-bold-line-figures.ttf", "et-book/et-book-bold-line-figures.woff2"),
    ("et-book-roman-line-figures.ttf", "et-book/et-book-roman-line-figures.woff2"),
    ("EBGaramond-VariableFont_wght.ttf", "EB_Garamond/EBGaramond-VariableFont_wght.woff2"),
    ("EBGaramond-Italic-VariableFont_wght.ttf", "EB_Garamond/EBGaramond-Italic-VariableFont_wght.woff2"),
]

for rel_in, rel_out in targets:
    src_path = os.path.join(src, rel_in)
    dst_path = os.path.join(out, rel_out)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    font = TTFont(src_path)
    axes = [a.axisTag for a in font["fvar"].axes] if "fvar" in font else []
    font.flavor = "woff2"
    font.save(dst_path)
    before = os.path.getsize(src_path) / 1024
    after = os.path.getsize(dst_path) / 1024
    print(f"    {os.path.basename(rel_out):50} {before:7.0f}K → {after:6.0f}K"
          + (f"  轴={axes}" if axes else ""))
PYEOF

echo "==> 完成：$(du -sh "$OUT" | cut -f1)"

#!/bin/bash

# スクリプトの存在するディレクトリを基準にプロジェクトルート（親ディレクトリ）を特定
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# プロジェクトルートに移動
cd "$PROJECT_ROOT" || { echo "Error: Could not change to project root"; exit 1; }

# 出力ファイル名
OUTPUT_ZIP="web-collections-extension.zip"

# 既存のZIPがあれば削除
if [ -f "$OUTPUT_ZIP" ]; then
    rm "$OUTPUT_ZIP"
fi

echo "Packaging extension from: $PROJECT_ROOT"

# パッケージング実行
zip -r "$OUTPUT_ZIP" \
    manifest.json \
    js/ \
    html/ \
    css/ \
    icons/ \
    _locales/ \
    -x "*.DS_Store*" "*__MACOSX*"

if [ $? -eq 0 ]; then
    echo "--------------------------------------------------"
    echo "Package created: $(pwd)/$OUTPUT_ZIP"
    echo "Included directories: js, html, css, icons, _locales"
    echo "--------------------------------------------------"
else
    echo "Error: Packaging failed."
    exit 1
fi

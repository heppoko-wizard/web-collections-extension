#!/usr/bin/env python3
import sqlite3
import json
import os
import sys
import uuid
import datetime
import base64
from io import BytesIO

# 画像処理用（Optional - PILがあればリサイズ・最適化）
try:
    from PIL import Image
    HAS_PIL = True
    print("✓ PIL detected - image optimization enabled")
except ImportError:
    HAS_PIL = False
    print("! PIL not found - images will be exported as-is (install pillow for optimization)")

# データベースのデフォルトパス候補
PATHS = [
    # Linux
    os.path.expanduser("~/.config/microsoft-edge/Default/Collections/collectionsSQLite"),
    os.path.expanduser("~/.config/microsoft-edge-dev/Default/Collections/collectionsSQLite"),
    os.path.expanduser("~/.config/microsoft-edge-beta/Default/Collections/collectionsSQLite"),
    # Windows (WSLからアクセスする場合の例)
    # "/mnt/c/Users/<USER>/AppData/Local/Microsoft/Edge/User Data/Default/Collections/collectionsSQLite"
]

# 画像最適化設定
MAX_DIMENSION = 320
WEBP_QUALITY = 70

def find_db_path():
    """データベースファイルを探す"""
    for path in PATHS:
        if os.path.exists(path):
            return path
    return None

def optimize_image_blob(image_blob):
    """画像BLOBを最適化してBase64文字列に変換"""
    if not image_blob or not HAS_PIL:
        return None
    
    try:
        # BLOBから画像を読み込み
        img = Image.open(BytesIO(image_blob))
        
        # RGBに変換（WebPはRGBAも対応だが念のため）
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # アスペクト比を維持してリサイズ
        width, height = img.size
        if width > MAX_DIMENSION or height > MAX_DIMENSION:
            if width > height:
                new_width = MAX_DIMENSION
                new_height = int(height * (MAX_DIMENSION / width))
            else:
                new_height = MAX_DIMENSION
                new_width = int(width * (MAX_DIMENSION / height))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # WebPに変換してBase64エンコード
        buffer = BytesIO()
        img.save(buffer, format='WEBP', quality=WEBP_QUALITY)
        base64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return f"data:image/webp;base64,{base64_str}", img.size
    except Exception as e:
        print(f"  Warning: Failed to optimize image: {e}")
        return None

def main():
    print("Edge Collections Migration Tool")
    print("===============================")

    # パスが引数で渡された場合はそれを使用
    db_path = sys.argv[1] if len(sys.argv) > 1 else find_db_path()

    if not db_path:
        print("Error: データベースファイルが見つかりませんでした。")
        print("パスを引数として指定してください: python3 migrate_collections.py <path_to_collectionsSQLite>")
        # Windowsユーザー向けのエラーメッセージ例
        print("\n[ヒント] Windowsの場合のパス例:")
        print(r"C:\Users\あなたのユーザー名\AppData\Local\Microsoft\Edge\User Data\Default\Collections\collectionsSQLite")
        sys.exit(1)

    print(f"Reading database: {db_path}")

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # コレクション取得
        cursor.execute("SELECT * FROM collections WHERE is_marked_for_deletion = 0")
        collections_rows = cursor.fetchall()
        
        export_data = {"collections": []}
        total_images_optimized = 0

        for col_row in collections_rows:
            collection_id = str(uuid.uuid4())
            original_id = col_row['id']
            name = col_row['title']
            
            created_at = datetime.datetime.now().isoformat()

            new_collection = {
                "id": collection_id,
                "name": name,
                "items": [],
                "createdAt": 1700000000000, 
                "updatedAt": 1700000000000
            }

            # アイテム取得
            cursor.execute(f"""
                SELECT i.* 
                FROM items i
                JOIN collections_items_relationship r ON i.id = r.item_id
                WHERE r.parent_id = ? AND i.is_marked_for_deletion = 0
                ORDER BY r.position
            """, (original_id,))

            items_rows = cursor.fetchall()

            for item_row in items_rows:
                item_source_blob = item_row['source'] # BLOB
                item_source = ""
                
                # BLOBを文字列にデコード
                if item_source_blob:
                    try:
                        item_source = item_source_blob.decode('utf-8')
                    except:
                        item_source = str(item_source_blob)

                item_type = 'webpage'
                url = ""
                title = item_row['title']
                content = item_row['text_content']
                image_url = ""
                thumbnail_base64 = None
                thumbnail_size = None

                # sourceカラムの解析
                try:
                    if item_source:
                        source_data = json.loads(item_source)
                        url = source_data.get('url', '')
                except:
                    url = item_source

                # typeの推定
                db_type = item_row['type']
                if db_type == 'Note':
                    item_type = 'note'
                    if not content: content = title
                elif db_type == 'Image':
                    item_type = 'image'
                    image_url = item_row['canonical_image_url'] or url
                    
                    # 画像BLOBを取得して最適化
                    canonical_image_data = item_row['canonical_image_data']
                    if canonical_image_data:
                        result = optimize_image_blob(canonical_image_data)
                        if result:
                            thumbnail_base64, thumbnail_size = result
                            total_images_optimized += 1
                            print(f"  ✓ Optimized image: {title[:30]}... ({thumbnail_size[0]}x{thumbnail_size[1]})")
                    
                elif db_type == 'Page':
                    item_type = 'webpage'
                else:
                    # フォールバック
                    if "data:image" in url or (url and url.endswith(('.png', '.jpg', '.jpeg', '.gif'))):
                        item_type = 'image'
                        image_url = url
                    elif not url and content:
                        item_type = 'note'
                    else:
                        item_type = 'webpage'

                new_item = {
                    "id": str(uuid.uuid4()),
                    "type": item_type,
                    "title": title,
                    "url": url,
                    "content": content,
                    "savedAt": 1700000000000,
                    "sortOrder": len(new_collection['items'])
                }

                if item_type == 'image':
                    new_item['imageUrl'] = image_url
                    new_item['sourceUrl'] = ""
                    if thumbnail_base64:
                        new_item['thumbnailBase64'] = thumbnail_base64
                        new_item['thumbnailWidth'] = thumbnail_size[0]
                        new_item['thumbnailHeight'] = thumbnail_size[1]

                new_collection['items'].append(new_item)

            export_data['collections'].append(new_collection)
            print(f"  Exported: {name} ({len(new_collection['items'])} items)")

        conn.close()

        # JSON出力
        output_file = "collections_migrated.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*50}")
        print(f"✓ Success! Exported to {output_file}")
        print(f"  Images optimized: {total_images_optimized}")
        print(f"{'='*50}")
        print("このファイルを拡張機能の設定画面から「インポート」してください。")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

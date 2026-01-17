import sqlite3
import os
import sys

# DBパス（さっきのエラーログから取得）
db_path = "/home/heppo/.config/microsoft-edge/Default/Collections/collectionsSQLite"

if not os.path.exists(db_path):
    print(f"File not found: {db_path}")
    sys.exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# テーブル一覧
print("--- Tables ---")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
for table in tables:
    print(f"Table: {table[0]}")
    # カラム情報
    cursor.execute(f"PRAGMA table_info({table[0]})")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  - {col[1]} ({col[2]})")

conn.close()

import os
import json
import sqlite3
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
import re

IS_VERCEL = os.environ.get("VERCEL") == "1"

if IS_VERCEL:
    CONFIG_PATH = "/tmp/config.json"
    DB_PATH = "/tmp/library.db"
else:
    CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
    DB_PATH = os.path.join(os.path.dirname(__file__), "library.db")

# Default Config
DEFAULT_CONFIG = {
    "supabase_url": os.environ.get("SUPABASE_URL", ""),
    "supabase_key": os.environ.get("SUPABASE_KEY", ""),
    "admin_pin": os.environ.get("ADMIN_PIN", "admin2026"),
    "use_supabase": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_KEY"))
}


def load_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            # Ensure all keys exist
            for k, v in DEFAULT_CONFIG.items():
                if k not in cfg:
                    cfg[k] = v
            return cfg
    except Exception:
        return DEFAULT_CONFIG.copy()


def save_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(new_config, f, indent=4, ensure_ascii=False)
    return new_config


# Initialize SQLite Database
def init_sqlite_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        slide_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS slides (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        slide_number INTEGER NOT NULL,
        title TEXT DEFAULT '',
        content TEXT NOT NULL,
        images TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    )
    """)
    # Migration if table already existed without images column
    try:
        c.execute("ALTER TABLE slides ADD COLUMN images TEXT DEFAULT '[]'")
    except Exception:
        pass
    c.execute("CREATE INDEX IF NOT EXISTS idx_local_slides_book ON slides(book_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_local_slides_num ON slides(slide_number)")
    conn.commit()
    conn.close()


init_sqlite_db()


def clean_supabase_url(url: str) -> str:
    """Strip /rest/v1 or trailing slashes from project URL."""
    if not url:
        return ""
    url = url.strip()
    if "/rest/v1" in url:
        url = url.split("/rest/v1")[0]
    return url.rstrip("/")


def get_supabase_client():
    cfg = load_config()
    url = clean_supabase_url(cfg.get("supabase_url", ""))
    key = cfg.get("supabase_key", "").strip()
    if url and key:
        try:
            from supabase import create_client
            client = create_client(url, key)
            return client
        except Exception as e:
            print("Supabase ulanishida xatolik:", e)
    return None


def test_supabase_connection(url: str, key: str) -> Dict[str, Any]:
    """Test if Supabase URL and Key are valid and can reach the database."""
    url = clean_supabase_url(url)
    key = key.strip()
    if not url or not key:
        return {"success": False, "message": "Supabase URL va API Kalit kiritilmagan."}
    try:
        from supabase import create_client
        client = create_client(url, key)
        # Try fetching count from books
        res = client.table("books").select("id", count="exact").limit(1).execute()
        return {"success": True, "message": "Supabase bilan muvaffaqiyatli ulandi!"}
    except Exception as e:
        err_msg = str(e)
        if "relation \"public.books\" does not exist" in err_msg.lower() or "pgrst205" in err_msg.lower() or "could not find the table" in err_msg.lower():
            return {
                "success": False,
                "message": "Supabase ulandi, lekin 'books' jadvali topilmadi. Iltimos, '📜 Supabase SQL kodi' tugmasini bosib, kodni Supabase SQL Editor'da Run qiling."
            }
        return {"success": False, "message": f"Supabase ulanish xatosi: {err_msg}"}


def extract_context_snippet(content: str, query: str, max_chars: int = 220) -> str:
    """Extract snippet centered around the query with ellipsis."""
    if not content or not query:
        return content[:max_chars] + "..." if len(content) > max_chars else content

    match = re.search(re.escape(query), content, re.IGNORECASE)
    if not match:
        return content[:max_chars] + "..." if len(content) > max_chars else content

    start_idx, end_idx = match.span()
    half = (max_chars - (end_idx - start_idx)) // 2
    left = max(0, start_idx - half)
    right = min(len(content), end_idx + half)

    # Word boundary adjustments
    if left > 0:
        first_space = content.find(" ", left)
        if first_space != -1 and first_space < start_idx:
            left = first_space + 1
    if right < len(content):
        last_space = content.rfind(" ", start_idx, right)
        if last_space != -1 and last_space > end_idx:
            right = last_space

    snippet = content[left:right].strip()
    if left > 0:
        snippet = "..." + snippet
    if right < len(content):
        snippet = snippet + "..."
    return snippet


# --- Operations ---

def save_book_to_db(parsed_data: Dict[str, Any], original_filename: str) -> Dict[str, Any]:
    """Save book and its slides to SQLite and Supabase if configured."""
    book_id = str(uuid.uuid4())
    now_str = datetime.utcnow().isoformat()
    title = parsed_data.get("title", original_filename).strip()
    file_type = parsed_data.get("file_type", "pptx")
    slide_count = parsed_data.get("slide_count", 0)
    slides = parsed_data.get("slides", [])

    # 1. Save to SQLite
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO books (id, title, original_filename, file_type, slide_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (book_id, title, original_filename, file_type, slide_count, now_str)
    )
    for s in slides:
        slide_id = str(uuid.uuid4())
        images_json = json.dumps(s.get("images", []))
        c.execute(
            "INSERT INTO slides (id, book_id, slide_number, title, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (slide_id, book_id, s.get("slide_number", 1), s.get("title", ""), s.get("content", ""), images_json, now_str)
        )
    conn.commit()
    conn.close()

    # 2. Save to Supabase (if configured)
    supabase = get_supabase_client()
    supabase_synced = False
    if supabase:
        try:
            # Insert book
            supabase.table("books").insert({
                "id": book_id,
                "title": title,
                "original_filename": original_filename,
                "file_type": file_type,
                "slide_count": slide_count,
                "created_at": now_str
            }).execute()

            # Insert slides in batches
            batch = []
            for s in slides:
                batch.append({
                    "id": str(uuid.uuid4()),
                    "book_id": book_id,
                    "slide_number": s.get("slide_number", 1),
                    "title": s.get("title", ""),
                    "content": s.get("content", ""),
                    "images": json.dumps(s.get("images", [])),
                    "created_at": now_str
                })
            # Insert batch
            if batch:
                for i in range(0, len(batch), 50):
                    supabase.table("slides").insert(batch[i:i+50]).execute()
            supabase_synced = True
        except Exception as e:
            print("Supabase-ga saqlashda xatolik:", e)

    return {
        "id": book_id,
        "title": title,
        "slide_count": slide_count,
        "file_type": file_type,
        "supabase_synced": supabase_synced
    }


def list_books() -> List[Dict[str, Any]]:
    """List all books from database."""
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("books").select("*").order("created_at", desc=True).execute()
            if res.data:
                return res.data
        except Exception as e:
            print("Supabase-dan darsliklarni olishda xatolik, SQLite ishlatiladi:", e)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM books ORDER BY created_at DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def get_book_details(book_id: str) -> Optional[Dict[str, Any]]:
    """Get full details of a book including all its slides for reading."""
    supabase = get_supabase_client()
    if supabase:
        try:
            b_res = supabase.table("books").select("*").eq("id", book_id).single().execute()
            s_res = supabase.table("slides").select("*").eq("book_id", book_id).order("slide_number").execute()
            if b_res.data:
                book = b_res.data
                book["slides"] = s_res.data or []
                return book
        except Exception as e:
            print("Supabase-dan darslik ma'lumotini olishda xatolik, SQLite ishlatiladi:", e)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM books WHERE id = ?", (book_id,))
    book_row = c.fetchone()
    if not book_row:
        conn.close()
        return None

    book = dict(book_row)
    c.execute("SELECT * FROM slides WHERE book_id = ? ORDER BY slide_number ASC", (book_id,))
    slides = []
    for r in c.fetchall():
        s = dict(r)
        raw_imgs = s.get("images", "[]")
        if isinstance(raw_imgs, str):
            try:
                s["images"] = json.loads(raw_imgs)
            except Exception:
                s["images"] = []
        elif not isinstance(raw_imgs, list):
            s["images"] = []
        slides.append(s)
    conn.close()
    book["slides"] = slides
    return book


def delete_book(book_id: str) -> bool:
    """Delete a book and all its slides."""
    supabase = get_supabase_client()
    if supabase:
        try:
            supabase.table("books").delete().eq("id", book_id).execute()
        except Exception as e:
            print("Supabase-dan o'chirishda xatolik:", e)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM slides WHERE book_id = ?", (book_id,))
    c.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    conn.close()
    return True


def search_content(query: str, mode: str = "all") -> List[Dict[str, Any]]:
    """
    Search materials by query.
    mode:
      - 'all': Searches both book titles and slide content
      - 'content': Searches inside slide/page text only
      - 'title': Searches book/topic title only
    """
    query = query.strip()
    if not query:
        return []

    results: List[Dict[str, Any]] = []
    seen_matches = set()

    # Search in SQLite
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    q_pattern = f"%{query}%"

    # 1. Slide content search
    if mode in ["all", "content"]:
        c.execute("""
            SELECT s.id, s.book_id, s.slide_number, s.title AS slide_title, s.content, b.title AS book_title, b.file_type
            FROM slides s
            JOIN books b ON s.book_id = b.id
            WHERE s.content LIKE ? OR s.title LIKE ?
            ORDER BY s.book_id, s.slide_number ASC
            LIMIT 50
        """, (q_pattern, q_pattern))
        for row in c.fetchall():
            r = dict(row)
            snippet = extract_context_snippet(r["content"], query)
            key = f"{r['book_id']}_{r['slide_number']}"
            if key not in seen_matches:
                seen_matches.add(key)
                results.append({
                    "id": r["id"],
                    "book_id": r["book_id"],
                    "book_title": r["book_title"],
                    "file_type": r["file_type"],
                    "slide_number": r["slide_number"],
                    "slide_title": r["slide_title"],
                    "snippet": snippet,
                    "match_type": "content",
                    "matched_query": query
                })

    # 2. Book title search
    if mode in ["all", "title"]:
        c.execute("""
            SELECT id, title, file_type, slide_count
            FROM books
            WHERE title LIKE ?
            ORDER BY created_at DESC
            LIMIT 20
        """, (q_pattern,))
        for row in c.fetchall():
            r = dict(row)
            # Find the first slide of this book as preview
            c.execute("SELECT title, content FROM slides WHERE book_id = ? ORDER BY slide_number ASC LIMIT 1", (r["id"],))
            first_slide = c.fetchone()
            snippet = ""
            first_slide_title = ""
            if first_slide:
                first_slide_title = first_slide["title"]
                snippet = (first_slide["content"][:200] + "...") if len(first_slide["content"]) > 200 else first_slide["content"]

            key = f"{r['id']}_title"
            if key not in seen_matches:
                seen_matches.add(key)
                results.append({
                    "id": r["id"],
                    "book_id": r["id"],
                    "book_title": r["title"],
                    "file_type": r["file_type"],
                    "slide_number": 1,
                    "slide_title": first_slide_title or "1-slayd",
                    "snippet": snippet or "Darslik mavzusi qidiruv so'ziga mos keldi.",
                    "match_type": "title",
                    "matched_query": query
                })

    conn.close()
    return results

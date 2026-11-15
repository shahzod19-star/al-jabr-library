import os
import json
import sqlite3
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
import re

IS_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

if IS_VERCEL:
    CONFIG_PATH = "/tmp/config.json"
    DB_PATH = "/tmp/library.db"
else:
    CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
    DB_PATH = os.path.join(os.path.dirname(__file__), "library.db")

# Default Config (can be overridden by environment variables on Vercel)
DEFAULT_CONFIG = {
    "supabase_url": os.environ.get("SUPABASE_URL", ""),
    "supabase_key": os.environ.get("SUPABASE_KEY", ""),
    "admin_pin": os.environ.get("ADMIN_PIN", "admin2026"),
    "use_supabase": bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_KEY"))
}


def load_config() -> Dict[str, Any]:
    cfg = DEFAULT_CONFIG.copy()
    
    # 1. Try bundled config.json in app directory
    bundled_path = os.path.join(os.path.dirname(__file__), "config.json")
    if os.path.exists(bundled_path):
        try:
            with open(bundled_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                for k, v in loaded.items():
                    if v:
                        cfg[k] = v
        except Exception:
            pass

    # 2. Try runtime config (/tmp/config.json) if updated at runtime
    if os.path.exists(CONFIG_PATH) and CONFIG_PATH != bundled_path:
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                for k, v in loaded.items():
                    if v:
                        cfg[k] = v
        except Exception:
            pass
    
    # Environment variables take precedence on Vercel
    if os.environ.get("SUPABASE_URL"):
        cfg["supabase_url"] = os.environ.get("SUPABASE_URL")
    if os.environ.get("SUPABASE_KEY"):
        cfg["supabase_key"] = os.environ.get("SUPABASE_KEY")
    if os.environ.get("ADMIN_PIN"):
        cfg["admin_pin"] = os.environ.get("ADMIN_PIN")
    cfg["use_supabase"] = bool(cfg.get("supabase_url") and cfg.get("supabase_key"))

    return cfg


def save_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(new_config, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print("Config saqlash ogohlantirishi:", e)
    return new_config


# Initialize SQLite Database safely
def init_sqlite_db():
    try:
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
        try:
            c.execute("ALTER TABLE slides ADD COLUMN images TEXT DEFAULT '[]'")
        except Exception:
            pass
        c.execute("CREATE INDEX IF NOT EXISTS idx_local_slides_book ON slides(book_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_local_slides_num ON slides(slide_number)")
        conn.commit()
        conn.close()
    except Exception as e:
        print("SQLite init ogohlantirishi (Bulutda bu normal):", e)


init_sqlite_db()


def clean_supabase_url(url: str) -> str:
    """Strip /rest/v1 or trailing slashes from project URL."""
    if not url:
        return ""
    url = url.strip()
    if "/rest/v1" in url:
        url = url.split("/rest/v1")[0]
    return url.rstrip("/")


DEFAULT_SUPABASE_URL = "https://gjkmovgnqbominhfqevr.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_K9ulnAVpsuv0SuhjEkKCLQ_IqPJKt7r"


def get_supabase_client():
    cfg = load_config()
    url = clean_supabase_url(cfg.get("supabase_url", "") or DEFAULT_SUPABASE_URL)
    key = (cfg.get("supabase_key", "") or DEFAULT_SUPABASE_KEY).strip()
    if url and key:
        try:
            from supabase import create_client
            client = create_client(url, key)
            return client
        except Exception as e:
            print("Supabase ulanishida xatolik:", e)
    return None


def test_supabase_connection(url: str, key: str) -> Dict[str, Any]:
    url = clean_supabase_url(url)
    key = key.strip()
    if not url or not key:
        return {"success": False, "message": "Supabase URL va API Kalit kiritilmagan."}
    try:
        from supabase import create_client
        client = create_client(url, key)
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
    if not content or not query:
        return content[:max_chars] + "..." if len(content) > max_chars else content

    match = re.search(re.escape(query), content, re.IGNORECASE)
    if not match:
        return content[:max_chars] + "..." if len(content) > max_chars else content

    start_idx, end_idx = match.span()
    half = (max_chars - (end_idx - start_idx)) // 2
    left = max(0, start_idx - half)
    right = min(len(content), end_idx + half)

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
    book_id = str(uuid.uuid4())
    now_str = datetime.utcnow().isoformat()
    title = parsed_data.get("title", original_filename).strip()
    file_type = parsed_data.get("file_type", "pptx")
    slide_count = parsed_data.get("slide_count", 0)
    slides = parsed_data.get("slides", [])

    # 1. Save to SQLite (if writable)
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO books (id, title, original_filename, file_type, slide_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (book_id, title, original_filename, file_type, slide_count, now_str)
        )
        for s in slides:
            slide_id = str(uuid.uuid4())
            slide_imgs = s.get("images", [])
            imgs_json = json.dumps(slide_imgs) if isinstance(slide_imgs, list) else str(slide_imgs)
            content_text = s.get("content", "")
            if slide_imgs and "<!-- ALJABR_IMAGES:" not in content_text:
                full_content = f"{content_text}\n\n<!-- ALJABR_IMAGES: {imgs_json} -->"
            else:
                full_content = content_text

            c.execute(
                "INSERT INTO slides (id, book_id, slide_number, title, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (slide_id, book_id, s.get("slide_number", 1), s.get("title", ""), full_content, imgs_json, now_str)
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print("SQLite save warning:", e)

    # 2. Save to Supabase (if configured)
    supabase = get_supabase_client()
    supabase_synced = False
    if supabase:
        try:
            supabase.table("books").insert({
                "id": book_id,
                "title": title,
                "original_filename": original_filename,
                "file_type": file_type,
                "slide_count": slide_count,
                "created_at": now_str
            }).execute()

            batch = []
            for s in slides:
                slide_imgs = s.get("images", [])
                imgs_json = json.dumps(slide_imgs) if isinstance(slide_imgs, list) else str(slide_imgs)
                content_text = s.get("content", "")
                if slide_imgs and "<!-- ALJABR_IMAGES:" not in content_text:
                    full_content = f"{content_text}\n\n<!-- ALJABR_IMAGES: {imgs_json} -->"
                else:
                    full_content = content_text

                batch.append({
                    "id": str(uuid.uuid4()),
                    "book_id": book_id,
                    "slide_number": s.get("slide_number", 1),
                    "title": s.get("title", ""),
                    "content": full_content,
                    "images": imgs_json,
                    "created_at": now_str
                })
            if batch:
                try:
                    for i in range(0, len(batch), 50):
                        supabase.table("slides").insert(batch[i:i+50]).execute()
                    supabase_synced = True
                except Exception as e:
                    if "images" in str(e).lower() or "pgrst204" in str(e).lower() or "42703" in str(e).lower():
                        # Retry without images column if user hasn't added images column to Supabase
                        no_img_batch = [{k: v for k, v in item.items() if k != "images"} for item in batch]
                        for i in range(0, len(no_img_batch), 50):
                            supabase.table("slides").insert(no_img_batch[i:i+50]).execute()
                        supabase_synced = True
                    else:
                        print("Supabase-ga saqlashda xatolik:", e)
        except Exception as outer_err:
            print("Supabase umumiy xatolik:", outer_err)

    return {
        "id": book_id,
        "title": title,
        "slide_count": slide_count,
        "file_type": file_type,
        "supabase_synced": supabase_synced
    }


def list_books() -> List[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        try:
            res = supabase.table("books").select("*").order("created_at", desc=True).execute()
            if res.data:
                return res.data
        except Exception as e:
            print("Supabase-dan olishda xatolik:", e)

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM books ORDER BY created_at DESC")
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows
    except Exception:
        return []


def get_book_details(book_id: str) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if supabase:
        try:
            b_res = supabase.table("books").select("*").eq("id", book_id).single().execute()
            s_res = supabase.table("slides").select("*").eq("book_id", book_id).order("slide_number").execute()
            if b_res.data:
                book = b_res.data
                raw_slides = s_res.data or []
                for s in raw_slides:
                    raw_content = s.get("content", "")
                    images_list = []
                    
                    raw_imgs = s.get("images")
                    if raw_imgs:
                        if isinstance(raw_imgs, str):
                            try:
                                images_list = json.loads(raw_imgs)
                            except Exception:
                                images_list = []
                        elif isinstance(raw_imgs, list):
                            images_list = raw_imgs

                    # If images column was empty or absent, extract from content marker
                    if not images_list and "<!-- ALJABR_IMAGES:" in raw_content:
                        marker_match = re.search(r"<!--\s*ALJABR_IMAGES:\s*(.*?)\s*-->", raw_content, re.DOTALL)
                        if marker_match:
                            try:
                                images_list = json.loads(marker_match.group(1))
                                s["content"] = re.sub(r"\n\n<!--\s*ALJABR_IMAGES:.*?-->", "", raw_content, flags=re.DOTALL).strip()
                            except Exception:
                                pass
                    
                    s["images"] = images_list
                book["slides"] = raw_slides
                return book
        except Exception as e:
            print("Supabase-dan darslik ma'lumotini olishda xatolik:", e)

    try:
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
            raw_content = s.get("content", "")
            images_list = []
            
            raw_imgs = s.get("images", "[]")
            if isinstance(raw_imgs, str):
                try:
                    images_list = json.loads(raw_imgs)
                except Exception:
                    images_list = []
            elif isinstance(raw_imgs, list):
                images_list = raw_imgs

            if not images_list and "<!-- ALJABR_IMAGES:" in raw_content:
                marker_match = re.search(r"<!--\s*ALJABR_IMAGES:\s*(.*?)\s*-->", raw_content, re.DOTALL)
                if marker_match:
                    try:
                        images_list = json.loads(marker_match.group(1))
                        s["content"] = re.sub(r"\n\n<!--\s*ALJABR_IMAGES:.*?-->", "", raw_content, flags=re.DOTALL).strip()
                    except Exception:
                        pass

            s["images"] = images_list
            slides.append(s)
        conn.close()
        book["slides"] = slides
        return book
    except Exception:
        return None


def delete_book(book_id: str) -> bool:
    supabase = get_supabase_client()
    if supabase:
        try:
            supabase.table("books").delete().eq("id", book_id).execute()
        except Exception as e:
            print("Supabase-dan o'chirishda xatolik:", e)

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM slides WHERE book_id = ?", (book_id,))
        c.execute("DELETE FROM books WHERE id = ?", (book_id,))
        conn.commit()
        conn.close()
    except Exception:
        pass
    return True


def search_content(query: str, mode: str = "all") -> List[Dict[str, Any]]:
    query = query.strip()
    if not query:
        return []

    # If Supabase is available, search in Supabase
    supabase = get_supabase_client()
    if supabase:
        try:
            results = []
            seen = set()
            q_pat = f"%{query}%"

            if mode in ["all", "content"]:
                s_res = supabase.table("slides").select("id, book_id, slide_number, title, content").ilike("content", q_pat).limit(40).execute()
                if s_res.data:
                    # Get book titles
                    book_ids = list(set(r["book_id"] for r in s_res.data))
                    b_res = supabase.table("books").select("id, title, file_type").in_("id", book_ids).execute()
                    b_map = {b["id"]: b for b in (b_res.data or [])}

                    for r in s_res.data:
                        b_info = b_map.get(r["book_id"], {})
                        key = f"{r['book_id']}_{r['slide_number']}"
                        if key not in seen:
                            seen.add(key)
                            results.append({
                                "id": r["id"],
                                "book_id": r["book_id"],
                                "book_title": b_info.get("title", "Darslik"),
                                "file_type": b_info.get("file_type", "pptx"),
                                "slide_number": r["slide_number"],
                                "slide_title": r.get("title", ""),
                                "snippet": extract_context_snippet(r["content"], query),
                                "match_type": "content",
                                "matched_query": query
                            })
            if results:
                return results
        except Exception as e:
            print("Supabase search warning:", e)

    # Local SQLite fallback
    try:
        results: List[Dict[str, Any]] = []
        seen_matches = set()
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        q_pattern = f"%{query}%"

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
    except Exception:
        return []

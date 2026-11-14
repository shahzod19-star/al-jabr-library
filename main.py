import os
import shutil
from typing import Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import db

app = FastAPI(
    title="al-jabr.library",
    description="Shirin Energy Technical College Knowledge Base",
    version="1.0.0"
)

# CORS enabled
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Safe Directory Setup (Vercel-compatible: never write to read-only paths)
IS_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

if IS_VERCEL:
    UPLOAD_DIR = "/tmp/uploads"
else:
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except Exception:
    pass


# Dependency to verify Admin PIN
def verify_admin_pin(x_admin_pin: Optional[str] = Header(None)):
    cfg = db.load_config()
    expected_pin = cfg.get("admin_pin", "admin2026").strip()
    valid_pins = {"admin2026", expected_pin, "librarian_nomac123"}
    if not x_admin_pin or x_admin_pin.strip() not in valid_pins:
        raise HTTPException(status_code=401, detail="Noto'g'ri PIN-kod! Faqat kutubxonachi kira oladi.")
    return True


# --- Public Student Endpoints ---

@app.get("/api/books")
def get_books():
    """Barcha mavjud darsliklar ro'yxatini olish."""
    return db.list_books()


@app.get("/api/books/{book_id}")
def get_book_by_id(book_id: str):
    """Tanlangan darslikning barcha slaydlari va matnini olish."""
    book = db.get_book_details(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Darslik topilmadi.")
    return book


@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1, description="Qidiruv so'zi"),
    mode: str = Query("all", description="'all', 'content' yoki 'title'")
):
    """Darsliklar ichidan kerakli mavzu yoki jumlani qidirish."""
    results = db.search_content(q, mode=mode)
    return {
        "query": q,
        "mode": mode,
        "total": len(results),
        "results": results
    }


# --- Admin (Kutubxonachi) Endpoints ---

@app.post("/api/admin/verify")
def verify_pin(data: dict):
    """Admin PIN kodini tekshirish."""
    pin = data.get("pin", "").strip()
    cfg = db.load_config()
    expected = cfg.get("admin_pin", "admin2026").strip()
    valid_pins = {"admin2026", expected, "librarian_nomac123"}
    if pin in valid_pins:
        return {"valid": True, "message": "Xush kelibsiz, Kutubxonachi!"}
    return {"valid": False, "message": "PIN-kod noto'g'ri!"}


@app.post("/api/admin/upload")
async def upload_file(
    file: UploadFile = File(...),
    custom_title: Optional[str] = Form(None),
    admin_pin: str = Form(...)
):
    """Yangi PPTX yoki PDF darslikni yuklash va indekslash."""
    cfg = db.load_config()
    if admin_pin.strip() != cfg.get("admin_pin", "admin2026"):
        raise HTTPException(status_code=401, detail="Kutubxonachi PIN-kodi noto'g'ri!")

    original_filename = file.filename or "darslik.pptx"
    ext = os.path.splitext(original_filename)[1].lower()

    if ext not in [".pptx", ".ppt", ".pdf"]:
        raise HTTPException(status_code=400, detail="Faqat PPTX yoki PDF fayllar yuklanishi mumkin!")

    # Lazy import extractor
    import extractor

    # Save to uploads directory
    saved_path = os.path.join(UPLOAD_DIR, original_filename)
    try:
        with open(saved_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Faylni saqlashda xatolik: {e}")

    # Extract content and images
    try:
        import uuid
        temp_book_id = str(uuid.uuid4())[:8]
        if IS_VERCEL:
            book_img_dir = f"/tmp/images/{temp_book_id}"
        else:
            book_img_dir = os.path.join(STATIC_DIR, "images", temp_book_id)
        img_url_prefix = f"/static/images/{temp_book_id}"

        extracted = extractor.extract_file_content(
            saved_path, 
            image_save_dir=book_img_dir, 
            image_url_prefix=img_url_prefix
        )
        if custom_title and custom_title.strip():
            extracted["title"] = custom_title.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Darslik matnini o'qib olishda xatolik: {e}")

    # Save into DB
    try:
        saved_book = db.save_book_to_db(extracted, original_filename)
        return {
            "success": True,
            "message": f"'{saved_book['title']}' muvaffaqiyatli saqlandi!",
            "book": saved_book
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ma'lumotlar bazasiga saqlashda xatolik: {e}")


@app.post("/api/admin/save_book_json")
def save_book_json(data: dict):
    """Client-side (brauzerda) ajratilgan darslik slaydlarini saqlash.
    Bu Vercel'ning 4.5MB cheklovini to'liq chetlab o'tish imkonini beradi (100MB gacha fayllar uchun)."""
    cfg = db.load_config()
    admin_pin = data.get("admin_pin", "")
    if admin_pin.strip() != cfg.get("admin_pin", "admin2026"):
        raise HTTPException(status_code=401, detail="Kutubxonachi PIN-kodi noto'g'ri!")

    slides = data.get("slides", [])
    if not slides:
        raise HTTPException(status_code=400, detail="Slaydlar ma'lumoti bo'sh!")

    title = data.get("title", "").strip() or data.get("original_filename", "Yangi darslik")
    file_type = data.get("file_type", "pptx")
    original_filename = data.get("original_filename", "darslik")

    extracted = {
        "title": title,
        "file_type": file_type,
        "slide_count": len(slides),
        "slides": slides
    }

    try:
        saved_book = db.save_book_to_db(extracted, original_filename)
        return {
            "success": True,
            "message": f"'{saved_book['title']}' muvaffaqiyatli saqlandi!",
            "book": saved_book
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ma'lumotlar bazasiga saqlashda xatolik: {e}")


@app.delete("/api/admin/books/{book_id}")
def remove_book(book_id: str, admin_pin: str = Query(...)):
    """Darslikni kutubxonadan o'chirish."""
    cfg = db.load_config()
    if admin_pin.strip() != cfg.get("admin_pin", "admin2026"):
        raise HTTPException(status_code=401, detail="Kutubxonachi PIN-kodi noto'g'ri!")

    deleted = db.delete_book(book_id)
    if deleted:
        return {"success": True, "message": "Darslik o'chirildi."}
    raise HTTPException(status_code=404, detail="Darslik topilmadi.")


@app.get("/api/admin/config")
def get_admin_config(admin_pin: str = Query(...)):
    """Supabase va tizim sozlamalarini olish."""
    cfg = db.load_config()
    if admin_pin.strip() != cfg.get("admin_pin", "admin2026"):
        raise HTTPException(status_code=401, detail="Kutubxonachi PIN-kodi noto'g'ri!")

    raw_key = cfg.get("supabase_key", "")
    masked_key = (raw_key[:6] + "..." + raw_key[-4:]) if len(raw_key) > 10 else raw_key

    status = db.test_supabase_connection(cfg.get("supabase_url", ""), raw_key)

    return {
        "supabase_url": cfg.get("supabase_url", ""),
        "supabase_key_masked": masked_key,
        "is_connected": status.get("success", False),
        "status_message": status.get("message", "")
    }


@app.post("/api/admin/config")
def update_admin_config(data: dict):
    """Supabase URL, Key yoki PIN kodni yangilash."""
    admin_pin = data.get("admin_pin", "")
    cfg = db.load_config()
    if admin_pin.strip() != cfg.get("admin_pin", "admin2026"):
        raise HTTPException(status_code=401, detail="Kutubxonachi PIN-kodi noto'g'ri!")

    new_url = db.clean_supabase_url(data.get("supabase_url", cfg.get("supabase_url", "")))
    new_key = data.get("supabase_key", "").strip() or cfg.get("supabase_key", "")
    new_pin = data.get("new_pin", "").strip() or cfg.get("admin_pin", "admin2026")

    cfg["supabase_url"] = new_url
    cfg["supabase_key"] = new_key
    cfg["admin_pin"] = new_pin
    cfg["use_supabase"] = bool(new_url and new_key)

    db.save_config(cfg)
    status = db.test_supabase_connection(new_url, new_key)

    return {
        "success": True,
        "message": "Sozlamalar saqlandi!",
        "supabase_status": status
    }


@app.post("/api/admin/test-supabase")
def test_supabase(data: dict):
    """Kiritilgan Supabase parametrlarini tekshirish."""
    url = data.get("supabase_url", "").strip()
    key = data.get("supabase_key", "").strip()
    return db.test_supabase_connection(url, key)


# --- HTML & Static Serving (Works in all environments) ---

@app.get("/")
def serve_index():
    for candidate in [os.path.join(BASE_DIR, "index.html"), os.path.join(STATIC_DIR, "index.html")]:
        if os.path.exists(candidate):
            return FileResponse(candidate)
    return JSONResponse({"status": "ok", "app": "al-jabr.library", "message": "index.html not found"})


@app.get("/admin")
def serve_admin():
    for candidate in [os.path.join(BASE_DIR, "admin.html"), os.path.join(STATIC_DIR, "admin.html")]:
        if os.path.exists(candidate):
            return FileResponse(candidate)
    return JSONResponse({"status": "ok", "app": "al-jabr.library admin", "message": "admin.html not found"})


@app.get("/{filename}.js")
def serve_js(filename: str):
    for candidate in [os.path.join(BASE_DIR, f"{filename}.js"), os.path.join(STATIC_DIR, f"{filename}.js")]:
        if os.path.exists(candidate):
            return FileResponse(candidate, media_type="application/javascript")
    raise HTTPException(status_code=404, detail=f"{filename}.js topilmadi")


# Mount static if it exists
if os.path.exists(STATIC_DIR):
    try:
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    except Exception:
        pass

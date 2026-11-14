import os
import shutil
from typing import Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import extractor

app = FastAPI(
    title="Ochiq Darsliklar Kutubxonasi",
    description="Talabalar va o'quvchilar uchun ochiq darsliklar va aqlli qidiruv tizimi",
    version="1.0.0"
)

# CORS enabled for flexible client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

IS_VERCEL = os.environ.get("VERCEL") == "1"
UPLOAD_DIR = "/tmp/uploads" if IS_VERCEL else os.path.join(os.path.dirname(__file__), "uploads")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)


# Dependency to verify Admin PIN
def verify_admin_pin(x_admin_pin: Optional[str] = Header(None)):
    cfg = db.load_config()
    expected_pin = cfg.get("admin_pin", "admin2026")
    if not x_admin_pin or x_admin_pin.strip() != expected_pin.strip():
        raise HTTPException(status_code=401, detail="Noto'g'ri PIN-kod! Faqat kutubxonachi kira oladi.")
    return True


# --- Public Student Endpoints ---

@app.get("/api/books")
def get_books():
    """Barcha mavjud darsliklar ro'yxatini olish."""
    return db.list_books()


@app.get("/api/books/{book_id}")
def get_book_by_id(book_id: str):
    """Tanlangan darslikning barcha slaydlari va to'liq matnini brauzerda o'qish uchun olish."""
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
    pin = data.get("pin", "")
    cfg = db.load_config()
    expected = cfg.get("admin_pin", "admin2026")
    if pin == expected:
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

    # Mask the key for display security
    raw_key = cfg.get("supabase_key", "")
    masked_key = (raw_key[:6] + "..." + raw_key[-4:]) if len(raw_key) > 10 else raw_key

    # Check connection status
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


# --- HTML & Static Routes ---

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/admin")
def serve_admin():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


# Mount static assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

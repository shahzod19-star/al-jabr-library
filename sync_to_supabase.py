import db
import sqlite3

def sync():
    supabase = db.get_supabase_client()
    if not supabase:
        print("Supabase ulanmagan.")
        return

    conn = sqlite3.connect(db.DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM books")
    books = [dict(r) for r in c.fetchall()]
    print(f"Lokal bazada {len(books)} ta darslik bor. Supabase-ga nusxalash boshlandi...")

    for b in books:
        try:
            # Check if book already exists in Supabase
            existing = supabase.table("books").select("id").eq("id", b["id"]).execute()
            if not existing.data:
                supabase.table("books").insert(b).execute()
                print(f"  + Darslik qo'shildi: {b['title']}")
            else:
                print(f"  = Darslik mavjud: {b['title']}")

            # Fetch slides
            c.execute("SELECT * FROM slides WHERE book_id = ? ORDER BY slide_number ASC", (b["id"],))
            slides = [dict(r) for r in c.fetchall()]
            
            # Check slides
            s_exist = supabase.table("slides").select("id").eq("book_id", b["id"]).limit(1).execute()
            if not s_exist.data and slides:
                # Prepare batch without images if needed
                batch = []
                for s in slides:
                    batch.append({
                        "id": s["id"],
                        "book_id": s["book_id"],
                        "slide_number": s["slide_number"],
                        "title": s["title"],
                        "content": s["content"]
                    })
                for i in range(0, len(batch), 50):
                    supabase.table("slides").insert(batch[i:i+50]).execute()
                print(f"    -> {len(slides)} ta slayd yuklandi.")
        except Exception as e:
            print(f"  - Xatolik {b['title']}: {e}")

    conn.close()
    print("Sinxronizatsiya muvaffaqiyatli yakunlandi!")

if __name__ == "__main__":
    sync()

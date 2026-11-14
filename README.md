# 📚 Ochiq Darsliklar Kutubxonasi va Qidiruv Tizimi

Talabalar, kollej va universitet o'quvchilari uchun maxsus yaratilgan **bepul, tezkor va qulay raqamli kutubxona tizimi**.

Ushbu tizimda talabalar ortiqcha ilova yoki og'ir fayllarni ko'chirib o'tirmasdan, kerakli atama yoki mavzuni qidirib, darslik matnini to'g'ridan-to'g'ri saytning o'zida zamonaviy interfeysda o'qishlari mumkin.

---

## 🚀 Qanday ishga tushiriladi?

Jild ichidagi **`START_KUTUBXONA.bat`** faylini ikki marta bosing. 
Server avtomatik ishga tushadi va brauzeringizda sayt ochiladi:

* 📖 **Asosiy Kutubxona (Talabalar uchun):** [http://localhost:8000](http://localhost:8000)
* 🔐 **Kutubxonachi Paneli (Administrator):** [http://localhost:8000/admin](http://localhost:8000/admin)
  * Standart maxfiy PIN kod: `admin2026`

---

## ✨ Asosiy Imkoniyatlar

### 1. Talabalar va O'quvchilar uchun (Ochiq zal)
* **Tezkor qidiruv:** 
  * Darslik ichidagi slaydlardan va sahifalardan qidirish.
  * Faqat mavzu nomi bo'yicha qidirish.
  * Qidirilgan so'z matnda sariq rangda yoritilib (highlight) ko'rsatiladi.
* **Onlayn O'quv Zali (Reader View):**
  * Faylni yuklab olish shart emas — to'g'ridan-to'g'ri brauzerda qulay slayd ko'rinishida o'qiladi.
  * Klaviaturadagi strelkalar (`←` va `→`) orqali slaydlarni almashtirish.
  * Shrift o'lchamini kattalashtirish / kichraytirish (`A+` va `A-`).
  * Chap tomondagi mundarija orqali istalgan slaydga bir zumda o'tish.

### 2. Kutubxonachi (Admin) uchun
* **Darslik yuklash (Drag & Drop):**
  * PowerPoint (`.pptx`, `.ppt`) va PDF (`.pdf`) formatlarini qo'llab-quvvatlaydi.
  * Yuklangan zahoti tizim fayl ichidagi barcha matnlarni slaydma-slayd avtomatik o'qib, qidiruv bazasiga qo'shadi.
* **Darsliklarni boshqarish:**
  * Kutubxonadagi mavjud darsliklarni ko'rish va kerak bo'lmaganlarini o'chirish.
* **Xavfsizlik:**
  * Talabalar fayl yuklay olmaydi yoki o'chira olmaydi — faqat PIN-kodga ega kutubxonachi ruxsatga ega.

---

## ☁️ Supabase Doimiy Bulut Xotirasini Ulash (2 GB Tekin)

Sayt hozirda kompyuteringizdagi SQLite bazasida 100% mustaqil ishlamoqda. Agar ma'lumotlarni doimiy Supabase bulutiga ulamoqchi bo'lsangiz:

1. [supabase.com](https://supabase.com) saytiga kiring va bepul yangi loyiha (Project) oching.
2. Supabase menyusidagi **SQL Editor** bo'limiga kiring.
3. Loyihamizdagi `supabase_schema.sql` fayli ichidagi SQL kodini ko'chirib, **Run** tugmasini bosing.
4. Saytingizdagi Kutubxonachi paneliga (`/admin`) kiring va **Supabase Project URL** hamda **Anon Key** ni kiritib, **"Saqlash"** tugmasini bosing.
5. Tizim yashil 🟢 **"Supabase Ulangan"** holatiga o'tadi va barcha ma'lumotlar bulutda doimiy saqlanadi.

---

## 🛠 Texnologiyalar
* **Backend:** Python, FastAPI, Uvicorn
* **Matn tahlili:** `python-pptx`, `pypdf`
* **Ma'lumotlar bazasi:** SQLite + Supabase (PostgreSQL)
* **Frontend:** TailwindCSS, Vanilla JavaScript (Hech qanday og'ir freymvorklarsiz, soniyalarda yuklanadi)

-- =======================================================
-- Ochiq Darsliklar Kutubxonasi - Supabase SQL Jadval Kori
-- Supabase boshqaruv panelida (SQL Editor) ushbu kodni bir marta ishga tushiring:
-- =======================================================

-- 1. Darsliklar jadvali
CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pptx' yoki 'pdf'
    slide_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Darslik sahifalari / slaydlari jadvali
CREATE TABLE IF NOT EXISTS public.slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    slide_number INTEGER NOT NULL,
    title TEXT DEFAULT '',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Qidiruv indekslari (tezkor matnli qidiruv uchun)
CREATE INDEX IF NOT EXISTS idx_slides_book_id ON public.slides(book_id);
CREATE INDEX IF NOT EXISTS idx_slides_slide_number ON public.slides(slide_number);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books(created_at DESC);

-- 4. Ochiq kirish ruxsatlari (Row Level Security - RLS)
-- Talabalar o'qishi uchun (SELECT) ommaviy ruxsat berish
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hammaga darsliklarni o'qishga ruxsat" 
ON public.books FOR SELECT USING (true);

CREATE POLICY "Hammaga slaydlarni o'qishga ruxsat" 
ON public.slides FOR SELECT USING (true);

-- Kutubxonachi (Anon yoki Authenticated) uchun qo'shish va o'chirish ruxsati
CREATE POLICY "Kutubxonachiga darslik qo'shishga ruxsat" 
ON public.books FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Kutubxonachiga slayd qo'shishga ruxsat" 
ON public.slides FOR ALL USING (true) WITH CHECK (true);

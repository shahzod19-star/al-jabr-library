import os
import re
import uuid
from typing import Dict, Any, List, Optional
import pptx
from pypdf import PdfReader


def clean_text(text: str) -> str:
    """Normalize whitespace and remove excessive blank lines."""
    if not text:
        return ""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def extract_from_pptx(file_path: str, image_save_dir: Optional[str] = None, image_url_prefix: str = "") -> Dict[str, Any]:
    """Extract slide-by-slide text, titles, table contents, and images from a PPTX file."""
    prs = pptx.Presentation(file_path)
    slides_data: List[Dict[str, Any]] = []
    doc_title = ""

    if image_save_dir:
        os.makedirs(image_save_dir, exist_ok=True)

    for idx, slide in enumerate(prs.slides, start=1):
        slide_title = ""
        slide_texts: List[str] = []
        slide_images: List[str] = []

        # Check standard slide title shape
        try:
            if slide.shapes.title and slide.shapes.title.has_text_frame:
                slide_title = slide.shapes.title.text.strip()
        except Exception:
            slide_title = ""

        # Extract text and tables from shapes
        for shape in slide.shapes:
            is_title_shape = False
            try:
                if slide.shapes.title and shape == slide.shapes.title:
                    is_title_shape = True
            except Exception:
                pass

            if shape.has_text_frame:
                frame_texts = []
                for paragraph in shape.text_frame.paragraphs:
                    p_text = paragraph.text.strip()
                    if p_text:
                        frame_texts.append(p_text)
                combined_frame = "\n".join(frame_texts).strip()

                if combined_frame:
                    if is_title_shape:
                        if not slide_title:
                            slide_title = combined_frame
                    else:
                        slide_texts.append(combined_frame)

            if shape.has_table:
                table = shape.table
                table_lines = []
                for row in table.rows:
                    row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_cells:
                        table_lines.append(" | ".join(row_cells))
                if table_lines:
                    slide_texts.append("\n".join(table_lines))

        # Extract images from slide relationships
        if image_save_dir:
            img_num = 1
            seen_blobs = set()
            try:
                for rel in slide.part.rels.values():
                    if "image" in rel.reltype:
                        try:
                            part = rel.target_part
                            blob = part.blob
                            # Filter out microscopic spacer images (< 3500 bytes)
                            if len(blob) >= 3500:
                                blob_hash = hash(blob)
                                if blob_hash not in seen_blobs:
                                    seen_blobs.add(blob_hash)
                                    ext = part.content_type.split("/")[-1].lower()
                                    if ext == "jpeg":
                                        ext = "jpg"
                                    if not ext or len(ext) > 5:
                                        ext = "png"
                                    
                                    img_filename = f"slide_{idx}_img_{img_num}.{ext}"
                                    img_path = os.path.join(image_save_dir, img_filename)
                                    with open(img_path, "wb") as img_file:
                                        img_file.write(blob)
                                    
                                    img_url = f"{image_url_prefix.rstrip('/')}/{img_filename}"
                                    slide_images.append(img_url)
                                    img_num += 1
                        except Exception as img_err:
                            pass
            except Exception:
                pass

        full_content = "\n\n".join(slide_texts).strip()

        if not slide_title and slide_texts:
            first_line = slide_texts[0].split("\n")[0].strip()
            if len(first_line) <= 120:
                slide_title = first_line

        if not slide_title:
            slide_title = f"{idx}-slayd"

        if idx == 1 and not doc_title:
            doc_title = slide_title

        slides_data.append({
            "slide_number": idx,
            "title": slide_title,
            "content": clean_text(full_content),
            "images": slide_images
        })

    if not doc_title or doc_title.lower().startswith("1-slayd"):
        base = os.path.splitext(os.path.basename(file_path))[0]
        doc_title = base.replace("_", " ").replace("-", " ")

    return {
        "title": doc_title,
        "file_type": "pptx",
        "slide_count": len(slides_data),
        "slides": slides_data
    }


def extract_from_pdf(file_path: str, image_save_dir: Optional[str] = None, image_url_prefix: str = "") -> Dict[str, Any]:
    """Extract page-by-page text and images from a PDF file."""
    reader = PdfReader(file_path)
    slides_data: List[Dict[str, Any]] = []
    doc_title = ""

    if image_save_dir:
        os.makedirs(image_save_dir, exist_ok=True)

    for idx, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        cleaned = clean_text(raw_text)
        page_images: List[str] = []

        lines = [line.strip() for line in cleaned.split("\n") if line.strip()]
        page_title = ""
        if lines:
            first_line = lines[0]
            if len(first_line) <= 120:
                page_title = first_line

        if not page_title:
            page_title = f"{idx}-sahifa"

        if idx == 1 and not doc_title and page_title != f"{idx}-sahifa":
            doc_title = page_title

        # Extract images from PDF page
        if image_save_dir:
            img_num = 1
            try:
                for img_obj in page.images:
                    blob = img_obj.data
                    if len(blob) >= 3500:
                        ext = os.path.splitext(img_obj.name)[1].lstrip(".").lower() or "png"
                        img_filename = f"page_{idx}_img_{img_num}.{ext}"
                        img_path = os.path.join(image_save_dir, img_filename)
                        with open(img_path, "wb") as f_out:
                            f_out.write(blob)

                        img_url = f"{image_url_prefix.rstrip('/')}/{img_filename}"
                        page_images.append(img_url)
                        img_num += 1
            except Exception:
                pass

        slides_data.append({
            "slide_number": idx,
            "title": page_title,
            "content": cleaned,
            "images": page_images
        })

    if not doc_title:
        base = os.path.splitext(os.path.basename(file_path))[0]
        doc_title = base.replace("_", " ").replace("-", " ")

    return {
        "title": doc_title,
        "file_type": "pdf",
        "slide_count": len(slides_data),
        "slides": slides_data
    }


def extract_file_content(file_path: str, image_save_dir: Optional[str] = None, image_url_prefix: str = "") -> Dict[str, Any]:
    """Main extraction router based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext in [".pptx", ".ppt"]:
        return extract_from_pptx(file_path, image_save_dir=image_save_dir, image_url_prefix=image_url_prefix)
    elif ext == ".pdf":
        return extract_from_pdf(file_path, image_save_dir=image_save_dir, image_url_prefix=image_url_prefix)
    else:
        raise ValueError(f"Qo'llab-quvvatlanmaydigan fayl formati: {ext}. Faqat PPTX va PDF qabul qilinadi.")

let adminPin = sessionStorage.getItem("kutubxonachi_pin") || "";

document.addEventListener("DOMContentLoaded", () => {
  if (adminPin) {
    verifyStoredPin();
  } else {
    showLoginGate();
  }

  // Setup drag & drop
  setupDragAndDrop();
});

function showLoginGate() {
  document.getElementById("loginGate").classList.remove("hidden");
  document.getElementById("adminDashboard").classList.add("hidden");
  document.getElementById("logoutBtn").classList.add("hidden");
}

function showDashboard() {
  document.getElementById("loginGate").classList.add("hidden");
  document.getElementById("adminDashboard").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");

  loadAdminBooks();
  loadSupabaseConfig();
}

async function verifyStoredPin() {
  try {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: adminPin })
    });
    const data = await res.json();
    if (data.valid) {
      showDashboard();
    } else {
      adminPin = "";
      sessionStorage.removeItem("kutubxonachi_pin");
      showLoginGate();
    }
  } catch (err) {
    showLoginGate();
  }
}

async function handlePinLogin(e) {
  e.preventDefault();
  const pinInput = document.getElementById("pinInput");
  const errEl = document.getElementById("pinErrorMsg");
  const pin = pinInput.value.trim();

  try {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.valid) {
      adminPin = pin;
      sessionStorage.setItem("kutubxonachi_pin", pin);
      errEl.classList.add("hidden");
      showDashboard();
    } else {
      errEl.textContent = data.message || "PIN kod noto'g'ri!";
      errEl.classList.remove("hidden");
      pinInput.value = "";
      pinInput.focus();
    }
  } catch (err) {
    errEl.textContent = "Server bilan aloqa xatosi: " + err.message;
    errEl.classList.remove("hidden");
  }
}

function adminLogout() {
  adminPin = "";
  sessionStorage.removeItem("kutubxonachi_pin");
  showLoginGate();
}

// --- Drag & Drop ---

function setupDragAndDrop() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");

  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add("border-blue-600", "bg-blue-50");
    }, false);
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove("border-blue-600", "bg-blue-50");
    }, false);
  });

  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      fileInput.files = files;
      fileSelected(fileInput);
    }
  });
}

function fileSelected(input) {
  const label = document.getElementById("selectedFileName");
  if (input.files && input.files[0]) {
    const f = input.files[0];
    label.textContent = `Tanlangan: ${f.name} (${(f.size / (1024*1024)).toFixed(2)} MB)`;
    label.classList.remove("hidden");
  } else {
    label.classList.add("hidden");
  }
}

// --- Upload Handler ---

async function handleFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById("fileInput");
  const titleInput = document.getElementById("customTitleInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const statusBox = document.getElementById("uploadStatusBox");

  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Iltimos, avval fayl tanlang!");
    return;
  }

  const file = fileInput.files[0];
  const customTitle = titleInput.value.trim();
  const fileSizeMB = file.size / (1024 * 1024);

  // Set uploading state
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
    <span>Darslik qayta ishlanmoqda...</span>
  `;

  // Agar fayl 4.2 MB dan katta bo'lsa (100MB gacha), Vercel'ning 4.5MB cheklovini 
  // chetlab o'tish uchun to'g'ridan-to'g'ri brauzerda (Client-side) aqlli ajratishdan foydalanamiz!
  if (fileSizeMB > 4.2) {
    await handleLargeFileUploadInBrowser(file, customTitle, statusBox, uploadBtn);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("admin_pin", adminPin);
  if (customTitle) {
    formData.append("custom_title", customTitle);
  }

  statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 block";
  statusBox.textContent = "Fayl serverga yuklanmoqda va indekslanmoqda...";

  try {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData
    });

    // Check for Vercel 4.5MB payload limit (HTTP 413 Request Entity Too Large)
    if (res.status === 413) {
      // Avtomatik ravishda brauzerda ajratish rejimiga o'tish
      await handleLargeFileUploadInBrowser(file, customTitle, statusBox, uploadBtn);
      return;
    }

    let result;
    const rawText = await res.text();
    try {
      result = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error(`Server javobi: ${rawText.slice(0, 150)}`);
    }

    if (!res.ok) {
      throw new Error(result.detail || "Yuklashda xatolik yuz berdi");
    }

    // Success
    showUploadSuccess(result.book, statusBox);
    fileInput.value = "";
    titleInput.value = "";
    document.getElementById("selectedFileName").classList.add("hidden");
    loadAdminBooks();
  } catch (err) {
    // Agar serverda xatolik bo'lsa, brauzerda ajratishni sinab ko'ramiz
    console.warn("Standart yuklashda xatolik, brauzerda ajratish rejimi sinab ko'rilmoqda:", err);
    try {
      await handleLargeFileUploadInBrowser(file, customTitle, statusBox, uploadBtn);
    } catch (fallbackErr) {
      statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block";
      statusBox.textContent = "Xatolik: " + fallbackErr.message;
    }
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = `<span>Darslikni yuklash va indekslash</span><span>⚡</span>`;
  }
}

// --- 100MB gacha bo'lgan katta fayllarni Brauzerda Aqlli Ajratish (Client-side) ---

async function handleLargeFileUploadInBrowser(file, customTitle, statusBox, uploadBtn) {
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const ext = file.name.split('.').pop().toLowerCase();
  
  statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300 block";
  statusBox.innerHTML = `
    <strong>⚡ Katta darslik (${fileSizeMB} MB) aniqlandi!</strong><br>
    Vercel 4.5MB cheklovini chetlab o'tish uchun darslik to'g'ridan-to'g'ri brauzeringizda o'qilmoqda va slaydlar ajratilmoqda...
  `;

  let slides = [];
  try {
    if (ext === "pdf") {
      slides = await parsePdfInBrowser(file, statusBox);
    } else if (ext === "pptx" || ext === "ppt") {
      slides = await parsePptxInBrowser(file, statusBox);
    } else {
      throw new Error("Faqat PPTX yoki PDF fayllar qo'llab-quvvatlanadi.");
    }

    if (!slides || slides.length === 0) {
      throw new Error("Darslik ichidan slaydlar yoki matn topilmadi.");
    }

    statusBox.textContent = `Ajratildi: ${slides.length} ta slayd. Bulutga (Supabase) saqlanmoqda...`;

    const bookTitle = customTitle || slides[0].title || file.name.replace(/\.[^/.]+$/, "");

    const res = await fetch("/api/admin/save_book_json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_pin: adminPin || sessionStorage.getItem("kutubxonachi_pin") || "admin2026",
        title: bookTitle,
        original_filename: file.name,
        file_type: ext,
        slides: slides
      })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.detail || "Bulutga saqlashda xatolik yuz berdi");
    }

    showUploadSuccess(result.book, statusBox);
    document.getElementById("fileInput").value = "";
    document.getElementById("customTitleInput").value = "";
    document.getElementById("selectedFileName").classList.add("hidden");
    loadAdminBooks();
  } catch (err) {
    statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block";
    statusBox.textContent = "Katta faylni ajratishda xatolik: " + err.message;
    throw err;
  }
}

// Helper: compress an image blob into an efficient web JPEG data URI (reduces size by 90% while keeping high quality)
async function compressImageBlob(uint8array, mimeType, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([uint8array], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          return resolve("");
        }
        if (w > maxWidth || h > maxWidth) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxWidth) / h);
            h = maxWidth;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback: direct base64
        try {
          let binary = '';
          const len = uint8array.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8array[i]);
          }
          resolve(`data:${mimeType};base64,${btoa(binary)}`);
        } catch (b64Err) {
          resolve("");
        }
      };
      img.src = url;
    } catch (e) {
      resolve("");
    }
  });
}

// PPTX faylni brauzerda (JSZip) o'qish va rasmlarni ajratish
async function parsePptxInBrowser(file, statusBox) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip kutubxonasi yuklanmadi. Sahifani yangilab qayta urinib ko'ring.");
  }

  const zip = await JSZip.loadAsync(file);
  const slideFiles = [];

  zip.forEach((relPath, entry) => {
    const match = relPath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
    if (match) {
      slideFiles.push({ num: parseInt(match[1]), entry });
    }
  });

  if (slideFiles.length === 0) {
    throw new Error("PPTX ichida slaydlar topilmadi.");
  }

  slideFiles.sort((a, b) => a.num - b.num);
  const slides = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const item = slideFiles[i];
    if (statusBox && (i % 3 === 0 || i === slideFiles.length - 1)) {
      statusBox.textContent = `Slaydlar va rasmlar o'qilmoqda: ${i + 1} / ${slideFiles.length}...`;
    }

    const xml = await item.entry.async("text");
    
    // Matn paragraflarini ajratish (<a:p> ... </a:p>)
    const pMatches = xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) || [];
    const paragraphs = [];
    for (const p of pMatches) {
      const tMatches = p.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const line = tMatches.map(t => t.replace(/<[^>]+>/g, "")).join("").trim();
      if (line) paragraphs.push(line);
    }

    const slideTitle = paragraphs.length > 0 ? paragraphs[0] : `${item.num}-slayd`;
    const slideContent = paragraphs.join("\n\n");

    // Slayd rasmlarini rels faylidan ajratib olish
    const slideImages = [];
    try {
      const relPath = `ppt/slides/_rels/slide${item.num}.xml.rels`;
      const relEntry = zip.file(relPath);
      if (relEntry) {
        const relXml = await relEntry.async("text");
        const relRegex = /<Relationship[^>]+Type="[^"]*\/relationships\/image"[^>]+Target="([^"]+)"/gi;
        let match;
        const seenTargets = new Set();
        while ((match = relRegex.exec(relXml)) !== null) {
          let target = match[1];
          if (seenTargets.has(target)) continue;
          seenTargets.add(target);

          // "../media/imageX.png" -> "ppt/media/imageX.png"
          let mediaPath = target;
          if (mediaPath.startsWith("../")) {
            mediaPath = "ppt/" + mediaPath.substring(3);
          } else if (mediaPath.startsWith("media/")) {
            mediaPath = "ppt/" + mediaPath;
          } else if (!mediaPath.startsWith("ppt/")) {
            mediaPath = "ppt/media/" + mediaPath.split("/").pop();
          }

          const imgZipEntry = zip.file(mediaPath);
          if (imgZipEntry) {
            const u8 = await imgZipEntry.async("uint8array");
            // Kichik piktogramma va spacerlarni filtrlash (>= 3500 bayt)
            if (u8.length >= 3500) {
              const ext = mediaPath.split('.').pop().toLowerCase();
              const mime = (ext === 'png') ? 'image/png' : ((ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png');
              const dataUri = await compressImageBlob(u8, mime, 1000, 0.8);
              if (dataUri && dataUri.length > 100) {
                slideImages.push(dataUri);
              }
            }
          }
        }
      }
    } catch (imgErr) {
      console.warn(`Slayd ${item.num} rasmlarini o'qishda xatolik:`, imgErr);
    }

    slides.push({
      slide_number: item.num,
      title: slideTitle.slice(0, 150),
      content: slideContent,
      images: slideImages
    });
  }

  return slides;
}

// PDF faylni brauzerda (PDF.js) o'qish va sahifa tasvirlarini ajratish
async function parsePdfInBrowser(file, statusBox) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js kutubxonasi yuklanmadi. Sahifani yangilab qayta urinib ko'ring.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const slides = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    if (statusBox && (i % 3 === 0 || i === pdf.numPages)) {
      statusBox.textContent = `PDF sahifalari va rasmlari o'qilmoqda: ${i} / ${pdf.numPages}...`;
    }

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map(item => item.str.trim()).filter(Boolean);
    const pageTitle = strings.length > 0 && strings[0].length <= 120 ? strings[0] : `${i}-sahifa`;
    const pageContent = strings.join("\n");

    const pageImages = [];
    try {
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(1.2, 900 / (viewport.width || 600));
      const scaledViewport = page.getViewport({ scale: scale });
      const canvas = document.createElement("canvas");
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      const pageDataUri = canvas.toDataURL("image/jpeg", 0.75);
      if (pageDataUri && pageDataUri.length > 1000) {
        pageImages.push(pageDataUri);
      }
    } catch (pdfImgErr) {
      console.warn(`PDF sahifa ${i} rasmini chizishda ogohlantirish:`, pdfImgErr);
    }

    slides.push({
      slide_number: i,
      title: pageTitle,
      content: pageContent,
      images: pageImages
    });
  }

  return slides;
}

function showUploadSuccess(book, statusBox) {
  statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block";
  statusBox.innerHTML = `
    ✓ <strong>Muvaffaqiyatli saqlandi!</strong><br>
    Darslik: <strong>${escapeHtml(book.title)}</strong><br>
    Ajratilgan slaydlar soni: <strong>${book.slide_count} ta</strong>
  `;
}

// --- Book Management ---

async function loadAdminBooks() {
  const tbody = document.getElementById("adminBooksTableBody");
  const countLabel = document.getElementById("adminBookCountLabel");
  tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-xs text-slate-400">Yuklanmoqda...</td></tr>`;

  try {
    const res = await fetch("/api/books");
    const books = await res.json();
    countLabel.textContent = `Jami: ${books.length} ta darslik`;
    tbody.innerHTML = "";

    if (!books || books.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-xs text-slate-400">Darsliklar mavjud emas</td></tr>`;
      return;
    }

    books.forEach(b => {
      const isPpt = (b.file_type || "").toLowerCase().includes("ppt");
      const badge = isPpt ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";

      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition";
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
          <div class="truncate max-w-[180px] sm:max-w-sm" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</div>
          <div class="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-xs">${escapeHtml(b.original_filename)}</div>
        </td>
        <td class="py-2.5 px-2">
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${badge}">
            ${isPpt ? "PPTX" : "PDF"}
          </span>
        </td>
        <td class="py-2.5 px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          ${b.slide_count || 0} slayd
        </td>
        <td class="py-2.5 px-3 text-right space-x-1.5">
          <a href="/?read=${b.id}" target="_blank" class="inline-block text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition">
            O'qish ↗
          </a>
          <button onclick="confirmDeleteBook('${b.id}', '${escapeHtml(b.title)}')" class="text-[11px] font-bold px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 transition">
            O'chirish 🗑
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-xs text-rose-500">Xatolik: ${err.message}</td></tr>`;
  }
}

async function confirmDeleteBook(bookId, title) {
  if (!confirm(`Haqiqatan ham "${title}" darsligini o'chirmoqchimisiz?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/books/${bookId}?admin_pin=${encodeURIComponent(adminPin)}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "O'chirishda xatolik");

    alert("Darslik o'chirildi!");
    loadAdminBooks();
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
}

// --- Supabase Config ---

async function loadSupabaseConfig() {
  try {
    const res = await fetch(`/api/admin/config?admin_pin=${encodeURIComponent(adminPin)}`);
    if (!res.ok) return;
    const cfg = await res.json();

    document.getElementById("cfgSupabaseUrl").value = cfg.supabase_url || "";
    if (cfg.supabase_key_masked) {
      document.getElementById("cfgSupabaseKey").placeholder = cfg.supabase_key_masked;
    }

    const badge = document.getElementById("supabaseStatusBadge");
    const desc = document.getElementById("supabaseStatusDesc");

    if (cfg.is_connected) {
      badge.className = "inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800";
      badge.textContent = "🟢 Supabase Ulangan";
      desc.className = "p-3.5 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800";
      desc.textContent = "Darsliklar va ularning slaydlari Supabase bepul bulut xotirasida doimiy xavfsiz saqlanmoqda.";
    } else {
      badge.className = "inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800";
      badge.textContent = "🟡 Lokal Baza (SQLite)";
      desc.className = "p-3.5 mb-5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800";
      desc.textContent = cfg.supabase_url 
        ? `Supabase ulanmadi (${cfg.status_message}). Hozirda ma'lumotlar lokal xotirada saqlanmoqda.` 
        : "Supabase URL va Kaliti kiritilmagan. Ma'lumotlar kompyuteringizdagi lokal bazada saqlanmoqda. Bulutga ulash uchun quyidagi maydonlarni to'ldiring.";
    }
  } catch (err) {
    console.error("Config yuklashda xatolik:", err);
  }
}

async function handleSaveConfig(e) {
  e.preventDefault();
  const url = document.getElementById("cfgSupabaseUrl").value.trim();
  const key = document.getElementById("cfgSupabaseKey").value.trim();
  const newPin = document.getElementById("cfgNewPin").value.trim();
  const btn = document.getElementById("saveConfigBtn");
  const msg = document.getElementById("configFeedbackMsg");

  btn.disabled = true;
  btn.textContent = "Ulanish tekshirilmoqda...";

  try {
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_pin: adminPin,
        supabase_url: url,
        supabase_key: key,
        new_pin: newPin
      })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || "Saqlashda xatolik");

    if (newPin) {
      adminPin = newPin;
      sessionStorage.setItem("kutubxonachi_pin", newPin);
      document.getElementById("cfgNewPin").value = "";
    }

    msg.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block";
    msg.textContent = result.message + " (" + (result.supabase_status?.message || '') + ")";

    loadSupabaseConfig();
  } catch (err) {
    msg.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block";
    msg.textContent = "Xatolik: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Saqlash va Ulanishni tekshirish";
  }
}

function toggleSqlModal() {
  const modal = document.getElementById("sqlModal");
  modal.classList.toggle("hidden");
}

function copySqlCode() {
  const code = document.getElementById("sqlCodeBlock").innerText;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById("copySqlBtn");
    btn.textContent = "Nusxalandi! ✓";
    setTimeout(() => {
      btn.textContent = "Nusxa olish 📋";
    }, 2000);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

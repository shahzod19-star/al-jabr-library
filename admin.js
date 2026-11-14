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
  const formData = new FormData();
  formData.append("file", file);
  formData.append("admin_pin", adminPin);
  if (titleInput.value.trim()) {
    formData.append("custom_title", titleInput.value.trim());
  }

  // Set uploading state
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
    </svg>
    <span>Fayl o'qilmoqda va slaydlar ajratilmoqda...</span>
  `;
  statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 block";
  statusBox.textContent = "Fayl serverga yuklanmoqda va ichidagi barcha matnlar indekslanmoqda. Bu bir necha soniya vaqt olishi mumkin...";

  try {
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData
    });
    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.detail || "Yuklashda xatolik yuz berdi");
    }

    // Success
    statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block";
    statusBox.innerHTML = `
      ✓ <strong>Muvaffaqiyatli saqlandi!</strong><br>
      Darslik: <strong>${escapeHtml(result.book.title)}</strong><br>
      Ajratilgan slaydlar soni: <strong>${result.book.slide_count} ta</strong>
    `;

    // Reset inputs
    fileInput.value = "";
    titleInput.value = "";
    document.getElementById("selectedFileName").classList.add("hidden");

    // Refresh book list
    loadAdminBooks();
  } catch (err) {
    statusBox.className = "p-4 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 block";
    statusBox.textContent = "Xatolik: " + err.message;
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = `<span>Darslikni yuklash va indekslash</span><span>⚡</span>`;
  }
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

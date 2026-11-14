/**
 * al-jabr.library — Shirin Energy Technical College
 * Technical Knowledge Base & Presentation Reader
 * Created by shahzodabduhalilov16@gmail.com
 */

// =====================================================================
// GLOBAL STATE & CONSTANTS
// =====================================================================
let currentBooks = [];
let searchMode = 'all'; // 'all', 'content', 'title'
let currentSearchQuery = '';
let searchDebounceTimer = null;
let currentCategory = 'all';
let currentSort = 'recent';

// Multi-language & Theme
let currentLang = localStorage.getItem("aljabr_lang") || "uz";
let currentTheme = localStorage.getItem("aljabr_theme") || "dark";

// Reader State
let currentReadingBook = null;
let currentSlideIndex = 0; // 0-based
let currentFontSize = 16; // px
let touchStartX = 0;
let touchStartY = 0;

// Pop Counter
let popCount = parseInt(localStorage.getItem("aljabr_pops") || "0", 10);

// College Brand Colors for Hero Bubble Engine
const BUBBLE_COLORS = [
  "#064e3b", // Emerald dark
  "#059669", // Emerald medium
  "#10b981", // Emerald bright
  "#34d399", // Emerald mint
  "#06b6d4", // Cyan
  "#0d9488", // Teal
  "#14b8a6", // Teal light
  "#38bdf8", // Sky blue
  "#6ee7b7", // Mint soft
  "#047857", // Forest green
];

// =====================================================================
// INITIALIZATION
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Apply initial theme & language
  applyTheme(currentTheme);
  applyLanguage(currentLang);

  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = currentLang;

  // Initialize pop counter display
  updatePopBadge();

  // Initialize Landing Page Interactive Bubble Canvas
  initHeroBubbleCanvas();

  // Fetch books from backend
  fetchBooks().then(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const readBookId = urlParams.get('read');
    if (readBookId) {
      openReader(readBookId, 1);
    }
  });

  // Search input listeners
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      currentSearchQuery = val;

      const clearBtn = document.getElementById("clearSearchBtn");
      if (clearBtn) clearBtn.classList.toggle("hidden", !val);

      clearTimeout(searchDebounceTimer);
      if (val.length === 0) {
        resetSearch();
      } else {
        searchDebounceTimer = setTimeout(() => {
          performSearch(val);
        }, 250);
      }
    });
  }

  // Keyboard shortcuts (Ctrl+K, arrows, Esc)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      if (input) {
        input.focus();
        input.select();
      }
    }

    const modal = document.getElementById("readerModal");
    if (modal && !modal.classList.contains("hidden")) {
      if (e.key === "ArrowRight") {
        currentLang === "ar" ? prevSlide() : nextSlide();
      }
      if (e.key === "ArrowLeft") {
        currentLang === "ar" ? nextSlide() : prevSlide();
      }
      if (e.key === "Escape") closeReader();
    }
  });

  // Touch swipe support for mobile
  setupTouchGestures();
});

// =====================================================================
// THEME MANAGEMENT
// =====================================================================
function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem("aljabr_theme", theme);
  const html = document.documentElement;
  const icon = document.getElementById("themeIcon");

  if (theme === "dark") {
    html.classList.add("dark");
    if (icon) icon.textContent = "☀️";
  } else {
    html.classList.remove("dark");
    if (icon) icon.textContent = "🌙";
  }
}

function toggleTheme() {
  const next = currentTheme === "dark" ? "light" : "dark";
  applyTheme(next);
}

// =====================================================================
// INTERACTIVE AL-JABR BUBBLE CANVAS ENGINE (LANDING PAGE)
// =====================================================================
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function buildBubbles(seed, w, h, nColors, density = 1, scale = 1) {
  const rnd = mulberry32(seed);
  const unit = Math.max(6, Math.min(w, h) * 0.12 * scale);
  const n = Math.round(clamp(((w * h) / (unit * unit * 1.25)) * density, 16, 700));
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = unit * (0.24 + 1.25 * Math.pow(rnd(), 2.3));
    out.push({
      x: rnd() * (w + r) - r / 2,
      y: rnd() * (h + r) - r / 2,
      r,
      c: 1 + Math.floor(rnd() * Math.max(1, nColors - 1)),
      ph: rnd() * Math.PI * 2,
      amp: 1 + rnd() * 3.5,
      sp: 0.25 + rnd() * 0.6,
      ox: 0,
      oy: 0,
      s: 1
    });
  }
  return out.sort((a, b) => b.r - a.r);
}

function initHeroBubbleCanvas() {
  const canvas = document.getElementById("heroBubbleCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const host = canvas.parentElement || canvas;
  const seed = 102;
  const density = 1.05;
  const scale = 1;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let list = [];
  let sparks = [];
  let ptr = { x: -9999, y: -9999, dx: 0, dy: 0, on: false };
  let running = false;
  let raf = null;
  let visible = true;
  let textSize = 0;
  let textFor = "";

  const rand = mulberry32(seed * 7 + 13);

  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    w = rect.width;
    h = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    list = buildBubbles(seed, w, h, BUBBLE_COLORS.length, density, scale);
    textFor = "";
    draw(performance.now());
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);

    // Background ground
    ctx.fillStyle = "#06090e";
    ctx.fillRect(0, 0, w, h);

    const ts = t / 1000;
    const R = Math.max(70, Math.min(h, w) * 0.35);

    // Bubbles
    for (const b of list) {
      let tx = 0;
      let ty = 0;
      if (ptr.on) {
        const dx = b.x + b.ox - ptr.x;
        const dy = b.y + b.oy - ptr.y;
        const d = Math.hypot(dx, dy) || 1;
        const reach = R + b.r;
        if (d < reach) {
          const f = 1 - d / reach;
          const push = f * f * R * 0.6;
          tx = (dx / d) * push + ptr.dx * f * 0.6;
          ty = (dy / d) * push + ptr.dy * f * 0.6;
        }
      }

      b.ox += (tx - b.ox) * 0.09;
      b.oy += (ty - b.oy) * 0.09;
      b.s += (1 - b.s) * 0.07;

      const wx = Math.sin(ts * b.sp + b.ph) * b.amp;
      const wy = Math.cos(ts * b.sp * 0.8 + b.ph) * b.amp;

      ctx.fillStyle = BUBBLE_COLORS[b.c % BUBBLE_COLORS.length];
      ctx.beginPath();
      ctx.arc(b.x + b.ox + wx, b.y + b.oy + wy, Math.max(0.1, b.r * b.s), 0, Math.PI * 2);
      ctx.fill();
    }

    ptr.dx *= 0.85;
    ptr.dy *= 0.85;

    // Sparks
    if (sparks.length > 0) {
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.94;
        s.vy = s.vy * 0.94 - 0.05;
        s.life -= 0.022;
        if (s.life <= 0) continue;
        ctx.fillStyle = BUBBLE_COLORS[s.c % BUBBLE_COLORS.length];
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
        ctx.fill();
      }
      sparks = sparks.filter(s => s.life > 0);
    }

    // Text knockout mask: "AL-JABR"
    const text = "AL-JABR";
    const font = '900 100px "Poppins", "Inter", sans-serif';
    const fit = w > 640 ? 0.88 : 0.98;
    const key = `${font}|${text}|${w}|${h}|${fit}`;
    if (key !== textFor) {
      ctx.font = font;
      const mw = ctx.measureText(text).width || 1;
      textSize = Math.min((100 * w * fit) / mw, h * 1.3);
      textFor = key;
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000";
    ctx.font = `900 ${textSize.toFixed(1)}px "Poppins", "Inter", sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, w * (w > 640 ? 0.05 : 0.01), h * 0.78);
  }

  function loop(t) {
    if (!running) return;
    draw(t);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || !visible || !w) return;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  function local(e) {
    const r = host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onMove(e) {
    const [x, y] = local(e);
    if (ptr.on) {
      ptr.dx = clamp(x - ptr.x, -40, 40);
      ptr.dy = clamp(y - ptr.y, -40, 40);
    }
    ptr.x = x;
    ptr.y = y;
    ptr.on = x >= -40 && y >= -40 && x <= w + 40 && y <= h + 40;
    if (!running) draw(performance.now());
  }

  function onLeave() {
    ptr.on = false;
    if (!running) draw(performance.now());
  }

  let downAt = [0, 0];
  function onDown(e) {
    downAt = [e.clientX, e.clientY];
  }

  function onUp(e) {
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
    if (e.target && e.target.closest && e.target.closest("a,button,input,select")) return;
    const [x, y] = local(e);
    if (x < 0 || y < 0 || x > w || y > h) return;

    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (Math.hypot(b.x + b.ox - x, b.y + b.oy - y) > b.r * b.s + 4) continue;

      const oldColor = b.c;
      b.c = 1 + ((b.c + Math.floor(rand() * (BUBBLE_COLORS.length - 2))) % Math.max(1, BUBBLE_COLORS.length - 1));
      b.s = 0; // shrink to pop!

      // Spawn pop sparks
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rand() * 0.5;
        const sp = 2 + rand() * 4;
        sparks.push({
          x: b.x + b.ox,
          y: b.y + b.oy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: b.r * (0.18 + rand() * 0.22),
          c: oldColor,
          life: 1
        });
      }

      // Pop counter increment
      popCount++;
      localStorage.setItem("aljabr_pops", popCount);
      updatePopBadge();

      if (!running) draw(performance.now());
      break;
    }
  }

  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(host);
  } else {
    window.addEventListener("resize", resize);
  }

  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver((entries) => {
      visible = entries.some(e => e.isIntersecting);
      visible ? start() : stop();
    }).observe(host);
  }

  document.addEventListener("visibilitychange", () => {
    document.hidden ? stop() : start();
  });

  resize();
  start();
}

function updatePopBadge() {
  const badge = document.getElementById("popCounterBadge");
  if (badge) {
    badge.textContent = `${popCount} ta yorildi`;
  }
}

// =====================================================================
// DATA FETCHING & RENDERING (BOOKS & SEARCH)
// =====================================================================
async function fetchBooks() {
  try {
    const res = await fetch("/api/books");
    if (!res.ok) throw new Error("Serverdan kitoblar kelmadi");
    const books = await res.json();
    currentBooks = books;

    // Update metrics banner
    const totalSlides = books.reduce((acc, b) => acc + (b.slide_count || 0), 0);
    const metricSlides = document.getElementById("metricTotalSlides");
    if (metricSlides) metricSlides.innerHTML = `${totalSlides}<span class="text-brand-400">+</span>`;

    const metricBooks = document.getElementById("metricTotalBooks");
    if (metricBooks) metricBooks.textContent = books.length;

    const countBadge = document.getElementById("catalogCountBadge");
    if (countBadge) countBadge.textContent = `${books.length} ta darslik`;

    applyFilterAndSort();
  } catch (err) {
    console.error("Darsliklarni yuklashda xatolik:", err);
  }
}

function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll(".cat-filter").forEach(b => {
    b.className = "cat-filter px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all";
  });
  if (btn) {
    btn.className = "cat-filter active px-3 py-1.5 rounded-lg bg-brand-500 text-slate-950 font-semibold transition-all";
  }
  applyFilterAndSort();
}

function sortBooks(val) {
  currentSort = val;
  applyFilterAndSort();
}

function applyFilterAndSort() {
  let list = [...currentBooks];

  // Category filter
  if (currentCategory === "hse") {
    list = list.filter(b => /safety|hazard|hse|xavfsizlik|muhofaza|ish joyi/i.test((b.title || '') + ' ' + (b.original_filename || '')));
  } else if (currentCategory === "energy") {
    list = list.filter(b => /energy|energetika|quyosh|elektr|quvvat|solar/i.test((b.title || '') + ' ' + (b.original_filename || '')));
  } else if (currentCategory === "tech") {
    list = list.filter(b => !/safety|hazard|hse|xavfsizlik/i.test(b.title || ''));
  }

  // Sort
  if (currentSort === "slides") {
    list.sort((a, b) => (b.slide_count || 0) - (a.slide_count || 0));
  } else if (currentSort === "title") {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  renderBooksCatalog(list);
}

function generateSlidePreviewBoxes(book) {
  const count = book.slide_count || 1;
  const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
  
  let label1 = isPpt ? "01 Kirish" : "01 Bosh sahifa";
  let label2 = isPpt ? "02 Asosiy" : "02 Bo'lim";
  let label3 = isPpt ? "03 Xulosa" : "03 Yakun";
  
  if (/safety|hse|xavfsizlik/i.test(book.title || '')) {
    label1 = "01 HSE";
    label2 = "02 PPE";
    label3 = "03 ISO";
  } else if (/muloqot|nutq|communication/i.test(book.title || '')) {
    label1 = "01 Nutq";
    label2 = "02 Tinglash";
    label3 = "03 Etika";
  }

  const moreCount = Math.max(0, count - 3);

  return `
    <div class="w-16 sm:w-20 h-full rounded bg-slate-800/90 flex flex-col justify-between p-1.5 border border-slate-700/60 text-[8px] text-slate-300">
      <span class="font-bold text-amber-400">${label1}</span>
      <span class="truncate text-slate-400">Modul 1</span>
    </div>
    <div class="w-16 sm:w-20 h-full rounded bg-slate-800/60 flex flex-col justify-between p-1.5 border border-slate-700/40 text-[8px] text-slate-400">
      <span class="font-bold text-emerald-400">${label2}</span>
      <span class="truncate text-slate-500">Tahlil</span>
    </div>
    <div class="w-16 sm:w-20 h-full rounded bg-slate-800/40 flex flex-col justify-between p-1.5 border border-slate-700/20 text-[8px] text-slate-500">
      <span class="font-bold text-teal-400">${label3}</span>
      <span class="truncate text-slate-600">Amaliyot</span>
    </div>
    <div class="flex-grow flex items-center justify-center text-xs text-slate-400 font-mono">
      +${moreCount} ${t("slidesCount") || "slayd"}
    </div>
  `;
}

function renderBooksCatalog(books) {
  const container = document.getElementById("booksGrid");
  if (!container) return;
  container.innerHTML = "";

  const badge = document.getElementById("catalogCountBadge");
  if (badge) {
    badge.textContent = `${books.length} ta darslik`;
  }

  if (!books || books.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 glass-panel rounded-2xl border border-slate-800 p-6">
        <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 text-2xl">
          <i class="fa-solid fa-book"></i>
        </div>
        <h4 class="font-bold text-white text-base">${t("emptyCatalog") || "Darsliklar topilmadi"}</h4>
        <p class="text-xs text-slate-400 mt-1">${t("emptyCatalogDesc") || "Boshqa bo'limni tanlang"}</p>
      </div>
    `;
    return;
  }

  books.forEach((book, idx) => {
    const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
    const badgeStyle = isPpt 
      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" 
      : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30";
    const badgeLabel = isPpt ? "PPTX" : "PDF";
    const fileIconClass = isPpt ? "fa-regular fa-file-powerpoint text-amber-400/80" : "fa-regular fa-file-pdf text-rose-400/80";

    const code = "#" + String(idx + 1).padStart(3, "0");
    const slideCount = book.slide_count || 0;
    const progressFrac = Math.min(1, Math.max(0.15, (slideCount / 40)));

    // Categorization
    let chipText = "MUHANDISLIK";
    let chipColor = "bg-slate-800 text-slate-300 border-slate-700";
    if (/safety|hse|xavfsizlik|hazard/i.test(book.title || '')) {
      chipText = "HSE & XAVFSIZLIK";
      chipColor = "bg-emerald-950/80 text-emerald-300 border-emerald-500/30";
    } else if (/energy|energetika|quyosh|quvvat/i.test(book.title || '')) {
      chipText = "ENERGETIKA";
      chipColor = "bg-cyan-950/80 text-cyan-300 border-cyan-500/30";
    } else if (/muloqot|nutq|communication|rezyume/i.test(book.title || '')) {
      chipText = "BIZNES VA KARYERA";
      chipColor = "bg-amber-950/80 text-amber-300 border-amber-500/30";
    }

    const card = document.createElement("article");
    card.className = "course-card glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 hover:border-brand-500/60 hover:shadow-card-hover transition-all duration-300 flex flex-col justify-between group cursor-pointer relative overflow-hidden";
    card.onclick = () => openReader(book.id, 1);
    
    card.innerHTML = `
      <div>
        <!-- Card Header: Code, Badges & Slide Count -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
              ${code}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeStyle} font-mono">
              ${badgeLabel}
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${chipColor} border font-mono">
              ${chipText}
            </span>
          </div>
          <div class="flex items-center text-xs font-medium text-slate-400 font-mono">
            <i class="fa-regular fa-clone text-[11px] mr-1.5 text-slate-500"></i>
            <span>${slideCount} ${t("slidesCount") || "slayd"}</span>
          </div>
        </div>

        <!-- Title & File metadata -->
        <h3 class="text-base sm:text-lg font-bold text-white group-hover:text-brand-300 transition-colors leading-snug line-clamp-2">
          ${escapeHtml(book.title)}
        </h3>
        <p class="text-xs text-slate-400 font-mono mt-2 truncate flex items-center gap-1.5">
          <i class="${fileIconClass}"></i>
          <span>${escapeHtml(book.original_filename || book.title)}</span>
        </p>

        <!-- Slide Progress Bar -->
        <div class="mt-3.5 mb-1">
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Darslik hajmi</span>
            <span class="text-brand-400 font-bold">${Math.round(progressFrac * 100)}%</span>
          </div>
          <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style="width: ${progressFrac * 100}%;"></div>
          </div>
        </div>

        <!-- Slide preview graphic simulator -->
        <div class="my-4 w-full h-20 rounded-xl bg-obsidian-950 border border-slate-800/80 p-2 flex items-center gap-2 overflow-hidden shadow-inner">
          ${generateSlidePreviewBoxes(book)}
        </div>
      </div>

      <!-- Bottom Action Bar -->
      <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between mt-auto">
        <span class="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          ${t("readyToRead") || "O'qishga tayyor"}
        </span>
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${book.id}', 1)"
          class="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-obsidian-950 font-bold text-xs tracking-wide shadow-glow-emerald transition-all active:scale-95 cursor-pointer"
        >
          <span>${t("readBtn") || "O'qish"}</span>
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderSearchResults(results, query) {
  const searchSection = document.getElementById("searchResultsSection");
  const booksSection = document.getElementById("allBooksSection");
  const resultsList = document.getElementById("resultsList");
  const noResults = document.getElementById("noResultsState");
  const title = document.getElementById("searchResultsTitle");

  if (!searchSection || !booksSection) return;

  booksSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  resultsList.innerHTML = "";

  if (!results || results.length === 0) {
    noResults.classList.remove("hidden");
    title.textContent = `"${query}" — ${t("noResults") || "Natija topilmadi"}`;
    return;
  }

  noResults.classList.add("hidden");
  title.innerHTML = `"${escapeHtml(query)}" — <span class="text-brand-400 font-extrabold">${results.length} ta</span> ${t("foundIn") || "joyda topildi"}`;

  results.forEach(item => {
    const isPpt = (item.file_type || "").toLowerCase().includes("ppt");
    const badgeLabel = isPpt ? "PPTX" : "PDF";

    const itemEl = document.createElement("div");
    itemEl.className = "glass-panel rounded-xl border border-slate-800 p-4 hover:border-brand-500/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group";
    itemEl.onclick = () => openReader(item.book_id, item.slide_number, query);

    const highlightedSnippet = highlightText(item.snippet, query);

    itemEl.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center space-x-2 text-xs text-slate-400 mb-1.5">
          <span class="font-bold text-white group-hover:text-brand-300 transition-colors">📖 ${escapeHtml(item.book_title)}</span>
          <span>•</span>
          <span class="font-semibold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20 font-mono">
            📌 ${item.slide_number}-${t("slide") || "slayd"}
          </span>
          <span class="text-slate-500 font-mono">(${badgeLabel})</span>
        </div>

        <h5 class="text-sm font-bold text-slate-100 mb-2 truncate">
          ${escapeHtml(item.slide_title || (item.slide_number + "-" + (t("slide") || "slayd")))}
        </h5>

        <div class="text-xs text-slate-300 leading-relaxed bg-obsidian-950 p-3 rounded-lg border border-slate-800">
          ${highlightedSnippet}
        </div>
      </div>

      <div class="shrink-0 flex sm:flex-col justify-end">
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${item.book_id}', ${item.slide_number}, '${escapeHtml(query)}')"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-obsidian-950 font-bold text-xs transition active:scale-95 shadow-glow-emerald cursor-pointer"
        >
          <span>${t("readBtn") || "O'qish"}</span>
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </button>
      </div>
    `;
    resultsList.appendChild(itemEl);
  });
}

async function performSearch(query) {
  if (!query) return;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${searchMode}`);
    const data = await res.json();
    renderSearchResults(data.results, query);
  } catch (err) {
    console.error("Qidiruvda xatolik:", err);
  }
}

function setMode(mode) {
  searchMode = mode;
  const modes = ['all', 'content', 'title'];
  modes.forEach(m => {
    const btn = document.getElementById("btnMode" + m.charAt(0).toUpperCase() + m.slice(1));
    if (btn) {
      if (m === mode) {
        btn.className = "scope-pill active px-3.5 py-1 rounded-full font-semibold transition-all bg-brand-500 text-slate-950 shadow-sm";
      } else {
        btn.className = "scope-pill px-3.5 py-1 rounded-full font-medium transition-all bg-obsidian-850 hover:bg-obsidian-800 text-slate-300 border border-slate-800 hover:border-slate-700";
      }
    }
  });

  const query = document.getElementById("searchInput").value.trim();
  if (query) {
    performSearch(query);
  }
}

function quickSearch(word) {
  const input = document.getElementById("searchInput");
  if (!input) return;
  input.value = word;
  currentSearchQuery = word;
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.classList.remove("hidden");
  performSearch(word);
}

function resetSearch() {
  const input = document.getElementById("searchInput");
  if (input) input.value = "";
  currentSearchQuery = "";
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.classList.add("hidden");
  
  const searchSec = document.getElementById("searchResultsSection");
  if (searchSec) searchSec.classList.add("hidden");
  
  const booksSec = document.getElementById("allBooksSection");
  if (booksSec) booksSec.classList.remove("hidden");
}

// =====================================================================
// PRESENTATION VIEWER (READER VIEW LOGIC)
// =====================================================================
async function openReader(bookId, targetSlideNumber = 1, highlightQuery = '') {
  try {
    const res = await fetch(`/api/books/${bookId}`);
    if (!res.ok) throw new Error("Darslikni yuklab bo'lmadi");
    const book = await res.json();
    currentReadingBook = book;

    const bookTitleEl = document.getElementById("readerBookTitle");
    if (bookTitleEl) bookTitleEl.textContent = book.title;

    const footerTitleEl = document.getElementById("slideBookFooterTitle");
    if (footerTitleEl) footerTitleEl.textContent = book.title;

    const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
    const readerBadge = document.getElementById("readerBadge");
    if (readerBadge) {
      readerBadge.textContent = isPpt ? "PPTX TAQDIMOT" : "PDF HUJJAT";
      readerBadge.className = isPpt 
        ? "px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 font-mono"
        : "px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0 font-mono";
    }

    const formatEl = document.getElementById("slideFileFormat");
    if (formatEl) formatEl.textContent = isPpt ? "Taqdimot Slaydi" : "PDF Sahifasi";

    // Setup slide dropdown & sidebars
    const select = document.getElementById("slideSelectDropdown");
    if (select) select.innerHTML = "";

    const desktopSidebar = document.getElementById("readerSidebarSlides");
    if (desktopSidebar) desktopSidebar.innerHTML = "";

    const mobileDrawer = document.getElementById("mobileDrawerSlides");
    if (mobileDrawer) mobileDrawer.innerHTML = "";

    const slides = book.slides || [];
    slides.forEach((s, idx) => {
      // Dropdown option
      if (select) {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = `${s.slide_number}-${t("slide") || "slayd"}: ${(s.title || '').slice(0, 25)}`;
        select.appendChild(opt);
      }

      // Desktop Sidebar button
      if (desktopSidebar) {
        const sBtn = document.createElement("button");
        sBtn.id = `sidebarSlideBtn_${idx}`;
        sBtn.onclick = () => jumpToSlide(idx);
        sBtn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800/80 transition truncate";
        sBtn.innerHTML = `<span class="font-bold text-brand-400 font-mono mr-1.5">${s.slide_number}.</span> ${escapeHtml(s.title || (t("slide") || "Slayd"))}`;
        desktopSidebar.appendChild(sBtn);
      }

      // Mobile Drawer button
      if (mobileDrawer) {
        const mBtn = document.createElement("button");
        mBtn.onclick = () => { jumpToSlide(idx); toggleMobileToc(); };
        mBtn.className = "w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-obsidian-800 text-slate-200 border border-slate-700 transition flex items-center justify-between";
        mBtn.innerHTML = `<span class="truncate font-mono">${s.slide_number}. ${escapeHtml(s.title || (t("slide") || "Slayd"))}</span><i class="fa-solid fa-chevron-right text-brand-400 text-xs"></i>`;
        mobileDrawer.appendChild(mBtn);
      }
    });

    let slideIdx = 0;
    if (targetSlideNumber) {
      const foundIdx = slides.findIndex(s => s.slide_number === targetSlideNumber);
      if (foundIdx !== -1) slideIdx = foundIdx;
    }

    currentSlideIndex = slideIdx;
    updateSlideDisplay(highlightQuery || currentSearchQuery);

    const modal = document.getElementById("readerModal");
    if (modal) modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  } catch (err) {
    alert("Darslikni ochishda xatolik: " + err.message);
  }
}

function updateSlideDisplay(highlightWord = '') {
  if (!currentReadingBook || !currentReadingBook.slides) return;
  const slides = currentReadingBook.slides;
  const slide = slides[currentSlideIndex];
  if (!slide) return;

  const total = slides.length;
  const indicator = document.getElementById("readerSlideIndicator");
  if (indicator) indicator.textContent = `${t("slide") || "Slayd"} ${currentSlideIndex + 1} / ${total}`;

  const numBadge = document.getElementById("slideHeaderNumber");
  if (numBadge) numBadge.textContent = `${slide.slide_number}-${t("slide") || "slayd"}`;

  const select = document.getElementById("slideSelectDropdown");
  if (select) select.value = currentSlideIndex;

  const titleEl = document.getElementById("slideDisplayTitle");
  if (titleEl) {
    titleEl.innerHTML = highlightWord ? highlightText(slide.title, highlightWord) : escapeHtml(slide.title || `${slide.slide_number}-${t("slide") || "slayd"}`);
  }
  
  const contentEl = document.getElementById("slideDisplayContent");
  if (contentEl) {
    if (slide.content) {
      contentEl.innerHTML = formatSlideContent(slide.content, highlightWord);
    } else {
      contentEl.innerHTML = `<span class='text-slate-400 italic'>${t("noSlideContent") || "(Ushbu slaydda matn mavjud emas)"}</span>`;
    }
    contentEl.style.fontSize = `${currentFontSize}px`;
  }

  // Render Slide Images
  renderSlideImages(slide.images || []);

  // Update Prev / Next Buttons state
  const prevBtn = document.getElementById("btnPrevSlide");
  if (prevBtn) {
    prevBtn.disabled = (currentSlideIndex === 0);
    prevBtn.classList.toggle("opacity-40", currentSlideIndex === 0);
  }

  const nextBtn = document.getElementById("btnNextSlide");
  if (nextBtn) {
    nextBtn.disabled = (currentSlideIndex === total - 1);
    nextBtn.classList.toggle("opacity-40", currentSlideIndex === total - 1);
  }

  // Update desktop sidebar active highlight
  slides.forEach((_, idx) => {
    const btn = document.getElementById(`sidebarSlideBtn_${idx}`);
    if (btn) {
      if (idx === currentSlideIndex) {
        btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-bold bg-brand-500 text-slate-950 shadow-glow-emerald transition truncate";
        btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition truncate";
      }
    }
  });

  // Scroll slide view area to top
  const touchArea = document.getElementById("slideTouchArea");
  if (touchArea) touchArea.scrollTop = 0;
}

function renderSlideImages(images) {
  const gallery = document.getElementById("slideImageGallery");
  const container = document.getElementById("slideImagesContainer");
  if (!gallery || !container) return;
  container.innerHTML = "";

  if (!images || images.length === 0) {
    gallery.classList.add("hidden");
    return;
  }

  gallery.classList.remove("hidden");
  images.forEach((imgUrl, i) => {
    const card = document.createElement("div");
    card.className = "group relative rounded-xl overflow-hidden border border-slate-700 bg-obsidian-900 cursor-pointer shadow-md hover:border-brand-500/60 transition aspect-video flex items-center justify-center";
    card.onclick = () => openImageLightbox(imgUrl);
    card.innerHTML = `
      <img src="${imgUrl}" alt="Slayd rasmi ${i+1}" class="w-full h-full object-contain p-1 group-hover:scale-105 transition" loading="lazy" />
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1">
        <span>${t("openLightbox") || "Kattalashtirish"}</span>
        <i class="fa-solid fa-magnifying-glass-plus text-xs"></i>
      </div>
    `;
    container.appendChild(card);
  });
}

function openImageLightbox(src) {
  let modal = document.getElementById("imageLightboxModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "imageLightboxModal";
    modal.className = "fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer";
    modal.onclick = closeImageLightbox;
    modal.innerHTML = `
      <button onclick="closeImageLightbox()" class="absolute top-4 right-4 text-white hover:text-rose-400 text-2xl font-bold w-10 h-10 flex items-center justify-center">✕</button>
      <img id="lightboxImg" src="" alt="Enlarged" class="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" />
    `;
    document.body.appendChild(modal);
  }
  const img = document.getElementById("lightboxImg");
  if (img) img.src = src;
  modal.classList.remove("hidden");
}

function closeImageLightbox() {
  const modal = document.getElementById("imageLightboxModal");
  if (modal) modal.classList.add("hidden");
}

function toggleModalFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function toggleMobileToc() {
  const drawer = document.getElementById("mobileTocDrawer");
  if (drawer) drawer.classList.toggle("hidden");
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    updateSlideDisplay(currentSearchQuery);
  }
}

function nextSlide() {
  if (currentReadingBook && currentSlideIndex < currentReadingBook.slides.length - 1) {
    currentSlideIndex++;
    updateSlideDisplay(currentSearchQuery);
  }
}

function jumpToSlide(idx) {
  currentSlideIndex = idx;
  updateSlideDisplay(currentSearchQuery);
}

function changeFontSize(delta) {
  currentFontSize = Math.max(13, Math.min(26, currentFontSize + delta * 2));
  const content = document.getElementById("slideDisplayContent");
  if (content) content.style.fontSize = `${currentFontSize}px`;
}

function closeReader() {
  const modal = document.getElementById("readerModal");
  if (modal) modal.classList.add("hidden");
  
  const drawer = document.getElementById("mobileTocDrawer");
  if (drawer) drawer.classList.add("hidden");
  
  document.body.style.overflow = "auto";
  currentReadingBook = null;
}

function formatSlideContent(text, highlightWord) {
  if (!text) return "";

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map(part => {
    if (part.match(/^https?:\/\//i)) {
      const cleanUrl = part.trim();

      // YouTube Match
      const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        return `
          <div class="my-4 p-4 bg-obsidian-900 border border-red-500/30 rounded-2xl">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-red-400 flex items-center gap-1.5">
                <i class="fa-brands fa-youtube text-red-500 text-sm"></i>
                ${t("ytVideo") || "YouTube Video"}
              </span>
              <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-red-400 hover:underline inline-flex items-center gap-1">
                ${t("openDirectly") || "To'g'ridan-to'g'ri ochish ↗"}
              </a>
            </div>
            <div class="aspect-video w-full rounded-xl overflow-hidden shadow-lg bg-black">
              <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>
        `;
      }

      // Standard Link
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-400 underline font-bold hover:text-brand-300 break-all inline-flex items-center gap-1 my-1">${cleanUrl} <i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-brand-400"></i></a>`;
    }

    if (highlightWord) {
      return highlightText(part, highlightWord);
    }
    return escapeHtml(part);
  }).join("");
}

function setupTouchGestures() {
  const area = document.getElementById("slideTouchArea");
  if (!area) return;

  area.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  area.addEventListener("touchend", (e) => {
    if (!touchStartX || !e.changedTouches || !e.changedTouches[0]) return;
    const diffX = e.changedTouches[0].clientX - touchStartX;
    const diffY = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX < 0) {
        currentLang === "ar" ? prevSlide() : nextSlide();
      } else {
        currentLang === "ar" ? nextSlide() : prevSlide();
      }
    }
    touchStartX = 0;
    touchStartY = 0;
  }, { passive: true });
}

// =====================================================================
// LANGUAGE MANAGEMENT
// =====================================================================
function t(key) {
  const dict = (typeof TRANSLATIONS !== "undefined" && TRANSLATIONS[currentLang]) ? TRANSLATIONS[currentLang] : (typeof TRANSLATIONS !== "undefined" ? TRANSLATIONS.uz : {});
  return (dict && dict[key]) || (TRANSLATIONS && TRANSLATIONS.uz && TRANSLATIONS.uz[key]) || key;
}

function applyLanguage(lang) {
  if (typeof TRANSLATIONS === "undefined") return;
  if (!TRANSLATIONS[lang]) lang = "uz";
  currentLang = lang;
  localStorage.setItem("aljabr_lang", lang);

  const dict = TRANSLATIONS[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = dict.dir || "ltr";

  // Translate all data-i18n elements
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    if (dict[k]) {
      el.textContent = dict[k];
    }
  });

  // Translate placeholders
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const k = el.getAttribute("data-i18n-ph");
    if (dict[k]) {
      el.placeholder = dict[k];
    }
  });

  // Render popular tags
  renderPopularTags();

  // Re-render books and results with updated text
  if (currentBooks.length > 0) {
    applyFilterAndSort();
  }
}

function changeLanguage(lang) {
  applyLanguage(lang);
}

function renderPopularTags() {
  const box = document.getElementById("popularTagsBox");
  if (!box) return;

  const dict = (typeof TRANSLATIONS !== "undefined" && TRANSLATIONS[currentLang]) ? TRANSLATIONS[currentLang] : (TRANSLATIONS ? TRANSLATIONS.uz : {});
  const tags = (dict && dict.popularTags) || ["safety", "hazard", "muloqot", "rezyume", "vaqt", "energetika"];

  box.innerHTML = `<span class="text-xs text-slate-400 font-medium mr-1">${t("popularLabel") || "Ommabop:"}</span>`;
  tags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "tag-pill text-xs px-2.5 py-0.5 rounded-full bg-slate-800/80 hover:bg-brand-500/20 text-slate-300 hover:text-brand-300 border border-slate-700/60 transition-colors cursor-pointer";
    btn.textContent = tag;
    btn.onclick = () => quickSearch(tag);
    box.appendChild(btn);
  });
}

// =====================================================================
// HELPERS
// =====================================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightText(text, query) {
  if (!text) return "";
  if (!query) return escapeHtml(text);

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");

  const parts = text.split(regex);
  return parts.map(part => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return `<mark>${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join("");
}

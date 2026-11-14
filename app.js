// --- State Management ---
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

// Touch Gestures
let touchStartX = 0;
let touchStartY = 0;

// --- Init on Load ---
document.addEventListener("DOMContentLoaded", () => {
  // Apply initial theme & language
  applyTheme(currentTheme);
  applyLanguage(currentLang);
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = currentLang;

  // Fetch books
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

  // Global Keyboard shortcuts: Ctrl+K / Cmd+K and Arrow keys for reader
  window.addEventListener("keydown", (e) => {
    // Ctrl+K / Cmd+K to search
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

// --- Theme Management ---

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

// --- Language Management ---

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

// --- API Calls ---

async function fetchBooks() {
  try {
    const res = await fetch("/api/books");
    const books = await res.json();
    currentBooks = books;
    
    // Update live metrics banner
    const totalSlides = books.reduce((acc, b) => acc + (b.slide_count || 0), 0);
    const metricSlides = document.getElementById("metricTotalSlides");
    if (metricSlides) metricSlides.innerHTML = `${totalSlides}<span class="text-brand-400">+</span>`;

    const metricBooks = document.getElementById("metricTotalBooks");
    if (metricBooks) metricBooks.textContent = books.length;

    applyFilterAndSort();
  } catch (err) {
    console.error("Darsliklarni yuklashda xatolik:", err);
  }
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

// --- Category Filtering and Sorting ---

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

// --- Render Functions ---

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
    badge.textContent = `${books.length} ${t("slidesCount") ? "Darslik" : "Modules"}`;
  }

  if (!books || books.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 glass-panel rounded-2xl border border-slate-800 p-6">
        <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 text-2xl">
          <i class="fa-solid fa-book"></i>
        </div>
        <h4 class="font-bold text-white text-base">${t("emptyCatalog")}</h4>
        <p class="text-xs text-slate-400 mt-1">${t("emptyCatalogDesc")}</p>
      </div>
    `;
    return;
  }

  books.forEach(book => {
    const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
    const badgeStyle = isPpt 
      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" 
      : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30";
    const badgeLabel = isPpt ? "PPTX" : "PDF";
    const fileIconClass = isPpt ? "fa-regular fa-file-powerpoint text-amber-400/80" : "fa-regular fa-file-pdf text-rose-400/80";

    const card = document.createElement("article");
    card.className = "course-card glass-panel rounded-2xl p-5 sm:p-6 border border-slate-800 hover:border-brand-500/50 hover:shadow-card-hover transition-all duration-300 flex flex-col justify-between group cursor-pointer";
    card.onclick = () => openReader(book.id, 1);
    
    card.innerHTML = `
      <div>
        <!-- Card Header Badge & Slide Count -->
        <div class="flex items-center justify-between mb-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${badgeStyle}">
            ${badgeLabel}
          </span>
          <div class="flex items-center text-xs font-medium text-slate-400">
            <i class="fa-regular fa-clone text-[11px] mr-1.5 text-slate-500"></i>
            <span>${book.slide_count || 0} ${t("slidesCount")}</span>
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

        <!-- Slide preview graphic simulator -->
        <div class="my-4 sm:my-5 w-full h-20 sm:h-24 rounded-lg bg-obsidian-900 border border-slate-800 p-2 sm:p-2.5 flex items-center gap-2 overflow-hidden">
          ${generateSlidePreviewBoxes(book)}
        </div>
      </div>

      <!-- Bottom Action Bar -->
      <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between mt-auto">
        <span class="text-xs font-medium text-slate-400 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          ${t("readyToRead")}
        </span>
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${book.id}', 1)"
          class="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-obsidian-950 font-semibold text-xs tracking-wide shadow-sm hover:shadow-glow-emerald transition-all active:scale-95 cursor-pointer"
        >
          <span>${t("readBtn")}</span>
          <i class="fa-solid fa-book-open-reader text-xs"></i>
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
    title.textContent = `"${query}" — ${t("noResults")}`;
    return;
  }

  noResults.classList.add("hidden");
  title.innerHTML = `"${escapeHtml(query)}" — <span class="text-brand-400 font-extrabold">${results.length} ta</span> ${t("foundIn")}`;

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
            📌 ${item.slide_number}-${t("slide")}
          </span>
          <span class="text-slate-500 font-mono">(${badgeLabel})</span>
        </div>

        <h5 class="text-sm font-bold text-slate-100 mb-2 truncate">
          ${escapeHtml(item.slide_title || (item.slide_number + "-" + t("slide")))}
        </h5>

        <div class="text-xs text-slate-300 leading-relaxed bg-obsidian-900/90 p-3 rounded-lg border border-slate-800">
          ${highlightedSnippet}
        </div>
      </div>

      <div class="shrink-0 flex sm:flex-col justify-end">
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${item.book_id}', ${item.slide_number}, '${escapeHtml(query)}')"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-obsidian-950 font-bold text-xs transition active:scale-95 shadow-glow-emerald cursor-pointer"
        >
          <span>${t("readBtn")}</span>
          <i class="fa-solid fa-arrow-right text-xs"></i>
        </button>
      </div>
    `;
    resultsList.appendChild(itemEl);
  });
}

// --- Search Filter Modes & Quick Tags ---

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

// --- Mobile Gesture Support ---

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

// --- Reader View Logic ---

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
      readerBadge.textContent = isPpt ? "PPTX" : "PDF";
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
        opt.textContent = `${s.slide_number}-${t("slide")}: ${(s.title || '').slice(0, 25)}`;
        select.appendChild(opt);
      }

      // Desktop Sidebar button
      if (desktopSidebar) {
        const sBtn = document.createElement("button");
        sBtn.id = `sidebarSlideBtn_${idx}`;
        sBtn.onclick = () => jumpToSlide(idx);
        sBtn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800/80 transition truncate";
        sBtn.innerHTML = `<span class="font-bold text-brand-400 font-mono mr-1.5">${s.slide_number}.</span> ${escapeHtml(s.title || t("slide"))}`;
        desktopSidebar.appendChild(sBtn);
      }

      // Mobile Drawer button
      if (mobileDrawer) {
        const mBtn = document.createElement("button");
        mBtn.onclick = () => { jumpToSlide(idx); toggleMobileToc(); };
        mBtn.className = "w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-obsidian-800 text-slate-200 border border-slate-700 transition flex items-center justify-between";
        mBtn.innerHTML = `<span class="truncate font-mono">${s.slide_number}. ${escapeHtml(s.title || t("slide"))}</span><i class="fa-solid fa-chevron-right text-brand-400 text-xs"></i>`;
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
      contentEl.innerHTML = `<span class='text-slate-400 italic'>${t("noSlideContent")}</span>`;
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

// --- Content Formatter (Links & YouTube Video Player) ---

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
                ${t("ytVideo")}
              </span>
              <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-red-400 hover:underline inline-flex items-center gap-1">
                ${t("openDirectly")}
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

// --- Helpers ---

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

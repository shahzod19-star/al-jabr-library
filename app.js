// --- State Management ---
let currentBooks = [];
let searchMode = 'all'; // 'all', 'content', 'title'
let currentSearchQuery = '';
let searchDebounceTimer = null;

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
  document.getElementById("langSelect").value = currentLang;

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
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    currentSearchQuery = val;
    
    document.getElementById("clearSearchBtn").classList.toggle("hidden", !val);

    clearTimeout(searchDebounceTimer);
    if (val.length === 0) {
      resetSearch();
    } else {
      searchDebounceTimer = setTimeout(() => {
        performSearch(val);
      }, 250);
    }
  });

  // Keyboard navigation for reader
  window.addEventListener("keydown", (e) => {
    const modal = document.getElementById("readerModal");
    if (!modal.classList.contains("hidden")) {
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
    icon.textContent = "☀️";
  } else {
    html.classList.remove("dark");
    icon.textContent = "🌙";
  }
}

function toggleTheme() {
  const next = currentTheme === "dark" ? "light" : "dark";
  applyTheme(next);
}

// --- Language Management ---

function t(key) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.uz;
  return dict[key] || TRANSLATIONS.uz[key] || key;
}

function applyLanguage(lang) {
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
    renderBooksCatalog(currentBooks);
  }
}

function changeLanguage(lang) {
  applyLanguage(lang);
}

function renderPopularTags() {
  const box = document.getElementById("popularTagsBox");
  if (!box) return;

  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.uz;
  const tags = dict.popularTags || [];

  box.innerHTML = `<span class="text-slate-400 dark:text-slate-500 text-[11px] shrink-0">${t("popularLabel")}</span>`;
  tags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "shrink-0 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-brand-900/30 text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 text-xs transition border border-slate-200/60 dark:border-slate-700/60";
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
    renderBooksCatalog(books);

    // Update count badge
    const badge = document.getElementById("catalogCountBadge");
    if (badge) badge.textContent = books.length;
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

// --- Render Functions ---

function renderBooksCatalog(books) {
  const container = document.getElementById("booksGrid");
  container.innerHTML = "";

  if (!books || books.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <p class="text-3xl mb-2">📚</p>
        <h4 class="font-bold text-slate-800 dark:text-slate-200">${t("emptyCatalog")}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${t("emptyCatalogDesc")}</p>
      </div>
    `;
    return;
  }

  books.forEach(book => {
    const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
    const badgeClass = isPpt 
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800" 
      : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800";
    const badgeLabel = isPpt ? "PPTX" : "PDF";

    const card = document.createElement("div");
    card.className = "bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:border-brand-500/60 dark:hover:border-brand-500/60 transition flex flex-col justify-between cursor-pointer active:scale-[0.98] select-none touch-manipulation";
    card.onclick = () => openReader(book.id, 1);
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${badgeClass}">
            ${badgeLabel}
          </span>
          <span class="text-xs font-semibold text-slate-400 dark:text-slate-500">
            ${book.slide_count || 0} ${t("slidesCount")}
          </span>
        </div>
        <h4 class="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base line-clamp-2 mb-1.5 leading-snug">
          ${escapeHtml(book.title)}
        </h4>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1">
          ${escapeHtml(book.original_filename)}
        </p>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <span class="text-[11px] font-medium text-slate-400 dark:text-slate-500">${t("readyToRead")}</span>
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${book.id}', 1)"
          class="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 text-white font-bold text-xs transition active:scale-95 shadow-xs touch-manipulation cursor-pointer"
        >
          <span>${t("readBtn")}</span>
          <span>📖</span>
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

  booksSection.classList.add("hidden");
  searchSection.classList.remove("hidden");
  resultsList.innerHTML = "";

  if (!results || results.length === 0) {
    noResults.classList.remove("hidden");
    title.textContent = `"${query}" — ${t("noResults")}`;
    return;
  }

  noResults.classList.add("hidden");
  title.innerHTML = `"${escapeHtml(query)}" — <span class="text-brand-600 dark:text-brand-400 font-extrabold">${results.length} ta</span> ${t("foundIn")}`;

  results.forEach(item => {
    const isPpt = (item.file_type || "").toLowerCase().includes("ppt");
    const badgeLabel = isPpt ? "PPTX" : "PDF";

    const itemEl = document.createElement("div");
    itemEl.className = "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 hover:border-brand-400 dark:hover:border-brand-500/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer active:scale-[0.99] select-none touch-manipulation";
    itemEl.onclick = () => openReader(item.book_id, item.slide_number, query);

    const highlightedSnippet = highlightText(item.snippet, query);

    itemEl.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
          <span class="font-bold text-slate-800 dark:text-slate-200">📖 ${escapeHtml(item.book_title)}</span>
          <span>•</span>
          <span class="font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/40 px-2 py-0.5 rounded">
            📌 ${item.slide_number}-${t("slide")}
          </span>
          <span class="text-slate-400">(${badgeLabel})</span>
        </div>

        <h5 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5 truncate">
          ${escapeHtml(item.slide_title || (item.slide_number + "-" + t("slide")))}
        </h5>

        <div class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/60">
          ${highlightedSnippet}
        </div>
      </div>

      <div class="shrink-0 flex sm:flex-col justify-end">
        <button 
          type="button"
          onclick="event.stopPropagation(); openReader('${item.book_id}', ${item.slide_number}, '${escapeHtml(query)}')"
          class="w-full sm:w-auto inline-flex items-center justify-center space-x-1 px-4 py-2 rounded-xl bg-brand-600 text-white font-bold text-xs shadow-sm shadow-brand-600/30 transition active:scale-95 touch-manipulation cursor-pointer"
        >
          <span>${t("readBtn")}</span>
          <span>→</span>
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
    if (m === mode) {
      btn.className = "shrink-0 px-3 py-1 rounded-full bg-brand-600 text-white font-bold shadow-xs transition";
    } else {
      btn.className = "shrink-0 px-3 py-1 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition";
    }
  });

  const query = document.getElementById("searchInput").value.trim();
  if (query) {
    performSearch(query);
  }
}

function quickSearch(word) {
  const input = document.getElementById("searchInput");
  input.value = word;
  currentSearchQuery = word;
  document.getElementById("clearSearchBtn").classList.remove("hidden");
  performSearch(word);
}

function resetSearch() {
  const input = document.getElementById("searchInput");
  input.value = "";
  currentSearchQuery = "";
  document.getElementById("clearSearchBtn").classList.add("hidden");
  document.getElementById("searchResultsSection").classList.add("hidden");
  document.getElementById("allBooksSection").classList.remove("hidden");
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

    // Only respond to horizontal swipes (avoid capturing vertical scrolling)
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX < 0) {
        // Swiped Left -> Next
        currentLang === "ar" ? prevSlide() : nextSlide();
      } else {
        // Swiped Right -> Prev
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

    document.getElementById("readerBookTitle").textContent = book.title;
    document.getElementById("slideBookFooterTitle").textContent = book.title;

    const isPpt = (book.file_type || "").toLowerCase().includes("ppt");
    document.getElementById("readerBadge").textContent = isPpt ? "PPT" : "PDF";
    document.getElementById("slideFileFormat").textContent = isPpt ? "Taqdimot Slaydi" : "PDF Sahifasi";

    // Setup slide selector dropdown & sidebars
    const select = document.getElementById("slideSelectDropdown");
    select.innerHTML = "";

    const desktopSidebar = document.getElementById("readerSidebarSlides");
    desktopSidebar.innerHTML = "";

    const mobileDrawer = document.getElementById("mobileDrawerSlides");
    mobileDrawer.innerHTML = "";

    const slides = book.slides || [];
    slides.forEach((s, idx) => {
      // Dropdown option
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${s.slide_number}-${t("slide")}: ${(s.title || '').slice(0, 25)}`;
      select.appendChild(opt);

      // Desktop Sidebar button
      const sBtn = document.createElement("button");
      sBtn.id = `sidebarSlideBtn_${idx}`;
      sBtn.onclick = () => jumpToSlide(idx);
      sBtn.className = "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition truncate";
      sBtn.innerHTML = `<span class="font-bold text-brand-600 dark:text-brand-400">${s.slide_number}.</span> ${escapeHtml(s.title || t("slide"))}`;
      desktopSidebar.appendChild(sBtn);

      // Mobile Drawer button
      const mBtn = document.createElement("button");
      mBtn.onclick = () => { jumpToSlide(idx); toggleMobileToc(); };
      mBtn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 transition flex items-center justify-between";
      mBtn.innerHTML = `<span class="truncate">${s.slide_number}. ${escapeHtml(s.title || t("slide"))}</span><span class="text-brand-600 dark:text-brand-400 text-xs">→</span>`;
      mobileDrawer.appendChild(mBtn);
    });

    let slideIdx = 0;
    if (targetSlideNumber) {
      const foundIdx = slides.findIndex(s => s.slide_number === targetSlideNumber);
      if (foundIdx !== -1) slideIdx = foundIdx;
    }

    currentSlideIndex = slideIdx;
    updateSlideDisplay(highlightQuery || currentSearchQuery);

    document.getElementById("readerModal").classList.remove("hidden");
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
  document.getElementById("readerSlideIndicator").textContent = `${t("slide")} ${currentSlideIndex + 1} / ${total}`;
  document.getElementById("slideHeaderNumber").textContent = `${slide.slide_number}-${t("slide")}`;
  document.getElementById("slideSelectDropdown").value = currentSlideIndex;

  const titleEl = document.getElementById("slideDisplayTitle");
  const contentEl = document.getElementById("slideDisplayContent");

  titleEl.innerHTML = highlightWord ? highlightText(slide.title, highlightWord) : escapeHtml(slide.title || `${slide.slide_number}-${t("slide")}`);
  
  if (slide.content) {
    contentEl.innerHTML = formatSlideContent(slide.content, highlightWord);
  } else {
    contentEl.innerHTML = `<span class='text-slate-400 italic'>${t("noSlideContent")}</span>`;
  }
  contentEl.style.fontSize = `${currentFontSize}px`;

  // Render Slide Images
  renderSlideImages(slide.images || []);

  // Update Prev / Next Buttons state
  document.getElementById("btnPrevSlide").disabled = (currentSlideIndex === 0);
  document.getElementById("btnPrevSlide").classList.toggle("opacity-40", currentSlideIndex === 0);

  document.getElementById("btnNextSlide").disabled = (currentSlideIndex === total - 1);
  document.getElementById("btnNextSlide").classList.toggle("opacity-40", currentSlideIndex === total - 1);

  // Update desktop sidebar active highlight
  slides.forEach((_, idx) => {
    const btn = document.getElementById(`sidebarSlideBtn_${idx}`);
    if (btn) {
      if (idx === currentSlideIndex) {
        btn.className = "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold bg-brand-600 text-white shadow-xs transition truncate";
        btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        btn.className = "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition truncate";
      }
    }
  });

  // Scroll slide card to top on slide change
  const touchArea = document.getElementById("slideTouchArea");
  if (touchArea) touchArea.scrollTop = 0;
}

function renderSlideImages(images) {
  const gallery = document.getElementById("slideImageGallery");
  const container = document.getElementById("slideImagesContainer");
  container.innerHTML = "";

  if (!images || images.length === 0) {
    gallery.classList.add("hidden");
    return;
  }

  gallery.classList.remove("hidden");
  images.forEach((imgUrl, i) => {
    const card = document.createElement("div");
    card.className = "group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 cursor-pointer shadow-xs hover:shadow-md transition aspect-video flex items-center justify-center";
    card.onclick = () => openImageLightbox(imgUrl);
    card.innerHTML = `
      <img src="${imgUrl}" alt="Slayd rasmi ${i+1}" class="w-full h-full object-contain p-1 group-hover:scale-105 transition" loading="lazy" />
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[11px] font-bold">
        <span>${t("openLightbox")} 🔍</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function openImageLightbox(src) {
  const modal = document.getElementById("imageLightboxModal");
  const img = document.getElementById("lightboxImg");
  img.src = src;
  modal.classList.remove("hidden");
}

function closeImageLightbox() {
  document.getElementById("imageLightboxModal").classList.add("hidden");
}

function toggleMobileToc() {
  const drawer = document.getElementById("mobileTocDrawer");
  drawer.classList.toggle("hidden");
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
  document.getElementById("slideDisplayContent").style.fontSize = `${currentFontSize}px`;
}

function closeReader() {
  document.getElementById("readerModal").classList.add("hidden");
  document.getElementById("mobileTocDrawer").classList.add("hidden");
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
          <div class="my-3.5 p-3 sm:p-4 bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <svg class="w-4 h-4 fill-red-600" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                ${t("ytVideo")}
              </span>
              <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1">
                ${t("openDirectly")}
              </a>
            </div>
            <div class="aspect-video w-full rounded-xl overflow-hidden shadow-sm bg-black">
              <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>
        `;
      }

      // Standard Link
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-600 dark:text-brand-400 underline font-bold hover:text-brand-700 dark:hover:text-brand-300 break-all inline-flex items-center gap-1 my-1">${cleanUrl} <svg class="w-3.5 h-3.5 inline text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>`;
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

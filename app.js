(() => {
  const DEFAULT_INSTANCE = "mastodon.social";
  const BATCH_SIZE = 60;

  const presetSelect = document.getElementById("preset-select");
  const instanceForm = document.getElementById("instance-form");
  const instanceInput = document.getElementById("instance-input");
  const loadBtn = document.getElementById("load-btn");
  const statusBar = document.getElementById("status-bar");

  const searchInput = document.getElementById("search-input");
  const categorySelect = document.getElementById("category-select");
  const showHiddenToggle = document.getElementById("show-hidden-toggle");
  const hiddenToggleGroup = document.getElementById("hidden-toggle-group");
  const hiddenToggleText = document.getElementById("hidden-toggle-text");
  const resultsSummary = document.getElementById("results-summary");
  const emojiGrid = document.getElementById("emoji-grid");
  const loadMoreWrap = document.getElementById("load-more-wrap");
  const loadMoreBtn = document.getElementById("load-more-btn");

  const heroSpotlightEl = document.getElementById("hero-spotlight");
  const spotlightEmojisEl = document.getElementById("spotlight-emojis");
  const toastEl = document.getElementById("toast");

  let allEmojis = [];
  let filteredEmojis = [];
  let renderedCount = 0;
  let activeInstance = DEFAULT_INSTANCE;
  let toastTimer = null;
  let searchDebounceTimer = null;
  let activeFetchController = null;

  function normalizeInstance(raw) {
    let cleaned = raw.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.replace(/[/?#].*$/, "");
    if (cleaned.includes("@")) {
      cleaned = cleaned.split("@").filter(Boolean).pop() || "";
    }
    if (!cleaned) return "";
    try {
      const parsed = new URL(`https://${cleaned}`);
      if (parsed.username || parsed.password || !parsed.hostname) {
        return "";
      }
      if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
        return "";
      }
      return parsed.host;
    } catch {
      return "";
    }
  }

  function isSafeHttpUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  function createEmojiImage(emoji, code, lazy = true) {
    const img = document.createElement("img");
    const primaryUrl = isSafeHttpUrl(emoji.url)
      ? emoji.url
      : isSafeHttpUrl(emoji.static_url)
        ? emoji.static_url
        : "";
    const fallbackUrl = isSafeHttpUrl(emoji.static_url) ? emoji.static_url : "";

    if (primaryUrl) {
      img.src = primaryUrl;
    }
    img.alt = code;
    if (lazy) {
      img.loading = "lazy";
    }
    img.decoding = "async";

    if (fallbackUrl && primaryUrl && fallbackUrl !== primaryUrl) {
      img.addEventListener(
        "error",
        () => {
          img.src = fallbackUrl;
        },
        { once: true }
      );
    }
    return img;
  }

  function syncPresetDropdown(domain) {
    const matchingOption = Array.from(presetSelect.options).find(
      (opt) => opt.value === domain
    );
    presetSelect.value = matchingOption ? domain : "__custom__";
  }

  function setStatus(message, isError = false) {
    statusBar.textContent = message;
    statusBar.classList.toggle("is-error", isError);
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      document.body.removeChild(textarea);
    }
    return copied;
  }

  async function copyShortcode(shortcodeText, sourceEl = null) {
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(shortcodeText);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      copied = fallbackCopyText(shortcodeText);
    }

    if (copied) {
      showToast(`Copied ${shortcodeText} (${shortcodeText.length} chars)`);
      return;
    }

    if (sourceEl && window.getSelection) {
      const range = document.createRange();
      range.selectNodeContents(sourceEl);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      showToast(`Selected ${shortcodeText} (${shortcodeText.length} chars)`);
      return;
    }

    showToast(`Copy blocked: copy ${shortcodeText} manually`);
  }

  function updateHiddenToggleState(emojis) {
    const hiddenCount = emojis.filter((e) => e.visible_in_picker === false).length;
    const hasHidden = hiddenCount > 0;
    hiddenToggleGroup.hidden = !hasHidden;
    hiddenToggleText.textContent = `Include hidden (${hiddenCount})`;
    showHiddenToggle.disabled = !hasHidden;
    if (!hasHidden) {
      showHiddenToggle.checked = false;
    }
  }

  function populateCategories(emojis) {
    const previousValue = categorySelect.value;
    const includeHidden = showHiddenToggle.checked;
    const categories = new Set();
    let hasUncategorized = false;

    for (const emoji of emojis) {
      if (!includeHidden && emoji.visible_in_picker === false) {
        continue;
      }
      if (emoji.category && emoji.category.trim()) {
        categories.add(emoji.category.trim());
      } else {
        hasUncategorized = true;
      }
    }

    const sorted = Array.from(categories).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    categorySelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "__all__";
    allOpt.textContent = "All categories";
    categorySelect.appendChild(allOpt);

    for (const cat of sorted) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    }

    if (hasUncategorized) {
      const uncatOpt = document.createElement("option");
      uncatOpt.value = "__uncategorized__";
      uncatOpt.textContent = "Uncategorized";
      categorySelect.appendChild(uncatOpt);
    }

    const hasPrevious = Array.from(categorySelect.options).some(
      (opt) => opt.value === previousValue
    );
    categorySelect.value = hasPrevious ? previousValue : "__all__";
  }

  function renderSpotlight(emojis) {
    spotlightEmojisEl.innerHTML = "";
    const visible = emojis.filter((e) => e.visible_in_picker !== false);
    if (visible.length === 0) {
      heroSpotlightEl.hidden = true;
      return;
    }

    heroSpotlightEl.hidden = false;
    const sampleCount = Math.min(8, visible.length);
    const step = Math.max(1, Math.floor(visible.length / sampleCount));
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < sampleCount; i += 1) {
      const emoji = visible[Math.min(i * step, visible.length - 1)];
      const code = `:${emoji.shortcode}:`;

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "spotlight-pill";
      pill.title = `Click to copy ${code} (${code.length} chars)`;

      const img = createEmojiImage(emoji, code, false);

      const label = document.createElement("code");
      label.textContent = code;
      pill.addEventListener("click", () => copyShortcode(code, label));

      pill.appendChild(img);
      pill.appendChild(label);
      fragment.appendChild(pill);
    }

    spotlightEmojisEl.appendChild(fragment);
  }

  function createEmojiCard(emoji) {
    const code = `:${emoji.shortcode}:`;

    const card = document.createElement("article");
    card.className = "emoji-card";

    const imgWrap = document.createElement("div");
    imgWrap.className = "emoji-img-wrap";
    imgWrap.appendChild(createEmojiImage(emoji, code, true));

    const codeEl = document.createElement("div");
    codeEl.className = "emoji-shortcode";
    codeEl.textContent = code;

    const metaEl = document.createElement("div");
    metaEl.className = "emoji-meta";
    const catLabel = emoji.category ? emoji.category.trim() : "Uncategorized";
    metaEl.textContent = `${code.length} chars · ${catLabel}`;

    if (emoji.visible_in_picker === false) {
      const hiddenBadge = document.createElement("span");
      hiddenBadge.className = "emoji-hidden-badge";
      hiddenBadge.textContent = "Hidden";
      hiddenBadge.title =
        "Hidden from this server's emoji picker, but :shortcode: still works";
      metaEl.appendChild(document.createTextNode(" "));
      metaEl.appendChild(hiddenBadge);
    }

    const actions = document.createElement("div");
    actions.className = "emoji-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-copy";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copyShortcode(code, codeEl));

    actions.appendChild(copyBtn);

    card.appendChild(imgWrap);
    card.appendChild(codeEl);
    card.appendChild(metaEl);
    card.appendChild(actions);

    return card;
  }

  function updateResultsSummary() {
    if (allEmojis.length === 0) {
      resultsSummary.textContent = "";
      return;
    }
    const hiddenTotal = allEmojis.filter((e) => e.visible_in_picker === false).length;
    const hiddenNote =
      !showHiddenToggle.checked && hiddenTotal > 0
        ? ` (${hiddenTotal} hidden excluded)`
        : "";
    const scrollNote =
      renderedCount < filteredEmojis.length ? " (scroll for more)" : "";
    resultsSummary.textContent = `Showing ${renderedCount} of ${filteredEmojis.length} matching custom emojis on ${activeInstance}${hiddenNote}${scrollNote}`;
  }

  function renderNextBatch() {
    if (renderedCount >= filteredEmojis.length) {
      loadMoreWrap.hidden = true;
      updateResultsSummary();
      return;
    }

    const nextSlice = filteredEmojis.slice(renderedCount, renderedCount + BATCH_SIZE);
    const fragment = document.createDocumentFragment();
    for (const emoji of nextSlice) {
      fragment.appendChild(createEmojiCard(emoji));
    }
    emojiGrid.appendChild(fragment);
    renderedCount += nextSlice.length;

    const remaining = filteredEmojis.length - renderedCount;
    loadMoreWrap.hidden = remaining <= 0;
    if (remaining > 0) {
      loadMoreBtn.textContent = `Load more emojis (${remaining} remaining)`;
    }
    updateResultsSummary();
  }

  function renderEmojis() {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value.trim().toLowerCase();
    const selectedCategory = categorySelect.value;
    const includeHidden = showHiddenToggle.checked;

    filteredEmojis = allEmojis.filter((emoji) => {
      if (!includeHidden && emoji.visible_in_picker === false) {
        return false;
      }
      const cat = emoji.category ? emoji.category.trim() : "";
      if (selectedCategory === "__uncategorized__" && cat !== "") {
        return false;
      }
      if (
        selectedCategory !== "__all__" &&
        selectedCategory !== "__uncategorized__" &&
        cat !== selectedCategory
      ) {
        return false;
      }
      if (query) {
        const haystack = `${emoji.shortcode} ${cat}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });

    emojiGrid.innerHTML = "";
    renderedCount = 0;

    if (filteredEmojis.length === 0) {
      loadMoreWrap.hidden = true;
      updateResultsSummary();
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No custom emojis match your current filter.";
      emojiGrid.appendChild(empty);
      return;
    }

    renderNextBatch();
  }

  async function loadInstance(rawDomain) {
    const domain = normalizeInstance(rawDomain);
    if (!domain) {
      setStatus("Please enter a valid Mastodon domain (for example, mastodon.social).", true);
      return;
    }

    if (activeFetchController) {
      activeFetchController.abort();
    }
    const controller = new AbortController();
    activeFetchController = controller;

    activeInstance = domain;
    instanceInput.value = domain;
    syncPresetDropdown(domain);

    const url = new URL(window.location.href);
    url.searchParams.set("instance", domain);
    window.history.replaceState({}, "", url);

    loadBtn.disabled = true;
    loadMoreWrap.hidden = true;
    setStatus(`Fetching custom emojis from ${domain}…`);
    emojiGrid.innerHTML = "";
    resultsSummary.textContent = "";

    try {
      const response = await fetch(`https://${domain}/api/v1/custom_emojis`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server responded with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Unexpected response format from server.");
      }

      allEmojis = data
        .filter((item) => item && typeof item.shortcode === "string")
        .sort((a, b) =>
          a.shortcode.localeCompare(b.shortcode, undefined, { sensitivity: "base" })
        );

      updateHiddenToggleState(allEmojis);
      populateCategories(allEmojis);
      renderSpotlight(allEmojis);
      renderEmojis();
      setStatus(`Loaded ${allEmojis.length} custom emojis from ${domain}.`);
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      allEmojis = [];
      filteredEmojis = [];
      renderedCount = 0;
      updateHiddenToggleState([]);
      populateCategories([]);
      renderSpotlight([]);
      setStatus(
        `Could not load emojis from "${domain}" (${err.message}). Check the domain name or whether that server allows public API/CORS requests.`,
        true
      );
    } finally {
      if (activeFetchController === controller) {
        loadBtn.disabled = false;
      }
    }
  }

  presetSelect.addEventListener("change", () => {
    if (presetSelect.value !== "__custom__") {
      loadInstance(presetSelect.value);
    } else {
      instanceInput.focus();
      instanceInput.select();
    }
  });

  instanceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadInstance(instanceInput.value);
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderEmojis, 120);
  });
  categorySelect.addEventListener("change", renderEmojis);
  showHiddenToggle.addEventListener("change", () => {
    populateCategories(allEmojis);
    renderEmojis();
  });
  loadMoreBtn.addEventListener("click", renderNextBatch);

  if ("IntersectionObserver" in window) {
    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadMoreWrap.hidden) {
          renderNextBatch();
        }
      },
      { rootMargin: "300px" }
    );
    scrollObserver.observe(loadMoreWrap);
  }

  const initialFromUrl = new URLSearchParams(window.location.search).get("instance");
  loadInstance(initialFromUrl || DEFAULT_INSTANCE);
})();

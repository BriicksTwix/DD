(() => {
  // Toggle ONLY the Browse/Editor buttons in the top bar
  const SHOW_RIGHT_TABS = false; // set false for public read-only mode
  const READ_ONLY_MODE = !SHOW_RIGHT_TABS;

  const STORAGE_KEY = "item_helper_data_v10";
  const MAX_COMBOS_SAFE = 16384;

  // If game shows size with 2 decimals (rounded), assume true ∈ [s-0.005, s+0.005]
  const SIZE_HALF_STEP = 0.005;

  // ---- Known multipliers (stabilize) ----
  const KNOWN_MULTS = {
    celebratory: 3,
    shadowed: 4,
    rainbow: 3,
    golden: 2,
    electric: 1.9,
    heated: 1.6,
    iced: 1.5,
    imaginary: 1,
    rotten: 0.5
  };

  // MULT bucket: multiply together
  const MULT_BUCKET = new Set(["celebratory", "rainbow", "imaginary"]);

  // ---- Money formatter ----
  const moneyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  });
  const money = (n) => moneyFmt.format(Number.isFinite(n) ? n : 0);

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // Hide only the Browse/Editor buttons (topbar stays visible)
  const topTabs = document.querySelector(".topbar .tabs");
  if (topTabs && !SHOW_RIGHT_TABS) topTabs.style.display = "none";

  function safeNumber(s) {
    const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function slugify(s) {
    return (
      String(s)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || `id_${Math.random().toString(16).slice(2)}`
    );
  }

  function clampPositive(v, fallback = 1) {
    if (!Number.isFinite(v) || v <= 0) return fallback;
    return v;
  }

  function normalizeKnownAffixes(state) {
    if (!state || !Array.isArray(state.affixes)) return;
    for (const a of state.affixes) {
      if (!a || typeof a.id !== "string") continue;
      const id = a.id.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(KNOWN_MULTS, id)) a.mult = KNOWN_MULTS[id];
    }
  }

  function normName(s) {
    return String(s || "").trim().toLowerCase();
  }

  function getLowestPricedItemId(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
      items
        .slice()
        .sort((a, b) => {
          const av = a?.baseValue ?? 0;
          const bv = b?.baseValue ?? 0;
          if (av !== bv) return av - bv;
          return String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, { sensitivity: "base" });
        })[0]?.id ?? null
    );
  }

  // =========================================================
  // Storage
  // =========================================================
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const d = deepCopy(window.DEFAULT_DATA);
        normalizeKnownAffixes(d);
        return d;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.affixes)) {
        const d = deepCopy(window.DEFAULT_DATA);
        normalizeKnownAffixes(d);
        return d;
      }
      normalizeKnownAffixes(parsed);
      return parsed;
    } catch {
      const d = deepCopy(window.DEFAULT_DATA);
      normalizeKnownAffixes(d);
      return d;
    }
  }

  function saveData(next) {
    normalizeKnownAffixes(next);
    data = next;

    // In read-only mode: DO NOT persist (but keep UI working in-memory)
    if (!READ_ONLY_MODE) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    if (!data.items.some((i) => i.id === selectedItemId)) {
      selectedItemId = getLowestPricedItemId(data.items);
      selectedAffixIds = new Set();
    }

    const valid = new Set(data.affixes.map((a) => a.id));
    for (const id of Array.from(selectedAffixIds)) {
      if (!valid.has(id)) selectedAffixIds.delete(id);
    }

    renderAll();
  }

  // =========================================================
  // DOM refs
  // =========================================================
  const elItemSearch = document.getElementById("itemSearch");
  const elItemList = document.getElementById("itemList");

  const elSelectedItemName = document.getElementById("selectedItemName");
  const elSelectedItemValue = document.getElementById("selectedItemValue");

  const elAffixPriceTable = document.getElementById("affixPriceTable");
  const elAffixChecklist = document.getElementById("affixChecklist");
  const elComboMultiplier = document.getElementById("comboMultiplier");
  const elComboValue = document.getElementById("comboValue");
  const elComboTable = document.getElementById("comboTable");

  const tabs = Array.from(document.querySelectorAll(".tab"));
  const viewBrowse = document.getElementById("viewBrowse");
  const viewEdit = document.getElementById("viewEdit");

  const elNewItemName = document.getElementById("newItemName");
  const elNewItemValue = document.getElementById("newItemValue");
  const elEditorItems = document.getElementById("editorItems");

  const elNewAffixName = document.getElementById("newAffixName");
  const elNewAffixMult = document.getElementById("newAffixMult");
  const elEditorAffixes = document.getElementById("editorAffixes");

  const elBtnResetDefaults = document.getElementById("btnResetDefaults");
  const elBtnExport = document.getElementById("btnExport");
  const elBtnImport = document.getElementById("btnImport");
  const elFileImport = document.getElementById("fileImport");

  const btnAddItem = document.getElementById("btnAddItem");
  const btnAddAffix = document.getElementById("btnAddAffix");

  // =========================================================
  // Left tabs (Food/Dish)
  // =========================================================
  const leftTabs = Array.from(document.querySelectorAll(".leftTab"));
  const leftFood = document.getElementById("leftFood");
  const leftDish = document.getElementById("leftDish");

  function setLeftPage(name) {
    const page = String(name || "").toLowerCase();
    for (const b of leftTabs) b.classList.toggle("is-active", (b.dataset.leftpage || "").toLowerCase() === page);
    if (leftFood) leftFood.classList.toggle("is-active", page === "food");
    if (leftDish) leftDish.classList.toggle("is-active", page === "dish");
  }

  leftTabs.forEach((btn) => {
    btn.addEventListener("click", () => setLeftPage(btn.dataset.leftpage));
  });

  // Start on whatever is active in HTML (defaults to Food)
  const initialLeft = leftTabs.find((b) => b.classList.contains("is-active"))?.dataset.leftpage || "food";
  setLeftPage(initialLeft);

  // =========================================================
  // State
  // =========================================================
  let data = loadData();
  let selectedItemId = null;
  let selectedAffixIds = new Set();
  let searchText = "";
  let sizeMult = 1;
  let rangeMode = true;

  // =========================================================
  // Tabs (Browse/Editor)
  // =========================================================
  function setTab(name) {
    // If buttons are hidden, force browse so users can't get stuck on edit
    if (!SHOW_RIGHT_TABS) name = "browse";

    for (const t of tabs) t.classList.toggle("is-active", t.dataset.tab === name);
    viewBrowse.classList.toggle("is-active", name === "browse");
    viewEdit.classList.toggle("is-active", name === "edit");
  }
  tabs.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  // =========================================================
  // Sorting
  // =========================================================
  function sortItemsByValueThenName(a, b) {
    const dv = (a.baseValue ?? 0) - (b.baseValue ?? 0);
    if (dv !== 0) return dv;
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  }

  function sortByName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  }

  function sortAffixByMultDescThenName(a, b) {
    const dm = (b.mult ?? 0) - (a.mult ?? 0);
    if (dm !== 0) return dm;
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  }

  // =========================================================
  // Affix display helpers (keeps your colored affixes)
  // =========================================================
  const RAINBOW = ["#ff3b3b", "#ffa53b", "#fff13b", "#3bff6d", "#3bd7ff", "#4d3bff", "#d83bff"];

  function renderRainbowLetters(text) {
    let colorIndex = 0;
    const chars = Array.from(String(text));
    return chars
      .map((ch) => {
        if (ch === " ") return " ";
        const c = RAINBOW[colorIndex % RAINBOW.length];
        colorIndex++;
        return `<span class="rainbowLetter" style="color:${c}">${escapeHtml(ch)}</span>`;
      })
      .join("");
  }

  function affixNameSpan(a) {
    const id = String(a.id).toLowerCase();
    if (id === "rainbow") {
      return `<span class="affixText" data-affix="rainbow">${renderRainbowLetters(a.name)}</span>`;
    }
    return `<span class="affixText" data-affix="${escapeHtml(a.id)}">${escapeHtml(a.name)}</span>`;
  }

  // Imaginary excluded from All Combos
  function getComboAffixesForAllCombos() {
    return data.affixes.slice().filter((a) => String(a.id).toLowerCase() !== "imaginary").sort(sortByName);
  }

  // =========================================================
  // Core math
  // =========================================================
  function effectiveMultiplier(affixes) {
    let multProd = 1;
    let addSum = 0;

    for (const a of affixes) {
      const id = String(a.id).toLowerCase();
      const m = Number.isFinite(a.mult) ? a.mult : 1;

      if (MULT_BUCKET.has(id)) multProd *= m;
      else addSum += m - 1;
    }

    return multProd * (1 + addSum);
  }

  function priceExact(baseValue, size, affixes) {
    const b = Number.isFinite(baseValue) ? baseValue : 0;
    const s = clampPositive(size, 1);
    const eff = effectiveMultiplier(affixes);
    return Math.floor(b * s * eff);
  }

  function priceRange(baseValue, sizeShown, affixes) {
    const s = clampPositive(sizeShown, 1);
    const sLow = Math.max(0, s - SIZE_HALF_STEP);
    const sHigh = s + SIZE_HALF_STEP;

    return { min: priceExact(baseValue, sLow, affixes), max: priceExact(baseValue, sHigh, affixes) };
  }

  // =========================================================
  // Size + Range controls
  // =========================================================
  function ensureTopControls() {
    let sizeInput = document.getElementById("sizeMult");

    if (!sizeInput && elSelectedItemValue) {
      const wrap = document.createElement("span");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "10px";
      wrap.style.marginLeft = "12px";
      wrap.style.flexWrap = "wrap";

      const sizeLabel = document.createElement("span");
      sizeLabel.className = "muted";
      sizeLabel.style.fontSize = "12px";
      sizeLabel.textContent = "Size";

      sizeInput = document.createElement("input");
      sizeInput.id = "sizeMult";
      sizeInput.className = "input";
      sizeInput.setAttribute("inputmode", "decimal");
      sizeInput.value = "1";
      sizeInput.style.width = "120px";
      sizeInput.style.padding = "8px 10px";

      const rangeWrap = document.createElement("label");
      rangeWrap.className = "check";
      rangeWrap.style.display = "inline-flex";
      rangeWrap.style.alignItems = "center";
      rangeWrap.style.gap = "8px";
      rangeWrap.style.marginLeft = "6px";

      const rangeCb = document.createElement("input");
      rangeCb.type = "checkbox";
      rangeCb.id = "rangeMode";
      rangeCb.checked = true;

      const rangeText = document.createElement("span");
      rangeText.className = "muted";
      rangeText.style.fontSize = "12px";
      rangeText.textContent = "Range Mode";

      rangeWrap.appendChild(rangeCb);
      rangeWrap.appendChild(rangeText);

      wrap.appendChild(sizeLabel);
      wrap.appendChild(sizeInput);
      wrap.appendChild(rangeWrap);

      elSelectedItemValue.insertAdjacentElement("afterend", wrap);
    }

    const storedSize = localStorage.getItem("size_mult_v1");
    if (storedSize) {
      const n = safeNumber(storedSize);
      sizeMult = clampPositive(n, 1);
      if (sizeInput) sizeInput.value = String(sizeMult);
    }

    const storedRange = localStorage.getItem("range_mode_v1");
    if (storedRange != null) {
      rangeMode = storedRange === "1";
      const cb = document.getElementById("rangeMode");
      if (cb) cb.checked = rangeMode;
    }

    if (sizeInput) {
      sizeInput.addEventListener("input", () => {
        const n = safeNumber(sizeInput.value);
        sizeMult = Number.isFinite(n) && n > 0 ? n : 1;
        localStorage.setItem("size_mult_v1", String(sizeMult));
        renderAll();
      });

      sizeInput.addEventListener("blur", () => {
        sizeMult = clampPositive(safeNumber(sizeInput.value), 1);
        sizeInput.value = String(sizeMult);
        localStorage.setItem("size_mult_v1", String(sizeMult));
        renderAll();
      });
    }

    const rangeCb = document.getElementById("rangeMode");
    if (rangeCb) {
      rangeCb.addEventListener("change", () => {
        rangeMode = !!rangeCb.checked;
        localStorage.setItem("range_mode_v1", rangeMode ? "1" : "0");
        renderAll();
      });
    }
  }

  // =========================================================
  // Render pieces
  // =========================================================
  function renderItems() {
    const items = data.items
      .slice()
      .sort(sortItemsByValueThenName)
      .filter((it) => !searchText || it.name.toLowerCase().includes(searchText.toLowerCase()));

    if (!selectedItemId && items.length) selectedItemId = items[0].id;

    elItemList.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "itemRow" + (item.id === selectedItemId ? " is-active" : "");
      row.innerHTML = `
        <div style="font-weight:900">${escapeHtml(item.name)}</div>
        <div class="muted" style="font-size:12px; margin-left:auto; text-align:right; white-space:nowrap;">
          ${money(Math.floor(item.baseValue))}
        </div>
      `;
      row.addEventListener("click", () => {
        selectedItemId = item.id;
        selectedAffixIds = new Set();
        renderAll();
      });
      elItemList.appendChild(row);
    }
  }

  function getMinMaxAllCombosForHeader(item) {
    const affixes = getComboAffixesForAllCombos();
    const n = affixes.length;
    const total = 1 << n;

    if (total <= 0 || total > MAX_COMBOS_SAFE) {
      const v = priceExact(item.baseValue, sizeMult, []);
      return rangeMode ? priceRange(item.baseValue, sizeMult, []) : { min: v, max: v };
    }

    let minV = Infinity;
    let maxV = -Infinity;

    const s = clampPositive(sizeMult, 1);
    const sLow = rangeMode ? Math.max(0, s - SIZE_HALF_STEP) : s;
    const sHigh = rangeMode ? s + SIZE_HALF_STEP : s;

    const b = Number(item.baseValue) || 0;

    for (let mask = 0; mask < total; mask++) {
      const chosen = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(affixes[i]);

      const eff = effectiveMultiplier(chosen);
      const vMin = Math.floor(b * sLow * eff);
      const vMax = Math.floor(b * sHigh * eff);

      if (vMin < minV) minV = vMin;
      if (vMax > maxV) maxV = vMax;
    }

    if (!Number.isFinite(minV)) minV = priceExact(item.baseValue, sizeMult, []);
    if (!Number.isFinite(maxV)) maxV = priceExact(item.baseValue, sizeMult, []);

    return { min: minV, max: maxV };
  }

  function renderSelectedItemHeader() {
    const item = data.items.find((i) => i.id === selectedItemId);
    if (!item) {
      elSelectedItemName.textContent = "Select an item";
      elSelectedItemValue.textContent = "";
      return null;
    }

    const baseExact = priceExact(item.baseValue, sizeMult, []);
    const { min, max } = getMinMaxAllCombosForHeader(item);

    elSelectedItemName.textContent = item.name;
    elSelectedItemValue.textContent = `${money(baseExact)} | ${money(min)} - ${money(max)}`;

    return item;
  }

  function renderAffixPriceTable(item) {
    const affixes = data.affixes.slice().sort(sortAffixByMultDescThenName);

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Affix</th>
          <th>Mult</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    for (const a of affixes) {
      const exact = priceExact(item.baseValue, sizeMult, [a]);
      const r = priceRange(item.baseValue, sizeMult, [a]);

      const valText = rangeMode
        ? `${money(exact)} <span class="muted">(${money(r.min)}-${money(r.max)})</span>`
        : money(exact);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${affixNameSpan(a)}</td>
        <td class="mono">x${a.mult}</td>
        <td class="mono">${valText}</td>
      `;
      tbody.appendChild(tr);
    }

    elAffixPriceTable.innerHTML = "";
    elAffixPriceTable.appendChild(table);
  }

  function renderAffixChecklist(item) {
    const affixes = data.affixes.slice().sort(sortByName);

    elAffixChecklist.innerHTML = "";
    for (const a of affixes) {
      const checked = selectedAffixIds.has(a.id);

      const wrap = document.createElement("label");
      wrap.className = "check";
      wrap.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span>${affixNameSpan(a)}</span>
        <span class="mono" style="margin-left:auto; opacity:.9;">x${a.mult}</span>
      `;

      const checkbox = wrap.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedAffixIds.add(a.id);
        else selectedAffixIds.delete(a.id);
        renderComboSummary(item);
      });

      elAffixChecklist.appendChild(wrap);
    }

    renderComboSummary(item);
  }

  function renderComboSummary(item) {
    const chosen = data.affixes.filter((a) => selectedAffixIds.has(a.id));

    if (chosen.length === 0) {
      elComboMultiplier.textContent = "—";
      elComboValue.textContent = "—";
      return;
    }

    const eff = effectiveMultiplier(chosen);
    const exact = priceExact(item.baseValue, sizeMult, chosen);
    const r = priceRange(item.baseValue, sizeMult, chosen);

    elComboMultiplier.textContent = `x${Math.round(eff * 1000) / 1000}`;
    elComboValue.textContent = rangeMode
      ? `${money(exact)} (${money(r.min)}-${money(r.max)})`
      : money(exact);
  }

  function renderAllCombos(item) {
    const affixes = getComboAffixesForAllCombos();
    const n = affixes.length;
    const total = 1 << n;

    if (total > MAX_COMBOS_SAFE) {
      elComboTable.innerHTML = `<div class="muted">Too many affixes to list all combos.</div>`;
      return;
    }

    const combos = [];
    for (let mask = 0; mask < total; mask++) {
      const parts = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) parts.push(affixes[i]);

      const eff = effectiveMultiplier(parts);
      const exact = priceExact(item.baseValue, sizeMult, parts);
      const r = priceRange(item.baseValue, sizeMult, parts);

      combos.push({ eff, exact, min: r.min, max: r.max, parts });
    }

    combos.sort((a, b) => {
      const dm = (b.eff ?? 0) - (a.eff ?? 0);
      if (dm !== 0) return dm;
      return (b.exact ?? 0) - (a.exact ?? 0);
    });

    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Affixes</th>
          <th>Mult</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    for (const c of combos) {
      const namesHtml = c.parts.length
        ? c.parts.map((a) => affixNameSpan(a)).join(", ")
        : `<span class="muted">None</span>`;

      const valText = rangeMode
        ? `${money(c.exact)} <span class="muted">(${money(c.min)}-${money(c.max)})</span>`
        : money(c.exact);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${namesHtml}</td>
        <td class="mono">x${Math.round(c.eff * 1000) / 1000}</td>
        <td class="mono">${valText}</td>
      `;
      tbody.appendChild(tr);
    }

    elComboTable.innerHTML = "";
    elComboTable.appendChild(table);
  }

  // =========================================================
  // Editor
  // =========================================================
  function renderEditor() {
    // Keep editor visible, but prevent saved changes in read-only mode
    const lock = READ_ONLY_MODE;

    let banner = document.getElementById("readOnlyBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "readOnlyBanner";
      banner.className = "leftComingSoon";
      banner.style.padding = "10px 12px";
      banner.style.border = "1px solid var(--border)";
      banner.style.marginBottom = "12px";
      banner.style.background = "#111";
      banner.style.color = "var(--muted)";
      if (viewEdit) viewEdit.prepend(banner);
    }
    banner.textContent = lock ? "Read-only mode: editing is disabled for this build." : "";
    banner.style.display = lock ? "block" : "none";

    // Disable top-level editor buttons (editor still renders)
    [btnAddItem, btnAddAffix, elBtnResetDefaults, elBtnExport, elBtnImport].forEach((b) => {
      if (!b) return;
      b.disabled = lock;
      b.style.opacity = lock ? "0.5" : "1";
      b.style.cursor = lock ? "not-allowed" : "pointer";
    });

    // Render items list
    const items = data.items.slice().sort(sortItemsByValueThenName);
    elEditorItems.innerHTML = "";

    for (const it of items) {
      const row = document.createElement("div");
      row.className = "editorRow";
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(it.name)}</div>
          <div class="meta">${money(Math.floor(it.baseValue))} · id=${escapeHtml(it.id)}</div>
        </div>
        <button class="btn danger">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
        const next = deepCopy(data);
        next.items = next.items.filter((x) => x.id !== it.id);
        saveData(next);
      });
      elEditorItems.appendChild(row);
    }

    // Render affixes list
    const affixes = data.affixes.slice().sort(sortAffixByMultDescThenName);
    elEditorAffixes.innerHTML = "";

    for (const a of affixes) {
      const row = document.createElement("div");
      row.className = "editorRow";
      row.innerHTML = `
        <div>
          <div class="name">${affixNameSpan(a)}</div>
          <div class="meta">x${escapeHtml(a.mult)} · id=${escapeHtml(a.id)}</div>
        </div>
        <button class="btn danger">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
        const next = deepCopy(data);
        next.affixes = next.affixes.filter((x) => x.id !== a.id);
        saveData(next);
      });
      elEditorAffixes.appendChild(row);
    }
  }

  // =========================================================
  // Events
  // =========================================================
  elItemSearch.addEventListener("input", () => {
    searchText = elItemSearch.value || "";
    renderItems();
  });

  // ---- UPSERT: Add Item ----
  document.getElementById("btnAddItem").addEventListener("click", () => {
    if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
    const nameRaw = (elNewItemName.value || "").trim();
    const nameKey = normName(nameRaw);
    const val = safeNumber(elNewItemValue.value);

    if (!nameRaw) return alert("Item name required.");
    if (!Number.isFinite(val) || val < 0) return alert("Base value must be a number >= 0.");

    const next = deepCopy(data);

    // Find existing by name (case-insensitive)
    const existing = next.items.find((i) => normName(i.name) === nameKey);

    if (existing) {
      // Update existing
      existing.name = nameRaw;
      existing.baseValue = Math.round(val * 100) / 100;
      selectedItemId = existing.id;
    } else {
      // Create new
      const taken = new Set(next.items.map((i) => i.id));
      let id = slugify(nameRaw);
      let n = 2;
      while (taken.has(id)) id = `${slugify(nameRaw)}_${n++}`;

      next.items.push({ id, name: nameRaw, baseValue: Math.round(val * 100) / 100 });
      selectedItemId = id;
    }

    elNewItemName.value = "";
    elNewItemValue.value = "";
    selectedAffixIds = new Set();

    saveData(next);
  });

  // ---- UPSERT: Add Affix ----
  document.getElementById("btnAddAffix").addEventListener("click", () => {
    if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
    const nameRaw = (elNewAffixName.value || "").trim();
    const mult = safeNumber(elNewAffixMult.value);

    if (!nameRaw) return alert("Affix name required.");
    if (!Number.isFinite(mult) || mult <= 0) return alert("Multiplier must be a number > 0.");

    const next = deepCopy(data);

    const nameKey = normName(nameRaw);
    const existing = next.affixes.find((a) => normName(a.name) === nameKey);

    if (existing) {
      existing.name = nameRaw;
      existing.mult = mult;
    } else {
      const taken = new Set(next.affixes.map((a) => a.id));
      let id = slugify(nameRaw);
      let n = 2;
      while (taken.has(id)) id = `${slugify(nameRaw)}_${n++}`;

      next.affixes.push({ id, name: nameRaw, mult });
    }

    elNewAffixName.value = "";
    elNewAffixMult.value = "";

    saveData(next);
  });

  // ---- Reset Defaults ----
  document.getElementById("btnResetDefaults").addEventListener("click", () => {
    if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
    if (!confirm("Reset everything to defaults?")) return;
    const d = deepCopy(window.DEFAULT_DATA);
    normalizeKnownAffixes(d);
    saveData(d);
  });

  // ---- Export ----
  document.getElementById("btnExport").addEventListener("click", () => {
    if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item_value_helper.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---- Import ----
  document.getElementById("btnImport").addEventListener("click", () => {
    if (READ_ONLY_MODE) return alert("Read-only mode: editing is disabled.");
    elFileImport.click();
  });

  elFileImport.addEventListener("change", async () => {
    if (READ_ONLY_MODE) {
      elFileImport.value = "";
      return alert("Read-only mode: editing is disabled.");
    }

    const file = elFileImport.files && elFileImport.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.affixes)) {
        elFileImport.value = "";
        return alert("Invalid JSON format. Expected { items:[], affixes:[] }");
      }

      normalizeKnownAffixes(parsed);
      saveData(parsed);
    } catch (e) {
      console.error(e);
      alert("Import failed.");
    } finally {
      elFileImport.value = "";
    }
  });

  // =========================================================
  // Main render
  // =========================================================
  function renderAll() {
    ensureTopControls();
    renderItems();

    const item = renderSelectedItemHeader();
    if (!item) return;

    renderAffixPriceTable(item);
    renderAffixChecklist(item);
    renderAllCombos(item);

    // Editor always renders its content; view toggles control visibility
    renderEditor();
  }

  // =========================================================
  // Init
  // =========================================================
  if (!selectedItemId) selectedItemId = getLowestPricedItemId(data.items);

  // Start in browse if tabs are hidden; otherwise keep normal default (browse active in HTML)
  setTab("browse");

  renderAll();
})();

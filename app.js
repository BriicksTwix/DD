(() => {
  const SHOW_RIGHT_TABS = false;
  const READ_ONLY_MODE  = !SHOW_RIGHT_TABS;
  const STORAGE_KEY     = "item_helper_data_v13";
  const MAX_COMBOS_SAFE = 16384;
  const SIZE_HALF_STEP  = 0.005;
  const COMBOS_PER_PAGE = 25;

  const KNOWN_MULTS = { celebratory:3, shadowed:4, rainbow:3, golden:2, electric:1.9, heated:1.6, iced:1.5, imaginary:1, rotten:0.5 };
  const MULT_BUCKET = new Set(["celebratory","rainbow","imaginary","loved"]);

  const moneyFmt = new Intl.NumberFormat("en-US",{ style:"currency", currency:"USD", maximumFractionDigits:0, minimumFractionDigits:0 });
  const money = n => moneyFmt.format(Number.isFinite(n) ? n : 0);
  const esc   = s => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function safeNumber(s) { const n=Number(String(s).replace(/[^0-9.\-]/g,"")); return Number.isFinite(n)?n:NaN; }
  function deepCopy(o)   { return JSON.parse(JSON.stringify(o)); }
  function slugify(s)    { return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,60)||`id_${Math.random().toString(16).slice(2)}`; }
  function clampSize(v,fb=1) { return !Number.isFinite(v)?fb:Math.min(4,Math.max(0,v)); }
  function normName(s)   { return String(s||"").trim().toLowerCase(); }

  // ── Image box helper ──
  function setImageBox(boxEl, url, fallbackEmoji) {
    const oldImg = boxEl.querySelector("img");
    if (oldImg) oldImg.remove();
    const icon = boxEl.querySelector(".imgPlaceholderIcon");
    if (url && url.trim()) {
      if (icon) icon.style.display = "none";
      const img = document.createElement("img");
      img.src = url.trim();
      img.alt = "";
      img.onerror = () => { img.remove(); if (icon) { icon.style.display=""; icon.textContent=fallbackEmoji; } };
      boxEl.appendChild(img);
    } else {
      if (icon) { icon.style.display=""; icon.textContent=fallbackEmoji; }
    }
  }

  // ── URL preview helper (editor inline preview) ──
  function setUrlPreview(previewEl, url, fallbackEmoji) {
    const oldImg = previewEl.querySelector("img");
    if (oldImg) oldImg.remove();
    const icon = previewEl.querySelector(".imgPlaceholderIcon");
    if (url && url.trim()) {
      const img = document.createElement("img");
      img.src = url.trim();
      img.alt = "";
      img.onerror = () => { img.remove(); if(icon){icon.style.display="";icon.textContent=fallbackEmoji;} };
      if (icon) icon.style.display = "none";
      previewEl.appendChild(img);
    } else {
      if (icon) { icon.style.display=""; icon.textContent=fallbackEmoji; }
    }
  }

  // ── Default data ──
  const DEFAULT_DISHES = [
    { id:"mystery_stew",   name:"Mystery Stew",    baseValue:250,  effect:"Restores a moderate amount of health when consumed.", image:"", ingredients:[] },
    { id:"cursed_broth",   name:"Cursed Broth",    baseValue:500,  effect:"Provides a temporary speed boost but causes vision distortion.", image:"", ingredients:[] },
    { id:"bone_soup",      name:"Bone Soup",       baseValue:180,  effect:"None", image:"", ingredients:[] },
    { id:"charred_roast",  name:"Charred Roast",   baseValue:320,  effect:"Grants brief fire resistance.", image:"", ingredients:[] },
    { id:"shadow_pudding", name:"Shadow Pudding",  baseValue:750,  effect:"Temporarily reduces your visibility to entities.", image:"", ingredients:[] },
  ];
  const DEFAULT_TOOLS = [
    { id:"flashlight", name:"Flashlight",  baseValue:150, effect:"Illuminates dark areas. Attracts certain entities when active.", image:"" },
    { id:"medkit",     name:"Medkit",      baseValue:300, effect:"Restores a significant amount of health.", image:"" },
    { id:"radio",      name:"Radio",       baseValue:200, effect:"Distracts entities. Acts as a continuous noise emitter.", image:"" },
    { id:"lockpick",   name:"Lockpick",    baseValue:120, effect:"Opens locked doors and containers. Single use.", image:"" },
    { id:"smoke_bomb", name:"Smoke Bomb",  baseValue:400, effect:"Creates a thick smokescreen, temporarily blinding entities.", image:"" },
    { id:"bear_trap",  name:"Bear Trap",   baseValue:250, effect:"Immobilises entities that step on it for a short duration.", image:"" },
    { id:"glow_stick", name:"Glow Stick",  baseValue:80,  effect:"Provides dim lighting. Does not attract entities.", image:"" },
  ];
  const DEFAULT_ENTITIES = [
    { id:"the_watcher",  name:"The Watcher",       baseValue:0, effect:"Stalks players from a distance. Does not attack unless approached. Avoid eye contact.", image:"", drops:[] },
    { id:"crawling_one", name:"The Crawling One",   baseValue:0, effect:"Moves along ceilings and walls. Triggered by sound above a certain threshold.", image:"", drops:[] },
    { id:"pale_hand",    name:"Pale Hand",          baseValue:0, effect:"Appears behind doors, grabbing through gaps. Stay away from closed doors in dark rooms.", image:"", drops:[] },
    { id:"the_hollow",   name:"The Hollow",         baseValue:0, effect:"Invisible until within 2 metres. Emits a faint hum — listen carefully.", image:"", drops:[] },
    { id:"bloom_keeper", name:"Bloom Keeper",       baseValue:0, effect:"Protects Bloom Hearts. Will not leave its territory unless provoked.", image:"", drops:[] },
  ];

  function normalizeKnownAffixes(state) {
    if (!state||!Array.isArray(state.affixes)) return;
    for (const a of state.affixes) {
      if (!a||typeof a.id!=="string") continue;
      const id=a.id.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(KNOWN_MULTS,id)) a.mult=KNOWN_MULTS[id];
      if (!a.status) a.status="standard";
    }
  }

  function ensureFields(arr, extra={}) {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!("image" in item)) item.image="";
      for (const [k,v] of Object.entries(extra)) if (!(k in item)) item[k]=deepCopy(v);
    }
  }

  function getDefaultData() {
    const d = deepCopy(window.DEFAULT_DATA);
    ensureFields(d.items);
    d.dishes   = deepCopy(DEFAULT_DISHES);
    d.tools    = deepCopy(DEFAULT_TOOLS);
    d.entities = deepCopy(DEFAULT_ENTITIES);
    normalizeKnownAffixes(d);
    return d;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultData();
      const p = JSON.parse(raw);
      if (!p.dishes)   p.dishes   = deepCopy(DEFAULT_DISHES);
      if (!p.tools)    p.tools    = deepCopy(DEFAULT_TOOLS);
      if (!p.entities) p.entities = deepCopy(DEFAULT_ENTITIES);
      ensureFields(p.items);
      ensureFields(p.dishes, { ingredients:[] });
      ensureFields(p.tools);
      ensureFields(p.entities, { drops:[] });
      normalizeKnownAffixes(p);
      return p;
    } catch { return getDefaultData(); }
  }

  function saveData(next) {
    normalizeKnownAffixes(next);
    data = next;
    if (!READ_ONLY_MODE) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
  }

  // ── DOM refs ──
  const elItemSearch        = document.getElementById("itemSearch");
  const elItemList          = document.getElementById("itemList");
  const elSelectedItemName  = document.getElementById("selectedItemName");
  const elSelectedItemValue = document.getElementById("selectedItemValue");
  const elAffixPriceTable   = document.getElementById("affixPriceTable");
  const elAffixChecklist    = document.getElementById("affixChecklist");
  const elComboMultiplier   = document.getElementById("comboMultiplier");
  const elComboValue        = document.getElementById("comboValue");
  const elComboTable        = document.getElementById("comboTable");
  const tabs       = Array.from(document.querySelectorAll(".tab"));
  const viewBrowse = document.getElementById("viewBrowse");
  const viewEdit   = document.getElementById("viewEdit");

  const elNewItemName  = document.getElementById("newItemName");
  const elNewItemValue = document.getElementById("newItemValue");
  const elFoodImgUrl   = document.getElementById("foodImgUrl");
  const elFoodImgPrev  = document.getElementById("foodImgPreview");
  const elEditorItems  = document.getElementById("editorItems");

  const elNewAffixName    = document.getElementById("newAffixName");
  const elNewAffixMult    = document.getElementById("newAffixMult");
  const elNewAffixColor   = document.getElementById("newAffixColor");
  const elNewAffixStatus  = document.getElementById("newAffixStatus");
  const elEditorAffixList = document.getElementById("editorAffixList");

  const elDishSearch          = document.getElementById("dishSearch");
  const elDishList            = document.getElementById("dishList");
  const elNewDishName         = document.getElementById("newDishName");
  const elNewDishValue        = document.getElementById("newDishValue");
  const elNewDishEffect       = document.getElementById("newDishEffect");
  const elDishImgUrl          = document.getElementById("dishImgUrl");
  const elDishImgPrev         = document.getElementById("dishImgPreview");
  const elDishIngredientPicker= document.getElementById("dishIngredientPicker");
  const elEditorDishList      = document.getElementById("editorDishList");

  const elToolsSearch    = document.getElementById("toolsSearch");
  const elToolsList      = document.getElementById("toolsList");
  const elNewToolName    = document.getElementById("newToolName");
  const elNewToolValue   = document.getElementById("newToolValue");
  const elNewToolEffect  = document.getElementById("newToolEffect");
  const elToolsImgUrl    = document.getElementById("toolsImgUrl");
  const elToolsImgPrev   = document.getElementById("toolsImgPreview");
  const elEditorToolsList= document.getElementById("editorToolsList");

  const elEntitySearch     = document.getElementById("entitySearch");
  const elEntityList       = document.getElementById("entityList");
  const elNewEntityName    = document.getElementById("newEntityName");
  const elNewEntityValue   = document.getElementById("newEntityValue");
  const elNewEntityEffect  = document.getElementById("newEntityEffect");
  const elEntityImgUrl     = document.getElementById("entityImgUrl");
  const elEntityImgPrev    = document.getElementById("entityImgPreview");
  const elEntityDropsPicker= document.getElementById("entityDropsPicker");
  const elEditorEntityList = document.getElementById("editorEntityList");

  const leftTabs = Array.from(document.querySelectorAll(".leftTab"));
  const leftPages = { food:document.getElementById("leftFood"), dish:document.getElementById("leftDish"), tools:document.getElementById("leftTools"), entity:document.getElementById("leftEntity") };
  const browseSections = { food:document.getElementById("browseFood"), dish:document.getElementById("browseDish"), tools:document.getElementById("browseTools"), entity:document.getElementById("browseEntity") };
  const editorTabs = Array.from(document.querySelectorAll(".editorTab"));
  const editorSections = { food:document.getElementById("editorSectionFood"), affixes:document.getElementById("editorSectionAffixes"), dish:document.getElementById("editorSectionDish"), tools:document.getElementById("editorSectionTools"), entity:document.getElementById("editorSectionEntity") };

  // ── State ──
  let data = loadData();
  let currentLeftTab   = "food";
  let selectedIds      = { food:null, dish:null, tools:null, entity:null };
  let selectedAffixIds = new Set();
  let searchTexts      = { food:"", dish:"", tools:"", entity:"" };
  let sizeMult         = 1;
  let rangeMode        = true;
  let showLegacy       = false;
  let comboPage        = 0;
  let comboSearchText  = "";

  // selected ingredient IDs in the dish editor
  let editorDishIngredients   = new Set();
  // selected drop IDs in the entity editor
  let editorEntityDrops       = new Set();

  // ── Live URL preview wiring ──
  function wireUrlPreview(inputEl, previewEl, emoji) {
    inputEl.addEventListener("input", () => setUrlPreview(previewEl, inputEl.value, emoji));
  }
  wireUrlPreview(elFoodImgUrl,   elFoodImgPrev,   "🍖");
  wireUrlPreview(elDishImgUrl,   elDishImgPrev,   "🍽");
  wireUrlPreview(elToolsImgUrl,  elToolsImgPrev,  "🔧");
  wireUrlPreview(elEntityImgUrl, elEntityImgPrev, "👁");

  // ── Tab switching ──
  function setTab(name) {
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab===name));
    viewBrowse.classList.toggle("is-active", name==="browse");
    viewEdit.classList.toggle("is-active",   name==="edit");
  }
  tabs.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  function setLeftPage(name) {
    currentLeftTab = name;
    leftTabs.forEach(b => b.classList.toggle("is-active", b.dataset.leftpage===name));
    Object.entries(leftPages).forEach(([k,el]) => el.classList.toggle("is-active", k===name));
    Object.entries(browseSections).forEach(([k,el]) => el.classList.toggle("is-active", k===name));
  }
  leftTabs.forEach(btn => btn.addEventListener("click", () => { setLeftPage(btn.dataset.leftpage); renderAll(); }));

  function setEditorTab(name) {
    editorTabs.forEach(t => t.classList.toggle("is-active", t.dataset.editortab===name));
    Object.entries(editorSections).forEach(([k,el]) => el.classList.toggle("is-active", k===name));
  }
  editorTabs.forEach(btn => btn.addEventListener("click", () => setEditorTab(btn.dataset.editortab)));

  // ── Mobile Nav ──
  const navToggle  = document.getElementById("navToggle");
  const navOverlay = document.getElementById("navOverlay");
  const openNav  = () => { document.documentElement.classList.add("nav-open");    navOverlay.classList.add("is-active");    navToggle.setAttribute("aria-expanded","true"); };
  const closeNav = () => { document.documentElement.classList.remove("nav-open"); navOverlay.classList.remove("is-active"); navToggle.setAttribute("aria-expanded","false"); };
  navToggle.addEventListener("click", () => document.documentElement.classList.contains("nav-open") ? closeNav() : openNav());
  navOverlay.addEventListener("click", closeNav);
  [elItemList,elDishList,elToolsList,elEntityList].forEach(el => el.addEventListener("click", () => { if(window.innerWidth<700) closeNav(); }));

  // ── Rainbow ──
  const RAINBOW = ["#ff3b3b","#ffa53b","#fff13b","#3bff6d","#3bd7ff","#4d3bff","#d83bff"];
  function renderRainbowLetters(text) {
    let idx=0;
    return Array.from(String(text)).map(ch => ch===" " ? " " : `<span style="color:${RAINBOW[idx++%RAINBOW.length]}">${esc(ch)}</span>`).join("");
  }
  function affixNameSpan(a) {
    const id=String(a.id).toLowerCase();
    if (id==="rainbow") return `<span class="affixText" data-affix="rainbow">${renderRainbowLetters(a.name)}</span>`;
    let style="";
    if (a.color) style=a.color.includes(",") ? `background-image:linear-gradient(90deg,${a.color});-webkit-background-clip:text;background-clip:text;color:transparent;` : `color:${a.color};`;
    return `<span class="affixText" data-affix="${esc(a.id)}" style="${style}">${esc(a.name)}</span>`;
  }
  function getStatusTag(s) {
    if (s==="event")    return `<span class="tag-event">EVENT</span>`;
    if (s==="inactive") return `<span class="tag-inactive">INACTIVE</span>`;
    return "";
  }

  // ── Pricing ──
  function effectiveMultiplier(affixes) {
    let multProd=1, addSum=0;
    for (const a of affixes) {
      const id=String(a.id).toLowerCase(), m=Number.isFinite(a.mult)?a.mult:1;
      if (MULT_BUCKET.has(id)) multProd*=m; else addSum+=m-1;
    }
    return multProd*(1+addSum);
  }
  function priceExact(bv,sz,affixes) { return Math.floor((bv||0)*clampSize(sz,1)*effectiveMultiplier(affixes)); }
  function priceRange(bv,sz,affixes) { const s=clampSize(sz,1); return { min:priceExact(bv,s-SIZE_HALF_STEP,affixes), max:priceExact(bv,s+SIZE_HALF_STEP,affixes) }; }

  // ── Size / Range controls ──
  function ensureTopControls() {
    if (document.getElementById("sizeMult")) return;
    const wrap=document.createElement("div");
    wrap.style="display:flex;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;";
    wrap.innerHTML=`
      <span class="muted" style="font-size:11px;font-family:'Oswald',sans-serif;letter-spacing:1px;text-transform:uppercase;">Size</span>
      <input id="sizeMult" class="input" value="${sizeMult}" inputmode="decimal" />
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:8px;">
        <input type="checkbox" id="rangeMode" ${rangeMode?"checked":""} style="accent-color:var(--accent2);" />
        <span class="muted" style="font-size:11px;font-family:'Oswald',sans-serif;letter-spacing:1px;text-transform:uppercase;">Range Mode</span>
      </label>`;
    elSelectedItemValue.after(wrap);
    document.getElementById("sizeMult").oninput = e => { sizeMult=safeNumber(e.target.value)||1; renderAll(); };
    document.getElementById("rangeMode").onchange = e => { rangeMode=e.target.checked; renderAll(); };
  }

  // ── Food browse rendering ──
  function renderAffixPriceTable(item) {
    const affixes=data.affixes.slice().sort((a,b)=>b.mult-a.mult);
    let html=`<table class="table"><thead><tr><th>Affix</th><th>Mult</th><th>Value</th></tr></thead><tbody>`;
    for (const a of affixes) {
      if (a.status==="inactive"&&!showLegacy) continue;
      const exact=priceExact(item.baseValue,sizeMult,[a]);
      const r=priceRange(item.baseValue,sizeMult,[a]);
      const val=rangeMode?`${money(exact)} <span class="muted">(${money(r.min)}–${money(r.max)})</span>`:money(exact);
      html+=`<tr><td>${affixNameSpan(a)} ${getStatusTag(a.status)}</td><td class="mono">x${a.mult}</td><td class="mono">${val}</td></tr>`;
    }
    elAffixPriceTable.innerHTML=html+`</tbody></table>`;
  }

  function renderAffixChecklist(item) {
    elAffixChecklist.innerHTML="";
    const tw=document.createElement("div");
    tw.style="grid-column:1/-1;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);";
    tw.innerHTML=`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="toggleLegacy" ${showLegacy?"checked":""} style="accent-color:var(--accent2);" /><span class="muted" style="font-size:11px;font-family:'Oswald',sans-serif;letter-spacing:1px;text-transform:uppercase;">Show Inactive / Legacy</span></label>`;
    tw.querySelector("input").onchange=e=>{showLegacy=e.target.checked;renderAll();};
    elAffixChecklist.appendChild(tw);
    for (const a of data.affixes.slice().sort((a,b)=>String(a.name).localeCompare(b.name))) {
      if (a.status==="inactive"&&!showLegacy) continue;
      const wrap=document.createElement("label");
      wrap.className="check";
      if (a.status==="inactive") wrap.style.opacity="0.55";
      wrap.innerHTML=`<input type="checkbox" ${selectedAffixIds.has(a.id)?"checked":""} style="accent-color:var(--accent2);" /><span>${affixNameSpan(a)} ${getStatusTag(a.status)}</span><span class="mono" style="margin-left:auto;opacity:.7;font-size:11px;">x${a.mult}</span>`;
      wrap.querySelector("input").onchange=e=>{if(e.target.checked)selectedAffixIds.add(a.id);else selectedAffixIds.delete(a.id);renderComboSummary(item);};
      elAffixChecklist.appendChild(wrap);
    }
    renderComboSummary(item);
  }

  function renderComboSummary(item) {
    const chosen=data.affixes.filter(a=>selectedAffixIds.has(a.id));
    if (!chosen.length){elComboMultiplier.textContent="—";elComboValue.textContent="—";return;}
    const eff=effectiveMultiplier(chosen), exact=priceExact(item.baseValue,sizeMult,chosen), r=priceRange(item.baseValue,sizeMult,chosen);
    elComboMultiplier.textContent=`x${Math.round(eff*1000)/1000}`;
    elComboValue.textContent=rangeMode?`${money(exact)} (${money(r.min)}–${money(r.max)})`:money(exact);
  }

  function renderAllCombos(item) {
    const affixes=data.affixes.filter(a=>a.status!=="inactive"||showLegacy);
    const n=affixes.length, total=1<<n;
    if (total>MAX_COMBOS_SAFE){elComboTable.innerHTML=`<div class="muted" style="padding:12px;">Too many affixes to enumerate safely.</div>`;return;}
    const combos=[];
    for (let mask=0;mask<total;mask++){const parts=[];for(let i=0;i<n;i++)if(mask&(1<<i))parts.push(affixes[i]);combos.push({eff:effectiveMultiplier(parts),parts});}
    combos.sort((a,b)=>b.eff-a.eff);

    // Filter by search text
    const q=comboSearchText.trim().toLowerCase();
    const filtered=q
      ? combos.filter(c=>c.parts.length===0
          ? "none".includes(q)
          : c.parts.some(a=>a.name.toLowerCase().includes(q)))
      : combos;

    const totalPages=Math.ceil(filtered.length/COMBOS_PER_PAGE);
    if(comboPage>=totalPages)comboPage=0;
    const pi=filtered.slice(comboPage*COMBOS_PER_PAGE,(comboPage+1)*COMBOS_PER_PAGE);
    let html=`<table class="table"><thead><tr><th>Affixes</th><th>Mult</th><th>Value</th></tr></thead><tbody>`;
    for (const c of pi){
      const exact=priceExact(item.baseValue,sizeMult,c.parts),r=priceRange(item.baseValue,sizeMult,c.parts);
      const names=c.parts.length?c.parts.map(a=>affixNameSpan(a)).join(", "):`<span class="muted">None</span>`;
      const val=rangeMode?`${money(exact)} <span class="muted">(${money(r.min)}–${money(r.max)})</span>`:money(exact);
      html+=`<tr><td>${names}</td><td class="mono">x${Math.round(c.eff*1000)/1000}</td><td class="mono">${val}</td></tr>`;
    }
    const safeTotal=totalPages||1;
    html+=`</tbody></table><div class="pagination">
      <button class="btn primary2" id="prevPage" ${comboPage===0?"disabled":""}>← Prev</button>
      <span class="muted" style="font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:1px;">Page ${comboPage+1} of ${safeTotal}${q?` (${filtered.length} results)`:""}</span>
      <button class="btn primary2" id="nextPage" ${comboPage>=safeTotal-1?"disabled":""}>Next →</button>
    </div>`;
    elComboTable.innerHTML=html;
    document.getElementById("prevPage").onclick=()=>{comboPage--;renderAllCombos(item);};
    document.getElementById("nextPage").onclick=()=>{comboPage++;renderAllCombos(item);};
  }

  // ── Find item in food OR tools ──
  function findDropItem(id) {
    return data.items.find(i=>i.id===id) || data.tools.find(t=>t.id===id) || null;
  }

  // ── Ingredient / Drops chip grid (handles food AND tools) ──
  function renderDropChipGrid(containerEl, dropIds) {
    containerEl.innerHTML="";
    const ids=Array.isArray(dropIds)?dropIds:[];
    if (!ids.length) { containerEl.innerHTML=`<span class="ingredientsNone">None</span>`; return; }
    for (const id of ids) {
      const item=findDropItem(id);
      if (!item) continue;
      const isTool=!!data.tools.find(t=>t.id===id);
      const fallback=isTool?"🔧":"🍖";
      const chip=document.createElement("div");
      chip.className="ingredientChip";
      chip.style.cursor="pointer";
      const imgHtml=item.image
        ? `<div class="ingredientChipImg"><img src="${esc(item.image)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'chipImgPlaceholder\\'>${fallback}</span>'" /></div>`
        : `<div class="ingredientChipImg"><span class="chipImgPlaceholder">${fallback}</span></div>`;
      chip.innerHTML=`${imgHtml}<div><div class="ingredientChipName">${esc(item.name)}</div><div class="ingredientChipValue">${item.baseValue>0?money(item.baseValue):"N/A"}</div></div>`;
      if (isTool) {
        chip.onclick=()=>{selectedIds.tools=item.id;setLeftPage("tools");renderAll();};
      } else {
        chip.onclick=()=>{selectedIds.food=item.id;selectedAffixIds=new Set();comboPage=0;setLeftPage("food");renderAll();};
      }
      containerEl.appendChild(chip);
    }
  }

  // ── Ingredient / Drops chip grid ──
  function renderFoodChipGrid(containerEl, foodIds) {
    containerEl.innerHTML="";
    const ids=Array.isArray(foodIds)?foodIds:[];
    if (!ids.length) {
      containerEl.innerHTML=`<span class="ingredientsNone">None</span>`;
      return;
    }
    for (const fid of ids) {
      const food=data.items.find(i=>i.id===fid);
      if (!food) continue;
      const chip=document.createElement("div");
      chip.className="ingredientChip";
      chip.style.cursor="pointer";
      const imgHtml=food.image
        ? `<div class="ingredientChipImg"><img src="${esc(food.image)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'chipImgPlaceholder\\'>🍖</span>'" /></div>`
        : `<div class="ingredientChipImg"><span class="chipImgPlaceholder">🍖</span></div>`;
      chip.innerHTML=`${imgHtml}<div><div class="ingredientChipName">${esc(food.name)}</div><div class="ingredientChipValue">${money(food.baseValue)}</div></div>`;
      chip.onclick=()=>{selectedIds.food=food.id;selectedAffixIds=new Set();comboPage=0;setLeftPage("food");renderAll();};
      containerEl.appendChild(chip);
    }
  }

  // ── Info card ──
  function showInfoCard(category, item, fallbackEmoji) {
    const placeholder=document.getElementById(`${category}Placeholder`);
    const card       =document.getElementById(`${category}InfoCard`);
    const imageBox   =document.getElementById(`${category}ImageBox`);
    if (!item) { placeholder.style.display=""; card.classList.add("hidden"); return; }
    placeholder.style.display="none";
    card.classList.remove("hidden");

    document.getElementById(`${category}InfoName`).textContent =item.name;
    document.getElementById(`${category}InfoValue`).textContent=item.baseValue>0?money(item.baseValue):"N/A";

    const effectEl=document.getElementById(`${category}InfoEffect`);
    const et=item.effect&&item.effect.trim()&&item.effect.trim().toLowerCase()!=="none"?item.effect.trim():null;
    effectEl.textContent=et||"None"; effectEl.className="infoText"+(et?"":" is-none");

    setImageBox(imageBox, item.image||null, fallbackEmoji);

    // Ingredients (dish)
    if (category==="dish") {
      const block=document.getElementById("dishIngredientsBlock");
      const grid =document.getElementById("dishInfoIngredients");
      if (item.ingredients&&item.ingredients.length) {
        block.style.display=""; renderFoodChipGrid(grid, item.ingredients);
      } else {
        block.style.display=""; grid.innerHTML=`<span class="ingredientsNone">None listed</span>`;
      }
    }

    // Drops (entity)
    if (category==="entity") {
      const block=document.getElementById("entityDropsBlock");
      const grid =document.getElementById("entityInfoDrops");
      if (item.drops&&item.drops.length) {
        block.style.display=""; renderDropChipGrid(grid, item.drops);
      } else {
        block.style.display=""; grid.innerHTML=`<span class="ingredientsNone">None listed</span>`;
      }
    }
  }

  // ── Generic info list ──
  function renderInfoList(listEl, items, selectedId, searchText, onSelect) {
    listEl.innerHTML="";
    items
      .filter(it=>it.name.toLowerCase().includes(searchText.toLowerCase()))
      .sort((a,b)=>a.baseValue-b.baseValue)
      .forEach((item,i)=>{
        const row=document.createElement("div");
        row.className="itemRow"+(item.id===selectedId?" is-active":"");
        row.style.animationDelay=`${i*12}ms`;
        row.innerHTML=`<span class="iname">${esc(item.name)}</span>${item.baseValue>0?`<span class="ival">${money(item.baseValue)}</span>`:""}`;
        row.onclick=()=>onSelect(item.id);
        listEl.appendChild(row);
      });
  }

  // ── Multi-picker for entity drops (food items + tools) ──
  function renderEntityDropsPicker(containerEl, selectedSet, onChange) {
    containerEl.innerHTML="";
    const foods=data.items.slice().sort((a,b)=>a.name.localeCompare(b.name));
    const tools=data.tools.slice().sort((a,b)=>a.name.localeCompare(b.name));
    const allItems=[
      ...foods.map(f=>({...f,_type:"food"})),
      ...tools.map(t=>({...t,_type:"tool"}))
    ];
    if (!allItems.length) { containerEl.innerHTML=`<div class="pickerEmpty">No items yet.</div>`; return; }
    if (foods.length) {
      const lbl=document.createElement("div");
      lbl.className="muted";lbl.style="font-size:10px;font-family:'Oswald',sans-serif;letter-spacing:1px;text-transform:uppercase;padding:6px 4px 2px;";lbl.textContent="🍖 Food Items";
      containerEl.appendChild(lbl);
    }
    for (const food of foods) {
      const div=document.createElement("div");
      div.className="multiPickerItem"+(selectedSet.has(food.id)?" selected":"");
      div.innerHTML=`<input type="checkbox" ${selectedSet.has(food.id)?"checked":""} /><span>${esc(food.name)}</span>`;
      div.addEventListener("click",()=>{if(selectedSet.has(food.id))selectedSet.delete(food.id);else selectedSet.add(food.id);div.classList.toggle("selected",selectedSet.has(food.id));div.querySelector("input").checked=selectedSet.has(food.id);onChange();});
      containerEl.appendChild(div);
    }
    if (tools.length) {
      const lbl=document.createElement("div");
      lbl.className="muted";lbl.style="font-size:10px;font-family:'Oswald',sans-serif;letter-spacing:1px;text-transform:uppercase;padding:10px 4px 2px;";lbl.textContent="🔧 Tools";
      containerEl.appendChild(lbl);
      for (const tool of tools) {
        const div=document.createElement("div");
        div.className="multiPickerItem"+(selectedSet.has(tool.id)?" selected":"");
        div.innerHTML=`<input type="checkbox" ${selectedSet.has(tool.id)?"checked":""} /><span>${esc(tool.name)}</span>`;
        div.addEventListener("click",()=>{if(selectedSet.has(tool.id))selectedSet.delete(tool.id);else selectedSet.add(tool.id);div.classList.toggle("selected",selectedSet.has(tool.id));div.querySelector("input").checked=selectedSet.has(tool.id);onChange();});
        containerEl.appendChild(div);
      }
    }
  }

  // ── Dropped By section for food browse ──
  function renderDroppedBySection(foodItem) {
    const box=document.getElementById("foodDroppedByBox");
    const grid=document.getElementById("foodDroppedByGrid");
    if (!foodItem) { box.style.display="none"; return; }
    const droppers=data.entities.filter(e=>Array.isArray(e.drops)&&e.drops.includes(foodItem.id));
    if (!droppers.length) { box.style.display="none"; return; }
    box.style.display="";
    grid.innerHTML="";
    for (const entity of droppers) {
      const chip=document.createElement("div");
      chip.className="ingredientChip";
      const imgHtml=entity.image
        ? `<div class="ingredientChipImg"><img src="${esc(entity.image)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'chipImgPlaceholder\\'>👁</span>'" /></div>`
        : `<div class="ingredientChipImg"><span class="chipImgPlaceholder">👁</span></div>`;
      chip.innerHTML=`${imgHtml}<div><div class="ingredientChipName">${esc(entity.name)}</div><div class="ingredientChipValue" style="color:var(--accent);">Entity Drop</div></div>`;
      chip.style.cursor="pointer";
      chip.onclick=()=>{selectedIds.entity=entity.id;setLeftPage("entity");renderAll();};
      grid.appendChild(chip);
    }
  }

  // ── Multi-picker (checkbox list of food items) ──
  function renderMultiPicker(containerEl, selectedSet, onChange) {
    containerEl.innerHTML="";
    const items=data.items.slice().sort((a,b)=>a.name.localeCompare(b.name));
    if (!items.length) { containerEl.innerHTML=`<div class="pickerEmpty">No food items yet.</div>`; return; }
    for (const food of items) {
      const div=document.createElement("div");
      div.className="multiPickerItem"+(selectedSet.has(food.id)?" selected":"");
      div.innerHTML=`<input type="checkbox" ${selectedSet.has(food.id)?"checked":""} /><span>${esc(food.name)}</span>`;
      div.addEventListener("click", ()=>{
        if (selectedSet.has(food.id)) selectedSet.delete(food.id); else selectedSet.add(food.id);
        div.classList.toggle("selected", selectedSet.has(food.id));
        div.querySelector("input").checked=selectedSet.has(food.id);
        onChange();
      });
      containerEl.appendChild(div);
    }
  }

  // ── Generic info editor list ──
  function renderInfoEditorList(listEl, items, onEdit, onDelete) {
    listEl.innerHTML="";
    items.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(item=>{
      const row=document.createElement("div");
      row.className="editorRow";
      const thumb=item.image
        ? `<div class="editorRowThumb"><img src="${esc(item.image)}" alt="" onerror="this.style.display='none'" /></div>`
        : `<div class="editorRowThumb"><span class="thumbPlaceholder">🖼</span></div>`;
      const ep=(item.effect&&item.effect.trim())?item.effect.trim():"No effect";
      row.innerHTML=`
        ${thumb}
        <div style="min-width:0;flex:1;">
          <div class="name">${esc(item.name)}</div>
          <div class="meta">${item.baseValue>0?money(item.baseValue):"N/A"}</div>
          <div class="effect-preview">${esc(ep)}</div>
        </div>
        <div class="row" style="flex-shrink:0;">
          <button class="btn primary2 btn-edit">Edit</button>
          <button class="btn danger btn-del">Delete</button>
        </div>`;
      row.querySelector(".btn-edit").onclick=()=>onEdit(item);
      row.querySelector(".btn-del").onclick=()=>onDelete(item.id);
      listEl.appendChild(row);
    });
  }

  // ── Food editor ──
  function renderFoodEditor() {
    elEditorItems.innerHTML="";
    data.items.slice().sort((a,b)=>a.baseValue-b.baseValue).forEach(it=>{
      const row=document.createElement("div");
      row.className="editorRow";
      const thumb=it.image
        ? `<div class="editorRowThumb"><img src="${esc(it.image)}" alt="" onerror="this.style.display='none'" /></div>`
        : `<div class="editorRowThumb"><span class="thumbPlaceholder">🖼</span></div>`;
      row.innerHTML=`
        ${thumb}
        <div style="flex:1;min-width:0;"><div class="name">${esc(it.name)}</div><div class="meta">${money(it.baseValue)}</div></div>
        <div class="row" style="flex-shrink:0;">
          <button class="btn primary2 btn-edit">Edit</button>
          <button class="btn danger btn-del">Delete</button>
        </div>`;
      row.querySelector(".btn-edit").onclick=()=>{
        elNewItemName.value=it.name; elNewItemValue.value=it.baseValue;
        elFoodImgUrl.value=it.image||""; setUrlPreview(elFoodImgPrev, it.image||"", "🍖");
        elNewItemName.focus();
      };
      row.querySelector(".btn-del").onclick=()=>{const n=deepCopy(data);n.items=n.items.filter(x=>x.id!==it.id);saveData(n);};
      elEditorItems.appendChild(row);
    });
  }

  // ── Affixes editor ──
  function renderAffixesEditor() {
    elEditorAffixList.innerHTML="";
    data.affixes.slice().sort((a,b)=>b.mult-a.mult).forEach(a=>{
      const row=document.createElement("div");
      row.className="editorRow";
      row.innerHTML=`
        <div>
          <div class="name">${affixNameSpan(a)} <span class="muted" style="font-size:10px;font-family:'Oswald',sans-serif;letter-spacing:1px;">[${a.status}]</span></div>
          <div class="meta">x${a.mult}</div>
        </div>
        <div class="row">
          <button class="btn primary2 btn-edit">Edit</button>
          <button class="btn danger btn-del">Delete</button>
        </div>`;
      row.querySelector(".btn-edit").onclick=()=>{elNewAffixName.value=a.name;elNewAffixMult.value=a.mult;elNewAffixColor.value=a.color||"";elNewAffixStatus.value=a.status||"standard";elNewAffixName.focus();};
      row.querySelector(".btn-del").onclick=()=>{const n=deepCopy(data);n.affixes=n.affixes.filter(x=>x.id!==a.id);saveData(n);};
      elEditorAffixList.appendChild(row);
    });
  }

  // ── Add/Update buttons ──
  document.getElementById("btnAddItem").onclick=()=>{
    const name=elNewItemName.value.trim(), val=safeNumber(elNewItemValue.value);
    if (!name||isNaN(val)) return;
    const next=deepCopy(data);
    const ex=next.items.find(i=>normName(i.name)===normName(name));
    const img=elFoodImgUrl.value.trim();
    if (ex){ex.name=name;ex.baseValue=val;ex.image=img;}
    else next.items.push({id:slugify(name),name,baseValue:val,image:img});
    elNewItemName.value="";elNewItemValue.value="";elFoodImgUrl.value="";
    setUrlPreview(elFoodImgPrev,"","🍖");
    saveData(next);
  };

  document.getElementById("btnAddAffix").onclick=()=>{
    const name=elNewAffixName.value.trim(), mult=safeNumber(elNewAffixMult.value);
    if (!name||isNaN(mult)) return;
    const next=deepCopy(data);
    const ex=next.affixes.find(a=>normName(a.name)===normName(name));
    if (ex){ex.name=name;ex.mult=mult;ex.color=elNewAffixColor.value;ex.status=elNewAffixStatus.value;}
    else next.affixes.push({id:slugify(name),name,mult,color:elNewAffixColor.value,status:elNewAffixStatus.value});
    elNewAffixName.value="";elNewAffixMult.value="";elNewAffixColor.value="";
    saveData(next);
  };

  document.getElementById("btnAddDish").onclick=()=>{
    const name=elNewDishName.value.trim(), val=safeNumber(elNewDishValue.value), effect=elNewDishEffect.value.trim()||"None";
    if (!name||isNaN(val)) return;
    const next=deepCopy(data);
    const ex=next.dishes.find(d=>normName(d.name)===normName(name));
    const img=elDishImgUrl.value.trim();
    const ingredients=Array.from(editorDishIngredients);
    if (ex){ex.name=name;ex.baseValue=val;ex.effect=effect;ex.image=img;ex.ingredients=ingredients;}
    else next.dishes.push({id:slugify(name),name,baseValue:val,effect,image:img,ingredients});
    elNewDishName.value="";elNewDishValue.value="";elNewDishEffect.value="";elDishImgUrl.value="";
    editorDishIngredients=new Set();
    setUrlPreview(elDishImgPrev,"","🍽");
    saveData(next);
  };

  document.getElementById("btnAddTool").onclick=()=>{
    const name=elNewToolName.value.trim(), val=safeNumber(elNewToolValue.value), effect=elNewToolEffect.value.trim()||"None";
    if (!name||isNaN(val)) return;
    const next=deepCopy(data);
    const ex=next.tools.find(t=>normName(t.name)===normName(name));
    const img=elToolsImgUrl.value.trim();
    if (ex){ex.name=name;ex.baseValue=val;ex.effect=effect;ex.image=img;}
    else next.tools.push({id:slugify(name),name,baseValue:val,effect,image:img});
    elNewToolName.value="";elNewToolValue.value="";elNewToolEffect.value="";elToolsImgUrl.value="";
    setUrlPreview(elToolsImgPrev,"","🔧");
    saveData(next);
  };

  document.getElementById("btnAddEntity").onclick=()=>{
    const name=elNewEntityName.value.trim(), val=safeNumber(elNewEntityValue.value)||0, effect=elNewEntityEffect.value.trim()||"None";
    if (!name) return;
    const next=deepCopy(data);
    const ex=next.entities.find(e=>normName(e.name)===normName(name));
    const img=elEntityImgUrl.value.trim();
    const drops=Array.from(editorEntityDrops);
    if (ex){ex.name=name;ex.baseValue=val;ex.effect=effect;ex.image=img;ex.drops=drops;}
    else next.entities.push({id:slugify(name),name,baseValue:val,effect,image:img,drops});
    elNewEntityName.value="";elNewEntityValue.value="";elNewEntityEffect.value="";elEntityImgUrl.value="";
    editorEntityDrops=new Set();
    setUrlPreview(elEntityImgPrev,"","👁");
    saveData(next);
  };

  // ── Export ──
  document.getElementById("btnExport").addEventListener("click",()=>{
    const exp=deepCopy(data);
    exp.items.sort((a,b)=>a.baseValue-b.baseValue);
    exp.affixes.sort((a,b)=>a.mult-b.mult);
    ["dishes","tools","entities"].forEach(k=>exp[k]&&exp[k].sort((a,b)=>a.name.localeCompare(b.name)));
    const content="window.DEFAULT_DATA = "+JSON.stringify(exp,null,2);
    const blob=new Blob([content],{type:"application/javascript"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="item_data.js";
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
  });

  // ── Import ──
  const fileImport=document.getElementById("fileImport");
  document.getElementById("btnImport").addEventListener("click",()=>fileImport.click());
  fileImport.addEventListener("change",e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const text=ev.target.result.trim();
        let parsed;
        if (text.startsWith("{")) parsed=JSON.parse(text);
        else {
          const m=text.match(/window\.DEFAULT_DATA\s*=\s*([\s\S]+)$/);
          if (!m) throw new Error("Unrecognised format");
          parsed=JSON.parse(m[1]);
        }
        if (!parsed.items||!parsed.affixes) throw new Error("Missing items or affixes");
        if (!parsed.dishes)   parsed.dishes  =deepCopy(DEFAULT_DISHES);
        if (!parsed.tools)    parsed.tools   =deepCopy(DEFAULT_TOOLS);
        if (!parsed.entities) parsed.entities=deepCopy(DEFAULT_ENTITIES);
        ensureFields(parsed.items);
        ensureFields(parsed.dishes,{ingredients:[]});
        ensureFields(parsed.tools);
        ensureFields(parsed.entities,{drops:[]});
        saveData(parsed);
        alert("Import successful!");
      } catch(err){alert("Import failed: "+err.message);}
    };
    reader.readAsText(file);
    fileImport.value="";
  });

  // ── Reset ──
  document.getElementById("btnResetDefaults").addEventListener("click",()=>{
    if (!confirm("Reset all data to defaults? This cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    selectedIds={food:null,dish:null,tools:null,entity:null};
    selectedAffixIds=new Set();
    editorDishIngredients=new Set();
    editorEntityDrops=new Set();
    comboPage=0;
    data=getDefaultData();
    saveData(data);
  });

  // ── Search handlers ──
  elItemSearch.oninput   = e=>{searchTexts.food  =e.target.value;renderAll();};
  elDishSearch.oninput   = e=>{searchTexts.dish  =e.target.value;renderAll();};
  elToolsSearch.oninput  = e=>{searchTexts.tools =e.target.value;renderAll();};
  elEntitySearch.oninput = e=>{searchTexts.entity=e.target.value;renderAll();};

  // Combo search (wired after first render via delegation)
  document.addEventListener("input", e=>{
    if (e.target&&e.target.id==="comboSearch") {
      comboSearchText=e.target.value;
      comboPage=0;
      const foodItem=data.items.find(i=>i.id===selectedIds.food);
      if (foodItem) renderAllCombos(foodItem);
    }
  });

  // ── Master Render ──
  function renderAll() {
    ensureTopControls();

    // Food list
    elItemList.innerHTML="";
    data.items
      .filter(it=>it.name.toLowerCase().includes(searchTexts.food.toLowerCase()))
      .sort((a,b)=>a.baseValue-b.baseValue)
      .forEach((item,i)=>{
        const row=document.createElement("div");
        row.className="itemRow"+(item.id===selectedIds.food?" is-active":"");
        row.style.animationDelay=`${i*12}ms`;
        row.innerHTML=`<span class="iname">${esc(item.name)}</span><span class="ival">${money(item.baseValue)}</span>`;
        row.onclick=()=>{selectedIds.food=item.id;selectedAffixIds=new Set();comboPage=0;renderAll();};
        elItemList.appendChild(row);
      });

    // Food browse
    const foodItem=data.items.find(i=>i.id===selectedIds.food);
    const foodBox=document.getElementById("foodImageBox");
    if (foodItem) {
      elSelectedItemName.textContent=foodItem.name;
      elSelectedItemValue.textContent=money(foodItem.baseValue);
      setImageBox(foodBox,foodItem.image||null,"🍖");
      renderAffixPriceTable(foodItem);
      renderAffixChecklist(foodItem);
      renderAllCombos(foodItem);
      renderDroppedBySection(foodItem);
    } else {
      setImageBox(foodBox,null,"🍖");
      renderDroppedBySection(null);
    }

    // Dish
    if (!selectedIds.dish || !data.dishes.find(d=>d.id===selectedIds.dish)) {
      const first=data.dishes.slice().sort((a,b)=>a.baseValue-b.baseValue)[0];
      if (first) selectedIds.dish=first.id;
    }
    renderInfoList(elDishList,data.dishes,selectedIds.dish,searchTexts.dish,id=>{selectedIds.dish=id;renderAll();});
    showInfoCard("dish",data.dishes.find(d=>d.id===selectedIds.dish)||null,"🍽");

    // Tools
    if (!selectedIds.tools || !data.tools.find(t=>t.id===selectedIds.tools)) {
      const first=data.tools.slice().sort((a,b)=>a.baseValue-b.baseValue)[0];
      if (first) selectedIds.tools=first.id;
    }
    renderInfoList(elToolsList,data.tools,selectedIds.tools,searchTexts.tools,id=>{selectedIds.tools=id;renderAll();});
    showInfoCard("tools",data.tools.find(t=>t.id===selectedIds.tools)||null,"🔧");

    // Entity
    if (!selectedIds.entity || !data.entities.find(e=>e.id===selectedIds.entity)) {
      const first=data.entities.slice().sort((a,b)=>a.baseValue-b.baseValue)[0];
      if (first) selectedIds.entity=first.id;
    }
    renderInfoList(elEntityList,data.entities,selectedIds.entity,searchTexts.entity,id=>{selectedIds.entity=id;renderAll();});
    showInfoCard("entity",data.entities.find(e=>e.id===selectedIds.entity)||null,"👁");

    // Editor lists
    renderFoodEditor();
    renderAffixesEditor();

    // Dish editor list + rebuild picker
    renderInfoEditorList(
      elEditorDishList, data.dishes,
      item=>{
        elNewDishName.value=item.name; elNewDishValue.value=item.baseValue;
        elNewDishEffect.value=item.effect||""; elDishImgUrl.value=item.image||"";
        setUrlPreview(elDishImgPrev,item.image||"","🍽");
        editorDishIngredients=new Set(item.ingredients||[]);
        renderMultiPicker(elDishIngredientPicker,editorDishIngredients,()=>{});
        elNewDishName.focus();
      },
      id=>{const n=deepCopy(data);n.dishes=n.dishes.filter(x=>x.id!==id);saveData(n);}
    );

    // Tools editor list
    renderInfoEditorList(
      elEditorToolsList, data.tools,
      item=>{
        elNewToolName.value=item.name; elNewToolValue.value=item.baseValue;
        elNewToolEffect.value=item.effect||""; elToolsImgUrl.value=item.image||"";
        setUrlPreview(elToolsImgPrev,item.image||"","🔧");
        elNewToolName.focus();
      },
      id=>{const n=deepCopy(data);n.tools=n.tools.filter(x=>x.id!==id);saveData(n);}
    );

    // Entity editor list + rebuild picker
    renderInfoEditorList(
      elEditorEntityList, data.entities,
      item=>{
        elNewEntityName.value=item.name; elNewEntityValue.value=item.baseValue||0;
        elNewEntityEffect.value=item.effect||""; elEntityImgUrl.value=item.image||"";
        setUrlPreview(elEntityImgPrev,item.image||"","👁");
        editorEntityDrops=new Set(item.drops||[]);
        renderEntityDropsPicker(elEntityDropsPicker,editorEntityDrops,()=>{});
        elNewEntityName.focus();
      },
      id=>{const n=deepCopy(data);n.entities=n.entities.filter(x=>x.id!==id);saveData(n);}
    );

    // Always re-render the pickers so they reflect current food list
    renderMultiPicker(elDishIngredientPicker, editorDishIngredients, ()=>{});
    renderEntityDropsPicker(elEntityDropsPicker,    editorEntityDrops,    ()=>{});
  }

  // ── Init ──
  if (!selectedIds.food&&data.items.length) selectedIds.food=data.items[0].id;
  setTab("browse");
  setLeftPage("food");
  renderAll();
})();



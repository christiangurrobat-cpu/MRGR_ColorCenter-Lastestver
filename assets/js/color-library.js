/* ============================================================
   CENTRALIZED COLOR LIBRARY — RYB CLASSIFICATION SYSTEM
   Offline, Database-Backed (MySQL + Local Cache)
   ============================================================ */

const COLOR_CLASSIFICATIONS = [
  { code: 'A', name: 'Primary Colors', subtitle: 'Traditional RYB base pigments (Red, Yellow, Blue)', dot: '#FF0000', families: ['Red', 'Yellow', 'Blue'] },
  { code: 'B', name: 'Secondary Colors', subtitle: 'Mixed from primary pigments (Orange, Green, Violet)', dot: '#FF7F00', families: ['Orange', 'Green', 'Violet', 'Purple'] },
  { code: 'C', name: 'Tertiary Colors', subtitle: 'Primary + adjacent secondary (Red-Orange to Red-Violet)', dot: '#FF4500', families: ['Red-Orange', 'Yellow-Orange', 'Yellow-Green', 'Blue-Green', 'Blue-Violet', 'Red-Violet'] },
  { code: 'D', name: 'Neutral Colors', subtitle: 'Achromatic & clean bases (White, Black, Gray, Beige)', dot: '#808080', families: ['White', 'Black', 'Gray', 'Beige'] },
  { code: 'E', name: 'Earth Tones', subtitle: 'Natural mineral & wood shades (Brown, Tan, Terracotta, Ochre)', dot: '#954535', families: ['Brown', 'Tan', 'Terracotta', 'Ochre', 'Red', 'Green'] },
  { code: 'F', name: 'Pastel Colors', subtitle: 'Soft high-lightness tints (Pastel Pink, Baby Blue, Mint, Lavender, Peach)', dot: '#F7B9BE', families: ['Pastel Pink', 'Baby Blue', 'Mint Green', 'Lavender', 'Peach', 'Yellow'] },
  { code: 'G', name: 'Warm Colors', subtitle: 'Warm-undertone finishes (Coral, Burgundy, Gold, Warm Yellow)', dot: '#FF7F50', families: ['Coral', 'Burgundy', 'Gold', 'Warm Yellow'] },
  { code: 'H', name: 'Cool Colors', subtitle: 'Cool-undertone finishes (Teal, Navy Blue, Turquoise, Cool Gray)', dot: '#008080', families: ['Teal', 'Navy Blue', 'Turquoise', 'Cool Gray', 'Blue'] },
  { code: 'I', name: 'Specialty Colors', subtitle: 'Effect & safety coatings (Metallic, Pearl, Fluorescent, Glow-in-the-dark)', dot: '#D4AF37', families: ['Metallic', 'Pearl', 'Fluorescent', 'Glow-in-the-dark'] },
  { code: 'J', name: 'Custom Colors', subtitle: 'Admin-created shades', dot: '#1F6F6B', families: ['Admin Custom', 'Red', 'Yellow', 'Blue', 'Orange', 'Green', 'Violet', 'White', 'Black', 'Gray', 'Brown', 'Specialty Colors'] }
];

const COLOR_LIBRARY_CATEGORIES = [
  'White', 'Black', 'Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Brown', 'Specialty Colors'
];

const COLOR_VARIATIONS = ['Base', 'Tint', 'Shade', 'Tone'];

const COLOR_CATEGORY_DOT_HEX = {
  'White': '#FFFFFF', 'Black': '#1B1B1B', 'Gray': '#808080', 'Red': '#DC143C',
  'Orange': '#FF6700', 'Yellow': '#FFEF00', 'Green': '#228B22', 'Blue': '#4169E1',
  'Purple': '#7851A9', 'Brown': '#954535', 'Specialty Colors': '#D4AF37'
};

const BUILTIN_COLOR_LIBRARY_FALLBACK = [
  { id: 'clr_bi_bright_red', name: 'Bright Red', hex: '#FF0000', category: 'Red', classification: 'Primary Colors', colorFamily: 'Red', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Vibrant primary red' },
  { id: 'clr_bi_pure_yellow', name: 'Pure Yellow', hex: '#FFFF00', category: 'Yellow', classification: 'Primary Colors', colorFamily: 'Yellow', variation: 'Base', parentColorId: null, isCustom: false, notes: 'RYB Primary pure yellow' },
  { id: 'clr_bi_pure_blue', name: 'Pure Blue', hex: '#0000FF', category: 'Blue', classification: 'Primary Colors', colorFamily: 'Blue', variation: 'Base', parentColorId: null, isCustom: false, notes: 'RYB Primary pure blue' },
  { id: 'clr_bi_pure_orange', name: 'Pure Orange', hex: '#FF7F00', category: 'Orange', classification: 'Secondary Colors', colorFamily: 'Orange', variation: 'Base', parentColorId: null, isCustom: false, notes: 'RYB Secondary orange (Red + Yellow)' },
  { id: 'clr_bi_pure_green', name: 'Pure Green', hex: '#008000', category: 'Green', classification: 'Secondary Colors', colorFamily: 'Green', variation: 'Base', parentColorId: null, isCustom: false, notes: 'RYB Secondary green (Yellow + Blue)' },
  { id: 'clr_bi_pure_violet', name: 'Purple', hex: '#800080', category: 'Purple', classification: 'Secondary Colors', colorFamily: 'Purple', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Deep, classic purple shade' },
  { id: 'clr_bi_violet', name: 'Violet', hex: '#8F00FF', category: 'Purple', classification: 'Secondary Colors', colorFamily: 'Violet', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Brighter, more vivid spectral violet shade' },
  { id: 'clr_bi_red_orange', name: 'Red-Orange', hex: '#FF4500', category: 'Orange', classification: 'Tertiary Colors', colorFamily: 'Red-Orange', variation: 'Base', parentColorId: 'clr_bi_pure_orange', isCustom: false, notes: 'RYB Tertiary (Red + Orange)' },
  { id: 'clr_bi_yellow_orange', name: 'Yellow-Orange', hex: '#FFAE42', category: 'Orange', classification: 'Tertiary Colors', colorFamily: 'Yellow-Orange', variation: 'Base', parentColorId: 'clr_bi_pure_orange', isCustom: false, notes: 'RYB Tertiary (Yellow + Orange)' },
  { id: 'clr_bi_yellow_green', name: 'Yellow-Green', hex: '#9ACD32', category: 'Green', classification: 'Tertiary Colors', colorFamily: 'Yellow-Green', variation: 'Base', parentColorId: 'clr_bi_pure_green', isCustom: false, notes: 'RYB Tertiary (Yellow + Green)' },
  { id: 'clr_bi_blue_green', name: 'Blue-Green', hex: '#0D98BA', category: 'Blue', classification: 'Tertiary Colors', colorFamily: 'Blue-Green', variation: 'Base', parentColorId: 'clr_bi_pure_green', isCustom: false, notes: 'RYB Tertiary (Blue + Green)' },
  { id: 'clr_bi_blue_violet', name: 'Blue-Violet', hex: '#8A2BE2', category: 'Purple', classification: 'Tertiary Colors', colorFamily: 'Blue-Violet', variation: 'Base', parentColorId: 'clr_bi_violet', isCustom: false, notes: 'RYB Tertiary (Blue + Violet)' },
  { id: 'clr_bi_red_violet', name: 'Red-Violet', hex: '#C71585', category: 'Purple', classification: 'Tertiary Colors', colorFamily: 'Red-Violet', variation: 'Base', parentColorId: 'clr_bi_violet', isCustom: false, notes: 'RYB Tertiary (Red + Violet)' },
  { id: 'clr_bi_pure_white', name: 'Pure White', hex: '#FFFFFF', category: 'White', classification: 'Neutral Colors', colorFamily: 'White', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Clean neutral brilliant white base' },
  { id: 'clr_bi_pure_black', name: 'Pure Black', hex: '#000000', category: 'Black', classification: 'Neutral Colors', colorFamily: 'Black', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Deep solid carbon black' },
  { id: 'clr_bi_medium_gray', name: 'Medium Gray', hex: '#808080', category: 'Gray', classification: 'Neutral Colors', colorFamily: 'Gray', variation: 'Base', parentColorId: null, isCustom: false, notes: 'Balanced neutral gray' },
  { id: 'clr_bi_beige', name: 'Beige', hex: '#F5F5DC', category: 'Brown', classification: 'Neutral Colors', colorFamily: 'Beige', variation: 'Tint', parentColorId: null, isCustom: false, notes: 'Classic neutral beige' }
];

const DEFAULT_SECTION_LIMIT = 12;

let colorLibraryUiState = {
  activeTab: 'library', // 'library' | 'mixed'
  search: '',
  classification: 'All',
  family: 'All',
  variation: 'All',
  typeFilter: 'all', // 'all' | 'builtin' | 'custom'
  sortBy: 'name_asc',
  expandedSections: new Set(COLOR_CLASSIFICATIONS.map(c => c.name)),
  sectionLimits: {},
  mixedSearch: '',
  mixedCategory: 'All',
  mixedSortBy: 'catalog_order',
  mixedExpandedSections: new Set(['Cream', 'Yellow', 'Pink', 'Purple', 'Orange', 'Brown', 'Green', 'Blue', 'Gray', 'Custom']),
  mixedSectionLimits: {}
};

let colorPickerModalState = {
  search: '',
  category: 'All',
  selectedId: '',
  onSelect: null
};

function normalizeHexCode(raw) {
  let s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9A-F]{3}$/.test(s)) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return /^#[0-9A-F]{6}$/.test(s) ? s : '';
}

function isLightColorHex(hex) {
  const norm = normalizeHexCode(hex);
  if (!norm) return true;
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.65;
}

function hexToRgbObj(raw) {
  const norm = normalizeHexCode(raw);
  if (!norm) return null;
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16)
  };
}

function hexToRgbLabel(hex) {
  const rgb = hexToRgbObj(hex);
  if (!rgb) return 'rgb(—, —, —)';
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function formatColorDate(iso) {
  if (!iso) return 'Built-in Seed';
  if (typeof formatDateTime === 'function') return formatDateTime(iso);
  return String(iso).slice(0, 16).replace('T', ' ');
}

function normalizeColorLibraryRecord(c) {
  if (!c || typeof c !== 'object') return null;
  const hex = normalizeHexCode(c.hex) || '#FFFFFF';
  const rgb = hexToRgbObj(hex) || { r: 255, g: 255, b: 255 };
  const rawCls = String(c.classification || '').trim();
  const matchedCls = COLOR_CLASSIFICATIONS.find(cl => cl.name.toLowerCase() === rawCls.toLowerCase());
  const classification = matchedCls ? matchedCls.name : (c.isCustom ? 'Custom Colors' : 'Neutral Colors');
  return {
    ...c,
    id: String(c.id || '').trim() || ('clr_' + String(c.name || 'color').toLowerCase().replace(/[^a-z0-9]+/g, '_')),
    name: String(c.name || 'Unnamed Color').trim(),
    hex,
    rgb,
    rgbLabel: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    classification,
    colorFamily: c.colorFamily || c.category || 'General',
    variation: COLOR_VARIATIONS.includes(c.variation) ? c.variation : 'Base',
    parentColorId: c.parentColorId || null
  };
}

function getColorLibraryList() {
  const rawList = (typeof db !== 'undefined' && db && Array.isArray(db.colorLibrary) && db.colorLibrary.length > 0)
    ? db.colorLibrary
    : BUILTIN_COLOR_LIBRARY_FALLBACK;

  const seenIds = new Set();
  const result = [];
  rawList.forEach(item => {
    const norm = normalizeColorLibraryRecord(item);
    if (!norm || !norm.id || seenIds.has(norm.id)) return;
    seenIds.add(norm.id);
    result.push(norm);
  });
  return result;
}

function detectClosestLibraryColor(r, g, b) {
  const list = getColorLibraryList();
  if (!list.length) {
    return { id: null, name: 'Custom Color', hex: '#FFFFFF', r: 255, g: 255, b: 255, family: 'General', classification: 'Custom Colors' };
  }
  const rr = Math.max(0, Math.min(255, Number(r) || 0));
  const gg = Math.max(0, Math.min(255, Number(g) || 0));
  const bb = Math.max(0, Math.min(255, Number(b) || 0));

  let closest = list[0];
  let minDistance = Infinity;
  list.forEach(item => {
    const rgb = item.rgb || hexToRgbObj(item.hex) || { r: 255, g: 255, b: 255 };
    const dR = rr - rgb.r;
    const dG = gg - rgb.g;
    const dB = bb - rgb.b;
    const dist = Math.sqrt(2 * dR * dR + 4 * dG * dG + 3 * dB * dB);
    if (dist < minDistance) {
      minDistance = dist;
      closest = item;
    }
  });
  return {
    ...closest,
    r: closest.rgb.r,
    g: closest.rgb.g,
    b: closest.rgb.b,
    family: closest.colorFamily || closest.category || 'General'
  };
}

function notifyColorLibraryChanged(reason = 'update') {
  syncProductsWithColorLibrary();
  if (typeof window !== 'undefined' && typeof window.syncColorMixingWithLibrary === 'function') {
    try {
      window.syncColorMixingWithLibrary(reason);
    } catch (e) {
      console.warn('Color mixing sync warning:', e);
    }
  }
}

function findColorLibraryEntry(idOrNameOrHex) {
  if (!idOrNameOrHex) return null;
  const q = String(idOrNameOrHex).trim();
  if (!q) return null;
  const list = getColorLibraryList();
  const byId = list.find(c => String(c.id) === q);
  if (byId) return byId;
  const qLower = q.toLowerCase();
  const byName = list.find(c => String(c.name || '').trim().toLowerCase() === qLower);
  if (byName) return byName;
  const qHex = normalizeHexCode(q);
  if (qHex) {
    const byHex = list.find(c => normalizeHexCode(c.hex) === qHex);
    if (byHex) return byHex;
  }
  return null;
}

function resolveProductColor(product) {
  if (!product) {
    return { id: null, name: '-', hex: '#FFFFFF', category: '', colorFamily: '', classification: '', isLinked: false };
  }
  const cid = product.colorId || product.color_id || null;
  if (cid) {
    const entry = findColorLibraryEntry(cid);
    if (entry) {
      return {
        id: entry.id,
        name: entry.name,
        hex: normalizeHexCode(entry.hex) || '#FFFFFF',
        category: entry.category || '',
        colorFamily: entry.colorFamily || entry.category || '',
        classification: entry.classification || '',
        isLinked: true
      };
    }
  }
  const fallbackHex = normalizeHexCode(product.colorHex || product.color_hex) ||
    (typeof getProductHex === 'function' ? getProductHex(product) : '#1F6F6B');
  return {
    id: null,
    name: product.color || '-',
    hex: fallbackHex,
    category: '',
    colorFamily: '',
    classification: '',
    isLinked: false
  };
}

function resolveProductColorTone(product, resolvedColor) {
  const isGenericTone = (val) => {
    const s = String(val || '').trim();
    return !s || /^(admin\s*custom|user\s*custom|custom(\s*colors?)?|general|standard|other|specialty(\s*colors?)?)$/i.test(s);
  };

  const resolved = resolvedColor || resolveProductColor(product);
  const rawName = String((product && product.color) || (resolved && resolved.name) || '').trim();

  if (!resolved.isLinked && /^(clear|transparent|colorless|clear\s*coat)$/i.test(rawName)) {
    return 'Clear';
  }

  if (resolved.isLinked) {
    if (!isGenericTone(resolved.colorFamily)) return resolved.colorFamily;
    if (!isGenericTone(resolved.category)) return resolved.category;
  }

  const hex = resolved.hex || (typeof getProductDefaultColor === 'function' ? getProductDefaultColor(product) : '#FFFFFF');
  const libMatch = (rawName && rawName !== '-' ? findColorLibraryEntry(rawName) : null) || findColorLibraryEntry(hex);
  if (libMatch) {
    if (!isGenericTone(libMatch.colorFamily)) return libMatch.colorFamily;
    if (!isGenericTone(libMatch.category)) return libMatch.category;
  }

  const rgb = hexToRgbObj(hex) || (typeof hexToRgb === 'function' ? hexToRgb(hex) : { r: 255, g: 255, b: 255 });
  const closestLib = detectClosestLibraryColor(rgb.r, rgb.g, rgb.b);
  if (closestLib) {
    if (!isGenericTone(closestLib.colorFamily)) return closestLib.colorFamily;
    if (!isGenericTone(closestLib.category)) return closestLib.category;
    if (!isGenericTone(closestLib.family)) return closestLib.family;
  }

  if (typeof detectMixedColorName === 'function') {
    const detected = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    if (detected && detected.family) return detected.family;
  }

  return 'General';
}

function syncProductsWithColorLibrary() {
  if (typeof db === 'undefined' || !db || !Array.isArray(db.products)) return;
  const list = getColorLibraryList();
  const byId = new Map(list.map(c => [String(c.id), c]));
  db.products.forEach(p => {
    const cid = p.colorId || p.color_id;
    if (cid && byId.has(String(cid))) {
      const entry = byId.get(String(cid));
      p.color = entry.name;
      p.colorHex = entry.hex;
      p.color_hex = entry.hex;
    }
  });
}

function getActiveProductsReferencingColor(colorId) {
  if (typeof db === 'undefined' || !db || !Array.isArray(db.products)) return [];
  return db.products.filter(p =>
    (p.colorId || p.color_id) === colorId &&
    String(p.status || 'active').toLowerCase() !== 'discontinued'
  );
}

function getFormulasReferencingColor(colorId) {
  if (typeof db === 'undefined' || !db || !Array.isArray(db.colorFormulas)) return [];
  return db.colorFormulas.filter(f => (f.colorId || f.color_id) === colorId);
}

/* ============================================================
   MAIN COLOR LIBRARY PAGE (RYB CLASSIFICATION VIEW)
   ============================================================ */
function colorLibraryPage() {
  if (typeof syncActiveColorRecipePresets === 'function') syncActiveColorRecipePresets();
  const colors = getColorLibraryList();
  const mixedColors = getColorLibraryMixedCatalogList();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const totalCount = colors.length;
  const mixedCount = mixedColors.length;
  const linkedProducts = (typeof db !== 'undefined' && db && Array.isArray(db.products))
    ? db.products.filter(p => Boolean(p.colorId || p.color_id)).length
    : 0;
  const activeTab = colorLibraryUiState.activeTab === 'mixed' ? 'mixed' : 'library';

  return `
    <div class="cl-kpi-grid">
      <div class="cl-kpi-card">
        <div class="cl-kpi-icon">🎨</div>
        <div class="cl-kpi-body">
          <div class="cl-kpi-label">Base Library Colors</div>
          <div class="cl-kpi-value">${totalCount}</div>
          <div class="cl-kpi-sub">RYB &amp; shop color registry</div>
        </div>
      </div>
      <div class="cl-kpi-card">
        <div class="cl-kpi-icon">🧪</div>
        <div class="cl-kpi-body">
          <div class="cl-kpi-label">Mixed Color Catalog</div>
          <div class="cl-kpi-value">${mixedCount}</div>
          <div class="cl-kpi-sub">Ready-made mixing formulas</div>
        </div>
      </div>
      <div class="cl-kpi-card">
        <div class="cl-kpi-icon">🗂️</div>
        <div class="cl-kpi-body">
          <div class="cl-kpi-label">Classifications</div>
          <div class="cl-kpi-value">${COLOR_CLASSIFICATIONS.length}</div>
          <div class="cl-kpi-sub">Primary to Custom Colors</div>
        </div>
      </div>
      <div class="cl-kpi-card">
        <div class="cl-kpi-icon">🔗</div>
        <div class="cl-kpi-body">
          <div class="cl-kpi-label">Linked Products</div>
          <div class="cl-kpi-value">${linkedProducts}</div>
          <div class="cl-kpi-sub">Synced to Inventory &amp; POS</div>
        </div>
      </div>
    </div>

    <div class="panel cl-panel">
      <div class="cl-panel-header">
        <div>
          <h3 class="cl-panel-title">Centralized Color Library</h3>
          <div class="cl-panel-subtitle">
            Organized by traditional RYB paint color theory alongside the shared POS Mixed Color Catalog.
          </div>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          ${isAdmin ? `
            <button class="btn secondary" onclick="openMixedColorModal()">+ Add Mixed Color</button>
            <button class="btn" onclick="openColorLibraryModal()">+ Add Custom Color</button>
          ` : `
            <span class="badge" style="background:var(--surface-3); color:var(--ink-soft);">Read-only Access</span>
          `}
        </div>
      </div>

      <div class="cl-mode-tabs" id="cl-mode-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${activeTab === 'library' ? 'true' : 'false'}"
          class="cl-mode-tab ${activeTab === 'library' ? 'active' : ''}"
          onclick="onColorLibraryTabSwitch('library')">
          <span>🎨 Base Color Library</span>
          <span class="cl-mode-badge">${totalCount}</span>
        </button>
        <button type="button" role="tab" aria-selected="${activeTab === 'mixed' ? 'true' : 'false'}"
          class="cl-mode-tab ${activeTab === 'mixed' ? 'active' : ''}"
          onclick="onColorLibraryTabSwitch('mixed')">
          <span>🧪 Mixed Color Catalog</span>
          <span class="cl-mode-badge">${mixedCount}</span>
        </button>
      </div>

      <div id="cl-panel-body" style="padding:16px;">
        ${activeTab === 'mixed' ? renderMixedColorCatalogPanelHtml() : renderBaseColorLibraryPanelHtml()}
      </div>
    </div>
  `;
}

function renderBaseColorLibraryPanelHtml() {
  return `
    <div class="cl-toolbar">
      <div class="cl-search-box">
        <span class="cl-search-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input id="cl-search-input" type="search"
          placeholder="Search color name, HEX (#FF0000), family, or variation..."
          value="${escapeAttr(colorLibraryUiState.search)}"
          oninput="onColorLibrarySearch(this.value)">
      </div>
      <div class="cl-controls-right">
        <select id="cl-family-filter" class="cl-select-sm" onchange="onColorLibraryFamilyChange(this.value)" title="Filter by Color Family">
          ${renderColorFamilyFilterOptionsHtml()}
        </select>
        <select id="cl-variation-filter" class="cl-select-sm" onchange="onColorLibraryVariationChange(this.value)" title="Filter by Variation">
          <option value="All" ${colorLibraryUiState.variation === 'All' ? 'selected' : ''}>All Variations</option>
          ${COLOR_VARIATIONS.map(v => `<option value="${v}" ${colorLibraryUiState.variation === v ? 'selected' : ''}>${v}s</option>`).join('')}
        </select>
        <select id="cl-sort-select" class="cl-select-sm" onchange="onColorLibrarySortChange(this.value)" title="Sort colors">
          <option value="name_asc" ${colorLibraryUiState.sortBy === 'name_asc' ? 'selected' : ''}>Sort: A–Z</option>
          <option value="recent_added" ${colorLibraryUiState.sortBy === 'recent_added' ? 'selected' : ''}>Sort: Recently Added</option>
          <option value="recent_updated" ${colorLibraryUiState.sortBy === 'recent_updated' ? 'selected' : ''}>Sort: Recently Updated</option>
        </select>
        <div class="cl-collapse-group">
          <button type="button" class="cl-collapse-btn" onclick="expandAllColorSections()" title="Expand all classifications">Expand All</button>
          <button type="button" class="cl-collapse-btn" onclick="collapseAllColorSections()" title="Collapse all classifications">Collapse All</button>
        </div>
      </div>
    </div>

    <div class="cl-cat-tabs" id="cl-cat-tabs">
      ${renderColorClassificationTabsHtml()}
    </div>

    <div id="cl-grid-container">
      ${renderColorLibrarySectionsHtml()}
    </div>
  `;
}

const CL_MIXED_CATEGORIES_META = [
  { code: 'A', name: 'Cream', dot: '#F5E6B3', subtitle: 'Soft off-whites, ivory & warm neutral tints' },
  { code: 'B', name: 'Yellow', dot: '#FACC15', subtitle: 'Golden sands, ochres, mustards & pale olive tones' },
  { code: 'C', name: 'Pink', dot: '#F472B6', subtitle: 'Blush rose, coral pinks & dusty berry hues' },
  { code: 'D', name: 'Purple', dot: '#A855F7', subtitle: 'Orchid, lavender, lilac & muted plum shades' },
  { code: 'E', name: 'Orange', dot: '#FB923C', subtitle: 'Apricot, peach, terracotta & warm rust tones' },
  { code: 'F', name: 'Brown', dot: '#92400E', subtitle: 'Mocha, cocoa, walnut & earthy espresso shades' },
  { code: 'G', name: 'Green', dot: '#22C55E', subtitle: 'Sage, mint, olive, moss & forest green blends' },
  { code: 'H', name: 'Blue', dot: '#3B82F6', subtitle: 'Sky, powder, slate, teal & deep navy mixes' },
  { code: 'I', name: 'Gray', dot: '#6B7280', subtitle: 'Warm silver, pewter, charcoal & graphite neutrals' }
];

const CL_PIGMENT_DOT_HEX = {
  'white': '#FFFFFF',
  'black': '#1B1B1B',
  'red': '#EF4444',
  'yellow': '#FACC15',
  'blue': '#2563EB',
  'green': '#16A34A',
  'orange': '#F97316',
  'purple': '#9333EA',
  'brown': '#8B4513',
  'pink': '#EC4899',
  'gray': '#6B7280'
};

function getColorLibraryMixedCatalogList() {
  const source = (typeof COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(COLOR_RECIPE_PRESETS) && COLOR_RECIPE_PRESETS.length)
    ? COLOR_RECIPE_PRESETS
    : ((typeof DEFAULT_COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(DEFAULT_COLOR_RECIPE_PRESETS)) ? DEFAULT_COLOR_RECIPE_PRESETS : []);

  return source
    .filter(p => p && Array.isArray(p.recipe) && p.recipe.length >= 2)
    .map((p, idx) => {
      const cleanName = String(p.cleanName || p.name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'Mixed Color';
      const hex = normalizeHexCode(p.hex) || '#FFFFFF';
      const rgb = p.rgb || hexToRgbObj(hex) || { r: 255, g: 255, b: 255 };
      const category = p.family || 'Custom';
      const recipeText = p.recipe.map(r => `${Number(r.pct) || 0}% ${r.name || r.colorHint || 'Pigment'}`).join(' + ');
      return {
        index: idx,
        id: p.id || null,
        isCustom: Boolean(p.isCustom),
        notes: p.notes || '',
        name: cleanName,
        hex,
        rgb,
        rgbLabel: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        category,
        recipe: p.recipe,
        recipeText
      };
    });
}

function getFilteredMixedCatalogItems() {
  const all = getColorLibraryMixedCatalogList();
  const q = (colorLibraryUiState.mixedSearch || '').trim().toLowerCase();
  const cat = colorLibraryUiState.mixedCategory || 'All';
  const sortBy = colorLibraryUiState.mixedSortBy || 'catalog_order';

  const filtered = all.filter(item => {
    if (cat !== 'All' && item.category !== cat) return false;
    if (q) {
      const hay = `${item.name} ${item.hex} ${item.category} ${item.recipeText}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sortBy === 'name_asc') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === 'name_desc') {
    filtered.sort((a, b) => b.name.localeCompare(a.name));
  }
  return filtered;
}

function getMixedCatalogSectionsMeta(allItems) {
  const presentCats = new Set(allItems.map(i => i.category));
  const sections = CL_MIXED_CATEGORIES_META.filter(m => presentCats.has(m.name));
  const known = new Set(CL_MIXED_CATEGORIES_META.map(m => m.name));
  let extraIdx = 0;
  presentCats.forEach(cat => {
    if (!known.has(cat)) {
      sections.push({
        code: String.fromCharCode(74 + extraIdx++),
        name: cat,
        dot: '#1F6F6B',
        subtitle: 'Additional saved mixed paint formulas'
      });
    }
  });
  return sections;
}

function renderMixedCatalogCategoryTabsHtml() {
  const all = getColorLibraryMixedCatalogList();
  const sections = getMixedCatalogSectionsMeta(all);
  const allTab = `<button type="button" class="cl-cat-pill ${colorLibraryUiState.mixedCategory === 'All' ? 'active' : ''}" onclick="onMixedCatalogCategorySelect('All')">All Categories</button>`;
  const pills = sections.map(sec => {
    const active = colorLibraryUiState.mixedCategory === sec.name ? 'active' : '';
    return `<button type="button" class="cl-cat-pill ${active}" onclick="onMixedCatalogCategorySelect('${escapeAttr(sec.name)}')">
      <span class="cl-cat-dot" style="background:${sec.dot};"></span>
      <span>${sec.code}. ${escapeHtml(sec.name)}</span>
    </button>`;
  }).join('');
  return allTab + pills;
}

function renderMixedColorSwatchCardHtml(item) {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const formulaCopy = `${item.name} (${item.hex}): ${item.recipeText}`;
  return `
    <div class="cl-card">
      <div class="cl-swatch-banner" style="background-color:${escapeAttr(item.hex)};" onclick="openMixedColorDetailsModal(${item.index})" title="Click to view formula details">
        <span class="cl-hex-pill">${escapeHtml(item.hex)}</span>
        <span class="cl-type-label ${item.isCustom ? 'custom' : ''}">${item.isCustom ? 'Custom' : 'Built-in'}</span>
      </div>
      <div class="cl-card-body">
        <div class="cl-color-name" onclick="openMixedColorDetailsModal(${item.index})" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
        <div class="cl-meta-row">
          <span>${escapeHtml(item.category)}</span>
          <span class="cl-variation-tag">${item.recipe.length} Pigments</span>
        </div>
        <div class="cl-mixed-formula-list">
          ${item.recipe.map(r => {
    const hint = String(r.colorHint || r.name || '').toLowerCase().replace(/paint/i, '').trim();
    const dotHex = CL_PIGMENT_DOT_HEX[hint] || '#CBD5E1';
    const shortName = String(r.name || hint || 'Pigment').replace(/\s*Paint$/i, '').trim();
    return `<span class="cl-mixed-formula-pill" title="${escapeAttr(r.name || shortName)} (${Number(r.pct) || 0}%)">
              <span class="cl-mixed-dot" style="background:${dotHex};"></span>
              <strong>${Number(r.pct) || 0}%</strong> ${escapeHtml(shortName)}
            </span>`;
  }).join('')}
        </div>
      </div>
      <div class="cl-card-actions">
        <button type="button" class="cl-action-btn primary" onclick="openMixedColorDetailsModal(${item.index})">Details</button>
        <button type="button" class="cl-action-btn" onclick="copyColorLibraryHex('${escapeAttr(item.hex)}')">Copy HEX</button>
        ${isAdmin && item.isCustom && item.id ? `
          <button type="button" class="cl-action-btn" onclick="openMixedColorModal('${escapeAttr(item.id)}')" style="margin-left:auto;">Edit</button>
          <button type="button" class="cl-action-btn danger" onclick="confirmDeleteMixedColor('${escapeAttr(item.id)}')">Delete</button>
        ` : `
          <button type="button" class="cl-action-btn" onclick="copyColorLibraryFormula('${escapeAttr(formulaCopy)}')" style="margin-left:auto;" title="Copy exact pigment formula">Formula</button>
        `}
      </div>
    </div>
  `;
}

function renderMixedColorCatalogGridHtml() {
  const all = getColorLibraryMixedCatalogList();
  const filtered = getFilteredMixedCatalogItems();
  const catFilter = colorLibraryUiState.mixedCategory || 'All';
  const q = (colorLibraryUiState.mixedSearch || '').trim();
  const sectionsMeta = getMixedCatalogSectionsMeta(all).filter(s => catFilter === 'All' || s.name === catFilter);

  let totalRendered = 0;
  const sectionsHtml = sectionsMeta.map(sec => {
    const items = filtered.filter(item => item.category === sec.name);
    if (items.length === 0) return '';
    totalRendered += items.length;
    const isOpen = colorLibraryUiState.mixedExpandedSections.has(sec.name) || catFilter !== 'All' || Boolean(q);
    const limit = Number(colorLibraryUiState.mixedSectionLimits[sec.name]) || DEFAULT_SECTION_LIMIT;
    const visibleItems = items.slice(0, limit);
    const remainingCount = Math.max(0, items.length - visibleItems.length);

    return `
      <div class="cl-section ${isOpen ? 'open' : ''}">
        <button type="button" class="cl-section-header" onclick="toggleMixedColorSection('${escapeAttr(sec.name)}')">
          <div class="cl-section-title-wrap">
            <span class="cl-section-code">${sec.code}</span>
            <div>
              <div class="cl-section-title">${escapeHtml(sec.name)}</div>
              <div class="cl-section-sub">${escapeHtml(sec.subtitle)}</div>
            </div>
          </div>
          <div class="cl-section-right">
            <span class="cl-section-count">${items.length} ${items.length === 1 ? 'color' : 'colors'}</span>
            <span class="cl-section-chevron">${isOpen ? '▼' : '▶'}</span>
          </div>
        </button>

        ${isOpen ? `
          <div class="cl-section-body">
            <div class="cl-grid">
              ${visibleItems.map(item => renderMixedColorSwatchCardHtml(item)).join('')}
            </div>
            ${remainingCount > 0 ? `
              <div class="cl-load-more-bar">
                <span>Showing <b>${visibleItems.length}</b> of <b>${items.length}</b> mixed colors in ${escapeHtml(sec.name)}</span>
                <div class="row" style="gap:6px;">
                  <button type="button" class="btn secondary small" style="font-size:11.5px; padding:4px 10px;" onclick="loadMoreMixedColorSection('${escapeAttr(sec.name)}')">
                    Load ${Math.min(24, remainingCount)} More (${remainingCount} left)
                  </button>
                  <button type="button" class="btn ghost small" style="font-size:11.5px; padding:4px 8px;" onclick="showAllMixedColorSection('${escapeAttr(sec.name)}')">
                    Show All
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (totalRendered === 0) {
    return `
      <div class="empty-state" style="padding:44px 16px; text-align:center;">
        <div style="font-size:34px; margin-bottom:8px;">🧪</div>
        <strong style="font-size:15px;">No matching mixed colors found</strong>
        <div class="muted small" style="margin-top:4px; margin-bottom:14px;">
          Try clearing your search or selecting a different color category.
        </div>
        <button type="button" class="btn secondary small" onclick="resetMixedCatalogFilters()">Clear Filters</button>
      </div>
    `;
  }

  return sectionsHtml;
}

function renderMixedColorCatalogPanelHtml() {
  return `
    <div class="cl-toolbar">
      <div class="cl-search-box">
        <span class="cl-search-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input id="cl-mixed-search-input" type="search"
          placeholder="Search mixed color name, HEX (#FFFFD4), category, or pigment..."
          value="${escapeAttr(colorLibraryUiState.mixedSearch)}"
          oninput="onMixedCatalogSearch(this.value)">
      </div>
      <div class="cl-controls-right">
        <select id="cl-mixed-sort-select" class="cl-select-sm" onchange="onMixedCatalogSortChange(this.value)" title="Sort mixed colors">
          <option value="catalog_order" ${colorLibraryUiState.mixedSortBy === 'catalog_order' ? 'selected' : ''}>Sort: Catalog Order</option>
          <option value="name_asc" ${colorLibraryUiState.mixedSortBy === 'name_asc' ? 'selected' : ''}>Sort: A–Z</option>
          <option value="name_desc" ${colorLibraryUiState.mixedSortBy === 'name_desc' ? 'selected' : ''}>Sort: Z–A</option>
        </select>
        <div class="cl-collapse-group">
          <button type="button" class="cl-collapse-btn" onclick="expandAllMixedSections()" title="Expand all categories">Expand All</button>
          <button type="button" class="cl-collapse-btn" onclick="collapseAllMixedSections()" title="Collapse all categories">Collapse All</button>
        </div>
      </div>
    </div>

    <div class="cl-cat-tabs" id="cl-mixed-cat-tabs">
      ${renderMixedCatalogCategoryTabsHtml()}
    </div>

    <div id="cl-mixed-grid-container">
      ${renderMixedColorCatalogGridHtml()}
    </div>
  `;
}

function toggleMixedColorSection(catName) {
  if (colorLibraryUiState.mixedExpandedSections.has(catName)) {
    colorLibraryUiState.mixedExpandedSections.delete(catName);
  } else {
    colorLibraryUiState.mixedExpandedSections.add(catName);
  }
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function expandAllMixedSections() {
  const all = getColorLibraryMixedCatalogList();
  getMixedCatalogSectionsMeta(all).forEach(s => colorLibraryUiState.mixedExpandedSections.add(s.name));
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function collapseAllMixedSections() {
  colorLibraryUiState.mixedExpandedSections.clear();
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function loadMoreMixedColorSection(catName) {
  const cur = Number(colorLibraryUiState.mixedSectionLimits[catName]) || DEFAULT_SECTION_LIMIT;
  colorLibraryUiState.mixedSectionLimits[catName] = cur + 24;
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function showAllMixedColorSection(catName) {
  colorLibraryUiState.mixedSectionLimits[catName] = 99999;
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function openMixedColorDetailsModal(index) {
  const all = getColorLibraryMixedCatalogList();
  const item = all.find(x => x.index === Number(index));
  if (!item) return;
  const formulaCopy = `${item.name} (${item.hex}): ${item.recipeText}`;
  const body = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div style="height:124px; border-radius:11px; background:${escapeAttr(item.hex)}; border:1px solid rgba(0,0,0,0.1); position:relative; display:flex; align-items:flex-end; justify-content:space-between; padding:12px;">
        <span class="cl-hex-pill" style="font-size:13px; padding:4px 10px;">${escapeHtml(item.hex)}</span>
        <span class="cl-type-label custom" style="font-size:11px; padding:3px 10px;">${escapeHtml(item.category)} · Mixed Formula</span>
      </div>

      <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px;">
        <div style="padding:10px 12px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line);">
          <div class="muted small">Color Name</div>
          <div style="font-weight:700; color:var(--ink); margin-top:2px;">${escapeHtml(item.name)}</div>
        </div>
        <div style="padding:10px 12px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line);">
          <div class="muted small">HEX &amp; RGB</div>
          <div style="font-weight:700; color:var(--teal-dark); margin-top:2px; font-family:'Space Grotesk', monospace;">${escapeHtml(item.hex)}</div>
          <div class="muted" style="font-size:11px;">${escapeHtml(item.rgbLabel)}</div>
        </div>
        <div style="padding:10px 12px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line);">
          <div class="muted small">Category</div>
          <div style="font-weight:700; color:var(--ink); margin-top:2px;">${escapeHtml(item.category)}</div>
          <div class="muted" style="font-size:11px;">${item.recipe.length} base pigments (100%)</div>
        </div>
      </div>

      <div style="padding:12px 14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line);">
        <div style="font-size:12.5px; font-weight:700; color:var(--ink); margin-bottom:10px;">🧪 Exact Mixing Ratio (Read-Only Catalog Formula)</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${item.recipe.map(r => {
    const pct = Number(r.pct) || 0;
    const hint = String(r.colorHint || r.name || '').toLowerCase().replace(/paint/i, '').trim();
    const dotHex = CL_PIGMENT_DOT_HEX[hint] || '#CBD5E1';
    const label = r.name || (hint ? (hint.charAt(0).toUpperCase() + hint.slice(1) + ' Paint') : 'Pigment');
    return `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:8px; background:var(--surface); border:1px solid var(--line);">
                <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                  <span style="width:16px; height:16px; border-radius:5px; background:${dotHex}; border:1px solid rgba(0,0,0,0.2); flex-shrink:0;"></span>
                  <span style="font-weight:600; color:var(--ink); font-size:13px;">${escapeHtml(label)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
                  <div style="width:90px; height:6px; border-radius:999px; background:var(--surface-3); overflow:hidden;">
                    <div style="width:${Math.min(100, Math.max(2, pct))}%; height:100%; background:var(--teal, #1F6F6B); border-radius:999px;"></div>
                  </div>
                  <strong style="min-width:38px; text-align:right; color:var(--teal-dark); font-family:'Space Grotesk', monospace;">${pct}%</strong>
                </div>
              </div>
            `;
  }).join('')}
        </div>
      </div>
    </div>
  `;
  const footer = `
    <button type="button" class="btn secondary" onclick="copyColorLibraryHex('${escapeAttr(item.hex)}')">Copy HEX</button>
    <button type="button" class="btn secondary" onclick="copyColorLibraryFormula('${escapeAttr(formulaCopy)}')">Copy Formula</button>
    <button type="button" class="btn" onclick="closeModal()">Close</button>
  `;
  openModal(`🧪 ${escapeHtml(item.name)} — Mixed Formula Details`, body, footer, 'md');
}

function onColorLibraryTabSwitch(tab) {
  colorLibraryUiState.activeTab = tab === 'mixed' ? 'mixed' : 'library';
  const tabsWrap = document.getElementById('cl-mode-tabs');
  if (tabsWrap) {
    const btns = tabsWrap.querySelectorAll('.cl-mode-tab');
    btns.forEach((btn, i) => {
      const isActive = (i === 0 && colorLibraryUiState.activeTab === 'library') || (i === 1 && colorLibraryUiState.activeTab === 'mixed');
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }
  const body = document.getElementById('cl-panel-body');
  if (body) {
    body.innerHTML = colorLibraryUiState.activeTab === 'mixed'
      ? renderMixedColorCatalogPanelHtml()
      : renderBaseColorLibraryPanelHtml();
  }
}

let _clMixedSearchTimer = null;
function onMixedCatalogSearch(val) {
  colorLibraryUiState.mixedSearch = val;
  if (_clMixedSearchTimer) clearTimeout(_clMixedSearchTimer);
  _clMixedSearchTimer = setTimeout(() => {
    _clMixedSearchTimer = null;
    const grid = document.getElementById('cl-mixed-grid-container');
    if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
  }, 140);
}

function onMixedCatalogCategorySelect(cat) {
  colorLibraryUiState.mixedCategory = cat || 'All';
  if (cat && cat !== 'All') colorLibraryUiState.mixedExpandedSections.add(cat);
  const tabs = document.getElementById('cl-mixed-cat-tabs');
  if (tabs) tabs.innerHTML = renderMixedCatalogCategoryTabsHtml();
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function onMixedCatalogSortChange(val) {
  colorLibraryUiState.mixedSortBy = val || 'catalog_order';
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function resetMixedCatalogFilters() {
  colorLibraryUiState.mixedSearch = '';
  colorLibraryUiState.mixedCategory = 'All';
  const inp = document.getElementById('cl-mixed-search-input');
  if (inp) inp.value = '';
  const tabs = document.getElementById('cl-mixed-cat-tabs');
  if (tabs) tabs.innerHTML = renderMixedCatalogCategoryTabsHtml();
  const grid = document.getElementById('cl-mixed-grid-container');
  if (grid) grid.innerHTML = renderMixedColorCatalogGridHtml();
}

function copyColorLibraryFormula(formulaText) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(formulaText)
      .then(() => showToast('Copied mixing formula to clipboard', 'success'))
      .catch(() => showToast(formulaText, 'info'));
  } else {
    showToast(formulaText, 'info');
  }
}

/* ============================================================
   ADMIN ADD / EDIT / DELETE MIXED COLOR FORMULA MODAL
   ============================================================ */
const CL_BASE_PIGMENT_OPTIONS = [
  { hint: 'white', name: 'White Paint', hex: '#FFFFFF' },
  { hint: 'yellow', name: 'Yellow Paint', hex: '#FFFF00' },
  { hint: 'red', name: 'Red Paint', hex: '#FF0000' },
  { hint: 'blue', name: 'Blue Paint', hex: '#0000FF' },
  { hint: 'green', name: 'Green Paint', hex: '#008000' },
  { hint: 'orange', name: 'Orange Paint', hex: '#FF7F00' },
  { hint: 'purple', name: 'Purple Paint', hex: '#800080' },
  { hint: 'brown', name: 'Brown Paint', hex: '#8B4513' },
  { hint: 'black', name: 'Black Paint', hex: '#000000' },
  { hint: 'pink', name: 'Pink Paint', hex: '#FFC0CB' },
  { hint: 'gray', name: 'Gray Paint', hex: '#808080' }
];

let clMixedModalState = {
  editId: null,
  customHex: null,
  rows: []
};

function computeMixedModalPreview(rows) {
  if (clMixedModalState.customHex) {
    const hex = normalizeHexCode(clMixedModalState.customHex) || '#FFFFFF';
    const rgb = hexToRgbObj(hex) || { r: 255, g: 255, b: 255 };
    return { hex, rgb, rgbLabel: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, isManual: true };
  }
  const validRows = (rows || []).filter(r => r && Number(r.pct) > 0);
  if (validRows.length >= 1 && typeof subtractivePaintMix === 'function') {
    const res = subtractivePaintMix(validRows.map(r => {
      const opt = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === r.hint) || CL_BASE_PIGMENT_OPTIONS[0];
      return { hex: opt.hex, pct: Number(r.pct) || 0 };
    }));
    const hex = normalizeHexCode(res.hex) || '#FFFFFF';
    const rgb = hexToRgbObj(hex) || { r: 255, g: 255, b: 255 };
    return { hex, rgb, rgbLabel: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, isManual: false };
  }
  return { hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 }, rgbLabel: 'rgb(255, 255, 255)', isManual: false };
}

function renderMixedModalRatioBarHtml(rows) {
  const valid = (rows || []).filter(r => r && Number(r.pct) > 0);
  if (!valid.length) return '';
  return valid.map(r => {
    const opt = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === r.hint) || CL_BASE_PIGMENT_OPTIONS[0];
    const w = Math.max(0, Math.min(100, Number(r.pct) || 0));
    return `<div class="cl-mixed-ratio-seg" style="width:${w}%; background:${opt.hex};" title="${escapeAttr(opt.name)}: ${w}%"></div>`;
  }).join('');
}

function renderMixedColorModalRowsHtml() {
  return clMixedModalState.rows.map((row, idx) => {
    const opt = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === row.hint) || CL_BASE_PIGMENT_OPTIONS[0];
    return `
      <div class="cl-mixed-row">
        <span class="cl-mixed-row-swatch" style="background:${opt.hex};" title="${escapeAttr(opt.name)}"></span>
        <select class="cl-mixed-row-select" onchange="onMixedModalRowPigmentChange(${idx}, this.value)">
          ${CL_BASE_PIGMENT_OPTIONS.map(o => `<option value="${o.hint}" ${o.hint === row.hint ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
        </select>
        <div class="cl-mixed-pct-group">
          <input class="cl-mixed-pct-input" type="number" min="1" max="99" step="1" value="${Number(row.pct) || 0}"
            oninput="onMixedModalRowPctChange(${idx}, this.value)" aria-label="Pigment percentage">
          <span class="cl-mixed-pct-suffix">%</span>
        </div>
        <button type="button" class="cl-mixed-row-remove" onclick="removeMixedColorModalRow(${idx})"
          ${clMixedModalState.rows.length <= 2 ? 'disabled' : ''}
          title="Remove pigment">✕</button>
      </div>
    `;
  }).join('');
}

function openMixedColorModal(editId = null) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Admin access required to add or edit mixed colors.', 'error');
    return;
  }

  let existing = null;
  if (editId) {
    const all = getColorLibraryMixedCatalogList();
    existing = all.find(x => x.id && String(x.id) === String(editId)) || null;
  }

  clMixedModalState.editId = existing ? existing.id : null;
  clMixedModalState.customHex = null;
  clMixedModalState.rows = existing && Array.isArray(existing.recipe) && existing.recipe.length >= 2
    ? existing.recipe.map(r => {
      const hint = String(r.colorHint || r.colorName || r.name || 'white').toLowerCase().replace(/paint/i, '').trim();
      const match = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === hint)
        || CL_BASE_PIGMENT_OPTIONS.find(o => new RegExp(`\\b${o.hint}\\b`, 'i').test(hint))
        || CL_BASE_PIGMENT_OPTIONS.find(o => hint.includes(o.hint))
        || CL_BASE_PIGMENT_OPTIONS[0];
      return { hint: match.hint, pct: Number(r.pct) || 0 };
    })
    : [
      { hint: 'white', pct: 80 },
      { hint: 'yellow', pct: 20 }
    ];

  const autoPreview = computeMixedModalPreview(clMixedModalState.rows);
  if (existing && existing.hex && normalizeHexCode(existing.hex) && normalizeHexCode(existing.hex) !== autoPreview.hex) {
    clMixedModalState.customHex = normalizeHexCode(existing.hex);
  }
  const initPreview = computeMixedModalPreview(clMixedModalState.rows);
  const initCat = (existing && existing.category) || 'Yellow';
  const totalPct = clMixedModalState.rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const isBalanced = Math.abs(totalPct - 100) < 0.05;
  const diffPct = Math.round((100 - totalPct) * 10) / 10;

  const body = `
    <div class="cl-mixed-modal">
      <div class="cl-mixed-hero">
        <div id="cl-mixed-modal-preview" class="cl-mixed-hero-swatch" style="background:${initPreview.hex};">
          <span id="cl-mixed-hero-tag" class="cl-mixed-hero-tag">${initPreview.isManual ? 'Custom HEX Preview' : 'Live Formula Preview'}</span>
          <span id="cl-mixed-modal-hex-pill" class="cl-hex-pill" style="font-size:13px; padding:4px 10px;">${initPreview.hex}</span>
          <span id="cl-mixed-modal-rgb-pill" class="cl-type-label" style="font-size:11px;">${initPreview.rgbLabel}</span>
        </div>
        <div id="cl-mixed-modal-ratio-bar" class="cl-mixed-ratio-bar">
          ${renderMixedModalRatioBarHtml(clMixedModalState.rows)}
        </div>
      </div>

      <div class="cl-mixed-form-grid">
        <div class="field" style="margin:0;">
          <label for="cl-mixed-name">Mixed Color Name <span style="color:var(--danger);">*</span></label>
          <input id="cl-mixed-name" type="text" placeholder="e.g. Warm Honey Cream" value="${escapeAttr(existing ? existing.name : '')}" maxlength="60">
        </div>
        <div class="field" style="margin:0;">
          <label for="cl-mixed-category">Category <span style="color:var(--danger);">*</span></label>
          <select id="cl-mixed-category">
            ${CL_MIXED_CATEGORIES_META.map(c => `<option value="${escapeAttr(c.name)}" ${c.name === initCat ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field" style="margin:0;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px;">
          <label for="cl-mixed-hex-input" style="margin:0;">HEX Code <span style="color:var(--danger);">*</span></label>
          <button type="button" id="cl-mixed-hex-auto-btn" class="cl-mixed-pill-btn" style="padding:2px 8px; font-size:11px; ${initPreview.isManual ? '' : 'display:none;'}" onclick="resetMixedModalHexToAuto()" title="Use the exact mixed pigment HEX instead of custom target HEX">↺ Use Mixed HEX</button>
        </div>
        <div class="cl-mixed-hex-group">
          <input id="cl-mixed-hex-input" class="cl-mixed-hex-input" type="text" value="${initPreview.hex}" placeholder="#1F6F6B" maxlength="7" oninput="onMixedModalHexTextInput(this.value)">
          <input id="cl-mixed-hex-picker" class="cl-mixed-color-picker" type="color" value="${initPreview.hex}" oninput="onMixedModalHexPickerInput(this.value)" title="Pick target color">
        </div>
      </div>

      <div class="cl-mixed-pigments-box">
        <div class="cl-mixed-pigments-head">
          <div class="cl-mixed-pigments-title">
            <span>🧪 Base Pigments &amp; Ratio</span>
          </div>
          <div class="cl-mixed-pigments-actions">
            <button type="button" class="cl-mixed-pill-btn" onclick="autoBalanceMixedColorModal()" title="Scale pigments proportionally to 100%">⚖️ Auto-Balance</button>
            <button type="button" class="cl-mixed-pill-btn accent" onclick="addMixedColorModalRow()">+ Add Pigment</button>
          </div>
        </div>

        <div id="cl-mixed-modal-rows" class="cl-mixed-rows">
          ${renderMixedColorModalRowsHtml()}
        </div>

        <div class="cl-mixed-total-row">
          <span id="cl-mixed-balance-hint">
            ${isBalanced ? '✓ Formula ratio is balanced at 100%' : (diffPct > 0 ? `Add ${diffPct}% more to reach 100%` : `Reduce by ${Math.abs(diffPct)}% to reach 100%`)}
          </span>
          <span id="cl-mixed-total-badge" class="badge ${isBalanced ? 'ok' : 'low'}" style="font-size:11px; padding:3px 9px;">
            Total: ${totalPct}%
          </span>
        </div>
      </div>

      <div class="cl-approx-note">
        <span style="flex-shrink:0;">ℹ️</span>
        <span><strong>Reference Note:</strong> Digital color preview and auto-matched pigment ratios are approximations only. Actual physical paint results may vary depending on brand, base type, and tinting strength.</span>
      </div>

      <div class="field" style="margin:0;">
        <label for="cl-mixed-notes">Notes (Optional)</label>
        <input id="cl-mixed-notes" type="text" placeholder="e.g. Customer favorite warm interior shade" value="${escapeAttr(existing ? existing.notes : '')}" maxlength="160">
      </div>
    </div>
  `;

  const footer = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" id="cl-mixed-save-btn" class="btn" onclick="submitMixedColorModal()">
      ${existing ? 'Save Changes' : '+ Save Mixed Color'}
    </button>
  `;

  openModal(existing ? `Edit Mixed Color — ${escapeHtml(existing.name)}` : '🧪 Add Mixed Color to Catalog', body, footer, 'md');
}

function refreshMixedColorModalPreview(skipTextInputSync = false) {
  const prev = computeMixedModalPreview(clMixedModalState.rows);
  const banner = document.getElementById('cl-mixed-modal-preview');
  if (banner) banner.style.backgroundColor = prev.hex;
  const tagEl = document.getElementById('cl-mixed-hero-tag');
  if (tagEl) tagEl.textContent = prev.isManual ? 'Custom HEX Preview' : 'Live Formula Preview';
  const hexEl = document.getElementById('cl-mixed-modal-hex-pill');
  if (hexEl) hexEl.textContent = prev.hex;
  const rgbEl = document.getElementById('cl-mixed-modal-rgb-pill');
  if (rgbEl) rgbEl.textContent = prev.rgbLabel;
  const pickerEl = document.getElementById('cl-mixed-hex-picker');
  if (pickerEl) pickerEl.value = prev.hex;
  const textEl = document.getElementById('cl-mixed-hex-input');
  if (textEl && !skipTextInputSync) textEl.value = prev.hex;
  const autoBtn = document.getElementById('cl-mixed-hex-auto-btn');
  if (autoBtn) autoBtn.style.display = prev.isManual ? '' : 'none';
  const barEl = document.getElementById('cl-mixed-modal-ratio-bar');
  if (barEl) barEl.innerHTML = renderMixedModalRatioBarHtml(clMixedModalState.rows);

  const totalPct = Math.round(clMixedModalState.rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) * 10) / 10;
  const isBalanced = Math.abs(totalPct - 100) < 0.05;
  const diffPct = Math.round((100 - totalPct) * 10) / 10;
  const badge = document.getElementById('cl-mixed-total-badge');
  if (badge) {
    badge.textContent = `Total: ${totalPct}%`;
    badge.className = `badge ${isBalanced ? 'ok' : 'low'}`;
  }
  const hint = document.getElementById('cl-mixed-balance-hint');
  if (hint) {
    hint.textContent = isBalanced
      ? '✓ Formula ratio is balanced at 100%'
      : (diffPct > 0 ? `Add ${diffPct}% more to reach 100%` : `Reduce by ${Math.abs(diffPct)}% to reach 100%`);
  }
}

function solveBasePigmentsForTargetHex(targetHex) {
  const norm = normalizeHexCode(targetHex);
  if (!norm || typeof subtractivePaintMix !== 'function') return null;
  const targetRgb = hexToRgbObj(norm);
  if (!targetRgb) return null;

  const distFn = (rgbA, rgbB) => {
    if (typeof perceptualLabDistance === 'function') {
      return perceptualLabDistance(rgbA, rgbB);
    }
    const dr = rgbA.r - rgbB.r;
    const dg = rgbA.g - rgbB.g;
    const db = rgbA.b - rgbB.b;
    return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
  };

  const opts = CL_BASE_PIGMENT_OPTIONS;
  const n = opts.length;

  // 1. Coarse 2-pigment search (5% steps across all pairs)
  const topPairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let bestP = 50;
      let bestD = Infinity;
      for (let p = 5; p <= 95; p += 5) {
        const mix = subtractivePaintMix([
          { hex: opts[i].hex, pct: p },
          { hex: opts[j].hex, pct: 100 - p }
        ]);
        const d = distFn(targetRgb, mix);
        if (d < bestD) {
          bestD = d;
          bestP = p;
        }
      }
      topPairs.push({ i, j, p: bestP, d: bestD });
    }
  }
  topPairs.sort((a, b) => a.d - b.d);

  // 2. Fine 1% refinement on top 4 pairs
  let best2 = { rows: [{ hint: opts[0].hint, pct: 80 }, { hint: opts[1].hint, pct: 20 }], d: Infinity, hex: norm };
  topPairs.slice(0, 4).forEach(cand => {
    const lo = Math.max(1, cand.p - 4);
    const hi = Math.min(99, cand.p + 4);
    for (let p = lo; p <= hi; p++) {
      const mix = subtractivePaintMix([
        { hex: opts[cand.i].hex, pct: p },
        { hex: opts[cand.j].hex, pct: 100 - p }
      ]);
      const d = distFn(targetRgb, mix);
      if (d < best2.d) {
        best2 = {
          rows: [
            { hint: opts[cand.i].hint, pct: p },
            { hint: opts[cand.j].hint, pct: 100 - p }
          ],
          i: cand.i,
          j: cand.j,
          p,
          d,
          hex: normalizeHexCode(mix.hex) || norm
        };
      }
    }
  });

  // 3. Optional 3-pigment refinement around top 2 pairs (only keep if meaningfully closer)
  let best3 = { d: Infinity, rows: null, hex: norm };
  if (best2.d > 2.5) {
    topPairs.slice(0, 2).forEach(pair => {
      for (let k = 0; k < n; k++) {
        if (k === pair.i || k === pair.j) continue;
        let localBest = { d: Infinity, pA: 0, pB: 0, pC: 0, hex: norm };
        for (let pC = 5; pC <= 45; pC += 5) {
          const rem = 100 - pC;
          for (let frac = 10; frac <= 90; frac += 10) {
            const pA = Math.max(1, Math.round((rem * frac) / 100));
            const pB = rem - pA;
            if (pB < 1) continue;
            const mix = subtractivePaintMix([
              { hex: opts[pair.i].hex, pct: pA },
              { hex: opts[pair.j].hex, pct: pB },
              { hex: opts[k].hex, pct: pC }
            ]);
            const d = distFn(targetRgb, mix);
            if (d < localBest.d) {
              localBest = { d, pA, pB, pC, hex: normalizeHexCode(mix.hex) || norm };
            }
          }
        }
        if (localBest.d < best3.d) {
          best3 = {
            d: localBest.d,
            hex: localBest.hex,
            rows: [
              { hint: opts[pair.i].hint, pct: localBest.pA },
              { hint: opts[pair.j].hint, pct: localBest.pB },
              { hint: opts[k].hint, pct: localBest.pC }
            ]
          };
        }
      }
    });
  }

  const chosen = (best3.rows && best3.d + 1.5 < best2.d) ? best3 : best2;
  chosen.rows.sort((a, b) => b.pct - a.pct);

  // Determine suggested category
  let suggestedCategory = null;
  if (typeof detectDictionaryColorOnly === 'function') {
    const det = detectDictionaryColorOnly(targetRgb.r, targetRgb.g, targetRgb.b);
    if (det && det.family && CL_MIXED_CATEGORIES_META.some(c => c.name === det.family)) {
      suggestedCategory = det.family;
    }
  }
  const similarityPct = Math.max(0, Math.min(100, Math.round(100 - chosen.d * 1.4)));
  return {
    rows: chosen.rows,
    mixedHex: chosen.hex,
    deltaE: Number(chosen.d.toFixed(1)),
    similarityPct,
    suggestedCategory
  };
}

function applyHexAutoMatchToMixedModal(hex, skipTextInputSync = false) {
  const norm = normalizeHexCode(hex);
  if (!norm) return;
  clMixedModalState.customHex = norm;
  const solved = solveBasePigmentsForTargetHex(norm);
  if (solved && Array.isArray(solved.rows) && solved.rows.length >= 2) {
    clMixedModalState.rows = solved.rows;
    const rowsEl = document.getElementById('cl-mixed-modal-rows');
    if (rowsEl) rowsEl.innerHTML = renderMixedColorModalRowsHtml();
    if (solved.suggestedCategory) {
      const catEl = document.getElementById('cl-mixed-category');
      if (catEl) catEl.value = solved.suggestedCategory;
    }
  }
  refreshMixedColorModalPreview(skipTextInputSync);
  if (solved) {
    const hint = document.getElementById('cl-mixed-balance-hint');
    if (hint) {
      hint.textContent = `✨ Auto-matched base pigments (${solved.similarityPct}% visual match)`;
    }
  }
}

function onMixedModalHexPickerInput(val) {
  const norm = normalizeHexCode(val);
  if (!norm) return;
  applyHexAutoMatchToMixedModal(norm, false);
}

function onMixedModalHexTextInput(val) {
  const trimmed = String(val || '').trim();
  if (!trimmed) {
    clMixedModalState.customHex = null;
    refreshMixedColorModalPreview(true);
    return;
  }
  const norm = normalizeHexCode(trimmed);
  if (norm) {
    applyHexAutoMatchToMixedModal(norm, true);
  }
}

function resetMixedModalHexToAuto() {
  clMixedModalState.customHex = null;
  refreshMixedColorModalPreview(false);
}

function onMixedModalRowPigmentChange(idx, hint) {
  if (!clMixedModalState.rows[idx]) return;
  clMixedModalState.rows[idx].hint = hint;
  clMixedModalState.customHex = null;
  const rowsEl = document.getElementById('cl-mixed-modal-rows');
  if (rowsEl) rowsEl.innerHTML = renderMixedColorModalRowsHtml();
  refreshMixedColorModalPreview(false);
}

function onMixedModalRowPctChange(idx, val) {
  if (!clMixedModalState.rows[idx]) return;
  clMixedModalState.rows[idx].pct = Math.max(0, Math.min(100, Number(val) || 0));
  clMixedModalState.customHex = null;
  refreshMixedColorModalPreview(false);
}

function addMixedColorModalRow() {
  if (clMixedModalState.rows.length >= 4) {
    showToast('Maximum of 4 base pigments per mixed color formula.', 'info');
    return;
  }
  const used = new Set(clMixedModalState.rows.map(r => r.hint));
  const next = CL_BASE_PIGMENT_OPTIONS.find(o => !used.has(o.hint)) || CL_BASE_PIGMENT_OPTIONS[0];
  clMixedModalState.rows.push({ hint: next.hint, pct: 0 });
  const rowsEl = document.getElementById('cl-mixed-modal-rows');
  if (rowsEl) rowsEl.innerHTML = renderMixedColorModalRowsHtml();
  refreshMixedColorModalPreview();
}

function removeMixedColorModalRow(idx) {
  if (clMixedModalState.rows.length <= 2) return;
  clMixedModalState.rows.splice(idx, 1);
  const rowsEl = document.getElementById('cl-mixed-modal-rows');
  if (rowsEl) rowsEl.innerHTML = renderMixedColorModalRowsHtml();
  refreshMixedColorModalPreview();
}

function autoBalanceMixedColorModal() {
  const n = clMixedModalState.rows.length;
  if (n < 2) return;
  const sum = clMixedModalState.rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  if (sum <= 0) {
    const base = Math.floor(100 / n);
    let rem = 100 - base * n;
    clMixedModalState.rows.forEach((r, i) => {
      r.pct = base + (i === 0 ? rem : 0);
    });
  } else {
    let running = 0;
    clMixedModalState.rows.forEach((r, i) => {
      if (i === n - 1) {
        r.pct = Math.max(1, 100 - running);
      } else {
        const scaled = Math.max(1, Math.round(((Number(r.pct) || 0) / sum) * 100));
        r.pct = scaled;
        running += scaled;
      }
    });
  }
  const rowsEl = document.getElementById('cl-mixed-modal-rows');
  if (rowsEl) rowsEl.innerHTML = renderMixedColorModalRowsHtml();
  refreshMixedColorModalPreview();
}

function refreshColorLibraryAfterMixedChange() {
  if (typeof syncActiveColorRecipePresets === 'function') syncActiveColorRecipePresets();
  if (typeof _cmRecipeEvalCache !== 'undefined' && _cmRecipeEvalCache && typeof _cmRecipeEvalCache.clear === 'function') {
    _cmRecipeEvalCache.clear();
  }
  colorLibraryUiState.activeTab = 'mixed';
  if (typeof renderPage === 'function' && currentPage === 'colorLibrary') {
    renderPage();
  } else {
    onColorLibraryTabSwitch('mixed');
  }
}

let _clSavingMixedColor = false;
async function submitMixedColorModal() {
  if (_clSavingMixedColor) return;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Admin access required to add or edit mixed colors.', 'error');
    return;
  }
  const nameEl = document.getElementById('cl-mixed-name');
  const catEl = document.getElementById('cl-mixed-category');
  const notesEl = document.getElementById('cl-mixed-notes');
  const saveBtn = document.getElementById('cl-mixed-save-btn');
  const isEditing = Boolean(clMixedModalState.editId);

  const name = (nameEl ? nameEl.value : '').trim();
  const category = (catEl ? catEl.value : 'Yellow') || 'Yellow';
  const notes = (notesEl ? notesEl.value : '').trim();

  if (!name) {
    showToast('Please enter a mixed color name.', 'error');
    if (nameEl) nameEl.focus();
    return;
  }

  const rows = clMixedModalState.rows.filter(r => r && Number(r.pct) > 0);
  if (rows.length < 2) {
    showToast('At least 2 base pigments with > 0% are required.', 'error');
    return;
  }
  const uniqueHints = new Set(rows.map(r => r.hint));
  if (uniqueHints.size !== rows.length) {
    showToast('Please select different base pigments (no duplicates).', 'error');
    return;
  }
  const totalPct = Math.round(rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) * 10) / 10;
  if (Math.abs(totalPct - 100) >= 0.05) {
    showToast(`Pigment percentages must total 100% (currently ${totalPct}%). Click Auto-Balance.`, 'error');
    return;
  }

  // Prevent overwriting a built-in catalog color name
  if (typeof DEFAULT_COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(DEFAULT_COLOR_RECIPE_PRESETS)) {
    const builtInDup = DEFAULT_COLOR_RECIPE_PRESETS.find(p =>
      String(p.name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase() === name.toLowerCase()
    );
    if (builtInDup) {
      showToast(`"${name}" already exists in the built-in Mixed Color Catalog.`, 'error');
      return;
    }
  }

  // Prevent exact-duplicate custom formula (same name + same pigments & percentages),
  // while still allowing formulas with the same display name and genuinely different ingredients/percentages.
  const existingCustomList = (typeof db !== 'undefined' && db && Array.isArray(db.colorFormulas)) ? db.colorFormulas : [];
  if (!clMixedModalState.editId && typeof buildClientFormulaSignature === 'function') {
    const candidatePigments = rows.map(r => {
      const opt = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === r.hint) || CL_BASE_PIGMENT_OPTIONS[0];
      return { name: opt.name, colorHint: opt.hint, pct: Number(r.pct) || 0 };
    });
    const incomingSig = buildClientFormulaSignature(name, 'Pigment / Colorant', candidatePigments);
    const exactDup = existingCustomList.find(f =>
      buildClientFormulaSignature(f.name, f.baseType || '', f.pigmentFormula || []) === incomingSig
    );
    if (exactDup) {
      showToast(`An identical mixed color formula for "${exactDup.name}" already exists.`, 'info');
      return;
    }
  }

  const hexInputEl = document.getElementById('cl-mixed-hex-input');
  const rawHexInput = hexInputEl ? hexInputEl.value.trim() : '';
  if (rawHexInput && !normalizeHexCode(rawHexInput)) {
    showToast('Please enter a valid 6-digit HEX code (e.g. #E8C39E).', 'error');
    if (hexInputEl) hexInputEl.focus();
    return;
  }
  if (rawHexInput) {
    clMixedModalState.customHex = normalizeHexCode(rawHexInput);
  }

  const preview = computeMixedModalPreview(rows);
  const pigmentFormula = rows.map(r => {
    const opt = CL_BASE_PIGMENT_OPTIONS.find(o => o.hint === r.hint) || CL_BASE_PIGMENT_OPTIONS[0];
    return {
      name: opt.name,
      colorHint: opt.hint,
      hex: opt.hex,
      pct: Number(r.pct) || 0
    };
  });

  _clSavingMixedColor = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  const payload = {
    id: clMixedModalState.editId || '',
    name,
    hexReference: preview.hex,
    detectedName: name,
    baseType: 'Pigment / Colorant',
    sheen: `cat:${category}`,
    notes,
    pigmentFormula
  };

  try {
    const resp = await fetch('api/db.php?action=color_formula_save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || !data.success) {
      showToast((data && data.error) || `Failed to save mixed color (HTTP ${resp.status}).`, 'error');
      return;
    }
    if (Array.isArray(data.colorFormulas) && typeof db !== 'undefined' && db) {
      db.colorFormulas = data.colorFormulas;
      if (typeof syncCustomPresetsLocalCacheFromDb === 'function') syncCustomPresetsLocalCacheFromDb();
      if (typeof storage !== 'undefined' && storage.set) storage.set(DB_KEY, JSON.stringify(db));
      if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
    }
    colorLibraryUiState.mixedExpandedSections.add(category);
    closeModal();
    refreshColorLibraryAfterMixedChange();
    showToast(
      isEditing
        ? `Updated mixed color "${name}" (${preview.hex}).`
        : `Saved mixed color "${name}" (${preview.hex}) — now available in Color Library & POS!`,
      'success'
    );
  } catch (err) {
    showToast('Could not connect to server to save mixed color.', 'error');
  } finally {
    _clSavingMixedColor = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = isEditing ? 'Save Changes' : '+ Save Mixed Color';
    }
  }
}

function confirmDeleteMixedColor(formulaId) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const all = getColorLibraryMixedCatalogList();
  const item = all.find(x => x.id && String(x.id) === String(formulaId));
  if (!item) return;

  openModal(
    'Delete Custom Mixed Color',
    `<div style="display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line);">
        <span style="width:42px; height:42px; border-radius:8px; background:${escapeAttr(item.hex)}; border:1px solid rgba(0,0,0,0.15); flex-shrink:0;"></span>
        <div>
          <div style="font-weight:700; color:var(--ink);">${escapeHtml(item.name)}</div>
          <div class="muted small">${escapeHtml(item.hex)} · ${escapeHtml(item.recipeText)}</div>
        </div>
      </div>
      <div class="small" style="color:var(--ink-soft);">Are you sure you want to remove this custom mixed color from the Color Library and POS Mixed Color Catalog?</div>
    </div>`,
    `<button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
     <button type="button" id="cl-mixed-del-btn" class="btn danger" onclick="deleteCustomMixedColor('${escapeAttr(formulaId)}')">Delete Mixed Color</button>`,
    'sm'
  );
}

let _clDeletingMixedColor = false;
async function deleteCustomMixedColor(formulaId) {
  if (_clDeletingMixedColor) return;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Admin access required to delete mixed colors.', 'error');
    return;
  }
  const delBtn = document.getElementById('cl-mixed-del-btn');
  _clDeletingMixedColor = true;
  if (delBtn) {
    delBtn.disabled = true;
    delBtn.textContent = 'Deleting...';
  }
  try {
    const resp = await fetch('api/db.php?action=color_formula_delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: formulaId })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || !data.success) {
      showToast((data && data.error) || `Failed to delete custom mixed color (HTTP ${resp.status}).`, 'error');
      return;
    }
    if (Array.isArray(data.colorFormulas) && typeof db !== 'undefined' && db) {
      db.colorFormulas = data.colorFormulas;
      if (typeof syncCustomPresetsLocalCacheFromDb === 'function') syncCustomPresetsLocalCacheFromDb();
      if (typeof storage !== 'undefined' && storage.set) storage.set(DB_KEY, JSON.stringify(db));
      if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
    }
    closeModal();
    refreshColorLibraryAfterMixedChange();
    showToast('Custom mixed color deleted.', 'success');
  } catch (e) {
    showToast('Could not connect to server to delete custom mixed color.', 'error');
  } finally {
    _clDeletingMixedColor = false;
    if (delBtn) {
      delBtn.disabled = false;
      delBtn.textContent = 'Delete Mixed Color';
    }
  }
}

function renderColorFamilyFilterOptionsHtml() {
  const colors = getColorLibraryList();
  const cls = colorLibraryUiState.classification;
  const relevant = cls === 'All' ? colors : colors.filter(c => c.classification === cls);
  const families = Array.from(new Set(relevant.map(c => c.colorFamily).filter(Boolean))).sort();
  return `
    <option value="All" ${colorLibraryUiState.family === 'All' ? 'selected' : ''}>All Color Families</option>
    ${families.map(f => `<option value="${escapeAttr(f)}" ${colorLibraryUiState.family === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
  `;
}

function renderColorClassificationTabsHtml() {
  const allTab = `<button type="button" class="cl-cat-pill ${colorLibraryUiState.classification === 'All' ? 'active' : ''}" onclick="onColorClassificationSelect('All')">All Classifications</button>`;
  const tabs = COLOR_CLASSIFICATIONS.map(cls => {
    const active = colorLibraryUiState.classification === cls.name ? 'active' : '';
    return `<button type="button" class="cl-cat-pill ${active}" onclick="onColorClassificationSelect('${escapeAttr(cls.name)}')">
      <span class="cl-cat-dot" style="background:${cls.dot};"></span>
      <span>${cls.code}. ${escapeHtml(cls.name)}</span>
    </button>`;
  }).join('');
  return allTab + tabs;
}

function getFilteredColorLibraryItems() {
  const colors = getColorLibraryList();
  const q = (colorLibraryUiState.search || '').trim().toLowerCase();
  const clsFilter = colorLibraryUiState.classification || 'All';
  const famFilter = colorLibraryUiState.family || 'All';
  const varFilter = colorLibraryUiState.variation || 'All';
  const sortBy = colorLibraryUiState.sortBy || 'name_asc';

  const filtered = colors.filter(c => {
    if (clsFilter !== 'All' && c.classification !== clsFilter) return false;
    if (famFilter !== 'All' && c.colorFamily !== famFilter) return false;
    if (varFilter !== 'All' && c.variation !== varFilter) return false;
    if (q) {
      const typeWord = c.isCustom ? 'custom' : 'built-in builtin';
      const hay = `${c.name} ${c.hex} ${c.classification} ${c.colorFamily} ${c.variation} ${typeWord} ${c.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sortBy === 'name_asc') {
    filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else if (sortBy === 'recent_added') {
    filtered.sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      const ta = Date.parse(String(a.createdAt || '').replace(' ', 'T')) || 0;
      const tb = Date.parse(String(b.createdAt || '').replace(' ', 'T')) || 0;
      return tb - ta || String(a.name).localeCompare(String(b.name));
    });
  } else if (sortBy === 'recent_updated') {
    filtered.sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      const ta = Date.parse(String(a.updatedAt || a.createdAt || '').replace(' ', 'T')) || 0;
      const tb = Date.parse(String(b.updatedAt || b.createdAt || '').replace(' ', 'T')) || 0;
      return tb - ta || String(a.name).localeCompare(String(b.name));
    });
  }
  return filtered;
}

function renderColorLibrarySectionsHtml() {
  const filtered = getFilteredColorLibraryItems();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const q = (colorLibraryUiState.search || '').trim().toLowerCase();
  const clsFilter = colorLibraryUiState.classification || 'All';

  const sectionsToShow = COLOR_CLASSIFICATIONS.filter(cls => clsFilter === 'All' || cls.name === clsFilter);
  let totalRendered = 0;

  const sectionsHtml = sectionsToShow.map(cls => {
    const items = filtered.filter(c => c.classification === cls.name);
    if (items.length === 0) {
      return '';
    }
    totalRendered += items.length;
    const isOpen = colorLibraryUiState.expandedSections.has(cls.name) || clsFilter !== 'All' || Boolean(q);
    const badgeCount = items.length;
    const limit = Number(colorLibraryUiState.sectionLimits[cls.name]) || DEFAULT_SECTION_LIMIT;
    const visibleItems = items.slice(0, limit);
    const remainingCount = Math.max(0, items.length - visibleItems.length);

    return `
      <div class="cl-section ${isOpen ? 'open' : ''}">
        <button type="button" class="cl-section-header" onclick="toggleColorSection('${escapeAttr(cls.name)}')">
          <div class="cl-section-title-wrap">
            <span class="cl-section-code">${cls.code}</span>
            <div>
              <div class="cl-section-title">${escapeHtml(cls.name)}</div>
              <div class="cl-section-sub">${escapeHtml(cls.subtitle)}</div>
            </div>
          </div>
          <div class="cl-section-right">
            <span class="cl-section-count">${badgeCount} ${badgeCount === 1 ? 'color' : 'colors'}</span>
            <span class="cl-section-chevron">${isOpen ? '▼' : '▶'}</span>
          </div>
        </button>

        ${isOpen ? `
          <div class="cl-section-body">
            <div class="cl-grid">
              ${visibleItems.map(c => renderColorSwatchCardHtml(c, isAdmin)).join('')}
            </div>
            ${remainingCount > 0 ? `
              <div class="cl-load-more-bar">
                <span>Showing <b>${visibleItems.length}</b> of <b>${items.length}</b> colors in ${escapeHtml(cls.name)}</span>
                <div class="row" style="gap:6px;">
                  <button type="button" class="btn secondary small" style="font-size:11.5px; padding:4px 10px;" onclick="loadMoreColorSection('${escapeAttr(cls.name)}')">
                    Load ${Math.min(24, remainingCount)} More (${remainingCount} left)
                  </button>
                  <button type="button" class="btn ghost small" style="font-size:11.5px; padding:4px 8px;" onclick="showAllColorSection('${escapeAttr(cls.name)}')">
                    Show All
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (totalRendered === 0) {
    return `
      <div class="empty-state" style="padding:44px 16px; text-align:center;">
        <div style="font-size:34px; margin-bottom:8px;">🎨</div>
        <strong style="font-size:15px;">No matching colors found</strong>
        <div class="muted small" style="margin-top:4px; margin-bottom:14px;">
          Try clearing your search or selecting a different classification, family, or variation.
        </div>
        <button type="button" class="btn secondary small" onclick="resetColorLibraryFilters()">Clear Filters</button>
      </div>
    `;
  }

  return sectionsHtml;
}

function renderColorSwatchCardHtml(c, isAdmin) {
  const parent = c.parentColorId ? findColorLibraryEntry(c.parentColorId) : null;
  const linkedProd = (c.linkedProductId && typeof db !== 'undefined' && db && Array.isArray(db.products))
    ? db.products.find(p => String(p.id) === String(c.linkedProductId))
    : null;
  return `
    <div class="cl-card">
      <div class="cl-swatch-banner" style="background-color:${escapeAttr(c.hex)};" onclick="openColorDetailsModal('${escapeAttr(c.id)}')" title="Click to view color details">
        <span class="cl-hex-pill">${escapeHtml(c.hex)}</span>
        <span class="cl-type-label ${c.isCustom ? 'custom' : ''}">${c.isCustom ? 'Custom' : 'Built-in'}</span>
      </div>
      <div class="cl-card-body">
        <div class="cl-color-name" onclick="openColorDetailsModal('${escapeAttr(c.id)}')" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</div>
        <div class="cl-meta-row">
          <span>${escapeHtml(c.colorFamily || c.category)}</span>
          <span class="cl-variation-tag">${escapeHtml(c.variation || 'Base')}</span>
        </div>
        ${linkedProd ? `<div class="cl-parent-line" title="Linked Inventory Product: ${escapeAttr(linkedProd.id)} (${escapeAttr(linkedProd.category || linkedProd.type)})">🔗 ${escapeHtml(linkedProd.id)} · ${escapeHtml(linkedProd.category || linkedProd.type || 'Pigment / Colorant')}</div>` : ''}
        ${parent ? `<div class="cl-parent-line" title="Parent: ${escapeAttr(parent.name)}">Parent: ${escapeHtml(parent.name)}</div>` : ''}
      </div>
      <div class="cl-card-actions">
        <button type="button" class="cl-action-btn primary" onclick="openColorDetailsModal('${escapeAttr(c.id)}')">Details</button>
        <button type="button" class="cl-action-btn" onclick="copyColorLibraryHex('${escapeAttr(c.hex)}')">Copy HEX</button>
        ${isAdmin && c.isCustom ? `
          <button type="button" class="cl-action-btn" onclick="openColorLibraryModal('${escapeAttr(c.id)}')" style="margin-left:auto;">Edit</button>
          <button type="button" class="cl-action-btn danger" onclick="confirmDeleteCustomColor('${escapeAttr(c.id)}')">Delete</button>
        ` : ''}
      </div>
    </div>
  `;
}

function loadMoreColorSection(clsName) {
  const cur = Number(colorLibraryUiState.sectionLimits[clsName]) || DEFAULT_SECTION_LIMIT;
  colorLibraryUiState.sectionLimits[clsName] = cur + 24;
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function showAllColorSection(clsName) {
  colorLibraryUiState.sectionLimits[clsName] = 99999;
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function refreshColorLibraryView() {
  const tabsEl = document.getElementById('cl-cat-tabs');
  if (tabsEl) tabsEl.innerHTML = renderColorClassificationTabsHtml();
  const famEl = document.getElementById('cl-family-filter');
  if (famEl) famEl.innerHTML = renderColorFamilyFilterOptionsHtml();
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function toggleColorSection(clsName) {
  if (colorLibraryUiState.expandedSections.has(clsName)) {
    colorLibraryUiState.expandedSections.delete(clsName);
  } else {
    colorLibraryUiState.expandedSections.add(clsName);
  }
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function expandAllColorSections() {
  COLOR_CLASSIFICATIONS.forEach(c => colorLibraryUiState.expandedSections.add(c.name));
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function collapseAllColorSections() {
  colorLibraryUiState.expandedSections.clear();
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

let _clBaseSearchTimer = null;
function onColorLibrarySearch(val) {
  colorLibraryUiState.search = val;
  if (_clBaseSearchTimer) clearTimeout(_clBaseSearchTimer);
  _clBaseSearchTimer = setTimeout(() => {
    _clBaseSearchTimer = null;
    const gridEl = document.getElementById('cl-grid-container');
    if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
  }, 140);
}

function onColorClassificationSelect(cls) {
  colorLibraryUiState.classification = cls;
  colorLibraryUiState.family = 'All';
  if (cls !== 'All') colorLibraryUiState.expandedSections.add(cls);
  refreshColorLibraryView();
}

function onColorLibraryFamilyChange(val) {
  colorLibraryUiState.family = val;
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function onColorLibraryVariationChange(val) {
  colorLibraryUiState.variation = val;
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function onColorLibrarySortChange(val) {
  colorLibraryUiState.sortBy = val;
  const gridEl = document.getElementById('cl-grid-container');
  if (gridEl) gridEl.innerHTML = renderColorLibrarySectionsHtml();
}

function resetColorLibraryFilters() {
  colorLibraryUiState.search = '';
  colorLibraryUiState.classification = 'All';
  colorLibraryUiState.family = 'All';
  colorLibraryUiState.variation = 'All';
  const sEl = document.getElementById('cl-search-input');
  if (sEl) sEl.value = '';
  const vEl = document.getElementById('cl-variation-filter');
  if (vEl) vEl.value = 'All';
  refreshColorLibraryView();
}

function copyColorLibraryHex(hex) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hex).then(() => showToast(`Copied ${hex}`, 'success')).catch(() => showToast(`HEX: ${hex}`, 'info'));
  } else {
    showToast(`HEX: ${hex}`, 'info');
  }
}

/* ============================================================
   COLOR DETAILS MODAL
   ============================================================ */
function openColorDetailsModal(colorId) {
  const entry = findColorLibraryEntry(colorId);
  if (!entry) return;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const parent = entry.parentColorId ? findColorLibraryEntry(entry.parentColorId) : null;
  const activeProds = getActiveProductsReferencingColor(entry.id);
  const linkedFormulas = getFormulasReferencingColor(entry.id);

  const html = `
    <div class="cl-detail-hero" style="background-color:${escapeAttr(entry.hex)};">
      <span class="cl-hex-pill" style="font-size:13px; padding:4px 10px;">${escapeHtml(entry.hex)}</span>
      <span class="cl-type-label ${entry.isCustom ? 'custom' : ''}">${entry.isCustom ? 'Custom Color' : 'Built-in Color'}</span>
    </div>

    <div class="cl-detail-grid">
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Color Name</div>
        <div class="cl-detail-cell-val">${escapeHtml(entry.name)}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Main Classification</div>
        <div class="cl-detail-cell-val">${escapeHtml(entry.classification || 'Neutral Colors')}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Color Family</div>
        <div class="cl-detail-cell-val">${escapeHtml(entry.colorFamily || entry.category)}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Color Variation</div>
        <div class="cl-detail-cell-val">${escapeHtml(entry.variation || 'Base')}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">HEX Code</div>
        <div class="cl-detail-cell-val" style="font-family:'Space Grotesk',monospace;">${escapeHtml(entry.hex)}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">RGB Values</div>
        <div class="cl-detail-cell-val" style="font-family:'Space Grotesk',monospace;">${escapeHtml(hexToRgbLabel(entry.hex))}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Date Created</div>
        <div class="cl-detail-cell-val" style="font-size:12px;">${escapeHtml(formatColorDate(entry.createdAt))}</div>
      </div>
      <div class="cl-detail-cell">
        <div class="cl-detail-cell-label">Last Updated</div>
        <div class="cl-detail-cell-val" style="font-size:12px;">${escapeHtml(formatColorDate(entry.updatedAt || entry.createdAt))}</div>
      </div>
    </div>

    ${parent ? `
      <div class="cl-detail-cell" style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div class="cl-detail-cell-label">Parent Color Reference</div>
          <div style="font-size:12.5px; font-weight:700; margin-top:2px;">${escapeHtml(parent.name)} (${escapeHtml(parent.hex)})</div>
        </div>
        <button type="button" class="btn ghost small" onclick="openColorDetailsModal('${escapeAttr(parent.id)}')">View Parent →</button>
      </div>
    ` : ''}

    <div class="cl-detail-cell" style="margin-bottom:10px;">
      <div class="cl-detail-cell-label">System References</div>
      <div style="font-size:12.5px; margin-top:3px; color:var(--ink);">
        Linked to <b>${activeProds.length}</b> active product${activeProds.length === 1 ? '' : 's'} &amp; <b>${linkedFormulas.length}</b> saved formula${linkedFormulas.length === 1 ? '' : 's'}
      </div>
      ${activeProds.length > 0 ? `
        <div class="cl-linked-list">
          ${activeProds.slice(0, 6).map(ap => `<span class="cl-linked-chip">${escapeHtml(ap.name)}${ap.brand ? ` (${escapeHtml(ap.brand)})` : ''}</span>`).join('')}
          ${activeProds.length > 6 ? `<span class="cl-linked-chip muted">+${activeProds.length - 6} more</span>` : ''}
        </div>
      ` : ''}
    </div>

    ${entry.notes ? `
      <div class="cl-detail-cell" style="margin-bottom:12px;">
        <div class="cl-detail-cell-label">Description</div>
        <div style="font-size:12.5px; margin-top:3px; color:var(--ink);">${escapeHtml(entry.notes)}</div>
      </div>
    ` : ''}
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="copyColorLibraryHex('${escapeAttr(entry.hex)}')">📋 Copy HEX</button>
    ${isAdmin && entry.isCustom ? `
      <button type="button" class="btn secondary" onclick="closeModal(); openColorLibraryModal('${escapeAttr(entry.id)}')">Edit Color</button>
    ` : ''}
    <button type="button" class="btn" onclick="closeModal()">Close</button>
  `;

  openModal(`Color Details — ${entry.name}`, html, footHtml, 'modal-md');
}

/* ============================================================
   ADMIN: ADD / EDIT CUSTOM COLOR MODAL
   ============================================================ */
function openColorLibraryModal(colorId = null) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Admin users can add or edit custom colors.', 'error');
    return;
  }
  const existing = colorId ? findColorLibraryEntry(colorId) : null;
  if (colorId && (!existing || !existing.isCustom)) {
    showToast('Only custom colors can be edited.', 'error');
    return;
  }

  const initName = existing ? existing.name : '';
  const initHex = existing ? normalizeHexCode(existing.hex) : '#1F6F6B';
  const initCls = existing ? (existing.classification || 'Custom Colors') : 'Custom Colors';
  const initFamily = existing ? (existing.colorFamily || existing.category || 'Admin Custom') : 'Admin Custom';
  const initVar = existing ? (existing.variation || 'Base') : 'Base';
  const initParent = existing ? (existing.parentColorId || '') : '';
  const initCat = existing ? (existing.category || 'Specialty Colors') : 'Specialty Colors';
  const initNotes = existing ? (existing.notes || '') : '';
  const existingLinkedProd = (existing && existing.linkedProductId && typeof db !== 'undefined' && db && Array.isArray(db.products))
    ? db.products.find(p => String(p.id) === String(existing.linkedProductId))
    : null;
  const initProductCategory = existingLinkedProd ? (existingLinkedProd.category || existingLinkedProd.type || 'Pigment / Colorant') : 'Pigment / Colorant';

  const parentOptions = getColorLibraryList().filter(c => c.id !== colorId);

  const html = `
    <div class="cl-preview-box">
      <div id="cl-modal-preview-swatch" class="cl-preview-swatch" style="background-color:${initHex}; color:${isLightColorHex(initHex) ? '#1C1917' : '#FFFFFF'};">
        ${initHex}
      </div>
      <div style="flex:1; min-width:0;">
        <div id="cl-modal-preview-name" style="font-weight:700; font-size:15px; color:var(--ink);">
          ${escapeHtml(initName || 'New Custom Color')}
        </div>
        <div id="cl-modal-preview-meta" class="muted small" style="margin-top:2px;">
          ${escapeHtml(initHex)} · ${hexToRgbLabel(initHex)} · ${escapeHtml(initCls)}
        </div>
        <div class="muted" style="font-size:10.5px; margin-top:4px;">
          ${existing
      ? (existingLinkedProd
        ? `🔗 Synced with Inventory product <b>${escapeHtml(existingLinkedProd.id)}</b> (${escapeHtml(initProductCategory)}). Stock remains managed solely in Inventory.`
        : 'Updates color name, HEX, and classification across all linked inventory products.')
      : '🔄 Automatically creates or links a Pigment / Colorant product in Inventory initialized to 0.00 L stock (ready for Stock Receiving).'}
        </div>
      </div>
    </div>

    <div class="form-grid">
      <div class="field full">
        <label for="cl-form-name">Color Name <span style="color:var(--danger);">*</span></label>
        <input id="cl-form-name" type="text" value="${escapeAttr(initName)}" placeholder="e.g. Ocean Teal Mist" oninput="updateColorLibraryModalPreview()">
      </div>

      <div class="field">
        <label for="cl-form-classification">Main Classification <span style="color:var(--danger);">*</span></label>
        <select id="cl-form-classification" onchange="onColorFormClassificationChange()">
          ${COLOR_CLASSIFICATIONS.map(c => `<option value="${escapeAttr(c.name)}" ${initCls === c.name ? 'selected' : ''}>${c.code}. ${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label for="cl-form-family">Color Family <span style="color:var(--danger);">*</span></label>
        <input id="cl-form-family" type="text" list="cl-family-datalist" value="${escapeAttr(initFamily)}" placeholder="e.g. Blue, Teal, Admin Custom">
        <datalist id="cl-family-datalist">
          ${Array.from(new Set(COLOR_CLASSIFICATIONS.flatMap(c => c.families))).map(f => `<option value="${escapeAttr(f)}">`).join('')}
        </datalist>
      </div>

      <div class="field">
        <label for="cl-form-variation">Color Variation</label>
        <select id="cl-form-variation">
          ${COLOR_VARIATIONS.map(v => `<option value="${v}" ${initVar === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label for="cl-form-category">Base Category <span class="muted small">(POS/Filter)</span></label>
        <select id="cl-form-category">
          ${COLOR_LIBRARY_CATEGORIES.map(cat => `<option value="${escapeAttr(cat)}" ${initCat === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label for="cl-form-product-category">Inventory Product Category</label>
        <select id="cl-form-product-category">
          <option value="Pigment / Colorant" ${initProductCategory === 'Pigment / Colorant' ? 'selected' : ''}>Pigment / Colorant</option>
          <option value="Tinting Color" ${initProductCategory === 'Tinting Color' ? 'selected' : ''}>Tinting Color</option>
          <option value="Base Pigment" ${initProductCategory === 'Base Pigment' ? 'selected' : ''}>Base Pigment</option>
        </select>
      </div>

      <div class="field">
        <label for="cl-form-hex">HEX Code <span style="color:var(--danger);">*</span></label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input id="cl-form-hex" type="text" maxlength="7" value="${escapeAttr(initHex)}"
            placeholder="#1F6F6B"
            style="font-family:'Space Grotesk',monospace; font-weight:700; text-transform:uppercase;"
            oninput="onColorLibraryModalHexInput(this.value)">
          <input id="cl-form-picker" type="color" value="${escapeAttr(initHex)}"
            style="width:42px; height:36px; padding:2px; border:1px solid var(--line); border-radius:6px; cursor:pointer; background:var(--surface);"
            oninput="onColorLibraryModalPickerInput(this.value)" title="Pick a color">
        </div>
      </div>

      <div class="field">
        <label for="cl-form-parent">Parent Color <span class="muted small">(Optional)</span></label>
        <select id="cl-form-parent">
          <option value="">None (Standalone Color)</option>
          ${parentOptions.map(po => `<option value="${escapeAttr(po.id)}" ${initParent === po.id ? 'selected' : ''}>${escapeHtml(po.name)} (${escapeHtml(po.hex)})</option>`).join('')}
        </select>
      </div>

      <div class="field full">
        <label for="cl-form-notes">Description <span class="muted small">(Optional)</span></label>
        <input id="cl-form-notes" type="text" value="${escapeAttr(initNotes)}" placeholder="e.g. Custom exterior trim shade">
      </div>
    </div>

    <div id="cl-form-error" style="display:none; margin-top:10px; padding:8px 10px; border-radius:6px; background:var(--danger-bg); border:1px solid var(--danger-border); color:var(--danger-text); font-size:12px; font-weight:600;"></div>
  `;

  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn" id="cl-form-save-btn" onclick="saveCustomColorFromModal('${escapeAttr(colorId || '')}')">
      ${existing ? 'Save Changes' : 'Save Color'}
    </button>
  `;

  openModal(existing ? `Edit Custom Color: ${existing.name}` : 'Add Custom Color', html, footHtml, 'modal-md');
  setTimeout(() => {
    const el = document.getElementById('cl-form-name');
    if (el) el.focus();
  }, 40);
}

function onColorFormClassificationChange() {
  updateColorLibraryModalPreview();
}

function onColorLibraryModalHexInput(val) {
  const norm = normalizeHexCode(val);
  const picker = document.getElementById('cl-form-picker');
  if (norm && picker) {
    picker.value = norm;
  }
  updateColorLibraryModalPreview();
}

function onColorLibraryModalPickerInput(val) {
  const norm = normalizeHexCode(val);
  const hexInput = document.getElementById('cl-form-hex');
  if (norm && hexInput) {
    hexInput.value = norm;
  }
  updateColorLibraryModalPreview();
}

function updateColorLibraryModalPreview() {
  const name = (document.getElementById('cl-form-name')?.value || '').trim();
  const rawHex = document.getElementById('cl-form-hex')?.value || '';
  const cls = document.getElementById('cl-form-classification')?.value || '';
  const normHex = normalizeHexCode(rawHex);

  const swatch = document.getElementById('cl-modal-preview-swatch');
  const nameEl = document.getElementById('cl-modal-preview-name');
  const metaEl = document.getElementById('cl-modal-preview-meta');
  const errEl = document.getElementById('cl-form-error');

  if (nameEl) nameEl.textContent = name || 'New Custom Color';

  if (normHex) {
    if (swatch) {
      swatch.style.backgroundColor = normHex;
      swatch.style.color = isLightColorHex(normHex) ? '#1C1917' : '#FFFFFF';
      swatch.textContent = normHex;
    }
    if (metaEl) metaEl.textContent = `${normHex} · ${hexToRgbLabel(normHex)} · ${cls}`;
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  } else {
    if (swatch) {
      swatch.style.backgroundColor = 'var(--surface-3)';
      swatch.style.color = 'var(--ink-soft)';
      swatch.textContent = 'INVALID';
    }
    if (metaEl) metaEl.textContent = 'Enter a valid 6-digit HEX code (e.g. #1F6F6B)';
  }
}

let _clSavingCustomColor = false;
async function saveCustomColorFromModal(existingId) {
  if (_clSavingCustomColor) return;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Admin users can add or edit custom colors.', 'error');
    return;
  }
  const name = (document.getElementById('cl-form-name')?.value || '').trim();
  const rawHex = document.getElementById('cl-form-hex')?.value || '';
  const hex = normalizeHexCode(rawHex);
  const classification = document.getElementById('cl-form-classification')?.value || 'Custom Colors';
  const colorFamily = (document.getElementById('cl-form-family')?.value || '').trim() || 'Admin Custom';
  const variation = document.getElementById('cl-form-variation')?.value || 'Base';
  const category = document.getElementById('cl-form-category')?.value || 'Specialty Colors';
  const productCategory = document.getElementById('cl-form-product-category')?.value || 'Pigment / Colorant';
  const parentColorId = document.getElementById('cl-form-parent')?.value || '';
  const notes = (document.getElementById('cl-form-notes')?.value || '').trim();
  const errEl = document.getElementById('cl-form-error');

  const showErr = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    } else {
      showToast(msg, 'error');
    }
  };

  if (!name) return showErr('Color name is required.');
  if (!hex) return showErr('Please enter a valid 6-digit HEX code (e.g. #1F6F6B).');

  const list = getColorLibraryList();
  const dupName = list.find(c => c.id !== existingId && c.name.trim().toLowerCase() === name.toLowerCase());
  if (dupName) {
    return showErr(`Duplicate color name: "${dupName.name}" already exists in the Color Library.`);
  }
  const dupHex = list.find(c => c.id !== existingId && normalizeHexCode(c.hex) === hex);
  if (dupHex) {
    return showErr(`Duplicate HEX code: ${dupHex.hex} is already assigned to "${dupHex.name}".`);
  }

  const btn = document.getElementById('cl-form-save-btn');
  _clSavingCustomColor = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const resp = await fetch('api/db.php?action=color_library_save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: existingId, name, hex, category, classification, colorFamily, variation, parentColorId, notes, productCategory })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || !data.success) {
      return showErr((data && data.error) || `Failed to save color (HTTP ${resp.status}).`);
    }

    if (typeof db !== 'undefined' && db) {
      db.colorLibrary = data.colorLibrary || db.colorLibrary;
      // Merge synchronized Inventory product directly in memory (NO saveDB() call to prevent sync loops)
      if (data.syncedProduct && typeof data.syncedProduct === 'object' && Array.isArray(db.products)) {
        const sp = data.syncedProduct;
        const idx = db.products.findIndex(p => String(p.id) === String(sp.id));
        if (idx >= 0) {
          db.products[idx] = { ...db.products[idx], ...sp };
        } else {
          db.products.push(sp);
        }
        if (Array.isArray(sp.sizesData) && Array.isArray(db.productSizes)) {
          sp.sizesData.forEach(sv => {
            const sIdx = db.productSizes.findIndex(x => String(x.sizeId) === String(sv.sizeId));
            if (sIdx >= 0) db.productSizes[sIdx] = { ...db.productSizes[sIdx], ...sv };
            else db.productSizes.push(sv);
          });
        }
      }
      // Keep saved colorFormulas synchronized when a linked Color Library entry is edited
      if (existingId && Array.isArray(db.colorFormulas)) {
        const updatedEntry = findColorLibraryEntry(existingId);
        if (updatedEntry) {
          db.colorFormulas.forEach(f => {
            if (String(f.colorId || f.color_id || '') === String(existingId)) {
              f.hexReference = updatedEntry.hex;
              f.detectedName = updatedEntry.name;
            }
            if (Array.isArray(f.pigmentFormula)) {
              f.pigmentFormula.forEach(pf => {
                if (pf.colorId && String(pf.colorId) === String(existingId)) {
                  pf.hex = updatedEntry.hex;
                  pf.colorName = updatedEntry.name;
                }
              });
            }
          });
        }
      }
      colorLibraryUiState.expandedSections.add(classification);
      notifyColorLibraryChanged(existingId ? 'edit' : 'add');
      if (typeof storage !== 'undefined' && storage.set) {
        storage.set(DB_KEY, JSON.stringify(db));
      }
      if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
    }

    closeModal();
    let toastMsg = existingId ? `Updated "${name}" (${hex})` : `Added "${name}" (${hex}) to Color Library`;
    if (data.syncAction === 'created_product' && data.syncedProductId) {
      toastMsg = `Added "${name}" (${hex}) & auto-created Inventory product ${data.syncedProductId} (0.00 L)`;
    } else if (data.syncAction === 'linked_product' && data.syncedProductId) {
      toastMsg = `Added "${name}" (${hex}) & linked to existing Inventory product ${data.syncedProductId}`;
    } else if (data.syncAction === 'updated_product' && data.syncedProductId) {
      toastMsg = `Updated "${name}" (${hex}) & synced to Inventory product ${data.syncedProductId}`;
    }
    showToast(toastMsg, 'success');
    if (currentPage === 'colorLibrary' || currentPage === 'inventory') renderPage();
  } catch (err) {
    showErr('Network/database error saving custom color.');
  } finally {
    _clSavingCustomColor = false;
    if (btn) { btn.disabled = false; btn.textContent = existingId ? 'Save Changes' : 'Save Color'; }
  }
}

/* ============================================================
   ADMIN: DELETE CUSTOM COLOR (WITH REASSIGNMENT PROTECTION)
   ============================================================ */
function confirmDeleteCustomColor(colorId) {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Admin users can delete custom colors.', 'error');
    return;
  }
  const entry = findColorLibraryEntry(colorId);
  if (!entry || !entry.isCustom) {
    showToast('Built-in library colors cannot be deleted.', 'error');
    return;
  }

  const activeProds = getActiveProductsReferencingColor(colorId);
  const linkedFormulas = getFormulasReferencingColor(colorId);
  const hasRefs = activeProds.length > 0 || linkedFormulas.length > 0;
  const otherColors = getColorLibraryList().filter(c => c.id !== colorId);

  const reassignSection = hasRefs ? `
    <div style="margin-top:12px; padding:10px 12px; background:var(--warning-bg); border:1px solid var(--warning-border); border-radius:8px; font-size:12.5px; color:var(--warning-text);">
      <div style="font-weight:700; margin-bottom:4px;">⚠️ Reassignment Required Before Deletion</div>
      <div>
        This color is currently referenced by <b>${activeProds.length}</b> active product${activeProds.length === 1 ? '' : 's'}
        and <b>${linkedFormulas.length}</b> saved formula${linkedFormulas.length === 1 ? '' : 's'}.
        Select a replacement color below to reassign all references cleanly:
      </div>
      <div style="margin-top:8px;">
        <select id="cl-reassign-select" style="width:100%; background:var(--surface); color:var(--ink);" onchange="onColorDeleteReassignChange(this.value)">
          <option value="">-- Select Replacement Color --</option>
          ${otherColors.map(oc => `<option value="${escapeAttr(oc.id)}">${escapeHtml(oc.name)} (${escapeHtml(oc.hex)}) — ${escapeHtml(oc.classification || oc.category)}</option>`).join('')}
        </select>
      </div>
    </div>
  ` : '';

  const html = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
      <span style="width:44px; height:44px; border-radius:8px; background:${escapeAttr(entry.hex)}; border:1px solid rgba(0,0,0,0.15); flex-shrink:0;"></span>
      <div>
        <div style="font-weight:700; font-size:14.5px;">${escapeHtml(entry.name)}</div>
        <div class="muted small">${escapeHtml(entry.hex)} · ${escapeHtml(entry.classification || entry.category)}</div>
      </div>
    </div>
    <p style="margin:0; font-size:13px;">
      ${hasRefs
      ? 'Linked inventory products and historical records are protected and will <b>never</b> be deleted. You can Archive this color, Unlink it, or Reassign references before deleting.'
      : 'Are you sure you want to archive or remove this custom color from the Color Library? Inventory products will never be deleted.'}
    </p>
    ${reassignSection}
  `;
  const footHtml = `
    <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
    <button type="button" class="btn secondary" id="cl-archive-btn" onclick="executeDeleteCustomColor('${escapeAttr(colorId)}', 'archive')">Archive Color</button>
    ${hasRefs ? `<button type="button" class="btn secondary" id="cl-unlink-btn" onclick="executeDeleteCustomColor('${escapeAttr(colorId)}', 'unlink')">Unlink &amp; Remove</button>` : ''}
    <button type="button" class="btn danger" id="cl-del-btn" ${hasRefs ? 'disabled' : ''} onclick="executeDeleteCustomColor('${escapeAttr(colorId)}', 'delete')">
      ${hasRefs ? 'Reassign & Delete Color' : 'Delete Color'}
    </button>
  `;
  openModal('Manage / Delete Custom Color', html, footHtml, 'modal-md');
}

function onColorDeleteReassignChange(val) {
  const btn = document.getElementById('cl-del-btn');
  if (btn) btn.disabled = !val;
}

let _clDeletingCustomColor = false;
async function executeDeleteCustomColor(colorId, mode = 'delete') {
  if (_clDeletingCustomColor) return;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Only Admin users can delete or archive custom colors.', 'error');
    return;
  }
  const reassignEl = document.getElementById('cl-reassign-select');
  const reassignToColorId = mode === 'delete' && reassignEl ? reassignEl.value : '';
  const allActionBtns = ['cl-archive-btn', 'cl-unlink-btn', 'cl-del-btn']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const savedBtnStates = allActionBtns.map(b => ({ el: b, disabled: b.disabled, text: b.textContent }));
  const activeBtn = document.getElementById(mode === 'archive' ? 'cl-archive-btn' : (mode === 'unlink' ? 'cl-unlink-btn' : 'cl-del-btn'));

  _clDeletingCustomColor = true;
  allActionBtns.forEach(b => { b.disabled = true; });
  if (activeBtn) activeBtn.textContent = 'Processing...';

  try {
    const resp = await fetch('api/db.php?action=color_library_delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: colorId, reassignToColorId, mode })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || !data.success) {
      showToast((data && data.error) || `Could not delete color (HTTP ${resp.status}).`, 'error');
      return;
    }

    if (typeof db !== 'undefined' && db) {
      db.colorLibrary = data.colorLibrary || db.colorLibrary;
      if (Array.isArray(data.colorFormulas)) {
        db.colorFormulas = data.colorFormulas;
      }
      if (Array.isArray(db.products)) {
        if (reassignToColorId) {
          const target = findColorLibraryEntry(reassignToColorId);
          db.products.forEach(p => {
            if ((p.colorId || p.color_id) === colorId && target) {
              p.colorId = target.id;
              p.color_id = target.id;
              p.color = target.name;
              p.colorHex = target.hex;
              p.color_hex = target.hex;
            }
          });
        } else {
          db.products.forEach(p => {
            if ((p.colorId || p.color_id) === colorId) {
              p.colorId = null;
              p.color_id = null;
            }
          });
        }
      }
      if (Array.isArray(db.colorFormulas)) {
        const target = reassignToColorId ? findColorLibraryEntry(reassignToColorId) : null;
        db.colorFormulas.forEach(f => {
          if (String(f.colorId || f.color_id || '') === String(colorId)) {
            f.colorId = target ? target.id : null;
            f.color_id = target ? target.id : null;
            if (target) {
              f.hexReference = target.hex;
              f.detectedName = target.name;
            }
          }
          if (Array.isArray(f.pigmentFormula)) {
            f.pigmentFormula.forEach(pf => {
              if (pf.colorId && String(pf.colorId) === String(colorId)) {
                pf.colorId = target ? target.id : null;
                if (target) {
                  pf.hex = target.hex;
                  pf.colorName = target.name;
                }
              }
            });
          }
        });
      }
      notifyColorLibraryChanged('delete');
      if (typeof storage !== 'undefined' && storage.set) storage.set(DB_KEY, JSON.stringify(db));
      if (typeof broadcastDbUpdate === 'function') broadcastDbUpdate();
    }

    closeModal();
    const successMsg = mode === 'archive'
      ? 'Custom color archived. Linked inventory products and historical records were preserved.'
      : (mode === 'unlink'
        ? 'Custom color unlinked and removed. Linked inventory products and formulas were preserved.'
        : (data.reassignedTo
          ? `Custom color deleted and references reassigned to "${data.reassignedTo}".`
          : 'Custom color deleted.'));
    showToast(successMsg, 'success');
    if (currentPage === 'colorLibrary') renderPage();
  } catch (err) {
    showToast('Error deleting custom color.', 'error');
  } finally {
    _clDeletingCustomColor = false;
    savedBtnStates.forEach(({ el, disabled, text }) => {
      if (el) {
        el.disabled = disabled;
        el.textContent = text;
      }
    });
  }
}

/* ============================================================
   REUSABLE OFFLINE COLOR LIBRARY PICKER MODAL
   Used by Inventory/Products & Paint Mixing Studio
   ============================================================ */
function openColorLibraryPickerModal(opts = {}) {
  colorPickerModalState = {
    search: '',
    category: 'All',
    selectedId: opts.selectedColorId || '',
    onSelect: typeof opts.onSelect === 'function' ? opts.onSelect : null
  };

  const title = opts.title || 'Select Color from Centralized Color Library';
  const subtitle = opts.subtitle || 'Choose a standardized paint color to reuse its exact name and HEX reference.';

  const html = `
    <div class="muted small" style="margin-bottom:10px;">${escapeHtml(subtitle)}</div>
    <div class="row wrap" style="gap:8px; margin-bottom:10px;">
      <input id="cl-picker-search" type="search" style="flex:1; min-width:200px;"
        placeholder="Search by color name, HEX, or family..."
        oninput="onColorPickerModalSearch(this.value)">
    </div>
    <div class="cl-cat-tabs" id="cl-picker-cats" style="margin-bottom:12px;">
      ${renderColorPickerModalCategoriesHtml()}
    </div>
    <div id="cl-picker-grid" class="cl-picker-grid">
      ${renderColorPickerModalGridHtml()}
    </div>
    <div class="modal-actions" style="margin-top:14px;">
      <button type="button" class="btn secondary" onclick="closeColorPickerModal()">Cancel</button>
    </div>
  `;

  let overlay = document.getElementById('cl-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cl-picker-overlay';
    overlay.className = 'modal-backdrop';
    overlay.style.zIndex = '10060';
    overlay.innerHTML = `
      <div class="modal modal-lg" style="max-width:740px; width:95%;">
        <div class="modal-header">
          <h3 id="cl-picker-modal-title" style="margin:0;"></h3>
          <button class="modal-close" type="button" onclick="closeColorPickerModal()">&times;</button>
        </div>
        <div id="cl-picker-modal-body" class="modal-body"></div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeColorPickerModal();
    });
    document.body.appendChild(overlay);
  }
  document.getElementById('cl-picker-modal-title').textContent = title;
  document.getElementById('cl-picker-modal-body').innerHTML = html;
  overlay.classList.add('open');
  overlay.style.display = 'flex';
  setTimeout(() => {
    const inp = document.getElementById('cl-picker-search');
    if (inp) inp.focus();
  }, 40);
}

function closeColorPickerModal() {
  const overlay = document.getElementById('cl-picker-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.style.display = 'none';
  }
}

function renderColorPickerModalCategoriesHtml() {
  const allTab = `<button type="button" class="cl-cat-pill ${colorPickerModalState.category === 'All' ? 'active' : ''}" onclick="onColorPickerModalCat('All')">All Colors</button>`;
  const tabs = COLOR_CLASSIFICATIONS.filter(c => c.name !== 'Custom Colors' || getColorLibraryList().some(x => x.isCustom)).map(cls => {
    const active = colorPickerModalState.category === cls.name ? 'active' : '';
    return `<button type="button" class="cl-cat-pill ${active}" onclick="onColorPickerModalCat('${escapeAttr(cls.name)}')">
      <span class="cl-cat-dot" style="background:${cls.dot};"></span>${escapeHtml(cls.name)}
    </button>`;
  }).join('');
  return allTab + tabs;
}

function renderColorPickerModalGridHtml() {
  const list = getColorLibraryList();
  const q = (colorPickerModalState.search || '').trim().toLowerCase();
  const cat = colorPickerModalState.category || 'All';

  const filtered = list.filter(c => {
    if (cat !== 'All' && c.classification !== cat && c.category !== cat) return false;
    if (q && !`${c.name} ${c.hex} ${c.classification} ${c.colorFamily} ${c.category}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return `<div class="muted small" style="grid-column:1/-1; text-align:center; padding:24px;">No colors match your search.</div>`;
  }

  return filtered.map(c => {
    const sel = String(colorPickerModalState.selectedId) === String(c.id) ? 'selected' : '';
    return `
      <button type="button" class="cl-picker-item ${sel}" onclick="selectColorFromPickerModal('${escapeAttr(c.id)}')">
        <div class="cl-picker-swatch" style="background-color:${escapeAttr(c.hex)};"></div>
        <div style="font-weight:700; font-size:12.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.name)}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:var(--ink-soft);">
          <span style="font-family:'Space Grotesk',monospace; font-weight:700;">${escapeHtml(c.hex)}</span>
          <span>${escapeHtml(c.colorFamily || c.category)}</span>
        </div>
      </button>
    `;
  }).join('');
}

function onColorPickerModalSearch(val) {
  colorPickerModalState.search = val;
  const grid = document.getElementById('cl-picker-grid');
  if (grid) grid.innerHTML = renderColorPickerModalGridHtml();
}

function onColorPickerModalCat(cat) {
  colorPickerModalState.category = cat;
  const tabs = document.getElementById('cl-picker-cats');
  if (tabs) tabs.innerHTML = renderColorPickerModalCategoriesHtml();
  const grid = document.getElementById('cl-picker-grid');
  if (grid) grid.innerHTML = renderColorPickerModalGridHtml();
}

function selectColorFromPickerModal(colorId) {
  const entry = findColorLibraryEntry(colorId);
  if (!entry) return;
  const cb = colorPickerModalState.onSelect;
  closeColorPickerModal();
  if (cb) cb(entry);
}

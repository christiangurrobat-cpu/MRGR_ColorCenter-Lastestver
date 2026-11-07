/* ============================================================
   14. REPORTS (admin: full · staff: inventory-focused)
   ============================================================ */
let reportActiveTab = 'all'; // 'all', 'sales', 'inventory', 'low_stock', 'transactions', 'purchase_orders', 'receiving', 'supplier_report', 'previous_inventory', 'mixing', 'history', 'returns'
let reportDateFrom = currentYearStartISO();
let reportDateTo = currentYearEndISO();
let reportYearFilter = 'current';
let reportProductFilter = 'all';
let reportBrandFilter = 'all';
let reportSupplierFilter = 'all';
let reportTxTypeFilter = 'all';
let reportSearchQuery = '';
let salesHistoryBreakdownsExpanded = true;
let reportMixingSortField = 'date';
let reportMixingSortAsc = false;

function calculateCurrentInventoryValue() {
  let totalVal = 0;
  (db.products || []).forEach(p => {
    if (p.status === 'discontinued') return;
    if (Array.isArray(p.sizesData) && p.sizesData.length > 0) {
      p.sizesData.forEach(sz => {
        const cans = Number(sz.sealedQuantity || 0);
        const pricePerCan = Number(sz.pricePerCan || ((Number(sz.pricePerLiter) || Number(p.price) || 0) * (Number(sz.containerSize) || 1)));
        totalVal += cans * pricePerCan;
      });
      const openedLitres = Number(p.openedStock || 0);
      const pricePerL = Number(p.price || 0);
      totalVal += openedLitres * pricePerL;
    } else {
      const stock = Number(p.stock || 0);
      const price = Number(p.price || 0);
      totalVal += stock * price;
    }
  });
  return totalVal;
}

function setReportProductFilter(val) {
  reportProductFilter = val || 'all';
  resetPaginationByPrefix('rep_');
  renderReportBody();
}

function setReportBrandFilter(val) {
  reportBrandFilter = val || 'all';
  resetPaginationByPrefix('rep_');
  renderReportBody();
}

function setReportSupplierFilter(val) {
  reportSupplierFilter = val || 'all';
  resetPaginationByPrefix('rep_');
  renderReportBody();
}

function setReportTxTypeFilter(val) {
  reportTxTypeFilter = val || 'all';
  resetPaginationByPrefix('rep_');
  renderReportBody();
}

function setReportSearch(val) {
  reportSearchQuery = String(val || '').trim().toLowerCase();
  resetPaginationByPrefix('rep_');
  renderReportBody();
}

function setMixingSort(field) {
  if (reportMixingSortField === field) {
    reportMixingSortAsc = !reportMixingSortAsc;
  } else {
    reportMixingSortField = field;
    reportMixingSortAsc = (field === 'date') ? false : true;
  }
  if (typeof resetPaginationPage === 'function') {
    resetPaginationPage('rep_color_mixing');
  }
  renderReportBody();
}
window.setMixingSort = setMixingSort;

function openMixingReceiptModal(receiptRef) {
  if (!receiptRef) return;
  if (!currentUser || currentUser.role !== 'admin') {
    if (typeof showToast === 'function') {
      showToast('Viewing sales transactions is restricted to administrators.', 'error');
    }
    return;
  }
  const ref = String(receiptRef).trim();
  const sale = (db.sales || []).find(s =>
    s.id === ref ||
    s.receiptNo === ref ||
    (typeof getReceiptNo === 'function' && getReceiptNo(s) === ref)
  ) || (db.sales || []).find(s => {
    return (s.receiptNo && s.receiptNo.toLowerCase() === ref.toLowerCase()) ||
      (s.items || []).some(it => it.receiptNo === ref);
  });

  if (sale) {
    if (typeof viewSale === 'function') {
      viewSale(sale.id);
    } else if (typeof showReceipt === 'function') {
      showReceipt(sale);
    }
  } else {
    if (typeof showToast === 'function') {
      showToast(`Sales transaction "${ref}" was not found in records.`, 'info');
    }
  }
}
window.openMixingReceiptModal = openMixingReceiptModal;

function reportStaffLabel(name) {
  const u = (db.users || []).find(x => x.name === name);
  const role = u ? { admin: 'Admin', cashier: 'Cashier', staff: 'Inventory Staff' }[u.role] : '';
  return escapeHtml(name || '') + (role ? ` (${role})` : '');
}
window.reportStaffLabel = reportStaffLabel;

function mixColorLabel(m) {
  if (m.colorName) return m.colorName;
  const pn = String(m.productName || '').trim();
  // 1. Clean from productName if it contains a color (e.g. "Custom Color Mix — Baby Blue", "Color Mix - Leaf Green [Leaf Green]")
  const stripped = pn
    .replace(/^(Custom\s+)?Color\s+Mix\s*([—–\-:·]\s*|\s+)/i, '')
    .replace(/\s*\[.*?\]$/, '')
    .replace(/^.*\(for\s+(.*?)\s+mix\)$/i, '$1')
    .trim();
  if (stripped && !/^(custom\s+)?color\s+mix$/i.test(stripped)) return stripped;

  // 2. Recover from sibling ingredient rows of the same date/staff: "<product> (for X mix)" or note containing "(ColorName)"
  const sib = (db.movements || []).find(x => x.type === 'colormix' && x.date === m.date && x.staffName === m.staffName && (
    /\(for\s+(.*?)\s+mix\)/i.test(x.productName || '') ||
    /\b(?:of\s+\d+(?:\.\d+)?L\s+)\(([^)]+)\)/i.test(x.note || '')
  ));
  if (sib) {
    const sibPnMatch = String(sib.productName || '').match(/\(for\s+(.*?)\s+mix\)/i);
    if (sibPnMatch && sibPnMatch[1]) return sibPnMatch[1].trim();
    const sibNoteMatch = String(sib.note || '').match(/\b(?:of\s+\d+(?:\.\d+)?L\s+)\(([^)]+)\)/i);
    if (sibNoteMatch && sibNoteMatch[1]) return sibNoteMatch[1].trim();
  }

  // 3. Recover from linked sale receipt if present in note
  const note = String(m.note || '');
  const rc = (note.match(/OR-\d+-\d+/) || [])[0];
  if (rc) {
    const sale = (db.sales || []).find(s => (s.receiptNo === rc || getReceiptNo(s) === rc));
    const mixes = sale ? (sale.items || []).filter(i => i.type === 'colormix' && i.colorName) : [];
    if (mixes.length) {
      return mixes[0].colorName;
    }
  }

  return pn || 'Color Mix';
}
window.mixColorLabel = mixColorLabel;

function extractMixingLogRecord(m) {
  if (!m) return null;
  const id = m.id || (typeof uid === 'function' ? uid('mix') : `mix_${Math.random()}`);
  const date = m.date;
  const staff = m.staffName || 'Staff';
  const liters = Number(m.qtyChange) || 0;
  const colorName = mixColorLabel(m);
  let detectedName = m.detectedColorName || m.detectedName || '';
  let baseType = m.baseType || '';

  const detMatch = String(m.productName || '').match(/\[(.*?)\]/);
  if (!detectedName && detMatch && detMatch[1]) {
    detectedName = detMatch[1].trim();
  }

  let receiptRef = m.receiptNo || '';
  const noteStr = String(m.note || '');
  if (!receiptRef) {
    const rcMatch = noteStr.match(/(?:Receipt:\s*|\b)(OR-\d+-\d+|OR-\d+)/i);
    if (rcMatch) receiptRef = rcMatch[1].trim();
  }
  if (!receiptRef) {
    const rcMatch2 = noteStr.match(/OR-[A-Za-z0-9\-]+/i);
    if (rcMatch2) receiptRef = rcMatch2[0].trim();
  }

  if (!receiptRef) {
    const sib = (db.movements || []).find(x => x.type === 'colormix' && x.date === m.date && x.staffName === m.staffName && x.productId && x.note);
    if (sib) {
      const sibRcMatch = String(sib.note || '').match(/(?:Receipt:\s*|\b)(OR-[A-Za-z0-9\-]+)/i);
      if (sibRcMatch) receiptRef = sibRcMatch[1].trim();
    }
  }

  let sale = null;
  if (receiptRef) {
    sale = (db.sales || []).find(s => s.receiptNo === receiptRef || (typeof getReceiptNo === 'function' && getReceiptNo(s) === receiptRef) || s.id === receiptRef);
  }
  if (!sale && !receiptRef) {
    sale = (db.sales || []).find(s => s.date === m.date && (s.items || []).some(it => it.type === 'colormix'));
    if (sale) {
      receiptRef = typeof getReceiptNo === 'function' ? getReceiptNo(sale) : (sale.receiptNo || sale.id);
    }
  }

  let saleMixItem = null;
  if (sale && Array.isArray(sale.items)) {
    saleMixItem = sale.items.find(it => it.type === 'colormix' && it.colorName && it.colorName.toLowerCase() === colorName.toLowerCase()) ||
      sale.items.find(it => it.type === 'colormix');
    if (saleMixItem) {
      if (!detectedName && saleMixItem.detectedColorName) detectedName = saleMixItem.detectedColorName;
      if (!baseType && saleMixItem.baseType) baseType = saleMixItem.baseType;
    }
  }

  // Final Mixed Color Hex Resolution
  // IMPORTANT: Do not calculate or invent the final HEX code by simply averaging the ingredient HEX values.
  // Use the actual saved color identification result or recorded final color value. If unavailable, display "HEX not recorded".
  let hexColor = m.hexColor || m.colorHex || m.hex || '';
  if (!hexColor && saleMixItem && (saleMixItem.hexColor || saleMixItem.colorHex)) {
    hexColor = saleMixItem.hexColor || saleMixItem.colorHex;
  }
  if (!hexColor) {
    const presets = (db.presets || []).concat(
      (() => {
        try {
          return JSON.parse(localStorage.getItem('mrgr_color_mix_presets') || '[]');
        } catch (e) {
          return [];
        }
      })()
    );
    const pMatch = presets.find(p => (p.colorName || '').toLowerCase() === colorName.toLowerCase() || (p.name || '').toLowerCase() === colorName.toLowerCase());
    if (pMatch && pMatch.hex) hexColor = pMatch.hex;
  }
  if (!hexColor) {
    const audit = (db.auditLogs || []).find(a => (a.action === 'MIXING_COMPLETE' || a.action === 'COLOR_MIX') && (
      (a.entityName && a.entityName.toLowerCase() === colorName.toLowerCase()) ||
      (a.details && a.details.toLowerCase().includes(colorName.toLowerCase()))
    ));
    if (audit) {
      const hexMatch = String(audit.newValue || audit.details || '').match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
      if (hexMatch) hexColor = hexMatch[0];
    }
  }
  if (!hexColor && typeof PAINT_COLOR_DICTIONARY !== 'undefined') {
    const dict = PAINT_COLOR_DICTIONARY.find(d => d.name.toLowerCase() === colorName.toLowerCase() || (detectedName && d.name.toLowerCase() === detectedName.toLowerCase()));
    if (dict) hexColor = dict.hex;
  }
  if (hexColor && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.test(hexColor)) {
    hexColor = '';
  }

  // Components & Formula Parsing with Snapshots
  let components = [];
  let rawFormula = '';
  let extraNote = '';

  // 1. Direct snapshot from movement object or formula_json
  if (Array.isArray(m.components) && m.components.length) {
    components = m.components;
  } else if (m.formulaJson) {
    try {
      const parsed = typeof m.formulaJson === 'string' ? JSON.parse(m.formulaJson) : m.formulaJson;
      if (Array.isArray(parsed) && parsed.length) components = parsed;
    } catch (e) { }
  }

  // 2. From linked POS sale item components
  if (!components.length && saleMixItem && Array.isArray(saleMixItem.components) && saleMixItem.components.length) {
    components = saleMixItem.components;
  }

  // 3. Sibling ingredient movements
  if (!components.length) {
    const sibs = (db.movements || []).filter(x => x.type === 'colormix' && x.date === m.date && x.staffName === m.staffName && x.productId);
    if (sibs.length) {
      const totalDeducted = sibs.reduce((sum, s) => sum + Math.abs(Number(s.qtyChange) || 0), 0);
      components = sibs.map(s => {
        const prod = typeof productById === 'function' ? productById(s.productId) : null;
        const sLiters = Math.abs(Number(s.qtyChange) || 0);
        let calcPct = totalDeducted > 0 ? Math.round((sLiters / totalDeducted) * 100) : 0;

        let pctStr = '';
        const sNote = String(s.note || '');
        const pMatch = sNote.match(/(\d+(?:\.\d+)?)\s*%/);
        if (pMatch) {
          calcPct = parseFloat(pMatch[1]);
          pctStr = `${calcPct}%`;
        } else if (calcPct > 0) {
          pctStr = `${calcPct}%`;
        }

        let containerSrc = '';
        const brkMatch = sNote.match(/\[(.*?)\]/);
        if (brkMatch && brkMatch[1]) {
          containerSrc = brkMatch[1].trim();
        } else if (s.containerSize) {
          containerSrc = `${s.containerSize}L container`;
        }

        const cleanName = (s.productName || (prod ? prod.name : 'Ingredient')).replace(/\s*\(for\s+.*?\s+mix\)$/i, '').trim();
        const origColor = prod && typeof getProductColorName === 'function' ? getProductColorName(prod) : (prod && prod.color && prod.color !== '-' ? prod.color : 'Standard');
        const hex = prod && typeof getProductDefaultColor === 'function' ? getProductDefaultColor(prod) : '';

        return {
          productId: s.productId,
          name: cleanName,
          brand: prod ? prod.brand : '',
          colorName: origColor,
          color: origColor,
          hex: hex,
          percentage: pctStr,
          pctNum: calcPct,
          liters: sLiters,
          containerSource: containerSrc
        };
      });
      rawFormula = components.map(c => `${c.percentage ? c.percentage + ' ' : ''}${c.name}`).join(' + ');
    }
  }

  // 4. Fallback to note formula string parsing
  if (!components.length && noteStr) {
    const fMatch = noteStr.match(/Formula:\s*([^·\r\n]+)/i);
    if (fMatch) {
      rawFormula = fMatch[1].trim();
      const parts = rawFormula.split('+').map(p => p.trim()).filter(Boolean);
      components = parts.map(part => {
        let pct = '';
        let pctNum = 0;
        let name = part;
        let compLiters = 0;

        const m1 = part.match(/^(\d+(?:\.\d+)?%)\s*(.+)$/);
        const m2 = part.match(/^(.+?)\s*\((\d+(?:\.\d+)?%)\)$/);
        if (m1) {
          pct = m1[1];
          pctNum = parseFloat(pct);
          name = m1[2].trim();
        } else if (m2) {
          pct = m2[2];
          pctNum = parseFloat(pct);
          name = m2[1].trim();
        }

        const litMatch = name.match(/\((\d+(?:\.\d+)?)\s*L\)$/i);
        if (litMatch) {
          compLiters = parseFloat(litMatch[1]);
          name = name.replace(/\s*\(\d+(?:\.\d+)?\s*L\)$/i, '').trim();
        } else if (pctNum && liters) {
          compLiters = Number((liters * (pctNum / 100)).toFixed(2));
        }

        const prod = (db.products || []).find(p => p.name.toLowerCase() === name.toLowerCase() || p.id === name);
        const origColor = prod && typeof getProductColorName === 'function' ? getProductColorName(prod) : (prod && prod.color && prod.color !== '-' ? prod.color : 'Standard');
        const hex = prod && typeof getProductDefaultColor === 'function' ? getProductDefaultColor(prod) : '';

        return {
          productId: prod ? prod.id : null,
          name: prod ? prod.name : name,
          brand: prod ? prod.brand : '',
          colorName: origColor,
          color: origColor,
          hex: hex,
          percentage: pct || (pctNum ? `${pctNum}%` : ''),
          pctNum: pctNum,
          liters: compLiters,
          containerSource: ''
        };
      });
    }
  }

  // Normalize and enhance each component with historical snapshot integrity
  components = components.map(c => {
    const prod = c.productId ? (typeof productById === 'function' ? productById(c.productId) : null) :
      (db.products || []).find(p => p.name.toLowerCase() === (c.name || '').toLowerCase());
    const prodName = c.name || (prod ? prod.name : 'Ingredient');
    const brand = c.brand || (prod ? prod.brand : '') || '';

    // Original color name: prioritize saved snapshot
    let colorName = c.colorName || c.color || '';
    if (!colorName || colorName === '-' || colorName.startsWith('#')) {
      if (prod && typeof getProductColorName === 'function') {
        colorName = getProductColorName(prod);
      } else if (prod && prod.color && prod.color !== '-' && !prod.color.startsWith('#')) {
        colorName = prod.color;
      }
    }
    if (!colorName) {
      if (typeof PAINT_COLOR_DICTIONARY !== 'undefined') {
        const found = PAINT_COLOR_DICTIONARY.find(d => prodName.toLowerCase().includes(d.name.toLowerCase()));
        if (found) colorName = found.name;
      }
    }
    if (!colorName) colorName = 'Standard';

    // Hex code: prioritize saved snapshot
    let hex = c.hex || c.colorHex || '';
    if (!hex || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.test(hex)) {
      if (prod && typeof getProductDefaultColor === 'function') {
        hex = getProductDefaultColor(prod);
      } else if (prod && (prod.colorHex || prod.color_hex)) {
        hex = prod.colorHex || prod.color_hex;
      }
      if (!hex && colorName && typeof PAINT_COLOR_DICTIONARY !== 'undefined') {
        const dict = PAINT_COLOR_DICTIONARY.find(d => d.name.toLowerCase() === colorName.toLowerCase());
        if (dict) hex = dict.hex;
      }
    }
    if (hex && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.test(hex)) {
      hex = '';
    }

    const pctNum = Number(c.pctNum || parseFloat(c.percentage || 0) || 0);
    const pct = c.percentage || (pctNum > 0 ? `${pctNum}%` : '');
    const compLiters = Number(c.liters || 0) || (liters && pctNum ? Number((liters * (pctNum / 100)).toFixed(2)) : 0);
    const containerSource = c.containerSource || (c.preferredCanSize ? `${c.preferredCanSize}L container` : '');

    return {
      productId: c.productId || (prod ? prod.id : null),
      name: prodName,
      brand: brand,
      colorName: colorName,
      color: colorName,
      hex: hex,
      percentage: pct,
      pctNum: pctNum,
      liters: compLiters,
      preferredCanSize: Number(c.preferredCanSize || 0),
      containerSource: containerSource
    };
  });

  // Freeze snapshot onto m to preserve data integrity against future product edits
  if (!m.components || !m.components.length) {
    m.components = components;
  }
  if (!m.hexColor && hexColor) {
    m.hexColor = hexColor;
  }

  if (noteStr) {
    extraNote = noteStr
      .replace(/Formula:\s*[^·\r\n]+/i, '')
      .replace(/Receipt:\s*[^·\r\n]+/i, '')
      .replace(/\bOR-[A-Za-z0-9\-]+\b/gi, '')
      .replace(/\[.*?\]/g, '')
      .replace(/^[·\s\-_:,]+|[·\s\-_:,]+$/g, '')
      .trim();
  }

  rawFormula = components.map(c => `${c.percentage ? c.percentage + ' ' : ''}${c.name} (${c.colorName}${c.hex ? ` ${c.hex}` : ''})`).join(' + ');

  return {
    id,
    rawMove: m,
    date,
    staff,
    liters,
    colorName,
    detectedName,
    baseType,
    hexColor,
    receiptRef,
    sale,
    components,
    rawFormula,
    extraNote,
    formulaString: components.map(c => `${c.percentage || ''} ${c.name} ${c.brand} ${c.colorName} ${c.hex}`).join(' ')
  };
}
window.extractMixingLogRecord = extractMixingLogRecord;

function openMixingDetailsModal(mixId) {
  if (!mixId) return;
  const m = (db.movements || []).find(x => x.id === mixId) ||
    (window._cachedMixingRecords || []).find(r => r.id === mixId || (r.rawMove && r.rawMove.id === mixId));
  if (!m) {
    if (typeof showToast === 'function') showToast('Mixing record not found.', 'error');
    return;
  }
  const rec = (m.rawMove && m.components) ? m : extractMixingLogRecord(m);
  if (!rec) return;

  const hexBadge = rec.hexColor ? `
    <span class="mixing-modal-hex-badge">
      <span class="modal-hex-dot" style="background:${rec.hexColor};"></span>
      <code>${escapeHtml(rec.hexColor)}</code>
    </span>
  ` : `
    <span class="mixing-modal-hex-badge missing">HEX not recorded</span>
  `;

  const bodyHtml = `
    <div class="mixing-modal-wrap">
      <!-- Final Mixed Color Hero Banner -->
      <div class="mixing-modal-hero">
        <div class="mixing-modal-swatch-box">
          ${rec.hexColor ? `
            <div class="mixing-modal-swatch" style="background:${rec.hexColor};" title="${escapeAttr(rec.colorName)} (${rec.hexColor})"></div>
          ` : `
            <div class="mixing-modal-swatch no-hex" title="${escapeAttr(rec.colorName)} (HEX not recorded)">?</div>
          `}
        </div>
        <div class="mixing-modal-hero-info">
          <div class="mixing-modal-tag">FINAL MIXED COLOR</div>
          <h2 class="mixing-modal-color-title">${escapeHtml(rec.colorName)}</h2>
          ${rec.detectedName && rec.detectedName.toLowerCase() !== rec.colorName.toLowerCase() ? `
            <div class="mixing-modal-detected-title">[${escapeHtml(rec.detectedName)}]</div>
          ` : ''}
          <div class="mixing-modal-hero-pills">
            ${hexBadge}
            <span class="mixing-modal-pill teal">
              <strong>${formatStock(rec.liters)} L</strong> Produced
            </span>
            <span class="mixing-modal-pill sand">
              <strong>${rec.components.length}</strong> Ingredient${rec.components.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <!-- Mixing Information Grid -->
      <div class="mixing-modal-section-title">Mixing Information</div>
      <div class="mixing-modal-info-grid">
        <div class="mixing-modal-card">
          <div class="info-label">Mixing Date &amp; Time</div>
          <div class="info-value font-mono">${formatDateTime(rec.date)}</div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Final Color Name</div>
          <div class="info-value"><strong>${escapeHtml(rec.colorName)}</strong></div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Final Color HEX Code</div>
          <div class="info-value">${rec.hexColor ? `<code class="formula-hex-code">${escapeHtml(rec.hexColor)}</code>` : '<span class="muted small">HEX not recorded</span>'}</div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Total Volume Produced</div>
          <div class="info-value font-mono" style="color:var(--teal-dark); font-weight:700;">${formatStock(rec.liters)} Liters</div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Number of Ingredients</div>
          <div class="info-value"><strong>${rec.components.length}</strong> paint ingredient${rec.components.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Receipt Reference</div>
          <div class="info-value">
            ${rec.receiptRef ? (currentUser && currentUser.role === 'admin' ? `
              <button type="button" class="receipt-ref-btn" onclick="openMixingReceiptModal('${escapeAttr(rec.receiptRef)}')" title="View receipt ${escapeAttr(rec.receiptRef)}">
                <span>🧾</span>
                <span>${escapeHtml(rec.receiptRef)}</span>
              </button>
            ` : `
              <span class="receipt-ref-static">
                <span>🧾</span>
                <span>${escapeHtml(rec.receiptRef)}</span>
              </span>
            `) : `
              <span class="muted small">Direct Inventory Mix (Internal)</span>
            `}
          </div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Staff / Cashier Responsible</div>
          <div class="info-value">${reportStaffLabel(rec.staff)}</div>
        </div>
        <div class="mixing-modal-card">
          <div class="info-label">Base Paint Type</div>
          <div class="info-value">${escapeHtml(rec.baseType || 'Automotive / Architectural Paint')}</div>
        </div>
        ${rec.extraNote ? `
          <div class="mixing-modal-card full-span">
            <div class="info-label">Service Note</div>
            <div class="info-value" style="font-style:italic;">${escapeHtml(rec.extraNote)}</div>
          </div>
        ` : ''}
      </div>

      <!-- Formula Breakdown -->
      <div class="mixing-modal-section-title" style="margin-top:18px;">
        <span>Formula Breakdown</span>
        <span class="muted small" style="font-weight:400; text-transform:none; margin-left:8px;">Exact paint colors, proportions &amp; measured volumes</span>
      </div>

      <div class="mixing-modal-ingredients-list">
        ${rec.components.length ? rec.components.map((c, idx) => `
          <div class="mixing-modal-ingredient-card">
            <div class="ingredient-card-header">
              <div class="ingredient-number">Ingredient #${idx + 1}</div>
              <div class="ingredient-pct-badge">${escapeHtml(c.percentage || (c.pctNum ? `${c.pctNum}%` : ''))}</div>
            </div>
            <div class="ingredient-card-body">
              <div class="ingredient-swatch-col">
                ${c.hex ? `
                  <div class="ingredient-modal-swatch" style="background:${c.hex};" title="Original: ${escapeAttr(c.colorName)} (${c.hex})"></div>
                ` : `
                  <div class="ingredient-modal-swatch no-hex" title="No HEX recorded">?</div>
                `}
              </div>
              <div class="ingredient-details-col">
                <div class="ingredient-prod-line">
                  <span class="ingredient-prod-name">${escapeHtml(c.name)}</span>
                  ${c.brand ? `<span class="ingredient-brand-badge">${escapeHtml(c.brand)}</span>` : ''}
                </div>
                <div class="ingredient-color-row">
                  <span class="ingredient-color-label">Original Paint Color:</span>
                  <strong class="ingredient-color-val">${escapeHtml(c.colorName || 'Standard')}</strong>
                  <span class="ingredient-hex-wrap">
                    ${c.hex ? `<code class="formula-hex-code">${escapeHtml(c.hex)}</code>` : `<span class="muted small">No HEX</span>`}
                  </span>
                </div>
                <div class="ingredient-metrics-row">
                  <div class="ingredient-metric">
                    <span class="metric-label">Formula Share:</span>
                    <strong class="metric-val">${escapeHtml(c.percentage || (c.pctNum ? `${c.pctNum}%` : '—'))}</strong>
                  </div>
                  <div class="ingredient-metric">
                    <span class="metric-label">Actual Volume Used:</span>
                    <strong class="metric-val teal">${c.liters ? `${formatStock(c.liters)} L` : '—'}</strong>
                  </div>
                  ${c.containerSource ? `
                    <div class="ingredient-metric full">
                      <span class="metric-label">Container Source:</span>
                      <span class="ingredient-src-badge">🫙 ${escapeHtml(c.containerSource)}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `).join('') : `
          <div class="empty-state" style="padding:16px; text-align:center;">
            ${rec.rawFormula ? escapeHtml(rec.rawFormula) : 'No ingredient components recorded.'}
          </div>
        `}
      </div>
    </div>
  `;

  const footHtml = `
    <div class="row wrap" style="gap:8px; width:100%; align-items:center;">
      ${rec.receiptRef && currentUser && currentUser.role === 'admin' ? `
        <button type="button" class="btn secondary" onclick="openMixingReceiptModal('${escapeAttr(rec.receiptRef)}')" style="display:inline-flex; align-items:center; gap:6px;">
          <span>🧾</span>
          <span>View Receipt ${escapeHtml(rec.receiptRef)}</span>
        </button>
      ` : ''}
      <div class="spacer"></div>
      <button type="button" class="btn" onclick="closeModal()">Close</button>
    </div>
  `;

  openModal('🎨 Color Mixing Service Details', bodyHtml, footHtml, 'modal-lg');
}
window.openMixingDetailsModal = openMixingDetailsModal;

function exportActiveReportCSV() {
  const table = document.querySelector('#report-body table');
  if (!table) {
    showToast('No report table available to export.', 'error');
    return;
  }
  const rows = [];
  table.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('th, td')).map(td => {
      let text = td.innerText.replace(/\r?\n/g, ' ').replace(/"/g, '""').trim();
      return `"${text}"`;
    });
    if (cells.length) rows.push(cells.join(','));
  });
  if (rows.length === 0) {
    showToast('No records found to export.', 'error');
    return;
  }
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\r\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  const fromStr = reportDateFrom || 'start';
  const toStr = reportDateTo || 'end';
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `MRGR_Report_${reportActiveTab}_${fromStr}_to_${toStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('✓ Report exported to CSV successfully.', 'ok');
}

function printActiveReport() {
  window.print();
}

function resetReportsSalesHistoryPagination() {
  if (typeof resetPaginationByPrefix === 'function') {
    resetPaginationByPrefix('rep_');
  }
  if (typeof resetPaginationPage === 'function') {
    resetPaginationPage('reports_sales_history');
  }
}

function getReportDatePreset() {
  return getDateRangePreset(reportDateFrom, reportDateTo);
}

function getReportSelectedYear() {
  const curY = getCurrentYear();
  if (reportYearFilter === 'current' || !reportYearFilter) return curY;
  const y = parseInt(reportYearFilter, 10);
  if (!isNaN(y)) return y;
  if (reportDateFrom && reportDateFrom.length >= 4) {
    const yf = parseInt(reportDateFrom.slice(0, 4), 10);
    if (!isNaN(yf)) return yf;
  }
  return curY;
}

function openReportCalendar(target, anchorEl, event) {
  openAppMonthDayPicker({
    target: target,
    anchorEl: anchorEl || document.getElementById(target === 'from' ? 'rep-from-wrap' : 'rep-to-wrap'),
    event: event,
    currentDate: (target === 'from' ? reportDateFrom : reportDateTo),
    otherDate: (target === 'from' ? reportDateTo : reportDateFrom),
    selectedYear: getReportSelectedYear,
    onSelect: function (iso) {
      if (target === 'from') {
        reportDateFrom = iso;
        if (reportDateTo && reportDateFrom > reportDateTo) reportDateTo = reportDateFrom;
      } else {
        reportDateTo = iso;
        if (reportDateFrom && reportDateTo < reportDateFrom) reportDateFrom = reportDateTo;
      }
      resetPaginationByPrefix('rep_');
      syncReportDateInputs();
      resetReportsSalesHistoryPagination();
      renderReportBody();
    }
  });
}

function updateReportDatePresetsUI() {
  const activePreset = getReportDatePreset();
  document.querySelectorAll('.rep-date-btn').forEach(btn => {
    const p = btn.getAttribute('data-preset');
    if (p === activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Sync Year select dropdown: Preserve selected year! Never reset to custom!
  const yearSelect = document.getElementById('rep-year-select');
  if (yearSelect) {
    if (!reportDateFrom && !reportDateTo) {
      yearSelect.value = 'all';
      reportYearFilter = 'all';
    } else if (reportYearFilter && reportYearFilter !== 'custom') {
      yearSelect.value = reportYearFilter;
    } else {
      yearSelect.value = 'current';
      reportYearFilter = 'current';
    }
  }

  // Sync Historical Records button
  const histBtn = document.getElementById('rep-historical-btn');
  if (histBtn) {
    if (isHistoricalView(reportDateFrom, reportDateTo)) {
      histBtn.classList.add('active');
    } else {
      histBtn.classList.remove('active');
    }
  }

  const summaryEl = document.getElementById('rep-date-summary');
  if (summaryEl) {
    summaryEl.innerHTML = formatDateRangeSummary(reportDateFrom, reportDateTo, 'Report period:');
  }
  const clearBtn = document.getElementById('rep-clear-date-btn');
  if (clearBtn) {
    clearBtn.style.display = (reportDateFrom || reportDateTo) ? 'inline-flex' : 'none';
  }
}

function syncReportDateInputs() {
  const fromEl = document.getElementById('rep-from');
  const toEl = document.getElementById('rep-to');
  if (fromEl) {
    fromEl.value = formatDateInputMMDDYYYY(reportDateFrom);
  }
  if (toEl) {
    toEl.value = formatDateInputMMDDYYYY(reportDateTo);
  }
  updateReportDatePresetsUI();
}

function onReportYearChange(val) {
  closeAppMonthDayPicker();
  const curY = getCurrentYear();
  if (val === 'all') {
    reportDateFrom = '';
    reportDateTo = '';
    reportYearFilter = 'all';
  } else {
    const targetYear = (val === 'current') ? curY : (parseInt(val, 10) || curY);
    reportYearFilter = (val === 'current') ? 'current' : String(targetYear);
    reportDateFrom = updateDateYearISO(reportDateFrom, targetYear, '01-01');
    reportDateTo = updateDateYearISO(reportDateTo, targetYear, (targetYear === curY ? todayISO().slice(5) : '12-31'));
    if (reportDateFrom && reportDateTo && reportDateFrom > reportDateTo) {
      reportDateFrom = reportDateTo;
    }
  }
  syncReportDateInputs();
  resetReportsSalesHistoryPagination();
  renderReportBody();
}

function toggleReportHistoricalRecords() {
  if (isHistoricalView(reportDateFrom, reportDateTo)) {
    // Return to current year
    setReportDatePreset('year');
  } else {
    // Switch to all-time historical reports
    reportDateFrom = '';
    reportDateTo = '';
    reportYearFilter = 'all';
    syncReportDateInputs();
    resetReportsSalesHistoryPagination();
    renderReportBody();
  }
}

function setReportDatePreset(preset) {
  const today = todayISO();
  const curY = getCurrentYear();
  if (preset === 'today') {
    reportDateFrom = today;
    reportDateTo = today;
    reportYearFilter = 'current';
  } else if (preset === 'yesterday') {
    const yest = daysAgoISO(1);
    reportDateFrom = yest;
    reportDateTo = yest;
    reportYearFilter = 'current';
  } else if (preset === '7d') {
    reportDateFrom = daysAgoISO(6);
    reportDateTo = today;
    reportYearFilter = 'current';
  } else if (preset === '30d') {
    reportDateFrom = daysAgoISO(29);
    reportDateTo = today;
    reportYearFilter = 'current';
  } else if (preset === 'month') {
    reportDateFrom = thisMonthStartISO();
    reportDateTo = today;
    reportYearFilter = 'current';
  } else if (preset === 'year') {
    reportDateFrom = currentYearStartISO(curY);
    reportDateTo = currentYearEndISO(curY);
    reportYearFilter = 'current';
  } else if (preset === 'all') {
    reportDateFrom = '';
    reportDateTo = '';
    reportYearFilter = 'all';
  }
  syncReportDateInputs();
  resetReportsSalesHistoryPagination();
  renderReportBody();
}

function onReportDateChange() {
  const fromEl = document.getElementById('rep-from');
  const toEl = document.getElementById('rep-to');
  let f = fromEl ? fromEl.value : '';
  let t = toEl ? toEl.value : '';
  if (f && t && f > t) {
    const tmp = f;
    f = t;
    t = tmp;
    if (fromEl) fromEl.value = f;
    if (toEl) toEl.value = t;
  }
  reportDateFrom = f;
  reportDateTo = t;
  // Preserve selected year; do NOT set to custom
  updateReportDatePresetsUI();
  resetReportsSalesHistoryPagination();
  renderReportBody();
}

function clearReportDates() {
  setReportDatePreset('all');
}

function setReportDateRange(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) setReportDatePreset('all');
  else if (daysAgo === 0) setReportDatePreset('today');
  else if (daysAgo === 1) setReportDatePreset('yesterday');
  else if (daysAgo === 6) setReportDatePreset('7d');
  else if (daysAgo === 29) setReportDatePreset('30d');
  else {
    reportDateFrom = daysAgoISO(daysAgo);
    reportDateTo = todayISO();
    syncReportDateInputs();
    resetReportsSalesHistoryPagination();
    renderReportBody();
  }
}

function resetAllReportFilters() {
  const curY = getCurrentYear();
  reportDateFrom = currentYearStartISO(curY);
  reportDateTo = currentYearEndISO(curY);
  reportYearFilter = 'current';
  reportProductFilter = 'all';
  reportBrandFilter = 'all';
  reportSupplierFilter = 'all';
  reportTxTypeFilter = 'all';
  reportSearchQuery = '';
  reportMixingSortField = 'date';
  reportMixingSortAsc = false;
  const searchInput = document.getElementById('rep-search-input');
  if (searchInput) searchInput.value = '';
  const prodSelect = document.getElementById('rep-product-filter');
  if (prodSelect) prodSelect.value = 'all';
  const brandSelect = document.getElementById('rep-brand-filter');
  if (brandSelect) brandSelect.value = 'all';
  const supSelect = document.getElementById('rep-supplier-filter');
  if (supSelect) supSelect.value = 'all';
  const txSelect = document.getElementById('rep-txtype-filter');
  if (txSelect) txSelect.value = 'all';
  syncReportDateInputs();
  resetReportsSalesHistoryPagination();
  renderReportBody();
}

/* ============================================================
   LOW-STOCK REPORT DATA CALCULATION & FILTERING
   - Strictly includes ONLY container sizes that are LOW STOCK or OUT OF STOCK
   - Completely excludes GOOD STOCK container sizes by default
   - Excludes products that have zero Low/Out container sizes
   - Uses actual per-container-size minimum stock thresholds from DB
   ============================================================ */
function getLowStockReportData() {
  const active = typeof activeProducts === 'function' ? activeProducts() : ((window.db && window.db.products) || []).filter(p => p.status === 'active');
  const products = [];
  let totalLowSizes = 0;
  let totalOutSizes = 0;

  active.forEach(p => {
    let sizes = (typeof productSizes === 'function' ? productSizes(p) : (p.sizes || [1])).slice().sort((a, b) => Number(a) - Number(b));
    if (!sizes.length) sizes = [1];

    const affectedSizes = [];
    sizes.forEach(s => {
      const count = typeof productCanCount === 'function' ? productCanCount(p, s) : Number((p.canStock && p.canStock[s]) || 0);
      const thresh = typeof productSizeThreshold === 'function' ? productSizeThreshold(p, s) : Number((p.thresholdBySize && p.thresholdBySize[s]) || 5);

      // Stock Status Calculation per container size:
      // - OUT OF STOCK: Available stock is zero.
      // - LOW STOCK: Available stock is greater than zero but at or below configured minimum threshold.
      // - GOOD STOCK: Available stock is above configured minimum threshold.
      let st = 'ok';
      if (count <= 0) {
        st = 'out';
      } else if (count <= thresh) {
        st = 'low';
      } else {
        st = 'ok';
      }

      // Default filtering: ONLY display LOW STOCK and OUT OF STOCK container sizes; exclude GOOD STOCK
      if (st === 'out' || st === 'low') {
        if (st === 'out') totalOutSizes++;
        if (st === 'low') totalLowSizes++;

        const stockVol = count * s;
        const threshVol = thresh * s;
        const variant = typeof productSizeVariantBySize === 'function' ? productSizeVariantBySize(p, s) : null;

        affectedSizes.push({
          size: s,
          count,
          threshold: thresh,
          stockVol,
          threshVol,
          status: st,
          variant
        });
      }
    });

    // If a product has no Low Stock or Out of Stock sizes, completely exclude it from report
    if (affectedSizes.length > 0) {
      products.push({
        product: p,
        sizes: affectedSizes
      });
    }
  });

  // Sort products alphabetically by name
  products.sort((a, b) => (a.product.name || '').localeCompare(b.product.name || ''));

  return {
    products,
    totalProducts: products.length,
    totalRestockSizes: totalLowSizes + totalOutSizes,
    totalLowSizes,
    totalOutSizes
  };
}


function renderReportFilterToolbarHtml() {
  return '';
}

function reportsPage() {
  const curY = getCurrentYear();
  const availableYears = getAvailableRecordYears();
  const selectedYear = getReportSelectedYear();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const low = lowStockProducts();
  const lowStockSummary = getLowStockReportData();
  const activePreset = getReportDatePreset();
  const hasDates = Boolean(reportDateFrom || reportDateTo);
  const isHistorical = isHistoricalView(reportDateFrom, reportDateTo);

  // If non-admin had admin-only tab selected, default to inventory
  if (!isAdmin && (reportActiveTab === 'sales' || reportActiveTab === 'history' || reportActiveTab === 'returns')) {
    reportActiveTab = 'all';
  }

  return `
  <div class="panel" style="padding:0; overflow:hidden;">
    <div class="panel-head row wrap" style="gap:12px; padding:14px 18px 10px;">
      <div>
        <h3 style="margin:0; font-size:16px;">Reports &amp; Analytics</h3>
        <span class="muted small">Business performance, inventory turnover, and transaction logs</span>
      </div>
      <div class="spacer"></div>
      <div class="row" style="gap:6px;">
        <button type="button" class="btn ghost small" onclick="resetAllReportFilters()" title="Reset date filters to current year">Reset All</button>
        <button type="button" class="btn secondary small" onclick="renderReportBody()">↻ Refresh</button>
      </div>
    </div>

    <!-- Dedicated Date Range Bar, Year Selector & Historical Records Option -->
    <div class="audit-date-bar" style="padding:10px 18px; border-top:1px dashed var(--line-light); border-bottom:1px solid var(--line-light); background:#FBF9F4;">
      <div class="audit-date-group">
        <!-- Year Selector (Defaults to Current Year) -->
        <div class="audit-year-wrap">
          <label for="rep-year-select" class="audit-date-label">📅 Year:</label>
          <select id="rep-year-select" class="audit-year-select" onchange="onReportYearChange(this.value)" title="Filter reports by calendar year">
            <option value="current" ${reportYearFilter === 'current' ? 'selected' : ''}>${curY} (Current Year)</option>
            ${availableYears.filter(y => y !== curY).map(y => `<option value="${y}" ${reportYearFilter === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
            <option value="all" ${reportYearFilter === 'all' ? 'selected' : ''}>All Recorded Years</option>
          </select>
        </div>

        <span class="audit-date-sep">|</span>

        <label class="audit-date-label">Date Range:</label>
        <div class="audit-date-field app-monthday-picker-field" id="rep-from-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openReportCalendar('from', this, event)">
          <span class="field-tag">From</span>
          <input id="rep-from"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatDateInputMMDDYYYY(reportDateFrom))}"
            readonly
            onclick="openReportCalendar('from', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openReportCalendar('from', document.getElementById('rep-from-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <span class="audit-date-sep">to</span>
        <div class="audit-date-field app-monthday-picker-field" id="rep-to-wrap" title="Click to select Month and Day (Year: ${selectedYear})" onclick="openReportCalendar('to', this, event)">
          <span class="field-tag">To</span>
          <input id="rep-to"
            type="text"
            class="app-monthday-input"
            placeholder="MM/DD/YYYY"
            value="${escapeHtml(formatDateInputMMDDYYYY(reportDateTo))}"
            readonly
            onclick="openReportCalendar('to', this, event)">
          <button type="button" class="app-cal-trigger-btn" onclick="openReportCalendar('to', document.getElementById('rep-to-wrap'), event)" title="Open calendar (Month and Day)">📅</button>
        </div>
        <button type="button" id="rep-clear-date-btn" class="audit-clear-date-btn" onclick="clearReportDates()" title="Show all time" style="display:${hasDates ? 'inline-flex' : 'none'};">✕</button>
      </div>

      <div class="audit-date-shortcuts">
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'today' ? 'active' : ''}" data-preset="today" onclick="setReportDatePreset('today')" title="Today's data">Today</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'yesterday' ? 'active' : ''}" data-preset="yesterday" onclick="setReportDatePreset('yesterday')" title="Yesterday's data">Yesterday</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === '7d' ? 'active' : ''}" data-preset="7d" onclick="setReportDatePreset('7d')" title="Last 7 days">7D</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === '30d' ? 'active' : ''}" data-preset="30d" onclick="setReportDatePreset('30d')" title="Last 30 days">30D</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'month' ? 'active' : ''}" data-preset="month" onclick="setReportDatePreset('month')" title="This month to date">This Month</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'year' ? 'active' : ''}" data-preset="year" onclick="setReportDatePreset('year')" title="Current year reports">This Year (${curY})</button>
        <button type="button" class="audit-date-btn rep-date-btn ${activePreset === 'custom' ? 'active' : ''}" data-preset="custom" onclick="openReportCalendar('from', document.getElementById('rep-from-wrap'), event)" title="Custom date range">Custom Range</button>

        <!-- Separate Historical Records viewing option for authorized users -->
        <button type="button" id="rep-historical-btn" class="audit-historical-btn ${isHistorical ? 'active' : ''}" onclick="toggleReportHistoricalRecords()" title="View complete historical business &amp; inventory records across all years">
          🏛️ Historical Records
        </button>
      </div>

      <div class="audit-date-info" id="rep-date-summary">
        ${formatDateRangeSummary(reportDateFrom, reportDateTo, 'Report period:')}
      </div>
    </div>

    <!-- Toggle Menu Bar -->
    <div class="report-toggle-bar">
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'all' ? 'active' : ''}" data-tab="all" onclick="setReportTab('all')">
        <span class="rt-icon">📑</span> All Reports
      </button>
      ${isAdmin ? `
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'sales' ? 'active' : ''}" data-tab="sales" onclick="setReportTab('sales')">
          <span class="rt-icon">📊</span> Sales &amp; Revenue
        </button>
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'history' ? 'active' : ''}" data-tab="history" onclick="setReportTab('history')">
          <span class="rt-icon">🧾</span> Sales History
        </button>
      ` : ''}
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'inventory' ? 'active' : ''}" data-tab="inventory" onclick="setReportTab('inventory')">
        <span class="rt-icon">📦</span> Inventory Stock
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'low_stock' ? 'active' : ''}" data-tab="low_stock" onclick="setReportTab('low_stock')">
        <span class="rt-icon">⚠️</span> Low-Stock
        ${lowStockSummary.totalRestockSizes ? `<span class="badge low" style="margin-left:5px; font-size:10.5px; padding:1px 6px;">${lowStockSummary.totalRestockSizes} Low</span>` : ''}
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'transactions' ? 'active' : ''}" data-tab="transactions" onclick="setReportTab('transactions')">
        <span class="rt-icon">📜</span> Movements
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'purchase_orders' ? 'active' : ''}" data-tab="purchase_orders" onclick="setReportTab('purchase_orders')">
        <span class="rt-icon">📋</span> Purchase Orders
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'receiving' ? 'active' : ''}" data-tab="receiving" onclick="setReportTab('receiving')">
        <span class="rt-icon">🚚</span> Receiving Log
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'supplier_report' ? 'active' : ''}" data-tab="supplier_report" onclick="setReportTab('supplier_report')">
        <span class="rt-icon">🏢</span> Supplier Report
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'previous_inventory' ? 'active' : ''}" data-tab="previous_inventory" onclick="setReportTab('previous_inventory')">
        <span class="rt-icon">📋</span> Turnover
      </button>
      <button type="button" class="report-toggle-btn ${reportActiveTab === 'mixing' ? 'active' : ''}" data-tab="mixing" onclick="setReportTab('mixing')">
        <span class="rt-icon">🎨</span> Color Mixing
      </button>
      ${isAdmin ? `
        <button type="button" class="report-toggle-btn ${reportActiveTab === 'returns' ? 'active' : ''}" data-tab="returns" onclick="setReportTab('returns')">
          <span class="rt-icon">↩️</span> Returns
        </button>
      ` : ''}
    </div>
  </div>

  <div id="report-body">${reportBodyHtml(reportDateFrom, reportDateTo)}</div>
  `;
}

function setReportTab(tab) {
  reportActiveTab = tab;
  resetReportsSalesHistoryPagination();
  document.querySelectorAll('.report-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  if (typeof syncRouteState === 'function') syncRouteState({ push: true });
  renderReportBody();
}

if (typeof goToReportsSalesHistory === 'undefined') {
  window.goToReportsSalesHistory = function () {
    reportActiveTab = 'history';
    if (typeof resetReportsSalesHistoryPagination === 'function') {
      resetReportsSalesHistoryPagination();
    }
    goTo('reports');
    setReportTab('history');
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
}

function renderReportBody() {
  const container = document.getElementById('report-body');
  if (container) {
    container.innerHTML = reportBodyHtml(reportDateFrom, reportDateTo);
    if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  }
}

/* ============================================================
   TOP PRODUCTS SOLD: PRODUCT OVERVIEW & SIZE / VARIANT BREAKDOWN
   ============================================================ */
let topProductsViewMode = 'overview'; // 'overview' | 'breakdown'
let topProductsRanking = 'qty'; // 'qty' | 'revenue' | 'transactions'
let topProductsExpandedKeys = new Set();

function setTopProductsViewMode(mode) {
  topProductsViewMode = mode;
  resetPaginationPage(['rep_top_products', 'rep_top_variants']);
  renderTopProductsPanel();
}

function setTopProductsRanking(method) {
  topProductsRanking = method;
  resetPaginationPage(['rep_top_products', 'rep_top_variants']);
  renderTopProductsPanel();
}

function toggleTopProductExpand(key) {
  if (topProductsExpandedKeys.has(key)) {
    topProductsExpandedKeys.delete(key);
  } else {
    topProductsExpandedKeys.add(key);
  }
  const detailRow = document.getElementById(`top-prod-detail-${key}`);
  const toggleBtn = document.getElementById(`top-prod-toggle-btn-${key}`);
  const chevron = document.getElementById(`top-prod-chevron-${key}`);
  const mainRow = document.getElementById(`top-prod-row-${key}`);
  if (detailRow && toggleBtn) {
    const isExpanded = topProductsExpandedKeys.has(key);
    detailRow.style.display = isExpanded ? '' : 'none';
    toggleBtn.innerHTML = isExpanded ? '▴ Close' : '▾ Details';
    toggleBtn.className = `btn ${isExpanded ? 'ghost' : 'secondary'} small`;
    if (chevron) chevron.textContent = isExpanded ? '▼' : '▶';
    if (mainRow) mainRow.style.background = isExpanded ? '#FAF7F0' : '';
  } else {
    renderTopProductsPanel();
  }
}

function toggleAllTopProductsExpand() {
  const currentSales = salesBetween(reportDateFrom, reportDateTo);
  const data = getTopProductsData(currentSales);
  const allKeys = data.products.map(p => p.key);
  const allExpanded = allKeys.length > 0 && allKeys.every(k => topProductsExpandedKeys.has(k));
  if (allExpanded) {
    topProductsExpandedKeys.clear();
  } else {
    allKeys.forEach(k => topProductsExpandedKeys.add(k));
  }
  renderTopProductsPanel();
}

function renderTopProductsPanel() {
  const container = document.getElementById('top-products-panel-container');
  if (container) {
    const sales = salesBetween(reportDateFrom, reportDateTo);
    container.outerHTML = renderTopProductsSectionHtml(sales);
    if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  } else {
    renderReportBody();
  }
}

function getTopProductsData(sales) {
  const productMap = new Map();
  const allSalesWithProducts = new Set();

  (sales || []).forEach(sale => {
    if (!sale) return;
    const rawSt = String(sale.status || 'completed').trim().toLowerCase();
    if (rawSt === 'voided' || rawSt === 'void' || rawSt === 'cancelled' || rawSt === 'canceled') return;
    const saleId = sale.id || sale.receiptNo || ('s_' + sale.date);
    (sale.items || []).forEach(item => {
      if (item.type && item.type !== 'product') return;
      if (!item.name && !item.productId) return;

      allSalesWithProducts.add(saleId);

      const p = productById(item.productId);
      const prodName = (p && (p.name || p.productName)) ? (p.name || p.productName).trim() : (item.name || 'Unnamed Product').trim();
      const prodBrand = (p && p.brand) ? p.brand.trim() : (item.brand || 'Generic').trim();
      const prodKey = `${prodBrand}___${prodName}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

      // Resolve color code (hex) and color name
      let hex = '';
      if (p) {
        try { hex = getProductHex(p); } catch (e) { hex = ''; }
      }
      if (!hex && item.hexColor) hex = item.hexColor;
      if (!hex && item.color && item.color.startsWith('#')) hex = item.color;
      if (!hex && p && p.color && p.color.startsWith('#')) hex = p.color;
      if (!hex) hex = '#1F6F6B';

      let colorName = '';
      if (item.colorName && item.colorName !== '-') {
        colorName = item.colorName;
      } else if (item.color && item.color !== '-' && !item.color.startsWith('#')) {
        colorName = item.color;
      } else if (p && p.color && p.color !== '-' && !p.color.startsWith('#')) {
        colorName = p.color;
      } else if (typeof hexToRgb === 'function' && typeof detectMixedColorName === 'function' && hex) {
        try {
          const rgb = hexToRgb(hex);
          if (rgb) {
            const det = detectMixedColorName(rgb.r, rgb.g, rgb.b);
            if (det && det.name) colorName = det.name;
          }
        } catch (e) { }
      }
      if (!colorName) colorName = (hex ? hex : 'Standard');

      // Container Size
      let sizeVal = normalizeCanSize(item.size);
      if (!sizeVal && item.size) {
        const sStr = String(item.size).toLowerCase();
        if (sStr.includes('gallon')) sizeVal = 4;
        else if (sStr.includes('drum')) sizeVal = 16;
        else sizeVal = parseFloat(item.size) || 1;
      }
      if (!sizeVal) sizeVal = 1;

      // Variant SizeId if known
      const variantObj = p ? productSizeVariantBySize(p, sizeVal) : null;
      const sizeId = item.sizeId || (variantObj ? variantObj.sizeId : null);

      // Quantities, lineTotal, unitPrice (Preserving historical transaction prices)
      const qty = Number(item.qty) || 0;
      const lineTotal = Number(item.lineTotal !== undefined ? item.lineTotal : (qty * (Number(item.unitPrice) || 0))) || 0;
      const unitPrice = (item.unitPrice !== undefined && item.unitPrice !== null && !isNaN(Number(item.unitPrice)))
        ? Number(item.unitPrice)
        : (qty > 0 ? Number((lineTotal / qty).toFixed(2)) : 0);

      // Parent product grouping (combines across all colors and container sizes)
      if (!productMap.has(prodKey)) {
        productMap.set(prodKey, {
          key: prodKey,
          name: prodName,
          brand: prodBrand,
          productId: (p && (p.productId || p.id)) || item.productId || '',
          totalQty: 0,
          totalRevenue: 0,
          transactionSet: new Set(),
          variantsMap: new Map()
        });
      }
      const parent = productMap.get(prodKey);
      parent.totalQty += qty;
      parent.totalRevenue += lineTotal;
      parent.transactionSet.add(saleId); // Distinct sale IDs! Avoids duplicate counting!

      // Detailed variation grouping:
      // "Do not combine different colors and sizes in the detailed breakdown."
      const variantKey = `${hex.toUpperCase()}___${colorName.toLowerCase()}___${sizeVal}`;
      if (!parent.variantsMap.has(variantKey)) {
        parent.variantsMap.set(variantKey, {
          key: variantKey,
          parentKey: prodKey,
          productName: prodName,
          brand: prodBrand,
          colorName: colorName,
          hex: hex,
          size: sizeVal,
          sizeId: sizeId,
          qty: 0,
          revenue: 0,
          transactionSet: new Set(),
          unitPrices: new Set()
        });
      }
      const v = parent.variantsMap.get(variantKey);
      v.qty += qty;
      v.revenue += lineTotal;
      v.transactionSet.add(saleId);
      if (unitPrice > 0) {
        v.unitPrices.add(unitPrice);
      }
      if (!v.sizeId && sizeId) v.sizeId = sizeId;
    });
  });

  // Convert parent products and variants
  const allVariants = [];
  const products = Array.from(productMap.values()).map(p => {
    const variants = Array.from(p.variantsMap.values()).map(v => {
      const vObj = {
        ...v,
        transactionCount: v.transactionSet.size,
        unitPricesList: Array.from(v.unitPrices).sort((a, b) => a - b),
        revenue: Number(v.revenue.toFixed(2))
      };
      allVariants.push(vObj);
      return vObj;
    });

    return {
      ...p,
      transactionCount: p.transactionSet.size, // Avoid duplicate counting!
      totalRevenue: Number(p.totalRevenue.toFixed(2)),
      variants: variants
    };
  });

  const overallQty = products.reduce((sum, p) => sum + p.totalQty, 0);
  const overallRevenue = Number(products.reduce((sum, p) => sum + p.totalRevenue, 0).toFixed(2));
  const overallUniqueTrans = allSalesWithProducts.size;

  return {
    products,
    allVariants,
    overallQty,
    overallRevenue,
    overallUniqueTrans
  };
}

function sortTopProductItems(items, rankingMethod, isParent = true) {
  return items.slice().sort((a, b) => {
    let diff = 0;
    if (rankingMethod === 'revenue') {
      const revA = isParent ? a.totalRevenue : a.revenue;
      const revB = isParent ? b.totalRevenue : b.revenue;
      diff = revB - revA;
    } else if (rankingMethod === 'transactions') {
      diff = b.transactionCount - a.transactionCount;
    } else {
      // Default: 'qty'
      const qtyA = isParent ? a.totalQty : a.qty;
      const qtyB = isParent ? b.totalQty : b.qty;
      diff = qtyB - qtyA;
    }
    if (diff !== 0) return diff;
    const nameA = (a.name || a.productName || '').toLowerCase();
    const nameB = (b.name || b.productName || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function formatHistoricalPrices(pricesList) {
  if (!pricesList || !pricesList.length) {
    return '<span class="muted">—</span>';
  }
  if (pricesList.length === 1) {
    return `<strong style="font-family:'Space Grotesk',monospace; font-size:12.5px;">${peso(pricesList[0])}</strong>`;
  }
  const min = pricesList[0];
  const max = pricesList[pricesList.length - 1];
  const allListStr = pricesList.map(p => peso(p)).join(', ');
  return `
    <div>
      <strong style="font-family:'Space Grotesk',monospace; font-size:12.5px;" title="Historical transaction prices: ${allListStr}">
        ${peso(min)} – ${peso(max)}
      </strong>
      <div class="muted small" style="font-size:10px; color:var(--ink-soft);" title="${allListStr}">
        (${pricesList.length} recorded prices)
      </div>
    </div>`;
}

function formatContainerSizeBadge(size, sizeId) {
  const szNum = normalizeCanSize(size);
  const szBadge = `<span class="badge" style="background:#FAF8F5; border:1px solid #E5DDCF; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink); font-size:11.5px; padding:2px 7px;">${fmtSize(szNum)}</span>`;
  return `<div style="display:inline-flex; align-items:center; gap:5px; justify-content:center;">${szBadge}</div>`;
}

function formatColorVariantCell(colorName, hex) {
  const safeHex = hex || '#1F6F6B';
  const safeName = colorName || 'Standard';
  return `
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="cm-color-dot" style="background:${safeHex}; width:15px; height:15px; border-radius:50%; display:inline-block; border:1px solid rgba(0,0,0,0.18); flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.12);" title="${escapeHtml(safeName)} (${safeHex})"></span>
      <div>
        <div style="font-weight:600; font-size:12.5px; color:var(--ink);">${escapeHtml(safeName)}</div>
        <code style="font-family:'Space Grotesk',monospace; font-size:11px; font-weight:700; color:var(--teal);">(${safeHex})</code>
      </div>
    </div>`;
}

function formatRankBadge(rankIndex) {
  const r = rankIndex + 1;
  let bg = '#F2EDE4', fg = 'var(--ink)', border = '#E5DDCF';
  if (r === 1) { bg = '#FEF3C7'; fg = '#92400E'; border = '#FCD34D'; }
  else if (r === 2) { bg = '#F3F4F6'; fg = '#374151'; border = '#D1D5DB'; }
  else if (r === 3) { bg = '#FFEDD5'; fg = '#9A3412'; border = '#FDBA74'; }
  return `<span style="display:inline-flex; align-items:center; justify-content:center; width:25px; height:25px; border-radius:50%; background:${bg}; color:${fg}; border:1px solid ${border}; font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:11.5px;">${r}</span>`;
}

function renderTopProductsSectionHtml(sales) {
  const data = getTopProductsData(sales);
  const { products, allVariants, overallQty, overallRevenue, overallUniqueTrans } = data;

  const sortedProducts = sortTopProductItems(products, topProductsRanking, true);
  const sortedVariants = sortTopProductItems(allVariants, topProductsRanking, false);

  const prodPag = paginateArray(sortedProducts, 'rep_top_products', {
    onUpdate: renderTopProductsPanel,
    scrollTarget: '#top-products-panel-container',
    recordLabel: 'products'
  });
  const varPag = paginateArray(sortedVariants, 'rep_top_variants', {
    onUpdate: renderTopProductsPanel,
    scrollTarget: '#top-products-panel-container',
    recordLabel: 'variations'
  });
  const activeTopPag = topProductsViewMode === 'overview' ? prodPag : varPag;

  const allKeys = products.map(p => p.key);
  const isAllExpanded = allKeys.length > 0 && allKeys.every(k => topProductsExpandedKeys.has(k));

  return `
    <div id="top-products-panel-container" class="panel" style="margin-top:20px;">
      <div class="panel-head row wrap" style="gap:12px; align-items:center; padding:12px 18px; border-bottom:1px solid var(--line-light);">
        <div>
          <h3 style="margin:0; font-size:15px; display:inline-flex; align-items:center; gap:8px;">
            Top Products Sold
            <span class="badge" style="font-size:11px; padding:2px 8px; font-weight:600; background:#F2EDE4; border:1px solid var(--line); color:var(--ink-soft);">
              ${products.length} Products &bull; ${allVariants.length} Variations
            </span>
          </h3>
        </div>
        <div class="spacer"></div>
        <div class="row wrap" style="gap:10px; align-items:center;">
          <!-- Two Viewing Modes -->
          <div class="btn-group" style="display:inline-flex; border:1px solid var(--line); border-radius:var(--radius-sm); overflow:hidden; background:#FAF8F5;">
            <button type="button" 
              class="btn small ${topProductsViewMode === 'overview' ? 'primary' : 'ghost'}" 
              style="border:none; border-radius:0; padding:5px 12px; font-size:12px; font-weight:600;" 
              onclick="setTopProductsViewMode('overview')" 
              title="Product Overview (Default): One main row per product with expandable size &amp; color breakdown">
              🏢 Product Overview
            </button>
            <button type="button" 
              class="btn small ${topProductsViewMode === 'breakdown' ? 'primary' : 'ghost'}" 
              style="border:none; border-radius:0; padding:5px 12px; font-size:12px; font-weight:600;" 
              onclick="setTopProductsViewMode('breakdown')" 
              title="Size &amp; Variant Breakdown: Each color and container size as a separate row">
              🎨 Size &amp; Variant Breakdown
            </button>
          </div>

          <!-- Ranking Method Selector -->
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <label for="top-prod-rank-select" class="muted small" style="font-size:11.5px; font-weight:600;">Rank by:</label>
            <select id="top-prod-rank-select" class="audit-year-select" style="padding:4px 8px; font-size:12px; border-radius:var(--radius-sm); border:1px solid var(--line); background:#FFFFFF;" onchange="setTopProductsRanking(this.value)" title="Select ranking method for Top Products">
              <option value="qty" ${topProductsRanking === 'qty' ? 'selected' : ''}>Quantity Sold (High to Low)</option>
              <option value="revenue" ${topProductsRanking === 'revenue' ? 'selected' : ''}>Total Revenue (High to Low)</option>
              <option value="transactions" ${topProductsRanking === 'transactions' ? 'selected' : ''}>Number of Transactions (High to Low)</option>
            </select>
          </div>

          ${topProductsViewMode === 'overview' && sortedProducts.length ? `
            <button type="button" class="btn ghost small" style="padding:4px 10px; font-size:12px; border-color:var(--line);" onclick="toggleAllTopProductsExpand()" title="Expand or collapse all product variation details">
              ${isAllExpanded ? '▴ Collapse All' : '▾ Expand All'}
            </button>
          ` : ''}
        </div>
      </div>

      <div class="panel-body tight table-scroll">
        ${!products.length ? `
          <div class="empty-state" style="text-align:center; padding:36px 16px;">
            <div style="font-size:22px; margin-bottom:4px;">📦</div>
            <div style="font-weight:600; color:var(--ink);">No product sales recorded in this date range.</div>
            <div class="muted small" style="margin-top:2px;">Try adjusting the date filters above or selecting "All Recorded Years".</div>
          </div>
        ` : (topProductsViewMode === 'overview' ? `
          <!-- VIEW MODE A: PRODUCT OVERVIEW (DEFAULT) -->
          <table class="table-hover" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#FAF8F5;">
                <th style="width:45px; text-align:center;">#</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th class="right" style="min-width:110px;">Total Qty Sold</th>
                <th class="right" style="min-width:120px;">Total Revenue</th>
                <th class="right" style="min-width:110px;">Transactions</th>
                <th class="center" style="width:105px;">Variations</th>
              </tr>
            </thead>
            <tbody>
              ${prodPag.pagedItems.map((p, idx) => {
    const rankIdx = (prodPag.startRow > 0 ? prodPag.startRow - 1 : 0) + idx;
    const isExpanded = topProductsExpandedKeys.has(p.key);
    const sortedPVariants = sortTopProductItems(p.variants, topProductsRanking, false);
    return `
                  <tr id="top-prod-row-${p.key}" 
                      class="top-prod-main-row" 
                      style="cursor:pointer; background:${isExpanded ? '#FAF7F0' : (idx % 2 === 1 ? '#FCFBF9' : '#FFFFFF')}; transition:background .15s;" 
                      onclick="toggleTopProductExpand('${p.key}')" 
                      title="Click to ${isExpanded ? 'collapse' : 'expand'} color and size breakdown">
                    <td class="center" style="vertical-align:middle;">
                      ${formatRankBadge(rankIdx)}
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span id="top-prod-chevron-${p.key}" style="font-size:11px; color:var(--ink-soft); width:14px; display:inline-block; transition:transform .15s;">
                          ${isExpanded ? '▼' : '▶'}
                        </span>
                        <div>
                          <strong style="color:var(--ink); font-size:13.5px;">${escapeHtml(p.name)}</strong>
                          <span class="badge" style="margin-left:6px; font-size:10.5px; padding:1px 6px; background:#F2EDE4; border:1px solid #E5DDCF;">
                            ${p.variants.length} variation${p.variants.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style="vertical-align:middle; font-weight:600; color:var(--ink-soft);">
                      ${escapeHtml(p.brand)}
                    </td>
                    <td class="right" style="vertical-align:middle; font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--ink);">
                      ${p.totalQty.toLocaleString()} <span style="font-size:11px; font-weight:normal; color:var(--ink-soft);">units</span>
                    </td>
                    <td class="right" style="vertical-align:middle; font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--teal);">
                      ${peso(p.totalRevenue)}
                    </td>
                    <td class="right" style="vertical-align:middle; font-weight:600; font-family:'Space Grotesk',sans-serif; font-size:12.5px;">
                      ${p.transactionCount.toLocaleString()}
                    </td>
                    <td class="center" style="vertical-align:middle;" onclick="event.stopPropagation()">
                      <button type="button" 
                              id="top-prod-toggle-btn-${p.key}" 
                              class="btn ${isExpanded ? 'ghost' : 'secondary'} small" 
                              style="padding:3px 9px; font-size:11.5px;" 
                              onclick="toggleTopProductExpand('${p.key}')" 
                              title="Expand/collapse individual variations breakdown">
                        ${isExpanded ? '▴ Close' : '▾ Details'}
                      </button>
                    </td>
                  </tr>

                  <!-- VIEW MODE B: EXPANDABLE PRODUCT DETAILS (Exact Reconciliation) -->
                  <tr id="top-prod-detail-${p.key}" class="top-prod-detail-row" style="${isExpanded ? '' : 'display:none;'}">
                    <td colspan="7" style="padding:0 !important; border-bottom:2px solid var(--line); background:#FBF9F4;">
                      <div style="padding:12px 18px 16px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
                          <div>
                            <span style="font-weight:700; font-size:12.5px; color:var(--ink);">
                              🎨 Color &amp; Container Size Breakdown — ${escapeHtml(p.name)}
                            </span>
                            <span class="muted small" style="margin-left:6px; font-size:11.5px;">
                              (${escapeHtml(p.brand)})
                            </span>
                          </div>
                          <div class="muted small" style="font-size:11.5px; background:#FAF8F5; padding:2px 8px; border-radius:4px; border:1px solid #ECE6DB;">
                            Reconciled Total: <b>${p.totalQty}</b> units &bull; <b>${peso(p.totalRevenue)}</b> &bull; <b>${p.transactionCount}</b> distinct transactions
                          </div>
                        </div>

                        <table style="width:100%; border:1px solid var(--line); border-radius:var(--radius-sm); overflow:hidden; background:#FFFFFF;">
                          <thead>
                            <tr style="background:#F2EDE4; font-size:11.5px; border-bottom:1px solid var(--line);">
                              <th style="padding:7px 12px; text-align:left;">Color &amp; Color Code</th>
                              <th style="padding:7px 12px; text-align:center;">Container Size</th>
                              <th style="padding:7px 12px; text-align:right;">Quantity Sold</th>
                              <th style="padding:7px 12px; text-align:right;">Unit Selling Price</th>
                              <th style="padding:7px 12px; text-align:right;">Revenue</th>
                              <th style="padding:7px 12px; text-align:right;">Transactions</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${sortedPVariants.map((v, vIdx) => `
                              <tr style="border-bottom:1px solid #F0ECE1; background:${vIdx % 2 === 1 ? '#FCFBF9' : '#FFFFFF'}; font-size:12px;">
                                <td style="padding:7px 12px; vertical-align:middle;">
                                  ${formatColorVariantCell(v.colorName, v.hex)}
                                </td>
                                <td style="padding:7px 12px; text-align:center; vertical-align:middle;">
                                  ${formatContainerSizeBadge(v.size, v.sizeId)}
                                </td>
                                <td style="padding:7px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; vertical-align:middle;">
                                  ${v.qty.toLocaleString()} <span style="font-size:11px; font-weight:normal; color:var(--ink-soft);">units</span>
                                </td>
                                <td style="padding:7px 12px; text-align:right; vertical-align:middle;">
                                  ${formatHistoricalPrices(v.unitPricesList)}
                                </td>
                                <td style="padding:7px 12px; text-align:right; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--teal); vertical-align:middle;">
                                  ${peso(v.revenue)}
                                </td>
                                <td style="padding:7px 12px; text-align:right; font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle;">
                                  ${v.transactionCount.toLocaleString()}
                                </td>
                              </tr>
                            `).join('')}
                          </tbody>
                          <tfoot>
                            <tr style="background:#FAF8F5; font-weight:700; border-top:2px solid #E2DACD; font-size:12px;">
                              <td colspan="2" style="padding:8px 12px; color:var(--ink);">
                                &Sigma; Reconciled Subtotal for ${escapeHtml(p.name)}:
                              </td>
                              <td style="padding:8px 12px; text-align:right; font-family:'Space Grotesk',sans-serif; font-size:12.5px;">
                                ${p.totalQty.toLocaleString()} units
                              </td>
                              <td style="padding:8px 12px; text-align:right; color:var(--ink-soft); font-weight:normal; font-size:11px;">
                                (Preserved per variation)
                              </td>
                              <td style="padding:8px 12px; text-align:right; font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--teal);">
                                ${peso(p.totalRevenue)}
                              </td>
                              <td style="padding:8px 12px; text-align:right; font-family:'Space Grotesk',sans-serif; font-size:12.5px;" title="${p.transactionCount} unique sales receipts (no duplicate counts)">
                                ${p.transactionCount.toLocaleString()} <span style="font-size:10.5px; font-weight:normal; color:var(--ink-soft);">(distinct)</span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </td>
                  </tr>`;
  }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#F2EDE4; font-weight:700; border-top:2px solid var(--line); font-size:13px;">
                <td colspan="3" style="padding:10px 14px; color:var(--ink);">
                  Overall Total (${products.length} Products &bull; ${allVariants.length} Variations):
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px;">
                  ${overallQty.toLocaleString()} units
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px; color:var(--teal);">
                  ${peso(overallRevenue)}
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px;" title="${overallUniqueTrans} unique transactions">
                  ${overallUniqueTrans.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        ` : `
          <!-- VIEW MODE C: SIZE & VARIANT BREAKDOWN VIEW -->
          <table class="table-hover" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:#FAF8F5;">
                <th style="width:45px; text-align:center;">#</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th>Color &amp; Color Code</th>
                <th class="center" style="min-width:110px;">Container Size</th>
                <th class="right" style="min-width:110px;">Qty Sold</th>
                <th class="right" style="min-width:130px;">Unit Selling Price</th>
                <th class="right" style="min-width:120px;">Revenue</th>
                <th class="right" style="min-width:110px;">Transactions</th>
              </tr>
            </thead>
            <tbody>
              ${varPag.pagedItems.map((v, idx) => {
    const rankIdx = (varPag.startRow > 0 ? varPag.startRow - 1 : 0) + idx;
    return `
                <tr style="background:${idx % 2 === 1 ? '#FCFBF9' : '#FFFFFF'};">
                  <td class="center" style="vertical-align:middle;">
                    ${formatRankBadge(rankIdx)}
                  </td>
                  <td style="vertical-align:middle;">
                    <strong style="color:var(--ink); font-size:13px;">${escapeHtml(v.productName)}</strong>
                  </td>
                  <td style="vertical-align:middle; font-weight:600; color:var(--ink-soft);">
                    ${escapeHtml(v.brand)}
                  </td>
                  <td style="vertical-align:middle;">
                    ${formatColorVariantCell(v.colorName, v.hex)}
                  </td>
                  <td class="center" style="vertical-align:middle;">
                    ${formatContainerSizeBadge(v.size, v.sizeId)}
                  </td>
                  <td class="right" style="vertical-align:middle; font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--ink);">
                    ${v.qty.toLocaleString()} <span style="font-size:11px; font-weight:normal; color:var(--ink-soft);">units</span>
                  </td>
                  <td class="right" style="vertical-align:middle;">
                    ${formatHistoricalPrices(v.unitPricesList)}
                  </td>
                  <td class="right" style="vertical-align:middle; font-weight:700; font-family:'Space Grotesk',sans-serif; font-size:13px; color:var(--teal);">
                    ${peso(v.revenue)}
                  </td>
                  <td class="right" style="vertical-align:middle; font-weight:600; font-family:'Space Grotesk',sans-serif; font-size:12.5px;">
                    ${v.transactionCount.toLocaleString()}
                  </td>
                </tr>`;
  }).join('')}
            </tbody>
            <tfoot>
              <tr style="background:#F2EDE4; font-weight:700; border-top:2px solid var(--line); font-size:13px;">
                <td colspan="5" style="padding:10px 14px; color:var(--ink);">
                  Overall Total (${allVariants.length} Variations across ${products.length} Products):
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px;">
                  ${overallQty.toLocaleString()} units
                </td>
                <td class="right" style="padding:10px 14px; color:var(--ink-soft); font-weight:normal; font-size:11.5px;">
                  (Preserved per variant)
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px; color:var(--teal);">
                  ${peso(overallRevenue)}
                </td>
                <td class="right" style="padding:10px 14px; font-family:'Space Grotesk',sans-serif; font-size:13.5px;">
                  ${overallUniqueTrans.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        `)}
      </div>
      ${activeTopPag.html}
    </div>`;
}

/* ============================================================
   OVERALL SALES SUMMARY, PRODUCT & CONTAINER
   SIZE BREAKDOWN, AND PAGINATED SALES HISTORY
   ============================================================ */

function getReportingPeriodDisplayInfo(from, to) {
  const f = from || '';
  const t = to || '';
  const preset = getDateRangePreset(f, t);
  const curY = getCurrentYear();

  if (!f && !t) {
    return {
      preset: 'all',
      badge: 'Historical Records (All-Time)',
      rangeText: 'All recorded sales transactions across all calendar years',
      icon: '🏛️'
    };
  }
  if (preset === 'today') {
    return {
      preset: 'today',
      badge: 'Today',
      rangeText: formatDateReadable(f),
      icon: '📅'
    };
  }
  if (preset === 'yesterday') {
    return {
      preset: 'yesterday',
      badge: 'Yesterday',
      rangeText: formatDateReadable(f),
      icon: '📅'
    };
  }
  if (preset === '7d') {
    return {
      preset: '7d',
      badge: 'Last 7 Days',
      rangeText: `${formatDateReadable(f)} – ${formatDateReadable(t)}`,
      icon: '📅'
    };
  }
  if (preset === '30d') {
    return {
      preset: '30d',
      badge: 'Last 30 Days',
      rangeText: `${formatDateReadable(f)} – ${formatDateReadable(t)}`,
      icon: '📅'
    };
  }
  if (preset === 'month') {
    return {
      preset: 'month',
      badge: 'This Month',
      rangeText: `${formatDateReadable(f)} – ${formatDateReadable(t)}`,
      icon: '📅'
    };
  }
  if (preset === 'year') {
    return {
      preset: 'year',
      badge: `This Year (${curY})`,
      rangeText: `${formatDateReadable(f)} – ${formatDateReadable(t)}`,
      icon: '📅'
    };
  }
  if (f && t && f.endsWith('-01-01') && t.endsWith('-12-31') && f.slice(0, 4) === t.slice(0, 4)) {
    const yr = f.slice(0, 4);
    return {
      preset: 'historical_year',
      badge: `Calendar Year ${yr}`,
      rangeText: `${formatDateReadable(f)} – ${formatDateReadable(t)}`,
      icon: '🏛️'
    };
  }
  const rangeStr = (f && t)
    ? (f === t ? formatDateReadable(f) : `${formatDateReadable(f)} – ${formatDateReadable(t)}`)
    : (f ? `From ${formatDateReadable(f)}` : `Until ${formatDateReadable(t)}`);
  return {
    preset: 'custom',
    badge: 'Custom Date Range',
    rangeText: rangeStr,
    icon: '🗓️'
  };
}

/**
 * Calculates Overall Sales Summary, Product Sales Breakdown,
 * and Container Size Breakdown across ALL matching transactions in `salesList`
 * (never restricted to frontend pagination slice).
 */
function computeSalesHistorySummary(salesList) {
  const list = Array.isArray(salesList) ? salesList : [];
  const seenSaleIds = new Set();

  let rawRecordCount = 0;
  let grossSales = 0;
  let totalDiscounts = 0;
  let partialRefundsDeducted = 0;
  let netSales = 0;
  let totalTransactions = 0;
  let totalItemsSold = 0;
  let totalLitersSold = 0;
  let discountedTransactionsCount = 0;
  let partiallyRefundedCount = 0;
  let exchangedCount = 0;
  let fullRefundCount = 0;
  let fullRefundAmount = 0;
  let excludedCount = 0;
  let excludedAmount = 0;

  const productMap = new Map();
  const sizeMap = new Map();

  list.forEach((sale, idx) => {
    if (!sale) return;
    const saleId = String(sale.id || sale.receiptNo || `sale_idx_${idx}`);
    if (seenSaleIds.has(saleId)) return; // Ensure each transaction is counted only once
    seenSaleIds.add(saleId);
    rawRecordCount++;

    const rawStatus = String(sale.status || 'completed').trim().toLowerCase();
    const rawTotal = Number(sale.total || sale.subtotal || 0);
    const rawSubtotal = Number(sale.subtotal || sale.total || 0);

    // Rule: Exclude voided and cancelled transactions from sales totals
    if (rawStatus === 'voided' || rawStatus === 'void' || rawStatus === 'cancelled' || rawStatus === 'canceled') {
      excludedCount++;
      excludedAmount = Number((excludedAmount + rawTotal).toFixed(2));
      return;
    }

    const returns = Array.isArray(sale.returns) ? sale.returns : [];
    const items = Array.isArray(sale.items) ? sale.items : [];
    const refundTotal = Number(sale.refundTotal || 0);

    // If status is explicitly 'refunded' with no return vouchers and 0 refundTotal, treat as full refund
    const effectiveRefund = (rawStatus === 'refunded' && refundTotal === 0 && returns.length === 0)
      ? rawTotal
      : refundTotal;

    const saleNet = Number((rawTotal - effectiveRefund).toFixed(2));

    // Full refund without replacement (net sale <= 0)
    if (rawStatus === 'refunded' && saleNet <= 0.0001) {
      fullRefundCount++;
      fullRefundAmount = Number((fullRefundAmount + rawTotal).toFixed(2));
      return;
    }

    // Completed, Partially Refunded, or Exchanged sale with positive net revenue
    totalTransactions++;
    if (rawStatus === 'partially_refunded' || (effectiveRefund > 0 && saleNet > 0)) {
      partiallyRefundedCount++;
    } else if (rawStatus === 'refunded' && saleNet > 0) {
      exchangedCount++;
    }

    const saleDiscount = Number(sale.discountAmount !== undefined ? sale.discountAmount : (sale.discount !== undefined ? sale.discount : (rawSubtotal > rawTotal ? (rawSubtotal - rawTotal) : 0)));
    if (saleDiscount > 0) {
      totalDiscounts = Number((totalDiscounts + saleDiscount).toFixed(2));
      discountedTransactionsCount++;
    }

    const upgradeExtra = effectiveRefund < 0 ? Math.abs(effectiveRefund) : 0;
    const effectiveGross = Number((rawSubtotal + upgradeExtra).toFixed(2));
    const partialRefundDed = effectiveRefund > 0 ? Number(effectiveRefund.toFixed(2)) : 0;
    const effectiveNet = Math.max(0, saleNet);

    grossSales = Number((grossSales + effectiveGross).toFixed(2));
    partialRefundsDeducted = Number((partialRefundsDeducted + partialRefundDed).toFixed(2));
    netSales = Number((netSales + effectiveNet).toFixed(2));

    // Helper to record item line using original transaction item records & historical prices
    const recordSaleLine = (lineItem, netQty) => {
      if (!lineItem || netQty <= 0) return;
      const type = String(lineItem.type || 'product').toLowerCase();
      const isMix = (type === 'colormix');
      const origQty = Math.max(1, Number(lineItem.qty) || 1);
      const origLineTotal = lineItem.lineTotal !== undefined
        ? Number(lineItem.lineTotal)
        : (origQty * (Number(lineItem.unitPrice) || 0));
      const unitPrice = (lineItem.unitPrice !== undefined && lineItem.unitPrice !== null && !isNaN(Number(lineItem.unitPrice)))
        ? Number(lineItem.unitPrice)
        : Number((origLineTotal / origQty).toFixed(2));
      const netLineAmount = (Math.abs(netQty - origQty) < 0.0001 && lineItem.lineTotal !== undefined)
        ? Number(Number(lineItem.lineTotal).toFixed(2))
        : Number((netQty * unitPrice).toFixed(2));

      totalItemsSold = Number((totalItemsSold + netQty).toFixed(2));

      const pid = String(lineItem.productId || lineItem.product_id || '');
      const pObj = (!isMix && pid && typeof productById === 'function') ? productById(pid) : null;
      const prodName = isMix
        ? 'Custom Color Mix'
        : String(lineItem.name || (pObj && (pObj.name || pObj.productName)) || 'Unnamed Product').trim();
      const brand = isMix
        ? 'Custom Mix'
        : String(lineItem.brand || (pObj && pObj.brand) || 'Generic').trim();
      const color = isMix
        ? String(lineItem.colorName || lineItem.color || 'Custom Shade').trim()
        : String((lineItem.color && lineItem.color !== '-' ? lineItem.color : (pObj && pObj.color && pObj.color !== '-' ? pObj.color : 'Standard'))).trim();

      let hex = '#1F6F6B';
      if (isMix && lineItem.hexColor) {
        hex = lineItem.hexColor;
      } else if (pObj && typeof getProductHex === 'function') {
        try { hex = getProductHex(pObj) || '#1F6F6B'; } catch (e) { hex = '#1F6F6B'; }
      } else if (lineItem.hexColor) {
        hex = lineItem.hexColor;
      }

      let sizeKey = '';
      let sizeLabel = '';
      let sizeNum = 1;
      let lineLiters = 0;

      if (isMix) {
        const litersPerUnit = Number(lineItem.liters || lineItem.size || 1) || 1;
        lineLiters = Number((netQty * litersPerUnit).toFixed(2));
        sizeKey = 'colormix';
        sizeLabel = 'Custom Mix';
        sizeNum = 0;
      } else {
        let parsedSz = typeof normalizeCanSize === 'function' ? normalizeCanSize(lineItem.size) : Number(lineItem.size);
        if (!parsedSz && lineItem.size) {
          const sLow = String(lineItem.size).toLowerCase();
          if (sLow.includes('gallon')) parsedSz = 4;
          else if (sLow.includes('drum') || sLow.includes('pail')) parsedSz = 16;
          else parsedSz = parseFloat(lineItem.size) || 1;
        }
        sizeNum = parsedSz || 1;
        lineLiters = Number((netQty * sizeNum).toFixed(2));
        sizeKey = `size_${sizeNum}`;
        if (sizeNum === 1) sizeLabel = '1L Can';
        else if (sizeNum === 4) sizeLabel = '4L Gallon';
        else if (sizeNum === 16) sizeLabel = '16L Pail / Drum';
        else sizeLabel = `${typeof fmtSize === 'function' ? fmtSize(sizeNum) : (sizeNum + 'L')} Container`;
      }

      totalLitersSold = Number((totalLitersSold + lineLiters).toFixed(2));

      // Group by product and container size (each size on its own separate row, preserving historical prices)
      const pKey = isMix
        ? `colormix___${color}___${sizeKey}`.toLowerCase()
        : `${brand}___${prodName}___${color}___${sizeKey}`.toLowerCase();

      if (!productMap.has(pKey)) {
        productMap.set(pKey, {
          key: pKey,
          productId: pid,
          name: prodName,
          brand: brand,
          color: color,
          hex: hex,
          isColorMix: isMix,
          size: sizeNum,
          sizeKey: sizeKey,
          sizeLabel: sizeLabel,
          qtySold: 0,
          litersSold: 0,
          salesAmount: 0,
          unitPricesSet: new Set(),
          sizesSet: new Set(),
          txSet: new Set()
        });
      }
      const pm = productMap.get(pKey);
      pm.qtySold = Number((pm.qtySold + netQty).toFixed(2));
      pm.litersSold = Number((pm.litersSold + lineLiters).toFixed(2));
      pm.salesAmount = Number((pm.salesAmount + netLineAmount).toFixed(2));
      if (unitPrice > 0) pm.unitPricesSet.add(Number(unitPrice.toFixed(2)));
      pm.sizesSet.add(sizeLabel);
      pm.txSet.add(saleId);

      // Group by container size
      if (!sizeMap.has(sizeKey)) {
        sizeMap.set(sizeKey, {
          key: sizeKey,
          size: sizeNum,
          label: sizeLabel,
          isColorMix: isMix,
          qtySold: 0,
          litersSold: 0,
          salesAmount: 0,
          txSet: new Set()
        });
      }
      const sm = sizeMap.get(sizeKey);
      sm.qtySold = Number((sm.qtySold + netQty).toFixed(2));
      sm.litersSold = Number((sm.litersSold + lineLiters).toFixed(2));
      sm.salesAmount = Number((sm.salesAmount + netLineAmount).toFixed(2));
      sm.txSet.add(saleId);
    };

    // 1. Original receipt items (net of returnedQty)
    items.forEach(item => {
      const qtyPurchased = Number(item.qty || 0);
      const qtyReturned = Number(item.returnedQty || 0);
      const netQty = Number(Math.max(0, qtyPurchased - qtyReturned).toFixed(2));
      if (netQty > 0) {
        recordSaleLine(item, netQty);
      }
    });

    // 2. Replacement items issued via exchanges
    returns.forEach(ret => {
      if (ret && Array.isArray(ret.exchangeItems)) {
        ret.exchangeItems.forEach(exItem => {
          const exQty = Number(exItem.qty || 0);
          if (exQty > 0) {
            recordSaleLine(exItem, exQty);
          }
        });
      }
    });
  });

  const productBreakdown = Array.from(productMap.values())
    .filter(pm => pm.qtySold > 0)
    .map(pm => ({
      key: pm.key,
      productId: pm.productId,
      name: pm.name,
      brand: pm.brand,
      color: pm.color,
      hex: pm.hex,
      isColorMix: pm.isColorMix,
      size: pm.size,
      sizeKey: pm.sizeKey,
      sizeLabel: pm.sizeLabel,
      qtySold: pm.qtySold,
      litersSold: pm.litersSold,
      salesAmount: pm.salesAmount,
      unitPrices: Array.from(pm.unitPricesSet).sort((a, b) => a - b),
      sizes: Array.from(pm.sizesSet),
      transactionCount: pm.txSet.size
    })).sort((a, b) => {
      if (Math.abs(b.qtySold - a.qtySold) > 0.001) return b.qtySold - a.qtySold;
      return b.salesAmount - a.salesAmount;
    });

  const containerSizeBreakdown = Array.from(sizeMap.values()).map(sm => ({
    key: sm.key,
    size: sm.size,
    label: sm.label,
    isColorMix: sm.isColorMix,
    qtySold: sm.qtySold,
    litersSold: sm.litersSold,
    salesAmount: sm.salesAmount,
    transactionCount: sm.txSet.size
  })).sort((a, b) => {
    if (a.isColorMix !== b.isColorMix) return a.isColorMix ? 1 : -1;
    return a.size - b.size;
  });

  const averageTransactionValue = totalTransactions > 0
    ? Number((netSales / totalTransactions).toFixed(2))
    : 0;

  return {
    rawRecordCount,
    grossSales,
    totalDiscounts,
    partialRefundsDeducted,
    netSales,
    totalTransactions,
    totalItemsSold,
    totalLitersSold,
    averageTransactionValue,
    discountedTransactionsCount,
    partiallyRefundedCount,
    exchangedCount,
    fullRefundCount,
    fullRefundAmount,
    excludedCount,
    excludedAmount,
    productBreakdown,
    containerSizeBreakdown
  };
}

async function fetchSalesHistorySummaryFromBackend(from, to, status = 'all', q = '') {
  try {
    const params = new URLSearchParams();
    params.set('action', 'sales_history_summary');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status && status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    const res = await fetch('api/db.php?' + params.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.success && data.summary) ? data.summary : null;
  } catch (e) {
    return null;
  }
}

function toggleSalesHistoryBreakdowns() {
  salesHistoryBreakdownsExpanded = !salesHistoryBreakdownsExpanded;
  const sec = document.getElementById('sh-breakdowns-section');
  const btn = document.getElementById('sh-breakdowns-toggle-btn');
  if (sec) {
    sec.style.display = salesHistoryBreakdownsExpanded ? '' : 'none';
  }
  if (btn) {
    btn.innerHTML = salesHistoryBreakdownsExpanded
      ? '▴ Hide Product &amp; Size Breakdown'
      : '▾ Show Product &amp; Size Breakdown';
  }
}

function renderSalesHistorySummaryAndBreakdownsHtml(salesList, from, to) {
  const summary = computeSalesHistorySummary(salesList);
  const periodInfo = getReportingPeriodDisplayInfo(from, to);
  const totalProductSalesAmt = summary.productBreakdown.reduce((s, p) => s + p.salesAmount, 0) || 1;
  const bestSellersList = summary.productBreakdown;

  return `
    <div class="sh-overall-summary-wrap" id="sh-overall-summary-wrap" data-from="${escapeAttr(from || '')}" data-to="${escapeAttr(to || '')}">
      <!-- Selected Reporting Period Header above Summary Cards -->
      <div class="sh-period-banner" id="sh-reporting-period-bar">
        <div class="sh-period-banner-left">
          <span style="font-weight:700; color:var(--ink-soft); text-transform:uppercase; font-size:11px; letter-spacing:0.04em;">Selected Reporting Period:</span>
          <span class="sh-period-pill" id="sh-active-period-badge">${periodInfo.icon} ${escapeHtml(periodInfo.badge)}</span>
          <strong id="sh-active-period-range" style="font-family:'Space Grotesk',sans-serif; font-size:13.5px; color:var(--ink);">${escapeHtml(periodInfo.rangeText)}</strong>
        </div>
        <div class="row wrap" style="gap:8px; align-items:center;">
          <span class="badge" style="background:#FFFFFF; border:1px solid var(--line); color:var(--ink-soft); font-size:11.5px; padding:3px 9px;">
            📊 Calculated from all <b>${summary.rawRecordCount.toLocaleString()}</b> matching record${summary.rawRecordCount === 1 ? '' : 's'}
          </span>
          <button type="button" id="sh-breakdowns-toggle-btn" class="btn ghost small" style="background:#FFFFFF; border:1px solid var(--line); font-size:12px; padding:4px 10px;" onclick="toggleSalesHistoryBreakdowns()">
            ${salesHistoryBreakdownsExpanded ? '▴ Hide Product &amp; Size Breakdown' : '▾ Show Product &amp; Size Breakdown'}
          </button>
        </div>
      </div>

      <!-- Overall Sales Summary Cards -->
      <div class="stat-grid sh-summary-grid" id="sh-overall-summary-cards">
        <div class="stat-card mustard" id="sh-card-gross-sales">
          <div class="label">Total Gross Sales</div>
          <div class="value" id="sh-val-gross-sales">${peso(summary.grossSales)}</div>
          <div class="sub">${summary.totalDiscounts > 0 ? `Subtotal before discounts (${peso(summary.totalDiscounts)} discounts)` : 'Total value of completed sales'}</div>
        </div>

        <div class="stat-card" id="sh-card-net-sales" style="border-left:4px solid var(--teal);">
          <div class="label">Total Net Sales</div>
          <div class="value" id="sh-val-net-sales" style="color:var(--teal);">${peso(summary.netSales)}</div>
          <div class="sub">
            ${summary.totalDiscounts > 0
      ? `Actual revenue (${peso(summary.totalDiscounts)} promo discount${summary.discountedTransactionsCount === 1 ? '' : 's'}${summary.partialRefundsDeducted > 0 ? ` · -${peso(summary.partialRefundsDeducted)} refunds` : ''})`
      : (summary.partialRefundsDeducted > 0
        ? `Actual sales revenue (-${peso(summary.partialRefundsDeducted)} partial refunds)`
        : 'Actual sales revenue')}
          </div>
        </div>

        <div class="stat-card sage" id="sh-card-total-transactions">
          <div class="label">Total Transactions</div>
          <div class="value" id="sh-val-total-transactions">${summary.totalTransactions.toLocaleString()}</div>
          <div class="sub">
            ${(summary.fullRefundCount > 0 || summary.excludedCount > 0)
      ? `Completed sales (${[
        summary.fullRefundCount > 0 ? `${summary.fullRefundCount} full refund` : '',
        summary.excludedCount > 0 ? `${summary.excludedCount} void/cancelled` : ''
      ].filter(Boolean).join(', ')} excl.)`
      : 'Number of completed sales transactions'}
          </div>
        </div>

        <div class="stat-card" id="sh-card-total-items">
          <div class="label">Total Items Sold</div>
          <div class="value" id="sh-val-total-items">
            ${formatStock(summary.totalItemsSold)} <span style="font-size:13px; font-weight:600; color:var(--ink-soft);">units</span>
          </div>
          <div class="sub">Individual units sold (${formatLiters(summary.totalLitersSold)})</div>
        </div>

        <div class="stat-card" id="sh-card-avg-transaction">
          <div class="label">Average Transaction Value</div>
          <div class="value" id="sh-val-avg-transaction" style="color:var(--teal-dark);">${peso(summary.averageTransactionValue)}</div>
          <div class="sub">Net Sales &divide; ${summary.totalTransactions.toLocaleString()} completed transaction${summary.totalTransactions === 1 ? '' : 's'}</div>
        </div>
      </div>

      <!-- Product / Container Size Breakdown -->
      <div id="sh-breakdowns-section" style="${salesHistoryBreakdownsExpanded ? '' : 'display:none;'}">
        <div class="sh-breakdowns-grid">
          <!-- Product & Container Size Breakdown -->
          <div class="sh-breakdown-card" id="sh-product-breakdown-card">
            <div class="sh-breakdown-head">
              <h4>📦 Product &amp; Container Size Sales Breakdown</h4>
              <span class="muted small">Original transaction items &amp; historical prices</span>
            </div>

            <!-- Sales by Container Size -->
            <div style="padding:8px 16px 4px; background:#FCFBF9; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft);">
              Sales by Container Size
            </div>
            ${summary.containerSizeBreakdown.length ? `
              <div class="sh-size-pills-row" id="sh-container-size-breakdown">
                ${summary.containerSizeBreakdown.map(sz => {
        const szPct = totalProductSalesAmt > 0 ? Math.round((sz.salesAmount / totalProductSalesAmt) * 100) : 0;
        return `
                    <div class="sh-size-pill-card" data-size-key="${escapeAttr(sz.key)}">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                        <strong style="font-size:12.5px; color:var(--ink); font-family:'Space Grotesk',sans-serif;">${escapeHtml(sz.label)}</strong>
                        <span class="badge" style="font-size:10px; padding:1px 5px; background:#F2EDE4; color:var(--ink-soft);">${szPct}%</span>
                      </div>
                      <div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14px; color:var(--teal); margin-top:2px;">
                        ${peso(sz.salesAmount)}
                      </div>
                      <div class="muted small" style="font-size:11px; margin-top:1px;">
                        <b>${formatStock(sz.qtySold)}</b> ${sz.qtySold === 1 ? 'unit' : 'units'} (${formatLiters(sz.litersSold)})
                      </div>
                    </div>
                  `;
      }).join('')}
              </div>
            ` : `
              <div class="muted small" style="padding:10px 16px; border-bottom:1px solid #EFE9DC;">No container sales in this period.</div>
            `}

            <!-- Best-Selling Products Table -->
            <div style="padding:8px 16px 4px; background:#FFFFFF; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); display:flex; justify-content:space-between; align-items:center;">
              <span>Best-Selling Products (${summary.productBreakdown.length} total)</span>
              <span>Sorted by Qty Sold</span>
            </div>
            <div class="table-scroll" style="max-height:280px; overflow-y:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead style="position:sticky; top:0; z-index:2; background:#FAF8F5;">
                  <tr style="border-bottom:1px solid var(--line);">
                    <th style="padding:6px 10px; width:34px; text-align:center;">#</th>
                    <th style="padding:6px 10px;">Product &amp; Shade</th>
                    <th style="padding:6px 10px; text-align:center; min-width:95px;">Container Size</th>
                    <th style="padding:6px 10px; text-align:right; min-width:85px;">Qty Sold</th>
                    <th style="padding:6px 10px; text-align:right; min-width:95px;">Total Sales</th>
                  </tr>
                </thead>
                <tbody>
                  ${bestSellersList.length ? bestSellersList.map((prod, pIdx) => `
                    <tr style="border-bottom:1px solid #F2EDE4; background:${pIdx % 2 === 1 ? '#FCFBF9' : '#FFFFFF'};">
                      <td style="padding:6px 10px; text-align:center; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink-soft); vertical-align:middle;">
                        ${pIdx + 1}
                      </td>
                      <td style="padding:6px 10px; vertical-align:middle;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="width:12px; height:12px; border-radius:50%; background:${escapeAttr(prod.hex || '#1F6F6B')}; border:1px solid rgba(0,0,0,0.25); flex-shrink:0;" title="${escapeAttr(prod.color)}"></span>
                          <div style="line-height:1.25;">
                            <strong style="color:var(--ink); font-size:12.5px;">${escapeHtml(prod.name)}</strong>
                            <span class="muted small" style="margin-left:4px; font-weight:500;">(${escapeHtml(prod.color)})</span>
                            <div class="muted small" style="font-size:10.5px; margin-top:1px;">${escapeHtml(prod.brand)}</div>
                          </div>
                        </div>
                      </td>
                      <td style="padding:6px 10px; text-align:center; vertical-align:middle;">
                        <span class="badge" style="background:#FAF8F5; border:1px solid #E5DDCF; font-size:11px; padding:2px 8px; font-weight:600; white-space:nowrap; display:inline-block;">
                          ${escapeHtml(prod.sizeLabel || (prod.sizes && prod.sizes[0]) || 'Standard')}
                        </span>
                      </td>
                      <td style="padding:6px 10px; text-align:right; font-family:'Space Grotesk',sans-serif; font-weight:700; vertical-align:middle; white-space:nowrap;">
                        ${formatStock(prod.qtySold)} <span style="font-weight:normal; font-size:10.5px; color:var(--ink-soft);">${prod.qtySold === 1 ? 'unit' : 'units'}</span>
                      </td>
                      <td style="padding:6px 10px; text-align:right; font-family:'Space Grotesk',sans-serif; font-weight:700; color:var(--teal); vertical-align:middle; white-space:nowrap;">
                        ${peso(prod.salesAmount)}
                      </td>
                    </tr>
                  `).join('') : `
                    <tr><td colspan="5" class="empty-state" style="padding:18px; text-align:center;">No product sales recorded in this date range.</td></tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSalesHistoryTableRowsHtml(pagedSales) {
  const resolveStaffLabel = name => {
    if (typeof staffLabel === 'function') return staffLabel(name);
    return escapeHtml(name || '');
  };

  if (!pagedSales || !pagedSales.length) {
    return `<tr><td colspan="7" class="empty-state">No sales transactions found in this date range.</td></tr>`;
  }

  return pagedSales.map(s => {
    const status = s.status || 'completed';
    const rawSt = String(status).trim().toLowerCase();
    const isVoidOrCancel = (rawSt === 'voided' || rawSt === 'void' || rawSt === 'cancelled' || rawSt === 'canceled');
    const returnedVal = typeof getSaleReturnedValue === 'function' ? getSaleReturnedValue(s) : Number(s.refundTotal || 0);
    const exchangeTotal = typeof getSaleExchangeTotal === 'function' ? getSaleExchangeTotal(s) : 0;
    const refundTotal = Number(s.refundTotal || 0);
    const netTotal = Number((s.total - refundTotal).toFixed(2));
    const hasReturns = Array.isArray(s.returns) && s.returns.length > 0;
    const isWithinDay = typeof isSaleReturnWithinDay === 'function' ? isSaleReturnWithinDay(s) : (String(s.date || '').slice(0, 10) === todayISO());
    const itemCount = Array.isArray(s.items) ? s.items.length : 0;

    return `
      <tr style="${isVoidOrCancel ? 'opacity:0.62; background:#FDF9F9;' : ''}">
        <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(getReceiptNo(s))}</code></td>
        <td>${formatDateTime(s.date)}</td>
        <td>${resolveStaffLabel(s.cashierName)}</td>
        <td>${itemCount} item${itemCount === 1 ? '' : 's'}</td>
        <td class="center">${saleStatusBadge(status)}</td>
        <td class="right">
          ${isVoidOrCancel
        ? `<div><strong style="font-family:'Space Grotesk'; font-size:13.5px; text-decoration:line-through; color:var(--ink-soft);">${peso(s.total)}</strong></div>
               <div class="muted small" style="color:var(--danger); font-size:11px;">Excluded (${escapeHtml(status)})</div>`
        : ((returnedVal > 0 || refundTotal > 0)
          ? `<div><strong style="font-family:'Space Grotesk'; font-size:13.5px;">${peso(netTotal)}</strong></div>
                 <div class="muted small" style="color:${exchangeTotal > 0 ? 'var(--teal)' : 'var(--danger)'}; font-size:11px;">
                   ${exchangeTotal > 0
            ? `Exchanged: ${peso(exchangeTotal)}`
            : `Returned: -${peso(returnedVal || refundTotal)}`}
                 </div>`
          : `<div><strong style="font-family:'Space Grotesk'; font-size:13.5px;">${peso(s.total)}</strong></div>
             ${(Number(s.discountAmount || s.discount || 0) > 0) ? `<div class="muted small" style="color:var(--teal); font-size:11px; font-weight:600;">10% Disc: -${peso(Number(s.discountAmount || s.discount || 0))}</div>` : ''}`)}
        </td>
        <td class="right" style="white-space:nowrap;">
          <div class="row wrap" style="justify-content:flex-end; gap:6px;">
            <button class="btn ghost small" onclick='viewSale("${s.id}")' title="View Sales Receipt">🧾 Receipt</button>
            ${(!isVoidOrCancel && status !== 'refunded') ? (
        (typeof hasSaleReturnableItems === 'function' ? hasSaleReturnableItems(s) : true)
          ? `<button class="btn secondary small" onclick='openReturnRefundModal("${s.id}")' title="Process Return &amp; Exchange under store policy">↩️ Return / Exchange</button>`
          : ((typeof saleHasOnlyCustomMixItems === 'function' && saleHasOnlyCustomMixItems(s))
            ? (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')
              ? `<button class="btn ghost small" onclick='openReturnRefundModal("${s.id}")' style="border-color:#D8A868; color:#8A5A24;" title="Custom Color Mix is strictly Final Sale under standard policy. Click to open Administrator Review for store mixing errors.">🛡️ Custom Mix (Admin Review)</button>`
              : `<button class="btn ghost small" disabled style="opacity:0.65; cursor:not-allowed;" title="Custom Color Mix cannot be returned or exchanged once mixed (Final Sale)">🔒 Custom Mix (Final Sale)</button>`)
            : `<button class="btn ghost small" disabled style="opacity:0.55; cursor:not-allowed;" title="All purchased items have already been returned or exchanged">✓ Fully Returned</button>`)
      ) : ''}
            ${hasReturns ? `
              <button class="btn ghost small" onclick='viewReturnVouchers("${s.id}")' title="View return &amp; exchange slips" style="color:#856404; background:#FFF3CD; border:1px solid #FFEBAA;">📋 Slip (${s.returns.length})</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderReportsSalesHistoryTableContainerHtml(salesList) {
  const sortedSales = (salesList || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const pag = paginateArray(sortedSales, 'reports_sales_history', {
    defaultPageSize: 10,
    onUpdate: renderReportsSalesHistoryPageOnly,
    scrollTarget: '#rep-sales-history-table-panel',
    recordLabel: 'transactions'
  });

  return `
    <div class="panel-body tight table-scroll">
      <table>
        <thead>
          <tr>
            <th>Receipt #</th>
            <th>Date &amp; Time</th>
            <th>Cashier</th>
            <th>Items</th>
            <th class="center">Status</th>
            <th class="right">Total / Net</th>
            <th class="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${renderSalesHistoryTableRowsHtml(pag.pagedItems)}
        </tbody>
      </table>
    </div>
    ${pag.html}
  `;
}

/**
 * Updates ONLY the paginated Sales History table rows & pagination controls when
 * changing pages, guaranteeing that changing pages NEVER alters or recalculates
 * the Overall Sales Summary cards above the table.
 */
function renderReportsSalesHistoryPageOnly() {
  const container = document.getElementById('rep-sales-history-table-container');
  if (container) {
    const sales = salesBetween(reportDateFrom, reportDateTo);
    container.innerHTML = renderReportsSalesHistoryTableContainerHtml(sales);
    if (typeof syncRouteState === 'function') syncRouteState({ push: false });
  } else {
    renderReportBody();
  }
}

function renderReportsSalesHistorySectionHtml(salesList, from, to) {
  if (currentUser && currentUser.role === 'cashier') {
    return `
      <div class="empty-state" style="padding:40px; margin:20px; background:#fff; border:1px solid var(--line); border-radius:8px;">
        <h3>🔒 Access Restricted</h3>
        <p class="muted">Cashiers are restricted from accessing business-wide sales reports and analytics.</p>
      </div>
    `;
  }
  const list = Array.isArray(salesList) ? salesList : [];
  return `
    <div id="rep-sales-history-section">
      ${renderSalesHistorySummaryAndBreakdownsHtml(list, from, to)}
      <div class="panel" id="rep-sales-history-table-panel">
        <div class="panel-head row wrap" style="gap:10px;">
          <div>
            <h3 style="margin:0;">Sales History</h3>
            <span class="muted small">${list.length.toLocaleString()} transaction(s) recorded in this range</span>
          </div>
        </div>
        <div id="rep-sales-history-table-container">
          ${renderReportsSalesHistoryTableContainerHtml(list)}
        </div>
      </div>
    </div>
  `;
}


function renderOverallReportSummaryCardsHtml(from, to, sales, moves) {
  const validSalesForRev = sales.filter(s => {
    const st = String((s && s.status) || 'completed').trim().toLowerCase();
    return st !== 'voided' && st !== 'void' && st !== 'cancelled' && st !== 'canceled';
  });
  const grossSales = validSalesForRev.reduce((t, s) => t + Number(s.subtotal !== undefined ? s.subtotal : (s.total || 0)), 0);
  const totalDiscounts = validSalesForRev.reduce((t, s) => t + Number(s.discountAmount !== undefined ? s.discountAmount : (s.discount || 0)), 0);
  const periodRefunds = validSalesForRev.reduce((t, s) => {
    const st = String(s.status || 'completed').trim().toLowerCase();
    const ref = Number(s.refundTotal || 0);
    const effRef = (st === 'refunded' && ref === 0 && (!s.returns || !s.returns.length)) ? Number(s.total || 0) : ref;
    return t + effRef;
  }, 0);
  const netSales = Number((validSalesForRev.reduce((t, s) => t + Number(s.total || 0), 0) - periodRefunds).toFixed(2));

  let totalReceivedLitres = 0;
  let totalAdjustedLitres = 0;

  moves.forEach(m => {
    const q = Number(m.qtyChange) || 0;
    if (m.type === 'receiving') totalReceivedLitres += q;
    else if (m.type === 'adjustment') totalAdjustedLitres += q;
  });

  const totalInvValue = calculateCurrentInventoryValue();

  return `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card" style="cursor:pointer;" onclick="setReportTab('sales')" title="Click to view sales and revenue reports">
        <div class="label">Total Net Sales</div>
        <div class="value">${peso(netSales)}</div>
        <div class="sub">Gross: ${peso(grossSales)}${totalDiscounts > 0 ? ` · Disc: -${peso(totalDiscounts)}` : ''} (${validSalesForRev.length} sales)</div>
      </div>
      <div class="stat-card sage" style="cursor:pointer;" onclick="setReportTab('receiving')" title="Click to view stock receiving deliveries">
        <div class="label">Total Stock Received</div>
        <div class="value">+${formatLiters(totalReceivedLitres)}</div>
        <div class="sub">Incoming supplier restock</div>
      </div>
      <div class="stat-card mustard" style="cursor:pointer;" onclick="setReportTab('transactions')" title="Click to view stock adjustments & audit movements">
        <div class="label">Total Stock Adjustments</div>
        <div class="value" style="color:${totalAdjustedLitres >= 0 ? 'var(--teal-dark)' : 'var(--danger)'};">
          ${totalAdjustedLitres >= 0 ? '+' : ''}${formatLiters(totalAdjustedLitres)}
        </div>
        <div class="sub">Damage, count corrections & audits</div>
      </div>
      <div class="stat-card teal" style="cursor:pointer;" onclick="setReportTab('inventory')" title="Click to view catalog inventory asset valuation">
        <div class="label">Current Inventory Value</div>
        <div class="value">${peso(totalInvValue)}</div>
        <div class="sub">Total warehouse physical assets</div>
      </div>
    </div>
  `;
}

function renderInventoryStockReportSectionHtml() {
  const q = reportSearchQuery;
  const pFilter = reportProductFilter;
  const bFilter = reportBrandFilter;
  const sFilter = reportSupplierFilter;

  let products = (db.products || []).filter(p => {
    if (p.status === 'discontinued') return false;
    if (pFilter !== 'all' && p.id !== pFilter) return false;
    if (bFilter !== 'all' && (p.brand || '').toLowerCase() !== bFilter.toLowerCase()) return false;
    if (sFilter !== 'all' && p.supplierId !== sFilter) return false;
    if (q) {
      const hay = `${p.name} ${p.brand} ${p.type} ${p.color || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  let totalCans = 0;
  let totalLiters = 0;
  let totalStockVal = 0;

  const rowsData = [];
  products.forEach(p => {
    const hex = getProductHex(p);
    const sup = supplierById(p.supplierId);
    if (Array.isArray(p.sizesData) && p.sizesData.length > 0) {
      p.sizesData.forEach(sz => {
        const cans = Number(sz.sealedQuantity || 0);
        const sizeL = Number(sz.containerSize || 1);
        const ltrs = cans * sizeL;
        const pricePerCan = Number(sz.pricePerCan || ((Number(sz.pricePerLiter) || Number(p.price) || 0) * sizeL));
        const val = cans * pricePerCan;
        const thresh = Number(sz.minimumStock || (p.thresholdBySize && p.thresholdBySize[sizeL]) || 5);
        let status = 'In Stock';
        if (cans === 0) status = 'Out of Stock';
        else if (cans <= thresh) status = 'Low Stock';

        totalCans += cans;
        totalLiters += ltrs;
        totalStockVal += val;

        rowsData.push({
          product: p,
          supplierName: sup ? sup.name : '—',
          sizeId: sz.sizeId,
          sizeL,
          cans,
          ltrs,
          pricePerCan,
          val,
          thresh,
          status,
          hex
        });
      });
    } else {
      const cans = Number(p.stock || 0);
      const val = cans * Number(p.price || 0);
      const thresh = Number(p.threshold || 5);
      let status = 'In Stock';
      if (cans === 0) status = 'Out of Stock';
      else if (cans <= thresh) status = 'Low Stock';

      totalCans += cans;
      totalLiters += cans;
      totalStockVal += val;

      rowsData.push({
        product: p,
        supplierName: sup ? sup.name : '—',
        sizeId: 'Standard',
        sizeL: 1,
        cans,
        ltrs: cans,
        pricePerCan: Number(p.price || 0),
        val,
        thresh,
        status,
        hex
      });
    }
  });

  const pag = paginateArray(rowsData, 'rep_inventory_stock', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-inventory-stock-panel',
    recordLabel: 'items'
  });

  const paged = pag.pagedItems || pag.pageItems || [];

  return `
    <div class="panel" id="rep-inventory-stock-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">📦 Inventory Stock &amp; Valuation Report</h3>
          <span class="muted small">Complete warehouse physical stock quantities and asset values</span>
        </div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="stat-grid" style="margin-bottom:16px; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));">
          <div class="stat-card">
            <div class="label">Filtered Products</div>
            <div class="value">${products.length}</div>
            <div class="sub">Catalog product models</div>
          </div>
          <div class="stat-card teal">
            <div class="label">Total Sealed Units</div>
            <div class="value">${totalCans.toLocaleString()}</div>
            <div class="sub">Sealed units in warehouse</div>
          </div>
          <div class="stat-card sage">
            <div class="label">Total Paint Volume</div>
            <div class="value">${formatLiters(totalLiters)}</div>
            <div class="sub">Total volume on shelf</div>
          </div>
          <div class="stat-card mustard">
            <div class="label">Inventory Value</div>
            <div class="value">${peso(totalStockVal)}</div>
            <div class="sub">Current asset value</div>
          </div>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Brand &amp; Category</th>
              <th>Supplier</th>
              <th style="text-align:center;">Container Size</th>
              <th class="right">Stock (Units)</th>
              <th class="right">Volume (L)</th>
              <th class="right">Price / Unit</th>
              <th class="right">Asset Value</th>
              <th class="center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${paged.length ? paged.map(r => {
    const p = r.product;
    const stBadge = r.status === 'In Stock'
      ? '<span class="badge ok small">✓ Healthy</span>'
      : (r.status === 'Low Stock'
        ? '<span class="badge low small">⚠️ Low Stock</span>'
        : '<span class="badge danger small">✕ Out of Stock</span>');
    return `
                <tr>
                  <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="width:10px; height:10px; border-radius:2px; background:${r.hex || '#ccc'}; display:inline-block;"></span>
                      <span style="font-weight:700; color:var(--ink);">${escapeHtml(p.name)}</span>
                      ${p.color && p.color !== '-' ? `<span class="muted small">(${escapeHtml(p.color)})</span>` : ''}
                    </div>
                  </td>
                  <td style="font-size:12px;">${escapeHtml(p.brand || 'Generic')} · ${escapeHtml(p.type || p.category || 'Paint')}</td>
                  <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(r.supplierName)}</td>
                  <td style="text-align:center;"><span class="badge ghost small" style="font-weight:600;">${r.sizeL}L</span></td>
                  <td class="right" style="font-weight:700; font-size:13px;">${r.cans}</td>
                  <td class="right" style="font-size:12px; color:var(--ink-soft);">${formatLiters(r.ltrs)}</td>
                  <td class="right" style="font-size:12.5px;">${peso(r.pricePerCan)}</td>
                  <td class="right" style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px; color:var(--teal-dark);">${peso(r.val)}</td>
                  <td class="center">${stBadge}</td>
                </tr>
              `;
  }).join('') : `<tr><td colspan="9" class="empty-state">No inventory items match your search or filter.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pag.html}
    </div>
  `;
}

function renderPurchaseOrderReportSectionHtml(from, to) {
  const q = reportSearchQuery;
  const sFilter = reportSupplierFilter;

  let pos = (db.purchaseOrders || []).filter(o => {
    const oDate = o.orderDate ? o.orderDate.slice(0, 10) : '';
    if (from && oDate < from) return false;
    if (to && oDate > to) return false;
    if (sFilter !== 'all' && o.supplierId !== sFilter) return false;
    if (q) {
      const hay = `${o.poNumber} ${o.supplierName || ''} ${o.createdBy || ''} ${o.notes || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).slice().sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

  const totalPOs = pos.length;
  const pendingPOs = pos.filter(o => o.status === 'pending').length;
  const orderedPOs = pos.filter(o => o.status === 'ordered').length;
  const receivedPOs = pos.filter(o => o.status === 'received' || o.status === 'completed').length;
  const totalAmountSum = pos.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  const pag = paginateArray(pos, 'rep_pos', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-po-panel',
    recordLabel: 'purchase orders'
  });

  const paged = pag.pagedItems || pag.pageItems || [];

  return `
    <div class="panel" id="rep-po-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">📋 Purchase Order Report</h3>
          <span class="muted small">Procurement orders placed with suppliers for inventory restock</span>
        </div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="stat-grid" style="margin-bottom:16px; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));">
          <div class="stat-card">
            <div class="label">Total Orders</div>
            <div class="value">${totalPOs}</div>
            <div class="sub">In reporting period</div>
          </div>
          <div class="stat-card mustard">
            <div class="label">Pending Authorization</div>
            <div class="value">${pendingPOs}</div>
            <div class="sub">Awaiting admin review</div>
          </div>
          <div class="stat-card teal">
            <div class="label">Orders In Transit</div>
            <div class="value">${orderedPOs}</div>
            <div class="sub">Confirmed with supplier</div>
          </div>
          <div class="stat-card sage">
            <div class="label">Received Deliveries</div>
            <div class="value">${receivedPOs}</div>
            <div class="sub">Checked into warehouse</div>
          </div>
          <div class="stat-card">
            <div class="label">Total Order Value</div>
            <div class="value">${peso(totalAmountSum)}</div>
            <div class="sub">Combined procurement cost</div>
          </div>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>PO #</th>
              <th>Order Date</th>
              <th>Supplier Name</th>
              <th>Items &amp; Units Ordered</th>
              <th class="right">Total Amount</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Received Date</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${paged.length ? paged.map(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const totalCans = items.reduce((sum, it) => sum + (Number(it.qty !== undefined ? it.qty : (it.orderedQty || 0))), 0);
    const stBadge = o.status === 'received' || o.status === 'completed'
      ? '<span class="badge ok small">✓ Received</span>'
      : (o.status === 'pending'
        ? '<span class="badge warning small" style="background:#FEF3C7; color:#92400E;">⏳ Pending</span>'
        : (o.status === 'ordered'
          ? '<span class="badge teal small">Ordered</span>'
          : '<span class="badge danger small">✕ Cancelled</span>'));
    return `
                <tr>
                  <td style="font-family:'Space Grotesk',monospace; font-weight:700;">${escapeHtml(o.poNumber)}</td>
                  <td style="font-size:12px; color:var(--ink-soft);">${formatDateShort(o.orderDate)}</td>
                  <td style="font-weight:600; font-size:12.5px;">${escapeHtml(o.supplierName || '—')}</td>
                  <td style="font-size:12px;">${items.length} item${items.length === 1 ? '' : 's'} (${totalCans} units)</td>
                  <td class="right" style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px;">${peso(o.totalAmount)}</td>
                  <td>${stBadge}</td>
                  <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(o.createdBy || 'Staff')}</td>
                  <td style="font-size:12px; color:var(--ink-soft);">${o.receivedAt ? formatDateShort(o.receivedAt) : '<span class="muted">—</span>'}</td>
                  <td class="right">
                    <button class="btn ghost small" onclick="if(typeof viewPODetailsModal === 'function') { viewPODetailsModal('${o.id}'); } else if(typeof openPOPreviewModal === 'function') { openPOPreviewModal('${o.id}'); }">View</button>
                  </td>
                </tr>
              `;
  }).join('') : `<tr><td colspan="9" class="empty-state">No purchase orders found in this date range.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pag.html}
    </div>
  `;
}

function renderStockReceivingReportSectionHtml(from, to, moves) {
  const q = reportSearchQuery;
  const pFilter = reportProductFilter;
  const bFilter = reportBrandFilter;

  let receivingMoves = (moves || []).filter(m => {
    if (m.type !== 'receiving') return false;
    if (pFilter !== 'all' && m.productId !== pFilter) return false;
    if (bFilter !== 'all') {
      const p = productById(m.productId);
      if (!p || (p.brand || '').toLowerCase() !== bFilter.toLowerCase()) return false;
    }
    if (q) {
      const hay = `${m.productName || ''} ${m.staffName || ''} ${m.note || ''} ${m.reference || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  let totalLiters = 0;
  receivingMoves.forEach(m => {
    totalLiters += Number(m.qtyChange || 0);
  });

  const pag = paginateArray(receivingMoves, 'rep_receiving', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-receiving-panel',
    recordLabel: 'receiving records'
  });

  const paged = pag.pagedItems || pag.pageItems || [];

  return `
    <div class="panel" id="rep-receiving-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">🚚 Stock Receiving Report</h3>
          <span class="muted small">Record of all inventory shipments and stock restock arrivals</span>
        </div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="stat-grid" style="margin-bottom:16px; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
          <div class="stat-card sage">
            <div class="label">Total Inflow Volume</div>
            <div class="value">+${formatLiters(totalLiters)}</div>
            <div class="sub">Net liters checked in</div>
          </div>
          <div class="stat-card">
            <div class="label">Receiving Transactions</div>
            <div class="value">${receivingMoves.length}</div>
            <div class="sub">Individual restock entries</div>
          </div>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date &amp; Time</th>
              <th>Reference / PO #</th>
              <th>Product Name</th>
              <th>Brand</th>
              <th style="text-align:center;">Container Size</th>
              <th class="right">Volume Received</th>
              <th>Staff Receiver</th>
              <th>Delivery Notes</th>
            </tr>
          </thead>
          <tbody>
            ${paged.length ? paged.map(m => {
    const p = productById(m.productId);
    return `
                <tr>
                  <td style="font-size:12px; color:var(--ink-soft);">${formatDateTime(m.date)}</td>
                  <td><code style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal);">${escapeHtml(m.reference || 'Restock')}</code></td>
                  <td>
                    <span style="font-weight:600; color:var(--ink);">${escapeHtml(m.productName || (p ? p.name : 'Paint'))}</span>
                    ${p && p.color && p.color !== '-' ? `<span class="muted small">(${escapeHtml(p.color)})</span>` : ''}
                  </td>
                  <td style="font-size:12px;">${escapeHtml(p ? p.brand : '—')}</td>
                  <td style="text-align:center;"><span class="badge ghost small" style="font-weight:600;">${m.canSize || (p && p.sizes && p.sizes[0]) || 1}L</span></td>
                  <td class="right" style="font-weight:700; color:var(--success); font-size:13px;">+${formatLiters(m.qtyChange)}</td>
                  <td style="font-size:12px;">${escapeHtml(m.staffName || 'Staff')}</td>
                  <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(m.note || '—')}</td>
                </tr>
              `;
  }).join('') : `<tr><td colspan="8" class="empty-state">No stock receiving transactions in this date range.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pag.html}
    </div>
  `;
}

function renderSupplierReportSectionHtml(from, to) {
  const q = reportSearchQuery;
  const sFilter = reportSupplierFilter;

  let suppliers = (db.suppliers || []).filter(s => {
    if (sFilter !== 'all' && s.id !== sFilter) return false;
    if (q) {
      const hay = `${s.name} ${s.contact || ''} ${s.phone || ''} ${s.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const allPOs = db.purchaseOrders || [];
  const suppliersData = suppliers.map(s => {
    const sPOs = allPOs.filter(o => {
      if (o.supplierId !== s.id) return false;
      const oDate = o.orderDate ? o.orderDate.slice(0, 10) : '';
      if (from && oDate < from) return false;
      if (to && oDate > to) return false;
      return true;
    });

    const totalOrders = sPOs.length;
    const completedOrders = sPOs.filter(o => o.status === 'received' || o.status === 'completed').length;
    const totalSpend = sPOs.filter(o => o.status === 'received' || o.status === 'completed').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    return {
      supplier: s,
      productsCount: (s.productIds || []).length,
      totalOrders,
      completedOrders,
      totalSpend
    };
  });

  const totalSpendSum = suppliersData.reduce((sum, d) => sum + d.totalSpend, 0);

  const pag = paginateArray(suppliersData, 'rep_suppliers', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-suppliers-panel',
    recordLabel: 'suppliers'
  });

  const paged = pag.pagedItems || pag.pageItems || [];

  return `
    <div class="panel" id="rep-suppliers-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">🏢 Supplier Procurement Report</h3>
          <span class="muted small">Supplier account activity, linked catalog items, and procurement spend</span>
        </div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="stat-grid" style="margin-bottom:16px; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
          <div class="stat-card">
            <div class="label">Total Suppliers</div>
            <div class="value">${suppliers.length}</div>
            <div class="sub">Accredited suppliers</div>
          </div>
          <div class="stat-card teal">
            <div class="label">Total Procurement Spend</div>
            <div class="value">${peso(totalSpendSum)}</div>
            <div class="sub">Completed restock orders</div>
          </div>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Contact Person</th>
              <th>Phone</th>
              <th>Email</th>
              <th style="text-align:center;">Products Linked</th>
              <th style="text-align:center;">POs in Period</th>
              <th style="text-align:center;">Completed</th>
              <th class="right">Total Spend</th>
              <th>Status</th>
              <th class="right">Action</th>
            </tr>
          </thead>
          <tbody>
            ${paged.length ? paged.map(d => {
    const s = d.supplier;
    return `
                <tr>
                  <td style="font-weight:700; color:var(--ink);">${escapeHtml(s.name)}</td>
                  <td style="font-size:12.5px;">${escapeHtml(s.contact || '—')}</td>
                  <td style="font-size:12px;">${escapeHtml(s.phone || '—')}</td>
                  <td style="font-size:12px;">${s.email ? `<a href="mailto:${escapeHtml(s.email)}" style="color:var(--teal);">${escapeHtml(s.email)}</a>` : '—'}</td>
                  <td style="text-align:center;"><span class="badge ghost small" style="font-weight:600;">${d.productsCount}</span></td>
                  <td style="text-align:center; font-weight:600;">${d.totalOrders}</td>
                  <td style="text-align:center; font-weight:600; color:var(--teal);">${d.completedOrders}</td>
                  <td class="right" style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px; color:var(--teal-dark);">${peso(d.totalSpend)}</td>
                  <td>${s.status === 'active' ? '<span class="badge ok small">Active</span>' : '<span class="badge inactive small">Inactive</span>'}</td>
                  <td class="right">
                    <button class="btn ghost small" onclick="if(typeof openSupplierDetailsModal === 'function') { openSupplierDetailsModal('${s.id}'); }">Details</button>
                  </td>
                </tr>
              `;
  }).join('') : `<tr><td colspan="10" class="empty-state">No suppliers match your search or filter.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pag.html}
    </div>
  `;
}

function reportBodyHtml(from, to) {
  from = (from !== undefined) ? from : reportDateFrom;
  to = (to !== undefined) ? to : reportDateTo;
  const sales = salesBetween(from, to);
  const moves = movementsBetween(from, to);
  const isAdmin = currentUser && currentUser.role === 'admin';

  // Per-day totals for the bar chart
  const dayList = [];
  const chartFrom = from || (sales.length ? sales[sales.length - 1].date.slice(0, 10) : daysAgoISO(29));
  const chartTo = to || todayISO();
  let cur = new Date(chartFrom + 'T00:00:00');
  let end = new Date(chartTo + 'T00:00:00');
  if (isNaN(cur.getTime())) cur = new Date(daysAgoISO(29) + 'T00:00:00');
  if (isNaN(end.getTime())) end = new Date(todayISO() + 'T00:00:00');
  while (cur <= end && dayList.length < 35) {
    const iso = toLocalISODate(cur);
    dayList.push({ iso, total: sumSales(salesOn(iso).filter(s => (!from || s.date.slice(0, 10) >= from) && (!to || s.date.slice(0, 10) <= to))) });
    cur.setDate(cur.getDate() + 1);
  }
  const maxVal = Math.max(1, ...dayList.map(d => d.total));

  // Top products calculation handled by renderTopProductsSectionHtml(sales)

  const sortedMoves = moves.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const stockMoves = groupStockMovements(moves);
  const fmtQty = q => (q > 0 ? '+' : '') + formatStock(q);
  const colorMixMoves = sortedMoves.filter(m => m.type === 'colormix' && !m.productId);
  const staffLabel = reportStaffLabel;
  const low = lowStockProducts();

  // Sales calculations (excluding voided / cancelled transactions)
  const validSalesForRev = sales.filter(s => {
    const st = String((s && s.status) || 'completed').trim().toLowerCase();
    return st !== 'voided' && st !== 'void' && st !== 'cancelled' && st !== 'canceled';
  });
  const grossSales = validSalesForRev.reduce((t, s) => t + Number(s.total || 0), 0);
  const periodRefunds = validSalesForRev.reduce((t, s) => {
    const st = String(s.status || 'completed').trim().toLowerCase();
    const ref = Number(s.refundTotal || 0);
    const effRef = (st === 'refunded' && ref === 0 && (!s.returns || !s.returns.length)) ? Number(s.total || 0) : ref;
    return t + effRef;
  }, 0);
  const netSales = Number((grossSales - periodRefunds).toFixed(2));

  // Sales Section (Stats cards + Daily Bar Chart + Top Products)
  const salesHtml = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Net Revenue</div><div class="value">${peso(netSales)}</div></div>
      <div class="stat-card mustard"><div class="label">Gross Sales</div><div class="value">${peso(grossSales)}</div></div>
      <div class="stat-card low"><div class="label">Returns / Exchanges</div><div class="value">${peso(periodRefunds)}</div></div>
      <div class="stat-card sage"><div class="label">Transactions</div><div class="value">${sales.length}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Sales by Day</h3></div>
      <div class="panel-body">
        <div class="bar-chart">
          ${dayList.map(d => `
            <div class="bar-col">
              <span class="bar-val">${d.total ? Math.round(d.total).toLocaleString() : ''}</span>
              <div class="bar" style="height:${Math.max(2, (d.total / maxVal) * 100)}%"></div>
              <span class="bar-label">${formatDateOnly(d.iso)}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${renderTopProductsSectionHtml(sales)}`;

  const lowStockData = getLowStockReportData();
  const lowStockGrouped = lowStockData.products;
  const totalAffectedProducts = lowStockData.totalProducts;
  const totalRestockSizes = lowStockData.totalRestockSizes;
  const lowStockSizesCount = lowStockData.totalLowSizes;
  const outOfStockSizesCount = lowStockData.totalOutSizes;

  const lowStockPag = paginateArray(lowStockGrouped, 'rep_low_stock', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-low-stock-panel',
    recordLabel: 'products'
  });

  const stockMovesPag = paginateArray(stockMoves, 'rep_stock_movements', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-stock-movements-panel',
    recordLabel: 'movement batches'
  });

  // Inventory & Stock Section (Low stock + Movement Log)
  const inventoryHtml = `
    <div class="panel" id="rep-low-stock-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">Low-Stock Report</h3>
          <span class="muted small">Inventory items at or below minimum restocking thresholds</span>
        </div>
        <div class="spacer"></div>
        ${totalRestockSizes > 0
      ? `<span class="badge danger" style="font-size:12px; padding:3px 10px; font-weight:700;">⚠️ ${totalAffectedProducts} Product${totalAffectedProducts === 1 ? '' : 's'} (${totalRestockSizes} Size${totalRestockSizes === 1 ? '' : 's'} Requiring Restock)</span>`
      : '<span class="badge ok" style="font-size:12px; padding:3px 10px; font-weight:700;">✓ All Stock Healthy</span>'}
      </div>

      <!-- Low-Stock Report Summary Cards -->
      <div style="padding:16px 18px 0;">
        <div class="stat-grid" style="margin-bottom:16px; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
          <div class="stat-card">
            <div class="label">Affected Products</div>
            <div class="value">${totalAffectedProducts}</div>
            <div class="sub">${totalAffectedProducts === 1 ? '1 product' : `${totalAffectedProducts} products`} with stock alerts</div>
          </div>
          <div class="stat-card mustard">
            <div class="label">Sizes Requiring Restock</div>
            <div class="value">${totalRestockSizes}</div>
            <div class="sub">Total container sizes to reorder</div>
          </div>
          <div class="stat-card orange">
            <div class="label">Low Stock Sizes</div>
            <div class="value">${lowStockSizesCount}</div>
            <div class="sub">At or below minimum threshold</div>
          </div>
          <div class="stat-card danger">
            <div class="label">Out of Stock Sizes</div>
            <div class="value">${outOfStockSizesCount}</div>
            <div class="sub">Zero units currently available</div>
          </div>
        </div>
      </div>

      <div class="panel-body tight table-scroll">
        <table class="table-grouped-product">
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th style="min-width:95px; text-align:center;">Container Size</th>
              <th class="right" style="min-width:115px;">Stock Quantity (Units)</th>
              <th class="right" style="min-width:95px;">Stock Volume (L)</th>
              <th class="right" style="min-width:125px;">Minimum Threshold (Units)</th>
              <th class="right" style="min-width:115px;">Threshold Volume (L)</th>
              <th class="center" style="min-width:95px;">Stock Status</th>
            </tr>
          </thead>
          <tbody>${(lowStockPag.pagedItems || lowStockPag.pageItems || []).length ? (lowStockPag.pagedItems || lowStockPag.pageItems || []).map((item, pIdx) => {
        const p = item.product;
        const sizes = item.sizes;
        const rowSpan = sizes.length;
        const bgGroup = pIdx % 2 === 1 ? 'background:#FCFBF9;' : 'background:#FFFFFF;';

        return sizes.map((entry, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === rowSpan - 1;
          const s = entry.size;
          const count = entry.count;
          const thresh = entry.threshold;
          const stockVol = entry.stockVol;
          const threshVol = entry.threshVol;
          const st = entry.status;
          const borderBottom = isLast ? 'border-bottom: 2px solid #D8D1C4;' : 'border-bottom: 1px solid #F0ECE1;';
          const variant = entry.variant;

          return `
                <tr style="${bgGroup}">
                  ${isFirst ? `
                    <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                        <span style="font-weight:700; font-size:13px; color:var(--ink);">
                          ${escapeHtml(p.name)}
                        </span>
                      </div>
                      <div style="font-size:11px; color:var(--ink-soft); margin-top:2px;">
                        <code style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--teal);">(${getProductHex(p)})</code>
                        ${p.color && p.color !== '-' ? `(${escapeHtml(p.color)})` : ''}
                      </div>
                      <div class="muted small" style="margin-top:3px; font-size:11px;">
                        Total Stock: <b>${formatLiters(p.stock)}</b>
                      </div>
                    </td>
                    <td rowspan="${rowSpan}" style="vertical-align:middle; border-bottom: 2px solid #D8D1C4; border-right: 1px solid #EFE9DC; font-weight:600;">
                      ${escapeHtml(p.brand)}
                    </td>
                  ` : ''}
                  <td class="center" style="vertical-align:middle; ${borderBottom}">
                    <span class="badge" style="background:#FAF8F5; border:1px solid #E5DDCF; font-weight:700; font-family:'Space Grotesk',sans-serif; color:var(--ink); font-size:12px; padding:2px 8px;">
                      ${fmtSize(s)}
                    </span>
                  </td>
                  <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : 'color:#B45309;'}">
                    ${count} ${count === 1 ? 'unit' : 'units'}
                  </td>
                  <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} ${st === 'out' ? 'color:var(--danger);' : 'color:#B45309;'}">
                    ${formatLiters(stockVol)}
                  </td>
                  <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                    ${thresh} ${thresh === 1 ? 'unit' : 'units'}
                  </td>
                  <td class="right" style="font-weight:600; font-family:'Space Grotesk',sans-serif; vertical-align:middle; ${borderBottom} color:var(--ink);">
                    ${formatLiters(threshVol)}
                  </td>
                  <td class="center" style="vertical-align:middle; ${borderBottom}">
                    ${containerSizeStatusBadge(st)}
                  </td>
                </tr>`;
        }).join('');
      }).join('') : `<tr><td colspan="8" class="empty-state" style="padding:32px 16px; text-align:center; color:var(--ink-soft);">No low-stock or out-of-stock items found. All inventory levels are within their minimum stock thresholds.</td></tr>`}</tbody>
        </table>
      </div>
      ${lowStockPag.html}
    </div>
    <div class="panel" id="rep-stock-movements-panel">
      <div class="panel-head row">
        <h3>Stock Movement Log</h3>
        <div class="spacer"></div>
        <span class="muted small">${stockMoves.length} movement batch${stockMoves.length === 1 ? '' : 'es'}</span>
      </div>
      <div class="panel-body tight table-scroll">
        ${renderStockMovementsTable(stockMovesPag.pagedItems || stockMovesPag.pageItems || [], { emptyText: 'No movements in this range.' })}
      </div>
      ${stockMovesPag.html}
    </div>`;

  // Color Mixing Service Log Section
  const allMixRecords = colorMixMoves.map(m => extractMixingLogRecord(m));
  window._cachedMixingRecords = allMixRecords;
  const qMix = (reportSearchQuery || '').trim().toLowerCase();
  const filteredMixRecords = allMixRecords.filter(rec => {
    if (reportTxTypeFilter !== 'all' && reportTxTypeFilter !== 'colormix') {
      return false;
    }
    if (reportProductFilter !== 'all') {
      const hasProd = rec.components.some(c => c.productId === reportProductFilter) ||
        (db.movements || []).some(x => x.type === 'colormix' && x.date === rec.date && x.staffName === rec.staff && x.productId === reportProductFilter);
      if (!hasProd) return false;
    }
    if (reportBrandFilter !== 'all') {
      const bLower = reportBrandFilter.toLowerCase();
      const hasBrand = rec.components.some(c => c.brand && c.brand.toLowerCase() === bLower);
      if (!hasBrand) return false;
    }
    if (qMix) {
      const inColor = (rec.colorName || '').toLowerCase().includes(qMix);
      const inDet = (rec.detectedName || '').toLowerCase().includes(qMix);
      const inReceipt = (rec.receiptRef || '').toLowerCase().includes(qMix);
      const inStaff = (rec.staff || '').toLowerCase().includes(qMix);
      const inFormula = (rec.formulaString || '').toLowerCase().includes(qMix);
      const inNote = (rec.extraNote || '').toLowerCase().includes(qMix);
      const inDate = (rec.date || '').toLowerCase().includes(qMix) || (typeof formatDateTime === 'function' && formatDateTime(rec.date).toLowerCase().includes(qMix));
      const inLiters = `${rec.liters}l`.includes(qMix) || `${formatStock(rec.liters)}`.includes(qMix);
      const inHex = (rec.hexColor || '').toLowerCase().includes(qMix);
      const inComponents = (rec.components || []).some(c =>
        (c.name || '').toLowerCase().includes(qMix) ||
        (c.brand || '').toLowerCase().includes(qMix) ||
        (c.colorName || '').toLowerCase().includes(qMix) ||
        (c.hex || '').toLowerCase().includes(qMix) ||
        (c.containerSource || '').toLowerCase().includes(qMix)
      );
      if (!inColor && !inDet && !inReceipt && !inStaff && !inFormula && !inNote && !inDate && !inLiters && !inHex && !inComponents) {
        return false;
      }
    }
    return true;
  });

  filteredMixRecords.sort((a, b) => {
    let valA, valB;
    switch (reportMixingSortField) {
      case 'date':
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
        break;
      case 'color':
        valA = a.colorName.toLowerCase();
        valB = b.colorName.toLowerCase();
        break;
      case 'liters':
        valA = a.liters;
        valB = b.liters;
        break;
      case 'formula':
        valA = a.formulaString.toLowerCase();
        valB = b.formulaString.toLowerCase();
        break;
      case 'receipt':
        valA = (a.receiptRef || '').toLowerCase();
        valB = (b.receiptRef || '').toLowerCase();
        break;
      case 'staff':
        valA = a.staff.toLowerCase();
        valB = b.staff.toLowerCase();
        break;
      default:
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
    }
    if (valA < valB) return reportMixingSortAsc ? -1 : 1;
    if (valA > valB) return reportMixingSortAsc ? 1 : -1;
    return 0;
  });

  const mixPag = paginateArray(filteredMixRecords, 'rep_color_mixing', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-color-mixing-panel',
    recordLabel: 'mixing logs'
  });

  const mixSortIcon = field => {
    if (reportMixingSortField !== field) return '<span class="sort-icon" style="opacity:0.35;">⇅</span>';
    return `<span class="sort-icon active" style="color:var(--teal); font-weight:700;">${reportMixingSortAsc ? '▲' : '▼'}</span>`;
  };

  const mixTh = (field, label, extraClass = '', extraStyle = '') => `
    <th class="sortable-th ${extraClass} ${reportMixingSortField === field ? 'sorted' : ''}" 
        onclick="setMixingSort('${field}')" 
        style="cursor:pointer; user-select:none; ${extraStyle}" 
        title="Click to sort by ${label} (${reportMixingSortField === field && reportMixingSortAsc ? 'ascending' : 'descending'})">
      <div class="th-content ${extraClass === 'right' ? 'right' : ''}" style="display:inline-flex; align-items:center; gap:5px;">
        <span>${label}</span>
        ${mixSortIcon(field)}
      </div>
    </th>
  `;

  const mixingHtml = `
    <div class="panel" id="rep-color-mixing-panel">
      <div class="panel-head row wrap" style="gap:8px; align-items:center;">
        <div>
          <h3 style="margin:0;">Color Mixing Service Log</h3>
          <span class="muted small">Audited formulation recipes, dispersed volume &amp; linked sales receipts</span>
        </div>
        <div class="spacer"></div>
        <span class="muted small">${filteredMixRecords.length}${filteredMixRecords.length !== allMixRecords.length ? ` of ${allMixRecords.length}` : ''} mixing log(s)</span>
      </div>
      <div class="panel-body tight table-scroll">
        <table class="mixing-log-table">
          <thead>
            <tr>
              ${mixTh('date', 'Date &amp; Time', '', 'min-width:130px; width:14%;')}
              ${mixTh('color', 'Final Mixed Color', '', 'min-width:165px; width:20%;')}
              ${mixTh('liters', 'Volume', 'right', 'min-width:80px; width:8%; text-align:right;')}
              ${mixTh('formula', 'Formula Breakdown', '', 'min-width:270px; width:34%;')}
              ${mixTh('receipt', 'Receipt Reference', '', 'min-width:130px; width:12%;')}
              ${mixTh('staff', 'Staff / User', '', 'min-width:115px; width:12%;')}
            </tr>
          </thead>
          <tbody>
            ${(mixPag.pagedItems || mixPag.pageItems || []).length ? (mixPag.pagedItems || mixPag.pageItems || []).map(rec => `
              <tr class="mixing-log-row" onclick="openMixingDetailsModal('${escapeAttr(rec.id)}')" title="Click to view detailed color mixing formulation breakdown">
                <td style="white-space:nowrap; font-size:12.5px; color:var(--ink);">${formatDateTime(rec.date)}</td>
                <td>
                  <div class="mixing-final-color-cell">
                    <div class="mixing-final-swatch-wrap">
                      ${rec.hexColor ? `
                        <span class="mixing-final-swatch" style="background:${rec.hexColor};" title="Final Color: ${escapeAttr(rec.colorName)} (${rec.hexColor})"></span>
                      ` : `
                        <span class="mixing-final-swatch no-hex" title="Final Color: ${escapeAttr(rec.colorName)} (HEX not recorded)">?</span>
                      `}
                    </div>
                    <div class="mixing-final-info">
                      <div class="mixing-final-title">${escapeHtml(rec.colorName)}</div>
                      ${rec.detectedName && rec.detectedName.toLowerCase() !== rec.colorName.toLowerCase() ? `
                        <div class="mixing-final-detected">[${escapeHtml(rec.detectedName)}]</div>
                      ` : ''}
                      <div class="mixing-final-meta">
                        ${rec.hexColor ? `
                          <code class="mixing-hex-code">${escapeHtml(rec.hexColor)}</code>
                        ` : `
                          <span class="mixing-hex-missing">HEX not recorded</span>
                        `}
                        <span class="mixing-ing-count-pill">${rec.components.length} ingredient${rec.components.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="right" style="font-family:'Space Grotesk',monospace; font-weight:700; font-size:13px; color:var(--teal-dark); text-align:right; white-space:nowrap;">
                  ${formatStock(rec.liters)} L
                </td>
                <td>
                  <div class="mixing-formula-wrap">
                    ${rec.components.length ? `
                      <div class="mixing-formula-breakdown">
                        ${rec.components.map(c => `
                          <div class="formula-ing-item">
                            <span class="formula-ing-swatch ${!c.hex ? 'no-hex' : ''}" style="${c.hex ? `background:${c.hex};` : ''}" title="${escapeAttr(c.colorName || 'Color')} (${c.hex || 'No HEX'})"></span>
                            <span class="formula-ing-pct">${escapeHtml(c.percentage || (c.pctNum ? `${c.pctNum}%` : ''))}</span>
                            <span class="formula-ing-name">${escapeHtml(c.name)}</span>
                            ${c.brand ? `<span class="formula-ing-brand">(${escapeHtml(c.brand)})</span>` : ''}
                            <span class="formula-ing-color-tag">
                              <span class="formula-ing-color-name">${escapeHtml(c.colorName || 'Standard')}</span>
                              <code class="formula-ing-hex ${!c.hex ? 'missing' : ''}">${c.hex ? escapeHtml(c.hex) : 'No HEX'}</code>
                            </span>
                            <span class="formula-ing-vol">${c.liters ? `· ${formatStock(c.liters)} L` : ''}</span>
                            ${c.containerSource ? `<span class="formula-ing-src" title="${escapeAttr(c.containerSource)}">🫙 ${escapeHtml(c.containerSource)}</span>` : ''}
                          </div>
                        `).join('')}
                      </div>
                    ` : (rec.rawFormula ? `
                      <div style="font-size:12px; font-weight:500; color:var(--ink); line-height:1.35;">${escapeHtml(rec.rawFormula)}</div>
                    ` : `<span class="muted small">—</span>`)}
                    ${rec.extraNote ? `<div class="mixing-extra-note">Note: ${escapeHtml(rec.extraNote)}</div>` : ''}
                  </div>
                </td>
                <td style="white-space:nowrap;" onclick="event.stopPropagation();">
                  ${rec.receiptRef ? (isAdmin ? `
                    <button type="button" class="receipt-ref-btn" onclick="openMixingReceiptModal('${escapeAttr(rec.receiptRef)}')" title="Click to view sales transaction ${escapeAttr(rec.receiptRef)}">
                      <span>🧾</span>
                      <span>${escapeHtml(rec.receiptRef)}</span>
                    </button>
                  ` : `
                    <span class="receipt-ref-static" title="Official Receipt ${escapeAttr(rec.receiptRef)}">
                      <span>🧾</span>
                      <span>${escapeHtml(rec.receiptRef)}</span>
                    </span>
                  `) : `
                    <span class="muted small" title="Direct inventory mix (no sales receipt)">—</span>
                  `}
                </td>
                <td style="font-size:12.5px;">
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    <div>${staffLabel(rec.staff)}</div>
                    <div>
                      <button type="button" class="btn ghost small mixing-details-action-btn" onclick="event.stopPropagation(); openMixingDetailsModal('${escapeAttr(rec.id)}')" title="View detailed formulation breakdown">
                        <span>🔍 Details</span>
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="6" class="empty-state" style="padding:28px 16px; text-align:center; color:var(--ink-soft);">
                  No color mixing services match the selected date range or filters.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
      ${mixPag.html}
    </div>`;

  // Sales History Section (filtered to date range, with Overall Sales Summary & Pagination)
  const historyHtml = renderReportsSalesHistorySectionHtml(sales, from, to);

  // Returns & Exchanges Section (dedicated audited log)
  const allReturns = [];
  (db.sales || []).forEach(sale => {
    (sale.returns || []).forEach(ret => {
      const d = toLocalISODate(new Date(ret.date || sale.date));
      if ((!from || d >= from) && (!to || d <= to)) {
        allReturns.push({
          ...ret,
          saleId: sale.id,
          receiptNo: getReceiptNo(sale)
        });
      }
    });
  });
  allReturns.sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalRefundedInRange = allReturns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);

  const returnsPag = paginateArray(allReturns, 'rep_returns', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-returns-panel',
    recordLabel: 'returns'
  });

  const returnsHtml = `
    <div class="panel" id="rep-returns-panel">
      <div class="panel-head row wrap" style="gap:10px; align-items:center;">
        <div>
          <h3 style="margin:0;">Returns &amp; Exchanges Log</h3>
          <span class="muted small">Audited return &amp; exchange vouchers and item replacements</span>
        </div>
        <div class="spacer"></div>
        <div class="row wrap" style="gap:8px; align-items:center;">
          <button type="button" class="btn secondary small" onclick="openStartReturnPickerModal()" style="display:inline-flex; align-items:center; gap:5px;" title="Process a new return &amp; exchange">
            ↩️ Process Return / Exchange
          </button>
          ${allReturns.length
      ? `<span class="badge low" style="font-size:12px; padding:3px 8px;">${allReturns.length} Return(s) · Value: ${peso(totalRefundedInRange)}</span>`
      : '<span class="badge ok">No Returns in Range</span>'}
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        <table>
          <thead>
            <tr>
              <th>Voucher / Date</th>
              <th>Orig. Receipt</th>
              <th>Items Returned</th>
              <th>Replacement Issued</th>
              <th>Reason &amp; Condition</th>
              <th class="right">Return / Exchange Value</th>
              <th>Processed By</th>
              <th class="right">Slip</th>
            </tr>
          </thead>
          <tbody>
            ${(returnsPag.pagedItems || returnsPag.pageItems || []).length ? (returnsPag.pagedItems || returnsPag.pageItems || []).map(r => {
        const exItems = Array.isArray(r.exchangeItems) ? r.exchangeItems : [];
        const exVal = Number(r.exchangeAmount || 0);
        const retVal = Number(r.refundAmount || 0);
        return `
              <tr>
                <td>
                  <strong style="font-family:'Space Grotesk'; font-size:12px; color:var(--ink);">${escapeHtml(r.voucherNo || r.id)}</strong>
                  <div class="muted small" style="font-size:11px;">${formatDateTime(r.date)}</div>
                </td>
                <td><code style="color:var(--teal); font-weight:700;">${escapeHtml(r.receiptNo)}</code></td>
                <td>
                  ${(r.items || []).map(it => {
          const col = it.color || it.colorName;
          const colStr = col ? ` — ${escapeHtml(col)}` : '';
          return `<div>${escapeHtml(it.name)}${colStr} <strong>&times; ${formatStock(it.qty)}</strong> (${peso(it.lineRefund)})</div>`;
        }).join('') || '<span class="muted">Returned item</span>'}
                </td>
                <td>
                  ${exItems.length ? exItems.map(ex => {
          const colStr = ex.color && ex.color !== '-' ? ` — ${escapeHtml(ex.color)}` : '';
          return `<div>${escapeHtml(ex.name)}${colStr} (${ex.size || 1}L) <strong>&times; ${formatStock(ex.qty)}</strong> (${peso(ex.lineTotal)})</div>`;
        }).join('') : '<span class="muted small">Return Credit Only</span>'}
                </td>
                <td>
                  <div style="font-weight:600; font-size:12px;">${escapeHtml(r.reason || 'Return / Exchange')}</div>
                  <div style="margin-top:2px;">
                    ${r.restocked
            ? '<span class="badge ok" style="font-size:10px; padding:1px 5px;">Restocked</span>'
            : '<span class="badge low" style="font-size:10px; padding:1px 5px;">Damaged / Not Restocked</span>'}
                    ${r.note ? `<span class="muted small" style="margin-left:4px;">${escapeHtml(r.note)}</span>` : ''}
                  </div>
                </td>
                <td class="right" style="font-family:'Space Grotesk'; font-weight:700; font-size:13.5px;">
                  <div style="color:var(--danger);">-${peso(retVal)}</div>
                  ${exVal > 0 ? `<div class="small" style="color:var(--teal); font-size:11px;">Exch: +${peso(exVal)}</div>` : ''}
                </td>
                <td>${staffLabel(r.cashierName)}</td>
                <td class="right">
                  <button class="btn ghost small" onclick='showReturnVoucherModal("${r.saleId}", "${r.id}")' title="View return &amp; exchange slip" style="color:#856404; background:#FFF3CD; border:1px solid #FFEBAA; padding:2px 7px; font-size:11px;">📋 Slip</button>
                </td>
              </tr>`;
      }).join('') : `<tr><td colspan="8" class="empty-state">No product returns or exchanges in this date range.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${returnsPag.html}
    </div>`;

  // Transaction History Section (Full Stock Movements Log)
  const txPag = paginateArray(stockMoves, 'rep_transactions', {
    onUpdate: renderReportBody,
    scrollTarget: '#rep-transactions-panel',
    recordLabel: 'transactions'
  });

  const transactionsHtml = `
    <div class="panel" id="rep-transactions-panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">📜 Complete Transaction History (Stock Movement Log)</h3>
          <span class="muted small">${stockMoves.length} transaction batch(es) recorded in this period</span>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        ${renderStockMovementsTable(txPag.pagedItems || txPag.pageItems || [], { emptyText: 'No stock movements or transactions recorded in this date range.' })}
      </div>
      ${txPag.html}
    </div>`;

  // Previous Inventory Report Section
  let totalReceivedLitres = 0;
  let totalSoldLitres = 0;
  let totalMixedLitres = 0;
  let totalAdjustedLitres = 0;

  moves.forEach(m => {
    const q = Number(m.qtyChange) || 0;
    if (m.type === 'receiving') totalReceivedLitres += q;
    else if (m.type === 'sale') totalSoldLitres += Math.abs(q);
    else if (m.type === 'colormix') totalMixedLitres += Math.abs(q);
    else if (m.type === 'adjustment') totalAdjustedLitres += q;
  });

  const previousInventoryReportHtml = `
    <div class="panel">
      <div class="panel-head row wrap" style="gap:10px;">
        <div>
          <h3 style="margin:0;">📋 Previous Inventory Reports &amp; Stock Turnover</h3>
          <span class="muted small">Historical stock movement audit trail for period: <b>${formatDateRangeSummary(from, to, '')}</b></span>
        </div>
      </div>
      <div style="padding:16px 18px 0;">
        <div class="stats-row" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
          <div class="stat-card sage">
            <div class="label">Stock Inflow (Received)</div>
            <div class="value">+${formatLiters(totalReceivedLitres)}</div>
            <div class="sub">Deliveries &amp; restocking</div>
          </div>
          <div class="stat-card teal">
            <div class="label">POS Paint Sold</div>
            <div class="value">-${formatLiters(totalSoldLitres)}</div>
            <div class="sub">POS register sales</div>
          </div>
          <div class="stat-card orange">
            <div class="label">Color Mixing Dispersed</div>
            <div class="value">-${formatLiters(totalMixedLitres)}</div>
            <div class="sub">Custom tinting consumption</div>
          </div>
          <div class="stat-card">
            <div class="label">Net Adjustments</div>
            <div class="value" style="color:${totalAdjustedLitres >= 0 ? 'var(--teal-dark)' : 'var(--danger)'};">${totalAdjustedLitres >= 0 ? '+' : ''}${formatLiters(totalAdjustedLitres)}</div>
            <div class="sub">Audits, corrections &amp; damage</div>
          </div>
        </div>
      </div>
      <div class="panel-body tight table-scroll">
        ${inventoryHtml}
      </div>
    </div>`;

  const isHistorical = isHistoricalView(from, to);
  const curY = getCurrentYear();
  let histLabel = 'All-Time Historical Records';
  if (from && to && from.slice(0, 4) === to.slice(0, 4)) {
    histLabel = `Calendar Year ${from.slice(0, 4)} Historical Records`;
  } else if (from && to) {
    histLabel = `Historical Reporting Period (${formatDateReadable(from)} – ${formatDateReadable(to)})`;
  } else if (from) {
    histLabel = `Historical Records from ${formatDateReadable(from)}`;
  } else if (to) {
    histLabel = `Historical Records until ${formatDateReadable(to)}`;
  }

  const historicalBannerHtml = isHistorical ? `
    <div class="historical-records-banner" style="margin-bottom:14px; border-radius:var(--radius-sm); border:1px solid #EED8B5;">
      <div>
        🏛️ <b>${escapeHtml(histLabel)}:</b> Displaying historical business &amp; inventory records (<b>${sales.length}</b> sales transactions, <b>${moves.length}</b> stock movements). All historical database records are permanently retained and accessible.
      </div>
      <button type="button" class="btn ghost small" onclick="setReportDatePreset('year')" style="color:#7B4F09; border-color:#D19A42; background:#fff;">Return to Current Year (${curY}) &rarr;</button>
    </div>
  ` : '';

  const summaryCardsHtml = renderOverallReportSummaryCardsHtml(from, to, sales, moves);
  const inventoryStockHtml = renderInventoryStockReportSectionHtml();
  const poReportHtml = renderPurchaseOrderReportSectionHtml(from, to);
  const receivingReportHtml = renderStockReceivingReportSectionHtml(from, to, moves);
  const supplierReportHtml = renderSupplierReportSectionHtml(from, to);

  // Render according to active toggle menu tab
  let contentHtml = '';
  if (reportActiveTab === 'sales') {
    contentHtml = isAdmin ? (summaryCardsHtml + salesHtml) : '<div class="empty-state">Sales reports are restricted to administrators.</div>';
  } else if (reportActiveTab === 'history') {
    contentHtml = isAdmin ? (summaryCardsHtml + historyHtml) : '<div class="empty-state">Sales history is restricted to administrators.</div>';
  } else if (reportActiveTab === 'inventory') {
    contentHtml = summaryCardsHtml + inventoryStockHtml;
  } else if (reportActiveTab === 'low_stock') {
    contentHtml = summaryCardsHtml + inventoryHtml;
  } else if (reportActiveTab === 'transactions') {
    contentHtml = summaryCardsHtml + transactionsHtml;
  } else if (reportActiveTab === 'purchase_orders') {
    contentHtml = summaryCardsHtml + poReportHtml;
  } else if (reportActiveTab === 'receiving') {
    contentHtml = summaryCardsHtml + receivingReportHtml;
  } else if (reportActiveTab === 'supplier_report') {
    contentHtml = summaryCardsHtml + supplierReportHtml;
  } else if (reportActiveTab === 'previous_inventory') {
    contentHtml = summaryCardsHtml + previousInventoryReportHtml;
  } else if (reportActiveTab === 'mixing') {
    contentHtml = summaryCardsHtml + mixingHtml;
  } else if (reportActiveTab === 'returns') {
    contentHtml = isAdmin ? (summaryCardsHtml + returnsHtml) : '<div class="empty-state">Returns report is restricted to administrators.</div>';
  } else {
    // 'all' tab: render all relevant report sections
    contentHtml = `
      ${summaryCardsHtml}
      ${isAdmin ? salesHtml : ''}
      ${inventoryStockHtml}
      ${inventoryHtml}
      ${poReportHtml}
      ${receivingReportHtml}
      ${supplierReportHtml}
      ${mixingHtml}
      ${isAdmin ? historyHtml : ''}
      ${isAdmin ? returnsHtml : ''}
    `;
  }
  return historicalBannerHtml + contentHtml;
}

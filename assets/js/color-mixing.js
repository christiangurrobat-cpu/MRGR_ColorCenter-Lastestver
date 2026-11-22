/* ============================================================
   COLOR MIXING & AUTOMATIC COLOR DETECTION ENGINE
   Single Source of Truth: color-library.js (getColorLibraryList)
   Mixing Model: Spectral-Overlap Kubelka-Munk (K/S) Approximation
   ============================================================ */

/* --- 1. RGB / HEX / Linear Color Space Utilities (Separate from Pigment Math) --- */

// Mixed-color-only dictionary (standard/common base colors live in Color Library)
const PAINT_COLOR_DICTIONARY = [
  { name: 'Cream', hex: '#FFFFD4', r: 255, g: 255, b: 212, family: 'Cream' },
  { name: 'Warm Vanilla', hex: '#FFEFAE', r: 255, g: 239, b: 174, family: 'Cream' },
  { name: 'Soft Eggshell', hex: '#F2DBCE', r: 242, g: 219, b: 206, family: 'Cream' },
  { name: 'Golden Sand', hex: '#EDCEBD', r: 237, g: 206, b: 189, family: 'Yellow' },
  { name: 'Warm Champagne', hex: '#E9C4B1', r: 233, g: 196, b: 177, family: 'Cream' },
  { name: 'Honey Wheat', hex: '#E6BCA8', r: 230, g: 188, b: 168, family: 'Yellow' },
  { name: 'Medium Rose', hex: '#D28888', r: 210, g: 136, b: 136, family: 'Pink' },
  { name: 'Terracotta Rose', hex: '#C5706E', r: 197, g: 112, b: 110, family: 'Pink' },
  { name: 'Soft Blush Rose', hex: '#D19395', r: 209, g: 147, b: 149, family: 'Pink' },
  { name: 'Muted Berry Rose', hex: '#C88386', r: 200, g: 131, b: 134, family: 'Pink' },
  { name: 'Dusty Rose', hex: '#CA868C', r: 202, g: 134, b: 140, family: 'Pink' },
  { name: 'Pale Orchid', hex: '#EECCED', r: 238, g: 204, b: 237, family: 'Purple' },
  { name: 'Berry Blush', hex: '#BA6A89', r: 186, g: 106, b: 137, family: 'Pink' },
  { name: 'Rosewood Tint', hex: '#B86D72', r: 184, g: 109, b: 114, family: 'Pink' },
  { name: 'Light Orchid', hex: '#E7B9E6', r: 231, g: 185, b: 230, family: 'Purple' },
  { name: 'Sunset Coral', hex: '#FF6A24', r: 255, g: 106, b: 36, family: 'Orange' },
  { name: 'Warm Buttercream', hex: '#FFEAA0', r: 255, g: 234, b: 160, family: 'Yellow' },
  { name: 'Pale Vanilla Cream', hex: '#FFF4C3', r: 255, g: 244, b: 195, family: 'Cream' },
  { name: 'Coral Blush', hex: '#FFA472', r: 255, g: 164, b: 114, family: 'Orange' },
  { name: 'Terracotta Clay', hex: '#CC6542', r: 204, g: 101, b: 66, family: 'Orange' },
  { name: 'Burnt Sienna', hex: '#C75E3C', r: 199, g: 94, b: 60, family: 'Orange' },
  { name: 'Copper Ochre', hex: '#CE7924', r: 206, g: 121, b: 36, family: 'Orange' },
  { name: 'Melon Sorbet', hex: '#FFC194', r: 255, g: 193, b: 148, family: 'Orange' },
  { name: 'Spiced Amber', hex: '#D47923', r: 212, g: 121, b: 35, family: 'Orange' },
  { name: 'Burnt Rust', hex: '#AC3E26', r: 172, g: 62, b: 38, family: 'Orange' },
  { name: 'Dark Bronze', hex: '#7B4535', r: 123, g: 69, b: 53, family: 'Brown' },
  { name: 'Rust Brown', hex: '#974433', r: 151, g: 68, b: 51, family: 'Brown' },
  { name: 'Copper Brown', hex: '#984432', r: 152, g: 68, b: 50, family: 'Brown' },
  { name: 'Cinnamon Orange', hex: '#BE5032', r: 190, g: 80, b: 50, family: 'Orange' },
  { name: 'Bright Lemon', hex: '#FFFF7C', r: 255, g: 255, b: 124, family: 'Yellow' },
  { name: 'Buttercup Tint', hex: '#FFE085', r: 255, g: 224, b: 133, family: 'Yellow' },
  { name: 'Honey Gold', hex: '#DCB02F', r: 220, g: 176, b: 47, family: 'Yellow' },
  { name: 'Mustard Ochre', hex: '#DAAB30', r: 218, g: 171, b: 48, family: 'Yellow' },
  { name: 'Saffron Gold', hex: '#DEB357', r: 222, g: 179, b: 87, family: 'Yellow' },
  { name: 'Sunlit Straw', hex: '#FFE38C', r: 255, g: 227, b: 140, family: 'Yellow' },
  { name: 'Aqua Mint', hex: '#3BC06A', r: 59, g: 192, b: 106, family: 'Green' },
  { name: 'Rich Leaf Green', hex: '#42CA2C', r: 66, g: 202, b: 44, family: 'Green' },
  { name: 'Deep Forest', hex: '#5B763C', r: 91, g: 118, b: 60, family: 'Green' },
  { name: 'Soft Mint', hex: '#8FE5C9', r: 143, g: 229, b: 201, family: 'Green' },
  { name: 'Bright Seafoam', hex: '#83E3B6', r: 131, g: 227, b: 182, family: 'Green' },
  { name: 'Spring Leaf', hex: '#5BD383', r: 91, g: 211, b: 131, family: 'Green' },
  { name: 'Fresh Mint', hex: '#5FD39A', r: 95, g: 211, b: 154, family: 'Green' },
  { name: 'Vibrant Meadow Green', hex: '#64DF40', r: 100, g: 223, b: 64, family: 'Green' },
  { name: 'Celadon Jade', hex: '#B6F5C7', r: 182, g: 245, b: 199, family: 'Green' },
  { name: 'Dark Moss', hex: '#516931', r: 81, g: 105, b: 49, family: 'Green' },
  { name: 'Eucalyptus', hex: '#0E8882', r: 14, g: 136, b: 130, family: 'Green' },
  { name: 'Charcoal Pine', hex: '#2D5844', r: 45, g: 88, b: 68, family: 'Green' },
  { name: 'Rich Avocado', hex: '#828D38', r: 130, g: 141, b: 56, family: 'Green' },
  { name: 'Baby Blue', hex: '#64BEFF', r: 100, g: 190, b: 255, family: 'Blue' },
  { name: 'Pale Sky Blue', hex: '#B6E8FF', r: 182, g: 232, b: 255, family: 'Blue' },
  { name: 'Clear Sky Blue', hex: '#8FD7FF', r: 143, g: 215, b: 255, family: 'Blue' },
  { name: 'Light Powder Blue', hex: '#9EDFFF', r: 158, g: 223, b: 255, family: 'Blue' },
  { name: 'Cobalt Blue', hex: '#03797A', r: 3, g: 121, b: 122, family: 'Blue' },
  { name: 'Ocean Blue', hex: '#037B6F', r: 3, g: 123, b: 111, family: 'Blue' },
  { name: 'Steel Denim', hex: '#115D95', r: 17, g: 93, b: 149, family: 'Blue' },
  { name: 'Slate Cobalt', hex: '#145B85', r: 20, g: 91, b: 133, family: 'Blue' },
  { name: 'Bright Sky Blue', hex: '#5FBAFF', r: 95, g: 186, b: 255, family: 'Blue' },
  { name: 'Midnight Charcoal', hex: '#36385F', r: 54, g: 56, b: 95, family: 'Gray' },
  { name: 'Aegean Blue', hex: '#17597A', r: 23, g: 89, b: 122, family: 'Blue' },
  { name: 'Lavender', hex: '#807CCC', r: 128, g: 124, b: 204, family: 'Purple' },
  { name: 'Soft Lilac', hex: '#E2ACE1', r: 226, g: 172, b: 225, family: 'Purple' },
  { name: 'Wisteria Bloom', hex: '#DEA1DD', r: 222, g: 161, b: 221, family: 'Purple' },
  { name: 'Dusty Plum', hex: '#5D3C56', r: 93, g: 60, b: 86, family: 'Purple' },
  { name: 'Charcoal Slate', hex: '#6C596C', r: 108, g: 89, b: 108, family: 'Gray' },
  { name: 'Bright Orchid', hex: '#D48AD3', r: 212, g: 138, b: 211, family: 'Purple' },
  { name: 'Mulberry', hex: '#5F295E', r: 95, g: 41, b: 94, family: 'Purple' },
  { name: 'Medium Orchid', hex: '#CC7ACB', r: 204, g: 122, b: 203, family: 'Purple' },
  { name: 'Mustard Gold', hex: '#CF9167', r: 207, g: 145, b: 103, family: 'Yellow' },
  { name: 'Warm Wheat', hex: '#E3B6A0', r: 227, g: 182, b: 160, family: 'Yellow' },
  { name: 'Golden Ochre', hex: '#D1927A', r: 209, g: 146, b: 122, family: 'Yellow' },
  { name: 'Dark Olive', hex: '#6C594D', r: 108, g: 89, b: 77, family: 'Green' },
  { name: 'Sunlit Ochre', hex: '#E6C18D', r: 230, g: 193, b: 141, family: 'Yellow' },
  { name: 'Honey Tan', hex: '#E0B09A', r: 224, g: 176, b: 154, family: 'Brown' },
  { name: 'Cinnamon Clay', hex: '#B4674C', r: 180, g: 103, b: 76, family: 'Brown' },
  { name: 'Caramel Cocoa', hex: '#A25339', r: 162, g: 83, b: 57, family: 'Brown' },
  { name: 'Deep Umber', hex: '#523C31', r: 82, g: 60, b: 49, family: 'Brown' },
  { name: 'Spiced Mustard', hex: '#DEAB94', r: 222, g: 171, b: 148, family: 'Yellow' },
  { name: 'Modern Slate', hex: '#4D5556', r: 77, g: 85, b: 86, family: 'Gray' },
  { name: 'Charcoal Taupe', hex: '#565452', r: 86, g: 84, b: 82, family: 'Gray' },
  { name: 'Medium Neutral Gray', hex: '#AAAAAA', r: 170, g: 170, b: 170, family: 'Gray' },
  { name: 'Pale Olive', hex: '#B9C5B3', r: 185, g: 197, b: 179, family: 'Green' },
  { name: 'Pewter Gray', hex: '#777777', r: 119, g: 119, b: 119, family: 'Gray' },
  { name: 'Dark Neutral Gray', hex: '#6F6F6F', r: 111, g: 111, b: 111, family: 'Gray' },
  { name: 'Deep Slate Gray', hex: '#2E3E40', r: 46, g: 62, b: 64, family: 'Gray' },
  { name: 'Dark Graphite', hex: '#626262', r: 98, g: 98, b: 98, family: 'Gray' }
];

function hexToRgb(hex) {
  let raw = String(hex || '').replace('#', '').trim();
  if (raw.length === 3) {
    raw = raw.split('').map(c => c + c).join('');
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return { r: 255, g: 255, b: 255 };
  const num = parseInt(raw, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  const toHex = v => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function srgbChannelToLinear(c255) {
  const c = Math.max(0, Math.min(1, (Number(c255) || 0) / 255));
  return c <= 0.04045 ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(lin) {
  const c = Math.max(0, Math.min(1, Number(lin) || 0));
  const s = c <= 0.0031308 ? (12.92 * c) : (1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

function isLightColor(hex) {
  const rgb = hexToRgb(hex);
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) > 165;
}

/* --- 2. Color Library Single-Source-of-Truth Resolution --- */

function getMasterColorLibrary() {
  if (typeof getColorLibraryList === 'function') {
    return getColorLibraryList();
  }
  return [];
}

function getProductDefaultColor(product) {
  if (!product) return '#FFFFFF';
  const cid = product.colorId || product.color_id;
  if (cid && typeof findColorLibraryEntry === 'function') {
    const libEntry = findColorLibraryEntry(cid);
    if (libEntry && libEntry.hex) {
      return (typeof normalizeHexCode === 'function' ? normalizeHexCode(libEntry.hex) : libEntry.hex.toUpperCase()) || '#FFFFFF';
    }
  }
  const directHex = typeof normalizeHexCode === 'function'
    ? normalizeHexCode(product.colorHex || product.color_hex)
    : ((product.colorHex && /^#[0-9A-Fa-f]{6}$/i.test(product.colorHex)) ? product.colorHex.toUpperCase() : '');
  if (directHex) return directHex;
  if (product.color && String(product.color).trim().startsWith('#')) {
    const cHex = typeof normalizeHexCode === 'function' ? normalizeHexCode(product.color) : product.color.trim().toUpperCase();
    if (cHex) return cHex;
  }
  const lib = getMasterColorLibrary();
  const str = `${product.color || ''} ${product.name || ''}`.toLowerCase();
  for (const item of lib) {
    if (item.name && str.includes(item.name.toLowerCase())) {
      return item.hex;
    }
  }
  for (const item of PAINT_COLOR_DICTIONARY) {
    if (str.includes(item.name.toLowerCase())) {
      return item.hex;
    }
  }
  // Safe keyword fallbacks for unlinked legacy inventory items
  if (str.includes('black') || str.includes('noir')) return '#1B1B1B';
  if (str.includes('white') || str.includes('blanco')) return '#FFFFFF';
  if (str.includes('red') || str.includes('crimson') || str.includes('scarlet')) return '#E32636';
  if (str.includes('yellow') || str.includes('lemon') || str.includes('canary')) return '#FFF44F';
  if (str.includes('blue') || str.includes('ocean') || str.includes('royal') || str.includes('navy')) return '#1E88E5';
  if (str.includes('green') || str.includes('emerald') || str.includes('leaf')) return '#43A047';
  if (str.includes('orange') || str.includes('sunset') || str.includes('tangerine')) return '#FF8500';
  if (str.includes('violet') || str.includes('purple') || str.includes('lilac')) return '#8E24AA';
  if (str.includes('silver') || str.includes('gray') || str.includes('grey')) return '#C0C0C0';
  if (str.includes('gold') || str.includes('golden')) return '#D4AF37';
  if (str.includes('brown') || str.includes('chocolate') || str.includes('mocha')) return '#6D4C41';
  if (str.includes('pink') || str.includes('rose') || str.includes('blush')) return '#FF66CC';
  if (str.includes('cyan') || str.includes('teal') || str.includes('turquoise')) return '#008080';
  if (str.includes('beige') || str.includes('cream') || str.includes('ivory')) return '#F5F5DC';
  return '#1F6F6B';
}

function getProductColorName(product) {
  if (!product) return 'Standard';
  if (typeof resolveProductColor === 'function') {
    const resolved = resolveProductColor(product);
    if (resolved && resolved.isLinked && resolved.name && resolved.name !== '-') {
      return resolved.name;
    }
  }
  if (product.color && product.color !== '-' && !String(product.color).startsWith('#')) {
    return product.color;
  }
  if (product.colorName && product.colorName !== '-') {
    return product.colorName;
  }
  const str = `${product.name || ''}`.toLowerCase();
  const lib = getMasterColorLibrary();
  for (const item of lib) {
    if (item.name && str.includes(item.name.toLowerCase())) {
      return item.name;
    }
  }
  if (typeof PAINT_COLOR_DICTIONARY !== 'undefined') {
    for (const item of PAINT_COLOR_DICTIONARY) {
      if (str.includes(item.name.toLowerCase())) {
        return item.name;
      }
    }
  }
  if (product.color && String(product.color).startsWith('#') && typeof hexToRgb === 'function' && typeof detectMixedColorName === 'function') {
    const rgb = hexToRgb(product.color);
    const det = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    if (det && det.name) return det.name;
  }
  return (product.color && product.color !== '-') ? product.color : 'Original Color';
}
window.getProductColorName = getProductColorName;

/* --- 3. Kubelka-Munk Spectral Paint & Pigment Mixing Engine --- */

// Invertible 3x3 spectral-overlap matrix M (maps linear RGB -> 3 broad paint reflectance bands)
// Allows Yellow + Blue -> Green, Red + Yellow -> Orange, Red + Blue -> Violet while preserving exact single-color identity.
const KM_SPEC_M = [
  [0.90, 0.08, 0.02],
  [0.06, 0.76, 0.18],
  [0.02, 0.04, 0.94]
];

// Exact inverse of KM_SPEC_M
const KM_SPEC_M_INV = [
  [1.1189873418, -0.1177215190, -0.0012658228],
  [-0.0835443038, 1.3379746835, -0.2544303797],
  [-0.0202531646, -0.0544303797, 1.0746835443]
];

function reflectanceToKS(R) {
  const r = Math.max(0.004, Math.min(0.996, R));
  return ((1 - r) * (1 - r)) / (2 * r);
}

function ksToReflectance(ks) {
  const k = Math.max(0, ks);
  return Math.max(0, Math.min(1, 1 + k - Math.sqrt(k * k + 2 * k)));
}

function subtractivePaintMix(components) {
  if (!Array.isArray(components) || !components.length) {
    return {
      r: 255, g: 255, b: 255, hex: '#FFFFFF',
      rgbLabel: 'rgb(255, 255, 255)',
      isDigitalApproximation: true,
      modelName: 'Kubelka-Munk Spectral Approximation',
      normalizedComponents: [],
      totalPct: 0
    };
  }

  // Filter valid non-negative positive percentages
  const valid = components
    .map(c => ({ ...c, cleanPct: Math.max(0, Number(c.pct) || 0) }))
    .filter(c => c.cleanPct > 0);

  if (!valid.length) {
    return {
      r: 255, g: 255, b: 255, hex: '#FFFFFF',
      rgbLabel: 'rgb(255, 255, 255)',
      isDigitalApproximation: true,
      modelName: 'Kubelka-Munk Spectral Approximation',
      normalizedComponents: [],
      totalPct: 0
    };
  }

  const totalPct = valid.reduce((sum, c) => sum + c.cleanPct, 0);
  if (totalPct <= 0) {
    return {
      r: 255, g: 255, b: 255, hex: '#FFFFFF',
      rgbLabel: 'rgb(255, 255, 255)',
      isDigitalApproximation: true,
      modelName: 'Kubelka-Munk Spectral Approximation',
      normalizedComponents: [],
      totalPct: 0
    };
  }

  const hasPhysicalData = valid.every(c => c.pigmentData && Array.isArray(c.pigmentData.ks) && c.pigmentData.ks.length === 3);
  let ksMix0 = 0, ksMix1 = 0, ksMix2 = 0;

  const normalizedComponents = valid.map(c => {
    const weight = c.cleanPct / totalPct;
    let ks0, ks1, ks2;
    if (c.pigmentData && Array.isArray(c.pigmentData.ks) && c.pigmentData.ks.length === 3) {
      [ks0, ks1, ks2] = c.pigmentData.ks.map(Number);
    } else {
      const rgb = hexToRgb(c.hex || '#FFFFFF');
      const lr = srgbChannelToLinear(rgb.r);
      const lg = srgbChannelToLinear(rgb.g);
      const lb = srgbChannelToLinear(rgb.b);
      const s0 = KM_SPEC_M[0][0] * lr + KM_SPEC_M[0][1] * lg + KM_SPEC_M[0][2] * lb;
      const s1 = KM_SPEC_M[1][0] * lr + KM_SPEC_M[1][1] * lg + KM_SPEC_M[1][2] * lb;
      const s2 = KM_SPEC_M[2][0] * lr + KM_SPEC_M[2][1] * lg + KM_SPEC_M[2][2] * lb;
      ks0 = reflectanceToKS(s0);
      ks1 = reflectanceToKS(s1);
      ks2 = reflectanceToKS(s2);
    }

    ksMix0 += ks0 * weight;
    ksMix1 += ks1 * weight;
    ksMix2 += ks2 * weight;

    return { ...c, weight };
  });

  // Invert Kubelka-Munk K/S -> Spectral reflectance -> Linear RGB
  const sm0 = ksToReflectance(ksMix0);
  const sm1 = ksToReflectance(ksMix1);
  const sm2 = ksToReflectance(ksMix2);

  const linR = KM_SPEC_M_INV[0][0] * sm0 + KM_SPEC_M_INV[0][1] * sm1 + KM_SPEC_M_INV[0][2] * sm2;
  const linG = KM_SPEC_M_INV[1][0] * sm0 + KM_SPEC_M_INV[1][1] * sm1 + KM_SPEC_M_INV[1][2] * sm2;
  const linB = KM_SPEC_M_INV[2][0] * sm0 + KM_SPEC_M_INV[2][1] * sm1 + KM_SPEC_M_INV[2][2] * sm2;

  const finalR = linearChannelToSrgb(linR);
  const finalG = linearChannelToSrgb(linG);
  const finalB = linearChannelToSrgb(linB);
  const hex = rgbToHex(finalR, finalG, finalB);

  return {
    r: finalR,
    g: finalG,
    b: finalB,
    hex,
    rgbLabel: `rgb(${finalR}, ${finalG}, ${finalB})`,
    isDigitalApproximation: !hasPhysicalData,
    modelName: hasPhysicalData ? 'Kubelka-Munk Physical Pigment Data' : 'Kubelka-Munk Spectral Approximation',
    normalizedComponents,
    totalPct
  };
}

function computeColorMixVariations(baseHex) {
  const clean = (typeof normalizeHexCode === 'function' ? normalizeHexCode(baseHex) : '') || '#FFFFFF';
  const lighter = subtractivePaintMix([
    { hex: clean, pct: 80 },
    { hex: '#FFFFFF', pct: 20 }
  ]);
  const darker = subtractivePaintMix([
    { hex: clean, pct: 85 },
    { hex: '#1B1B1B', pct: 15 }
  ]);
  return { lighter, darker };
}

function cleanPresetColorName(rawName) {
  return String(rawName || '').replace(/^[\p{Emoji}\s]+/u, '').trim() || String(rawName || '').trim();
}

function rgbToLab(r, g, b) {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  // sRGB D65 -> CIE XYZ (normalized to D65 white point)
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb) / 1.00000;
  const z = (0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116));
  const fx = f(x), fy = f(y), fz = f(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function perceptualLabDistance(rgb1, rgb2) {
  const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
  const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function getColorMatchConfidence(deltaE) {
  const d = Number(deltaE) || 0;
  const similarityPct = Math.max(0, Math.min(100, Math.round(100 - d * 1.6)));
  if (d <= 2.3) {
    return { deltaE: Math.round(d * 10) / 10, similarityPct, confidence: 'exact', matchLabel: 'Exact Match' };
  }
  if (d <= 8) {
    return { deltaE: Math.round(d * 10) / 10, similarityPct, confidence: 'high', matchLabel: 'Close Match' };
  }
  if (d <= 18) {
    return { deltaE: Math.round(d * 10) / 10, similarityPct, confidence: 'medium', matchLabel: 'Approximate Match' };
  }
  return { deltaE: Math.round(d * 10) / 10, similarityPct, confidence: 'low', matchLabel: 'Distant Match' };
}

function rgbToHsl(r, g, b) {
  const rn = Math.max(0, Math.min(1, (Number(r) || 0) / 255));
  const gn = Math.max(0, Math.min(1, (Number(g) || 0) / 255));
  const bn = Math.max(0, Math.min(1, (Number(b) || 0) / 255));
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function enforceColorTheoryNamingRules(targetRgb, detected) {
  if (!detected) return detected;
  const hsl = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);
  let name = String(detected.name || 'Custom Color');
  let family = String(detected.family || 'Custom');

  // Rule 4: Reserve "Mist", "Pale", and "Pastel" strictly for HSL Lightness >= 85%
  if (hsl.l < 85 && /\b(Mist|Pale|Pastel)\b/i.test(name)) {
    name = name.replace(/\b(Mist|Pale|Pastel)\b\s*/gi, '').trim();
    if (!name) name = 'Medium Tone';
  }

  // Rule 1: Golden/yellow-ochre tones (Hue 40-55, high saturation) must not be labeled Taupe, Greige, Latte, or Linen
  if (hsl.h >= 40 && hsl.h <= 55 && hsl.s >= 40 && /\b(Taupe|Greige|Latte|Linen)\b/i.test(name)) {
    name = hsl.l >= 70 ? 'Warm Wheat' : 'Golden Ochre';
    family = 'Yellow';
  }

  // Rule 2: Burnt orange / rust-brown colors (Hue 15-35) must not be labeled Crimson, Garnet, or Wineberry
  if (hsl.h >= 15 && hsl.h <= 35 && /\b(Crimson|Garnet|Wineberry)\b/i.test(name)) {
    name = hsl.l >= 45 ? 'Cinnamon Orange' : 'Rust Brown';
    family = hsl.l >= 45 ? 'Orange' : 'Brown';
  }

  // Rule 3: Only use "Teal" or "Emerald" when green channel is clearly higher than blue channel;
  // medium blues with higher blue values must be named Cobalt, Azure, or Ocean Blue
  if (/\b(Teal|Emerald)\b/i.test(name) && !(targetRgb.g > targetRgb.b + 4)) {
    name = targetRgb.b > targetRgb.g ? 'Ocean Blue' : 'Cobalt Blue';
    family = 'Blue';
  }

  return { ...detected, name, family };
}

function detectDictionaryColorOnly(r, g, b) {
  const target = {
    r: Math.max(0, Math.min(255, Number(r) || 0)),
    g: Math.max(0, Math.min(255, Number(g) || 0)),
    b: Math.max(0, Math.min(255, Number(b) || 0))
  };

  // Search mixed-color-only candidates (PAINT_COLOR_DICTIONARY + saved mixed formulas) using perceptual CIELAB distance
  const candidates = [];
  if (Array.isArray(PAINT_COLOR_DICTIONARY)) {
    PAINT_COLOR_DICTIONARY.forEach(item => candidates.push(item));
  }
  if (typeof COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(COLOR_RECIPE_PRESETS)) {
    COLOR_RECIPE_PRESETS.forEach(p => {
      if (!p || !p.hex) return;
      const cleanName = cleanPresetColorName(p.name);
      if (candidates.some(c => c.name.toLowerCase() === cleanName.toLowerCase())) return;
      const rgb = hexToRgb(p.hex);
      candidates.push({
        id: p.id || null,
        name: cleanName,
        hex: p.hex,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        family: p.family || 'Custom',
        classification: 'Custom Colors'
      });
    });
  }

  if (!candidates.length) {
    const conf = getColorMatchConfidence(99);
    return { id: null, name: 'Custom Color', hex: rgbToHex(target.r, target.g, target.b), r: target.r, g: target.g, b: target.b, family: 'Custom', ...conf };
  }

  let closest = candidates[0];
  let minDeltaE = Infinity;

  candidates.forEach(item => {
    const dE = perceptualLabDistance(target, { r: item.r, g: item.g, b: item.b });
    if (dE < minDeltaE) {
      minDeltaE = dE;
      closest = item;
    }
  });

  const conf = getColorMatchConfidence(minDeltaE);
  return enforceColorTheoryNamingRules(target, {
    ...closest,
    ...conf
  });
}

function doesComponentsMatchPreset(preset, components) {
  if (!preset || !Array.isArray(preset.recipe) || !Array.isArray(components)) return false;
  if (preset.recipe.length !== components.length || preset.recipe.length === 0) return false;
  return preset.recipe.every((item, idx) => {
    const comp = components[idx];
    if (!comp) return false;
    const samePct = Math.abs((Number(item.pct) || 0) - (Number(comp.pct) || 0)) < 0.1;
    if (!samePct) return false;
    if (item.productId && comp.productId && String(comp.productId) === String(item.productId)) {
      return true;
    }
    if (item.colorId && comp.colorId && String(item.colorId) === String(comp.colorId)) {
      return true;
    }
    const hint = String(item.colorHint || item.name || '').replace(/paint/i, '').trim().toLowerCase();
    if (!hint) return true;
    const prod = (comp.productId && typeof productById === 'function') ? productById(comp.productId) : null;
    const cStr = `${comp.color || ''} ${comp.colorName || ''} ${comp.name || ''} ${prod ? ((prod.color || '') + ' ' + (prod.name || '')) : ''}`.toLowerCase();
    if (cStr.includes(hint)) return true;
    if (comp.hex) {
      const rgb = hexToRgb(comp.hex);
      const baseDet = detectDictionaryColorOnly(rgb.r, rgb.g, rgb.b);
      if (baseDet && ((baseDet.family && baseDet.family.toLowerCase() === hint) || (baseDet.name && baseDet.name.toLowerCase().includes(hint)))) {
        return true;
      }
    }
    return false;
  });
}

function detectMixedColorName(r, g, b) {
  const closest = detectDictionaryColorOnly(r, g, b);
  const lib = getMasterColorLibrary();

  // Ensure active or matching preset recipe always resolves to the exact preset name
  if (typeof colorMixStudioState !== 'undefined' && colorMixStudioState && Array.isArray(colorMixStudioState.components) && colorMixStudioState.components.length >= 2 && typeof COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(COLOR_RECIPE_PRESETS)) {
    const studioMix = subtractivePaintMix(colorMixStudioState.components);
    if (Math.abs(studioMix.r - r) <= 2 && Math.abs(studioMix.g - g) <= 2 && Math.abs(studioMix.b - b) <= 2) {
      const selIdx = Number(colorMixStudioState.selectedPresetIndex);
      if (!isNaN(selIdx) && selIdx >= 0 && COLOR_RECIPE_PRESETS[selIdx]) {
        const selPreset = COLOR_RECIPE_PRESETS[selIdx];
        if (doesComponentsMatchPreset(selPreset, colorMixStudioState.components)) {
          const cleanName = cleanPresetColorName(selPreset.name);
          const dictEntry = PAINT_COLOR_DICTIONARY.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
          const libEntry = lib.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
          const presetConf = getColorMatchConfidence(0);
          return {
            colorId: selPreset.colorId || (libEntry && libEntry.id) || null,
            name: cleanName,
            hex: studioMix.hex,
            r,
            g,
            b,
            family: (libEntry && (libEntry.colorFamily || libEntry.category)) || (dictEntry && dictEntry.family) || (closest && closest.family) || 'Custom',
            classification: (libEntry && libEntry.classification) || (closest && closest.classification) || 'Custom Colors',
            ...presetConf
          };
        } else {
          // User changed percentages or ingredients away from the selected preset
          colorMixStudioState.selectedPresetIndex = -1;
        }
      }
      const matchedPreset = COLOR_RECIPE_PRESETS.find(p => doesComponentsMatchPreset(p, colorMixStudioState.components));
      if (matchedPreset) {
        const cleanName = cleanPresetColorName(matchedPreset.name);
        const dictEntry = PAINT_COLOR_DICTIONARY.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
        const libEntry = lib.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
        const presetConf = getColorMatchConfidence(0);
        return {
          colorId: matchedPreset.colorId || (libEntry && libEntry.id) || null,
          name: cleanName,
          hex: studioMix.hex,
          r,
          g,
          b,
          family: (libEntry && (libEntry.colorFamily || libEntry.category)) || (dictEntry && dictEntry.family) || (closest && closest.family) || 'Custom',
          classification: (libEntry && libEntry.classification) || (closest && closest.classification) || 'Custom Colors',
          ...presetConf
        };
      }
    }
  }

  return closest;
}

/* ============================================================
   COLOR MIXING STUDIO STATE & UI
   ============================================================ */
let colorMixStudioState = {
  components: [],
  totalLiters: 1,
  colorName: '',
  baseType: 'Automotive Paint',
  pricePerLiter: 400,
  userCustomizedName: false,
  userCustomizedPrice: false,
  note: '',
  typeFilter: 'all',
  openPickerIdx: -1,
  pickerSearch: '',
  inlineSearchIdx: -1,
  inlineSearchQuery: '',
  openCategories: {},
  presetSearch: '',
  recipeCategoryFilter: 'All',
  selectedPresetIndex: -1
};

function colorMixAvailableProducts(filterByType = true) {
  const all = activeProducts().filter(p => productMixAvailableStock(p) > 0);
  if (filterByType && colorMixStudioState && colorMixStudioState.typeFilter && colorMixStudioState.typeFilter !== 'all') {
    const filtered = all.filter(p => (p.type || '').toLowerCase() === colorMixStudioState.typeFilter.toLowerCase());
    if (filtered.length > 0) return filtered;
  }
  return all;
}

function colorMixModalProducts() {
  const all = activeProducts().filter(p => p && productMixAvailableStock(p) > 0);
  if (colorMixStudioState && colorMixStudioState.typeFilter && colorMixStudioState.typeFilter !== 'all') {
    const filtered = all.filter(p => (p.type || '').toLowerCase() === colorMixStudioState.typeFilter.toLowerCase());
    if (filtered.length > 0) return filtered;
  }
  return all;
}

function getInventoryBasePaintTypes() {
  const prods = (typeof activeProducts === 'function')
    ? activeProducts()
    : ((typeof db !== 'undefined' && db && Array.isArray(db.products)) ? db.products.filter(p => p && p.status === 'active') : []);
  return Array.from(new Set(
    prods
      .map(p => (p && p.type ? String(p.type).trim() : ''))
      .filter(t => t && t !== '-' && t.toLowerCase() !== 'accessory')
  ));
}

function getColorMixSelectedProductSlotMap() {
  const map = new Map();
  if (!colorMixStudioState || !Array.isArray(colorMixStudioState.components)) return map;
  colorMixStudioState.components.forEach((c, i) => {
    if (c && c.productId) {
      map.set(String(c.productId), i + 1);
    }
  });
  return map;
}

function getColorMixDuplicateSlots() {
  const countMap = new Map();
  const duplicateSlots = new Set();
  if (!colorMixStudioState || !Array.isArray(colorMixStudioState.components)) return duplicateSlots;

  colorMixStudioState.components.forEach((c, idx) => {
    if (!c || !c.productId) return;
    const pid = String(c.productId);
    if (!countMap.has(pid)) {
      countMap.set(pid, [idx + 1]);
    } else {
      countMap.get(pid).push(idx + 1);
    }
  });

  countMap.forEach((slots) => {
    if (slots.length > 1) {
      slots.forEach(slot => duplicateSlots.add(slot));
    }
  });

  return duplicateSlots;
}

function initColorMixStudioState() {
  const prods = colorMixAvailableProducts(false);
  const prod1 = prods[0] || null;
  const prod2 = (prod1 ? prods.find(p => p.id !== prod1.id) : prods[1]) || null;

  colorMixStudioState = {
    components: [
      {
        id: uid('cmc'),
        productId: prod1 ? prod1.id : '',
        colorId: prod1 ? (prod1.colorId || prod1.color_id || null) : null,
        name: prod1 ? prod1.name : 'Component A',
        brand: prod1 ? prod1.brand : '',
        colorName: prod1 ? getProductColorName(prod1) : 'White',
        color: prod1 ? getProductColorName(prod1) : 'White',
        stock: prod1 ? prod1.stock : 0,
        price: prod1 ? prod1.price : 350,
        hex: prod1 ? getProductDefaultColor(prod1) : '#FFFFFF',
        pct: 60,
        preferredCanSize: 0
      },
      {
        id: uid('cmc'),
        productId: prod2 ? prod2.id : '',
        colorId: prod2 ? (prod2.colorId || prod2.color_id || null) : null,
        name: prod2 ? prod2.name : (prod1 ? 'Select Component B' : 'Component B'),
        brand: prod2 ? prod2.brand : '',
        colorName: prod2 ? getProductColorName(prod2) : 'Blue',
        color: prod2 ? getProductColorName(prod2) : 'Blue',
        stock: prod2 ? prod2.stock : 0,
        price: prod2 ? prod2.price : 450,
        hex: prod2 ? getProductDefaultColor(prod2) : '#1E88E5',
        pct: 40,
        preferredCanSize: 0
      }
    ],
    totalLiters: 1,
    colorName: '',
    baseType: prod1 ? prod1.type : 'Automotive Paint',
    pricePerLiter: 400,
    userCustomizedName: false,
    userCustomizedPrice: false,
    note: '',
    selectedSheen: '',
    typeFilter: 'all',
    openPickerIdx: -1,
    pickerSearch: '',
    inlineSearchIdx: -1,
    inlineSearchQuery: '',
    openCategories: {},
    presetSearch: '',
    recipeCategoryFilter: 'All',
    selectedPresetIndex: -1,
    originalPresetIndex: -1,
    originalCatalogName: '',
    isCustomizingFormula: false,
    isCustomizedFormula: false,
    customizeSnapshot: null,
    selectedLibraryColorId: null,
    selectedLibraryColorName: '',
    selectedLibraryColorHex: '',
    selectedLibraryColorCategory: ''
  };

  if (typeof syncActiveColorRecipePresets === 'function') syncActiveColorRecipePresets();
  if (typeof COLOR_RECIPE_PRESETS !== 'undefined' && Array.isArray(COLOR_RECIPE_PRESETS) && COLOR_RECIPE_PRESETS.length > 0) {
    let pickIdx = COLOR_RECIPE_PRESETS.findIndex(p => evaluateRecipePresetAvailability(p, 1).available);
    if (pickIdx < 0) pickIdx = 0;
    const p = COLOR_RECIPE_PRESETS[pickIdx];
    const check = evaluateRecipePresetAvailability(p, 1);
    if (check && Array.isArray(check.resolvedItems) && check.resolvedItems.length >= 2) {
      colorMixStudioState.components = check.resolvedItems.map(({ item, product }, idx) => ({
        id: uid('cmc'),
        productId: product ? product.id : (item.productId || ''),
        colorId: item.colorId || (product ? (product.colorId || product.color_id || null) : null),
        name: product ? product.name : (item.name || `Ingredient ${idx + 1}`),
        brand: product ? (product.brand || '') : '',
        colorName: product ? getProductColorName(product) : (item.name || ''),
        color: product ? getProductColorName(product) : (item.name || ''),
        stock: product ? product.stock : 0,
        price: product ? product.price : 400,
        hex: product ? getProductDefaultColor(product) : (item.hex || '#FFFFFF'),
        pct: Number(item.pct) || 0,
        preferredCanSize: 0,
        isOriginal: true
      }));
      colorMixStudioState.selectedPresetIndex = pickIdx;
      colorMixStudioState.originalPresetIndex = pickIdx;
      colorMixStudioState.originalCatalogName = cleanPresetColorName(p.name);
      colorMixStudioState.colorName = cleanPresetColorName(p.name);
      const firstType = check.resolvedItems[0] && check.resolvedItems[0].product && check.resolvedItems[0].product.type;
      if (firstType) colorMixStudioState.baseType = firstType;
    }
  }

  updateColorMixCalculation(true);
}

function isBasePaintComponent(c, idx, components = []) {
  if (!c) return false;
  const name = `${c.name || ''} ${c.colorName || ''} ${c.color || ''} ${c.brand || ''}`.toLowerCase();
  const isPigmentKeyword = /pigment|colorant|tinter|tinting|dye/i.test(name);
  const isBaseKeyword = /base\s*paint|\bbase\b/i.test(name);
  if (isPigmentKeyword) return false;
  if (isBaseKeyword) return true;
  // If no explicit base keyword, slot 0 is the primary base paint slot
  return idx === 0;
}

function syncColorMixingWithLibrary(reason = 'update') {
  syncActiveColorRecipePresets();

  if (colorMixStudioState && Array.isArray(colorMixStudioState.components)) {
    colorMixStudioState.components.forEach(c => {
      const prod = (c.productId && typeof productById === 'function') ? productById(c.productId) : null;
      const cid = (prod && (prod.colorId || prod.color_id)) || c.colorId || null;
      if (cid && typeof findColorLibraryEntry === 'function') {
        const entry = findColorLibraryEntry(cid);
        if (entry) {
          c.colorId = entry.id;
          c.hex = entry.hex;
          c.colorName = entry.name;
          c.color = entry.name;
        }
      } else if (prod) {
        c.hex = getProductDefaultColor(prod);
        c.colorName = getProductColorName(prod);
        c.color = c.colorName;
      }
    });

    if (colorMixStudioState.selectedLibraryColorId && typeof findColorLibraryEntry === 'function') {
      const selEntry = findColorLibraryEntry(colorMixStudioState.selectedLibraryColorId);
      if (selEntry) {
        colorMixStudioState.selectedLibraryColorName = selEntry.name;
        colorMixStudioState.selectedLibraryColorHex = selEntry.hex;
        colorMixStudioState.selectedLibraryColorCategory = selEntry.category || '';
      } else {
        colorMixStudioState.selectedLibraryColorId = null;
      }
    }
  }

  const studioRoot = document.getElementById('colormix-studio-root');
  if (studioRoot) {
    renderColorMixStudio();
  }
}
if (typeof window !== 'undefined') {
  window.syncColorMixingWithLibrary = syncColorMixingWithLibrary;
}

function calculateColorMixPriceBreakdown(s = colorMixStudioState) {
  const state = s || {};
  const totalLiters = Number(state.totalLiters) || 1;
  const components = Array.isArray(state.components) ? state.components : [];

  let basePaint = null;
  let basePaintCost = 0;
  let basePaintLiters = 0;
  let basePaintMl = 0;
  let basePct = 0;

  const ingredients = [];
  let totalColorantCost = 0;
  let totalColorantLiters = 0;
  let totalColorantMl = 0;
  let totalColorantPct = 0;
  let pigmentIncluded = false;

  components.forEach((c, idx) => {
    const pct = Number(c.pct) || 0;
    const price = Number(c.price) || 0;
    const liters = Number((totalLiters * (pct / 100)).toFixed(4));
    const ml = Math.round(liters * 1000);
    const cost = Number((liters * price).toFixed(2));

    const p = c.productId ? (typeof productById === 'function' ? productById(c.productId) : null) : null;
    const prodName = c.name || (p ? p.name : `Component ${String.fromCharCode(65 + idx)}`);
    const brand = c.brand || (p ? p.brand : '');
    const colorName = c.colorName || c.color || (p && typeof getProductColorName === 'function' ? getProductColorName(p) : 'Color');
    const hex = c.hex || (p && typeof getProductDefaultColor === 'function' ? getProductDefaultColor(p) : '#FFFFFF');
    const type = p ? (p.type || p.category || state.baseType || 'Base Paint') : (state.baseType || 'Base Paint');

    const isBase = isBasePaintComponent(c, idx, components);

    if (isBase && !basePaint) {
      basePaintCost = cost;
      basePaintLiters = liters;
      basePaintMl = ml;
      basePct = pct;
      basePaint = {
        productId: c.productId,
        name: prodName,
        brand,
        type,
        colorName,
        hex,
        liters,
        ml,
        pct,
        unitPrice: price,
        cost
      };
    } else {
      if (price === 0 || c.isIncluded) {
        pigmentIncluded = true;
      }
      totalColorantCost += cost;
      totalColorantLiters += liters;
      totalColorantMl += ml;
      totalColorantPct += pct;

      ingredients.push({
        id: c.id,
        productId: c.productId,
        name: prodName,
        brand,
        type,
        colorName,
        hex,
        liters,
        ml,
        pct,
        unitPrice: price,
        cost,
        isIncluded: (price === 0 || Boolean(c.isIncluded))
      });
    }
  });

  basePaintCost = Number(basePaintCost.toFixed(2));
  basePaintLiters = Number(basePaintLiters.toFixed(2));
  basePct = Math.round(basePct * 10) / 10;

  totalColorantCost = Number(totalColorantCost.toFixed(2));
  totalColorantLiters = Number(totalColorantLiters.toFixed(2));
  totalColorantPct = Math.round(totalColorantPct * 10) / 10;

  const serviceFee = 50.00;
  const materialCost = Number((basePaintCost + totalColorantCost).toFixed(2));
  const standardTotal = Number((materialCost + serviceFee).toFixed(2));

  let otherCharges = 0.00;
  let grandTotal = standardTotal;

  if (state.userCustomizedPrice && state.pricePerLiter != null) {
    const customTargetTotal = Number((totalLiters * Number(state.pricePerLiter)).toFixed(2));
    const diff = Number((customTargetTotal - standardTotal).toFixed(2));
    otherCharges = diff;
    grandTotal = customTargetTotal;
  }

  // Ensure mathematical balance: sum of breakdown items strictly matches grandTotal
  grandTotal = Number((materialCost + serviceFee + otherCharges).toFixed(2));

  return {
    basePaint,
    basePaintCost,
    basePaintLiters,
    basePaintMl,
    basePct,
    ingredients,
    totalColorantCost,
    pigmentCost: totalColorantCost, // backwards-compatible alias
    totalColorantLiters,
    pigmentLiters: totalColorantLiters, // backwards-compatible alias
    totalColorantMl,
    pigmentMl: totalColorantMl,
    totalColorantPct,
    pigmentPct: totalColorantPct, // backwards-compatible alias
    pigmentIncluded,
    materialCost,
    serviceFee,
    otherCharges,
    grandTotal,
    totalLiters
  };
}

/**
 * Render detailed ingredient-level price breakdown HTML.
 * Separates Base Paint, Individual Colorants/Ingredients, and Additional Charges.
 */
function renderColorMixPriceBreakdownHtml(s, breakdown, wasOpen = true) {
  const isPctBalanced = Math.abs((s.components || []).reduce((sum, c) => sum + (Number(c.pct) || 0), 0) - 100) <= 0.5;
  const validComponents = (s.components || []).filter(c => c.productId && Number(c.pct) > 0);
  const hasMinTwoIngredients = validComponents.length >= 2;
  const seenIds = new Set();
  const hasDuplicateProducts = validComponents.some(c => {
    const pid = String(c.productId);
    if (seenIds.has(pid)) return true;
    seenIds.add(pid);
    return false;
  });
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients && !hasDuplicateProducts;
  const grandTotal = breakdown.grandTotal;

  return `
    <!-- Card Header: Title, Volume & Ready Badge -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--line);">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--teal-dark);">💰 Price Breakdown</span>
        <span id="cm-grand-volume-label" class="muted" style="font-size:11px; font-weight:600;">(${s.totalLiters} Liter${s.totalLiters === 1 ? '' : 's'})</span>
      </div>
      <span id="cm-ready-badge" class="badge ${isReadyToDispense ? 'ok' : (hasDuplicateProducts ? 'low' : 'mid')}" style="font-size:10.5px; padding:2px 8px; font-weight:700;">
        ${hasDuplicateProducts ? '⚠️ Duplicate Products Selected' : (!hasMinTwoIngredients ? '⚠️ Need At Least 2 Ingredients' : (isPctBalanced ? '✓ Ready to Dispense' : '⚠️ Adjust to 100%'))}
      </span>
    </div>

    <!-- 1. BASE PAINT DETAILS SECTION -->
    <div class="cm-breakdown-section" style="margin-bottom:8px; padding-bottom:7px; border-bottom:1px dashed var(--line);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <div style="display:flex; align-items:center; gap:5px;">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--teal); flex-shrink:0;"></span>
          <span style="font-weight:700; font-size:11px; color:var(--teal-dark); text-transform:uppercase; letter-spacing:0.04em;">Base Paint</span>
          ${breakdown.basePaint ? `
            <span class="badge" style="background:var(--teal-tint); color:var(--teal-dark); border:1px solid var(--teal-tint-border); font-size:9.5px; padding:1px 5px; font-weight:600;">
              ${escapeHtml(breakdown.basePaint.type || s.baseType || 'Base Paint')}
            </span>
          ` : ''}
        </div>
        <strong id="cm-breakdown-base-cost" class="cm-breakdown-value" style="font-family:'Space Grotesk',monospace; font-size:12.5px; font-weight:700; color:var(--ink);">
          ${peso(breakdown.basePaintCost)}
        </strong>
      </div>
      ${breakdown.basePaint ? `
        <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); line-height:1.35;">
          <div style="font-weight:600; color:var(--ink);">
            ${escapeHtml(breakdown.basePaint.name)}
            ${breakdown.basePaint.brand ? `<span class="muted" style="font-weight:400;">(${escapeHtml(breakdown.basePaint.brand)})</span>` : ''}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; margin-top:2px;">
            <span class="muted">
              Base Color: <b>${escapeHtml(breakdown.basePaint.colorName)}</b>
              ${breakdown.basePaint.hex ? `<span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${breakdown.basePaint.hex}; border:1px solid rgba(0,0,0,0.15); vertical-align:middle; margin-left:3px;"></span>` : ''}
              · Rate: ${peso(breakdown.basePaint.unitPrice)}/L
            </span>
            <span id="cm-breakdown-base-qty" style="font-weight:700; font-family:'Space Grotesk',monospace; color:var(--ink);">
              ${formatStock(breakdown.basePaint.liters)} L (${breakdown.basePaint.ml} mL) · ${breakdown.basePaint.pct}%
            </span>
          </div>
        </div>
      ` : `
        <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); font-style:italic;">No base paint component in formula.</div>
      `}
    </div>

    <!-- 2. INDIVIDUAL COLORANTS / INGREDIENTS SECTION -->
    <div class="cm-breakdown-section" style="margin-bottom:8px; padding-bottom:7px; border-bottom:1px dashed var(--line);">
      <details ${wasOpen ? 'open' : ''} id="cm-ingredients-details" class="cm-ingredients-details">
        <summary style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#8E24AA; flex-shrink:0;"></span>
            <span style="font-weight:700; font-size:11px; color:var(--purple-text); text-transform:uppercase; letter-spacing:0.04em;">Colorants / Ingredients</span>
            <span class="badge" style="background:var(--purple-bg); color:var(--purple-text); border:1px solid var(--purple-border); font-size:9.5px; padding:1px 5px; font-weight:600;">
              ${breakdown.ingredients.length} item${breakdown.ingredients.length === 1 ? '' : 's'}
            </span>
            <span class="muted" style="font-size:9.5px; opacity:0.75;">▾</span>
          </div>
          <strong id="cm-breakdown-pigment-cost" class="cm-breakdown-value" style="font-family:'Space Grotesk',monospace; font-size:12.5px; font-weight:700; color:var(--ink);">
            ${peso(breakdown.totalColorantCost)}
          </strong>
        </summary>

        ${breakdown.ingredients.length > 0 ? `
          <div id="cm-price-ingredients-list" style="padding-left:12px; display:flex; flex-direction:column; gap:4px; margin-top:5px;">
            ${breakdown.ingredients.map(ing => `
              <div class="cm-ingredient-item" style="background:var(--surface-2); border:1px solid var(--line); border-radius:5px; padding:4px 7px; font-size:10.5px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                  <div style="display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden;">
                    <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${ing.hex || '#8E24AA'}; border:1px solid rgba(0,0,0,0.15); flex-shrink:0;"></span>
                    <span style="font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(ing.name)}</span>
                    ${ing.brand ? `<span class="muted" style="font-size:9.5px;">(${escapeHtml(ing.brand)})</span>` : ''}
                  </div>
                  <strong style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink); flex-shrink:0;">
                    ${peso(ing.cost)}
                  </strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; color:var(--ink-soft); font-size:10px; margin-top:1.5px;">
                  <span>Type: <b>${escapeHtml(ing.colorName || 'Pigment')}</b> · Rate: ${peso(ing.unitPrice)}/L</span>
                  <span style="font-family:'Space Grotesk',monospace; font-weight:600; color:var(--ink);">
                    ${formatStock(ing.liters)} L (${ing.ml} mL) · ${ing.pct}%
                  </span>
                </div>
              </div>
            `).join('')}

            <!-- Total Colorant Quantity & Cost Summary -->
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--purple-text); font-weight:600; padding:2px 6px; background:var(--purple-bg); border-radius:4px; margin-top:2px;">
              <span>Total Colorants: <b id="cm-breakdown-pigment-qty">${formatStock(breakdown.totalColorantLiters)} L (${breakdown.totalColorantMl} mL) · ${breakdown.totalColorantPct}%</b></span>
              <span>Total Cost: <b>${peso(breakdown.totalColorantCost)}</b></span>
            </div>
          </div>
        ` : `
          <div style="padding-left:12px; font-size:10.5px; color:var(--ink-soft); font-style:italic; margin-top:4px;">No additional colorants used in this formula.</div>
        `}
      </details>
    </div>

    <!-- 3. MATERIAL TOTAL & ADDITIONAL CHARGES -->
    <div class="cm-breakdown-section" style="margin-bottom:6px; font-size:11px;">
      <div class="cm-breakdown-line" style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
        <span class="cm-breakdown-label" style="display:flex; align-items:center; gap:5px; color:var(--ink);">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2E7D32;"></span>
          <span style="font-weight:600;">Total Material Cost:</span>
          <span class="muted" style="font-size:9.5px;">(Base + Colorants)</span>
        </span>
        <strong id="cm-breakdown-material-cost" style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(breakdown.materialCost)}</strong>
      </div>

      <div class="cm-breakdown-line" style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
        <span class="cm-breakdown-label" style="display:flex; align-items:center; gap:5px; color:var(--ink);">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#E65100;"></span>
          <span>Mixing Service Fee:</span>
          <span class="muted" style="font-size:9.5px;">(Standard Fee)</span>
        </span>
        <strong id="cm-breakdown-service-fee" class="cm-breakdown-value" style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(breakdown.serviceFee)}</strong>
      </div>

      <div id="cm-breakdown-other-row" class="cm-breakdown-line" style="display:flex; justify-content:space-between; align-items:center; padding:1.5px 0;">
        <span class="cm-breakdown-label" style="display:flex; align-items:center; gap:5px; color:var(--ink);">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#78909C;"></span>
          <span>Other Charges:</span>
          <span id="cm-breakdown-other-hint" class="muted" style="font-size:9.5px;">
            ${breakdown.otherCharges > 0 ? '(Custom Adjustment)' : (breakdown.otherCharges < 0 ? '(Custom Discount)' : '')}
          </span>
        </span>
        <strong id="cm-breakdown-other-charges" class="cm-breakdown-value" style="font-family:'Space Grotesk',monospace; font-weight:700; color:var(--ink);">${peso(breakdown.otherCharges)}</strong>
      </div>
    </div>

    <!-- 4. GRAND TOTAL -->
    <div style="border-top:1.5px dashed var(--line); padding-top:6px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:11.5px; font-weight:800; color:var(--teal-dark); text-transform:uppercase; letter-spacing:0.04em;">Grand Total</div>
        <div id="cm-breakdown-mat-service-hint" class="muted small" style="font-size:9.5px;">
          Materials: ${peso(breakdown.materialCost)} + Service: ${peso(breakdown.serviceFee)}${breakdown.otherCharges !== 0 ? ` + Other: ${peso(breakdown.otherCharges)}` : ''}
        </div>
      </div>
      <div id="cm-grand-total" style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:800; color:var(--teal-text); letter-spacing:-0.02em;">
        ${peso(grandTotal)}
      </div>
    </div>
  `;
}

function onColorMixPriceLive(val) {
  const num = Number(val);
  if (!isNaN(num) && num >= 0) {
    colorMixStudioState.pricePerLiter = num;
    colorMixStudioState.userCustomizedPrice = true;
    syncColorMixVisuals();
  }
}

function onColorMixPriceChange(val) {
  const num = Number(Number(val).toFixed(2)) || 0;
  colorMixStudioState.pricePerLiter = num;
  colorMixStudioState.userCustomizedPrice = true;
  const input = document.getElementById('cm-price');
  if (input) input.value = num;
  syncColorMixVisuals();
}

function resetColorMixPriceToAuto() {
  colorMixStudioState.userCustomizedPrice = false;
  updateColorMixCalculation(false);
  const priceInput = document.getElementById('cm-price');
  if (priceInput) priceInput.value = colorMixStudioState.pricePerLiter;
  syncColorMixVisuals();
  showToast('Reset mixing price to auto-calculated rate.', 'info');
}

function updateColorMixCalculation(autoUpdateName = false) {
  const mixed = subtractivePaintMix(colorMixStudioState.components);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);

  if (!colorMixStudioState.userCustomizedName || autoUpdateName || !colorMixStudioState.colorName) {
    colorMixStudioState.colorName = detected.name;
  }

  // Calculate price breakdown & grand total
  const breakdown = calculateColorMixPriceBreakdown(colorMixStudioState);
  const totalLiters = Number(colorMixStudioState.totalLiters) || 1;

  if (!colorMixStudioState.userCustomizedPrice) {
    colorMixStudioState.pricePerLiter = Number((breakdown.grandTotal / totalLiters).toFixed(2));
  }
}

function openColorMixModal(isPos = true) {
  initColorMixStudioState();
  colorMixStudioState.isPosMode = (isPos !== false);
  const totalLiters = colorMixStudioState.totalLiters || 1;
  const breakdown = calculateColorMixPriceBreakdown(colorMixStudioState);
  const grandTotal = breakdown.grandTotal;
  logAudit(
    'MIXING_START',
    'Paint Color Mixing Studio',
    `Started Color Mixing session in ${isPos ? 'POS Checkout Mode' : 'Direct Inventory Mode'} (Default: ${totalLiters}L ${colorMixStudioState.baseType || 'Automotive Paint'})`,
    {
      entityName: 'Paint Color Mixing Studio',
      fieldChanged: 'Mixing Studio Session',
      oldValue: 'Idle',
      newValue: `Started (${isPos ? 'POS Mode' : 'Inventory Mode'}, ${totalLiters}L)`,
      reason: isPos ? 'Customer custom paint mix order' : 'Direct inventory color mix batch'
    }
  );
  openModal(
    '🎨 Paint Color Mixing Studio',
    `<div id="colormix-studio-root">${colorMixStudioHtml()}</div>`,
    `
  <button class="btn secondary" onclick="cancelColorMixModal()">Cancel</button>
  <button id="cm-submit-btn" class="btn" style="background:linear-gradient(135deg, #1F6F6B 0%, #2A8C87 100%); font-weight:700;" onclick="submitColorMix()">
    ${isPos ? `+ Add ${totalLiters}L Mixed Color (${peso(grandTotal)}) to Sale` : `✓ Confirm & Log ${totalLiters}L Movement (${peso(grandTotal)})`}
  </button>
`,
    'xl'
  );
  if (typeof syncColorMixVisuals === 'function') syncColorMixVisuals(-1, true);
}

function cancelColorMixModal() {
  const s = colorMixStudioState || {};
  const colorName = (document.getElementById('cm-color-name') ? document.getElementById('cm-color-name').value.trim() : s.colorName) || 'Unsaved Custom Mix';
  const liters = Number(s.totalLiters) || 1;
  logAudit(
    'MIXING_CANCEL',
    colorName,
    `Cancelled Color Mixing session for "${colorName}" (${liters}L ${s.baseType || 'Automotive Paint'})`,
    {
      entityName: colorName,
      fieldChanged: 'Mixing Studio Session',
      oldValue: `In Progress (${liters}L ${colorName})`,
      newValue: 'Cancelled',
      reason: 'User cancelled Color Mixing Studio modal'
    }
  );
  closeModal();
}

function renderColorMixStudio() {
  const root = document.getElementById('colormix-studio-root');
  if (root) {
    root.innerHTML = colorMixStudioHtml();
  }
  const btn = document.getElementById('cm-submit-btn');
  if (btn) {
    const s = colorMixStudioState;
    const totalLiters = s.totalLiters || 1;
    const breakdown = calculateColorMixPriceBreakdown(s);
    const grandTotal = breakdown.grandTotal;
    const isPos = s.isPosMode !== false;
    btn.innerHTML = isPos
      ? `+ Add ${totalLiters}L Mixed Color (${peso(grandTotal)}) to Sale`
      : `✓ Confirm & Log ${totalLiters}L Movement (${peso(grandTotal)})`;
  }
  if (typeof syncColorMixVisuals === 'function') syncColorMixVisuals(-1, true);
}


const CUSTOM_COLOR_PRESETS_KEY = 'mrgr_custom_color_presets';

const DEFAULT_COLOR_RECIPE_PRESETS = [
  { name: 'Cream', desc: 'Cream (99% White Paint + 1% Yellow Paint)', hex: '#FFFFD4', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 1 }] },
  { name: 'Warm Vanilla', desc: 'Warm Vanilla (98% White Paint + 2% Orange Paint)', hex: '#FFEFAE', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 98 }, { name: 'Orange Paint', colorHint: 'orange', pct: 2 }] },
  { name: 'Soft Eggshell', desc: 'Soft Eggshell (99% White Paint + 1% Brown Paint)', hex: '#F2DBCE', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Brown Paint', colorHint: 'brown', pct: 1 }] },
  { name: 'Golden Sand', desc: 'Golden Sand (98% White Paint + 2% Brown Paint)', hex: '#EDCEBD', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 98 }, { name: 'Brown Paint', colorHint: 'brown', pct: 2 }] },
  { name: 'Warm Champagne', desc: 'Warm Champagne (97% White Paint + 3% Brown Paint)', hex: '#E9C4B1', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Brown Paint', colorHint: 'brown', pct: 3 }] },
  { name: 'Honey Wheat', desc: 'Honey Wheat (96% White Paint + 4% Brown Paint)', hex: '#E6BCA8', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 96 }, { name: 'Brown Paint', colorHint: 'brown', pct: 4 }] },
  { name: '🌸 Medium Rose', desc: 'Medium Rose (88% White Paint + 8% Purple Paint + 4% Red Paint)', hex: '#D28888', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 88 }, { name: 'Purple Paint', colorHint: 'purple', pct: 8 }, { name: 'Red Paint', colorHint: 'red', pct: 4 }] },
  { name: 'Terracotta Rose', desc: 'Terracotta Rose (78% White Paint + 14% Purple Paint + 8% Red Paint)', hex: '#C5706E', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 78 }, { name: 'Purple Paint', colorHint: 'purple', pct: 14 }, { name: 'Red Paint', colorHint: 'red', pct: 8 }] },
  { name: 'Soft Blush Rose', desc: 'Soft Blush Rose (88% White Paint + 8% Purple Paint + 4% Orange Paint)', hex: '#D19395', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 88 }, { name: 'Purple Paint', colorHint: 'purple', pct: 8 }, { name: 'Orange Paint', colorHint: 'orange', pct: 4 }] },
  { name: 'Muted Berry Rose', desc: 'Muted Berry Rose (82% White Paint + 12% Purple Paint + 6% Orange Paint)', hex: '#C88386', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 82 }, { name: 'Purple Paint', colorHint: 'purple', pct: 12 }, { name: 'Orange Paint', colorHint: 'orange', pct: 6 }] },
  { name: 'Dusty Rose', desc: 'Dusty Rose (84% White Paint + 11% Purple Paint + 5% Orange Paint)', hex: '#CA868C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 84 }, { name: 'Purple Paint', colorHint: 'purple', pct: 11 }, { name: 'Orange Paint', colorHint: 'orange', pct: 5 }] },
  { name: 'Pale Orchid', desc: 'Pale Orchid (99% White Paint + 1% Purple Paint)', hex: '#EECCED', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Purple Paint', colorHint: 'purple', pct: 1 }] },
  { name: 'Berry Blush', desc: 'Berry Blush (75% White Paint + 20% Purple Paint + 5% Orange Paint)', hex: '#BA6A89', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 75 }, { name: 'Purple Paint', colorHint: 'purple', pct: 20 }, { name: 'Orange Paint', colorHint: 'orange', pct: 5 }] },
  { name: 'Rosewood Tint', desc: 'Rosewood Tint (69% White Paint + 21% Purple Paint + 10% Orange Paint)', hex: '#B86D72', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 69 }, { name: 'Purple Paint', colorHint: 'purple', pct: 21 }, { name: 'Orange Paint', colorHint: 'orange', pct: 10 }] },
  { name: 'Light Orchid', desc: 'Light Orchid (98% White Paint + 2% Purple Paint)', hex: '#E7B9E6', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 98 }, { name: 'Purple Paint', colorHint: 'purple', pct: 2 }] },
  { name: '🌅 Sunset Coral', desc: 'Sunset Coral (45% White Paint + 35% Orange Paint + 20% Red Paint)', hex: '#FF6A24', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 45 }, { name: 'Orange Paint', colorHint: 'orange', pct: 35 }, { name: 'Red Paint', colorHint: 'red', pct: 20 }] },
  { name: 'Warm Buttercream', desc: 'Warm Buttercream (97% White Paint + 3% Orange Paint)', hex: '#FFEAA0', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Orange Paint', colorHint: 'orange', pct: 3 }] },
  { name: 'Pale Vanilla Cream', desc: 'Pale Vanilla Cream (99% White Paint + 1% Orange Paint)', hex: '#FFF4C3', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Orange Paint', colorHint: 'orange', pct: 1 }] },
  { name: 'Coral Blush', desc: 'Coral Blush (93% White Paint + 7% Red Paint)', hex: '#FFA472', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 93 }, { name: 'Red Paint', colorHint: 'red', pct: 7 }] },
  { name: 'Terracotta Clay', desc: 'Terracotta Clay (63% White Paint + 19% Brown Paint + 18% Red Paint)', hex: '#CC6542', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 63 }, { name: 'Brown Paint', colorHint: 'brown', pct: 19 }, { name: 'Red Paint', colorHint: 'red', pct: 18 }] },
  { name: 'Burnt Sienna', desc: 'Burnt Sienna (56% White Paint + 23% Brown Paint + 21% Red Paint)', hex: '#C75E3C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 56 }, { name: 'Brown Paint', colorHint: 'brown', pct: 23 }, { name: 'Red Paint', colorHint: 'red', pct: 21 }] },
  { name: 'Copper Ochre', desc: 'Copper Ochre (52% Orange Paint + 31% Yellow Paint + 17% Brown Paint)', hex: '#CE7924', recipe: [{ name: 'Orange Paint', colorHint: 'orange', pct: 52 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 31 }, { name: 'Brown Paint', colorHint: 'brown', pct: 17 }] },
  { name: 'Melon Sorbet', desc: 'Melon Sorbet (97% White Paint + 3% Red Paint)', hex: '#FFC194', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Red Paint', colorHint: 'red', pct: 3 }] },
  { name: 'Spiced Amber', desc: 'Spiced Amber (68% Orange Paint + 19% White Paint + 13% Brown Paint)', hex: '#D47923', recipe: [{ name: 'Orange Paint', colorHint: 'orange', pct: 68 }, { name: 'White Paint', colorHint: 'white', pct: 19 }, { name: 'Brown Paint', colorHint: 'brown', pct: 13 }] },
  { name: 'Burnt Rust', desc: 'Burnt Rust (55% Brown Paint + 45% Red Paint)', hex: '#AC3E26', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 55 }, { name: 'Red Paint', colorHint: 'red', pct: 45 }] },
  { name: 'Dark Bronze', desc: 'Dark Bronze (98% Brown Paint + 2% Black Paint)', hex: '#7B4535', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 98 }, { name: 'Black Paint', colorHint: 'black', pct: 2 }] },
  { name: 'Rust Brown', desc: 'Rust Brown (95% Brown Paint + 5% Red Paint)', hex: '#974433', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 95 }, { name: 'Red Paint', colorHint: 'red', pct: 5 }] },
  { name: 'Copper Brown', desc: 'Copper Brown (93% Brown Paint + 7% Red Paint)', hex: '#984432', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 93 }, { name: 'Red Paint', colorHint: 'red', pct: 7 }] },
  { name: 'Cinnamon Orange', desc: 'Cinnamon Orange (39% White Paint + 31% Brown Paint + 30% Red Paint)', hex: '#BE5032', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 39 }, { name: 'Brown Paint', colorHint: 'brown', pct: 31 }, { name: 'Red Paint', colorHint: 'red', pct: 30 }] },
  { name: '🍋 Bright Lemon', desc: 'Bright Lemon (85% White Paint + 15% Yellow Paint)', hex: '#FFFF7C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 85 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 15 }] },
  { name: 'Buttercup Tint', desc: 'Buttercup Tint (94% White Paint + 6% Orange Paint)', hex: '#FFE085', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 94 }, { name: 'Orange Paint', colorHint: 'orange', pct: 6 }] },
  { name: 'Honey Gold', desc: 'Honey Gold (92% Yellow Paint + 8% Brown Paint)', hex: '#DCB02F', recipe: [{ name: 'Yellow Paint', colorHint: 'yellow', pct: 92 }, { name: 'Brown Paint', colorHint: 'brown', pct: 8 }] },
  { name: 'Mustard Ochre', desc: 'Mustard Ochre (91% Yellow Paint + 9% Brown Paint)', hex: '#DAAB30', recipe: [{ name: 'Yellow Paint', colorHint: 'yellow', pct: 91 }, { name: 'Brown Paint', colorHint: 'brown', pct: 9 }] },
  { name: 'Saffron Gold', desc: 'Saffron Gold (61% White Paint + 32% Yellow Paint + 7% Brown Paint)', hex: '#DEB357', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 61 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 32 }, { name: 'Brown Paint', colorHint: 'brown', pct: 7 }] },
  { name: 'Sunlit Straw', desc: 'Sunlit Straw (95% White Paint + 5% Orange Paint)', hex: '#FFE38C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 95 }, { name: 'Orange Paint', colorHint: 'orange', pct: 5 }] },
  { name: '🌊 Aqua Mint', desc: 'Aqua Mint (80% White Paint + 16% Blue Paint + 4% Green Paint)', hex: '#3BC06A', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 80 }, { name: 'Blue Paint', colorHint: 'blue', pct: 16 }, { name: 'Green Paint', colorHint: 'green', pct: 4 }] },
  { name: '🌿 Rich Leaf Green', desc: 'Rich Leaf Green (75% White Paint + 15% Green Paint + 10% Yellow Paint)', hex: '#42CA2C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 75 }, { name: 'Green Paint', colorHint: 'green', pct: 15 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 10 }] },
  { name: '🫒 Deep Forest', desc: 'Deep Forest (40% White Paint + 50% Yellow Paint + 5% Black Paint + 5% Green Paint)', hex: '#5B763C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 40 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 50 }, { name: 'Black Paint', colorHint: 'black', pct: 5 }, { name: 'Green Paint', colorHint: 'green', pct: 5 }] },
  { name: 'Soft Mint', desc: 'Soft Mint (95% White Paint + 3% Blue Paint + 2% Yellow Paint)', hex: '#8FE5C9', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 95 }, { name: 'Blue Paint', colorHint: 'blue', pct: 3 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 2 }] },
  { name: 'Bright Seafoam', desc: 'Bright Seafoam (92% White Paint + 4% Blue Paint + 4% Yellow Paint)', hex: '#83E3B6', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 92 }, { name: 'Blue Paint', colorHint: 'blue', pct: 4 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 4 }] },
  { name: 'Spring Leaf', desc: 'Spring Leaf (74% White Paint + 16% Yellow Paint + 10% Blue Paint)', hex: '#5BD383', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 74 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 16 }, { name: 'Blue Paint', colorHint: 'blue', pct: 10 }] },
  { name: 'Fresh Mint', desc: 'Fresh Mint (82% White Paint + 9% Blue Paint + 9% Yellow Paint)', hex: '#5FD39A', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 82 }, { name: 'Blue Paint', colorHint: 'blue', pct: 9 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 9 }] },
  { name: 'Vibrant Meadow Green', desc: 'Vibrant Meadow Green (75% White Paint + 18% Yellow Paint + 7% Green Paint)', hex: '#64DF40', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 75 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 18 }, { name: 'Green Paint', colorHint: 'green', pct: 7 }] },
  { name: 'Celadon Jade', desc: 'Celadon Jade (97% White Paint + 2% Yellow Paint + 1% Blue Paint)', hex: '#B6F5C7', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 2 }, { name: 'Blue Paint', colorHint: 'blue', pct: 1 }] },
  { name: 'Dark Moss', desc: 'Dark Moss (87% Yellow Paint + 7% Black Paint + 6% Green Paint)', hex: '#516931', recipe: [{ name: 'Yellow Paint', colorHint: 'yellow', pct: 87 }, { name: 'Black Paint', colorHint: 'black', pct: 7 }, { name: 'Green Paint', colorHint: 'green', pct: 6 }] },
  { name: 'Eucalyptus', desc: 'Eucalyptus (70% Blue Paint + 19% Yellow Paint + 11% White Paint)', hex: '#0E8882', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 70 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 19 }, { name: 'White Paint', colorHint: 'white', pct: 11 }] },
  { name: 'Charcoal Pine', desc: 'Charcoal Pine (48% Yellow Paint + 43% Blue Paint + 9% Black Paint)', hex: '#2D5844', recipe: [{ name: 'Yellow Paint', colorHint: 'yellow', pct: 48 }, { name: 'Blue Paint', colorHint: 'blue', pct: 43 }, { name: 'Black Paint', colorHint: 'black', pct: 9 }] },
  { name: 'Rich Avocado', desc: 'Rich Avocado (97% Yellow Paint + 3% Black Paint)', hex: '#828D38', recipe: [{ name: 'Yellow Paint', colorHint: 'yellow', pct: 97 }, { name: 'Black Paint', colorHint: 'black', pct: 3 }] },
  { name: 'Baby Blue', desc: 'Baby Blue (92% White Paint + 8% Blue Paint)', hex: '#64BEFF', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 92 }, { name: 'Blue Paint', colorHint: 'blue', pct: 8 }] },
  { name: 'Pale Sky Blue', desc: 'Pale Sky Blue (99% White Paint + 1% Blue Paint)', hex: '#B6E8FF', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Blue Paint', colorHint: 'blue', pct: 1 }] },
  { name: 'Clear Sky Blue', desc: 'Clear Sky Blue (97% White Paint + 3% Blue Paint)', hex: '#8FD7FF', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Blue Paint', colorHint: 'blue', pct: 3 }] },
  { name: 'Light Powder Blue', desc: 'Light Powder Blue (98% White Paint + 2% Blue Paint)', hex: '#9EDFFF', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 98 }, { name: 'Blue Paint', colorHint: 'blue', pct: 2 }] },
  { name: 'Cobalt Blue', desc: 'Cobalt Blue (97% Blue Paint + 3% Green Paint)', hex: '#03797A', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 97 }, { name: 'Green Paint', colorHint: 'green', pct: 3 }] },
  { name: 'Ocean Blue', desc: 'Ocean Blue (96% Blue Paint + 4% Green Paint)', hex: '#037B6F', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 96 }, { name: 'Green Paint', colorHint: 'green', pct: 4 }] },
  { name: 'Steel Denim', desc: 'Steel Denim (98% Blue Paint + 2% Black Paint)', hex: '#115D95', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 98 }, { name: 'Black Paint', colorHint: 'black', pct: 2 }] },
  { name: 'Slate Cobalt', desc: 'Slate Cobalt (97% Blue Paint + 3% Black Paint)', hex: '#145B85', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 97 }, { name: 'Black Paint', colorHint: 'black', pct: 3 }] },
  { name: 'Bright Sky Blue', desc: 'Bright Sky Blue (91% White Paint + 9% Blue Paint)', hex: '#5FBAFF', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 91 }, { name: 'Blue Paint', colorHint: 'blue', pct: 9 }] },
  { name: 'Midnight Charcoal', desc: 'Midnight Charcoal (60% Purple Paint + 34% Blue Paint + 6% Black Paint)', hex: '#36385F', recipe: [{ name: 'Purple Paint', colorHint: 'purple', pct: 60 }, { name: 'Blue Paint', colorHint: 'blue', pct: 34 }, { name: 'Black Paint', colorHint: 'black', pct: 6 }] },
  { name: 'Aegean Blue', desc: 'Aegean Blue (96% Blue Paint + 4% Black Paint)', hex: '#17597A', recipe: [{ name: 'Blue Paint', colorHint: 'blue', pct: 96 }, { name: 'Black Paint', colorHint: 'black', pct: 4 }] },
  { name: '🍇 Lavender', desc: 'Lavender (85% White Paint + 10% Purple Paint + 5% Blue Paint)', hex: '#807CCC', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 85 }, { name: 'Purple Paint', colorHint: 'purple', pct: 10 }, { name: 'Blue Paint', colorHint: 'blue', pct: 5 }] },
  { name: 'Soft Lilac', desc: 'Soft Lilac (97% White Paint + 3% Purple Paint)', hex: '#E2ACE1', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 97 }, { name: 'Purple Paint', colorHint: 'purple', pct: 3 }] },
  { name: 'Wisteria Bloom', desc: 'Wisteria Bloom (96% White Paint + 4% Purple Paint)', hex: '#DEA1DD', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 96 }, { name: 'Purple Paint', colorHint: 'purple', pct: 4 }] },
  { name: 'Dusty Plum', desc: 'Dusty Plum (75% Purple Paint + 14% Red Paint + 11% Blue Paint)', hex: '#5D3C56', recipe: [{ name: 'Purple Paint', colorHint: 'purple', pct: 75 }, { name: 'Red Paint', colorHint: 'red', pct: 14 }, { name: 'Blue Paint', colorHint: 'blue', pct: 11 }] },
  { name: 'Charcoal Slate', desc: 'Charcoal Slate (80% White Paint + 15% Purple Paint + 5% Black Paint)', hex: '#6C596C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 80 }, { name: 'Purple Paint', colorHint: 'purple', pct: 15 }, { name: 'Black Paint', colorHint: 'black', pct: 5 }] },
  { name: 'Bright Orchid', desc: 'Bright Orchid (93% White Paint + 7% Purple Paint)', hex: '#D48AD3', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 93 }, { name: 'Purple Paint', colorHint: 'purple', pct: 7 }] },
  { name: 'Mulberry', desc: 'Mulberry (95% Purple Paint + 5% Black Paint)', hex: '#5F295E', recipe: [{ name: 'Purple Paint', colorHint: 'purple', pct: 95 }, { name: 'Black Paint', colorHint: 'black', pct: 5 }] },
  { name: 'Medium Orchid', desc: 'Medium Orchid (90% White Paint + 10% Purple Paint)', hex: '#CC7ACB', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 90 }, { name: 'Purple Paint', colorHint: 'purple', pct: 10 }] },
  { name: '☕ Mustard Gold', desc: 'Mustard Gold (75% White Paint + 15% Brown Paint + 10% Yellow Paint)', hex: '#CF9167', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 75 }, { name: 'Brown Paint', colorHint: 'brown', pct: 15 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 10 }] },
  { name: 'Warm Wheat', desc: 'Warm Wheat (95% White Paint + 5% Brown Paint)', hex: '#E3B6A0', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 95 }, { name: 'Brown Paint', colorHint: 'brown', pct: 5 }] },
  { name: 'Golden Ochre', desc: 'Golden Ochre (86% White Paint + 14% Brown Paint)', hex: '#D1927A', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 86 }, { name: 'Brown Paint', colorHint: 'brown', pct: 14 }] },
  { name: 'Dark Olive', desc: 'Dark Olive (65% White Paint + 30% Brown Paint + 5% Black Paint)', hex: '#6C594D', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 65 }, { name: 'Brown Paint', colorHint: 'brown', pct: 30 }, { name: 'Black Paint', colorHint: 'black', pct: 5 }] },
  { name: 'Sunlit Ochre', desc: 'Sunlit Ochre (90% White Paint + 6% Yellow Paint + 4% Brown Paint)', hex: '#E6C18D', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 90 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 6 }, { name: 'Brown Paint', colorHint: 'brown', pct: 4 }] },
  { name: 'Honey Tan', desc: 'Honey Tan (94% White Paint + 6% Brown Paint)', hex: '#E0B09A', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 94 }, { name: 'Brown Paint', colorHint: 'brown', pct: 6 }] },
  { name: 'Cinnamon Clay', desc: 'Cinnamon Clay (50% White Paint + 41% Brown Paint + 9% Yellow Paint)', hex: '#B4674C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 50 }, { name: 'Brown Paint', colorHint: 'brown', pct: 41 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 9 }] },
  { name: 'Caramel Cocoa', desc: 'Caramel Cocoa (70% Brown Paint + 20% Yellow Paint + 10% White Paint)', hex: '#A25339', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 70 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 20 }, { name: 'White Paint', colorHint: 'white', pct: 10 }] },
  { name: 'Deep Umber', desc: 'Deep Umber (90% Brown Paint + 10% Black Paint)', hex: '#523C31', recipe: [{ name: 'Brown Paint', colorHint: 'brown', pct: 90 }, { name: 'Black Paint', colorHint: 'black', pct: 10 }] },
  { name: 'Spiced Mustard', desc: 'Spiced Mustard (93% White Paint + 7% Brown Paint)', hex: '#DEAB94', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 93 }, { name: 'Brown Paint', colorHint: 'brown', pct: 7 }] },
  { name: '🌙 Modern Slate', desc: 'Modern Slate (85% White Paint + 10% Black Paint + 5% Blue Paint)', hex: '#4D5556', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 85 }, { name: 'Black Paint', colorHint: 'black', pct: 10 }, { name: 'Blue Paint', colorHint: 'blue', pct: 5 }] },
  { name: 'Charcoal Taupe', desc: 'Charcoal Taupe (85% White Paint + 10% Black Paint + 5% Brown Paint)', hex: '#565452', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 85 }, { name: 'Black Paint', colorHint: 'black', pct: 10 }, { name: 'Brown Paint', colorHint: 'brown', pct: 5 }] },
  { name: 'Medium Neutral Gray', desc: 'Medium Neutral Gray (99% White Paint + 1% Black Paint)', hex: '#AAAAAA', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 99 }, { name: 'Black Paint', colorHint: 'black', pct: 1 }] },
  { name: 'Pale Olive', desc: 'Pale Olive (96% White Paint + 3% Brown Paint + 1% Blue Paint)', hex: '#B9C5B3', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 96 }, { name: 'Brown Paint', colorHint: 'brown', pct: 3 }, { name: 'Blue Paint', colorHint: 'blue', pct: 1 }] },
  { name: 'Pewter Gray', desc: 'Pewter Gray (96% White Paint + 4% Black Paint)', hex: '#777777', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 96 }, { name: 'Black Paint', colorHint: 'black', pct: 4 }] },
  { name: 'Dark Neutral Gray', desc: 'Dark Neutral Gray (95% White Paint + 5% Black Paint)', hex: '#6F6F6F', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 95 }, { name: 'Black Paint', colorHint: 'black', pct: 5 }] },
  { name: 'Deep Slate Gray', desc: 'Deep Slate Gray (50% White Paint + 30% Blue Paint + 20% Black Paint)', hex: '#2E3E40', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 50 }, { name: 'Blue Paint', colorHint: 'blue', pct: 30 }, { name: 'Black Paint', colorHint: 'black', pct: 20 }] },
  { name: 'Dark Graphite', desc: 'Dark Graphite (93% White Paint + 7% Black Paint)', hex: '#626262', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 93 }, { name: 'Black Paint', colorHint: 'black', pct: 7 }] }
];

function sanitizeMismatchedCustomPreset(preset) {
  if (!preset || typeof preset !== 'object') return preset;
  const cleanName = cleanPresetColorName(preset.name || '').toLowerCase();
  const rec = Array.isArray(preset.recipe) ? preset.recipe : [];
  if (cleanName === 'lavender' && rec.length >= 2) {
    const hints = rec.map(r => `${r.colorHint || ''} ${r.name || ''}`.toLowerCase()).join(' ');
    const hasBlue = hints.includes('blue');
    const hasPurple = hints.includes('purple') || hints.includes('violet');
    if (hasBlue && !hasPurple) {
      return {
        ...preset,
        name: 'Vibrant Sky Blue',
        desc: `Vibrant Sky Blue (${rec.map(c => `${c.pct}% ${c.name}`).join(' + ')})`,
        _sanitized: true
      };
    }
  }
  return preset;
}

function loadSavedCustomColorPresets() {
  try {
    if (typeof db !== 'undefined' && db && Array.isArray(db.colorFormulas) && db.colorFormulas.length > 0) {
      return db.colorFormulas.map(f => {
        const catMatch = String(f.sheen || '').match(/^cat:(.+)$/i);
        return sanitizeMismatchedCustomPreset({
          id: f.id,
          colorId: f.colorId || null,
          name: f.name,
          desc: `${f.detectedName || f.name} (${(f.pigmentFormula || []).map(c => `${c.pct}% ${c.name}`).join(' + ')})`,
          hex: f.hexReference || '#1F6F6B',
          family: catMatch ? catMatch[1].trim() : (f.family || ''),
          baseType: f.baseType || 'Automotive Paint',
          sheen: catMatch ? '' : (f.sheen || ''),
          notes: f.notes || '',
          isCustom: true,
          recipe: Array.isArray(f.pigmentFormula) ? f.pigmentFormula : []
        });
      });
    }
    const raw = localStorage.getItem(CUSTOM_COLOR_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let changed = false;
    const cleaned = parsed.map(item => {
      const s = sanitizeMismatchedCustomPreset(item);
      if (s && s._sanitized) {
        changed = true;
        delete s._sanitized;
      }
      return s;
    });
    if (changed) {
      try { localStorage.setItem(CUSTOM_COLOR_PRESETS_KEY, JSON.stringify(cleaned)); } catch (e) { }
    }
    return cleaned;
  } catch (e) {
    return [];
  }
}

function enrichRecipeWithDictionary(recipeObj) {
  if (!recipeObj || !Array.isArray(recipeObj.recipe) || recipeObj.recipe.length < 2) return null;
  const sumPct = recipeObj.recipe.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  if (Math.abs(sumPct - 100) > 0.5) return null;
  const cleanName = cleanPresetColorName(recipeObj.name);
  const dictMatch = Array.isArray(PAINT_COLOR_DICTIONARY)
    ? PAINT_COLOR_DICTIONARY.find(d => d.name.toLowerCase() === cleanName.toLowerCase())
    : null;
  const hex = (dictMatch && dictMatch.hex) || recipeObj.hex || '#1F6F6B';
  const rgb = hexToRgb(hex);
  const family = (dictMatch && dictMatch.family) || recipeObj.family || (detectDictionaryColorOnly(rgb.r, rgb.g, rgb.b).family) || 'Custom';
  return {
    ...recipeObj,
    cleanName,
    hex,
    rgb,
    family,
    hasFormula: true
  };
}

function getColorRecipePresets() {
  const custom = loadSavedCustomColorPresets();
  const seen = new Set();
  const list = [];
  // 1. Add all saved recipes (ready-made + custom formulas), enriched with PAINT_COLOR_DICTIONARY
  [...DEFAULT_COLOR_RECIPE_PRESETS, ...custom].forEach(raw => {
    const enriched = enrichRecipeWithDictionary(raw);
    if (!enriched) return;
    const key = enriched.cleanName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(enriched);
  });

  // 2. Include all remaining mixed colors from PAINT_COLOR_DICTIONARY (marked hasFormula: false, no invented ratios)
  if (Array.isArray(PAINT_COLOR_DICTIONARY)) {
    PAINT_COLOR_DICTIONARY.forEach(d => {
      if (!d || !d.name) return;
      const key = d.name.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        name: d.name,
        cleanName: d.name,
        hex: d.hex,
        rgb: { r: d.r, g: d.g, b: d.b },
        family: d.family || 'Custom',
        desc: `${d.name} (${d.hex}) — No saved mixing formula yet`,
        hasFormula: false,
        recipe: []
      });
    });
  }

  return list;
}

const COLOR_RECIPE_PRESETS = [];

function syncActiveColorRecipePresets() {
  const updated = getColorRecipePresets();
  COLOR_RECIPE_PRESETS.length = 0;
  COLOR_RECIPE_PRESETS.push(...updated);
  return COLOR_RECIPE_PRESETS;
}

syncActiveColorRecipePresets();

function saveMixedColorToPresets({ colorName, detectedName, hex, baseType, components, colorId = null, sheen = '', notes = '' }) {
  if (!colorName || !Array.isArray(components) || !components.length) return;
  const cleanName = colorName.trim();
  const pigmentFormula = components.map(c => {
    const prod = (c.productId && typeof productById === 'function') ? productById(c.productId) : null;
    const compColorId = c.colorId || (prod && (prod.colorId || prod.color_id)) || null;
    const libEntry = compColorId && typeof findColorLibraryEntry === 'function' ? findColorLibraryEntry(compColorId) : null;
    return {
      productId: c.productId || '',
      colorId: libEntry ? libEntry.id : compColorId,
      name: c.name || '',
      colorName: (libEntry && libEntry.name) || c.colorName || c.color || '',
      hex: (libEntry && libEntry.hex) || c.hex || '',
      colorHint: ((libEntry && libEntry.name) || c.name || '').toLowerCase(),
      pct: Number(c.percentage ?? c.pct) || 0,
      preferredCanSize: Number(c.preferredCanSize) || 0
    };
  });
  const recipeDesc = pigmentFormula.map(c => `${c.pct}% ${c.name}`).join(' + ');
  const hexRef = (typeof normalizeHexCode === 'function' ? normalizeHexCode(hex) : '') || hex || '#1F6F6B';
  const newPreset = {
    colorId: colorId || null,
    name: cleanName,
    desc: `${detectedName || cleanName} (${recipeDesc})`,
    hex: hexRef,
    baseType: baseType || 'Automotive Paint',
    sheen: sheen || '',
    notes: notes || '',
    isCustom: true,
    recipe: pigmentFormula
  };

  const existingIdx = COLOR_RECIPE_PRESETS.findIndex(
    p => p.isCustom && (p.name || '').trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (existingIdx >= 0) {
    COLOR_RECIPE_PRESETS[existingIdx] = newPreset;
  } else {
    COLOR_RECIPE_PRESETS.push(newPreset);
  }

  // Persist in db.colorFormulas & localStorage
  if (typeof db !== 'undefined' && db) {
    if (!Array.isArray(db.colorFormulas)) db.colorFormulas = [];
    const fIdx = db.colorFormulas.findIndex(f => (f.name || '').trim().toLowerCase() === cleanName.toLowerCase());
    const formulaRec = {
      id: fIdx >= 0 ? db.colorFormulas[fIdx].id : ('cf_' + Date.now().toString(36)),
      colorId: colorId || null,
      name: cleanName,
      hexReference: hexRef,
      detectedName: detectedName || cleanName,
      baseType: baseType || 'Automotive Paint',
      sheen: sheen || '',
      notes: notes || '',
      pigmentFormula: pigmentFormula,
      isCustom: true
    };
    if (fIdx >= 0) db.colorFormulas[fIdx] = formulaRec;
    else db.colorFormulas.unshift(formulaRec);
  }

  try {
    const customOnly = COLOR_RECIPE_PRESETS.filter(p => p.isCustom);
    localStorage.setItem(CUSTOM_COLOR_PRESETS_KEY, JSON.stringify(customOnly));
  } catch (e) {
    console.warn('Could not persist custom color presets', e);
  }

  // Persist to local MySQL database offline
  fetch('api/db.php?action=color_formula_save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      colorId: colorId || null,
      name: cleanName,
      hexReference: hexRef,
      detectedName: detectedName || cleanName,
      baseType: baseType || 'Automotive Paint',
      sheen: sheen || '',
      notes: notes || '',
      pigmentFormula: pigmentFormula
    })
  })
    .then(r => r.json())
    .then(data => {
      if (data && data.success && Array.isArray(data.colorFormulas) && typeof db !== 'undefined' && db) {
        db.colorFormulas = data.colorFormulas;
        syncActiveColorRecipePresets();
        const chipsEl = document.getElementById('cm-preset-chips-wrap');
        if (chipsEl) chipsEl.innerHTML = renderColorMixPresetChipsHtml();
      }
    })
    .catch(err => console.warn('Color formula DB save warning:', err));

  syncActiveColorRecipePresets();
}

let _cmProdIndexSig = '';
let _cmProdIndexList = [];
let _cmRecipeEvalCacheSig = '';
const _cmRecipeEvalCache = new Map();

function getColorMixInventorySignature() {
  const prods = (typeof activeProducts === 'function' ? activeProducts() : []);
  let stockSum = 0;
  let openedSum = 0;
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    if (!p) continue;
    stockSum += Number(p.stock) || 0;
    if (typeof productOpenedStock === 'function') openedSum += productOpenedStock(p);
  }
  const libLen = (typeof db !== 'undefined' && db && Array.isArray(db.colorLibrary)) ? db.colorLibrary.length : 0;
  return `${prods.length}|${Math.round(stockSum * 100)}|${Math.round(openedSum * 100)}|${libLen}`;
}

function getColorMixProductIndex() {
  const sig = getColorMixInventorySignature();
  if (sig === _cmProdIndexSig && _cmProdIndexList.length > 0) {
    return _cmProdIndexList;
  }
  const prods = (typeof activeProducts === 'function' ? activeProducts() : [])
    .filter(p => p && p.status === 'active');
  const libList = getMasterColorLibrary();
  const libById = new Map(libList.map(c => [String(c.id), c]));

  _cmProdIndexList = prods.map(prod => {
    const cid = prod.colorId || prod.color_id;
    const libEntry = cid ? libById.get(String(cid)) : null;
    const hex = (libEntry && libEntry.hex) || getProductDefaultColor(prod);
    const pColor = String(prod.color || '').trim().toLowerCase();
    const pColorName = String((libEntry && libEntry.name) || prod.colorName || prod.color || '').trim().toLowerCase();
    const pName = String(prod.name || '').trim().toLowerCase();
    let libText = libEntry ? `${libEntry.name || ''} ${libEntry.category || ''} ${libEntry.colorFamily || ''}`.toLowerCase() : '';
    if (!libText && hex && libList.length) {
      const rgb = hexToRgb(hex);
      if (rgb && typeof detectClosestLibraryColor === 'function') {
        const libDet = detectClosestLibraryColor(rgb.r, rgb.g, rgb.b);
        if (libDet) libText = `${libDet.name || ''} ${libDet.family || ''} ${libDet.category || ''}`.toLowerCase();
      }
    }
    return {
      product: prod,
      idStr: String(prod.id),
      colorId: cid ? String(cid) : '',
      isColorPigment: Boolean(prod.isColorPigment || prod.is_color_pigment || /pigment|colorant/i.test(String(prod.category || prod.type || ''))),
      hex,
      searchText: `${pColor} ${pColorName} ${pName} ${libText}`,
      usableStock: typeof productMixAvailableStock === 'function' ? productMixAvailableStock(prod) : (Number(prod.stock) || 0),
      openedStock: typeof productOpenedStock === 'function' ? productOpenedStock(prod) : 0,
      typeLower: String(prod.type || '').toLowerCase()
    };
  });
  _cmProdIndexSig = sig;
  _cmRecipeEvalCache.clear();
  _cmRecipeEvalCacheSig = sig;
  return _cmProdIndexList;
}

function findMatchingProductForRecipeItem(item, reqLiters = 0, excludeProductIds = new Set(), preferredType = '') {
  const index = getColorMixProductIndex();
  const prefLower = String(preferredType || '').toLowerCase();

  // 1. Exact productId match first (for saved custom mixes)
  if (item.productId && !excludeProductIds.has(String(item.productId))) {
    const byId = index.find(e => e.idStr === String(item.productId));
    if (byId) return { product: byId.product, reason: null };
    const rawProd = typeof productById === 'function' ? productById(item.productId) : null;
    if (rawProd && rawProd.status === 'active') return { product: rawProd, reason: null };
  }

  // 1b. Exact Color Library ID match (identifies linked pigment products & color-linked paints)
  if (item.colorId) {
    const targetCid = String(item.colorId);
    const cidCandidates = index.filter(e => !excludeProductIds.has(e.idStr) && e.colorId === targetCid);
    if (cidCandidates.length > 0) {
      cidCandidates.sort((a, b) => {
        const aSufficient = reqLiters > 0 ? (a.usableStock >= reqLiters ? 1 : 0) : (a.usableStock > 0 ? 1 : 0);
        const bSufficient = reqLiters > 0 ? (b.usableStock >= reqLiters ? 1 : 0) : (b.usableStock > 0 ? 1 : 0);
        if (aSufficient !== bSufficient) return bSufficient - aSufficient;

        const aTypeMatch = prefLower && a.typeLower === prefLower ? 1 : 0;
        const bTypeMatch = prefLower && b.typeLower === prefLower ? 1 : 0;
        if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch;

        const aPigment = a.isColorPigment ? 1 : 0;
        const bPigment = b.isColorPigment ? 1 : 0;
        if (aPigment !== bPigment) return bPigment - aPigment;

        return b.usableStock - a.usableStock;
      });
      return { product: cidCandidates[0].product, reason: null };
    }
  }

  // 2. Match by colorHint or name using pre-indexed searchText (O(N) string check, zero library scans)
  const hint = String(item.colorHint || item.name || '').trim().toLowerCase();
  if (hint) {
    const candidates = [];
    for (let i = 0; i < index.length; i++) {
      const e = index[i];
      if (excludeProductIds.has(e.idStr)) continue;
      if (e.searchText.includes(hint)) candidates.push(e);
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const aSufficient = reqLiters > 0 ? (a.usableStock >= reqLiters ? 1 : 0) : (a.usableStock > 0 ? 1 : 0);
        const bSufficient = reqLiters > 0 ? (b.usableStock >= reqLiters ? 1 : 0) : (b.usableStock > 0 ? 1 : 0);
        if (aSufficient !== bSufficient) return bSufficient - aSufficient;

        const aTypeMatch = prefLower && a.typeLower === prefLower ? 1 : 0;
        const bTypeMatch = prefLower && b.typeLower === prefLower ? 1 : 0;
        if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch;

        const aOpened = a.openedStock > 0 ? 1 : 0;
        const bOpened = b.openedStock > 0 ? 1 : 0;
        if (aOpened !== bOpened) return bOpened - aOpened;

        return b.usableStock - a.usableStock;
      });

      return { product: candidates[0].product, reason: null };
    }
  }

  return { product: null, reason: `Missing ${item.name || item.colorHint || 'ingredient'} in inventory` };
}

function productMixNonExpiredAvailableStock(p) {
  if (!p) return 0;
  const opened = (typeof productOpenedStock === 'function') ? productOpenedStock(p) : (Number(p.openedStock) || 0);
  if (typeof posBatchStatusBySize !== 'undefined' && posBatchStatusBySize && Object.keys(posBatchStatusBySize).length > 0 && Array.isArray(p.sizesData) && p.sizesData.length > 0) {
    let nonExpiredSealedLiters = 0;
    let matchedAnySize = false;
    p.sizesData.forEach(sz => {
      const sid = sz.sizeId || sz.size_id;
      const cSize = Number(sz.containerSize || sz.container_size) || 0;
      if (sid && posBatchStatusBySize[sid]) {
        matchedAnySize = true;
        const bInfo = posBatchStatusBySize[sid];
        nonExpiredSealedLiters += (Number(bInfo.nonExpiredQty) || 0) * cSize;
      } else {
        nonExpiredSealedLiters += (Number(sz.sealedQuantity) || 0) * cSize;
      }
    });
    if (matchedAnySize) {
      return Number(Math.max(0, opened + nonExpiredSealedLiters).toFixed(2));
    }
  }
  return (typeof productMixAvailableStock === 'function') ? productMixAvailableStock(p) : Number(Math.max(0, opened + (Number(p.stock) || 0)).toFixed(2));
}

function evaluateRecipePresetAvailability(preset, totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters ? colorMixStudioState.totalLiters : 1)) {
  if (!preset || !Array.isArray(preset.recipe) || !preset.recipe.length) {
    return {
      available: false,
      lackingReasons: ['Empty recipe'],
      shortageDescriptions: ['Empty recipe'],
      ingredients: [],
      resolvedItems: [],
      tooltip: 'Empty recipe'
    };
  }

  const vol = Math.max(0.5, Number(totalLiters) || 0.5);
  const preferredType = (colorMixStudioState && colorMixStudioState.typeFilter && colorMixStudioState.typeFilter !== 'all')
    ? colorMixStudioState.typeFilter
    : (preset.baseType || '');

  // Ensure product index & recipe evaluation cache are synchronized with current inventory stock
  getColorMixProductIndex();
  const recipeKey = `${preset.id || preset.cleanName || preset.name || ''}|${vol}|${preferredType}`;
  if (_cmRecipeEvalCache.has(recipeKey)) {
    return _cmRecipeEvalCache.get(recipeKey);
  }

  const usedProductIds = new Set();
  const productTotalReqMap = new Map();
  const resolvedItems = [];

  // Pass 1: Match products and aggregate required liters per product ID (avoids double counting)
  preset.recipe.forEach(item => {
    const pct = Number(item.pct) || 0;
    const reqLiters = Number(((vol * (pct / 100)) || 0).toFixed(2));
    const { product, reason } = findMatchingProductForRecipeItem(item, reqLiters, usedProductIds, preferredType);
    if (product) {
      usedProductIds.add(String(product.id));
      const prevTotal = productTotalReqMap.get(String(product.id)) || 0;
      productTotalReqMap.set(String(product.id), Number((prevTotal + reqLiters).toFixed(2)));
    }
    resolvedItems.push({ item, product, reqLiters, reason });
  });

  // Pass 2: Evaluate stock sufficiency per ingredient
  const ingredients = [];
  const lackingReasons = [];
  const shortageDescriptions = [];

  resolvedItems.forEach(({ item, product, reqLiters, reason }) => {
    const rawHint = item.colorHint || (item.name ? item.name.replace(/paint/i, '').trim() : '');
    const fallbackDisplayName = rawHint ? (rawHint.charAt(0).toUpperCase() + rawHint.slice(1).toLowerCase() + ' Paint') : 'Ingredient';
    const displayName = item.name || fallbackDisplayName;

    if (!product) {
      const shortageDesc = `${displayName} needs ${formatStock(reqLiters)} L but only 0.00 L is available.`;
      lackingReasons.push(reason || shortageDesc);
      shortageDescriptions.push(shortageDesc);
      ingredients.push({
        item,
        displayName,
        product: null,
        productId: null,
        pct: Number(item.pct) || 0,
        reqLiters,
        openedStock: 0,
        sealedStock: 0,
        usableStock: 0,
        isAvailable: false,
        shortageLiters: reqLiters,
        statusText: 'Insufficient'
      });
      return;
    }

    const openedStock = productOpenedStock(product);
    const sealedStock = Math.max(0, Number(product.stock) || 0);
    const usableStock = productMixNonExpiredAvailableStock(product);
    const totalReqForProduct = productTotalReqMap.get(String(product.id)) || reqLiters;
    const hasSufficient = usableStock >= totalReqForProduct && usableStock > 0;
    const shortageLiters = hasSufficient ? 0 : Number(Math.max(0, totalReqForProduct - usableStock).toFixed(2));

    if (!hasSufficient) {
      const shortageDesc = `${displayName} needs ${formatStock(totalReqForProduct)} L but only ${formatStock(usableStock)} L is available.`;
      lackingReasons.push(shortageDesc);
      shortageDescriptions.push(shortageDesc);
    }

    ingredients.push({
      item,
      displayName,
      product,
      productId: product.id,
      productName: product.name,
      pct: Number(item.pct) || 0,
      reqLiters,
      openedStock,
      sealedStock,
      usableStock,
      isAvailable: hasSufficient,
      shortageLiters,
      statusText: hasSufficient ? 'Available' : 'Insufficient'
    });
  });

  const isAvailable = ingredients.length > 0 && ingredients.every(ing => ing.isAvailable);

  // Build clean multiline tooltip strictly matching requirements:
  // Preset: Flamingo Pink
  //
  // Required Ingredients:
  // - White Paint: 0.60 L — Available
  // - Red Paint: 0.40 L — Insufficient
  //
  // Shortage:
  // Red Paint needs 0.40 L but only 0.20 L is available.
  let tooltip = `Mixed Color Catalog: ${preset.name}\n\nRequired Ingredients:\n`;
  ingredients.forEach(ing => {
    tooltip += `- ${ing.displayName}: ${formatStock(ing.reqLiters)} L — ${ing.isAvailable ? 'Available' : 'Insufficient'}\n`;
  });
  if (!isAvailable) {
    tooltip += `\nShortage:\n${shortageDescriptions.join('\n')}`;
  } else {
    tooltip += `\nStatus: Available (${vol} L mix)`;
  }

  const resolvedHex = (resolvedItems.length >= 2 && resolvedItems.every(r => r.product))
    ? subtractivePaintMix(resolvedItems.map(r => ({
      hex: getProductDefaultColor(r.product),
      pct: Number(r.item.pct) || 0
    }))).hex
    : preset.hex;

  const evalResult = {
    available: isAvailable,
    lackingReasons,
    shortageDescriptions,
    ingredients,
    resolvedItems,
    resolvedHex,
    tooltip: tooltip.trim()
  };
  _cmRecipeEvalCache.set(recipeKey, evalResult);
  return evalResult;
}

function isPresetCurrentlyActive(preset, pIdx) {
  if (!colorMixStudioState || !Array.isArray(colorMixStudioState.components)) return false;
  if (colorMixStudioState.selectedPresetIndex === pIdx) {
    if (doesComponentsMatchPreset(preset, colorMixStudioState.components)) {
      return true;
    }
    colorMixStudioState.selectedPresetIndex = -1;
    return false;
  }
  if (Number(colorMixStudioState.selectedPresetIndex) >= 0) {
    return false;
  }
  return doesComponentsMatchPreset(preset, colorMixStudioState.components);
}

function onColorMixPresetSearch(val) {
  if (!colorMixStudioState) return;
  colorMixStudioState.presetSearch = String(val || '');
  const clrBtn = document.getElementById('cm-preset-search-clear');
  if (clrBtn) clrBtn.style.display = colorMixStudioState.presetSearch.trim() ? 'inline-flex' : 'none';
  const wrap = document.getElementById('cm-preset-chips-wrap');
  if (wrap) wrap.innerHTML = renderColorMixPresetChipsHtml();
}

function clearColorMixPresetSearch() {
  if (!colorMixStudioState) return;
  colorMixStudioState.presetSearch = '';
  const inp = document.getElementById('cm-preset-search');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
  const clrBtn = document.getElementById('cm-preset-search-clear');
  if (clrBtn) clrBtn.style.display = 'none';
  const wrap = document.getElementById('cm-preset-chips-wrap');
  if (wrap) wrap.innerHTML = renderColorMixPresetChipsHtml();
}

function onColorMixRecipeCategoryChange(cat) {
  if (!colorMixStudioState) return;
  colorMixStudioState.recipeCategoryFilter = cat || 'All';
  const wrap = document.getElementById('cm-preset-chips-wrap');
  if (wrap) wrap.innerHTML = renderColorMixPresetChipsHtml();
}

function renderColorMixPresetChipsHtml() {
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const recipes = COLOR_RECIPE_PRESETS;
  const query = ((colorMixStudioState && colorMixStudioState.presetSearch) || '').trim().toLowerCase();
  const activeCat = (colorMixStudioState && colorMixStudioState.recipeCategoryFilter) || 'All';

  const families = ['All', ...Array.from(new Set(recipes.map(r => r.family || 'Custom').filter(Boolean)))];

  let indexed = recipes.map((preset, pIdx) => ({ preset, pIdx }));
  if (activeCat !== 'All') {
    indexed = indexed.filter(({ preset }) => (preset.family || 'Custom') === activeCat);
  }
  if (query) {
    indexed = indexed.filter(({ preset }) => {
      const hay = `${preset.name || ''} ${preset.cleanName || ''} ${preset.hex || ''} ${preset.family || ''} ${preset.desc || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }

  const catBarHtml = `
    <div class="cm-recipe-cat-bar">
      ${families.map(f => `
        <button type="button" class="cm-recipe-cat-pill ${activeCat === f ? 'active' : ''}" onclick="onColorMixRecipeCategoryChange('${escapeAttr(f)}')">${escapeHtml(f)}</button>
      `).join('')}
    </div>
  `;

  if (!indexed.length) {
    return `${catBarHtml}<div class="cm-preset-empty">No Mixed Color Catalog entries match "${escapeHtml(colorMixStudioState.presetSearch || activeCat)}".</div>`;
  }

  return `
    ${catBarHtml}
    <div class="cm-ready-recipes-grid">
      ${indexed.map(({ preset, pIdx }) => {
    const hasFormula = Boolean(preset.hasFormula && Array.isArray(preset.recipe) && preset.recipe.length >= 2);
    const check = hasFormula ? evaluateRecipePresetAvailability(preset, totalLiters) : null;
    const isAvailable = hasFormula && check && check.available;
    const isActive = isAvailable && isPresetCurrentlyActive(preset, pIdx);
    if (!isAvailable && colorMixStudioState && colorMixStudioState.selectedPresetIndex === pIdx) {
      colorMixStudioState.selectedPresetIndex = -1;
    }
    const displayHex = (check && check.resolvedHex) || preset.hex;
    const tooltipText = hasFormula
      ? check.tooltip
      : `${preset.cleanName || preset.name} (${displayHex}) — No saved mixing formula yet`;
    return `
          <button class="cm-ready-recipe-card ${hasFormula ? (isAvailable ? ('available' + (isActive ? ' active' : '')) : 'lacking unavailable') : 'no-formula'}"
                  type="button"
                  ${!isAvailable ? 'aria-disabled="true" data-preset-disabled="true"' : ''}
                  onclick="handleRecipePresetClick(${pIdx})"
                  title="${escapeHtml(tooltipText)}">
            <span class="cm-ready-recipe-swatch" style="background-color:${escapeAttr(displayHex)}; ${hasFormula && !isAvailable ? 'filter:grayscale(0.5); opacity:0.65;' : ''}"></span>
            <span class="cm-ready-recipe-info">
              <span class="cm-ready-recipe-name">${escapeHtml(preset.cleanName || preset.name)}</span>
              <span class="cm-ready-recipe-sub">
                <code>${escapeHtml(displayHex)}</code>
                <span>· ${escapeHtml(preset.family || 'Mix')}</span>
              </span>
            </span>
            <span class="cm-ready-recipe-status ${hasFormula ? (isAvailable ? 'ok' : 'low') : 'none'}">
              ${!hasFormula ? 'No Formula' : (isActive ? '✓ Selected' : (isAvailable ? 'Ready' : 'Low Stock'))}
            </span>
          </button>
        `;
  }).join('')}
    </div>
  `;
}

let currentShortagePresetIndex = -1;

function handleRecipePresetClick(presetIndex) {
  const p = COLOR_RECIPE_PRESETS[presetIndex];
  if (!p) return;
  if (!p.hasFormula || !Array.isArray(p.recipe) || p.recipe.length < 2) {
    showToast(`"${p.cleanName || p.name}" (${p.hex}) has no saved mixing formula yet.`, 'info');
    return;
  }
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const check = evaluateRecipePresetAvailability(p, totalLiters);

  if (!check.available) {
    // PREVENT SELECTION!
    currentShortagePresetIndex = presetIndex;
    showPresetShortageAlert(p, check, totalLiters);
    return;
  }

  // Available -> Dismiss any active shortage alert & apply recipe
  currentShortagePresetIndex = -1;
  dismissPresetShortageAlert();
  applyRecipePreset(presetIndex, check);
}

function showPresetShortageAlert(preset, check, totalLiters) {
  const container = document.getElementById('cm-preset-shortage-alert');
  const vol = formatStock(totalLiters);
  if (!container) {
    showToast(`"${preset.name}" is unavailable: ${check.shortageDescriptions[0]}`, 'error');
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="cm-preset-shortage-box">
      <div class="row" style="justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <div style="font-weight:700; font-size:13px; color:var(--danger-text); display:flex; align-items:center; gap:6px;">
            <span style="font-size:15px;">⚠️</span>
            <span>Mixed Color Catalog: <b>${escapeHtml(preset.name)}</b> — Insufficient Stock</span>
          </div>
          <div class="muted small" style="margin-top:2px; font-size:11.5px;">
            Mixing Volume: <b>${vol} L</b>. Checked usable inventory across opened leftovers &amp; sealed stock:
          </div>
        </div>
        <button type="button" class="btn ghost small" onclick="dismissPresetShortageAlert()" style="font-size:12px; padding:2px 7px; color:var(--ink-soft);" title="Dismiss shortage alert">✕</button>
      </div>

      <div style="margin-top:9px; background:var(--surface); border-radius:6px; padding:8px 12px; border:1px solid var(--danger-border);">
        <div style="font-size:11.5px; font-weight:700; margin-bottom:5px; color:var(--ink);">Required Ingredients:</div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${check.ingredients.map(ing => `
            <div class="row" style="justify-content:space-between; align-items:center; font-size:11.5px;">
              <span>• <b>${escapeHtml(ing.displayName)}</b>: ${formatStock(ing.reqLiters)} L</span>
              <div class="row" style="gap:6px; align-items:center;">
                <span class="muted small" style="font-size:10.5px;">(${formatStock(ing.usableStock)} L available · ${formatStock(ing.sealedStock)}L sealed + ${formatStock(ing.openedStock)}L opened)</span>
                <span class="badge ${ing.isAvailable ? 'ok' : 'low'}" style="font-size:10px; padding:1px 6px;">
                  ${ing.isAvailable ? '✓ Available' : '⚠️ Insufficient'}
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-top:9px; background:var(--danger-bg); border-left:3px solid #EF4444; padding:6px 10px; border-radius:0 4px 4px 0;">
        <div style="font-size:11.5px; font-weight:700; color:var(--danger-text);">Shortage:</div>
        <div style="margin-top:2px; font-size:11.5px; color:var(--danger-text);">
          ${check.shortageDescriptions.map(d => `<div>${escapeHtml(d)}</div>`).join('')}
        </div>
      </div>
    </div>
  `;

  showToast(`Preset "${preset.name}" is unavailable: ${check.shortageDescriptions[0]}`, 'error');
}

function dismissPresetShortageAlert() {
  currentShortagePresetIndex = -1;
  const container = document.getElementById('cm-preset-shortage-alert');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function updateActivePresetShortageAlert() {
  if (currentShortagePresetIndex < 0) return;
  const p = COLOR_RECIPE_PRESETS[currentShortagePresetIndex];
  if (!p) {
    dismissPresetShortageAlert();
    return;
  }
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const check = evaluateRecipePresetAvailability(p, totalLiters);
  if (check.available) {
    dismissPresetShortageAlert();
    showToast(`Preset "${p.name}" is now available at ${formatStock(totalLiters)} L!`, 'ok');
  } else {
    showPresetShortageAlert(p, check, totalLiters);
  }
}

function refreshColorMixPresetAvailabilityUI() {
  const presetWrap = document.getElementById('cm-preset-chips-wrap');
  if (presetWrap && typeof renderColorMixPresetChipsHtml === 'function') {
    presetWrap.innerHTML = renderColorMixPresetChipsHtml();
  }
  updateActivePresetShortageAlert();
}
window.refreshColorMixPresetAvailabilityUI = refreshColorMixPresetAvailabilityUI;

function applyRecipePreset(presetIndex, preCheck = null) {
  const p = COLOR_RECIPE_PRESETS[presetIndex];
  if (!p) return;
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const check = preCheck || evaluateRecipePresetAvailability(p, totalLiters);
  if (!check.available) {
    showPresetShortageAlert(p, check, totalLiters);
    return;
  }

  const newComponents = check.resolvedItems.map(({ item, product }) => ({
    id: uid('cmc'),
    productId: product.id,
    colorId: item.colorId || product.colorId || product.color_id || null,
    name: product.name,
    brand: product.brand,
    colorName: getProductColorName(product),
    color: getProductColorName(product),
    stock: product.stock,
    price: product.price,
    hex: getProductDefaultColor(product),
    pct: item.pct,
    preferredCanSize: 0,
    isOriginal: true
  }));

  colorMixStudioState.components = newComponents;
  colorMixStudioState.selectedPresetIndex = presetIndex;
  colorMixStudioState.originalPresetIndex = presetIndex;
  colorMixStudioState.originalCatalogName = cleanPresetColorName(p.name);
  colorMixStudioState.isCustomizingFormula = false;
  colorMixStudioState.isCustomizedFormula = false;
  colorMixStudioState.customizeSnapshot = null;
  colorMixStudioState.openPickerIdx = -1;
  colorMixStudioState.selectedLibraryColorId = p.colorId || null;
  const invTypes = getInventoryBasePaintTypes();
  const firstProdType = (check.resolvedItems[0] && check.resolvedItems[0].product && check.resolvedItems[0].product.type)
    ? String(check.resolvedItems[0].product.type).trim()
    : '';
  if (p.baseType && invTypes.includes(p.baseType)) {
    colorMixStudioState.baseType = p.baseType;
  } else if (firstProdType && invTypes.includes(firstProdType)) {
    colorMixStudioState.baseType = firstProdType;
  } else if (invTypes.length > 0 && !invTypes.includes(colorMixStudioState.baseType)) {
    colorMixStudioState.baseType = invTypes[0];
  }
  // Set formula color name cleanly from the preset (stripping emoji e.g. "🌸 Pastel Rose" -> "Pastel Rose")
  const cleanPresetName = cleanPresetColorName(p.name);
  colorMixStudioState.colorName = cleanPresetName;
  colorMixStudioState.userCustomizedName = false;
  updateColorMixCalculation(true);
  renderColorMixStudio();
  showToast(`Loaded Mixed Color Catalog formula: ${p.name}!`, 'ok');
}

function copyHexToClipboard(hex) {
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hex).then(() => {
      showToast(`Copied color code ${hex} to clipboard!`, 'ok');
    }).catch(() => {
      showToast(`Color code: ${hex}`, 'ok');
    });
  } else {
    showToast(`Color code: ${hex}`, 'ok');
  }
}

const COLOR_MIX_SHEEN_OPTIONS = ['High Gloss', 'Semi-Gloss', 'Satin', 'Matte', 'Metallic'];

function stripSheenTagsFromNote(noteStr) {
  let cleaned = String(noteStr || '');
  // Match longest sheen names first so 'High Gloss' and 'Semi-Gloss' are removed before 'Gloss'
  const sheenPatterns = ['High Gloss', 'Semi-Gloss', 'Satin', 'Matte', 'Metallic', 'Textured', 'Gloss'];
  sheenPatterns.forEach(s => {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\s+Finish\\b`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  });
  cleaned = cleaned
    .split(/\s*[·,]\s*/)
    .map(part => part.replace(/^(High|Semi-)$/i, '').trim())
    .filter(Boolean)
    .join(' · ');
  return cleaned.trim();
}

function getActiveColorMixSheen(state = colorMixStudioState) {
  if (!state) return '';
  if (state.selectedSheen && COLOR_MIX_SHEEN_OPTIONS.includes(state.selectedSheen)) {
    return state.selectedSheen;
  }
  const note = String(state.note || '');
  if (!note) return '';
  for (const sheen of COLOR_MIX_SHEEN_OPTIONS) {
    const escaped = sheen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}(\\s+Finish)?\\b`, 'i').test(note)) {
      return sheen;
    }
  }
  return '';
}

function syncColorMixSheenButtonsUI() {
  const activeSheen = getActiveColorMixSheen(colorMixStudioState);
  document.querySelectorAll('.cm-sheen-btn').forEach(btn => {
    const btnSheen = btn.getAttribute('data-sheen') || '';
    if (btnSheen === activeSheen && activeSheen !== '') {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });
}

function onColorMixNoteInput(val) {
  colorMixStudioState.note = val;
  let matchedSheen = '';
  for (const sheen of COLOR_MIX_SHEEN_OPTIONS) {
    const escaped = sheen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}(\\s+Finish)?\\b`, 'i').test(val || '')) {
      matchedSheen = sheen;
      break;
    }
  }
  colorMixStudioState.selectedSheen = matchedSheen;
  syncColorMixSheenButtonsUI();
}

function applyFinishPreset(sheen) {
  const input = document.getElementById('cm-note');
  const rawNote = input ? input.value : (colorMixStudioState.note || '');
  const baseNote = stripSheenTagsFromNote(rawNote);

  colorMixStudioState.selectedSheen = sheen;
  colorMixStudioState.note = (baseNote ? baseNote + ' · ' : '') + `${sheen} Finish`;
  if (input) input.value = colorMixStudioState.note;
  syncColorMixSheenButtonsUI();
  showToast(`Applied finish sheen: ${sheen}`, 'ok');
}

function colorMixStudioHtml() {
  const s = colorMixStudioState;
  const prods = colorMixAvailableProducts();

  // Ensure current components do not point to products at or below threshold, without creating duplicates
  const usedFallbackIds = new Set(s.components.map(comp => String(comp.productId)).filter(Boolean));
  s.components.forEach((c, idx) => {
    if (c.productId && !prods.some(p => p.id === c.productId)) {
      usedFallbackIds.delete(String(c.productId));
      const fallback = prods.find(p => !usedFallbackIds.has(String(p.id))) || null;
      if (fallback) {
        usedFallbackIds.add(String(fallback.id));
        c.productId = fallback.id;
        c.name = fallback.name;
        c.brand = fallback.brand;
        c.stock = fallback.stock;
        c.price = fallback.price;
        c.hex = getProductDefaultColor(fallback);
      } else {
        c.productId = '';
        c.name = 'Component ' + String.fromCharCode(65 + idx);
        c.stock = 0;
      }
    }
  });

  const mixed = subtractivePaintMix(s.components);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  const totalPct = s.components.reduce((sum, c) => sum + (Number(c.pct) || 0), 0);
  const totalPctRounded = Math.round(totalPct * 10) / 10;
  const isPctBalanced = Math.abs(totalPct - 100) < 0.05;
  const activeIngCount = s.components.filter(c => c.productId && Number(c.pct) > 0).length;
  const hasMinTwoIngredients = activeIngCount >= 2;
  const compProductIds = s.components.map(c => c.productId).filter(Boolean);
  const hasDuplicateProducts = new Set(compProductIds).size < compProductIds.length;
  const duplicateSlots = getColorMixDuplicateSlots();
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients && !hasDuplicateProducts;
  const breakdown = calculateColorMixPriceBreakdown(s);
  const grandTotal = breakdown.grandTotal;

  const activeRecipe = (Number(s.selectedPresetIndex) >= 0 && COLOR_RECIPE_PRESETS[s.selectedPresetIndex])
    ? COLOR_RECIPE_PRESETS[s.selectedPresetIndex]
    : null;
  const recipeSearchVal = s.presetSearch || '';

  return `
  <div class="cm-studio-layout">
<!-- LEFT COLUMN (55%): A. Mixed Color Catalog + B. Selected Color Formula (Read-Only) -->
<div class="cm-col-left">
  <!-- A. Mixed Color Catalog -->
  <div class="cm-card cm-ready-recipes-card">
    <div class="cm-card-title cm-presets-header">
      <div class="cm-title-group">
        <span>🎨 Mixed Color Catalog</span>
        <span class="cm-count-pill">${COLOR_RECIPE_PRESETS.length}</span>
      </div>
      <div class="cm-presets-toolbar">
        <div class="cm-preset-search-wrap" style="min-width:190px;">
          <span class="cm-preset-search-icon" aria-hidden="true">🔍</span>
          <input id="cm-preset-search" type="text" class="cm-preset-search-input" style="width:100%;" value="${escapeHtml(recipeSearchVal)}" placeholder="Search color or HEX..." oninput="onColorMixPresetSearch(this.value)" aria-label="Search Mixed Color Catalog">
          <button id="cm-preset-search-clear" type="button" class="cm-preset-search-clear" onclick="clearColorMixPresetSearch()" style="display:${recipeSearchVal.trim() ? 'inline-flex' : 'none'};" title="Clear search">&times;</button>
        </div>
      </div>
    </div>

    <div id="cm-preset-chips-wrap" class="cm-preset-chips-wrap">
      ${renderColorMixPresetChipsHtml()}
    </div>
    <div id="cm-preset-shortage-alert" style="display:none; margin-top:8px;"></div>
  </div>

  <!-- B. Selected Color Formula (Read-Only / Customizable) -->
  <div class="cm-card">
    <div class="cm-card-title" style="flex-wrap:wrap; gap:8px; justify-content:space-between;">
      <div class="cm-title-group">
        <span>🧪 Selected Color Formula</span>
        ${s.isCustomizingFormula
          ? `<span class="cm-formula-status-pill is-editing">✏️ Editing Formula</span>`
          : (s.isCustomizedFormula
            ? `<span class="cm-formula-status-pill is-custom">✨ Customized Formula</span>`
            : `<span class="cm-formula-status-pill is-readonly">🔒 Read-Only</span>`)}
      </div>
      <div class="cm-formula-header-actions">
        ${s.isCustomizingFormula ? `
          <button type="button" id="cm-cancel-custom-formula-btn" class="cm-customize-cancel-btn" onclick="cancelCustomizeColorMixFormula()">Cancel</button>
          <button type="button" id="cm-save-custom-formula-btn" class="cm-customize-save-btn" onclick="saveCustomizeColorMixFormula()" ${(!isPctBalanced || !hasMinTwoIngredients || hasDuplicateProducts || s.components.some(c => !c.productId || Number(c.pct) <= 0)) ? 'disabled' : ''}>✓ Save Custom Formula</button>
        ` : `
          ${s.isCustomizedFormula && Number(s.originalPresetIndex) >= 0 ? `
            <button type="button" id="cm-reset-original-formula-btn" class="cm-customize-cancel-btn" onclick="resetCustomFormulaToOriginal()" title="Restore untouched catalog formula">↺ Original</button>
          ` : ''}
          <button type="button" id="cm-customize-formula-btn" class="cm-customize-btn" onclick="startCustomizeColorMixFormula()">✏️ Customize Formula</button>
        `}
      </div>
    </div>

    ${(activeRecipe || s.originalCatalogName) ? `
      <div class="cm-selected-recipe-banner">
        <span id="cm-banner-color-dot" class="cm-color-dot" style="background:${escapeAttr(mixed.hex)}; width:14px; height:14px;"></span>
        <span id="cm-banner-formula-meta">
          <b>${escapeHtml(s.isCustomizedFormula ? (s.colorName || ((s.originalCatalogName || (activeRecipe && (activeRecipe.cleanName || activeRecipe.name)) || 'Custom Mix') + ' (Custom)')) : ((activeRecipe && (activeRecipe.cleanName || activeRecipe.name)) || s.originalCatalogName || s.colorName))}</b>
          ${s.isCustomizedFormula && s.originalCatalogName ? `<span class="muted" style="font-size:10.5px;">(Based on: ${escapeHtml(s.originalCatalogName)})</span>` : ''}
          · <code>${escapeHtml(mixed.hex)}</code> · ${s.components.length} Ingredients (${totalPctRounded}%)
        </span>
      </div>
    ` : ''}

    ${s.isCustomizingFormula ? (() => {
      const hasInvalidZero = s.components.some(c => !c.productId || isNaN(Number(c.pct)) || Number(c.pct) <= 0);
      const isToolbarValid = isPctBalanced && !hasInvalidZero && !hasDuplicateProducts && hasMinTwoIngredients;
      const diff = Math.round(Math.abs(100 - totalPctRounded) * 10) / 10;
      let valMsg = '✓ Total: 100% — Ready to save custom formula';
      if (hasDuplicateProducts) {
        valMsg = '⚠️ Duplicate ingredient detected — each pigment must be unique';
      } else if (hasInvalidZero) {
        valMsg = '⚠️ Every ingredient must have a percentage greater than 0%';
      } else if (!isPctBalanced) {
        valMsg = totalPctRounded < 100
          ? `⚠️ Total: ${totalPctRounded}% — Add ${diff}% more to reach 100%`
          : `⚠️ Total: ${totalPctRounded}% — Reduce by ${diff}% to reach 100%`;
      }
      return `
      <div id="cm-customize-toolbar" class="cm-customize-toolbar ${isToolbarValid ? 'is-valid' : 'is-invalid'}">
        <div id="cm-customize-validation-msg" class="cm-customize-validation-msg">${valMsg}</div>
        <div class="cm-customize-toolbar-btns">
          <button type="button" class="cm-customize-cancel-btn" onclick="balanceColorMixTo100()" title="Scale percentages proportionally to 100%">⚖️ Auto-Balance</button>
          <button type="button" id="cm-add-ingredient-btn" class="cm-customize-btn" onclick="openAddCustomIngredientPicker()">+ Add Ingredient</button>
        </div>
      </div>`;
    })() : ''}

    <!-- Segmented Visual Recipe Bar -->
    <div id="cm-recipe-bar" class="cm-recipe-bar" title="Recipe Color Breakdown" style="margin-bottom:10px;">
      ${s.components.map((c, idx) => `
        <div id="cm-recipe-seg-${idx}" class="cm-recipe-segment" style="width:${Math.max(0, Math.min(100, c.pct))}%; background-color:${c.hex || '#FFFFFF'};" title="${escapeHtml(c.name)}: ${c.pct}%">
          <span>${c.pct >= 7 ? `${Math.round(c.pct)}%` : ''}</span>
        </div>
      `).join('')}
    </div>

    <!-- Ingredient Breakdown List (Original Protected + Custom Added) -->
    <div id="cm-ingredients-list" class="cm-ingredients-grid">
      ${s.components.map((c, idx) => {
    const reqLiters = Number(((s.totalLiters * (c.pct / 100)) || 0).toFixed(2));
    const reqMl = Math.round((s.totalLiters * (c.pct / 100)) * 1000);
    const prodObj = c.productId ? productById(c.productId) : null;
    const availStock = prodObj && typeof productMixAvailableStock === 'function' ? productMixAvailableStock(prodObj) : (Number(c.stock) || 0);
    const openedAvail = prodObj ? productOpenedStock(prodObj) : 0;
    const prefCan = Number(c.preferredCanSize) || 0;
    const mixPlan = prodObj ? previewColorMixConsumption(prodObj, reqLiters, prefCan) : null;
    const hasStock = prodObj ? availStock + 1e-6 >= reqLiters : c.stock >= reqLiters;
    const isDup = duplicateSlots.has(idx + 1);
    const isBase = isBasePaintComponent(c, idx, s.components);
    const isOrig = c.isOriginal !== false;
    return `
        <div class="cm-ingredient-item ${!hasStock ? 'is-low-stock' : ''}" id="cm-ing-item-${idx}" style="padding:10px 12px; margin-bottom:0; ${isDup ? 'border:1.5px solid var(--danger-border); background:var(--danger-bg);' : ''}">
          <div class="cm-ing-grid" style="grid-template-columns: auto 1fr auto;">
            <!-- Product Color Swatch -->
            <div class="cm-swatch-display" id="cm-swatch-box-${idx}" style="background-color:${c.hex || '#FFFFFF'};" title="${escapeHtml(c.name || 'Ingredient')} · ${c.hex || '#FFFFFF'}">
              <span class="cm-swatch-shine"></span>
            </div>

            <!-- Ingredient Info -->
            <div style="min-width:0; flex:1;">
              <div class="row" style="gap:6px; align-items:center; flex-wrap:wrap;">
                <span class="badge" style="background:${isBase ? 'var(--teal)' : '#7B1FA2'}; color:#fff; font-size:9.5px; padding:1px 6px;">#${idx + 1} ${isBase ? 'Base' : 'Pigment'}</span>
                <strong style="font-size:13px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(prodObj ? prodObj.name : (c.name || 'Missing Inventory Paint'))}</strong>
                <span class="badge" style="background:var(--surface-3); color:var(--ink-soft); font-size:10px; padding:1px 6px;">${escapeHtml(prodObj && prodObj.type ? prodObj.type : 'Paint')}</span>
                ${isOrig
                  ? `<span class="cm-protected-badge" title="Original catalog ingredient — protected and cannot be removed">🔒 Original</span>`
                  : `<span class="cm-added-badge" title="Added during customization — can be removed">✨ Added</span>`}
              </div>
              <div class="muted" style="font-size:11px; margin-top:3px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <span>${escapeHtml(prodObj ? prodObj.brand : (c.brand || 'No Brand'))} · ${peso(c.price)}/L</span>
                ${openedAvail > 0
        ? `<span style="color:var(--warning-text); font-weight:600;">🫙 ${productOpenedSizesLabel(prodObj)} opened</span>`
        : `<span id="cm-stock-badge-${idx}" class="${hasStock ? '' : 'low'}" style="color:${hasStock ? 'var(--teal-dark)' : 'var(--danger)'}; font-weight:600;">${hasStock ? `🥫 ${formatStock(availStock)}L avail` : `⚠️ Low: ${formatStock(availStock)}L`}</span>`}
              </div>
            </div>

            <!-- Percentage & Quantity Display (Editable while Customizing, Locked otherwise) -->
            ${s.isCustomizingFormula ? `
              <div class="cm-edit-pct-box">
                <div class="cm-edit-pct-controls">
                  <div class="cm-edit-pct-input-wrap">
                    <input id="cm-pct-input-${idx}" class="cm-edit-pct-input" type="number" min="0.1" max="100" step="1" value="${c.pct}" oninput="onCustomizePctInput(${idx}, this)" onchange="onCustomizePctCommit(${idx}, this)" aria-label="Percentage for ${escapeAttr(c.name || 'Ingredient')}">
                    <span class="cm-edit-pct-unit">%</span>
                  </div>
                  ${!isOrig ? `
                    <button type="button" class="cm-remove-ing-btn" onclick="removeColorMixIngredient(${idx})" title="Remove newly added ingredient" aria-label="Remove ${escapeAttr(c.name || 'Ingredient')}">✕</button>
                  ` : ''}
                </div>
                <div class="cm-readonly-qty-val"><b id="cm-req-liters-${idx}">${formatStock(reqLiters)}L</b> (<span id="cm-req-ml-${idx}">${reqMl}</span> mL)</div>
              </div>
            ` : `
              <div class="cm-readonly-pct-box" title="${s.isCustomizedFormula ? 'Saved custom formula ratio' : 'Locked recipe ratio (read-only)'}">
                <div class="cm-readonly-pct-val">${c.pct}%</div>
                <div class="cm-readonly-qty-val"><b id="cm-req-liters-${idx}">${formatStock(reqLiters)}L</b> (<span id="cm-req-ml-${idx}">${reqMl}</span> mL)</div>
              </div>
            `}
          </div>

          <!-- Compact Volume & Container Source Row -->
          <div class="row" style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--line); font-size:10.5px; color:var(--ink-soft); justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span id="cm-mix-source-${idx}" style="color:var(--teal-dark); font-weight:500;">${formatColorMixSourcePreview(mixPlan)}</span>
            <div class="row wrap" style="gap:3px; align-items:center;">
              <span class="muted" style="font-size:10px;">Container:</span>
              <button type="button" class="cm-preset-btn ${prefCan === 0 ? 'active' : ''}" style="font-size:9.5px; padding:1px 5px;" onclick="setColorMixPreferredCanSize(${idx}, 0)" title="Automatically choose the best-fitting available container size">Auto</button>
              ${(prodObj ? productSizes(prodObj) : CAN_SIZES).map(sz => {
          const hasBd = prodObj ? productHasCanBreakdown(prodObj) : false;
          const cnt = prodObj ? productCanCount(prodObj, sz) : 0;
          const avail = prodObj ? (hasBd ? cnt > 0 : prodObj.stock >= sz) : false;
          return `<button type="button" class="cm-preset-btn ${prefCan === sz ? 'active' : ''}" style="font-size:9.5px; padding:1px 5px; ${!avail ? 'opacity:0.4;' : ''}" ${!avail ? 'disabled' : ''} onclick="setColorMixPreferredCanSize(${idx}, ${sz})" title="${hasBd ? `${cnt} × ${sz}L sealed unit(s) in stock` : `Open a ${sz}L container`}">${sz}L${hasBd ? ` (${cnt})` : ''}</button>`;
        }).join('')}
            </div>
          </div>
        </div>`;
  }).join('')}
    </div>

    <!-- Formula Footer -->
    <div class="row wrap" style="gap:6px; margin-top:10px; padding-top:8px; border-top:1px solid var(--line); justify-content:space-between; align-items:center;">
      <small class="muted">${s.isCustomizingFormula ? '🔒 Original ingredients are protected and cannot be removed. Total must equal 100%.' : (s.isCustomizedFormula ? '✨ Custom formula active. Original catalog recipe remains unchanged.' : 'Ingredient ratios are locked by default. Click "Customize Formula" to adjust or add pigments.')}</small>
      <small id="cm-total-pct-summary" style="font-weight:700; color:${isPctBalanced ? 'var(--teal-dark)' : 'var(--danger)'};">${isPctBalanced ? '✓ 100% Total Formula' : `⚠️ Total: ${totalPctRounded}%`}</small>
    </div>
  </div>
</div>

<!-- RIGHT COLUMN (45%): C. Color Preview + D. Finalize Mixed Color -->
<div class="cm-col-right">
  <div class="cm-result-card">
    
    <!-- Interactive Glass Mixing Beaker / Canister Widget -->
    <div class="cm-beaker-box">
      <div class="cm-beaker-flask" id="cm-beaker-flask" title="Liquid Volume Breakdown">
        <div class="cm-beaker-marks">
          <span class="cm-beaker-mark" title="100%"></span>
          <span class="cm-beaker-mark" title="75%"></span>
          <span class="cm-beaker-mark" title="50%"></span>
          <span class="cm-beaker-mark" title="25%"></span>
        </div>
        ${s.components.map((c, idx) => `
          <div id="cm-beaker-layer-${idx}" class="cm-beaker-layer" style="height:${Math.max(0, Math.min(100, c.pct))}%; background-color:${c.hex || '#FFFFFF'};" title="${escapeHtml(c.name)} (${c.pct}%)"></div>
        `).join('')}
      </div>
      <div class="cm-beaker-summary">
        <div style="font-weight:700; color:var(--ink); font-size:12.5px; display:flex; align-items:center; justify-content:space-between;">
          <span>🧪 Liquid Pigment Blend</span>
          <code id="cm-beaker-hex" style="font-weight:700; color:var(--teal-text); font-size:11px;">${mixed.hex}</code>
        </div>
        <div class="muted">
          Volume: <b id="cm-beaker-volume">${s.totalLiters} Liter${s.totalLiters === 1 ? '' : 's'}</b> · Total Components: <b>${s.components.length}</b>
        </div>
        <div id="cm-beaker-chips" class="row wrap" style="gap:4px; margin-top:2px;">
          ${s.components.map((c, idx) => `
            <span id="cm-beaker-pct-${idx}" class="badge" style="font-size:10px; padding:1px 5px; background:var(--surface); border:1px solid var(--line);">
              <span class="cm-color-dot" style="background:${c.hex}; width:8px; height:8px; margin-right:3px;"></span>
              ${c.pct}%
            </span>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Live Mixed Swatch Preview Hero with Agitation and Swirl FX -->
    <div id="cm-swatch-hero" class="cm-mixed-swatch-hero" style="background-color: ${mixed.hex};">
      <div class="cm-swirl-indicator"></div>
      <div class="cm-mixing-badge">
        <span style="display:inline-block; animation:spin 1s linear infinite;">🌀</span> Live Blending
      </div>
    </div>

    <!-- Detection & Specs Card -->
    <div class="cm-detected-box">
      <div class="cm-detected-header">
        <span>Color Identification &amp; Tone</span>
        <span style="display:inline-flex; align-items:center; gap:6px;">
          <code id="cm-detected-hex" style="font-size:11px; font-weight:700; color:var(--teal-dark); background:var(--teal-tint); padding:1px 6px; border-radius:5px;">${mixed.hex}</code>
          <span id="cm-detected-rgb" class="muted" style="font-size:10.5px;">rgb(${mixed.r}, ${mixed.g}, ${mixed.b})</span>
          <button class="btn ghost small" onclick="copyHexToClipboard(colorMixStudioState.cachedHex || '${mixed.hex}')" style="font-size:10.5px; padding:1px 5px; color:var(--teal-text);" title="Copy Hex Code">📋 Copy Hex</button>
        </span>
      </div>
      <div class="cm-detected-title">
        <span id="cm-detected-dot" class="cm-color-dot" style="background:${mixed.hex}; width:16px; height:16px;"></span>
        <span id="cm-detected-title-text" style="flex:1;">${escapeHtml(detected.name)}</span>
      </div>
      <div id="cm-tone-info" class="muted small" style="margin-top:4px; font-size:11px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span>Tone: <b>${detected.family}</b> · <span id="cm-approx-badge" style="color:var(--teal-dark); font-weight:600;">${mixed.isDigitalApproximation ? 'Digital Approx. (Kubelka-Munk)' : 'Physical Pigment Data'}</span></span>
        ${typeof detected.similarityPct === 'number' ? `<span id="cm-match-confidence" class="badge ${detected.confidence === 'exact' || detected.confidence === 'high' ? 'ok' : (detected.confidence === 'medium' ? 'mid' : 'low')}" style="font-size:10px; padding:1px 6px;" title="Perceptual CIELAB ΔE = ${detected.deltaE}">${escapeHtml(detected.matchLabel)} (${detected.similarityPct}%)</span>` : ''}
      </div>
      <div class="cl-approx-note" style="margin-top:8px; padding:7px 10px; font-size:11px;">
        <span style="flex-shrink:0;">ℹ️</span>
        <span><strong>Reference Note:</strong> Screen preview and pigment ratios are digital approximations only. Actual physical paint color may vary by brand, base type, and tinting strength.</span>
      </div>
    </div>

    <!-- Service & Sale Inputs -->
    <div class="form-grid" style="text-align:left; gap:8px;">
      <div class="field full">
        <label for="cm-color-name" style="font-size:12px; font-weight:700;">Formula / Color Name <span style="color:var(--danger);">*</span></label>
        <input id="cm-color-name" type="text" value="${escapeHtml(s.colorName)}" oninput="colorMixStudioState.colorName=this.value; colorMixStudioState.userCustomizedName=true;" placeholder="e.g. ${escapeHtml(detected.name)}" required>
      </div>

      <div class="field full">
        <label style="font-size:12px; font-weight:700;">Container Size &amp; Volume:</label>
        <div class="cm-can-grid">
          <button class="cm-can-btn ${s.totalLiters === 0.5 ? 'active' : ''}" type="button" onclick="onColorMixTotalLitersChange(0.5)">
            <div>🧴 0.5 L</div>
            <div style="font-size:9.5px; opacity:0.85;">Sample</div>
          </button>
          <button class="cm-can-btn ${s.totalLiters === 1 ? 'active' : ''}" type="button" onclick="onColorMixTotalLitersChange(1)">
            <div>🥫 1.0 L</div>
            <div style="font-size:9.5px; opacity:0.85;">1 Quart</div>
          </button>
          <button class="cm-can-btn ${s.totalLiters === 4 ? 'active' : ''}" type="button" onclick="onColorMixTotalLitersChange(4)">
            <div>🪣 4.0 L</div>
            <div style="font-size:9.5px; opacity:0.85;">1 Gallon</div>
          </button>
          <button class="cm-can-btn ${s.totalLiters === 16 ? 'active' : ''}" type="button" onclick="onColorMixTotalLitersChange(16)">
            <div>🛢️ 16 L</div>
            <div style="font-size:9.5px; opacity:0.85;">1 Pail</div>
          </button>
        </div>
        <div class="row" style="margin-top:6px; gap:8px; align-items:center;">
          <span class="muted small" style="font-size:11.5px;">Custom Volume:</span>
          <input id="cm-liters" type="number" min="0.5" step="0.5" style="width:80px; padding:4px 6px; font-weight:700;" value="${s.totalLiters}" onchange="onColorMixTotalLitersChange(this.value, true)" onblur="onColorMixTotalLitersChange(this.value, true)" oninput="onColorMixTotalLitersChange(this.value, false)" onkeydown="if(event.key === '-' || event.key === 'e' || event.key === 'E') event.preventDefault();" required>
          <span class="muted small">Liters</span>
        </div>
      </div>

      <div class="field">
        <label for="cm-price" style="font-size:12px; font-weight:700;">Price per Liter (₱)</label>
        <input id="cm-price" type="number" min="0" step="any" value="${s.pricePerLiter}" oninput="onColorMixPriceLive(this.value)" onchange="onColorMixPriceChange(this.value)" required>
        <small id="cm-price-helper" class="muted" style="display:block; margin-top:2px; font-size:10.5px;">${s.userCustomizedPrice ? `Custom price applied · <a href="javascript:void(0)" onclick="resetColorMixPriceToAuto()" style="color:var(--teal-text); font-weight:600; text-decoration:underline;">Reset to auto</a>` : 'Auto-calculated base materials + ₱50 service fee'}</small>
      </div>

      <div class="field">
        <label for="cm-base-type" style="font-size:12px; font-weight:700;">Base Paint Type</label>
        <select id="cm-base-type" onchange="colorMixStudioState.baseType=this.value;">
          ${(() => {
      const invTypes = getInventoryBasePaintTypes();
      if (invTypes.length > 0 && !invTypes.includes(s.baseType)) {
        s.baseType = invTypes[0];
      }
      return invTypes.map(bt => `<option value="${escapeHtml(bt)}" ${s.baseType === bt ? 'selected' : ''}>${escapeHtml(bt)}</option>`).join('');
    })()}
        </select>
      </div>

      <div class="field full">
        <label style="font-size:12px; font-weight:700;">Desired Finish / Sheen Tag:</label>
        <div class="row wrap" id="cm-sheen-btn-group" role="radiogroup" aria-label="Desired Finish / Sheen Tag" style="gap:4px; margin-bottom:4px;">
          ${(() => {
      const activeSheen = getActiveColorMixSheen(s);
      const sheenButtons = [
        { key: 'High Gloss', label: '✨ High Gloss' },
        { key: 'Semi-Gloss', label: '🌟 Semi-Gloss' },
        { key: 'Satin', label: '🎨 Satin' },
        { key: 'Matte', label: '🛡️ Matte' },
        { key: 'Metallic', label: '💎 Metallic' }
      ];
      return sheenButtons.map(b => `
              <button class="cm-preset-btn cm-sheen-btn ${activeSheen === b.key ? 'active' : ''}" data-sheen="${b.key}" aria-pressed="${activeSheen === b.key ? 'true' : 'false'}" type="button" onclick="applyFinishPreset('${b.key}')">${b.label}</button>
            `).join('');
    })()}
        </div>
        <input id="cm-note" type="text" value="${escapeHtml(s.note)}" oninput="onColorMixNoteInput(this.value)" placeholder="e.g. Matched to customer bumper, High Gloss finish">
      </div>
    </div>

    <!-- Detailed Price Breakdown & Estimated Total Card -->
    <div id="cm-price-breakdown-card" class="cm-price-breakdown-card">
      ${renderColorMixPriceBreakdownHtml(s, breakdown, true)}
    </div>
  </div>
</div>
  </div>
  ${s.openPickerIdx !== -1 ? renderColorMixOffcanvasDrawerHtml(colorMixModalProducts()) : ''}`;
}

// -----------------------------------------------------------------------------------
// HIGH-PERFORMANCE REALTIME COLOR MIX SYNCHRONIZER
// Updates swatches, sliders, inputs, beakers, meter and badges WITHOUT DOM teardown!
// -----------------------------------------------------------------------------------
function syncColorMixVisuals(activeIdx = -1, skipPresetRefresh = false) {
  updateColorMixCalculation(false);
  const s = colorMixStudioState;
  const mixed = subtractivePaintMix(s.components);
  s.cachedHex = mixed.hex;
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  const totalPct = s.components.reduce((sum, c) => sum + (Number(c.pct) || 0), 0);
  const totalPctRounded = Math.round(totalPct * 10) / 10;
  const isPctBalanced = Math.abs(totalPct - 100) < 0.05;
  const activeIngCount = s.components.filter(c => c.productId && Number(c.pct) > 0).length;
  const hasMinTwoIngredients = activeIngCount >= 2;
  const compProductIds = s.components.map(c => c.productId).filter(Boolean);
  const hasDuplicateProducts = new Set(compProductIds).size < compProductIds.length;
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients && !hasDuplicateProducts;
  const breakdown = calculateColorMixPriceBreakdown(s);
  const grandTotal = breakdown.grandTotal;

  // 1. Swatch Hero & active agitation animation
  const hero = document.getElementById('cm-swatch-hero');
  if (hero) {
    hero.style.backgroundColor = mixed.hex;
    hero.classList.add('active-mixing');
    if (window.cmMixingTimeout) clearTimeout(window.cmMixingTimeout);
    window.cmMixingTimeout = setTimeout(() => {
      const h = document.getElementById('cm-swatch-hero');
      if (h) h.classList.remove('active-mixing');
    }, 450);
  }

  // 2. Detection badges, title, dot, and tone
  const pillName = document.getElementById('cm-detected-pill-name');
  if (pillName) pillName.textContent = detected.name;
  const titleText = document.getElementById('cm-detected-title-text');
  if (titleText) titleText.textContent = detected.name;
  const dot = document.getElementById('cm-detected-dot');
  if (dot) dot.style.background = mixed.hex;
  const beakerHex = document.getElementById('cm-beaker-hex');
  if (beakerHex) beakerHex.textContent = mixed.hex;
  const detectedHex = document.getElementById('cm-detected-hex');
  if (detectedHex) detectedHex.textContent = mixed.hex;
  const detectedRgb = document.getElementById('cm-detected-rgb');
  if (detectedRgb) detectedRgb.textContent = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
  const toneInfo = document.getElementById('cm-tone-info');
  if (toneInfo) {
    const confBadge = typeof detected.similarityPct === 'number'
      ? `<span id="cm-match-confidence" class="badge ${detected.confidence === 'exact' || detected.confidence === 'high' ? 'ok' : (detected.confidence === 'medium' ? 'mid' : 'low')}" style="font-size:10px; padding:1px 6px;" title="Perceptual CIELAB ΔE = ${detected.deltaE}">${escapeHtml(detected.matchLabel)} (${detected.similarityPct}%)</span>`
      : '';
    toneInfo.innerHTML = `<span>Tone: <b>${detected.family}</b> · <span id="cm-approx-badge" style="color:var(--teal-dark); font-weight:600;">${mixed.isDigitalApproximation ? 'Digital Approx. (Kubelka-Munk)' : 'Physical Pigment Data'}</span></span>${confBadge}`;
  }
  const mixVarsEl = document.getElementById('cm-mix-variations');
  if (mixVarsEl) {
    const vars = computeColorMixVariations(mixed.hex);
    mixVarsEl.innerHTML = `
      <span class="muted" style="font-weight:600;">Variations:</span>
      <span style="display:inline-flex; align-items:center; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:2px 7px;" title="Lighter (+20% White Tint)">
        <span style="width:11px; height:11px; border-radius:3px; background:${vars.lighter.hex}; border:1px solid rgba(0,0,0,0.18);"></span>
        <span>Lighter <code>${vars.lighter.hex}</code></span>
      </span>
      <span style="display:inline-flex; align-items:center; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:2px 7px;" title="Darker (+15% Black Shade)">
        <span style="width:11px; height:11px; border-radius:3px; background:${vars.darker.hex}; border:1px solid rgba(0,0,0,0.18);"></span>
        <span>Darker <code>${vars.darker.hex}</code></span>
      </span>
    `;
  }

  // 3. Formula name input (if not customized by user)
  if (!s.userCustomizedName) {
    s.colorName = detected.name;
    const nameInput = document.getElementById('cm-color-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = detected.name;
  }

  // 4. Price recommendation (if not customized by user)
  if (!s.userCustomizedPrice) {
    const priceInput = document.getElementById('cm-price');
    if (priceInput && document.activeElement !== priceInput) priceInput.value = s.pricePerLiter;
  }
  const priceHelper = document.getElementById('cm-price-helper');
  if (priceHelper) {
    priceHelper.innerHTML = s.userCustomizedPrice
      ? `Custom price applied · <a href="javascript:void(0)" onclick="resetColorMixPriceToAuto()" style="color:var(--teal-text); font-weight:600; text-decoration:underline;">Reset to auto</a>`
      : 'Auto-calculated base materials + ₱50 service fee';
  }

  // 5. Detailed price breakdown & Grand total updates
  const cardEl = document.getElementById('cm-price-breakdown-card');
  if (cardEl) {
    const prevDetails = document.getElementById('cm-ingredients-details');
    const wasOpen = prevDetails ? prevDetails.open : true;
    cardEl.innerHTML = renderColorMixPriceBreakdownHtml(s, breakdown, wasOpen);
  }
  const submitBtn = document.getElementById('cm-submit-btn');
  if (submitBtn) {
    const isPos = s.isPosMode !== false;
    submitBtn.innerHTML = isPos
      ? `+ Add ${s.totalLiters}L Mixed Color (${peso(grandTotal)}) to Sale`
      : `✓ Confirm & Log ${s.totalLiters}L Movement (${peso(grandTotal)})`;
  }

  // 6. Balance badges, Auto-Balance button, and Live Balance Meter
  const balBadge = document.getElementById('cm-balance-badge');
  if (balBadge) {
    balBadge.className = `badge ${isPctBalanced ? 'ok' : 'low'}`;
    balBadge.textContent = isPctBalanced ? '🎉 100% Balanced Recipe' : `⚠️ Total: ${totalPctRounded}% (${totalPctRounded > 100 ? (Math.round((totalPctRounded - 100) * 10) / 10) + '% Over' : (Math.round((100 - totalPctRounded) * 10) / 10) + '% Needed'})`;
  }
  const autoSlot = document.getElementById('cm-autobalance-slot');
  if (autoSlot) {
    autoSlot.innerHTML = !isPctBalanced ? `<button class="btn ghost small" onclick="balanceColorMixTo100()" style="font-size:11px; padding:3px 8px; font-weight:700; color:var(--teal-text);">🎯 Auto-Balance</button>` : '';
  }
  const meterText = document.getElementById('cm-meter-text');
  if (meterText) {
    meterText.textContent = `${totalPctRounded}% / 100%`;
    meterText.style.color = isPctBalanced ? 'var(--teal)' : (totalPctRounded > 100 ? 'var(--danger)' : 'var(--warning-dark, #8A5A24)');
  }
  const meterFill = document.getElementById('cm-balance-meter-fill');
  if (meterFill) {
    meterFill.style.width = `${Math.min(100, Math.max(0, totalPctRounded))}%`;
    meterFill.style.background = isPctBalanced ? '#2E7D32' : (totalPctRounded > 100 ? '#D32F2F' : '#F57C00');
  }

  // 7. Per-component updates: sliders, number inputs, pills, recipe bar, beaker layers, required liters, stock badge
  s.components.forEach((c, i) => {
    const pct = Number(c.pct) || 0;
    const reqLiters = Number(((s.totalLiters * (pct / 100)) || 0).toFixed(2));
    const prodObj = c.productId ? productById(c.productId) : null;
    const availStock = prodObj && typeof productMixAvailableStock === 'function' ? productMixAvailableStock(prodObj) : (Number(c.stock) || 0);
    const hasStock = availStock + 1e-6 >= reqLiters;
    const fillPct = Math.max(0, Math.min(100, pct));

    // Range slider value and gradient track
    const slider = document.getElementById(`cm-slider-${i}`);
    if (slider) {
      if (document.activeElement !== slider && Number(slider.value) !== pct) {
        slider.value = pct;
      }
      slider.style.setProperty('--thumb-color', c.hex || '#1F6F6B');
      slider.style.background = `linear-gradient(to right, ${c.hex || '#1F6F6B'} 0%, ${c.hex || '#1F6F6B'} ${fillPct}%, var(--line) ${fillPct}%, var(--line) 100%)`;
    }

    // Number input (only update if NOT currently focused, preserving user typing cursor and input state!)
    const input = document.getElementById(`cm-pct-input-${i}`);
    if (input && document.activeElement !== input) {
      if (Number(input.value) !== pct) input.value = pct;
    }

    // Percentage pill badge on slider with micro-scaling pulse
    const pill = document.getElementById(`cm-slider-pct-pill-${i}`);
    if (pill) {
      pill.textContent = `${pct}%`;
      pill.style.background = c.hex || '#1F6F6B';
      pill.style.color = isLightColor(c.hex || '#1F6F6B') ? '#1C1917' : '#FFFFFF';
      if (activeIdx === i) {
        pill.style.transform = 'scale(1.15)';
        if (pill._scaleTimer) clearTimeout(pill._scaleTimer);
        pill._scaleTimer = setTimeout(() => { pill.style.transform = 'scale(1)'; }, 220);
      }
    }

    // Recipe Bar segment
    const seg = document.getElementById(`cm-recipe-seg-${i}`);
    if (seg) {
      seg.style.width = `${fillPct}%`;
      seg.style.backgroundColor = c.hex || '#FFFFFF';
      seg.title = `${c.name}: ${pct}%`;
      seg.innerHTML = `<span>${pct >= 7 ? `${Math.round(pct)}%` : ''}</span>`;
    }

    // Beaker liquid layer
    const layer = document.getElementById(`cm-beaker-layer-${i}`);
    if (layer) {
      layer.style.height = `${fillPct}%`;
      layer.style.backgroundColor = c.hex || '#FFFFFF';
      layer.title = `${c.name} (${pct}%)`;
    }

    // Beaker summary chip
    const chip = document.getElementById(`cm-beaker-pct-${i}`);
    if (chip) {
      chip.innerHTML = `<span class="cm-color-dot" style="background:${c.hex}; width:8px; height:8px; margin-right:3px;"></span>${pct}%`;
    }

    // Required liters, mL, low-stock card state & Stock badge
    const reqMl = Math.round(((s.totalLiters * (pct / 100)) || 0) * 1000);
    const reqEl = document.getElementById(`cm-req-liters-${i}`);
    if (reqEl) reqEl.innerHTML = `${formatStock(reqLiters)}L`;
    const reqMlEl = document.getElementById(`cm-req-ml-${i}`);
    if (reqMlEl) reqMlEl.textContent = String(reqMl);
    const ingCard = document.getElementById(`cm-ing-item-${i}`);
    if (ingCard) ingCard.classList.toggle('is-low-stock', !hasStock);
    const srcEl = document.getElementById(`cm-mix-source-${i}`);
    if (srcEl) {
      const prodObj = c.productId ? productById(c.productId) : null;
      const mixPlan = prodObj ? previewColorMixConsumption(prodObj, reqLiters, Number(c.preferredCanSize) || 0) : null;
      srcEl.innerHTML = formatColorMixSourcePreview(mixPlan);
    }
    const stockBadge = document.getElementById(`cm-stock-badge-${i}`);
    if (stockBadge) {
      stockBadge.style.color = hasStock ? 'var(--teal-dark)' : 'var(--danger)';
      stockBadge.innerHTML = hasStock ? `🥫 ${formatStock(availStock)}L avail` : `⚠️ Low: ${formatStock(availStock)}L`;
    }
  });

  // 7b. Live Customize Formula status bar, Save button, banner & total summary
  const hasInvalidZero = s.components.some(c => !c.productId || isNaN(Number(c.pct)) || Number(c.pct) <= 0);
  const canSaveCustom = isPctBalanced && !hasInvalidZero && !hasDuplicateProducts && hasMinTwoIngredients;
  const totalSummaryEl = document.getElementById('cm-total-pct-summary');
  if (totalSummaryEl) {
    totalSummaryEl.style.color = isPctBalanced ? 'var(--teal-dark)' : 'var(--danger)';
    totalSummaryEl.textContent = isPctBalanced ? '✓ 100% Total Formula' : `⚠️ Total: ${totalPctRounded}%`;
  }
  const bannerDot = document.getElementById('cm-banner-color-dot');
  if (bannerDot) bannerDot.style.background = mixed.hex;
  const bannerMeta = document.getElementById('cm-banner-formula-meta');
  if (bannerMeta) {
    const activeRec = (Number(s.selectedPresetIndex) >= 0 && COLOR_RECIPE_PRESETS[s.selectedPresetIndex]) ? COLOR_RECIPE_PRESETS[s.selectedPresetIndex] : null;
    const displayName = s.isCustomizedFormula
      ? (s.colorName || ((s.originalCatalogName || (activeRec && (activeRec.cleanName || activeRec.name)) || 'Custom Mix') + ' (Custom)'))
      : ((activeRec && (activeRec.cleanName || activeRec.name)) || s.originalCatalogName || s.colorName);
    bannerMeta.innerHTML = `<b>${escapeHtml(displayName)}</b>${s.isCustomizedFormula && s.originalCatalogName ? ` <span class="muted" style="font-size:10.5px;">(Based on: ${escapeHtml(s.originalCatalogName)})</span>` : ''} · <code>${escapeHtml(mixed.hex)}</code> · ${s.components.length} Ingredients (${totalPctRounded}%)`;
  }
  const custToolbar = document.getElementById('cm-customize-toolbar');
  if (custToolbar) {
    custToolbar.classList.toggle('is-valid', canSaveCustom);
    custToolbar.classList.toggle('is-invalid', !canSaveCustom);
  }
  const custMsg = document.getElementById('cm-customize-validation-msg');
  if (custMsg) {
    const diff = Math.round(Math.abs(100 - totalPctRounded) * 10) / 10;
    if (hasDuplicateProducts) {
      custMsg.textContent = '⚠️ Duplicate ingredient detected — each pigment must be unique';
    } else if (hasInvalidZero) {
      custMsg.textContent = '⚠️ Every ingredient must have a percentage greater than 0%';
    } else if (!isPctBalanced) {
      custMsg.textContent = totalPctRounded < 100
        ? `⚠️ Total: ${totalPctRounded}% — Add ${diff}% more to reach 100%`
        : `⚠️ Total: ${totalPctRounded}% — Reduce by ${diff}% to reach 100%`;
    } else {
      custMsg.textContent = '✓ Total: 100% — Ready to save custom formula';
    }
  }
  const saveCustomBtn = document.getElementById('cm-save-custom-formula-btn');
  if (saveCustomBtn) {
    saveCustomBtn.disabled = !canSaveCustom;
  }

  // 8. Refresh preset chips dehighlight status when volume or filter changes
  if (!skipPresetRefresh) {
    if (typeof refreshColorMixPresetAvailabilityUI === 'function') {
      refreshColorMixPresetAvailabilityUI();
    } else {
      const presetWrap = document.getElementById('cm-preset-chips-wrap');
      if (presetWrap && typeof renderColorMixPresetChipsHtml === 'function') {
        presetWrap.innerHTML = renderColorMixPresetChipsHtml();
      }
    }
  }
}

// Slider live drag handler
function onColorMixSliderLive(idx, val) {
  val = Math.max(0, Math.min(100, Number(val) || 0));
  if (colorMixStudioState.components[idx]) {
    colorMixStudioState.components[idx].pct = val;
  }
  const input = document.getElementById(`cm-pct-input-${idx}`);
  if (input && document.activeElement !== input) {
    input.value = val;
  }
  syncColorMixVisuals(idx);
}

// Number input typing live handler (enforcing strict 0-100 limit in real-time)
function onColorMixPctLive(idx, inputOrVal) {
  const input = (typeof inputOrVal === 'object' && inputOrVal !== null && 'value' in inputOrVal)
    ? inputOrVal
    : document.getElementById(`cm-pct-input-${idx}`);
  const rawVal = input ? input.value : inputOrVal;

  if (rawVal === '' || rawVal === undefined) return;
  let val = Number(rawVal);
  if (isNaN(val)) return;

  // Limit strictly up to 100 only when typing
  if (val > 100) {
    val = 100;
    if (input) input.value = 100;
  } else if (val < 0) {
    val = 0;
    if (input) input.value = 0;
  }

  if (colorMixStudioState.components[idx]) {
    colorMixStudioState.components[idx].pct = val;
  }
  syncColorMixVisuals(idx);
}

// Number input blur/commit handler
function setColorMixPreferredCanSize(idx, size) {
  if (!colorMixStudioState.components[idx]) return;
  colorMixStudioState.components[idx].preferredCanSize = Number(size) || 0;
  renderColorMixStudio();
}

function formatColorMixSourcePreview(mixPlan) {
  if (!mixPlan) return 'Deducted from stock upon mix';
  if (mixPlan.usedFromOpened > 0 && mixPlan.stillNeeded <= 0) {
    return `🫙 Uses ${formatStock(mixPlan.usedFromOpened)}L from Opened / Used Stock`;
  }
  const openedParts = (mixPlan.sizes || CAN_SIZES)
    .filter(s => mixPlan.cansOpened && mixPlan.cansOpened[s] > 0)
    .map(s => `${mixPlan.cansOpened[s]}×${fmtSize(s)}`);
  const cansText = openedParts.length ? `Opens ${openedParts.join(' + ')} container` : 'Opens container';
  const usedOpenedPrefix = mixPlan.usedFromOpened > 0 ? `🫙 ${formatStock(mixPlan.usedFromOpened)}L opened + ` : '';
  const leftoverText = mixPlan.addedToOpened > 0
    ? ` · +${formatStock(mixPlan.addedToOpened)}L leftovers → Opened / Used (${(mixPlan.sizes || CAN_SIZES).filter(s => mixPlan.addedToOpenedBySize && mixPlan.addedToOpenedBySize[s] > 0).map(s => `${fmtSize(s)} container`).join(', ')})`
    : '';
  return `🥫 ${usedOpenedPrefix}${cansText}${leftoverText}`;
}

/* ============================================================
   SMART SEARCH WITH VISUAL AVATARS + CATEGORIZED ACCORDION +
   CLICKABLE COLOR CARDS OFF-CANVAS DRAWER
   ============================================================ */

function renderSmartAvatarSearchDropdownHtml(idx, prods, selectedProductId, searchQuery = '', alreadySelectedSlotMap = null) {
  const slotMap = alreadySelectedSlotMap || getColorMixSelectedProductSlotMap();
  const q = (searchQuery || '').trim().toLowerCase();
  const sorted = [...prods].sort((a, b) => {
    const aOpen = productOpenedStock(a) > 0 ? 1 : 0;
    const bOpen = productOpenedStock(b) > 0 ? 1 : 0;
    if (bOpen !== aOpen) return bOpen - aOpen;
    return (a.name || '').localeCompare(b.name || '');
  });

  const filtered = q
    ? sorted.filter(p => {
      const hex = getProductDefaultColor(p);
      const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
      return hay.includes(q);
    })
    : sorted;

  if (!filtered.length) {
    return `<div class="muted small" style="padding:10px 12px; text-align:center;">No matching paint products found.</div>`;
  }

  return filtered.map(p => {
    const hex = getProductDefaultColor(p);
    const isSel = String(p.id) === String(selectedProductId);
    const slotNum = slotMap.get(String(p.id));
    const isAlreadySelected = !!slotNum && (idx === 'add' || Number(slotNum) !== Number(idx) + 1);
    const openLiters = productOpenedStock(p);
    const openCanSz = productOpenedCanSize(p);

    const mousedownAttr = isAlreadySelected
      ? ''
      : `onmousedown="onColorMixProductSelect(${typeof idx === 'string' ? `'${idx}'` : idx}, '${p.id}')"`;
    const disabledAttr = isAlreadySelected ? 'disabled' : '';

    return `
      <button type="button" class="cm-avatar-item ${isSel ? 'active' : ''} ${isAlreadySelected ? 'already-selected disabled' : ''}" ${disabledAttr} ${mousedownAttr} title="${isAlreadySelected ? `Already selected in Ingredient #${slotNum}` : ''}">
        <span class="cm-avatar-circle" style="background-color:${hex};"></span>
        <div style="min-width:0; flex:1;">
          <div class="row" style="gap:6px; align-items:center;">
            <span style="font-size:12.5px; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</span>
            ${p.color && p.color !== '-' ? `<span class="muted" style="font-size:11px;">(${escapeHtml(p.color)})</span>` : ''}
          </div>
          <div class="muted" style="font-size:10.5px;">
            ${escapeHtml(p.brand || '')} · ${escapeHtml(p.type || 'Paint')} · ${peso(p.price)}/L
          </div>
        </div>
        <div class="row" style="gap:5px; align-items:center; flex-shrink:0;">
          ${isAlreadySelected ? `
            <span class="badge already-selected-badge" style="font-size:9.5px; padding:1px 6px;">🚫 Already Selected${slotNum ? ` (#${slotNum})` : ''}</span>
          ` : `
            ${openLiters > 0
        ? `<span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-size:9.5px; padding:1px 6px;">🫙 ${productOpenedSizesLabel(p, false)}</span>`
        : `<span class="badge ok" style="font-size:9.5px; padding:1px 6px;">🥫 ${formatStock(p.stock)}L</span>`}
            ${isSel ? `<span class="badge ok" style="font-size:9.5px; padding:1px 5px;">✓</span>` : ''}
          `}
        </div>
      </button>
    `;
  }).join('');
}

function matchesColorMixSearch(p, q) {
  if (!q) return true;
  const hex = (getProductDefaultColor(p) || '').toLowerCase();
  const hexClean = hex.replace('#', '');
  const name = (p.name || '').toLowerCase();
  const brand = (p.brand || '').toLowerCase();
  const color = (p.color || '').toLowerCase();
  const type = (p.type || '').toLowerCase();
  const category = (p.category || '').toLowerCase();
  const sku = (p.sku || p.id || '').toLowerCase();

  return name.includes(q) ||
    brand.includes(q) ||
    color.includes(q) ||
    type.includes(q) ||
    category.includes(q) ||
    sku.includes(q) ||
    hex.includes(q) ||
    hexClean.includes(q);
}

function getProductCategoryKey(p) {
  const raw = (p.category || p.type || '').trim();
  if (!raw || raw === '-') return 'Specialty Paint';
  const low = raw.toLowerCase();
  if (low === 'house paint') return 'House Paint';
  if (low === 'automotive paint') return 'Automotive Paint';
  if (low === 'specialty paint') return 'Specialty Paint';
  return raw;
}

function getProductUsableOpenedContainers(p) {
  if (!p) return [];
  let entries = productOpenedEntries(p);
  if (!entries.length && productOpenedStock(p) > 0) {
    const size = productOpenedCanSize(p) || guessOpenedCanSize(productOpenedStock(p), p.openedCanSize, p) || 1;
    entries = [{ size, left: productOpenedStock(p), used: productUsedFromOpenedCan(p, size) }];
  }
  return entries.filter(e => e && e.left > 0);
}

function renderColorMixOpenedContainersSectionHtml(idx, matchingProds, selectedProductId, selectedPrefCan = 0, alreadySelectedSlotMap = null) {
  const slotMap = alreadySelectedSlotMap || getColorMixSelectedProductSlotMap();
  const openedList = [];
  matchingProds.forEach(p => {
    const entries = getProductUsableOpenedContainers(p);
    entries.forEach(entry => {
      openedList.push({ product: p, entry });
    });
  });

  if (!openedList.length) return '';

  const isExpanded = colorMixStudioState.openedSectionExpanded !== false;

  return `
    <div class="cm-opened-section ${isExpanded ? 'open' : 'collapsed'}">
      <button type="button" class="cm-opened-section-header" onclick="toggleColorMixOpenedSection()" title="${isExpanded ? 'Click to collapse opened containers' : 'Click to expand opened containers'}">
        <div>
          <div style="font-size:14px; font-weight:700; color:var(--warning-text); display:flex; align-items:center; gap:6px;">
            <span>🫙</span> Opened / Used Containers
            <span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-size:10px; padding:1px 6px;">
              ${openedList.length} container${openedList.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style="font-size:11.5px; color:var(--warning-text); margin-top:2px;">
            Previously opened containers with remaining paint.
          </div>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <span class="badge" style="background:var(--warning-bg); color:var(--warning-text); border:1px solid var(--warning-border); font-size:10.5px; font-weight:700; padding:3px 9px;">
            ⭐ Priority: Use Opened Containers First
          </span>
          <span style="font-size:13px; color:var(--warning-text); font-weight:700;">${isExpanded ? '▴' : '▾'}</span>
        </div>
      </button>

      ${isExpanded ? `
      <div class="cm-opened-card-grid">
        ${openedList.map(({ product: p, entry }) => {
    const hex = getProductDefaultColor(p);
    const isProdSel = String(p.id) === String(selectedProductId);
    const isCanMatch = selectedPrefCan ? Number(selectedPrefCan) === Number(entry.size) : true;
    const isSel = isProdSel && isCanMatch;
    const slotNum = slotMap.get(String(p.id));
    const isAlreadySelected = !!slotNum && (idx === 'add' || Number(slotNum) !== Number(idx) + 1);
    const colorName = p.color && p.color !== '-' ? p.color : 'Standard';

    const clickAttr = isAlreadySelected
      ? ''
      : `onclick="onColorMixProductSelect(${typeof idx === 'string' ? `'${idx}'` : idx}, '${p.id}', ${entry.size})"`;
    const titleText = isAlreadySelected
      ? `Already selected in Ingredient #${slotNum}`
      : `Select opened ${entry.size}L container with ${formatStock(entry.left)}L remaining`;

    return `
            <div class="cm-opened-card ${isSel ? 'selected' : ''} ${isAlreadySelected ? 'already-selected disabled' : ''}" ${clickAttr} title="${titleText}">
              <div class="cm-opened-card-top">
                <span class="cm-opened-pill">🫙 Opened Container</span>
                <span class="cm-opened-brand">${escapeHtml(p.brand || 'No Brand')}</span>
              </div>
              <div class="cm-opened-name">${escapeHtml(p.name)}</div>
              <div class="cm-opened-color-row">
                <span class="cm-opened-swatch" style="background-color:${hex};"></span>
                <span style="font-weight:600;">Color: ${escapeHtml(colorName)}</span>
                <code style="font-size:10px; color:var(--ink-soft);">${hex}</code>
              </div>
              <div class="cm-opened-metrics">
                <div class="cm-opened-rem-row">
                  <span class="cm-opened-rem-val">${formatStock(entry.left)} L</span>
                  <span class="cm-opened-rem-lbl">remaining</span>
                </div>
                <div class="cm-opened-orig-row">
                  <span style="font-weight:500;">Original container size:</span>
                  <strong>${fmtSize(entry.size)} container</strong>
                </div>
              </div>
              ${isSel ? `
                <div style="margin-top:6px; text-align:right;">
                  <span class="badge ok" style="font-size:10px; padding:2px 7px; font-weight:700;">✓ Selected</span>
                </div>
              ` : ''}
              ${isAlreadySelected ? `
                <div style="margin-top:6px; text-align:right;">
                  <span class="badge already-selected-badge" style="font-size:10px; padding:2px 7px;">🚫 Already Selected${slotNum ? ` in #${slotNum}` : ''}</span>
                </div>
              ` : ''}
            </div>
          `;
  }).join('')}
      </div>
      ` : ''}
    </div>
  `;
}

function renderProductStockSummaryHtml(p) {
  const sizes = productSizes(p);
  const hasBd = productHasCanBreakdown(p);

  if (hasBd) {
    const availableSizes = sizes
      .map(sz => ({ size: sz, count: productCanCount(p, sz) }))
      .filter(item => item.count > 0);

    if (availableSizes.length > 0) {
      return `
        <div class="cm-card-stock-box">
          <div class="cm-card-stock-title">Available Stock by Container Size</div>
          ${availableSizes.map(item => `
            <div class="cm-stock-item">
              <span class="cm-stock-item-size">${fmtSize(item.size)}:</span>
              <span class="cm-stock-item-count">${item.count} container${item.count === 1 ? '' : 's'}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  if (p.stock > 0) {
    return `
      <div class="cm-card-stock-box">
        <div class="cm-card-stock-title">Available Stock</div>
        <div class="cm-stock-item">
          <span class="cm-stock-item-size">Sealed Stock:</span>
          <span class="cm-stock-item-count">${formatStock(p.stock)} L available</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="cm-card-stock-box out-of-stock">
      <div class="cm-card-stock-title">Available Stock</div>
      <div class="cm-stock-item">
        <span class="cm-stock-item-count">0 containers (Out of stock)</span>
      </div>
    </div>
  `;
}

function renderColorMixCardHtml(idx, p, selectedProductId, alreadySelectedSlotMap = null) {
  const slotMap = alreadySelectedSlotMap || getColorMixSelectedProductSlotMap();
  const hex = getProductDefaultColor(p);
  const isSel = String(p.id) === String(selectedProductId);
  const isOutOfStock = productMixAvailableStock(p) <= 0;
  const slotNum = slotMap.get(String(p.id));
  const isAlreadySelected = !!slotNum && (idx === 'add' || Number(slotNum) !== Number(idx) + 1);
  const light = isLightColor(hex);
  const colorName = p.color && p.color !== '-' ? p.color : 'Standard';
  const openStock = productOpenedStock(p);
  const usableOpened = getProductUsableOpenedContainers(p);

  const disabledAttr = (isAlreadySelected || isOutOfStock) ? 'disabled' : '';
  const clickAttr = (isAlreadySelected || isOutOfStock)
    ? ''
    : `onclick="onColorMixProductSelect(${typeof idx === 'string' ? `'${idx}'` : idx}, '${p.id}', 0)"`;
  const titleText = isAlreadySelected
    ? `Already selected in Ingredient #${slotNum}`
    : (isOutOfStock ? 'Out of stock' : `Select ${escapeHtml(p.name)}`);

  return `
    <button type="button" class="cm-color-card ${isSel ? 'selected' : ''} ${isAlreadySelected ? 'already-selected disabled' : ''} ${isOutOfStock ? 'out-of-stock' : ''}" ${disabledAttr} ${clickAttr} title="${titleText}">
      <div class="cm-color-card-swatch-bar" style="background-color:${hex};">
        <code style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:4px; background:${light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)'}; color:${light ? 'var(--ink)' : '#FFFFFF'};">${hex}</code>
        ${isSel ? `<span class="badge ok" style="font-size:10px; padding:1px 6px; box-shadow:0 1px 4px rgba(0,0,0,0.15); font-weight:700;">✓ Selected</span>` : ''}
        ${isAlreadySelected ? `<span class="badge already-selected-badge" style="font-size:10px; padding:1px 6px; box-shadow:0 1px 4px rgba(0,0,0,0.1);">🚫 Already Selected${slotNum ? ` (#${slotNum})` : ''}</span>` : ''}
      </div>
      <div class="cm-color-card-body">
        <div class="row" style="justify-content:space-between; align-items:center; gap:4px;">
          <span style="font-size:11px; font-weight:600; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.02em;">${escapeHtml(p.brand || 'No Brand')}</span>
          <strong style="color:var(--teal-dark); font-size:12px;">${peso(p.price)}/L</strong>
        </div>
        <div class="cm-color-card-name">${escapeHtml(p.name)}</div>
        <div class="row" style="gap:6px; align-items:center; font-size:11.5px; color:var(--ink-soft);">
          <span class="cm-opened-swatch" style="width:12px; height:12px; background-color:${hex};"></span>
          <span>Color: <strong style="color:var(--ink);">${escapeHtml(colorName)}</strong></span>
        </div>
        ${isAlreadySelected ? `
          <div class="cm-card-already-selected-banner">
            <span>🚫</span> Already Selected in Ingredient #${slotNum}
          </div>
        ` : `
          ${renderProductStockSummaryHtml(p)}
          ${openStock > 0 ? `
            <div class="cm-card-opened-hint">
              🫙 ${formatStock(openStock)}L opened (${usableOpened.map(e => fmtSize(e.size)).join(', ')}) · See Opened section
            </div>
          ` : ''}
        `}
      </div>
    </button>
  `;
}

function renderCategorizedAccordionMenusHtml(idx, prods, selectedProductId, searchQuery = '', selectedPrefCan = 0) {
  const slotMap = getColorMixSelectedProductSlotMap();
  const q = (searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? prods.filter(p => matchesColorMixSearch(p, q))
    : prods;

  if (!filtered.length) {
    return `
      <div class="cm-no-results">
        <div style="font-size:24px; margin-bottom:6px;">🔍</div>
        <strong style="font-size:14px; color:var(--ink);">No matching paint products found</strong>
        <p class="muted" style="margin:4px 0 12px; font-size:12px;">No products match "${escapeHtml(q)}". Try searching by brand, color name (e.g., Red, White), category, or hex color code.</p>
        <button type="button" class="btn secondary small" onclick="clearColorMixDrawerSearch()">Clear Search</button>
      </div>
    `;
  }

  // 1. Opened / Used Containers Section (Prioritized)
  const openedSectionHtml = renderColorMixOpenedContainersSectionHtml(idx, filtered, selectedProductId, selectedPrefCan, slotMap);

  // 2. Regular Categories: House Paint, Automotive Paint, Specialty Paint
  const STANDARD_CATEGORIES = [
    { key: 'House Paint', title: 'House Paint', icon: '🏠' },
    { key: 'Automotive Paint', title: 'Automotive Paint', icon: '🚗' },
    { key: 'Specialty Paint', title: 'Specialty Paint', icon: '✨' }
  ];

  const categoryMap = new Map();
  STANDARD_CATEGORIES.forEach(c => categoryMap.set(c.key, []));

  filtered.forEach(p => {
    const catKey = getProductCategoryKey(p);
    if (!categoryMap.has(catKey)) {
      categoryMap.set(catKey, []);
    }
    categoryMap.get(catKey).push(p);
  });

  const categoryGroups = [];
  STANDARD_CATEGORIES.forEach(c => {
    const items = categoryMap.get(c.key) || [];
    categoryGroups.push({
      key: c.key,
      icon: c.icon,
      title: c.title,
      items
    });
  });

  // Any extra categories beyond the standard 3
  categoryMap.forEach((items, key) => {
    if (!STANDARD_CATEGORIES.some(c => c.key === key)) {
      categoryGroups.push({
        key,
        icon: '🥫',
        title: `${key} Paints`,
        items
      });
    }
  });

  const openState = colorMixStudioState.openCategories || {};

  const categoriesHtml = categoryGroups.map((g, gIdx) => {
    const isExpanded = q ? true : (openState[g.key] !== undefined ? openState[g.key] : true);
    return `
      <div class="cm-accordion-group ${isExpanded ? 'open' : ''}">
        <button type="button" class="cm-accordion-header" onclick="toggleColorMixAccordionCategory('${escapeHtml(g.key)}')">
          <div class="row" style="gap:8px; align-items:center;">
            <span style="font-size:16px;">${g.icon}</span>
            <span style="font-size:13.5px; font-weight:700; color:var(--ink);">${escapeHtml(g.title)}</span>
          </div>
          <div class="row" style="gap:8px; align-items:center;">
            <span class="badge" style="background:var(--surface-3); color:var(--ink); font-size:11px; padding:2px 8px; font-weight:600;">
              ${g.items.length} product${g.items.length === 1 ? '' : 's'} available
            </span>
            <span style="font-size:12px; color:var(--teal-dark); font-weight:700;">${isExpanded ? '▴' : '▾'}</span>
          </div>
        </button>
        ${isExpanded ? `
          <div class="cm-accordion-body">
            ${g.items.length ? `
              <div class="cm-color-card-grid">
                ${g.items.map(p => renderColorMixCardHtml(idx, p, selectedProductId, slotMap)).join('')}
              </div>
            ` : `
              <div class="muted small" style="padding:14px; text-align:center;">
                No products available in this category${q ? ' matching search' : ''}.
              </div>
            `}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    ${openedSectionHtml}
    <div style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin: 4px 0 2px;">
      Unopened Paint Inventory by Category
    </div>
    ${categoriesHtml}
  `;
}

function renderColorMixOffcanvasDrawerHtml(prods) {
  const s = colorMixStudioState;
  const idx = s.openPickerIdx;
  if (idx === -1 || idx === undefined || idx === null) return '';

  const isAddMode = idx === 'add';
  const comp = !isAddMode && s.components[idx] ? s.components[idx] : null;
  const selectedProductId = comp ? comp.productId : '';
  const selectedPrefCan = comp ? (Number(comp.preferredCanSize) || 0) : 0;
  const q = s.pickerSearch || '';
  const modalProds = prods || colorMixModalProducts();

  return `
    <div class="cm-offcanvas-backdrop" onclick="if(event.target === this) closeColorMixPigmentDrawer()">
      <div class="cm-offcanvas-drawer" onclick="event.stopPropagation()">
        <div class="cm-offcanvas-header">
          <div class="row" style="justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:10px;">
            <div>
              <div style="font-size:16px; font-weight:700; color:var(--ink);">
                ${isAddMode ? '🎨 Add New Pigment to Formula' : `🎨 Select Paint for Ingredient #${Number(idx) + 1}`}
              </div>
              <div class="muted" style="font-size:12px; margin-top:2px;">
                ${comp && comp.name ? `Currently selected: <strong style="color:var(--ink);">${escapeHtml(comp.name)}</strong> · ${escapeHtml(comp.brand || '')} · <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${comp.hex || '#fff'}; vertical-align:middle; border:1px solid var(--line);"></span> ${escapeHtml(comp.hex || '')}` : 'Choose an opened container or unopened paint product'}
              </div>
            </div>
            <button type="button" class="btn secondary small" onclick="closeColorMixPigmentDrawer()">✕ Close</button>
          </div>

          <!-- Smart Search Bar inside Drawer -->
          <div class="cm-smart-search-bar" style="margin-top:0;">
            <span class="cm-smart-search-icon">🔍</span>
            <input
              id="cm-drawer-search-input"
              type="text"
              class="cm-smart-search-input"
              style="height:38px; font-size:13px;"
              placeholder="Search by product name, brand, color, category, or hex..."
              value="${escapeHtml(q)}"
              oninput="onColorMixDrawerSearch(this.value)"
            >
            ${q ? `<button type="button" onclick="clearColorMixDrawerSearch()" style="background:none; border:none; color:var(--ink-soft); font-size:14px; cursor:pointer; padding:0 8px;" title="Clear search">✕</button>` : ''}
          </div>
        </div>

        <div id="cm-offcanvas-body" class="cm-offcanvas-body">
          ${q.trim() ? `
            <div class="cm-search-status-bar">
              <span>🔍 Showing results for "<strong>${escapeHtml(q)}</strong>"</span>
              <button type="button" class="btn text small" style="color:var(--info-text); font-weight:700; padding:1px 6px;" onclick="clearColorMixDrawerSearch()">✕ Clear</button>
            </div>
          ` : ''}
          ${renderCategorizedAccordionMenusHtml(idx, modalProds, selectedProductId, q, selectedPrefCan)}
        </div>
      </div>
    </div>
  `;
}

function closeColorMixPigmentDrawer() {
  colorMixStudioState.openPickerIdx = -1;
  colorMixStudioState.pickerSearch = '';
  renderColorMixStudio();
}

function clearColorMixDrawerSearch() {
  colorMixStudioState.pickerSearch = '';
  const input = document.getElementById('cm-drawer-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  onColorMixDrawerSearch('');
}

function onColorMixDrawerSearch(val) {
  colorMixStudioState.pickerSearch = val || '';
  const body = document.getElementById('cm-offcanvas-body');
  if (body) {
    const prods = colorMixModalProducts();
    const idx = colorMixStudioState.openPickerIdx;
    const comp = idx !== 'add' && colorMixStudioState.components[idx] ? colorMixStudioState.components[idx] : null;
    const selectedProductId = comp ? comp.productId : '';
    const selectedPrefCan = comp ? (Number(comp.preferredCanSize) || 0) : 0;
    const q = colorMixStudioState.pickerSearch;
    body.innerHTML = `
      ${q.trim() ? `
        <div class="cm-search-status-bar">
          <span>🔍 Showing results for "<strong>${escapeHtml(q)}</strong>"</span>
          <button type="button" class="btn text small" style="color:var(--info-text); font-weight:700; padding:1px 6px;" onclick="clearColorMixDrawerSearch()">✕ Clear</button>
        </div>
      ` : ''}
      ${renderCategorizedAccordionMenusHtml(idx, prods, selectedProductId, q, selectedPrefCan)}
    `;
  }
}

function toggleColorMixAccordionCategory(categoryKey) {
  if (!colorMixStudioState.openCategories) colorMixStudioState.openCategories = {};
  const current = colorMixStudioState.openCategories[categoryKey];
  colorMixStudioState.openCategories[categoryKey] = current === undefined ? false : !current;
  const body = document.getElementById('cm-offcanvas-body');
  if (body) {
    onColorMixDrawerSearch(colorMixStudioState.pickerSearch || '');
  } else {
    renderColorMixStudio();
  }
}

function toggleColorMixOpenedSection() {
  if (colorMixStudioState.openedSectionExpanded === undefined) {
    colorMixStudioState.openedSectionExpanded = false;
  } else {
    colorMixStudioState.openedSectionExpanded = !colorMixStudioState.openedSectionExpanded;
  }
  const body = document.getElementById('cm-offcanvas-body');
  if (body) {
    onColorMixDrawerSearch(colorMixStudioState.pickerSearch || '');
  } else {
    renderColorMixStudio();
  }
}

function onColorMixProductSelect(idx, productId, preferredCanSize = 0) {
  const p = productById(productId);
  if (!p) return;

  // Prevent duplicate product selection across ingredient slots
  const slotMap = getColorMixSelectedProductSlotMap();
  const existingSlot = slotMap.get(String(p.id));
  if (existingSlot && (idx === 'add' || Number(existingSlot) !== Number(idx) + 1)) {
    showToast(`"${p.name}" is already selected in Ingredient #${existingSlot}. Each ingredient slot must contain a unique paint product.`, 'error');
    return;
  }

  if (productMixAvailableStock(p) <= 0) {
    showToast(`Product "${p.name}" has no available stock and cannot be selected for mixing.`, 'error');
    renderColorMixStudio();
    return;
  }
  if (productHasLowStock(p)) {
    showToast(`Product "${p.name}" is low on stock (${formatStock(productMixAvailableStock(p))}L available).`, 'info');
  }

  const prefCan = Number(preferredCanSize) || 0;

  if (idx === 'add') {
    if (!colorMixStudioState.isCustomizingFormula) {
      showToast('Click "Customize Formula" first to add new ingredients.', 'info');
      return;
    }
    const currentTotal = colorMixStudioState.components.reduce((s, c) => s + (Number(c.pct) || 0), 0);
    const rawRem = Math.round((100 - currentTotal) * 10) / 10;
    const initialPct = rawRem > 0 ? Math.min(100, rawRem) : 5;
    const newIdx = colorMixStudioState.components.length;
    colorMixStudioState.components.push({
      id: uid('cmc'),
      productId: p.id,
      colorId: p.colorId || p.color_id || null,
      name: p.name,
      brand: p.brand || '',
      colorName: getProductColorName(p),
      color: getProductColorName(p),
      stock: p.stock,
      price: p.price,
      hex: getProductDefaultColor(p),
      pct: initialPct,
      preferredCanSize: prefCan,
      isOriginal: false
    });
    colorMixStudioState.openPickerIdx = -1;
    colorMixStudioState.pickerSearch = '';
    colorMixStudioState.inlineSearchIdx = -1;
    colorMixStudioState.inlineSearchQuery = '';
    updateColorMixCalculation(false);
    renderColorMixStudio();
    setTimeout(() => {
      const inp = document.getElementById(`cm-pct-input-${newIdx}`);
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 30);
    showToast(`Added "${p.name}" (${initialPct}%). Adjust percentages so total equals 100%.`, 'ok');
    return;
  } else {
    const comp = colorMixStudioState.components[idx];
    if (comp && comp.isOriginal !== false) {
      showToast('Original catalog ingredients are protected and cannot be replaced.', 'error');
      return;
    }
    if (comp) {
      comp.productId = p.id;
      comp.colorId = p.colorId || p.color_id || null;
      comp.name = p.name;
      comp.brand = p.brand || '';
      comp.colorName = getProductColorName(p);
      comp.color = getProductColorName(p);
      comp.price = p.price;
      comp.stock = p.stock;
      comp.hex = getProductDefaultColor(p);
      comp.preferredCanSize = prefCan;
    }
    if (idx === 0 && p.type) {
      colorMixStudioState.baseType = p.type;
    }
  }

  colorMixStudioState.openPickerIdx = -1;
  colorMixStudioState.pickerSearch = '';
  colorMixStudioState.inlineSearchIdx = -1;
  colorMixStudioState.inlineSearchQuery = '';
  updateColorMixCalculation();
  renderColorMixStudio();
}

function onColorMixTotalLitersChange(val, clampInput = true) {
  const parsed = Number(val);
  val = isNaN(parsed) || parsed < 0.5 ? 0.5 : parsed;
  colorMixStudioState.totalLiters = val;
  // Update can button active states without full page re-render
  document.querySelectorAll('.cm-can-btn').forEach(btn => {
    const text = (btn.textContent || '').trim();
    if (text.includes(`${val} L`) || (val === 1 && text.includes('1.0 L')) || (val === 4 && text.includes('4.0 L'))) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  const customInput = document.getElementById('cm-liters');
  if (customInput && (clampInput || document.activeElement !== customInput)) {
    customInput.value = val;
  }
  const volLabel = document.getElementById('cm-grand-volume-label');
  if (volLabel) volLabel.textContent = `(${val} Liter${val === 1 ? '' : 's'})`;
  const beakerVol = document.getElementById('cm-beaker-volume');
  if (beakerVol) beakerVol.textContent = `${val} Liter${val === 1 ? '' : 's'}`;
  syncColorMixVisuals();
}

function startCustomizeColorMixFormula() {
  const s = colorMixStudioState;
  if (!s || !Array.isArray(s.components) || s.components.length === 0) return;

  // Snapshot current state so Cancel restores the exact previous formula
  s.customizeSnapshot = {
    components: s.components.map(c => ({ ...c })),
    colorName: s.colorName || '',
    userCustomizedName: Boolean(s.userCustomizedName),
    isCustomizedFormula: Boolean(s.isCustomizedFormula)
  };
  s.isCustomizingFormula = true;
  renderColorMixStudio();
}

function cancelCustomizeColorMixFormula() {
  const s = colorMixStudioState;
  if (!s) return;
  if (s.customizeSnapshot) {
    s.components = s.customizeSnapshot.components.map(c => ({ ...c }));
    s.colorName = s.customizeSnapshot.colorName;
    s.userCustomizedName = s.customizeSnapshot.userCustomizedName;
    s.isCustomizedFormula = s.customizeSnapshot.isCustomizedFormula;
    s.customizeSnapshot = null;
  }
  s.isCustomizingFormula = false;
  s.openPickerIdx = -1;
  s.pickerSearch = '';
  updateColorMixCalculation(false);
  renderColorMixStudio();
  showToast('Customization cancelled — restored previous formula.', 'info');
}

function onCustomizePctInput(idx, inputEl) {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula || !s.components[idx]) return;
  const raw = inputEl ? String(inputEl.value).trim() : '';
  if (raw === '') {
    s.components[idx].pct = 0;
    syncColorMixVisuals(idx, true);
    return;
  }
  let val = Number(raw);
  if (isNaN(val) || val < 0) {
    val = 0;
    if (inputEl) inputEl.value = 0;
  } else if (val > 100) {
    val = 100;
    if (inputEl) inputEl.value = 100;
  }
  s.components[idx].pct = Math.round(val * 10) / 10;
  syncColorMixVisuals(idx, true);
}

function onCustomizePctCommit(idx, inputEl) {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula || !s.components[idx]) return;
  let val = Number(inputEl ? inputEl.value : s.components[idx].pct);
  if (isNaN(val) || val < 0) val = 0;
  if (val > 100) val = 100;
  val = Math.round(val * 10) / 10;
  s.components[idx].pct = val;
  if (inputEl) inputEl.value = val;
  syncColorMixVisuals(idx, true);
}

function openAddCustomIngredientPicker() {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula) {
    showToast('Click "Customize Formula" first to add new ingredients.', 'info');
    return;
  }
  const available = colorMixModalProducts();
  const usedIds = new Set(s.components.map(c => String(c.productId)).filter(Boolean));
  const remaining = available.filter(p => !usedIds.has(String(p.id)));
  if (!remaining.length) {
    showToast('All available paint products in inventory are already included in this formula.', 'info');
    return;
  }
  s.openPickerIdx = 'add';
  s.pickerSearch = '';
  renderColorMixStudio();
  setTimeout(() => {
    const inp = document.getElementById('cm-drawer-search-input');
    if (inp) inp.focus();
  }, 40);
}

function removeColorMixIngredient(idx) {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula) {
    showToast('Click "Customize Formula" first to edit ingredients.', 'info');
    return false;
  }
  const comp = s.components[idx];
  if (!comp) return false;
  if (comp.isOriginal !== false) {
    showToast('Original formula ingredients are protected and cannot be removed.', 'error');
    return false;
  }
  const removedName = comp.name || 'Ingredient';
  s.components.splice(idx, 1);
  updateColorMixCalculation(false);
  renderColorMixStudio();
  showToast(`Removed added ingredient "${removedName}".`, 'info');
  return true;
}

function saveCustomizeColorMixFormula() {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula) return false;

  // 1. Verify all original ingredients remain intact
  if (s.customizeSnapshot && Array.isArray(s.customizeSnapshot.components)) {
    const origIds = s.customizeSnapshot.components
      .filter(c => c.isOriginal !== false && c.productId)
      .map(c => String(c.productId));
    const currentIds = new Set(s.components.map(c => String(c.productId)).filter(Boolean));
    const missingOrig = origIds.find(id => !currentIds.has(id));
    if (missingOrig) {
      showToast('Original catalog ingredients cannot be removed from the formula.', 'error');
      return false;
    }
  }

  // 2. Validate every ingredient percentage (> 0, <= 100, finite)
  for (let i = 0; i < s.components.length; i++) {
    const c = s.components[i];
    const pct = Number(c.pct);
    if (!c.productId || isNaN(pct) || pct <= 0 || pct > 100) {
      showToast(`Invalid percentage for "${c.name || `Ingredient #${i + 1}`}". Each ingredient must be between 0.1% and 100%.`, 'error');
      return false;
    }
  }

  // 3. Prevent duplicate ingredients
  const seen = new Set();
  for (const c of s.components) {
    const pid = String(c.productId);
    if (seen.has(pid)) {
      showToast(`Duplicate ingredient "${c.name}" detected. Each pigment must be unique.`, 'error');
      return false;
    }
    seen.add(pid);
  }

  // 4. Enforce exact 100% total
  const totalPct = Math.round(s.components.reduce((sum, c) => sum + (Number(c.pct) || 0), 0) * 10) / 10;
  if (Math.abs(totalPct - 100) >= 0.05) {
    showToast(`Total formula percentage must equal exactly 100% before saving (currently ${totalPct}%).`, 'error');
    return false;
  }

  // 5. Commit customized state without modifying original Mixed Color Catalog formulas
  s.isCustomizingFormula = false;
  s.isCustomizedFormula = true;
  s.customizeSnapshot = null;
  s.openPickerIdx = -1;

  const origName = s.originalCatalogName || '';
  const nameInput = document.getElementById('cm-color-name');
  const currentName = (nameInput ? nameInput.value.trim() : s.colorName) || origName || 'Custom Mix';
  const existingCatalogPresets = [
    ...(Array.isArray(DEFAULT_COLOR_RECIPE_PRESETS) ? DEFAULT_COLOR_RECIPE_PRESETS : []),
    ...(Array.isArray(COLOR_RECIPE_PRESETS) ? COLOR_RECIPE_PRESETS : [])
  ];
  const matchesExistingCatalog = existingCatalogPresets.some(
    pr => cleanPresetColorName(pr.name).toLowerCase() === currentName.toLowerCase()
  );
  if (matchesExistingCatalog) {
    let candidate = `${currentName} (Custom)`;
    let suffix = 2;
    while (existingCatalogPresets.some(pr => cleanPresetColorName(pr.name).toLowerCase() === candidate.toLowerCase())) {
      candidate = `${currentName} (Custom ${suffix++})`;
    }
    s.colorName = candidate;
    s.userCustomizedName = true;
  } else {
    s.colorName = currentName;
    s.userCustomizedName = true;
  }

  const mixed = subtractivePaintMix(s.components);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  const baseType = (document.getElementById('cm-base-type') ? document.getElementById('cm-base-type').value.trim() : s.baseType) || 'Automotive Paint';

  // Save custom formula separately linked to the original catalog color
  saveMixedColorToPresets({
    colorName: s.colorName,
    detectedName: detected.name,
    hex: mixed.hex,
    baseType,
    components: s.components.map(c => ({ ...c, percentage: Number(c.pct) })),
    notes: origName ? `Customized from ${origName}` : 'Custom formula'
  });

  updateColorMixCalculation(false);
  renderColorMixStudio();
  showToast(`Saved custom formula "${s.colorName}" (100% balanced). Original catalog formula unchanged.`, 'ok');
  return true;
}

function resetCustomFormulaToOriginal() {
  const s = colorMixStudioState;
  if (!s) return;
  if (Number(s.originalPresetIndex) >= 0 && COLOR_RECIPE_PRESETS[s.originalPresetIndex]) {
    applyRecipePreset(s.originalPresetIndex);
  }
}

function balanceColorMixTo100() {
  const s = colorMixStudioState;
  if (!s || !s.isCustomizingFormula) {
    showToast('Click "Customize Formula" first to adjust ingredient percentages.', 'info');
    return;
  }
  const comps = s.components;
  if (!Array.isArray(comps) || comps.length < 2) return;
  const sum = comps.reduce((acc, c) => acc + Math.max(0, Number(c.pct) || 0), 0);
  if (sum <= 0) {
    const base = Math.floor(100 / comps.length);
    const rem = 100 - base * comps.length;
    comps.forEach((c, i) => {
      c.pct = base + (i === 0 ? rem : 0);
    });
  } else {
    let running = 0;
    comps.forEach((c, i) => {
      if (i === comps.length - 1) {
        c.pct = Math.max(0.1, Math.round((100 - running) * 10) / 10);
      } else {
        const scaled = Math.max(1, Math.round((Math.max(0, Number(c.pct) || 0) / sum) * 100));
        c.pct = scaled;
        running += scaled;
      }
    });
    // Ensure exact 100.0 sum after rounding
    const checkSum = Math.round(comps.reduce((acc, c) => acc + Number(c.pct), 0) * 10) / 10;
    if (Math.abs(checkSum - 100) >= 0.05) {
      const diff = Math.round((100 - checkSum) * 10) / 10;
      const largestIdx = comps.reduce((best, c, i) => (c.pct > comps[best].pct ? i : best), 0);
      comps[largestIdx].pct = Math.max(1, Math.round((comps[largestIdx].pct + diff) * 10) / 10);
    }
  }
  comps.forEach((c, i) => {
    const inp = document.getElementById(`cm-pct-input-${i}`);
    if (inp) inp.value = c.pct;
  });
  syncColorMixVisuals(-1, true);
  showToast('Auto-balanced formula percentages to 100%.', 'ok');
}


async function submitColorMix() {
  const s = colorMixStudioState;
  if (s.isCustomizingFormula) {
    showToast('Please click "Save Custom Formula" (or "Cancel") before adding to sale.', 'error');
    return false;
  }
  const customInput = document.getElementById('cm-liters');
  if (customInput) {
    const rawLiters = Number(customInput.value);
    if (isNaN(rawLiters) || rawLiters < 0.5) {
      onColorMixTotalLitersChange(0.5, true);
      showToast('Minimum mixing volume is 0.5 L.', 'error');
      return false;
    }
    s.totalLiters = rawLiters;
  } else if ((Number(s.totalLiters) || 0) < 0.5) {
    s.totalLiters = 0.5;
  }
  const colorNameInput = document.getElementById('cm-color-name');
  const colorName = colorNameInput ? colorNameInput.value.trim() : s.colorName;
  if (!colorName) {
    showToast('Please enter a color name / reference code.', 'error');
    return false;
  }

  const totalPct = Math.round(s.components.reduce((sum, c) => sum + (Number(c.pct) || 0), 0) * 10) / 10;
  if (Math.abs(totalPct - 100) >= 0.05) {
    showToast(`Color blend percentages must equal exactly 100% (currently ${totalPct}%).`, 'error');
    return false;
  }

  const validComponents = s.components.filter(c => c.productId && Number(c.pct) > 0);
  if (validComponents.length < 2) {
    showToast('At least 2 formula ingredients (each with a percentage above 0%) are required to mix a color.', 'error');
    return false;
  }

  // Validate product uniqueness before saving or adding to sale
  const seenProductIds = new Set();
  const duplicateErrors = [];
  for (let i = 0; i < validComponents.length; i++) {
    const comp = validComponents[i];
    const pid = String(comp.productId);
    if (seenProductIds.has(pid)) {
      const p = productById(pid);
      const pName = p ? p.name : (comp.name || `Product #${pid}`);
      duplicateErrors.push(`"${pName}" (Ingredient #${i + 1})`);
    } else {
      seenProductIds.add(pid);
    }
  }

  if (duplicateErrors.length > 0) {
    showToast(`Duplicate product detected: ${duplicateErrors.join(', ')}. Each ingredient slot must contain a unique paint product.`, 'error');
    const readyBadge = document.getElementById('cm-ready-badge');
    if (readyBadge) {
      readyBadge.className = 'badge low';
      readyBadge.textContent = '⚠️ Duplicate Products Selected';
    }
    return false;
  }

  const reqLitersByProd = {};
  for (const c of validComponents) {
    const pid = String(c.productId);
    const compLiters = Number(((s.totalLiters || 1) * (Number(c.pct) / 100)).toFixed(2));
    reqLitersByProd[pid] = Number(((reqLitersByProd[pid] || 0) + compLiters).toFixed(2));
  }

  const isPos = s.isPosMode !== false;

  for (const pid of Object.keys(reqLitersByProd)) {
    const p = productById(pid);
    if (!p) {
      showToast(`Selected product #${pid} was not found in inventory.`, 'error');
      return false;
    }
    const totalReq = reqLitersByProd[pid];
    const rawMixAvail = productMixNonExpiredAvailableStock(p);
    const reservedInCart = (isPos && typeof getCartReservedLitersForProduct === 'function')
      ? getCartReservedLitersForProduct(p).total
      : 0;
    const mixAvail = Math.max(0, Number((rawMixAvail - reservedInCart).toFixed(2)));
    if (mixAvail + 1e-6 < totalReq) {
      const shortage = Number((totalReq - mixAvail).toFixed(2));
      showToast(`Not enough stock for "${p.name}". Required: ${formatStock(totalReq)} L, Available: ${formatStock(mixAvail)} L${reservedInCart > 0 ? ` (${formatStock(reservedInCart)} L reserved in cart)` : ''}. Shortage: ${formatStock(shortage)} L.`, 'error');
      return false;
    }
  }

  const mixed = subtractivePaintMix(validComponents);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  const liters = Number(s.totalLiters) || 1;
  const breakdown = calculateColorMixPriceBreakdown(s);
  const grandTotal = breakdown.grandTotal;
  const price = Number((grandTotal / liters).toFixed(2));
  const baseType = (document.getElementById('cm-base-type') ? document.getElementById('cm-base-type').value.trim() : s.baseType) || 'Automotive Paint';
  const note = (document.getElementById('cm-note') ? document.getElementById('cm-note').value.trim() : s.note) || '';

  const componentsData = validComponents.map(c => {
    const exactLiters = liters * (Number(c.pct) / 100);
    const compLiters = Number(exactLiters.toFixed(2));
    const p = productById(c.productId);
    const colorName = c.colorName || (p ? getProductColorName(p) : 'Original Color');
    const hex = c.hex || (p ? getProductDefaultColor(p) : '');
    const compType = c.type || (p ? (p.type || p.category || baseType || 'Paint') : (baseType || 'Paint'));
    return {
      productId: c.productId,
      name: c.name || (p ? p.name : 'Ingredient'),
      brand: c.brand || (p ? p.brand : ''),
      type: compType,
      colorName: colorName,
      color: colorName,
      price: Number(c.price) || 0,
      hex: hex,
      colorHex: hex,
      percentage: Number(c.pct),
      pctNum: Number(c.pct),
      liters: compLiters,
      exactLiters: Number(exactLiters.toFixed(4)),
      ml: Math.round(exactLiters * 1000),
      cost: Number((exactLiters * (Number(c.price) || 0)).toFixed(2)),
      preferredCanSize: Number(c.preferredCanSize) || 0,
      containerSource: ''
    };
  });

  const isExistingBuiltinPreset = Array.isArray(DEFAULT_COLOR_RECIPE_PRESETS) &&
    DEFAULT_COLOR_RECIPE_PRESETS.some(pr => cleanPresetColorName(pr.name).toLowerCase() === String(colorName || '').trim().toLowerCase());
  if (!isExistingBuiltinPreset) {
    saveMixedColorToPresets({
      colorName: colorName,
      detectedName: detected.name,
      hex: mixed.hex,
      baseType: baseType,
      components: componentsData,
      notes: s.isCustomizedFormula && s.originalCatalogName ? `Customized from ${s.originalCatalogName}` : ''
    });
  }

  const formulaSummary = componentsData.map(cp => `${cp.percentage}% ${cp.name} (${cp.liters}L)`).join(' + ');
  if (isPos) {
    cart.push({
      type: 'colormix',
      name: 'Custom Color Mix',
      colorName: colorName,
      detectedColorName: detected.name,
      isCustomizedFormula: Boolean(s.isCustomizedFormula),
      originalCatalogName: s.originalCatalogName || '',
      hexColor: mixed.hex,
      baseType: baseType,
      containerSizeLabel: `${fmtSize(liters)} Mix`,
      liters: liters,
      baseLiters: liters,
      qty: liters,
      unitPrice: price,
      baseGrandTotal: grandTotal,
      lineTotal: grandTotal,
      priceBreakdown: {
        basePaint: breakdown.basePaint,
        basePaintCost: breakdown.basePaintCost,
        basePct: breakdown.basePct,
        ingredients: breakdown.ingredients,
        totalColorantCost: breakdown.totalColorantCost,
        pigmentCost: breakdown.pigmentCost,
        totalColorantLiters: breakdown.totalColorantLiters,
        totalColorantMl: breakdown.totalColorantMl,
        totalColorantPct: breakdown.totalColorantPct,
        totalFormulaPct: Number(((Number(breakdown.basePct) || 0) + (Number(breakdown.totalColorantPct) || 0)).toFixed(1)),
        materialCost: breakdown.materialCost,
        serviceFee: breakdown.serviceFee,
        otherCharges: breakdown.otherCharges,
        grandTotal: breakdown.grandTotal,
        totalLiters: breakdown.totalLiters
      },
      note: note,
      components: componentsData
    });

    logAudit(
      'MIXING_COMPLETE',
      colorName,
      `Composed ${liters}L "${colorName}" [${detected.name} · ${mixed.hex}] (${baseType}) and queued to POS Cart — Formula: ${formulaSummary} · Total: ${peso(grandTotal)}`,
      {
        entityName: colorName,
        fieldChanged: 'Paint Color Mix Formula',
        oldValue: formulaSummary,
        newValue: `${liters}L ${colorName} [${detected.name} · ${mixed.hex}] (${peso(grandTotal)})`,
        reason: note || `${baseType} (Added to POS Cart)`
      }
    );

    closeModal();
    refreshCartUI();
    showToast(`Added ${liters}L "${colorName}" (${detected.name}) mix to sale.`, 'ok');
    return true;
  } else {
    // Direct movement logging from Stock Movements page
    const date = nowISO();
    const ingredientChanges = [];
    componentsData.forEach(comp => {
      const p = productById(comp.productId);
      if (p) {
        const beforeStock = Number(p.stock) || 0;
        const plan = consumeProductForColorMix(p, comp.liters, comp.preferredCanSize || 0);
        const mixNoteExtra = formatMixConsumptionNote(plan);
        comp.containerSource = mixNoteExtra ? mixNoteExtra.replace(/^[ ·\[]+|[ ·\]]+$/g, '').trim() : (comp.preferredCanSize ? `${comp.preferredCanSize}L container` : '');
        ingredientChanges.push({
          field: `${p.name} (${comp.percentage}%)`,
          oldValue: `${formatStock(beforeStock)}L`,
          newValue: `${formatStock(p.stock)}L`
        });
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'colormix',
          productId: p.productId || p.id,
          product_id: p.productId || p.id,
          productName: `${p.name} (for ${colorName} mix)`,
          colorName,
          qtyChange: -comp.liters,
          note: `Used in mixing ${liters}L "${colorName}" (${comp.percentage}% formula)${mixNoteExtra} · Stock: ${formatStock(beforeStock)}L→${formatStock(p.stock)}L`,
          staffName: (currentUser && currentUser.name) || 'Staff'
        });
      }
    });

    const shortFormulaSummary = componentsData.map(cp => `${cp.percentage}% ${cp.name}`).join(' + ');
    db.movements.push({
      id: uid('mv'),
      date,
      type: 'colormix',
      productId: null,
      productName: `Color Mix — ${colorName} [${detected.name}]`,
      colorName,
      hexColor: mixed.hex,
      colorHex: mixed.hex,
      detectedColorName: detected.name,
      components: componentsData,
      formulaJson: JSON.stringify(componentsData),
      qtyChange: liters,
      note: `${note ? note + ' · ' : ''}Formula: ${shortFormulaSummary}`,
      staffName: (currentUser && currentUser.name) || 'Staff'
    });

    logAudit(
      'MIXING_COMPLETE',
      colorName,
      `Completed ${liters}L "${colorName}" [${detected.name} · ${mixed.hex}] (${baseType}) mixing service — Formula: ${formulaSummary} · Value: ${peso(grandTotal)}`,
      {
        entityName: colorName,
        fieldChanged: 'Paint Color Mix & Ingredient Stock',
        oldValue: formulaSummary,
        newValue: `${liters}L ${colorName} [${detected.name} · ${mixed.hex}] (${peso(grandTotal)})`,
        reason: note || `${baseType} (Direct Inventory Mix)`,
        meta: { changes: ingredientChanges }
      }
    );

    await saveDB();
    closeModal();
    showToast(`Successfully logged ${liters}L "${colorName}" (${detected.name}) mixing service and deducted ingredients.`, 'ok');
    renderPage();
    return true;
  }
}

/* ============================================================
   COLOR LIBRARY INTEGRATION FOR PAINT MIXING STUDIO
   ============================================================ */

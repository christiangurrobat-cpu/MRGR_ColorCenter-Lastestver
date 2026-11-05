/* ============================================================
   COLOR MIXING & AUTOMATIC COLOR DETECTION ENGINE
   ============================================================ */

const PAINT_COLOR_DICTIONARY = [
  // Whites & Creams
  { name: 'Pure White', hex: '#FFFFFF', r: 255, g: 255, b: 255, family: 'White' },
  { name: 'Super White', hex: '#FDFDFD', r: 253, g: 253, b: 253, family: 'White' },
  { name: 'Pearl White', hex: '#F8F6F0', r: 248, g: 246, b: 240, family: 'White' },
  { name: 'Warm White', hex: '#F5F2EB', r: 245, g: 242, b: 235, family: 'White' },
  { name: 'Off White', hex: '#F2EDE4', r: 242, g: 237, b: 228, family: 'White' },
  { name: 'Ivory', hex: '#FFFFF0', r: 255, g: 255, b: 240, family: 'Cream' },
  { name: 'Alabaster', hex: '#F2F0EB', r: 242, g: 240, b: 235, family: 'White' },
  { name: 'Cream', hex: '#FFFDD0', r: 255, g: 253, b: 208, family: 'Cream' },
  { name: 'Vanilla', hex: '#F3E5AB', r: 243, g: 229, b: 171, family: 'Cream' },
  { name: 'Antique Linen', hex: '#FAF0E6', r: 250, g: 240, b: 230, family: 'Cream' },
  { name: 'Eggshell', hex: '#F0EAD6', r: 240, g: 234, b: 214, family: 'Cream' },

  // Yellows & Golds
  { name: 'Buttercup Yellow', hex: '#FCE883', r: 252, g: 232, b: 131, family: 'Yellow' },
  { name: 'Lemon Yellow', hex: '#FFF44F', r: 255, g: 244, b: 79, family: 'Yellow' },
  { name: 'Canary Yellow', hex: '#FFEF00', r: 255, g: 239, b: 0, family: 'Yellow' },
  { name: 'Pastel Yellow', hex: '#FFF9A6', r: 255, g: 249, b: 166, family: 'Yellow' },
  { name: 'Golden Sun', hex: '#FDB813', r: 253, g: 184, b: 19, family: 'Yellow' },
  { name: 'Goldenrod', hex: '#DAA520', r: 218, g: 165, b: 32, family: 'Yellow' },
  { name: 'Mustard Yellow', hex: '#E1AD01', r: 225, g: 173, b: 1, family: 'Yellow' },
  { name: 'Marigold', hex: '#EAA221', r: 234, g: 162, b: 33, family: 'Yellow' },
  { name: 'Amber Gold', hex: '#FFBF00', r: 255, g: 191, b: 0, family: 'Yellow' },
  { name: 'Ochre', hex: '#CC7722', r: 204, g: 119, b: 34, family: 'Yellow' },
  { name: 'Metallic Gold', hex: '#D4AF37', r: 212, g: 175, b: 55, family: 'Yellow' },

  // Oranges & Corals
  { name: 'Tangerine', hex: '#FF8500', r: 255, g: 133, b: 0, family: 'Orange' },
  { name: 'Bright Orange', hex: '#FF5F00', r: 255, g: 95, b: 0, family: 'Orange' },
  { name: 'Sunset Orange', hex: '#FD5E53', r: 253, g: 94, b: 83, family: 'Orange' },
  { name: 'Safety Orange', hex: '#FF6700', r: 255, g: 103, b: 0, family: 'Orange' },
  { name: 'Peach', hex: '#FFE5B4', r: 255, g: 229, b: 180, family: 'Orange' },
  { name: 'Apricot', hex: '#FBCEB1', r: 251, g: 206, b: 177, family: 'Orange' },
  { name: 'Coral', hex: '#FF7F50', r: 255, g: 127, b: 80, family: 'Orange' },
  { name: 'Salmon', hex: '#FA8072', r: 250, g: 128, b: 114, family: 'Orange' },
  { name: 'Terracotta', hex: '#E2725B', r: 226, g: 114, b: 91, family: 'Orange' },
  { name: 'Burnt Orange', hex: '#CC5500', r: 204, g: 85, b: 0, family: 'Orange' },
  { name: 'Rust', hex: '#B7410E', r: 183, g: 65, b: 14, family: 'Orange' },

  // Reds & Maroons
  { name: 'Signal Red', hex: '#E32636', r: 227, g: 38, b: 54, family: 'Red' },
  { name: 'Bright Red', hex: '#FF0000', r: 255, g: 0, b: 0, family: 'Red' },
  { name: 'Crimson Red', hex: '#DC143C', r: 220, g: 20, b: 60, family: 'Red' },
  { name: 'Ruby Red', hex: '#9B111E', r: 155, g: 17, b: 30, family: 'Red' },
  { name: 'Scarlet', hex: '#FF2400', r: 255, g: 36, b: 0, family: 'Red' },
  { name: 'Cherry Red', hex: '#D2042D', r: 210, g: 4, b: 45, family: 'Red' },
  { name: 'Cardinal Red', hex: '#C41E3A', r: 196, g: 30, b: 58, family: 'Red' },
  { name: 'Brick Red', hex: '#CB4154', r: 203, g: 65, b: 84, family: 'Red' },
  { name: 'Maroon', hex: '#800000', r: 128, g: 0, b: 0, family: 'Red' },
  { name: 'Burgundy', hex: '#800020', r: 128, g: 0, b: 32, family: 'Red' },
  { name: 'Wine Red', hex: '#722F37', r: 114, g: 47, b: 55, family: 'Red' },
  { name: 'Oxblood', hex: '#4A0000', r: 74, g: 0, b: 0, family: 'Red' },

  // Pinks & Magentas
  { name: 'Rose Pink', hex: '#FF66CC', r: 255, g: 102, b: 204, family: 'Pink' },
  { name: 'Blush Pink', hex: '#DE5D83', r: 222, g: 93, b: 131, family: 'Pink' },
  { name: 'Flamingo Pink', hex: '#FC8EAC', r: 252, g: 142, b: 172, family: 'Pink' },
  { name: 'Coral Pink', hex: '#F88379', r: 248, g: 131, b: 121, family: 'Pink' },
  { name: 'Magenta', hex: '#FF00FF', r: 255, g: 0, b: 255, family: 'Pink' },
  { name: 'Fuchsia', hex: '#C154C1', r: 193, g: 84, b: 193, family: 'Pink' },
  { name: 'Hot Pink', hex: '#FF69B4', r: 255, g: 105, b: 180, family: 'Pink' },
  { name: 'Pale Rose', hex: '#FADADD', r: 250, g: 218, b: 221, family: 'Pink' },
  { name: 'Bubblegum', hex: '#FFC1CC', r: 255, g: 193, b: 204, family: 'Pink' },

  // Violets & Purples
  { name: 'Lilac', hex: '#C8A2C8', r: 200, g: 162, b: 200, family: 'Purple' },
  { name: 'Lavender', hex: '#E6E6FA', r: 230, g: 230, b: 250, family: 'Purple' },
  { name: 'Wisteria', hex: '#C9A0DC', r: 201, g: 160, b: 220, family: 'Purple' },
  { name: 'Orchid', hex: '#DA70D6', r: 218, g: 112, b: 214, family: 'Purple' },
  { name: 'Violet', hex: '#8F00FF', r: 143, g: 0, b: 255, family: 'Purple' },
  { name: 'Royal Purple', hex: '#7851A9', r: 120, g: 81, b: 169, family: 'Purple' },
  { name: 'Amethyst', hex: '#9966CC', r: 153, g: 102, b: 204, family: 'Purple' },
  { name: 'Plum', hex: '#8E4585', r: 142, g: 69, b: 133, family: 'Purple' },
  { name: 'Deep Violet', hex: '#4B0082', r: 75, g: 0, b: 130, family: 'Purple' },
  { name: 'Eggplant', hex: '#614051', r: 97, g: 64, b: 81, family: 'Purple' },
  { name: 'Mauve', hex: '#E0B0FF', r: 224, g: 176, b: 255, family: 'Purple' },

  // Blues & Cyans
  { name: 'Sky Blue', hex: '#87CEEB', r: 135, g: 206, b: 235, family: 'Blue' },
  { name: 'Baby Blue', hex: '#89CFF0', r: 137, g: 207, b: 240, family: 'Blue' },
  { name: 'Powder Blue', hex: '#B0E0E6', r: 176, g: 224, b: 230, family: 'Blue' },
  { name: 'Ice Blue', hex: '#AFEEEE', r: 175, g: 238, b: 238, family: 'Blue' },
  { name: 'Cyan Blue', hex: '#00E5FF', r: 0, g: 229, b: 255, family: 'Blue' },
  { name: 'Turquoise', hex: '#40E0D0', r: 64, g: 224, b: 208, family: 'Blue' },
  { name: 'Teal Blue', hex: '#008080', r: 0, g: 128, b: 128, family: 'Blue' },
  { name: 'Cerulean', hex: '#007BA7', r: 0, g: 123, b: 167, family: 'Blue' },
  { name: 'Ocean Blue', hex: '#006994', r: 0, g: 105, b: 148, family: 'Blue' },
  { name: 'Royal Blue', hex: '#4169E1', r: 65, g: 105, b: 225, family: 'Blue' },
  { name: 'Cobalt Blue', hex: '#0047AB', r: 0, g: 71, b: 171, family: 'Blue' },
  { name: 'Sapphire Blue', hex: '#0F52BA', r: 15, g: 82, b: 186, family: 'Blue' },
  { name: 'Navy Blue', hex: '#000080', r: 0, g: 0, b: 128, family: 'Blue' },
  { name: 'Midnight Blue', hex: '#191970', r: 25, g: 25, b: 112, family: 'Blue' },
  { name: 'Steel Blue', hex: '#4682B4', r: 70, g: 130, b: 180, family: 'Blue' },
  { name: 'Denim Blue', hex: '#1560BD', r: 21, g: 96, b: 189, family: 'Blue' },
  { name: 'Slate Blue', hex: '#6A5ACD', r: 106, g: 90, b: 205, family: 'Blue' },

  // Greens & Olives
  { name: 'Mint Green', hex: '#98FF98', r: 152, g: 255, b: 152, family: 'Green' },
  { name: 'Seafoam Green', hex: '#93E9BE', r: 147, g: 233, b: 190, family: 'Green' },
  { name: 'Pistachio', hex: '#93C572', r: 147, g: 197, b: 114, family: 'Green' },
  { name: 'Lime Green', hex: '#32CD32', r: 50, g: 205, b: 50, family: 'Green' },
  { name: 'Chartreuse', hex: '#7FFF00', r: 127, g: 255, b: 0, family: 'Green' },
  { name: 'Apple Green', hex: '#8DB600', r: 141, g: 182, b: 0, family: 'Green' },
  { name: 'Emerald Green', hex: '#50C878', r: 80, g: 200, b: 120, family: 'Green' },
  { name: 'Kelly Green', hex: '#4CBB17', r: 76, g: 187, b: 23, family: 'Green' },
  { name: 'Leaf Green', hex: '#355E3B', r: 53, g: 94, b: 59, family: 'Green' },
  { name: 'Forest Green', hex: '#228B22', r: 34, g: 139, b: 34, family: 'Green' },
  { name: 'Hunter Green', hex: '#2E5B37', r: 46, g: 91, b: 55, family: 'Green' },
  { name: 'Pine Green', hex: '#01796F', r: 1, g: 121, b: 111, family: 'Green' },
  { name: 'Olive Green', hex: '#808000', r: 128, g: 128, b: 0, family: 'Green' },
  { name: 'Army Green', hex: '#4B5320', r: 75, g: 83, b: 32, family: 'Green' },
  { name: 'Sage Green', hex: '#9DC183', r: 157, g: 193, b: 131, family: 'Green' },
  { name: 'Celadon', hex: '#ACE1AF', r: 172, g: 225, b: 175, family: 'Green' },

  // Browns & Earth Tones
  { name: 'Tan', hex: '#D2B48C', r: 210, g: 180, b: 140, family: 'Brown' },
  { name: 'Sand', hex: '#C2B280', r: 194, g: 178, b: 128, family: 'Brown' },
  { name: 'Caramel', hex: '#FFD59A', r: 255, g: 213, b: 154, family: 'Brown' },
  { name: 'Beige', hex: '#F5F5DC', r: 245, g: 245, b: 220, family: 'Brown' },
  { name: 'Warm Taupe', hex: '#B38B6D', r: 179, g: 139, b: 109, family: 'Brown' },
  { name: 'Chestnut Brown', hex: '#954535', r: 149, g: 69, b: 53, family: 'Brown' },
  { name: 'Mocha', hex: '#967969', r: 150, g: 121, b: 105, family: 'Brown' },
  { name: 'Walnut', hex: '#773F1A', r: 119, g: 63, b: 26, family: 'Brown' },
  { name: 'Chocolate Brown', hex: '#3D2314', r: 61, g: 35, b: 20, family: 'Brown' },
  { name: 'Espresso', hex: '#2B1700', r: 43, g: 23, b: 0, family: 'Brown' },

  // Grays, Silvers & Blacks
  { name: 'Pure Black', hex: '#000000', r: 0, g: 0, b: 0, family: 'Black' },
  { name: 'Jet Black', hex: '#1B1B1B', r: 27, g: 27, b: 27, family: 'Black' },
  { name: 'Charcoal Gray', hex: '#36454F', r: 54, g: 69, b: 79, family: 'Gray' },
  { name: 'Slate Gray', hex: '#708090', r: 112, g: 128, b: 144, family: 'Gray' },
  { name: 'Gunmetal Gray', hex: '#2A3439', r: 42, g: 52, b: 57, family: 'Gray' },
  { name: 'Dark Gray', hex: '#5A5A5A', r: 90, g: 90, b: 90, family: 'Gray' },
  { name: 'Medium Gray', hex: '#808080', r: 128, g: 128, b: 128, family: 'Gray' },
  { name: 'Silver Gray', hex: '#C0C0C0', r: 192, g: 192, b: 192, family: 'Gray' },
  { name: 'Light Gray', hex: '#D3D3D3', r: 211, g: 211, b: 211, family: 'Gray' },
  { name: 'Smoke Gray', hex: '#726E6D', r: 114, g: 110, b: 109, family: 'Gray' },
  { name: 'Ash Gray', hex: '#B2BEB5', r: 178, g: 190, b: 181, family: 'Gray' }
];

function hexToRgb(hex) {
  hex = String(hex || '').replace('#', '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return { r: 255, g: 255, b: 255 };
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = v => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function isLightColor(hex) {
  const rgb = hexToRgb(hex);
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) > 165;
}

function getProductDefaultColor(product) {
  if (!product) return '#FFFFFF';
  if (product.colorHex && /^#[0-9A-Fa-f]{6}$/i.test(product.colorHex)) {
    return product.colorHex;
  }
  const str = `${product.color || ''} ${product.name || ''}`.toLowerCase();
  if (product.color && product.color.startsWith('#') && (product.color.length === 4 || product.color.length === 7)) {
    return product.color;
  }
  for (const item of PAINT_COLOR_DICTIONARY) {
    if (str.includes(item.name.toLowerCase())) {
      return item.hex;
    }
  }
  // Keyword fallbacks
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

function subtractivePaintMix(components) {
  if (!components || !components.length) return { r: 255, g: 255, b: 255, hex: '#FFFFFF' };

  const valid = components.filter(c => Number(c.pct) > 0);
  if (!valid.length) return { r: 255, g: 255, b: 255, hex: '#FFFFFF' };

  const totalPct = valid.reduce((sum, c) => sum + Number(c.pct), 0);
  if (totalPct <= 0) return { r: 255, g: 255, b: 255, hex: '#FFFFFF' };

  // Subtractive CMYK Pigment Mix
  let totalC = 0, totalM = 0, totalY = 0, totalK = 0;

  valid.forEach(c => {
    const weight = Number(c.pct) / totalPct;
    const rgb = hexToRgb(c.hex || '#FFFFFF');

    // Normalize RGB to 0..1
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    // Convert to CMYK
    const k = 1 - Math.max(r, g, b);
    let cyan = 0, magenta = 0, yellow = 0;
    if (k < 1) {
      cyan = (1 - r - k) / (1 - k);
      magenta = (1 - g - k) / (1 - k);
      yellow = (1 - b - k) / (1 - k);
    }

    totalC += cyan * weight;
    totalM += magenta * weight;
    totalY += yellow * weight;
    totalK += k * weight;
  });

  // Convert mixed CMYK back to RGB
  const finalR = Math.round(255 * (1 - totalC) * (1 - totalK));
  const finalG = Math.round(255 * (1 - totalM) * (1 - totalK));
  const finalB = Math.round(255 * (1 - totalY) * (1 - totalK));

  const hex = rgbToHex(finalR, finalG, finalB);
  return { r: finalR, g: finalG, b: finalB, hex };
}

function detectMixedColorName(r, g, b) {
  let closest = PAINT_COLOR_DICTIONARY[0];
  let minDistance = Infinity;

  PAINT_COLOR_DICTIONARY.forEach(item => {
    // Weighted Euclidean color distance (perceptual for human eye)
    const dR = r - item.r;
    const dG = g - item.g;
    const dB = b - item.b;
    const dist = Math.sqrt(2 * dR * dR + 4 * dG * dG + 3 * dB * dB);

    if (dist < minDistance) {
      minDistance = dist;
      closest = item;
    }
  });

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
  openCategories: {}
};

function colorMixAvailableProducts(filterByType = true) {
  const all = activeProducts().filter(p => productMixAvailableStock(p) > 0);
  if (filterByType && colorMixStudioState && colorMixStudioState.typeFilter && colorMixStudioState.typeFilter !== 'all') {
    const filtered = all.filter(p => (p.type || '').toLowerCase() === colorMixStudioState.typeFilter.toLowerCase());
    if (filtered.length > 0) return filtered;
  }
  return all;
}

function initColorMixStudioState() {
  const prods = colorMixAvailableProducts(false);
  const prod1 = prods[0] || null;
  const prod2 = prods[1] || prod1;

  colorMixStudioState = {
    components: [
      {
        id: uid('cmc'),
        productId: prod1 ? prod1.id : '',
        name: prod1 ? prod1.name : 'Component A',
        brand: prod1 ? prod1.brand : '',
        stock: prod1 ? prod1.stock : 0,
        price: prod1 ? prod1.price : 350,
        hex: prod1 ? getProductDefaultColor(prod1) : '#FFFFFF',
        pct: 60,
        preferredCanSize: 0
      },
      {
        id: uid('cmc'),
        productId: prod2 ? prod2.id : '',
        name: prod2 ? prod2.name : 'Component B',
        brand: prod2 ? prod2.brand : '',
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
    typeFilter: 'all',
    openPickerIdx: -1,
    pickerSearch: '',
    inlineSearchIdx: -1,
    inlineSearchQuery: '',
    openCategories: {}
  };

  updateColorMixCalculation(true);
}

function updateColorMixCalculation(autoUpdateName = false) {
  const mixed = subtractivePaintMix(colorMixStudioState.components);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);

  if (!colorMixStudioState.userCustomizedName || autoUpdateName || !colorMixStudioState.colorName) {
    colorMixStudioState.colorName = detected.name;
  }

  // Calculate weighted price per liter + ₱50 mixing service fee
  const valid = colorMixStudioState.components.filter(c => Number(c.pct) > 0);
  const totalPct = valid.reduce((sum, c) => sum + Number(c.pct), 0) || 100;
  let weightedPrice = 0;
  valid.forEach(c => {
    weightedPrice += (Number(c.price) || 350) * (Number(c.pct) / totalPct);
  });
  const recommendedPrice = Math.max(250, Math.round(weightedPrice + 50));

  if (!colorMixStudioState.userCustomizedPrice) {
    colorMixStudioState.pricePerLiter = recommendedPrice;
  }
}

function openColorMixModal(isPos = true) {
  initColorMixStudioState();
  colorMixStudioState.isPosMode = (isPos !== false);
  const totalLiters = colorMixStudioState.totalLiters || 1;
  const grandTotal = totalLiters * (colorMixStudioState.pricePerLiter || 0);
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
    ${isPos ? `+ Add ${totalLiters}L Mixed Color (${peso(grandTotal)}) to Sale` : `✓ Confirm & Log ${totalLiters}L Movement`}
  </button>
`,
    'xl'
  );
  if (typeof syncColorMixVisuals === 'function') syncColorMixVisuals();
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
    const grandTotal = totalLiters * (s.pricePerLiter || 0);
    const isPos = s.isPosMode !== false;
    btn.innerHTML = isPos
      ? `+ Add ${totalLiters}L Mixed Color (${peso(grandTotal)}) to Sale`
      : `✓ Confirm & Log ${totalLiters}L Movement (${peso(grandTotal)})`;
  }
  if (typeof syncColorMixVisuals === 'function') syncColorMixVisuals();
}


const CUSTOM_COLOR_PRESETS_KEY = 'mrgr_custom_color_presets';

const DEFAULT_COLOR_RECIPE_PRESETS = [
  { name: '🌸 Pastel Rose', desc: 'Soft blush pink blend (70% White + 30% Red)', hex: '#F7D6DC', recipe: [{ colorHint: 'white', pct: 70 }, { colorHint: 'red', pct: 30 }] },
  { name: '🌊 Ocean Aqua', desc: 'Fresh sky-blue tint (60% White + 40% Blue)', hex: '#4A90E2', recipe: [{ colorHint: 'white', pct: 60 }, { colorHint: 'blue', pct: 40 }] },
  { name: '🌿 Sage Meadow', desc: 'Soothing organic green (50% White + 30% Green + 20% Yellow)', hex: '#7E9F76', recipe: [{ colorHint: 'white', pct: 50 }, { colorHint: 'green', pct: 30 }, { colorHint: 'yellow', pct: 20 }] },
  { name: '🌅 Sunset Coral', desc: 'Warm glowing earth tone (40% White + 35% Orange + 25% Red)', hex: '#DF6943', recipe: [{ colorHint: 'white', pct: 40 }, { colorHint: 'orange', pct: 35 }, { colorHint: 'red', pct: 25 }] },
  { name: '☕ Creamy Latte', desc: 'Warm cozy neutral (60% White + 30% Brown + 10% Yellow)', hex: '#A8896C', recipe: [{ colorHint: 'white', pct: 60 }, { colorHint: 'brown', pct: 30 }, { colorHint: 'yellow', pct: 10 }] },
  { name: '🍋 Lemon Custard', desc: 'Sunny vibrant pastel (70% White + 30% Yellow)', hex: '#FDF289', recipe: [{ colorHint: 'white', pct: 70 }, { colorHint: 'yellow', pct: 30 }] },
  { name: '🌙 Modern Slate', desc: 'Contemporary cool dark tone (60% White + 35% Black + 5% Blue)', hex: '#586A7A', recipe: [{ colorHint: 'white', pct: 60 }, { colorHint: 'black', pct: 35 }, { colorHint: 'blue', pct: 5 }] },
  { name: '🍇 Lavender Mist', desc: 'Delicate floral violet (65% White + 25% Purple + 10% Blue)', hex: '#B5A0CC', recipe: [{ colorHint: 'white', pct: 65 }, { colorHint: 'purple', pct: 25 }, { colorHint: 'blue', pct: 10 }] },
  { name: '🫒 Olive Grove', desc: 'Refined deep olive (40% White + 40% Yellow + 20% Black)', hex: '#728038', recipe: [{ colorHint: 'white', pct: 40 }, { colorHint: 'yellow', pct: 40 }, { colorHint: 'black', pct: 20 }] }
];

function loadSavedCustomColorPresets() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLOR_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

const COLOR_RECIPE_PRESETS = [
  ...DEFAULT_COLOR_RECIPE_PRESETS,
  ...loadSavedCustomColorPresets()
];

function saveMixedColorToPresets({ colorName, detectedName, hex, baseType, components }) {
  if (!colorName || !Array.isArray(components) || !components.length) return;
  const cleanName = colorName.trim();
  const recipeDesc = components.map(c => `${c.percentage}% ${c.name}`).join(' + ');
  const newPreset = {
    name: cleanName,
    desc: `${detectedName || cleanName} (${recipeDesc})`,
    hex: hex || '#1F6F6B',
    baseType: baseType || 'Automotive Paint',
    isCustom: true,
    recipe: components.map(c => ({
      productId: c.productId || '',
      name: c.name || '',
      hex: c.hex || '',
      colorHint: (c.name || '').toLowerCase(),
      pct: Number(c.percentage) || 0
    }))
  };

  const existingIdx = COLOR_RECIPE_PRESETS.findIndex(
    p => p.isCustom && (p.name || '').trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (existingIdx >= 0) {
    COLOR_RECIPE_PRESETS[existingIdx] = newPreset;
  } else {
    COLOR_RECIPE_PRESETS.push(newPreset);
  }

  try {
    const customOnly = COLOR_RECIPE_PRESETS.filter(p => p.isCustom);
    localStorage.setItem(CUSTOM_COLOR_PRESETS_KEY, JSON.stringify(customOnly));
  } catch (e) {
    console.warn('Could not persist custom color presets', e);
  }
}

function findMatchingProductForRecipeItem(item, prods, allAvailProds) {
  const pool = prods && prods.length ? prods : (allAvailProds || []);
  // 1. Exact productId match first (for saved custom mixes)
  if (item.productId) {
    const exactInPool = pool.find(prod => prod.id === item.productId) ||
      (allAvailProds || []).find(prod => prod.id === item.productId);
    if (exactInPool) return { product: exactInPool, reason: null };
    const rawProd = typeof productById === 'function' ? productById(item.productId) : null;
    if (rawProd) {
      if (productMixAvailableStock(rawProd) <= 0) {
        return { product: null, reason: `${rawProd.name} is out of stock` };
      }
    }
  }

  // 2. Match by colorHint or name in available products (above threshold)
  const hint = String(item.colorHint || item.name || '').trim().toLowerCase();
  if (hint) {
    const matchFn = prod => {
      const s = `${prod.color || ''} ${prod.name || ''}`.toLowerCase();
      if (s.includes(hint)) return true;
      const hex = getProductDefaultColor(prod);
      const rgb = hexToRgb(hex);
      const det = detectMixedColorName(rgb.r, rgb.g, rgb.b);
      if (det && det.family && det.family.toLowerCase() === hint) return true;
      if (det && det.name && det.name.toLowerCase().includes(hint)) return true;
      return false;
    };
    const found = pool.find(matchFn) || (allAvailProds || []).find(matchFn);
    if (found) return { product: found, reason: null };

    const lowMatch = (typeof activeProducts === 'function' ? activeProducts() : []).find(matchFn);
    if (lowMatch) {
      return { product: null, reason: `${lowMatch.name} is low/out of stock (${formatStock(lowMatch.stock)}L)` };
    }
    return { product: null, reason: `Missing ${item.name || item.colorHint} paint` };
  }

  return { product: null, reason: 'Missing ingredient in inventory' };
}

function evaluateRecipePresetAvailability(preset, totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters ? colorMixStudioState.totalLiters : 1)) {
  if (!preset || !Array.isArray(preset.recipe) || !preset.recipe.length) {
    return { available: false, lackingReasons: ['Empty recipe'], resolvedItems: [] };
  }
  const prods = colorMixAvailableProducts();
  const allAvailProds = colorMixAvailableProducts(false);
  const lackingReasons = [];
  const resolvedItems = [];
  const litersByProductId = new Map();

  preset.recipe.forEach(item => {
    const reqLiters = Number(((totalLiters * (Number(item.pct) / 100)) || 0).toFixed(2));
    const { product, reason } = findMatchingProductForRecipeItem(item, prods, allAvailProds);
    if (!product) {
      lackingReasons.push(reason || `Missing ${item.name || item.colorHint || 'ingredient'}`);
      resolvedItems.push({ item, product: null, reqLiters });
    } else {
      const prevReq = litersByProductId.get(product.id) || 0;
      litersByProductId.set(product.id, Number((prevReq + reqLiters).toFixed(2)));
      resolvedItems.push({ item, product, reqLiters });
    }
  });

  litersByProductId.forEach((totalReq, prodId) => {
    const prod = typeof productById === 'function' ? productById(prodId) : null;
    if (prod) {
      const avail = productMixAvailableStock(prod);
      if (avail < totalReq) {
        lackingReasons.push(`${prod.name} (need ${formatStock(totalReq)}L, have ${formatStock(avail)}L)`);
      }
    }
  });

  return {
    available: lackingReasons.length === 0,
    lackingReasons,
    resolvedItems
  };
}

function renderColorMixPresetChipsHtml() {
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  return `
    <span class="muted small" style="font-size:11px; font-weight:600; margin-right:2px;">💡 Presets:</span>
    ${COLOR_RECIPE_PRESETS.map((preset, pIdx) => {
      const check = evaluateRecipePresetAvailability(preset, totalLiters);
      const isLacking = !check.available;
      const tooltip = isLacking
        ? `${preset.desc} — ⚠️ Lacking ingredients: ${check.lackingReasons.join('; ')}`
        : preset.desc;
      return `
        <button class="cm-preset-chip ${isLacking ? 'lacking' : ''}" type="button" onclick="applyRecipePreset(${pIdx})" title="${escapeHtml(tooltip)}">
          <span class="cm-color-dot" style="background-color:${preset.hex};"></span>
          <span>${escapeHtml(preset.name)}</span>
        </button>
      `;
    }).join('')}
  `;
}

function applyRecipePreset(presetIndex) {
  const p = COLOR_RECIPE_PRESETS[presetIndex];
  if (!p) return;
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const check = evaluateRecipePresetAvailability(p, totalLiters);
  if (!check.available) {
    showToast(`Cannot load "${p.name}": Lacking ingredients (${check.lackingReasons.join(', ')}).`, 'error');
    return;
  }

  const newComponents = check.resolvedItems.map(({ item, product }) => ({
    id: uid('cmc'),
    productId: product.id,
    name: product.name,
    brand: product.brand,
    stock: product.stock,
    price: product.price,
    hex: getProductDefaultColor(product),
    pct: item.pct,
    preferredCanSize: 0
  }));

  colorMixStudioState.components = newComponents;
  if (p.baseType) {
    colorMixStudioState.baseType = p.baseType;
  }
  if (p.isCustom) {
    colorMixStudioState.colorName = p.name;
    colorMixStudioState.userCustomizedName = true;
    updateColorMixCalculation(false);
  } else {
    colorMixStudioState.userCustomizedName = false;
    updateColorMixCalculation(true);
  }
  renderColorMixStudio();
  showToast(`Loaded recipe preset: ${p.name}!`, 'ok');
}

function adjustComponentPct(idx, delta) {
  if (!colorMixStudioState.components[idx]) return;
  let val = (Number(colorMixStudioState.components[idx].pct) || 0) + delta;
  val = Math.max(0, Math.min(100, Math.round(val * 10) / 10));
  colorMixStudioState.components[idx].pct = val;
  const input = document.getElementById(`cm-pct-input-${idx}`);
  if (input) input.value = val;
  if (typeof syncColorMixVisuals === 'function') {
    syncColorMixVisuals(idx);
  } else {
    updateColorMixCalculation();
    renderColorMixStudio();
  }
}

function resetColorMixToDefault() {
  initColorMixStudioState();
  renderColorMixStudio();
  showToast('Reset mixing formula to default 60/40 blend.', 'ok');
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

function applyFinishPreset(sheen) {
  const input = document.getElementById('cm-note');
  let current = colorMixStudioState.note || '';
  const sheens = ['Gloss', 'Semi-Gloss', 'Satin', 'Matte', 'Metallic', 'Textured'];
  sheens.forEach(s => {
    current = current.replace(new RegExp(s + ' Finish', 'gi'), '').replace(new RegExp(s, 'gi'), '').trim();
  });
  current = current.replace(/^[·\s,]+|[·\s,]+$/g, '');
  colorMixStudioState.note = (current ? current + ' · ' : '') + `${sheen} Finish`;
  if (input) input.value = colorMixStudioState.note;
  renderColorMixStudio();
  showToast(`Applied finish sheen: ${sheen}`, 'ok');
}

function colorMixStudioHtml() {
  const s = colorMixStudioState;
  const prods = colorMixAvailableProducts();

  // Ensure current components do not point to products at or below threshold
  s.components.forEach((c, idx) => {
    if (c.productId && !prods.some(p => p.id === c.productId)) {
      const fallback = prods[idx % (prods.length || 1)] || null;
      if (fallback) {
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
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients;
  const grandTotal = (s.totalLiters || 1) * (s.pricePerLiter || 0);

  return `
  <!-- Single Clean Top Toolbar: Quick Presets + Balance Status -->
  <div class="cm-inspirations-bar" style="margin-bottom:12px; padding:10px 14px;">
    <div class="row wrap" style="justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
      <div class="row wrap" style="gap:6px; align-items:center;">
        <div class="row wrap" style="gap:4px; align-items:center;">
          <span class="muted small" style="font-size:11px;">Type:</span>
          ${['all', 'Latex', 'Acrylic', 'Enamel', 'Quick Dry'].map(tf => `
            <button type="button" class="cm-preset-btn ${(s.typeFilter || 'all') === tf ? 'active' : ''}" style="font-size:10px; padding:2px 7px;" onclick="setColorMixTypeFilter('${tf}')">${tf === 'all' ? 'All' : tf}</button>
          `).join('')}
        </div>
      </div>

      <div class="row" style="gap:6px; align-items:center;">
        <span id="cm-balance-badge" class="badge ${isPctBalanced ? 'ok' : 'low'}" style="font-size:11px; padding:4px 10px;">
          ${isPctBalanced ? '✓ 100% Balanced' : `⚠️ ${totalPctRounded}% (${totalPctRounded > 100 ? (Math.round((totalPctRounded - 100) * 10) / 10) + '% Over' : (Math.round((100 - totalPctRounded) * 10) / 10) + '% Needed'})`}
        </span>
        <span id="cm-autobalance-slot">
          ${!isPctBalanced ? `<button class="btn ghost small" onclick="balanceColorMixTo100()" style="font-size:11px; padding:3px 8px; font-weight:700; color:var(--teal);">🎯 Auto-Balance</button>` : ''}
        </span>
        <button class="btn ghost small" onclick="resetColorMixToDefault()" style="font-size:11px; padding:2px 7px;">🔄 Reset</button>
      </div>
    </div>

    <!-- Quick Recipe Inspiration Chips -->
    <div id="cm-preset-chips-wrap" class="row wrap" style="gap:5px; align-items:center;">
      ${renderColorMixPresetChipsHtml()}
    </div>
  </div>

  <div class="cm-studio-layout">
<!-- LEFT COLUMN: Formula Ingredients & Ratio Sliders -->
<div>
  <div class="cm-card">
    <div class="cm-card-title">
      <span>📦 Formula Ingredients (${s.components.length} Paint${s.components.length === 1 ? '' : 's'})</span>
      <button class="btn secondary small" style="font-size:11px; padding:3px 9px;" onclick="openColorMixPigmentDrawer('add')">+ Add Pigment</button>
    </div>

    <!-- Segmented Visual Recipe Bar -->
    <div id="cm-recipe-bar" class="cm-recipe-bar" title="Recipe Color Breakdown" style="margin-bottom:10px;">
      ${s.components.map((c, idx) => `
        <div id="cm-recipe-seg-${idx}" class="cm-recipe-segment" style="width:${Math.max(0, Math.min(100, c.pct))}%; background-color:${c.hex || '#FFFFFF'};" title="${escapeHtml(c.name)}: ${c.pct}%">
          <span>${c.pct >= 7 ? `${Math.round(c.pct)}%` : ''}</span>
        </div>
      `).join('')}
    </div>

    <!-- Clean Ingredient List -->
    <div id="cm-ingredients-list">
      ${s.components.map((c, idx) => {
    const reqLiters = Number(((s.totalLiters * (c.pct / 100)) || 0).toFixed(2));
    const prodObj = c.productId ? productById(c.productId) : null;
    const openedAvail = prodObj ? productOpenedStock(prodObj) : 0;
    const prefCan = Number(c.preferredCanSize) || 0;
    const mixPlan = prodObj ? previewColorMixConsumption(prodObj, reqLiters, prefCan) : null;
    const hasStock = prodObj ? productMixAvailableStock(prodObj) >= reqLiters : c.stock >= reqLiters;
    const fillPct = Math.max(0, Math.min(100, c.pct));
    const isPickerOpen = s.openPickerIdx === idx;
    return `
        <div class="cm-ingredient-item" id="cm-ing-item-${idx}" style="padding:10px 12px; margin-bottom:9px;">
          <div class="cm-ing-grid">
            <!-- Product Color Swatch (Clickable to open Sliding Color Card Drawer) -->
            <div class="cm-swatch-display" id="cm-swatch-box-${idx}" onclick="openColorMixPigmentDrawer(${idx})" style="background-color:${c.hex || '#FFFFFF'}; cursor:pointer;" title="Click to change paint (${escapeHtml(c.name || 'Component')} · ${c.hex || '#FFFFFF'})">
              <span class="cm-swatch-shine"></span>
            </div>

            <!-- Single Clean Clickable Paint Card (Opens Drawer with Avatar Search + Accordions + Color Cards) -->
            <div class="cm-pigment-selector-box">
              <button type="button" class="cm-pigment-card-btn ${isPickerOpen ? 'open' : ''}" onclick="openColorMixPigmentDrawer(${idx})" title="Click to choose paint using visual color cards, smart avatar search, or categories">
                <div style="min-width:0; flex:1;">
                  <div class="row" style="gap:6px; align-items:center; flex-wrap:wrap;">
                    <span class="badge" style="background:var(--teal-dark); color:#fff; font-size:9.5px; padding:1px 5px;">#${idx + 1}</span>
                    <strong style="font-size:13px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(prodObj ? prodObj.name : (c.name || 'Select Paint Product'))}</strong>
                    <span class="badge" style="background:#EFECE6; color:var(--ink-soft); font-size:10px; padding:1px 6px;">${escapeHtml(prodObj && prodObj.type ? prodObj.type : 'Paint')}</span>
                  </div>
                  <div class="muted" style="font-size:11px; margin-top:2px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <span>${escapeHtml(prodObj ? prodObj.brand : (c.brand || 'No Brand'))} · ${peso(c.price)}/L</span>
                    ${openedAvail > 0
        ? `<span style="color:#9A6216; font-weight:600;">🫙 ${productOpenedSizesLabel(prodObj)} opened</span>`
        : `<span id="cm-stock-badge-${idx}" class="${hasStock ? '' : 'low'}" style="color:${hasStock ? 'var(--teal-dark)' : 'var(--danger)'}; font-weight:600;">🥫 ${formatStock(c.stock)}L sealed</span>`}
                  </div>
                </div>
                <span class="badge" style="background:#EAF4F3; color:var(--teal-dark); border:1px solid #C5DFDC; font-size:10.5px; padding:4px 9px; flex-shrink:0; font-weight:700;">
                  🎨 Change Paint &rarr;
                </span>
              </button>
            </div>

            <!-- Percentage Box with Live Input Typing (0 - 100 Limit) -->
            <div class="cm-pct-input-wrap">
              <input id="cm-pct-input-${idx}" type="number" min="0" max="100" step="any" value="${c.pct}" oninput="onColorMixPctLive(${idx}, this)" onchange="onColorMixPctChange(${idx}, this)" onkeydown="if(event.key === '-' || event.key === 'e' || event.key === 'E') event.preventDefault();" title="Type percentage number (0 to 100)">
              <span style="font-weight:700; font-size:12.5px; color:var(--ink-soft);">%</span>
            </div>

            <!-- Remove Button -->
            <div>
              ${s.components.length > 2 ? `
                <button class="cm-btn-remove-ing" onclick="removeColorMixIngredient(${idx})" title="Remove this ingredient">&times;</button>
              ` : `<span style="width:28px; display:inline-block;"></span>`}
            </div>
          </div>

          <!-- Interactive Ratio Slider -->
          <div class="cm-slider-row" style="margin-top:7px;">
            <div class="cm-step-btn-group">
              <button type="button" class="cm-step-btn" onclick="adjustComponentPct(${idx}, -5)" title="Decrease by 5%">-5%</button>
            </div>
            <input id="cm-slider-${idx}" type="range" class="cm-slider" min="0" max="100" step="0.5" value="${c.pct}" 
              style="--thumb-color:${c.hex || '#1F6F6B'}; background:linear-gradient(to right, ${c.hex || '#1F6F6B'} 0%, ${c.hex || '#1F6F6B'} ${fillPct}%, #E6DFD3 ${fillPct}%, #E6DFD3 100%);"
              oninput="onColorMixSliderLive(${idx}, this.value)" 
              onchange="onColorMixSliderChange(${idx}, this.value)">
            <span id="cm-slider-pct-pill-${idx}" class="cm-slider-pct-pill" style="background:${c.hex || '#1F6F6B'}; color:${isLightColor(c.hex || '#1F6F6B') ? '#1C1917' : '#FFFFFF'};">
              ${c.pct}%
            </span>
            <div class="cm-step-btn-group">
              <button type="button" class="cm-step-btn" onclick="adjustComponentPct(${idx}, 5)" title="Increase by 5%">+5%</button>
            </div>
          </div>

          <!-- Compact Volume & Can Size Row -->
          <div class="row" style="margin-top:6px; font-size:10.5px; color:var(--ink-soft); justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span>Need: <b id="cm-req-liters-${idx}">${formatStock(reqLiters)}L</b> · <span id="cm-mix-source-${idx}" style="color:var(--teal-dark); font-weight:500;">${formatColorMixSourcePreview(mixPlan)}</span></span>
            <div class="row wrap" style="gap:3px; align-items:center;">
              <span class="muted" style="font-size:10px;">Can:</span>
              <button type="button" class="cm-preset-btn ${prefCan === 0 ? 'active' : ''}" style="font-size:9.5px; padding:1px 5px;" onclick="setColorMixPreferredCanSize(${idx}, 0)" title="Automatically choose the best-fitting available can size">Auto</button>
              ${(prodObj ? productSizes(prodObj) : CAN_SIZES).map(sz => {
          const hasBd = prodObj ? productHasCanBreakdown(prodObj) : false;
          const cnt = prodObj ? productCanCount(prodObj, sz) : 0;
          const avail = prodObj ? (hasBd ? cnt > 0 : prodObj.stock >= sz) : false;
          return `<button type="button" class="cm-preset-btn ${prefCan === sz ? 'active' : ''}" style="font-size:9.5px; padding:1px 5px; ${!avail ? 'opacity:0.4;' : ''}" ${!avail ? 'disabled' : ''} onclick="setColorMixPreferredCanSize(${idx}, ${sz})" title="${hasBd ? `${cnt} × ${sz}L sealed can(s) in stock` : `Open a ${sz}L can`}">${sz}L${hasBd ? ` (${cnt})` : ''}</button>`;
        }).join('')}
            </div>
          </div>
        </div>`;
  }).join('')}
    </div>

    <!-- Quick Balance Tools -->
    <div class="row wrap" style="gap:6px; margin-top:6px; justify-content:space-between; align-items:center;">
      <div class="row wrap" style="gap:5px;">
        <button class="cm-preset-btn" onclick="equalizeColorMixPcts()">⚖️ Equalize</button>
        <button class="cm-preset-btn" onclick="balanceColorMixTo100()">🎯 Auto-Balance 100%</button>
      </div>
      <small class="muted" style="font-weight:600;">${isPctBalanced ? '✓ 100% Total' : `Remaining: ${Math.round((100 - totalPct) * 10) / 10}%`}</small>
    </div>
  </div>
</div>

<!-- RIGHT COLUMN: Visual Glass Beaker, Detection Hero, Can Sizes & Specs -->
<div>
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
          <code id="cm-beaker-hex" style="font-weight:700; color:var(--teal); font-size:11px;">${mixed.hex}</code>
        </div>
        <div class="muted">
          Volume: <b id="cm-beaker-volume">${s.totalLiters} Liter${s.totalLiters === 1 ? '' : 's'}</b> · Total Components: <b>${s.components.length}</b>
        </div>
        <div id="cm-beaker-chips" class="row wrap" style="gap:4px; margin-top:2px;">
          ${s.components.map((c, idx) => `
            <span id="cm-beaker-pct-${idx}" class="badge" style="font-size:10px; padding:1px 5px; background:#fff; border:1px solid var(--line);">
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
      <div class="cm-detected-pill" id="cm-detected-pill">
        <span>✨ Detected:</span>
        <span id="cm-detected-pill-name">${escapeHtml(detected.name)}</span>
      </div>
    </div>

    <!-- Detection & Specs Card -->
    <div class="cm-detected-box">
      <div class="cm-detected-header">
        <span>Color Identification &amp; Tone</span>
        <button class="btn ghost small" onclick="copyHexToClipboard(colorMixStudioState.cachedHex || '${mixed.hex}')" style="font-size:10.5px; padding:1px 5px; color:var(--teal);" title="Copy Hex Code">📋 Copy Hex</button>
      </div>
      <div class="cm-detected-title">
        <span id="cm-detected-dot" class="cm-color-dot" style="background:${mixed.hex}; width:16px; height:16px;"></span>
        <span id="cm-detected-title-text" style="flex:1;">${escapeHtml(detected.name)}</span>
        <button class="cm-preset-btn" onclick="applyDetectedColorName()" style="font-size:11px; padding:2px 7px;" title="Use detected name for this formula">🪄 Use Color Name</button>
      </div>
      <div id="cm-tone-info" class="muted small" style="margin-top:3px; font-size:11px;">
        Tone Family: <b>${detected.family} Tone</b> · CMYK Pigment Model
      </div>
    </div>

    <!-- Service & Sale Inputs -->
    <div class="form-grid" style="text-align:left; gap:8px;">
      <div class="field full">
        <label for="cm-color-name" style="font-size:12px; font-weight:700;">Formula / Color Name <span style="color:var(--danger);">*</span></label>
        <input id="cm-color-name" type="text" value="${escapeHtml(s.colorName)}" oninput="colorMixStudioState.colorName=this.value; colorMixStudioState.userCustomizedName=true;" placeholder="e.g. ${escapeHtml(detected.name)}" required>
      </div>

      <div class="field full">
        <label style="font-size:12px; font-weight:700;">Container / Can Size &amp; Volume:</label>
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
          <input id="cm-liters" type="number" min="0.1" step="0.5" style="width:80px; padding:4px 6px; font-weight:700;" value="${s.totalLiters}" onchange="onColorMixTotalLitersChange(this.value)" oninput="onColorMixTotalLitersChange(this.value)" required>
          <span class="muted small">Liters</span>
        </div>
      </div>

      <div class="field">
        <label for="cm-price" style="font-size:12px; font-weight:700;">Price per Liter (₱)</label>
        <input id="cm-price" type="number" min="0" step="1" value="${s.pricePerLiter}" onchange="this.value=Math.round(Number(this.value)||0); colorMixStudioState.pricePerLiter=Number(this.value); colorMixStudioState.userCustomizedPrice=true; syncColorMixVisuals();" required>
        <small class="muted" style="display:block; margin-top:2px; font-size:10.5px;">Auto-calculated base + ₱50 service fee</small>
      </div>

      <div class="field">
        <label for="cm-base-type" style="font-size:12px; font-weight:700;">Base Paint Type</label>
        <select id="cm-base-type" onchange="colorMixStudioState.baseType=this.value;">
          ${Array.from(new Set([
            'Automotive Paint',
            'House Paint',
            'Specialty Paint',
            'Latex',
            'Acrylic',
            'Enamel',
            'Quick Dry',
            'Polyurethane',
            'Epoxy',
            'Primer',
            ...((typeof db !== 'undefined' && db && Array.isArray(db.products)) ? db.products.map(p => p.type).filter(t => t && t !== '-' && t.toLowerCase() !== 'accessory') : []),
            ...(s.baseType ? [s.baseType] : [])
          ])).map(bt => `<option value="${escapeHtml(bt)}" ${s.baseType === bt ? 'selected' : ''}>${escapeHtml(bt)}</option>`).join('')}
        </select>
      </div>

      <div class="field full">
        <label style="font-size:12px; font-weight:700;">Desired Finish / Sheen Tag:</label>
        <div class="row wrap" style="gap:4px; margin-bottom:4px;">
          <button class="cm-preset-btn ${(s.note || '').includes('High Gloss') ? 'active' : ''}" type="button" onclick="applyFinishPreset('High Gloss')">✨ High Gloss</button>
          <button class="cm-preset-btn ${(s.note || '').includes('Semi-Gloss') ? 'active' : ''}" type="button" onclick="applyFinishPreset('Semi-Gloss')">🌟 Semi-Gloss</button>
          <button class="cm-preset-btn ${(s.note || '').includes('Satin') ? 'active' : ''}" type="button" onclick="applyFinishPreset('Satin')">🎨 Satin</button>
          <button class="cm-preset-btn ${(s.note || '').includes('Matte') ? 'active' : ''}" type="button" onclick="applyFinishPreset('Matte')">🛡️ Matte</button>
          <button class="cm-preset-btn ${(s.note || '').includes('Metallic') ? 'active' : ''}" type="button" onclick="applyFinishPreset('Metallic')">💎 Metallic</button>
        </div>
        <input id="cm-note" type="text" value="${escapeHtml(s.note)}" oninput="colorMixStudioState.note=this.value;" placeholder="e.g. Matched to customer bumper, High Gloss finish">
      </div>
    </div>

    <!-- Grand Total Banner -->
    <div class="cm-grand-banner">
      <div>
        <div id="cm-grand-volume-label" class="muted small" style="font-size:11.5px; font-weight:600;">Estimated Total (${s.totalLiters} Liter${s.totalLiters === 1 ? '' : 's'})</div>
        <div id="cm-grand-total" style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:var(--teal); letter-spacing:-0.02em;">${peso(grandTotal)}</div>
      </div>
      <span id="cm-ready-badge" class="badge ${isReadyToDispense ? 'ok' : 'mid'}" style="font-size:11.5px; padding:5px 12px; font-weight:700;">${!hasMinTwoIngredients ? '⚠️ Need At Least 2 Ingredients' : (isPctBalanced ? '✓ Ready to Dispense' : '⚠️ Adjust to 100%')}</span>
    </div>
  </div>
</div>
  </div>
  ${renderColorMixOffcanvasDrawerHtml(prods)}`;
}

// -----------------------------------------------------------------------------------
// HIGH-PERFORMANCE REALTIME COLOR MIX SYNCHRONIZER
// Updates swatches, sliders, inputs, beakers, meter and badges WITHOUT DOM teardown!
// -----------------------------------------------------------------------------------
function syncColorMixVisuals(activeIdx = -1) {
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
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients;
  const grandTotal = (s.totalLiters || 1) * (s.pricePerLiter || 0);

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
  const toneInfo = document.getElementById('cm-tone-info');
  if (toneInfo) toneInfo.innerHTML = `Tone Family: <b>${detected.family} Tone</b> · CMYK Pigment Model`;

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

  // 5. Grand total & action button
  const grandTotalEl = document.getElementById('cm-grand-total');
  if (grandTotalEl) grandTotalEl.textContent = peso(grandTotal);
  const readyBadge = document.getElementById('cm-ready-badge');
  if (readyBadge) {
    readyBadge.className = `badge ${isReadyToDispense ? 'ok' : 'mid'}`;
    readyBadge.textContent = !hasMinTwoIngredients ? '⚠️ Need At Least 2 Ingredients' : (isPctBalanced ? '✓ Ready to Dispense' : '⚠️ Adjust to 100%');
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
    autoSlot.innerHTML = !isPctBalanced ? `<button class="btn ghost small" onclick="balanceColorMixTo100()" style="font-size:11px; padding:3px 8px; font-weight:700; color:var(--teal);">🎯 Auto-Balance</button>` : '';
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
    const hasStock = c.stock >= reqLiters;
    const fillPct = Math.max(0, Math.min(100, pct));

    // Range slider value and gradient track
    const slider = document.getElementById(`cm-slider-${i}`);
    if (slider) {
      if (document.activeElement !== slider && Number(slider.value) !== pct) {
        slider.value = pct;
      }
      slider.style.setProperty('--thumb-color', c.hex || '#1F6F6B');
      slider.style.background = `linear-gradient(to right, ${c.hex || '#1F6F6B'} 0%, ${c.hex || '#1F6F6B'} ${fillPct}%, #E6DFD3 ${fillPct}%, #E6DFD3 100%)`;
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

    // Required liters & Stock badge
    const reqEl = document.getElementById(`cm-req-liters-${i}`);
    if (reqEl) reqEl.innerHTML = `${formatStock(reqLiters)}L`;
    const srcEl = document.getElementById(`cm-mix-source-${i}`);
    if (srcEl) {
      const prodObj = c.productId ? productById(c.productId) : null;
      const mixPlan = prodObj ? previewColorMixConsumption(prodObj, reqLiters, Number(c.preferredCanSize) || 0) : null;
      srcEl.innerHTML = formatColorMixSourcePreview(mixPlan);
    }
    const stockBadge = document.getElementById(`cm-stock-badge-${i}`);
    if (stockBadge) {
      stockBadge.style.color = hasStock ? 'var(--teal-dark)' : 'var(--danger)';
      stockBadge.innerHTML = hasStock ? `🥫 ${formatStock(c.stock)}L sealed` : `⚠️ Low: ${formatStock(c.stock)}L`;
    }
  });

  // 8. Refresh preset chips dehighlight status when volume or filter changes
  const presetWrap = document.getElementById('cm-preset-chips-wrap');
  if (presetWrap && typeof renderColorMixPresetChipsHtml === 'function') {
    presetWrap.innerHTML = renderColorMixPresetChipsHtml();
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

function onColorMixSliderChange(idx, val) {
  onColorMixSliderLive(idx, val);
}

function onColorMixSliderInput(idx, val) {
  onColorMixSliderLive(idx, val);
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
function onColorMixPctChange(idx, inputOrVal) {
  const input = (typeof inputOrVal === 'object' && inputOrVal !== null && 'value' in inputOrVal)
    ? inputOrVal
    : document.getElementById(`cm-pct-input-${idx}`);
  const rawVal = input ? input.value : inputOrVal;

  let val = Math.max(0, Math.min(100, Number(rawVal) || 0));
  val = Math.round(val * 100) / 100;
  if (colorMixStudioState.components[idx]) {
    colorMixStudioState.components[idx].pct = val;
  }
  if (input) input.value = val;
  syncColorMixVisuals(idx);
}

function onColorMixPctInput(idx, val) {
  onColorMixPctLive(idx, val);
}

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
  const cansText = openedParts.length ? `Opens ${openedParts.join(' + ')} can` : 'Opens can';
  const usedOpenedPrefix = mixPlan.usedFromOpened > 0 ? `🫙 ${formatStock(mixPlan.usedFromOpened)}L opened + ` : '';
  const leftoverText = mixPlan.addedToOpened > 0
    ? ` · +${formatStock(mixPlan.addedToOpened)}L leftovers → Opened / Used (${(mixPlan.sizes || CAN_SIZES).filter(s => mixPlan.addedToOpenedBySize && mixPlan.addedToOpenedBySize[s] > 0).map(s => `${fmtSize(s)} can`).join(', ')})`
    : '';
  return `🥫 ${usedOpenedPrefix}${cansText}${leftoverText}`;
}

/* ============================================================
   SMART SEARCH WITH VISUAL AVATARS + CATEGORIZED ACCORDION +
   CLICKABLE COLOR CARDS OFF-CANVAS DRAWER
   ============================================================ */

function renderSmartAvatarSearchDropdownHtml(idx, prods, selectedProductId, searchQuery = '') {
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
    const isSel = p.id === selectedProductId;
    const openLiters = productOpenedStock(p);
    const openCanSz = productOpenedCanSize(p);
    return `
      <button type="button" class="cm-avatar-item ${isSel ? 'active' : ''}" onmousedown="onColorMixProductSelect(${typeof idx === 'string' ? `'${idx}'` : idx}, '${p.id}')">
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
          ${openLiters > 0
        ? `<span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5; font-size:9.5px; padding:1px 6px;">🫙 ${productOpenedSizesLabel(p, false)}</span>`
        : `<span class="badge ok" style="font-size:9.5px; padding:1px 6px;">🥫 ${formatStock(p.stock)}L</span>`}
          ${isSel ? `<span class="badge ok" style="font-size:9.5px; padding:1px 5px;">✓</span>` : ''}
        </div>
      </button>
    `;
  }).join('');
}

function onColorMixInlineAvatarSearch(idx, val) {
  colorMixStudioState.inlineSearchIdx = idx;
  colorMixStudioState.inlineSearchQuery = val || '';
  const prods = colorMixAvailableProducts();
  const comp = colorMixStudioState.components[idx];
  const dd = document.getElementById(`cm-avatar-dropdown-${idx}`);
  if (dd) {
    dd.style.display = 'block';
    dd.innerHTML = renderSmartAvatarSearchDropdownHtml(idx, prods, comp ? comp.productId : '', colorMixStudioState.inlineSearchQuery);
  }
}

function closeColorMixInlineSearch(idx) {
  if (colorMixStudioState.inlineSearchIdx === idx) {
    colorMixStudioState.inlineSearchIdx = -1;
    colorMixStudioState.inlineSearchQuery = '';
  }
  const dd = document.getElementById(`cm-avatar-dropdown-${idx}`);
  if (dd) dd.style.display = 'none';
}

function renderColorMixCardHtml(idx, p, selectedProductId) {
  const hex = getProductDefaultColor(p);
  const isSel = p.id === selectedProductId;
  const openLiters = productOpenedStock(p);
  const openCanSz = productOpenedCanSize(p);
  const usedLiters = productUsedFromOpenedCan(p);
  const hasBd = productHasCanBreakdown(p);
  const canSummary = hasBd
    ? productSizes(p).filter(sz => productCanCount(p, sz) > 0).map(sz => `${productCanCount(p, sz)}×${fmtSize(sz)}`).join(' · ')
    : `${formatStock(p.stock)}L sealed`;
  const light = isLightColor(hex);

  return `
    <button type="button" class="cm-color-card ${isSel ? 'selected' : ''}" onclick="onColorMixProductSelect(${typeof idx === 'string' ? `'${idx}'` : idx}, '${p.id}')">
      <div class="cm-color-card-swatch" style="background-color:${hex};">
        <code style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:4px; background:${light ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.22)'}; color:${light ? '#1C1917' : '#FFFFFF'};">${hex}</code>
        ${isSel ? `<span class="badge ok" style="font-size:10px; padding:1px 6px; box-shadow:0 1px 4px rgba(0,0,0,0.15);">✓ Selected</span>` : ''}
      </div>
      <div class="cm-color-card-body">
        <div class="row" style="gap:6px; align-items:center;">
          <span class="cm-avatar-circle" style="width:16px; height:16px; background-color:${hex};"></span>
          <strong style="font-size:12.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
        </div>
        <div class="muted" style="font-size:11px; display:flex; justify-content:space-between; align-items:center; gap:4px;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.brand || 'Standard')}</span>
          <strong style="color:var(--teal-dark); font-size:11px;">${peso(p.price)}/L</strong>
        </div>
        <div class="row wrap" style="gap:4px; margin-top:4px; align-items:center;">
          ${openLiters > 0
      ? `<span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5; font-size:9.5px; padding:2px 6px; width:100%; text-align:center;" title="Opened cans: ${productOpenedEntries(p).map(e => `${e.size}L can (${formatStock(e.used)}L used)`).join(', ')}">🫙 ${productOpenedSizesLabel(p)} left</span>`
      : ''}
          <span class="badge" style="background:#EEF6F5; color:#1F6F6B; border:1px solid #CDE4E1; font-size:9.5px; padding:2px 6px; width:100%; text-align:center;">
            🥫 ${canSummary || `${formatStock(p.stock)}L in stock`}
          </span>
        </div>
      </div>
    </button>
  `;
}

function renderCategorizedAccordionMenusHtml(idx, prods, selectedProductId, searchQuery = '') {
  const q = (searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? prods.filter(p => {
      const hex = getProductDefaultColor(p);
      const hay = `${p.name || ''} ${p.color || ''} ${p.brand || ''} ${p.type || ''} ${p.sku || ''} ${hex}`.toLowerCase();
      return hay.includes(q);
    })
    : prods;

  if (!filtered.length) {
    return `<div class="muted small" style="text-align:center; padding:24px 12px; background:#fff; border-radius:10px; border:1px dashed var(--line);">No matching paints found above stock threshold.</div>`;
  }

  const groups = [];
  const openedList = filtered.filter(p => productOpenedStock(p) > 0);
  if (openedList.length) {
    groups.push({
      key: 'Opened / Used Stock',
      icon: '🫙',
      title: 'Opened / Used Cans (Prioritized)',
      subtitle: 'Use leftover opened cans first before opening sealed stock',
      items: openedList
    });
  }

  const categoryMap = new Map();
  filtered.forEach(p => {
    const cat = (p.type && p.type !== '-') ? p.type : 'General Paint';
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(p);
  });

  const catIcons = {
    'Latex': '🪣',
    'Acrylic': '🎨',
    'Enamel': '🛡️',
    'Quick Dry': '⚡',
    'Primer': '🧱',
    'Epoxy': '💎'
  };

  categoryMap.forEach((items, cat) => {
    groups.push({
      key: cat,
      icon: catIcons[cat] || '🥫',
      title: `${cat} Paints`,
      subtitle: `${items.length} paint product${items.length === 1 ? '' : 's'} available`,
      items
    });
  });

  const openState = colorMixStudioState.openCategories || {};

  return groups.map((g, gIdx) => {
    const isExpanded = q ? true : (openState[g.key] !== undefined ? openState[g.key] : gIdx < 2);
    const previewDots = g.items.slice(0, 6).map(p => {
      const hex = getProductDefaultColor(p);
      return `<span class="cm-avatar-circle" style="width:14px; height:14px; background-color:${hex}; display:inline-block; margin-left:-3px;"></span>`;
    }).join('');

    return `
      <div class="cm-accordion-group ${isExpanded ? 'open' : ''}">
        <button type="button" class="cm-accordion-header" onclick="toggleColorMixAccordionCategory('${escapeHtml(g.key)}')">
          <div class="row" style="gap:8px; align-items:center;">
            <span style="font-size:16px;">${g.icon}</span>
            <div>
              <div style="font-size:13px; font-weight:700; color:var(--ink);">${escapeHtml(g.title)}</div>
              <div class="muted" style="font-size:10.5px;">${escapeHtml(g.subtitle)}</div>
            </div>
          </div>
          <div class="row" style="gap:10px; align-items:center;">
            <div class="row" style="padding-left:4px;">${previewDots}</div>
            <span class="badge" style="background:#EFECE6; color:var(--ink); font-size:10.5px; padding:2px 8px;">${g.items.length}</span>
            <span style="font-size:12px; color:var(--teal-dark); font-weight:700;">${isExpanded ? '▴' : '▾'}</span>
          </div>
        </button>
        ${isExpanded ? `
          <div class="cm-accordion-body">
            <div class="cm-color-card-grid">
              ${g.items.map(p => renderColorMixCardHtml(idx, p, selectedProductId)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderColorMixOffcanvasDrawerHtml(prods) {
  const s = colorMixStudioState;
  const idx = s.openPickerIdx;
  if (idx === -1 || idx === undefined || idx === null) return '';

  const isAddMode = idx === 'add';
  const comp = !isAddMode && s.components[idx] ? s.components[idx] : null;
  const selectedProductId = comp ? comp.productId : '';
  const q = s.pickerSearch || '';

  return `
    <div class="cm-offcanvas-backdrop" onclick="if(event.target === this) closeColorMixPigmentDrawer()">
      <div class="cm-offcanvas-drawer" onclick="event.stopPropagation()">
        <div class="cm-offcanvas-header">
          <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div>
              <div style="font-size:15px; font-weight:700; color:var(--ink);">
                ${isAddMode ? '🎨 Add New Pigment to Formula' : `🎨 Select Paint for Ingredient #${Number(idx) + 1}`}
              </div>
              <div class="muted" style="font-size:11.5px;">
                Browse categorized accordion menus or use smart search with color avatars
              </div>
            </div>
            <button type="button" class="btn secondary small" onclick="closeColorMixPigmentDrawer()">✕ Close</button>
          </div>

          <!-- Smart Search with Visual Avatars inside Drawer -->
          <div class="cm-smart-search-bar" style="margin-top:0;">
            <span class="cm-smart-search-icon">🔍</span>
            <input
              id="cm-drawer-search-input"
              type="text"
              class="cm-smart-search-input"
              style="height:38px; font-size:13px;"
              placeholder="Search paint name, color, brand, category, or hex..."
              value="${escapeHtml(q)}"
              oninput="onColorMixDrawerSearch(this.value)"
            >
          </div>
        </div>

        <div id="cm-offcanvas-body" class="cm-offcanvas-body">
          ${q.trim() ? `
            <div style="background:#FFFFFF; border:1.5px solid var(--line); border-radius:11px; padding:8px;">
              <div class="muted small" style="font-weight:700; padding:4px 8px 6px; font-size:11px;">⚡ Quick Avatar Matches</div>
              ${renderSmartAvatarSearchDropdownHtml(idx, prods, selectedProductId, q)}
            </div>
          ` : ''}
          ${renderCategorizedAccordionMenusHtml(idx, prods, selectedProductId, q)}
        </div>
      </div>
    </div>
  `;
}

function openColorMixPigmentDrawer(idx) {
  colorMixStudioState.openPickerIdx = idx;
  colorMixStudioState.pickerSearch = '';
  colorMixStudioState.inlineSearchIdx = -1;
  renderColorMixStudio();
  const input = document.getElementById('cm-drawer-search-input');
  if (input) input.focus();
}

function closeColorMixPigmentDrawer() {
  colorMixStudioState.openPickerIdx = -1;
  colorMixStudioState.pickerSearch = '';
  renderColorMixStudio();
}

function onColorMixDrawerSearch(val) {
  colorMixStudioState.pickerSearch = val || '';
  const body = document.getElementById('cm-offcanvas-body');
  if (body) {
    const prods = colorMixAvailableProducts();
    const idx = colorMixStudioState.openPickerIdx;
    const comp = idx !== 'add' && colorMixStudioState.components[idx] ? colorMixStudioState.components[idx] : null;
    const selectedProductId = comp ? comp.productId : '';
    const q = colorMixStudioState.pickerSearch;
    body.innerHTML = `
      ${q.trim() ? `
        <div style="background:#FFFFFF; border:1.5px solid var(--line); border-radius:11px; padding:8px;">
          <div class="muted small" style="font-weight:700; padding:4px 8px 6px; font-size:11px;">⚡ Quick Avatar Matches</div>
          ${renderSmartAvatarSearchDropdownHtml(idx, prods, selectedProductId, q)}
        </div>
      ` : ''}
      ${renderCategorizedAccordionMenusHtml(idx, prods, selectedProductId, q)}
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

function setColorMixTypeFilter(typeFilter) {
  colorMixStudioState.typeFilter = typeFilter || 'all';
  if (typeFilter && typeFilter !== 'all') {
    colorMixStudioState.baseType = typeFilter;
  }
  renderColorMixStudio();
}

function onColorMixProductSelect(idx, productId) {
  const p = productById(productId);
  if (!p) return;
  if (productMixAvailableStock(p) <= 0) {
    showToast(`Product "${p.name}" has no available stock and cannot be selected for mixing.`, 'error');
    renderColorMixStudio();
    return;
  }
  if (productHasLowStock(p)) {
    showToast(`Product "${p.name}" is low on stock (${formatStock(productMixAvailableStock(p))}L available).`, 'info');
  }

  if (idx === 'add') {
    const currentTotal = colorMixStudioState.components.reduce((s, c) => s + (Number(c.pct) || 0), 0);
    const remainingPct = Math.max(10, Math.round((100 - currentTotal) * 10) / 10);
    colorMixStudioState.components.push({
      id: uid('cmc'),
      productId: p.id,
      name: p.name,
      brand: p.brand,
      stock: p.stock,
      price: p.price,
      hex: getProductDefaultColor(p),
      pct: remainingPct,
      preferredCanSize: 0
    });
  } else {
    const comp = colorMixStudioState.components[idx];
    if (comp) {
      comp.productId = p.id;
      comp.name = p.name;
      comp.brand = p.brand;
      comp.price = p.price;
      comp.stock = p.stock;
      comp.hex = getProductDefaultColor(p);
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

function onColorMixColorInput(idx, hex) {
  if (colorMixStudioState.components[idx]) {
    colorMixStudioState.components[idx].hex = hex;
  }
  updateColorMixCalculation();
  renderColorMixStudio();
}

function onColorMixColorLive(idx, hex) {
  if (colorMixStudioState.components[idx]) {
    colorMixStudioState.components[idx].hex = hex;
  }
  syncColorMixVisuals(idx);
}

function onColorMixTotalLitersChange(val) {
  val = Math.max(0.1, Number(val) || 1);
  colorMixStudioState.totalLiters = val;
  // Update can button active states without full page re-render
  document.querySelectorAll('.cm-can-btn').forEach(btn => {
    const text = (btn.textContent || '').trim();
    if (text.includes(`${val} L`)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  const customInput = document.getElementById('cm-liters');
  if (customInput && document.activeElement !== customInput) customInput.value = val;
  const volLabel = document.getElementById('cm-grand-volume-label');
  if (volLabel) volLabel.textContent = `Estimated Total (${val} Liter${val === 1 ? '' : 's'})`;
  const beakerVol = document.getElementById('cm-beaker-volume');
  if (beakerVol) beakerVol.textContent = `${val} Liter${val === 1 ? '' : 's'}`;
  syncColorMixVisuals();
}

function addColorMixIngredient() {
  const prods = colorMixAvailableProducts();
  if (!prods.length) {
    showToast('No paint products above stock threshold available in inventory.', 'error');
    return;
  }
  const currentTotal = colorMixStudioState.components.reduce((s, c) => s + (Number(c.pct) || 0), 0);
  const remainingPct = Math.max(10, Math.round((100 - currentTotal) * 10) / 10);

  // Pick next unused product
  const usedIds = new Set(colorMixStudioState.components.map(c => c.productId));
  const candidate = prods.find(p => !usedIds.has(p.id)) || prods[0];

  colorMixStudioState.components.push({
    id: uid('cmc'),
    productId: candidate ? candidate.id : '',
    name: candidate ? candidate.name : 'Component Color',
    brand: candidate ? candidate.brand : '',
    stock: candidate ? candidate.stock : 0,
    price: candidate ? candidate.price : 350,
    hex: candidate ? getProductDefaultColor(candidate) : '#FDD835',
    pct: remainingPct
  });

  updateColorMixCalculation();
  renderColorMixStudio();
}

function removeColorMixIngredient(idx) {
  if (colorMixStudioState.components.length <= 2) {
    showToast('At least 2 formula ingredients are required for paint color mixing.', 'error');
    return;
  }
  colorMixStudioState.components.splice(idx, 1);
  balanceColorMixTo100();
  renderColorMixStudio();
}

function equalizeColorMixPcts() {
  const len = colorMixStudioState.components.length;
  if (len === 0) return;
  const basePct = Math.floor(100 / len);
  const remainder = 100 - (basePct * len);

  colorMixStudioState.components.forEach((c, i) => {
    c.pct = basePct + (i === len - 1 ? remainder : 0);
  });

  syncColorMixVisuals();
}

function balanceColorMixTo100() {
  const len = colorMixStudioState.components.length;
  if (len === 0) return;
  let sumOthers = 0;
  for (let i = 0; i < len - 1; i++) {
    sumOthers += Number(colorMixStudioState.components[i].pct) || 0;
  }
  colorMixStudioState.components[len - 1].pct = Math.max(0, Math.round((100 - sumOthers) * 10) / 10);
  syncColorMixVisuals(len - 1);
}


function applyDetectedColorName() {
  const mixed = subtractivePaintMix(colorMixStudioState.components);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  colorMixStudioState.colorName = detected.name;
  colorMixStudioState.userCustomizedName = false;
  const input = document.getElementById('cm-color-name');
  if (input) input.value = detected.name;
  showToast(`Applied detected color name: "${detected.name}"`, 'ok');
}

async function submitColorMix() {
  const s = colorMixStudioState;
  const colorNameInput = document.getElementById('cm-color-name');
  const colorName = colorNameInput ? colorNameInput.value.trim() : s.colorName;
  if (!colorName) {
    showToast('Please enter a color name / reference code.', 'error');
    return false;
  }

  const totalPct = s.components.reduce((sum, c) => sum + (Number(c.pct) || 0), 0);
  if (Math.abs(totalPct - 100) > 0.5) {
    showToast(`Color blend percentages must equal 100% (currently ${totalPct}%). Click Auto-Balance to fix.`, 'error');
    return false;
  }

  const validComponents = s.components.filter(c => c.productId && Number(c.pct) > 0);
  if (validComponents.length < 2) {
    showToast('At least 2 formula ingredients (each with a percentage above 0%) are required to mix a color.', 'error');
    return false;
  }

  for (const c of validComponents) {
    const p = productById(c.productId);
    if (!p) {
      showToast(`Selected product "${c.name}" was not found.`, 'error');
      return false;
    }
    const compLiters = Number(((s.totalLiters || 1) * (Number(c.pct) / 100)).toFixed(2));
    const mixAvail = productMixAvailableStock(p);
    if (mixAvail < compLiters) {
      showToast(`Not enough stock for "${p.name}". Required: ${formatStock(compLiters)}L, Available: ${formatStock(mixAvail)}L (${formatStock(p.stock)}L sealed + ${formatStock(productOpenedStock(p))}L opened).`, 'error');
      return false;
    }
  }

  const mixed = subtractivePaintMix(validComponents);
  const detected = detectMixedColorName(mixed.r, mixed.g, mixed.b);
  const liters = Number(s.totalLiters) || 1;
  const price = Number(s.pricePerLiter) || 400;
  const baseType = (document.getElementById('cm-base-type') ? document.getElementById('cm-base-type').value.trim() : s.baseType) || 'Automotive Paint';
  const note = (document.getElementById('cm-note') ? document.getElementById('cm-note').value.trim() : s.note) || '';

  const componentsData = validComponents.map(c => {
    const compLiters = Number((liters * (Number(c.pct) / 100)).toFixed(2));
    return {
      productId: c.productId,
      name: c.name,
      brand: c.brand,
      price: c.price,
      hex: c.hex,
      percentage: Number(c.pct),
      liters: compLiters,
      preferredCanSize: Number(c.preferredCanSize) || 0
    };
  });

  saveMixedColorToPresets({
    colorName: colorName,
    detectedName: detected.name,
    hex: mixed.hex,
    baseType: baseType,
    components: componentsData
  });

  const isPos = s.isPosMode !== false;
  const formulaSummary = componentsData.map(cp => `${cp.percentage}% ${cp.name} (${cp.liters}L)`).join(' + ');
  if (isPos) {
    cart.push({
      type: 'colormix',
      name: 'Custom Color Mix',
      colorName: colorName,
      detectedColorName: detected.name,
      hexColor: mixed.hex,
      baseType: baseType,
      liters: liters,
      qty: liters,
      unitPrice: price,
      lineTotal: liters * price,
      note: note,
      components: componentsData
    });

    logAudit(
      'MIXING_COMPLETE',
      colorName,
      `Composed ${liters}L "${colorName}" [${detected.name} · ${mixed.hex}] (${baseType}) and queued to POS Cart — Formula: ${formulaSummary} · Total: ${peso(liters * price)}`,
      {
        entityName: colorName,
        fieldChanged: 'Paint Color Mix Formula',
        oldValue: formulaSummary,
        newValue: `${liters}L ${colorName} [${detected.name} · ${mixed.hex}] (${peso(liters * price)})`,
        reason: note || `${baseType} (Added to POS Cart)`
      }
    );

    closeModal();
    refreshCartUI();
    showToast(`Added ${liters}L "${colorName}" (${detected.name}) mix to sale.`, 'ok');
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
        ingredientChanges.push({
          field: `${p.name} (${comp.percentage}%)`,
          oldValue: `${formatStock(beforeStock)}L`,
          newValue: `${formatStock(p.stock)}L`
        });
        db.movements.push({
          id: uid('mv'),
          date,
          type: 'colormix',
          productId: p.id,
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
      qtyChange: liters,
      note: `${note ? note + ' · ' : ''}Formula: ${shortFormulaSummary}`,
      staffName: (currentUser && currentUser.name) || 'Staff'
    });

    logAudit(
      'MIXING_COMPLETE',
      colorName,
      `Completed ${liters}L "${colorName}" [${detected.name} · ${mixed.hex}] (${baseType}) mixing service — Formula: ${formulaSummary} · Value: ${peso(liters * price)}`,
      {
        entityName: colorName,
        fieldChanged: 'Paint Color Mix & Ingredient Stock',
        oldValue: formulaSummary,
        newValue: `${liters}L ${colorName} [${detected.name} · ${mixed.hex}] (${peso(liters * price)})`,
        reason: note || `${baseType} (Direct Inventory Mix)`,
        meta: { changes: ingredientChanges }
      }
    );

    await saveDB();
    closeModal();
    showToast(`Successfully logged ${liters}L "${colorName}" (${detected.name}) mixing service and deducted ingredients.`, 'ok');
    renderPage();
  }
  return false;
}

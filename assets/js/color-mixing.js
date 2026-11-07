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
  { name: 'Cream', hex: '#FFFDE5', r: 255, g: 253, b: 229, family: 'Cream' },
  { name: 'Ivory', hex: '#FFFFF0', r: 255, g: 255, b: 240, family: 'Cream' },
  { name: 'Alabaster', hex: '#F2F0EB', r: 242, g: 240, b: 235, family: 'White' },
  { name: 'Cream', hex: '#FFFDD0', r: 255, g: 253, b: 208, family: 'Cream' },
  { name: 'Vanilla', hex: '#F3E5AB', r: 243, g: 229, b: 171, family: 'Cream' },
  { name: 'Antique Linen', hex: '#FAF0E6', r: 250, g: 240, b: 230, family: 'Cream' },
  { name: 'Eggshell', hex: '#F0EAD6', r: 240, g: 234, b: 214, family: 'Cream' },

  // Yellows & Golds
  { name: 'Lemon Custard', hex: '#FFFCCA', r: 255, g: 252, b: 202, family: 'Yellow' },
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
  { name: 'Pastel Rose', hex: '#F7B9BE', r: 247, g: 185, b: 190, family: 'Pink' },
  { name: 'Rose Pink', hex: '#FF66CC', r: 255, g: 102, b: 204, family: 'Pink' },
  { name: 'Blush Pink', hex: '#DE5D83', r: 222, g: 93, b: 131, family: 'Pink' },
  { name: 'Flamingo Pink', hex: '#F4A3A9', r: 244, g: 163, b: 169, family: 'Pink' },
  { name: 'Flamingo Pink', hex: '#F18D95', r: 241, g: 141, b: 149, family: 'Pink' },
  { name: 'Flamingo Pink', hex: '#FC8EAC', r: 252, g: 142, b: 172, family: 'Pink' },
  { name: 'Coral Pink', hex: '#F88379', r: 248, g: 131, b: 121, family: 'Pink' },
  { name: 'Sunset Coral', hex: '#F89B72', r: 248, g: 155, b: 114, family: 'Orange' },
  { name: 'Magenta', hex: '#FF00FF', r: 255, g: 0, b: 255, family: 'Pink' },
  { name: 'Fuchsia', hex: '#C154C1', r: 193, g: 84, b: 193, family: 'Pink' },
  { name: 'Hot Pink', hex: '#FF69B4', r: 255, g: 105, b: 180, family: 'Pink' },
  { name: 'Pale Rose', hex: '#FADADD', r: 250, g: 218, b: 221, family: 'Pink' },
  { name: 'Bubblegum', hex: '#FFC1CC', r: 255, g: 193, b: 204, family: 'Pink' },

  // Violets & Purples
  { name: 'Lavender Mist', hex: '#C5BFC2', r: 197, g: 191, b: 194, family: 'Purple' },
  { name: 'Lavender Mist', hex: '#CAB0E7', r: 202, g: 176, b: 231, family: 'Purple' },
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
  { name: 'Ocean Aqua', hex: '#A0CDF5', r: 160, g: 205, b: 245, family: 'Blue' },
  { name: 'Baby Blue', hex: '#89C1F2', r: 137, g: 193, b: 242, family: 'Blue' },
  { name: 'Baby Blue', hex: '#CEE6FA', r: 206, g: 230, b: 250, family: 'Blue' },
  { name: 'Sky Blue', hex: '#87CEEB', r: 135, g: 206, b: 235, family: 'Blue' },
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
  { name: 'Sage Meadow', hex: '#BBE19D', r: 187, g: 225, b: 157, family: 'Green' },
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
  { name: 'Olive Grove', hex: '#D1CE98', r: 209, g: 206, b: 152, family: 'Green' },
  { name: 'Army Green', hex: '#4B5320', r: 75, g: 83, b: 32, family: 'Green' },
  { name: 'Sage Green', hex: '#9DC183', r: 157, g: 193, b: 131, family: 'Green' },
  { name: 'Celadon', hex: '#ACE1AF', r: 172, g: 225, b: 175, family: 'Green' },

  // Browns & Earth Tones
  { name: 'Creamy Latte', hex: '#D3BFAB', r: 211, g: 191, b: 171, family: 'Brown' },
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
  { name: 'Modern Slate', hex: '#A6AAAE', r: 166, g: 170, b: 174, family: 'Gray' },
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

function getProductColorName(product) {
  if (!product) return 'Standard';
  if (product.color && product.color !== '-' && !product.color.startsWith('#')) {
    return product.color;
  }
  if (product.colorName && product.colorName !== '-') {
    return product.colorName;
  }
  const str = `${product.name || ''}`.toLowerCase();
  if (typeof PAINT_COLOR_DICTIONARY !== 'undefined') {
    for (const item of PAINT_COLOR_DICTIONARY) {
      if (str.includes(item.name.toLowerCase())) {
        return item.name;
      }
    }
  }
  if (product.color && product.color.startsWith('#') && typeof hexToRgb === 'function' && typeof detectMixedColorName === 'function') {
    const rgb = hexToRgb(product.color);
    const det = detectMixedColorName(rgb.r, rgb.g, rgb.b);
    if (det && det.name) return det.name;
  }
  return (product.color && product.color !== '-') ? product.color : 'Original Color';
}
window.getProductColorName = getProductColorName;

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

function cleanPresetColorName(rawName) {
  return String(rawName || '').replace(/^[\p{Emoji}\s]+/u, '').trim() || String(rawName || '').trim();
}

function detectDictionaryColorOnly(r, g, b) {
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
          return {
            name: cleanName,
            hex: studioMix.hex,
            r,
            g,
            b,
            family: (dictEntry && dictEntry.family) || (closest && closest.family) || 'Custom'
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
        return {
          name: cleanName,
          hex: studioMix.hex,
          r,
          g,
          b,
          family: (dictEntry && dictEntry.family) || (closest && closest.family) || 'Custom'
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

function colorMixModalProducts() {
  const all = activeProducts();
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
  { name: '🌸 Pastel Rose', desc: 'Soft blush pink blend (70% White + 30% Red)', hex: '#F7D6DC', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 70 }, { name: 'Red Paint', colorHint: 'red', pct: 30 }] },
  { name: '🌊 Ocean Aqua', desc: 'Fresh sky-blue tint (60% White + 40% Blue)', hex: '#4A90E2', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 60 }, { name: 'Blue Paint', colorHint: 'blue', pct: 40 }] },
  { name: '🌿 Sage Meadow', desc: 'Soothing organic green (50% White + 30% Green + 20% Yellow)', hex: '#7E9F76', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 50 }, { name: 'Green Paint', colorHint: 'green', pct: 30 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 20 }] },
  { name: '🌅 Sunset Coral', desc: 'Warm glowing earth tone (40% White + 35% Orange + 25% Red)', hex: '#DF6943', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 40 }, { name: 'Orange Paint', colorHint: 'orange', pct: 35 }, { name: 'Red Paint', colorHint: 'red', pct: 25 }] },
  { name: '☕ Creamy Latte', desc: 'Warm cozy neutral (60% White + 30% Brown + 10% Yellow)', hex: '#A8896C', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 60 }, { name: 'Brown Paint', colorHint: 'brown', pct: 30 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 10 }] },
  { name: '🍋 Lemon Custard', desc: 'Sunny vibrant pastel (70% White + 30% Yellow)', hex: '#FDF289', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 70 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 30 }] },
  { name: '🌙 Modern Slate', desc: 'Contemporary cool dark tone (60% White + 35% Black + 5% Blue)', hex: '#586A7A', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 60 }, { name: 'Black Paint', colorHint: 'black', pct: 35 }, { name: 'Blue Paint', colorHint: 'blue', pct: 5 }] },
  { name: '🍇 Lavender Mist', desc: 'Delicate floral violet (65% White + 25% Purple + 10% Blue)', hex: '#B5A0CC', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 65 }, { name: 'Purple Paint', colorHint: 'purple', pct: 25 }, { name: 'Blue Paint', colorHint: 'blue', pct: 10 }] },
  { name: '🫒 Olive Grove', desc: 'Refined deep olive (40% White + 40% Yellow + 20% Black)', hex: '#728038', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 40 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 40 }, { name: 'Black Paint', colorHint: 'black', pct: 20 }] },
  { name: 'Cream', desc: 'Soft warm off-white blend (85% White + 15% Yellow)', hex: '#FFFDD0', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 85 }, { name: 'Yellow Paint', colorHint: 'yellow', pct: 15 }] },
  { name: 'Flamingo Pink', desc: 'Delicate vibrant pink (60% White + 40% Red)', hex: '#FC8EAC', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 60 }, { name: 'Red Paint', colorHint: 'red', pct: 40 }] },
  { name: 'Baby Blue', desc: 'Gentle pastel sky blend (50% White + 50% Blue)', hex: '#89C1F2', recipe: [{ name: 'White Paint', colorHint: 'white', pct: 50 }, { name: 'Blue Paint', colorHint: 'blue', pct: 50 }] }
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

function getColorRecipePresets() {
  const custom = loadSavedCustomColorPresets();
  const list = [...DEFAULT_COLOR_RECIPE_PRESETS];
  custom.forEach(cp => {
    const cpName = cleanPresetColorName(cp.name).toLowerCase();
    const idx = list.findIndex(p => cleanPresetColorName(p.name).toLowerCase() === cpName);
    if (idx < 0) {
      list.push(cp);
    }
  });
  return list;
}

const COLOR_RECIPE_PRESETS = getColorRecipePresets();

function syncActiveColorRecipePresets() {
  const updated = getColorRecipePresets();
  COLOR_RECIPE_PRESETS.length = 0;
  COLOR_RECIPE_PRESETS.push(...updated);
  return COLOR_RECIPE_PRESETS;
}

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
  syncActiveColorRecipePresets();
}

function findMatchingProductForRecipeItem(item, reqLiters = 0, excludeProductIds = new Set(), preferredType = '') {
  const allActive = (typeof activeProducts === 'function' ? activeProducts() : [])
    .filter(p => p && p.status === 'active' && !excludeProductIds.has(String(p.id)));

  // 1. Exact productId match first (for saved custom mixes)
  if (item.productId && !excludeProductIds.has(String(item.productId))) {
    const byId = allActive.find(p => String(p.id) === String(item.productId));
    if (byId) return { product: byId, reason: null };
    const rawProd = typeof productById === 'function' ? productById(item.productId) : null;
    if (rawProd && rawProd.status === 'active') return { product: rawProd, reason: null };
  }

  // 2. Match by colorHint or name
  const hint = String(item.colorHint || item.name || '').trim().toLowerCase();
  if (hint) {
    const matchFn = prod => {
      const pColor = String(prod.color || '').trim().toLowerCase();
      const pName = String(prod.name || '').trim().toLowerCase();
      if (pColor === hint || pColor.includes(hint) || pName.includes(hint)) return true;
      const hex = getProductDefaultColor(prod);
      if (hex) {
        const rgb = hexToRgb(hex);
        if (rgb) {
          const det = detectMixedColorName(rgb.r, rgb.g, rgb.b);
          if (det && det.family && det.family.toLowerCase() === hint) return true;
          if (det && det.name && det.name.toLowerCase().includes(hint)) return true;
        }
      }
      return false;
    };

    const candidates = allActive.filter(matchFn);
    if (candidates.length > 0) {
      // Sort candidates:
      // Priority 1: Has enough usable stock (usableStock >= reqLiters)
      // Priority 2: Matches preferredType (e.g. Latex, Automotive Paint)
      // Priority 3: Prioritize usable opened-container leftovers
      // Priority 4: Highest usable stock
      candidates.sort((a, b) => {
        const aStock = productMixAvailableStock(a);
        const bStock = productMixAvailableStock(b);
        const aSufficient = reqLiters > 0 ? (aStock >= reqLiters ? 1 : 0) : (aStock > 0 ? 1 : 0);
        const bSufficient = reqLiters > 0 ? (bStock >= reqLiters ? 1 : 0) : (bStock > 0 ? 1 : 0);
        if (aSufficient !== bSufficient) return bSufficient - aSufficient;

        const aTypeMatch = preferredType && (a.type || '').toLowerCase() === preferredType.toLowerCase() ? 1 : 0;
        const bTypeMatch = preferredType && (b.type || '').toLowerCase() === preferredType.toLowerCase() ? 1 : 0;
        if (aTypeMatch !== bTypeMatch) return bTypeMatch - aTypeMatch;

        const aOpened = productOpenedStock(a) > 0 ? 1 : 0;
        const bOpened = productOpenedStock(b) > 0 ? 1 : 0;
        if (aOpened !== bOpened) return bOpened - aOpened;

        return bStock - aStock;
      });

      return { product: candidates[0], reason: null };
    }
  }

  return { product: null, reason: `Missing ${item.name || item.colorHint || 'ingredient'} in inventory` };
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
    const usableStock = productMixAvailableStock(product);
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
  let tooltip = `Preset: ${preset.name}\n\nRequired Ingredients:\n`;
  ingredients.forEach(ing => {
    tooltip += `- ${ing.displayName}: ${formatStock(ing.reqLiters)} L — ${ing.isAvailable ? 'Available' : 'Insufficient'}\n`;
  });
  if (!isAvailable) {
    tooltip += `\nShortage:\n${shortageDescriptions.join('\n')}`;
  } else {
    tooltip += `\nStatus: Available (${vol} L mix)`;
  }

  return {
    available: isAvailable,
    lackingReasons,
    shortageDescriptions,
    ingredients,
    resolvedItems,
    tooltip: tooltip.trim()
  };
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

function renderColorMixPresetChipsHtml() {
  const totalLiters = (colorMixStudioState && colorMixStudioState.totalLiters) || 1;
  const presets = COLOR_RECIPE_PRESETS;
  return `
    <span class="muted small" style="font-size:11px; font-weight:600; margin-right:2px;">💡 Presets:</span>
    ${presets.map((preset, pIdx) => {
      const check = evaluateRecipePresetAvailability(preset, totalLiters);
      const isAvailable = check.available;
      const isActive = isAvailable && isPresetCurrentlyActive(preset, pIdx);
      if (!isAvailable && colorMixStudioState && colorMixStudioState.selectedPresetIndex === pIdx) {
        colorMixStudioState.selectedPresetIndex = -1;
      }
      return `
        <button class="cm-preset-chip ${isAvailable ? ('available' + (isActive ? ' active' : '')) : 'lacking unavailable'}" 
                type="button" 
                ${!isAvailable ? 'aria-disabled="true" data-preset-disabled="true"' : ''}
                onclick="handleRecipePresetClick(${pIdx})" 
                title="${escapeHtml(check.tooltip)}">
          <span class="cm-color-dot" style="background-color:${preset.hex}; ${!isAvailable ? 'filter:grayscale(0.6); opacity:0.6;' : ''}"></span>
          <span>${escapeHtml(preset.name)}</span>
          ${!isAvailable ? `<span class="cm-preset-tag-insufficient">Unavailable</span>` : ''}
        </button>
      `;
    }).join('')}
  `;
}

let currentShortagePresetIndex = -1;

function handleRecipePresetClick(presetIndex) {
  const p = COLOR_RECIPE_PRESETS[presetIndex];
  if (!p) return;
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
          <div style="font-weight:700; font-size:13px; color:#B91C1C; display:flex; align-items:center; gap:6px;">
            <span style="font-size:15px;">⚠️</span>
            <span>Preset: <b>${escapeHtml(preset.name)}</b> — Insufficient Stock</span>
          </div>
          <div class="muted small" style="margin-top:2px; font-size:11.5px;">
            Mixing Volume: <b>${vol} L</b>. Checked usable inventory across opened leftovers &amp; sealed stock:
          </div>
        </div>
        <button type="button" class="btn ghost small" onclick="dismissPresetShortageAlert()" style="font-size:12px; padding:2px 7px; color:#6B7280;" title="Dismiss shortage alert">✕</button>
      </div>

      <div style="margin-top:9px; background:#FFFFFF; border-radius:6px; padding:8px 12px; border:1px solid #FECACA;">
        <div style="font-size:11.5px; font-weight:700; margin-bottom:5px; color:#374151;">Required Ingredients:</div>
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

      <div style="margin-top:9px; background:#FEF2F2; border-left:3px solid #EF4444; padding:6px 10px; border-radius:0 4px 4px 0;">
        <div style="font-size:11.5px; font-weight:700; color:#991B1B;">Shortage:</div>
        <div style="margin-top:2px; font-size:11.5px; color:#B91C1C;">
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
    name: product.name,
    brand: product.brand,
    colorName: getProductColorName(product),
    color: getProductColorName(product),
    stock: product.stock,
    price: product.price,
    hex: getProductDefaultColor(product),
    pct: item.pct,
    preferredCanSize: 0
  }));

  colorMixStudioState.components = newComponents;
  colorMixStudioState.selectedPresetIndex = presetIndex;
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
  const grandTotal = (s.totalLiters || 1) * (s.pricePerLiter || 0);

  return `
  <!-- Single Clean Top Toolbar: Quick Presets + Balance Status -->
  <div class="cm-inspirations-bar" style="margin-bottom:12px; padding:10px 14px;">
    <div class="row wrap" style="justify-content:flex-end; align-items:center; gap:8px; margin-bottom:8px;">
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
    <div id="cm-preset-shortage-alert" style="display:none; margin-top:8px;"></div>
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
    const isDup = duplicateSlots.has(idx + 1);
    return `
        <div class="cm-ingredient-item" id="cm-ing-item-${idx}" style="padding:10px 12px; margin-bottom:9px; ${isDup ? 'border:1.5px solid #FCA5A5; background:#FFFBFB;' : ''}">
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
                    ${isDup ? `<span class="badge already-selected-badge" style="font-size:9.5px; padding:1px 6px;">⚠️ Duplicate Selection</span>` : ''}
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
              <span class="muted" style="font-size:10px;">Size:</span>
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
        <input id="cm-price" type="number" min="0" step="1" value="${s.pricePerLiter}" onchange="this.value=Math.round(Number(this.value)||0); colorMixStudioState.pricePerLiter=Number(this.value); colorMixStudioState.userCustomizedPrice=true; syncColorMixVisuals();" required>
        <small class="muted" style="display:block; margin-top:2px; font-size:10.5px;">Auto-calculated base + ₱50 service fee</small>
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

    <!-- Grand Total Banner -->
    <div class="cm-grand-banner">
      <div>
        <div id="cm-grand-volume-label" class="muted small" style="font-size:11.5px; font-weight:600;">Estimated Total (${s.totalLiters} Liter${s.totalLiters === 1 ? '' : 's'})</div>
        <div id="cm-grand-total" style="font-family:'Space Grotesk',sans-serif; font-size:22px; font-weight:700; color:var(--teal); letter-spacing:-0.02em;">${peso(grandTotal)}</div>
      </div>
      <span id="cm-ready-badge" class="badge ${isReadyToDispense ? 'ok' : (hasDuplicateProducts ? 'low' : 'mid')}" style="font-size:11.5px; padding:5px 12px; font-weight:700;">${hasDuplicateProducts ? '⚠️ Duplicate Products Selected' : (!hasMinTwoIngredients ? '⚠️ Need At Least 2 Ingredients' : (isPctBalanced ? '✓ Ready to Dispense' : '⚠️ Adjust to 100%'))}</span>
    </div>
  </div>
</div>
  </div>
  ${renderColorMixOffcanvasDrawerHtml(colorMixModalProducts())}`;
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
  const compProductIds = s.components.map(c => c.productId).filter(Boolean);
  const hasDuplicateProducts = new Set(compProductIds).size < compProductIds.length;
  const isReadyToDispense = isPctBalanced && hasMinTwoIngredients && !hasDuplicateProducts;
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
    readyBadge.className = `badge ${isReadyToDispense ? 'ok' : (hasDuplicateProducts ? 'low' : 'mid')}`;
    readyBadge.textContent = hasDuplicateProducts
      ? '⚠️ Duplicate Products Selected'
      : (!hasMinTwoIngredients ? '⚠️ Need At Least 2 Ingredients' : (isPctBalanced ? '✓ Ready to Dispense' : '⚠️ Adjust to 100%'));
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
  if (typeof refreshColorMixPresetAvailabilityUI === 'function') {
    refreshColorMixPresetAvailabilityUI();
  } else {
    const presetWrap = document.getElementById('cm-preset-chips-wrap');
    if (presetWrap && typeof renderColorMixPresetChipsHtml === 'function') {
      presetWrap.innerHTML = renderColorMixPresetChipsHtml();
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
        ? `<span class="badge" style="background:#FDF4E3; color:#9A6216; border:1px solid #F0D9B5; font-size:9.5px; padding:1px 6px;">🫙 ${productOpenedSizesLabel(p, false)}</span>`
        : `<span class="badge ok" style="font-size:9.5px; padding:1px 6px;">🥫 ${formatStock(p.stock)}L</span>`}
            ${isSel ? `<span class="badge ok" style="font-size:9.5px; padding:1px 5px;">✓</span>` : ''}
          `}
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
    const slotMap = getColorMixSelectedProductSlotMap();
    dd.innerHTML = renderSmartAvatarSearchDropdownHtml(idx, prods, comp ? comp.productId : '', colorMixStudioState.inlineSearchQuery, slotMap);
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
  if (/house/i.test(raw)) return 'House Paint';
  if (/auto/i.test(raw)) return 'Automotive Paint';
  if (/special/i.test(raw)) return 'Specialty Paint';
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
          <div style="font-size:14px; font-weight:700; color:#92400E; display:flex; align-items:center; gap:6px;">
            <span>🫙</span> Opened / Used Containers
            <span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; font-size:10px; padding:1px 6px;">
              ${openedList.length} container${openedList.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style="font-size:11.5px; color:#A16207; margin-top:2px;">
            Previously opened containers with remaining paint.
          </div>
        </div>
        <div class="row" style="gap:8px; align-items:center;">
          <span class="badge" style="background:#FEF3C7; color:#B45309; border:1px solid #FDE68A; font-size:10.5px; font-weight:700; padding:3px 9px;">
            ⭐ Priority: Use Opened Containers First
          </span>
          <span style="font-size:13px; color:#B45309; font-weight:700;">${isExpanded ? '▴' : '▾'}</span>
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
        <code style="font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:4px; background:${light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)'}; color:${light ? '#1C1917' : '#FFFFFF'};">${hex}</code>
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
            <span class="badge" style="background:#EFECE6; color:var(--ink); font-size:11px; padding:2px 8px; font-weight:600;">
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
                ${comp && comp.name ? `Currently selected: <strong style="color:var(--ink);">${escapeHtml(comp.name)}</strong> · ${escapeHtml(comp.brand || '')} · <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${comp.hex || '#fff'}; vertical-align:middle; border:1px solid #ccc;"></span> ${escapeHtml(comp.hex || '')}` : 'Choose an opened container or unopened paint product'}
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
              <button type="button" class="btn text small" style="color:#1E40AF; font-weight:700; padding:1px 6px;" onclick="clearColorMixDrawerSearch()">✕ Clear</button>
            </div>
          ` : ''}
          ${renderCategorizedAccordionMenusHtml(idx, modalProds, selectedProductId, q, selectedPrefCan)}
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
          <button type="button" class="btn text small" style="color:#1E40AF; font-weight:700; padding:1px 6px;" onclick="clearColorMixDrawerSearch()">✕ Clear</button>
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

function setColorMixTypeFilter(typeFilter) {
  colorMixStudioState.typeFilter = typeFilter || 'all';
  if (typeFilter && typeFilter !== 'all') {
    colorMixStudioState.baseType = typeFilter;
  }
  renderColorMixStudio();
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
    const currentTotal = colorMixStudioState.components.reduce((s, c) => s + (Number(c.pct) || 0), 0);
    const remainingPct = Math.max(10, Math.round((100 - currentTotal) * 10) / 10);
    colorMixStudioState.components.push({
      id: uid('cmc'),
      productId: p.id,
      name: p.name,
      brand: p.brand || '',
      colorName: getProductColorName(p),
      color: getProductColorName(p),
      stock: p.stock,
      price: p.price,
      hex: getProductDefaultColor(p),
      pct: remainingPct,
      preferredCanSize: prefCan
    });
  } else {
    const comp = colorMixStudioState.components[idx];
    if (comp) {
      comp.productId = p.id;
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
  const usedIds = new Set(colorMixStudioState.components.map(c => String(c.productId)));
  const candidate = prods.find(p => !usedIds.has(String(p.id)));

  if (!candidate) {
    showToast('All available paint products are already selected across ingredient slots.', 'info');
    return;
  }

  colorMixStudioState.components.push({
    id: uid('cmc'),
    productId: candidate.id,
    name: candidate.name,
    brand: candidate.brand || '',
    colorName: getProductColorName(candidate),
    color: getProductColorName(candidate),
    stock: candidate.stock,
    price: candidate.price,
    hex: getProductDefaultColor(candidate),
    pct: remainingPct,
    preferredCanSize: 0
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

  for (const pid of Object.keys(reqLitersByProd)) {
    const p = productById(pid);
    if (!p) {
      showToast(`Selected product #${pid} was not found in inventory.`, 'error');
      return false;
    }
    const totalReq = reqLitersByProd[pid];
    const mixAvail = productMixAvailableStock(p);
    if (mixAvail < totalReq) {
      const shortage = Number((totalReq - mixAvail).toFixed(2));
      showToast(`Not enough stock for "${p.name}". Required: ${formatStock(totalReq)} L, Available: ${formatStock(mixAvail)} L (${formatStock(p.stock)} L sealed + ${formatStock(productOpenedStock(p))} L opened). Shortage: ${formatStock(shortage)} L.`, 'error');
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
    const p = productById(c.productId);
    const colorName = c.colorName || (p ? getProductColorName(p) : 'Original Color');
    const hex = c.hex || (p ? getProductDefaultColor(p) : '');
    return {
      productId: c.productId,
      name: c.name || (p ? p.name : 'Ingredient'),
      brand: c.brand || (p ? p.brand : ''),
      colorName: colorName,
      color: colorName,
      price: c.price,
      hex: hex,
      colorHex: hex,
      percentage: Number(c.pct),
      pctNum: Number(c.pct),
      liters: compLiters,
      preferredCanSize: Number(c.preferredCanSize) || 0,
      containerSource: ''
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
    return true;
  }
}

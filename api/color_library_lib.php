<?php
/**
 * Centralized Color Library & Custom Color Formula Helper Library
 * Fully offline, database-backed (MySQL).
 */

function colorLibraryAllowedCategories(): array {
    return [
        'White',
        'Black',
        'Gray',
        'Red',
        'Orange',
        'Yellow',
        'Green',
        'Blue',
        'Purple',
        'Brown',
        'Specialty Colors',
    ];
}

function colorLibraryAllowedClassifications(): array {
    return [
        'Primary Colors',
        'Secondary Colors',
        'Tertiary Colors',
        'Neutral Colors',
        'Earth Tones',
        'Pastel Colors',
        'Warm Colors',
        'Cool Colors',
        'Specialty Colors',
        'Custom Colors',
    ];
}

function colorLibraryAllowedVariations(): array {
    return ['Base', 'Tint', 'Shade', 'Tone'];
}

function colorLibraryNormalizeHex(string $raw): string {
    $h = strtoupper(trim($raw));
    if ($h !== '' && $h[0] !== '#') {
        $h = '#' . $h;
    }
    if (preg_match('/^#[0-9A-F]{3}$/', $h)) {
        $h = '#' . $h[1] . $h[1] . $h[2] . $h[2] . $h[3] . $h[3];
    }
    if (!preg_match('/^#[0-9A-F]{6}$/', $h)) {
        return '';
    }
    return $h;
}

function colorLibraryGetBuiltins(): array {
    // Curated, practical collection of common paint colors across all 9 categories.
    // Every name and HEX is unique.
    return [
        // White
        ['id' => 'clr_bi_pure_white',    'name' => 'Pure White',     'hex' => '#FFFFFF', 'category' => 'White', 'notes' => 'Clean neutral brilliant white base'],
        ['id' => 'clr_bi_pearl_white',   'name' => 'Pearl White',    'hex' => '#F8F6F0', 'category' => 'White', 'notes' => 'Soft warm pearl-tinted white'],
        ['id' => 'clr_bi_warm_white',    'name' => 'Warm White',     'hex' => '#F5F2EB', 'category' => 'White', 'notes' => 'Classic warm interior/exterior white'],
        ['id' => 'clr_bi_off_white',     'name' => 'Off White',      'hex' => '#F2EDE4', 'category' => 'White', 'notes' => 'Subtle muted off-white'],
        ['id' => 'clr_bi_ivory',         'name' => 'Ivory',          'hex' => '#FFFFF0', 'category' => 'White', 'notes' => 'Traditional soft ivory white'],
        ['id' => 'clr_bi_alabaster',     'name' => 'Alabaster',      'hex' => '#EDEAE0', 'category' => 'White', 'notes' => 'Soft stone-tinted white'],

        // Black
        ['id' => 'clr_bi_pure_black',    'name' => 'Pure Black',     'hex' => '#000000', 'category' => 'Black', 'notes' => 'Deep solid carbon black'],
        ['id' => 'clr_bi_jet_black',     'name' => 'Jet Black',      'hex' => '#1B1B1B', 'category' => 'Black', 'notes' => 'Rich automotive & enamel jet black'],
        ['id' => 'clr_bi_onyx_black',    'name' => 'Onyx Black',     'hex' => '#262629', 'category' => 'Black', 'notes' => 'Deep satin onyx tone'],
        ['id' => 'clr_bi_obsidian',      'name' => 'Obsidian',       'hex' => '#14171A', 'category' => 'Black', 'notes' => 'Cool-undertone deep black'],

        // Gray
        ['id' => 'clr_bi_light_gray',    'name' => 'Light Gray',     'hex' => '#D3D3D3', 'category' => 'Gray', 'notes' => 'Bright neutral light gray'],
        ['id' => 'clr_bi_silver_gray',   'name' => 'Silver Gray',    'hex' => '#C0C0C0', 'category' => 'Gray', 'notes' => 'Classic neutral silver gray'],
        ['id' => 'clr_bi_ash_gray',      'name' => 'Ash Gray',       'hex' => '#B2BEB5', 'category' => 'Gray', 'notes' => 'Soft cool ash tone'],
        ['id' => 'clr_bi_modern_slate',  'name' => 'Modern Slate',   'hex' => '#A6AAAE', 'category' => 'Gray', 'notes' => 'Architectural mid-light gray'],
        ['id' => 'clr_bi_medium_gray',   'name' => 'Medium Gray',    'hex' => '#808080', 'category' => 'Gray', 'notes' => 'Balanced neutral gray'],
        ['id' => 'clr_bi_slate_gray',    'name' => 'Slate Gray',     'hex' => '#708090', 'category' => 'Gray', 'notes' => 'Blue-undertone slate gray'],
        ['id' => 'clr_bi_dark_gray',     'name' => 'Dark Gray',      'hex' => '#5A5A5A', 'category' => 'Gray', 'notes' => 'Deep neutral industrial gray'],
        ['id' => 'clr_bi_charcoal_gray', 'name' => 'Charcoal Gray',  'hex' => '#36454F', 'category' => 'Gray', 'notes' => 'Rich dark charcoal'],
        ['id' => 'clr_bi_gunmetal_gray', 'name' => 'Gunmetal Gray',  'hex' => '#2A3439', 'category' => 'Gray', 'notes' => 'Dark steel gunmetal tone'],

        // Red
        ['id' => 'clr_bi_bright_red',    'name' => 'Bright Red',     'hex' => '#FF0000', 'category' => 'Red', 'notes' => 'Vibrant primary red'],
        ['id' => 'clr_bi_signal_red',    'name' => 'Signal Red',     'hex' => '#E32636', 'category' => 'Red', 'notes' => 'High-visibility safety & automotive red'],
        ['id' => 'clr_bi_crimson_red',   'name' => 'Crimson Red',    'hex' => '#DC143C', 'category' => 'Red', 'notes' => 'Deep rich crimson'],
        ['id' => 'clr_bi_cherry_red',    'name' => 'Cherry Red',     'hex' => '#D2042D', 'category' => 'Red', 'notes' => 'Glossy cherry red'],
        ['id' => 'clr_bi_brick_red',     'name' => 'Brick Red',      'hex' => '#CB4154', 'category' => 'Red', 'notes' => 'Warm masonry brick red'],
        ['id' => 'clr_bi_maroon',        'name' => 'Maroon',         'hex' => '#800000', 'category' => 'Red', 'notes' => 'Classic deep maroon'],
        ['id' => 'clr_bi_burgundy',      'name' => 'Burgundy',       'hex' => '#800020', 'category' => 'Red', 'notes' => 'Wine-toned dark red'],

        // Blue
        ['id' => 'clr_bi_sky_blue',      'name' => 'Sky Blue',       'hex' => '#87CEEB', 'category' => 'Blue', 'notes' => 'Light clear sky blue'],
        ['id' => 'clr_bi_baby_blue',     'name' => 'Baby Blue',      'hex' => '#89C1F2', 'category' => 'Blue', 'notes' => 'Soft pastel blue'],
        ['id' => 'clr_bi_powder_blue',   'name' => 'Powder Blue',    'hex' => '#B0E0E6', 'category' => 'Blue', 'notes' => 'Pale airy powder blue'],
        ['id' => 'clr_bi_royal_blue',    'name' => 'Royal Blue',     'hex' => '#4169E1', 'category' => 'Blue', 'notes' => 'Vivid classic royal blue'],
        ['id' => 'clr_bi_cobalt_blue',   'name' => 'Cobalt Blue',    'hex' => '#0047AB', 'category' => 'Blue', 'notes' => 'Deep saturated cobalt'],
        ['id' => 'clr_bi_ocean_blue',    'name' => 'Ocean Blue',     'hex' => '#006994', 'category' => 'Blue', 'notes' => 'Rich marine ocean blue'],
        ['id' => 'clr_bi_navy_blue',     'name' => 'Navy Blue',      'hex' => '#000080', 'category' => 'Blue', 'notes' => 'Deep dark navy'],
        ['id' => 'clr_bi_steel_blue',    'name' => 'Steel Blue',     'hex' => '#4682B4', 'category' => 'Blue', 'notes' => 'Muted industrial steel blue'],

        // Green
        ['id' => 'clr_bi_mint_green',    'name' => 'Mint Green',     'hex' => '#98FF98', 'category' => 'Green', 'notes' => 'Fresh pastel mint'],
        ['id' => 'clr_bi_sage_green',    'name' => 'Sage Green',     'hex' => '#9DC183', 'category' => 'Green', 'notes' => 'Earthy muted sage'],
        ['id' => 'clr_bi_emerald_green', 'name' => 'Emerald Green',  'hex' => '#50C878', 'category' => 'Green', 'notes' => 'Vibrant emerald green'],
        ['id' => 'clr_bi_lime_green',    'name' => 'Lime Green',     'hex' => '#32CD32', 'category' => 'Green', 'notes' => 'Bright energetic lime'],
        ['id' => 'clr_bi_forest_green',  'name' => 'Forest Green',   'hex' => '#228B22', 'category' => 'Green', 'notes' => 'Deep natural forest green'],
        ['id' => 'clr_bi_hunter_green',  'name' => 'Hunter Green',   'hex' => '#2E5B37', 'category' => 'Green', 'notes' => 'Classic dark hunter green'],
        ['id' => 'clr_bi_olive_green',   'name' => 'Olive Green',    'hex' => '#808000', 'category' => 'Green', 'notes' => 'Warm earthy olive'],

        // Yellow
        ['id' => 'clr_bi_pastel_yellow', 'name' => 'Pastel Yellow',  'hex' => '#FFF9A6', 'category' => 'Yellow', 'notes' => 'Soft light pastel yellow'],
        ['id' => 'clr_bi_lemon_yellow',  'name' => 'Lemon Yellow',   'hex' => '#FFF44F', 'category' => 'Yellow', 'notes' => 'Bright clean lemon yellow'],
        ['id' => 'clr_bi_canary_yellow', 'name' => 'Canary Yellow',  'hex' => '#FFEF00', 'category' => 'Yellow', 'notes' => 'Vivid canary yellow'],
        ['id' => 'clr_bi_golden_sun',    'name' => 'Golden Sun',     'hex' => '#FDB813', 'category' => 'Yellow', 'notes' => 'Warm golden yellow'],
        ['id' => 'clr_bi_mustard_yellow','name' => 'Mustard Yellow', 'hex' => '#E1AD01', 'category' => 'Yellow', 'notes' => 'Rich warm mustard'],
        ['id' => 'clr_bi_ochre',         'name' => 'Ochre',          'hex' => '#CC7722', 'category' => 'Yellow', 'notes' => 'Earthy golden ochre'],

        // Brown
        ['id' => 'clr_bi_beige',         'name' => 'Beige',          'hex' => '#F5F5DC', 'category' => 'Brown', 'notes' => 'Classic neutral beige'],
        ['id' => 'clr_bi_tan',           'name' => 'Tan',            'hex' => '#D2B48C', 'category' => 'Brown', 'notes' => 'Warm sandy tan'],
        ['id' => 'clr_bi_warm_taupe',    'name' => 'Warm Taupe',     'hex' => '#B38B6D', 'category' => 'Brown', 'notes' => 'Modern gray-brown taupe'],
        ['id' => 'clr_bi_mocha',         'name' => 'Mocha',          'hex' => '#967969', 'category' => 'Brown', 'notes' => 'Soft coffee mocha'],
        ['id' => 'clr_bi_chestnut',      'name' => 'Chestnut Brown', 'hex' => '#954535', 'category' => 'Brown', 'notes' => 'Warm reddish-brown chestnut'],
        ['id' => 'clr_bi_walnut',        'name' => 'Walnut',         'hex' => '#773F1A', 'category' => 'Brown', 'notes' => 'Rich wood-tone walnut'],
        ['id' => 'clr_bi_chocolate',     'name' => 'Chocolate Brown','hex' => '#3D2314', 'category' => 'Brown', 'notes' => 'Deep dark chocolate brown'],

        // Specialty Colors
        ['id' => 'clr_bi_metallic_gold', 'name' => 'Metallic Gold',  'hex' => '#D4AF37', 'category' => 'Specialty Colors', 'notes' => 'Specialty metallic gold tone'],
        ['id' => 'clr_bi_copper_bronze', 'name' => 'Copper Bronze',  'hex' => '#B87333', 'category' => 'Specialty Colors', 'notes' => 'Warm metallic copper-bronze'],
        ['id' => 'clr_bi_teal_accent',   'name' => 'Teal Accent',    'hex' => '#008080', 'category' => 'Specialty Colors', 'notes' => 'Deep blue-green specialty teal'],
        ['id' => 'clr_bi_turquoise',     'name' => 'Turquoise',      'hex' => '#40E0D0', 'category' => 'Specialty Colors', 'notes' => 'Bright tropical turquoise'],
        ['id' => 'clr_bi_terracotta',    'name' => 'Terracotta',     'hex' => '#E2725B', 'category' => 'Specialty Colors', 'notes' => 'Warm clay terracotta'],
        ['id' => 'clr_bi_safety_orange', 'name' => 'Safety Orange',  'hex' => '#FF6700', 'category' => 'Specialty Colors', 'notes' => 'High-visibility industrial orange'],
        ['id' => 'clr_bi_royal_purple',  'name' => 'Royal Purple',   'hex' => '#7851A9', 'category' => 'Specialty Colors', 'notes' => 'Deep specialty violet-purple'],
    ];
}

function colorLibraryGetRybClassificationAdditions(): array {
    return [
        // A. Primary Colors (RYB)
        ['id' => 'clr_bi_pure_yellow',   'name' => 'Pure Yellow',    'hex' => '#FFFF00', 'category' => 'Yellow', 'classification' => 'Primary Colors',   'color_family' => 'Yellow',   'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'RYB Primary pure yellow'],
        ['id' => 'clr_bi_pure_blue',     'name' => 'Pure Blue',      'hex' => '#0000FF', 'category' => 'Blue',   'classification' => 'Primary Colors',   'color_family' => 'Blue',     'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'RYB Primary pure blue'],

        // B. Secondary Colors (RYB)
        ['id' => 'clr_bi_pure_orange',   'name' => 'Pure Orange',    'hex' => '#FF7F00', 'category' => 'Orange', 'classification' => 'Secondary Colors', 'color_family' => 'Orange',   'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'RYB Secondary orange (Red + Yellow)'],
        ['id' => 'clr_bi_pure_green',    'name' => 'Pure Green',     'hex' => '#008000', 'category' => 'Green',  'classification' => 'Secondary Colors', 'color_family' => 'Green',    'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'RYB Secondary green (Yellow + Blue)'],
        ['id' => 'clr_bi_pure_violet',   'name' => 'Purple',         'hex' => '#800080', 'category' => 'Purple', 'classification' => 'Secondary Colors', 'color_family' => 'Purple',   'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'Deep, classic purple shade'],
        ['id' => 'clr_bi_violet',        'name' => 'Violet',         'hex' => '#8F00FF', 'category' => 'Purple', 'classification' => 'Secondary Colors', 'color_family' => 'Violet',   'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'Brighter, more vivid spectral violet shade'],

        // C. Tertiary Colors (RYB)
        ['id' => 'clr_bi_red_orange',    'name' => 'Red-Orange',     'hex' => '#FF4500', 'category' => 'Orange', 'classification' => 'Tertiary Colors',  'color_family' => 'Red-Orange',    'variation' => 'Base', 'parent_color_id' => 'clr_bi_pure_orange', 'notes' => 'RYB Tertiary (Red + Orange)'],
        ['id' => 'clr_bi_yellow_orange', 'name' => 'Yellow-Orange',  'hex' => '#FFAE42', 'category' => 'Orange', 'classification' => 'Tertiary Colors',  'color_family' => 'Yellow-Orange', 'variation' => 'Base', 'parent_color_id' => 'clr_bi_pure_orange', 'notes' => 'RYB Tertiary (Yellow + Orange)'],
        ['id' => 'clr_bi_yellow_green',  'name' => 'Yellow-Green',   'hex' => '#9ACD32', 'category' => 'Green',  'classification' => 'Tertiary Colors',  'color_family' => 'Yellow-Green',  'variation' => 'Base', 'parent_color_id' => 'clr_bi_pure_green',  'notes' => 'RYB Tertiary (Yellow + Green)'],
        ['id' => 'clr_bi_blue_green',    'name' => 'Blue-Green',     'hex' => '#0D98BA', 'category' => 'Blue',   'classification' => 'Tertiary Colors',  'color_family' => 'Blue-Green',    'variation' => 'Base', 'parent_color_id' => 'clr_bi_pure_green',  'notes' => 'RYB Tertiary (Blue + Green)'],
        ['id' => 'clr_bi_blue_violet',   'name' => 'Blue-Violet',    'hex' => '#8A2BE2', 'category' => 'Purple', 'classification' => 'Tertiary Colors',  'color_family' => 'Blue-Violet',   'variation' => 'Base', 'parent_color_id' => 'clr_bi_violet',      'notes' => 'RYB Tertiary (Blue + Violet)'],
        ['id' => 'clr_bi_red_violet',    'name' => 'Red-Violet',     'hex' => '#C71585', 'category' => 'Purple', 'classification' => 'Tertiary Colors',  'color_family' => 'Red-Violet',    'variation' => 'Base', 'parent_color_id' => 'clr_bi_violet',      'notes' => 'RYB Tertiary (Red + Violet)'],

        // F. Pastel Colors
        ['id' => 'clr_bi_pastel_pink',   'name' => 'Pastel Pink',    'hex' => '#F7B9BE', 'category' => 'Red',    'classification' => 'Pastel Colors',    'color_family' => 'Pastel Pink', 'variation' => 'Tint', 'parent_color_id' => 'clr_bi_bright_red',   'notes' => 'Soft pastel rose pink tint'],
        ['id' => 'clr_bi_lavender',      'name' => 'Lavender',       'hex' => '#C8A2C8', 'category' => 'Purple', 'classification' => 'Pastel Colors',    'color_family' => 'Lavender',    'variation' => 'Tint', 'parent_color_id' => 'clr_bi_pure_violet',  'notes' => 'Soft pastel lavender tint'],
        ['id' => 'clr_bi_peach',         'name' => 'Peach',          'hex' => '#FFE5B4', 'category' => 'Orange', 'classification' => 'Pastel Colors',    'color_family' => 'Peach',       'variation' => 'Tint', 'parent_color_id' => 'clr_bi_pure_orange',  'notes' => 'Warm pastel peach tint'],

        // G. Warm Colors
        ['id' => 'clr_bi_coral',         'name' => 'Coral',          'hex' => '#FF7F50', 'category' => 'Orange', 'classification' => 'Warm Colors',      'color_family' => 'Coral',       'variation' => 'Tone', 'parent_color_id' => 'clr_bi_pure_orange',  'notes' => 'Warm coral orange-pink'],
        ['id' => 'clr_bi_warm_yellow',   'name' => 'Warm Yellow',    'hex' => '#FFD300', 'category' => 'Yellow', 'classification' => 'Warm Colors',      'color_family' => 'Warm Yellow', 'variation' => 'Base', 'parent_color_id' => 'clr_bi_pure_yellow',  'notes' => 'Warm golden-amber yellow'],

        // H. Cool Colors
        ['id' => 'clr_bi_cool_gray',     'name' => 'Cool Gray',      'hex' => '#8C92AC', 'category' => 'Gray',   'classification' => 'Cool Colors',      'color_family' => 'Cool Gray',   'variation' => 'Tone', 'parent_color_id' => 'clr_bi_medium_gray',  'notes' => 'Blue-undertone cool gray'],

        // I. Specialty Colors
        ['id' => 'clr_bi_fluor_yellow',  'name' => 'Fluorescent Yellow', 'hex' => '#CCFF00', 'category' => 'Specialty Colors', 'classification' => 'Specialty Colors', 'color_family' => 'Fluorescent',      'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'High-visibility fluorescent neon yellow'],
        ['id' => 'clr_bi_fluor_pink',    'name' => 'Fluorescent Pink',   'hex' => '#FF1493', 'category' => 'Specialty Colors', 'classification' => 'Specialty Colors', 'color_family' => 'Fluorescent',      'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'High-visibility fluorescent neon pink'],
        ['id' => 'clr_bi_glow_green',    'name' => 'Glow-in-the-Dark Green', 'hex' => '#39FF14', 'category' => 'Specialty Colors', 'classification' => 'Specialty Colors', 'color_family' => 'Glow-in-the-dark', 'variation' => 'Base', 'parent_color_id' => null, 'notes' => 'Photoluminescent glow-in-the-dark pigment'],
    ];
}

function colorLibraryGetExistingClassificationMap(): array {
    return [
        // White -> Neutral Colors
        'clr_bi_pure_white'    => ['Neutral Colors', 'White', 'Base', null],
        'clr_bi_pearl_white'   => ['Specialty Colors', 'Pearl', 'Tint', 'clr_bi_pure_white'],
        'clr_bi_warm_white'    => ['Neutral Colors', 'White', 'Tint', 'clr_bi_pure_white'],
        'clr_bi_off_white'     => ['Neutral Colors', 'White', 'Tone', 'clr_bi_pure_white'],
        'clr_bi_ivory'         => ['Neutral Colors', 'White', 'Tint', 'clr_bi_pure_white'],
        'clr_bi_alabaster'     => ['Neutral Colors', 'White', 'Tone', 'clr_bi_pure_white'],
        // Black -> Neutral Colors
        'clr_bi_pure_black'    => ['Neutral Colors', 'Black', 'Base', null],
        'clr_bi_jet_black'     => ['Neutral Colors', 'Black', 'Shade', 'clr_bi_pure_black'],
        'clr_bi_onyx_black'    => ['Neutral Colors', 'Black', 'Tone', 'clr_bi_pure_black'],
        'clr_bi_obsidian'      => ['Neutral Colors', 'Black', 'Shade', 'clr_bi_pure_black'],
        // Gray -> Neutral Colors
        'clr_bi_light_gray'    => ['Neutral Colors', 'Gray', 'Tint', 'clr_bi_medium_gray'],
        'clr_bi_silver_gray'   => ['Neutral Colors', 'Gray', 'Tint', 'clr_bi_medium_gray'],
        'clr_bi_ash_gray'      => ['Neutral Colors', 'Gray', 'Tone', 'clr_bi_medium_gray'],
        'clr_bi_modern_slate'  => ['Neutral Colors', 'Gray', 'Tone', 'clr_bi_medium_gray'],
        'clr_bi_medium_gray'   => ['Neutral Colors', 'Gray', 'Base', null],
        'clr_bi_slate_gray'    => ['Cool Colors',    'Cool Gray', 'Tone', 'clr_bi_medium_gray'],
        'clr_bi_dark_gray'     => ['Neutral Colors', 'Gray', 'Shade', 'clr_bi_medium_gray'],
        'clr_bi_charcoal_gray' => ['Neutral Colors', 'Gray', 'Shade', 'clr_bi_medium_gray'],
        'clr_bi_gunmetal_gray' => ['Neutral Colors', 'Gray', 'Shade', 'clr_bi_medium_gray'],
        // Red -> Primary Colors / Warm Colors
        'clr_bi_bright_red'    => ['Primary Colors', 'Red', 'Base', null],
        'clr_bi_signal_red'    => ['Primary Colors', 'Red', 'Tone', 'clr_bi_bright_red'],
        'clr_bi_crimson_red'   => ['Primary Colors', 'Red', 'Shade', 'clr_bi_bright_red'],
        'clr_bi_cherry_red'    => ['Primary Colors', 'Red', 'Shade', 'clr_bi_bright_red'],
        'clr_bi_brick_red'     => ['Earth Tones',    'Red', 'Tone', 'clr_bi_bright_red'],
        'clr_bi_maroon'        => ['Warm Colors',    'Burgundy', 'Shade', 'clr_bi_bright_red'],
        'clr_bi_burgundy'      => ['Warm Colors',    'Burgundy', 'Shade', 'clr_bi_bright_red'],
        // Blue -> Primary Colors / Pastel / Cool Colors
        'clr_bi_sky_blue'      => ['Primary Colors', 'Blue', 'Tint', 'clr_bi_pure_blue'],
        'clr_bi_baby_blue'     => ['Pastel Colors',  'Baby Blue', 'Tint', 'clr_bi_pure_blue'],
        'clr_bi_powder_blue'   => ['Pastel Colors',  'Baby Blue', 'Tint', 'clr_bi_pure_blue'],
        'clr_bi_royal_blue'    => ['Primary Colors', 'Blue', 'Base', 'clr_bi_pure_blue'],
        'clr_bi_cobalt_blue'   => ['Primary Colors', 'Blue', 'Shade', 'clr_bi_pure_blue'],
        'clr_bi_ocean_blue'    => ['Cool Colors',    'Blue', 'Tone', 'clr_bi_pure_blue'],
        'clr_bi_navy_blue'     => ['Cool Colors',    'Navy Blue', 'Shade', 'clr_bi_pure_blue'],
        'clr_bi_steel_blue'    => ['Cool Colors',    'Blue', 'Tone', 'clr_bi_pure_blue'],
        // Green -> Secondary / Pastel / Earth
        'clr_bi_mint_green'    => ['Pastel Colors',    'Mint Green', 'Tint', 'clr_bi_pure_green'],
        'clr_bi_sage_green'    => ['Secondary Colors', 'Green', 'Tone', 'clr_bi_pure_green'],
        'clr_bi_emerald_green' => ['Secondary Colors', 'Green', 'Tint', 'clr_bi_pure_green'],
        'clr_bi_lime_green'    => ['Secondary Colors', 'Green', 'Tint', 'clr_bi_pure_green'],
        'clr_bi_forest_green'  => ['Secondary Colors', 'Green', 'Shade', 'clr_bi_pure_green'],
        'clr_bi_hunter_green'  => ['Secondary Colors', 'Green', 'Shade', 'clr_bi_pure_green'],
        'clr_bi_olive_green'   => ['Earth Tones',      'Green', 'Tone', 'clr_bi_pure_green'],
        // Yellow -> Primary / Pastel / Warm / Earth
        'clr_bi_pastel_yellow' => ['Pastel Colors',  'Yellow', 'Tint', 'clr_bi_pure_yellow'],
        'clr_bi_lemon_yellow'  => ['Primary Colors', 'Yellow', 'Tint', 'clr_bi_pure_yellow'],
        'clr_bi_canary_yellow' => ['Primary Colors', 'Yellow', 'Base', 'clr_bi_pure_yellow'],
        'clr_bi_golden_sun'    => ['Warm Colors',    'Warm Yellow', 'Tone', 'clr_bi_pure_yellow'],
        'clr_bi_mustard_yellow'=> ['Earth Tones',    'Ochre', 'Tone', 'clr_bi_pure_yellow'],
        'clr_bi_ochre'         => ['Earth Tones',    'Ochre', 'Tone', 'clr_bi_pure_yellow'],
        // Brown & Beige -> Neutral / Earth Tones
        'clr_bi_beige'         => ['Neutral Colors', 'Beige', 'Tint', null],
        'clr_bi_tan'           => ['Earth Tones',    'Tan', 'Tint', 'clr_bi_walnut'],
        'clr_bi_warm_taupe'    => ['Earth Tones',    'Tan', 'Tone', 'clr_bi_walnut'],
        'clr_bi_mocha'         => ['Earth Tones',    'Brown', 'Tone', 'clr_bi_walnut'],
        'clr_bi_chestnut'      => ['Earth Tones',    'Brown', 'Tone', 'clr_bi_walnut'],
        'clr_bi_walnut'        => ['Earth Tones',    'Brown', 'Base', null],
        'clr_bi_chocolate'     => ['Earth Tones',    'Brown', 'Shade', 'clr_bi_walnut'],
        // Specialty Colors -> Specialty / Cool / Earth / Secondary
        'clr_bi_metallic_gold' => ['Specialty Colors', 'Metallic', 'Base', null],
        'clr_bi_copper_bronze' => ['Specialty Colors', 'Metallic', 'Tone', null],
        'clr_bi_teal_accent'   => ['Cool Colors',      'Teal', 'Base', null],
        'clr_bi_turquoise'     => ['Cool Colors',      'Turquoise', 'Base', null],
        'clr_bi_terracotta'    => ['Earth Tones',      'Terracotta', 'Base', null],
        'clr_bi_safety_orange' => ['Secondary Colors', 'Orange', 'Base', 'clr_bi_pure_orange'],
        'clr_bi_royal_purple'  => ['Secondary Colors', 'Violet', 'Tone', 'clr_bi_pure_violet'],
    ];
}

function colorLibraryEnsureSchema(mysqli $conn): void {
    $flagFile = __DIR__ . '/.color_library_v4';
    if (file_exists($flagFile)) {
        return;
    }

    $conn->query("CREATE TABLE IF NOT EXISTS `color_library` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `name` VARCHAR(120) NOT NULL,
        `hex` VARCHAR(7) NOT NULL,
        `category` VARCHAR(60) NOT NULL,
        `classification` VARCHAR(80) NOT NULL DEFAULT 'Neutral Colors',
        `color_family` VARCHAR(60) NOT NULL DEFAULT '',
        `variation` VARCHAR(30) NOT NULL DEFAULT 'Base',
        `parent_color_id` VARCHAR(50) NULL,
        `is_custom` TINYINT(1) NOT NULL DEFAULT 0,
        `notes` TEXT NULL,
        `created_by` VARCHAR(150) NULL,
        `updated_by` VARCHAR(150) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_color_lib_name` (`name`),
        KEY `idx_color_lib_hex` (`hex`),
        KEY `idx_color_lib_cat` (`category`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Add v2 classification columns if upgrading from v1
    $colsToAdd = [
        'classification'  => "ALTER TABLE color_library ADD COLUMN classification VARCHAR(80) NOT NULL DEFAULT 'Neutral Colors' AFTER category",
        'color_family'    => "ALTER TABLE color_library ADD COLUMN color_family VARCHAR(60) NOT NULL DEFAULT '' AFTER classification",
        'variation'       => "ALTER TABLE color_library ADD COLUMN variation VARCHAR(30) NOT NULL DEFAULT 'Base' AFTER color_family",
        'parent_color_id' => "ALTER TABLE color_library ADD COLUMN parent_color_id VARCHAR(50) NULL AFTER variation",
    ];
    foreach ($colsToAdd as $col => $ddl) {
        $chk = $conn->query("SHOW COLUMNS FROM color_library LIKE '$col'");
        if ($chk && $chk->num_rows === 0) {
            $conn->query($ddl);
        }
    }

    $conn->query("CREATE TABLE IF NOT EXISTS `color_formulas` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `color_id` VARCHAR(50) NULL,
        `name` VARCHAR(150) NOT NULL,
        `hex_reference` VARCHAR(7) NOT NULL,
        `detected_name` VARCHAR(150) NULL,
        `base_type` VARCHAR(100) NULL,
        `sheen` VARCHAR(50) NULL,
        `notes` TEXT NULL,
        `pigment_formula` LONGTEXT NOT NULL,
        `is_custom` TINYINT(1) NOT NULL DEFAULT 1,
        `created_by` VARCHAR(150) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_cf_color_id` (`color_id`),
        KEY `idx_cf_name` (`name`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $chkColorId = $conn->query("SHOW COLUMNS FROM products LIKE 'color_id'");
    if ($chkColorId && $chkColorId->num_rows === 0) {
        $conn->query("ALTER TABLE products ADD COLUMN color_id VARCHAR(50) NULL AFTER color");
        $conn->query("ALTER TABLE products ADD INDEX idx_products_color_id (color_id)");
    }

    // Seed built-in colors if empty
    $cntRes = $conn->query("SELECT COUNT(*) AS cnt FROM color_library");
    $cnt = $cntRes ? (int)($cntRes->fetch_assoc()['cnt'] ?? 0) : 0;
    if ($cnt === 0) {
        $stmt = $conn->prepare("INSERT IGNORE INTO color_library (id, name, hex, category, is_custom, notes, created_by) VALUES (?, ?, ?, ?, 0, ?, 'System')");
        if ($stmt) {
            foreach (colorLibraryGetBuiltins() as $c) {
                $stmt->bind_param('sssss', $c['id'], $c['name'], $c['hex'], $c['category'], $c['notes']);
                $stmt->execute();
            }
            $stmt->close();
        }
    }

    // Apply RYB classification metadata to existing built-in colors without replacing them
    $updClass = $conn->prepare("UPDATE color_library SET classification = ?, color_family = ?, variation = ?, parent_color_id = ? WHERE id = ? AND is_custom = 0");
    if ($updClass) {
        foreach (colorLibraryGetExistingClassificationMap() as $cid => $meta) {
            $cls = $meta[0];
            $fam = $meta[1];
            $var = $meta[2];
            $pid = $meta[3];
            $updClass->bind_param('sssss', $cls, $fam, $var, $pid, $cid);
            $updClass->execute();
        }
        $updClass->close();
    }

    // Insert RYB Primary/Secondary/Tertiary/Pastel/Specialty additions if not already present (by id, name, or hex)
    $chkDup = $conn->prepare("SELECT id FROM color_library WHERE id = ? OR LOWER(name) = LOWER(?) OR UPPER(hex) = UPPER(?) LIMIT 1");
    $insAdd = $conn->prepare("INSERT IGNORE INTO color_library (id, name, hex, category, classification, color_family, variation, parent_color_id, is_custom, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'System')");
    // Ensure #800080 is named Purple (color_family = Purple) and #8F00FF is Violet (color_family = Violet)
    $conn->query("UPDATE color_library SET name = 'Purple', category = 'Purple', classification = 'Secondary Colors', color_family = 'Purple', notes = 'Deep, classic purple shade' WHERE id = 'clr_bi_pure_violet' AND hex = '#800080'");
    $conn->query("UPDATE color_library SET name = 'Violet', category = 'Purple', classification = 'Secondary Colors', color_family = 'Violet', notes = 'Brighter, more vivid spectral violet shade' WHERE id = 'clr_bi_violet' AND hex = '#8F00FF'");
    $conn->query("UPDATE color_library SET parent_color_id = 'clr_bi_violet' WHERE id IN ('clr_bi_blue_violet', 'clr_bi_red_violet')");

    if ($chkDup && $insAdd) {
        foreach (colorLibraryGetRybClassificationAdditions() as $c) {
            $chkDup->bind_param('sss', $c['id'], $c['name'], $c['hex']);
            $chkDup->execute();
            $exists = $chkDup->get_result()->fetch_assoc();
            if (!$exists) {
                $insAdd->bind_param('sssssssss', $c['id'], $c['name'], $c['hex'], $c['category'], $c['classification'], $c['color_family'], $c['variation'], $c['parent_color_id'], $c['notes']);
                $insAdd->execute();
            }
        }
        $chkDup->close();
        $insAdd->close();
    }

    // Ensure any existing custom colors have classification = 'Custom Colors' if unset
    $conn->query("UPDATE color_library SET classification = 'Custom Colors', color_family = IF(color_family = '', category, color_family) WHERE is_custom = 1 AND (classification = '' OR classification = 'Neutral Colors')");

    // Auto-link existing products to built-in colors where color_id is NULL
    $conn->query("UPDATE products p
        JOIN color_library cl ON (LOWER(TRIM(p.color)) = LOWER(TRIM(cl.name)) OR UPPER(TRIM(p.color_hex)) = UPPER(TRIM(cl.hex)))
        SET p.color_id = cl.id, p.color = cl.name, p.color_hex = cl.hex
        WHERE p.color_id IS NULL OR p.color_id = ''");

    @file_put_contents($flagFile, date('c'));
}

function colorLibraryFetchAll(mysqli $conn, bool $includeArchived = false): array {
    $colors = [];
    $whereArchived = $includeArchived ? '' : 'WHERE COALESCE(is_archived, 0) = 0';
    $res = $conn->query("SELECT * FROM color_library {$whereArchived} ORDER BY is_custom ASC, classification ASC, color_family ASC, name ASC");
    if ($res) {
        while ($r = $res->fetch_assoc()) {
            $colors[] = [
                'id' => $r['id'],
                'name' => $r['name'],
                'hex' => strtoupper($r['hex']),
                'category' => $r['category'],
                'classification' => $r['classification'] ?: ($r['is_custom'] ? 'Custom Colors' : 'Neutral Colors'),
                'colorFamily' => $r['color_family'] ?: $r['category'],
                'variation' => $r['variation'] ?: 'Base',
                'parentColorId' => $r['parent_color_id'] ?? null,
                'linkedProductId' => $r['linked_product_id'] ?? null,
                'isCustom' => (bool)$r['is_custom'],
                'isArchived' => !empty($r['is_archived']),
                'archivedAt' => $r['archived_at'] ?? null,
                'archivedBy' => $r['archived_by'] ?? null,
                'notes' => $r['notes'] ?? '',
                'createdBy' => $r['created_by'] ?? 'System',
                'updatedBy' => $r['updated_by'] ?? null,
                'createdAt' => $r['created_at'] ?? null,
                'updatedAt' => $r['updated_at'] ?? null,
            ];
        }
    }

    $formulas = [];
    $fRes = $conn->query("SELECT * FROM color_formulas ORDER BY created_at DESC, name ASC");
    if ($fRes) {
        while ($fr = $fRes->fetch_assoc()) {
            $pigmentFormula = json_decode($fr['pigment_formula'] ?? '[]', true);
            if (!is_array($pigmentFormula)) $pigmentFormula = [];
            $formulas[] = [
                'id' => $fr['id'],
                'colorId' => $fr['color_id'] ?? null,
                'name' => $fr['name'],
                'hexReference' => strtoupper($fr['hex_reference']),
                'detectedName' => $fr['detected_name'] ?? '',
                'baseType' => $fr['base_type'] ?? '',
                'sheen' => $fr['sheen'] ?? '',
                'notes' => $fr['notes'] ?? '',
                'pigmentFormula' => $pigmentFormula,
                'isCustom' => (bool)$fr['is_custom'],
                'createdBy' => $fr['created_by'] ?? null,
                'createdAt' => $fr['created_at'] ?? null,
                'updatedAt' => $fr['updated_at'] ?? null,
            ];
        }
    }

    return ['colors' => $colors, 'formulas' => $formulas];
}

function colorLibraryAuditLog(mysqli $conn, array $actor, string $action, string $entityName, string $field, string $oldVal, string $newVal, string $details): void {
    $now = date('Y-m-d H:i:s');
    $entity = 'Color Library';
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $uidv = (string)($actor['id'] ?? '');
    $un = (string)($actor['name'] ?? '');
    $ur = (string)($actor['role'] ?? '');
    $pid = '';
    $ref = '';
    $reason = '';
    $st = $conn->prepare("INSERT INTO audit_logs (created_at, user_id, user_name, user_role, action, entity, product_id, entity_name, field_changed, old_value, new_value, reference_no, reason, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if ($st) {
        $st->bind_param('sssssssssssssss', $now, $uidv, $un, $ur, $action, $entity, $pid, $entityName, $field, $oldVal, $newVal, $ref, $reason, $details, $ip);
        $st->execute();
        $st->close();
    }
}

function colorLibrarySaveColor(mysqli $conn, array $input, array $actor, array $syncOptions = []): array {
    if (($actor['role'] ?? '') !== 'admin') {
        return ['status' => 403, 'success' => false, 'error' => 'Access denied: Only Admin users can add or edit custom colors.'];
    }

    require_once __DIR__ . '/color_inventory_sync.php';

    $id = trim((string)($input['id'] ?? ''));
    $name = trim((string)($input['name'] ?? ''));
    $hex = colorLibraryNormalizeHex((string)($input['hex'] ?? ''));
    $classification = trim((string)($input['classification'] ?? 'Custom Colors'));
    $colorFamily = trim((string)($input['colorFamily'] ?? $input['category'] ?? ''));
    $variation = trim((string)($input['variation'] ?? 'Base'));
    $parentColorId = trim((string)($input['parentColorId'] ?? '')) ?: null;
    $category = trim((string)($input['category'] ?? ''));
    $notes = trim((string)($input['notes'] ?? ''));
    $productCategory = trim((string)($input['productCategory'] ?? ''));
    $linkedProductId = trim((string)($input['linkedProductId'] ?? ''));

    if (!in_array($classification, colorLibraryAllowedClassifications(), true)) {
        $classification = 'Custom Colors';
    }
    if (!in_array($variation, colorLibraryAllowedVariations(), true)) {
        $variation = 'Base';
    }
    if ($category === '') {
        // Derive legacy category from colorFamily or classification
        $category = in_array($colorFamily, colorLibraryAllowedCategories(), true) ? $colorFamily : 'Specialty Colors';
    }
    if ($colorFamily === '') {
        $colorFamily = $category;
    }

    if ($name === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Color name is required.'];
    }
    if ($hex === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Valid HEX code (e.g. #FFFFFF) is required.'];
    }
    if (!in_array($category, colorLibraryAllowedCategories(), true)) {
        return ['status' => 400, 'success' => false, 'error' => 'Invalid color category.'];
    }
    if ($parentColorId !== null && $parentColorId === $id) {
        $parentColorId = null;
    }

    $isEdit = false;
    $existingRow = null;
    if ($id !== '') {
        $chk = $conn->prepare("SELECT * FROM color_library WHERE id = ? LIMIT 1");
        if ($chk) {
            $chk->bind_param('s', $id);
            $chk->execute();
            $existingRow = $chk->get_result()->fetch_assoc();
            $chk->close();
        }
        if ($existingRow) {
            $isEdit = true;
            if ((int)$existingRow['is_custom'] !== 1) {
                return ['status' => 403, 'success' => false, 'error' => 'Built-in library colors cannot be modified. Add a custom color instead.'];
            }
        }
    }

    // Duplicate check: prevent duplicate name (case-insensitive) OR duplicate HEX (case-insensitive)
    $dupStmt = $conn->prepare("SELECT id, name, hex FROM color_library WHERE (LOWER(name) = LOWER(?) OR UPPER(hex) = UPPER(?)) AND id != ? LIMIT 1");
    if ($dupStmt) {
        $cmpId = $isEdit ? $id : '';
        $dupStmt->bind_param('sss', $name, $hex, $cmpId);
        $dupStmt->execute();
        $dupRow = $dupStmt->get_result()->fetch_assoc();
        $dupStmt->close();
        if ($dupRow) {
            if (strcasecmp($dupRow['name'], $name) === 0) {
                return ['status' => 409, 'success' => false, 'error' => "Duplicate color name: '{$dupRow['name']}' already exists in the Color Library."];
            }
            return ['status' => 409, 'success' => false, 'error' => "Duplicate HEX code: {$dupRow['hex']} is already assigned to '{$dupRow['name']}'."];
        }
    }

    $actorName = (string)($actor['name'] ?? 'Admin');
    $syncResult = ['synced' => false, 'action' => 'skipped', 'productId' => null, 'product' => null];

    $conn->begin_transaction();
    try {
        if ($isEdit) {
            $stmt = $conn->prepare("UPDATE color_library SET name = ?, hex = ?, category = ?, classification = ?, color_family = ?, variation = ?, parent_color_id = ?, notes = ?, updated_by = ? WHERE id = ? AND is_custom = 1");
            if (!$stmt) {
                throw new Exception('Failed to prepare color_library update: ' . $conn->error);
            }
            $stmt->bind_param('ssssssssss', $name, $hex, $category, $classification, $colorFamily, $variation, $parentColorId, $notes, $actorName, $id);
            if (!$stmt->execute()) {
                $err = $stmt->error;
                $stmt->close();
                throw new Exception('Failed to update custom color: ' . $err);
            }
            $stmt->close();

            // Synchronize updated Color Name, HEX, Classification, and Product Category to linked Inventory products
            $savedColorRow = [
                'id' => $id,
                'name' => $name,
                'hex' => $hex,
                'category' => $category,
                'classification' => $classification,
                'is_custom' => 1,
                'linked_product_id' => $existingRow['linked_product_id'] ?? null,
            ];
            $syncOpts = array_merge($syncOptions, [
                'productCategory' => $productCategory,
                'linkedProductId' => $linkedProductId,
            ]);
            $syncResult = colorSyncToInventoryProduct($conn, $savedColorRow, $existingRow, $actor, $syncOpts);

            colorLibraryAuditLog(
                $conn,
                $actor,
                'Update Custom Color',
                $name,
                'color_library',
                "{$existingRow['name']} ({$existingRow['hex']}, {$existingRow['classification']})",
                "{$name} ({$hex}, {$classification} · {$colorFamily} · {$variation})",
                "Updated custom color '{$name}' ({$hex}) in '{$classification}' ({$colorFamily}, {$variation})."
            );
        } else {
            $id = 'clr_cust_' . bin2hex(random_bytes(5));
            $stmt = $conn->prepare("INSERT INTO color_library (id, name, hex, category, classification, color_family, variation, parent_color_id, is_custom, is_archived, notes, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)");
            if (!$stmt) {
                throw new Exception('Failed to prepare color_library insert: ' . $conn->error);
            }
            $stmt->bind_param('sssssssssss', $id, $name, $hex, $category, $classification, $colorFamily, $variation, $parentColorId, $notes, $actorName, $actorName);
            if (!$stmt->execute()) {
                $err = $stmt->error;
                $stmt->close();
                throw new Exception('Failed to insert custom color: ' . $err);
            }
            $stmt->close();

            // Automatically create or link corresponding Inventory pigment product (initialized to 0 stock)
            $savedColorRow = [
                'id' => $id,
                'name' => $name,
                'hex' => $hex,
                'category' => $category,
                'classification' => $classification,
                'is_custom' => 1,
                'linked_product_id' => null,
            ];
            $syncOpts = array_merge($syncOptions, [
                'productCategory' => $productCategory ?: colorSyncDefaultProductCategory(),
                'linkedProductId' => $linkedProductId,
            ]);
            $syncResult = colorSyncToInventoryProduct($conn, $savedColorRow, null, $actor, $syncOpts);

            colorLibraryAuditLog(
                $conn,
                $actor,
                'Add Custom Color',
                $name,
                'color_library',
                '',
                "{$name} ({$hex}, {$classification} · {$colorFamily} · {$variation})",
                "Added custom color '{$name}' ({$hex}) to '{$classification}' ({$colorFamily}, {$variation})."
            );
        }

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        return [
            'status' => 500,
            'success' => false,
            'error' => 'Synchronization failed and was rolled back: ' . $e->getMessage(),
        ];
    }

    $all = colorLibraryFetchAll($conn);
    $saved = null;
    foreach ($all['colors'] as $c) {
        if ($c['id'] === $id) {
            $saved = $c;
            break;
        }
    }

    return [
        'status' => 200,
        'success' => true,
        'color' => $saved,
        'colorLibrary' => $all['colors'],
        'syncedProduct' => $syncResult['product'] ?? null,
        'syncedProductId' => $syncResult['productId'] ?? null,
        'syncAction' => $syncResult['action'] ?? 'skipped',
    ];
}

function colorLibraryDeleteColor(mysqli $conn, string $id, array $actor, string $reassignToId = '', string $mode = 'delete'): array {
    if (($actor['role'] ?? '') !== 'admin') {
        return ['status' => 403, 'success' => false, 'error' => 'Access denied: Only Admin users can delete or archive custom colors.'];
    }
    $id = trim($id);
    $reassignToId = trim($reassignToId);
    $mode = in_array($mode, ['delete', 'archive', 'unlink'], true) ? $mode : 'delete';
    if ($id === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Color ID is required.'];
    }

    $chk = $conn->prepare("SELECT * FROM color_library WHERE id = ? LIMIT 1");
    $chk->bind_param('s', $id);
    $chk->execute();
    $existing = $chk->get_result()->fetch_assoc();
    $chk->close();

    if (!$existing) {
        return ['status' => 404, 'success' => false, 'error' => 'Color not found.'];
    }
    if ((int)$existing['is_custom'] !== 1) {
        return ['status' => 403, 'success' => false, 'error' => 'Built-in library colors cannot be deleted or archived.'];
    }

    $actorName = (string)($actor['name'] ?? 'Admin');

    // Mode 1: Archive (never deletes inventory products, sales, movements, or formulas)
    if ($mode === 'archive') {
        $conn->begin_transaction();
        try {
            $now = date('Y-m-d H:i:s');
            $arch = $conn->prepare("UPDATE color_library SET is_archived = 1, archived_at = ?, archived_by = ?, linked_product_id = NULL, updated_by = ? WHERE id = ? AND is_custom = 1");
            $arch->bind_param('ssss', $now, $actorName, $actorName, $id);
            $arch->execute();
            $arch->close();

            $delMap = $conn->prepare("DELETE FROM color_inventory_sync_map WHERE color_id = ?");
            if ($delMap) {
                $delMap->bind_param('s', $id);
                $delMap->execute();
                $delMap->close();
            }

            // Unlink active products' color_id while preserving their color name & HEX display text and stock
            $uProd = $conn->prepare("UPDATE products SET color_id = NULL WHERE color_id = ?");
            if ($uProd) {
                $uProd->bind_param('s', $id);
                $uProd->execute();
                $uProd->close();
            }

            colorLibraryAuditLog(
                $conn,
                $actor,
                'Archive Custom Color',
                $existing['name'],
                'color_library',
                "{$existing['name']} ({$existing['hex']}, Active)",
                'Archived (Inventory products preserved & unlinked)',
                "Archived custom color '{$existing['name']}' ({$existing['hex']}). Linked inventory products and historical records were preserved."
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            return ['status' => 500, 'success' => false, 'error' => 'Failed to archive color: ' . $e->getMessage()];
        }

        $all = colorLibraryFetchAll($conn);
        return [
            'status' => 200,
            'success' => true,
            'mode' => 'archive',
            'colorLibrary' => $all['colors'],
            'colorFormulas' => $all['formulas'],
        ];
    }

    // Check active products and saved formulas referencing this color
    $prodCount = 0;
    $pChk = $conn->prepare("SELECT COUNT(*) AS cnt FROM products WHERE color_id = ? AND status != 'discontinued'");
    if ($pChk) {
        $pChk->bind_param('s', $id);
        $pChk->execute();
        $prodCount = (int)($pChk->get_result()->fetch_assoc()['cnt'] ?? 0);
        $pChk->close();
    }

    $formCount = 0;
    $fChk = $conn->prepare("SELECT COUNT(*) AS cnt FROM color_formulas WHERE color_id = ?");
    if ($fChk) {
        $fChk->bind_param('s', $id);
        $fChk->execute();
        $formCount = (int)($fChk->get_result()->fetch_assoc()['cnt'] ?? 0);
        $fChk->close();
    }

    $reassignedToName = '';
    if ($mode === 'delete' && ($prodCount > 0 || $formCount > 0) && ($reassignToId === '' || $reassignToId === $id)) {
        return [
            'status' => 409,
            'success' => false,
            'requiresReassignment' => true,
            'referencedProducts' => $prodCount,
            'referencedFormulas' => $formCount,
            'error' => "Cannot delete '{$existing['name']}': it is currently referenced by {$prodCount} active product(s) and {$formCount} saved formula(s). Reassign them, unlink, or archive this color instead. Inventory products will never be deleted."
        ];
    }

    $conn->begin_transaction();
    try {
        if ($mode === 'unlink') {
            // Unlink products and formulas without deleting any inventory product or formula
            $uProd = $conn->prepare("UPDATE products SET color_id = NULL WHERE color_id = ?");
            if ($uProd) {
                $uProd->bind_param('s', $id);
                $uProd->execute();
                $uProd->close();
            }
            $uForm = $conn->prepare("UPDATE color_formulas SET color_id = NULL WHERE color_id = ?");
            if ($uForm) {
                $uForm->bind_param('s', $id);
                $uForm->execute();
                $uForm->close();
            }
        } elseif ($prodCount > 0 || $formCount > 0) {
            $tChk = $conn->prepare("SELECT id, name, hex, classification FROM color_library WHERE id = ? AND COALESCE(is_archived, 0) = 0 LIMIT 1");
            $tChk->bind_param('s', $reassignToId);
            $tChk->execute();
            $target = $tChk->get_result()->fetch_assoc();
            $tChk->close();
            if (!$target) {
                $conn->rollback();
                return ['status' => 400, 'success' => false, 'error' => 'Selected replacement color was not found in the Color Library.'];
            }

            $reassignedToName = $target['name'];
            $targetCls = $target['classification'] ?: 'Neutral Colors';
            $uProd = $conn->prepare("UPDATE products SET color_id = ?, color = ?, color_hex = ?, color_classification = ? WHERE color_id = ?");
            if ($uProd) {
                $uProd->bind_param('sssss', $target['id'], $target['name'], $target['hex'], $targetCls, $id);
                $uProd->execute();
                $uProd->close();
            }
            $uForm = $conn->prepare("UPDATE color_formulas SET color_id = ?, hex_reference = ? WHERE color_id = ?");
            if ($uForm) {
                $uForm->bind_param('sss', $target['id'], $target['hex'], $id);
                $uForm->execute();
                $uForm->close();
            }
        } else {
            // Clear any discontinued product links cleanly (never delete products)
            $uProd = $conn->prepare("UPDATE products SET color_id = NULL WHERE color_id = ?");
            if ($uProd) {
                $uProd->bind_param('s', $id);
                $uProd->execute();
                $uProd->close();
            }
        }

        // Remove mapping and delete only the color_library row (NEVER deletes inventory products)
        $delMap = $conn->prepare("DELETE FROM color_inventory_sync_map WHERE color_id = ?");
        if ($delMap) {
            $delMap->bind_param('s', $id);
            $delMap->execute();
            $delMap->close();
        }

        $del = $conn->prepare("DELETE FROM color_library WHERE id = ? AND is_custom = 1");
        $del->bind_param('s', $id);
        $del->execute();
        $del->close();

        $detailMsg = "Deleted custom color '{$existing['name']}' ({$existing['hex']}). Inventory products were preserved.";
        if ($mode === 'unlink') {
            $detailMsg = "Unlinked and deleted custom color '{$existing['name']}' ({$existing['hex']}). {$prodCount} inventory product(s) and {$formCount} formula(s) were preserved.";
        } elseif ($reassignedToName !== '') {
            $detailMsg .= " Reassigned {$prodCount} product(s) and {$formCount} formula(s) to '{$reassignedToName}'.";
        }

        colorLibraryAuditLog(
            $conn,
            $actor,
            $mode === 'unlink' ? 'Unlink & Delete Custom Color' : 'Delete Custom Color',
            $existing['name'],
            'color_library',
            "{$existing['name']} ({$existing['hex']}, {$existing['category']})",
            $reassignedToName !== '' ? "Deleted (Reassigned to {$reassignedToName})" : ($mode === 'unlink' ? 'Unlinked & Deleted (Products Preserved)' : 'Deleted'),
            $detailMsg
        );

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        return ['status' => 500, 'success' => false, 'error' => 'Failed to delete color: ' . $e->getMessage()];
    }

    $all = colorLibraryFetchAll($conn);
    return [
        'status' => 200,
        'success' => true,
        'mode' => $mode,
        'colorLibrary' => $all['colors'],
        'colorFormulas' => $all['formulas'],
        'reassignedTo' => $reassignedToName ?: null,
    ];
}

function colorLibrarySaveFormula(mysqli $conn, array $input, array $actor): array {
    $id = trim((string)($input['id'] ?? ''));
    $name = trim((string)($input['name'] ?? ''));
    $hexRef = colorLibraryNormalizeHex((string)($input['hexReference'] ?? $input['hex'] ?? ''));
    $detectedName = trim((string)($input['detectedName'] ?? ''));
    $baseType = trim((string)($input['baseType'] ?? ''));
    $sheen = trim((string)($input['sheen'] ?? ''));
    $notes = trim((string)($input['notes'] ?? ''));
    $colorId = trim((string)($input['colorId'] ?? '')) ?: null;
    $pigmentFormula = $input['pigmentFormula'] ?? $input['recipe'] ?? [];

    if ($name === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Formula color name is required.'];
    }
    if ($hexRef === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Valid HEX reference is required.'];
    }
    if (!is_array($pigmentFormula) || count($pigmentFormula) < 2) {
        return ['status' => 400, 'success' => false, 'error' => 'At least 2 pigment formula components are required.'];
    }
    $pctSum = 0.0;
    foreach ($pigmentFormula as $comp) {
        $pVal = is_array($comp) ? (float)($comp['percentage'] ?? $comp['pct'] ?? 0) : 0.0;
        if ($pVal <= 0) {
            return ['status' => 400, 'success' => false, 'error' => 'Every pigment component must have a percentage greater than 0%.'];
        }
        $pctSum += $pVal;
    }
    if (abs($pctSum - 100.0) > 0.5) {
        return ['status' => 400, 'success' => false, 'error' => 'Pigment formula percentages must total exactly 100% (currently ' . round($pctSum, 2) . '%).'];
    }

    $pigmentJson = json_encode(array_values($pigmentFormula), JSON_UNESCAPED_UNICODE);
    $actorName = (string)($actor['name'] ?? 'User');
    $isAdminActor = (($actor['role'] ?? '') === 'admin');

    // Update if same custom formula name exists or id provided
    $existingId = '';
    if ($id !== '') {
        $chk = $conn->prepare("SELECT id FROM color_formulas WHERE id = ? LIMIT 1");
        $chk->bind_param('s', $id);
        $chk->execute();
        if ($r = $chk->get_result()->fetch_assoc()) $existingId = $r['id'];
        $chk->close();
    } else {
        $chk = $conn->prepare("SELECT id FROM color_formulas WHERE LOWER(name) = LOWER(?) LIMIT 1");
        $chk->bind_param('s', $name);
        $chk->execute();
        if ($r = $chk->get_result()->fetch_assoc()) $existingId = $r['id'];
        $chk->close();
    }

    if ($existingId !== '') {
        if (!$isAdminActor) {
            return ['status' => 403, 'success' => false, 'error' => 'Access denied: Only Administrators can modify existing Mixed Color Catalog formulas. Save under a new custom name instead.'];
        }
        $stmt = $conn->prepare("UPDATE color_formulas SET color_id = ?, name = ?, hex_reference = ?, detected_name = ?, base_type = ?, sheen = ?, notes = ?, pigment_formula = ? WHERE id = ?");
        $stmt->bind_param('sssssssss', $colorId, $name, $hexRef, $detectedName, $baseType, $sheen, $notes, $pigmentJson, $existingId);
        $stmt->execute();
        $stmt->close();
        $id = $existingId;
    } else {
        $id = 'cf_' . bin2hex(random_bytes(5));
        $stmt = $conn->prepare("INSERT INTO color_formulas (id, color_id, name, hex_reference, detected_name, base_type, sheen, notes, pigment_formula, is_custom, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)");
        $stmt->bind_param('ssssssssss', $id, $colorId, $name, $hexRef, $detectedName, $baseType, $sheen, $notes, $pigmentJson, $actorName);
        $stmt->execute();
        $stmt->close();
    }

    colorLibraryAuditLog(
        $conn,
        $actor,
        'Save Color Formula',
        $name,
        'color_formulas',
        '',
        "{$name} (HEX Ref: {$hexRef})",
        "Saved custom pigment formula '{$name}' with HEX reference {$hexRef}."
    );

    $all = colorLibraryFetchAll($conn);
    return [
        'status' => 200,
        'success' => true,
        'formulaId' => $id,
        'colorFormulas' => $all['formulas'],
    ];
}

function colorLibraryDeleteFormula(mysqli $conn, string $id, array $actor): array {
    if (($actor['role'] ?? '') !== 'admin') {
        return ['status' => 403, 'success' => false, 'error' => 'Access denied: Only Administrators can delete color formulas.'];
    }
    $id = trim($id);
    if ($id === '') {
        return ['status' => 400, 'success' => false, 'error' => 'Formula ID is required.'];
    }
    $del = $conn->prepare("DELETE FROM color_formulas WHERE id = ?");
    $del->bind_param('s', $id);
    $del->execute();
    $del->close();

    $all = colorLibraryFetchAll($conn);
    return [
        'status' => 200,
        'success' => true,
        'colorFormulas' => $all['formulas'],
    ];
}

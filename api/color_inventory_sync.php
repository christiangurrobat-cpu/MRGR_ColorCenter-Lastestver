<?php
/**
 * Genuine Database-Level Two-Way Synchronization Engine
 * Between Inventory (products / product_sizes / inventory)
 * and Color Library (color_library / color_inventory_sync_map).
 *
 * Rules:
 * - Only color-related pigment/colorant products trigger Inventory -> Color Library auto-creation.
 * - Regular paints (House Paint, Automotive Paint, Specialty Paint), accessories, tools, and
 *   non-color items do NOT auto-create Color Library entries.
 * - Custom Colors created in Base Color Library / Custom Colors automatically create or link
 *   a corresponding Inventory product (category: Pigment / Colorant) initialized to 0 stock.
 * - Mixed Color Catalog formulas (color_formulas) NEVER auto-create inventory products.
 * - Stock quantities are NEVER synchronized from Color Library; Inventory is the sole source of stock.
 * - All operations run inside MariaDB InnoDB transactions with re-entrancy guards to prevent loops.
 */

require_once __DIR__ . '/color_library_lib.php';

/**
 * Re-entrancy guard state to prevent infinite synchronization loops.
 */
$GLOBALS['__color_sync_active'] = false;
$GLOBALS['__color_sync_origin'] = '';

function colorSyncIsActive(): bool {
    return !empty($GLOBALS['__color_sync_active']);
}

function colorSyncGetOrigin(): string {
    return (string)($GLOBALS['__color_sync_origin'] ?? '');
}

/**
 * Execute a callback inside a re-entrancy guard so reverse-direction sync cannot re-trigger.
 */
function colorSyncWithGuard(string $origin, callable $fn) {
    if (!empty($GLOBALS['__color_sync_active'])) {
        return ['skipped' => true, 'reason' => 'sync_already_in_progress', 'origin' => $GLOBALS['__color_sync_origin']];
    }
    $GLOBALS['__color_sync_active'] = true;
    $GLOBALS['__color_sync_origin'] = $origin;
    try {
        return $fn();
    } finally {
        $GLOBALS['__color_sync_active'] = false;
        $GLOBALS['__color_sync_origin'] = '';
    }
}

/**
 * Ensure database schema columns, foreign keys, unique indexes, and mapping table exist.
 */
function colorSyncEnsureSchema(mysqli $conn, bool $force = false): void {
    $flagFile = __DIR__ . '/.color_sync_v1';
    if (!$force && file_exists($flagFile)) {
        return;
    }

    // Ensure base color_library schema exists first
    colorLibraryEnsureSchema($conn);

    // 1. Add columns to color_library
    $clCols = [
        'linked_product_id' => "ALTER TABLE `color_library` ADD COLUMN `linked_product_id` VARCHAR(50) NULL AFTER `parent_color_id`",
        'is_archived'       => "ALTER TABLE `color_library` ADD COLUMN `is_archived` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_custom`",
        'archived_at'       => "ALTER TABLE `color_library` ADD COLUMN `archived_at` DATETIME NULL AFTER `is_archived`",
        'archived_by'       => "ALTER TABLE `color_library` ADD COLUMN `archived_by` VARCHAR(150) NULL AFTER `archived_at`",
    ];
    foreach ($clCols as $col => $ddl) {
        $chk = $conn->query("SHOW COLUMNS FROM `color_library` LIKE '{$col}'");
        if ($chk && $chk->num_rows === 0) {
            $conn->query($ddl);
        }
    }

    // Unique index on color_library.linked_product_id (allows multiple NULLs, enforces 1-to-1 primary link)
    $idxChk = $conn->query("SHOW INDEX FROM `color_library` WHERE Key_name = 'uk_color_lib_linked_product'");
    if ($idxChk && $idxChk->num_rows === 0) {
        @$conn->query("ALTER TABLE `color_library` ADD UNIQUE KEY `uk_color_lib_linked_product` (`linked_product_id`)");
    }

    // Index on color_library.is_archived
    $idxArch = $conn->query("SHOW INDEX FROM `color_library` WHERE Key_name = 'idx_color_lib_archived'");
    if ($idxArch && $idxArch->num_rows === 0) {
        @$conn->query("ALTER TABLE `color_library` ADD KEY `idx_color_lib_archived` (`is_archived`)");
    }

    // 2. Add columns to products
    $pCols = [
        'color_classification' => "ALTER TABLE `products` ADD COLUMN `color_classification` VARCHAR(80) NULL AFTER `color_id`",
        'is_color_pigment'     => "ALTER TABLE `products` ADD COLUMN `is_color_pigment` TINYINT(1) NOT NULL DEFAULT 0 AFTER `color_hex`",
    ];
    foreach ($pCols as $col => $ddl) {
        $chk = $conn->query("SHOW COLUMNS FROM `products` LIKE '{$col}'");
        if ($chk && $chk->num_rows === 0) {
            $conn->query($ddl);
        }
    }

    // Clean any empty-string color_id or orphaned color_id before adding FK
    $conn->query("UPDATE `products` SET `color_id` = NULL WHERE `color_id` = ''");
    $conn->query("UPDATE `products` p LEFT JOIN `color_library` cl ON cl.id = p.color_id SET p.color_id = NULL WHERE p.color_id IS NOT NULL AND cl.id IS NULL");

    // Clean any orphaned linked_product_id before adding FK
    $conn->query("UPDATE `color_library` SET `linked_product_id` = NULL WHERE `linked_product_id` = ''");
    $conn->query("UPDATE `color_library` cl LEFT JOIN `products` p ON p.id = cl.linked_product_id SET cl.linked_product_id = NULL WHERE cl.linked_product_id IS NOT NULL AND p.id IS NULL");

    // Add Foreign Keys if missing
    $fkProdChk = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND CONSTRAINT_NAME = 'fk_products_color_id'");
    if ($fkProdChk && $fkProdChk->num_rows === 0) {
        @$conn->query("ALTER TABLE `products` ADD CONSTRAINT `fk_products_color_id` FOREIGN KEY (`color_id`) REFERENCES `color_library` (`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    }

    $fkClChk = $conn->query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'color_library' AND CONSTRAINT_NAME = 'fk_color_lib_linked_product'");
    if ($fkClChk && $fkClChk->num_rows === 0) {
        @$conn->query("ALTER TABLE `color_library` ADD CONSTRAINT `fk_color_lib_linked_product` FOREIGN KEY (`linked_product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    }

    // 3. Dedicated mapping table for reliable two-way relationships
    $conn->query("CREATE TABLE IF NOT EXISTS `color_inventory_sync_map` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `color_id` VARCHAR(50) NOT NULL,
        `product_id` VARCHAR(50) NOT NULL,
        `sync_origin` ENUM('inventory', 'color_library', 'auto_link') NOT NULL DEFAULT 'auto_link',
        `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
        `created_by` VARCHAR(150) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_cism_color_product` (`color_id`, `product_id`),
        UNIQUE KEY `uk_cism_product` (`product_id`),
        KEY `idx_cism_color` (`color_id`),
        CONSTRAINT `fk_cism_color` FOREIGN KEY (`color_id`) REFERENCES `color_library` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT `fk_cism_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Backfill color_classification on products already linked to color_library
    $conn->query("UPDATE `products` p
        JOIN `color_library` cl ON cl.id = p.color_id
        SET p.color_classification = cl.classification
        WHERE p.color_id IS NOT NULL AND (p.color_classification IS NULL OR p.color_classification = '')");

    @file_put_contents($flagFile, date('c'));

    // Ensure all existing Base Colors in color_library have a corresponding Pigment / Colorant inventory product
    $baseSyncFlag = __DIR__ . '/.base_colors_synced_v1';
    if ($force || !file_exists($baseSyncFlag)) {
        $res = colorSyncEnsureAllBaseColorsHaveProducts($conn);
        if (empty($res['errors'])) {
            @file_put_contents($baseSyncFlag, date('c'));
        }
    }
}

/**
 * Format standardized inventory product name for a Base Color pigment:
 * "<Color Name> Pigment" (without duplicating "Pigment" if already suffixed).
 */
function colorSyncFormatPigmentProductName(string $colorName): string {
    $clean = trim($colorName);
    if ($clean === '') return 'Unnamed Pigment';
    if (preg_match('/\bpigment$/i', $clean)) {
        return $clean;
    }
    return $clean . ' Pigment';
}

/**
 * Categories recognized as paint pigments / colorants eligible for two-way sync.
 */
function colorSyncDefaultProductCategory(): string {
    return 'Pigment / Colorant';
}

function colorSyncIsPigmentCategory(string $categoryOrType): bool {
    $norm = strtolower(trim($categoryOrType));
    if ($norm === '') return false;
    $exact = [
        'pigment / colorant',
        'pigment/colorant',
        'pigment',
        'pigments',
        'colorant',
        'colorants',
        'tinting color',
        'tinting colors',
        'tinting colorant',
        'paint pigment',
        'base pigment',
        'color pigment',
        'colorant / pigment',
        'colorant/pigment',
    ];
    if (in_array($norm, $exact, true)) {
        return true;
    }
    return (bool)preg_match('/\b(pigment|colorant|tinting\s*color)\b/i', $norm);
}

/**
 * Categories that are explicitly non-color items and must NEVER trigger Color Library creation.
 */
function colorSyncIsNonColorCategory(string $categoryOrType): bool {
    $norm = strtolower(trim($categoryOrType));
    if ($norm === '') return false;
    return (bool)preg_match(
        '/\b(accessor\w*|tools?|hardware|equipment|suppl\w*|thinner\w*|solvent\w*|reducer\w*|primer\w*|putt\w*|filler\w*|sandpaper|abrasive\w*|brush\w*|roller\w*|tray\w*|tape\w*|adhesive\w*|glue\w*|sealant\w*|varnish\w*|clear\s*coat|top\s*coat|hardener\w*|catalyst\w*)\b/i',
        $norm
    );
}

/**
 * Determine whether an inventory product represents a paint pigment or colorant
 * that should trigger Inventory -> Color Library synchronization.
 *
 * Regular paint products (House Paint, Automotive Paint, Specialty Paint),
 * accessories, tools, and non-color items return FALSE.
 */
function colorSyncIsColorProduct(array $product): bool {
    $type = trim((string)($product['type'] ?? ''));
    $category = trim((string)($product['category'] ?? $type));
    $colorName = trim((string)($product['color'] ?? ''));
    $prodName = trim((string)($product['name'] ?? ($product['productName'] ?? ($product['product_name'] ?? ''))));

    // Reject explicitly non-color categories
    if (colorSyncIsNonColorCategory($category) || colorSyncIsNonColorCategory($type)) {
        return false;
    }

    // Reject non-color names (Clear, None, '-', N/A, Transparent)
    $checkName = ($colorName !== '' && $colorName !== '-') ? $colorName : $prodName;
    if ($checkName === '' || preg_match('/^(-|none|n\/a|clear|transparent|colorless|clear\s*coat)$/i', $checkName)) {
        return false;
    }

    // Must be in a Pigment/Colorant category OR explicitly flagged as a color pigment
    if (colorSyncIsPigmentCategory($category) || colorSyncIsPigmentCategory($type)) {
        return true;
    }

    $explicitFlag = !empty($product['isColorPigment']) || !empty($product['is_color_pigment']);
    if ($explicitFlag) {
        return true;
    }

    return false;
}

/**
 * Deterministic fallback HEX generator when a color-related product has no valid HEX code.
 */
function colorSyncDeriveHexFromName(string $name): string {
    $low = strtolower(trim($name));
    $known = [
        'white' => '#FFFFFF', 'black' => '#1B1B1B', 'red' => '#DC143C', 'crimson' => '#DC143C',
        'blue' => '#1D4ED8', 'navy' => '#000080', 'sky' => '#87CEEB', 'cyan' => '#00BCD4',
        'teal' => '#008080', 'turquoise' => '#40E0D0', 'green' => '#228B22', 'emerald' => '#50C878',
        'olive' => '#808000', 'mint' => '#98FF98', 'yellow' => '#FACC15', 'gold' => '#D4AF37',
        'ochre' => '#CC7722', 'amber' => '#FFBF00', 'orange' => '#FF7F00', 'coral' => '#FF7F50',
        'purple' => '#800080', 'violet' => '#8F00FF', 'magenta' => '#FF00FF', 'lavender' => '#C8A2C8',
        'pink' => '#F472B6', 'rose' => '#E11D48', 'brown' => '#7C4A27', 'umber' => '#635147',
        'sienna' => '#A0522D', 'tan' => '#D2B48C', 'beige' => '#F5F5DC', 'gray' => '#808080',
        'grey' => '#808080', 'silver' => '#C0C0C0', 'charcoal' => '#36454F', 'maroon' => '#800000',
        'burgundy' => '#800020', 'indigo' => '#4B0082', 'cobalt' => '#0047AB', 'ultramarine' => '#3F00FF',
    ];
    foreach ($known as $kw => $hx) {
        if (strpos($low, $kw) !== false) {
            return $hx;
        }
    }
    // Deterministic vivid HEX from name hash
    $hash = md5($low ?: 'pigment');
    return '#' . strtoupper(substr($hash, 0, 6));
}

/**
 * Derive Color Library category, classification, color_family, and variation from HEX and name.
 */
function colorSyncDeriveColorMetadata(string $hex, string $name = '', string $requestedClassification = '', string $requestedCategory = ''): array {
    $normHex = colorLibraryNormalizeHex($hex);
    if ($normHex === '') {
        $normHex = colorSyncDeriveHexFromName($name);
    }

    $r = hexdec(substr($normHex, 1, 2)) / 255.0;
    $g = hexdec(substr($normHex, 3, 2)) / 255.0;
    $b = hexdec(substr($normHex, 5, 2)) / 255.0;

    $max = max($r, $g, $b);
    $min = min($r, $g, $b);
    $delta = $max - $min;
    $l = ($max + $min) / 2.0;
    $s = ($delta == 0.0) ? 0.0 : ($delta / (1.0 - abs(2.0 * $l - 1.0)));

    $h = 0.0;
    if ($delta > 0.0) {
        if ($max === $r) {
            $h = 60.0 * fmod((($g - $b) / $delta), 6.0);
        } elseif ($max === $g) {
            $h = 60.0 * ((($b - $r) / $delta) + 2.0);
        } else {
            $h = 60.0 * ((($r - $g) / $delta) + 4.0);
        }
        if ($h < 0.0) $h += 360.0;
    }

    // Derive base category from HSL
    $derivedCategory = 'Specialty Colors';
    if ($s < 0.12) {
        if ($l >= 0.88) $derivedCategory = 'White';
        elseif ($l <= 0.16) $derivedCategory = 'Black';
        else $derivedCategory = 'Gray';
    } else {
        if ($h < 15 || $h >= 340) $derivedCategory = 'Red';
        elseif ($h < 42) $derivedCategory = ($l < 0.42 && $s < 0.65) ? 'Brown' : 'Orange';
        elseif ($h < 70) $derivedCategory = 'Yellow';
        elseif ($h < 165) $derivedCategory = 'Green';
        elseif ($h < 255) $derivedCategory = 'Blue';
        elseif ($h < 310) $derivedCategory = 'Purple';
        else $derivedCategory = 'Red';
    }

    // Derive variation from lightness
    $variation = 'Base';
    if ($l >= 0.78 && $derivedCategory !== 'White') {
        $variation = 'Tint';
    } elseif ($l <= 0.25 && $derivedCategory !== 'Black') {
        $variation = 'Shade';
    } elseif ($s > 0.12 && $s < 0.42) {
        $variation = 'Tone';
    }

    // Derive classification
    $allowedClassifications = colorLibraryAllowedClassifications();
    $classification = in_array($requestedClassification, $allowedClassifications, true)
        ? $requestedClassification
        : 'Custom Colors';

    $allowedCategories = colorLibraryAllowedCategories();
    $category = in_array($requestedCategory, $allowedCategories, true)
        ? $requestedCategory
        : $derivedCategory;

    return [
        'hex' => $normHex,
        'category' => $category,
        'classification' => $classification,
        'colorFamily' => $category,
        'variation' => $variation,
    ];
}

/**
 * Generate next unique sequential Product ID (PRD-XXX).
 */
function colorSyncNextProductId(mysqli $conn): string {
    $maxNum = 0;
    $res = $conn->query("SELECT id, product_id FROM products FOR UPDATE");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            foreach ([$row['id'] ?? '', $row['product_id'] ?? ''] as $val) {
                if (preg_match('/^PRD-(\d+)$/i', (string)$val, $m)) {
                    $n = (int)$m[1];
                    if ($n > $maxNum) $maxNum = $n;
                }
            }
        }
    }
    return sprintf('PRD-%03d', $maxNum + 1);
}

/**
 * Generate next unique sequential Size ID (SZ-XXX).
 */
function colorSyncNextSizeId(mysqli $conn): string {
    $maxNum = 0;
    $res = $conn->query("SELECT size_id FROM product_sizes FOR UPDATE");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            if (preg_match('/^SZ-(\d+)$/i', (string)($row['size_id'] ?? ''), $m)) {
                $n = (int)$m[1];
                if ($n > $maxNum) $maxNum = $n;
            }
        }
    }
    return sprintf('SZ-%03d', $maxNum + 1);
}

/**
 * Generate next unique sequential Inventory ID (INV-XXX).
 */
function colorSyncNextInventoryId(mysqli $conn): string {
    $maxNum = 0;
    $res = $conn->query("SELECT inventory_id FROM inventory FOR UPDATE");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            if (preg_match('/^INV-(\d+)$/i', (string)($row['inventory_id'] ?? ''), $m)) {
                $n = (int)$m[1];
                if ($n > $maxNum) $maxNum = $n;
            }
        }
    }
    return sprintf('INV-%03d', $maxNum + 1);
}

/**
 * Upsert mapping row in color_inventory_sync_map and link color_library.linked_product_id.
 */
function colorSyncUpsertMapping(mysqli $conn, string $colorId, string $productId, string $origin, string $actorName): void {
    // Check if color already has a primary linked_product_id
    $clChk = $conn->prepare("SELECT linked_product_id FROM color_library WHERE id = ? LIMIT 1");
    $existingLinkedPid = null;
    if ($clChk) {
        $clChk->bind_param('s', $colorId);
        $clChk->execute();
        $r = $clChk->get_result()->fetch_assoc();
        $existingLinkedPid = $r['linked_product_id'] ?? null;
        $clChk->close();
    }

    $isPrimary = ($existingLinkedPid === null || $existingLinkedPid === '' || $existingLinkedPid === $productId) ? 1 : 0;

    // Clear any previous mapping for this product_id if it changed color
    $delOld = $conn->prepare("DELETE FROM color_inventory_sync_map WHERE product_id = ? AND color_id != ?");
    if ($delOld) {
        $delOld->bind_param('ss', $productId, $colorId);
        $delOld->execute();
        $delOld->close();
    }

    $mapStmt = $conn->prepare("INSERT INTO color_inventory_sync_map (color_id, product_id, sync_origin, is_primary, created_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            sync_origin = VALUES(sync_origin),
            is_primary = VALUES(is_primary),
            updated_at = CURRENT_TIMESTAMP");
    if (!$mapStmt) {
        throw new Exception('Failed to prepare color_inventory_sync_map upsert: ' . $conn->error);
    }
    $mapStmt->bind_param('sssis', $colorId, $productId, $origin, $isPrimary, $actorName);
    if (!$mapStmt->execute()) {
        $err = $mapStmt->error;
        $mapStmt->close();
        throw new Exception('Failed to save color-inventory mapping: ' . $err);
    }
    $mapStmt->close();

    // Update color_library.linked_product_id if not yet set (or if clearing old link on another color)
    if ($isPrimary === 1) {
        $clrOther = $conn->prepare("UPDATE color_library SET linked_product_id = NULL WHERE linked_product_id = ? AND id != ?");
        if ($clrOther) {
            $clrOther->bind_param('ss', $productId, $colorId);
            $clrOther->execute();
            $clrOther->close();
        }
        $setLink = $conn->prepare("UPDATE color_library SET linked_product_id = ? WHERE id = ?");
        if ($setLink) {
            $setLink->bind_param('ss', $productId, $colorId);
            if (!$setLink->execute()) {
                $err = $setLink->error;
                $setLink->close();
                throw new Exception('Failed to link product ID on color_library: ' . $err);
            }
            $setLink->close();
        }
    }
}

/**
 * DIRECTION 1: Inventory -> Color Library
 *
 * Called inside an active transaction when Admin creates or updates an inventory product.
 * Only color-related pigment/colorant products trigger auto-creation/sync.
 *
 * Returns:
 *   [
 *     'synced' => bool,
 *     'action' => 'skipped' | 'created_color' | 'linked_existing_color' | 'updated_color',
 *     'colorId' => ?string,
 *     'colorName' => ?string,
 *     'colorHex' => ?string,
 *     'colorClassification' => ?string,
 *     'isColorPigment' => bool,
 *   ]
 */
function colorSyncFromInventoryProduct(mysqli $conn, array $product, ?array $existingProduct, array $actor, array $options = []): array {
    if (colorSyncIsActive()) {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'loop_guard'];
    }
    if (($actor['role'] ?? '') !== 'admin') {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'admin_only'];
    }

    $isColorProd = colorSyncIsColorProduct($product);
    if (!$isColorProd) {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'not_color_pigment', 'isColorPigment' => false];
    }

    return colorSyncWithGuard('inventory', function () use ($conn, $product, $existingProduct, $actor, $options) {
        $productId = (string)($product['id'] ?? $product['productId'] ?? $product['product_id'] ?? '');
        if ($productId === '') {
            throw new Exception('Cannot synchronize color: missing product ID.');
        }

        $actorName = (string)($actor['name'] ?? 'Admin');
        $rawColorName = trim((string)($product['color'] ?? ''));
        $rawProdName = trim((string)($product['name'] ?? ($product['productName'] ?? '')));
        $colorName = ($rawColorName !== '' && $rawColorName !== '-') ? $rawColorName : $rawProdName;
        if ($colorName === '') {
            throw new Exception('Color name is required for pigment/colorant inventory products.');
        }

        $rawHex = trim((string)($product['colorHex'] ?? ($product['color_hex'] ?? '')));
        $requestedCls = trim((string)($product['colorClassification'] ?? ($product['color_classification'] ?? '')));
        $meta = colorSyncDeriveColorMetadata($rawHex, $colorName, $requestedCls);
        $colorHex = $meta['hex'];
        $category = $meta['category'];
        $classification = $meta['classification'];
        $colorFamily = $meta['colorFamily'];
        $variation = $meta['variation'];

        $providedColorId = trim((string)($product['colorId'] ?? ($product['color_id'] ?? '')));
        $existingColorId = $existingProduct ? trim((string)($existingProduct['color_id'] ?? '')) : '';

        // Simulate failure hook for rollback verification tests
        if (!empty($options['simulateFailure'])) {
            throw new Exception('Simulated synchronization failure (Inventory -> Color Library).');
        }

        // Case A: Editing an already-linked custom color pigment product
        if ($existingProduct !== null && $existingColorId !== '' && ($providedColorId === '' || $providedColorId === $existingColorId)) {
            $clStmt = $conn->prepare("SELECT * FROM color_library WHERE id = ? LIMIT 1");
            $clRow = null;
            if ($clStmt) {
                $clStmt->bind_param('s', $existingColorId);
                $clStmt->execute();
                $clRow = $clStmt->get_result()->fetch_assoc();
                $clStmt->close();
            }

            if ($clRow && (int)$clRow['is_custom'] === 1) {
                $nameChanged = strcasecmp((string)$clRow['name'], $colorName) !== 0;
                $hexChanged = strcasecmp((string)$clRow['hex'], $colorHex) !== 0;
                $clsChanged = ($requestedCls !== '' && $clRow['classification'] !== $classification);

                if ($nameChanged || $hexChanged || $clsChanged) {
                    // Prevent duplicate name or HEX collision with another Color Library entry
                    $dupStmt = $conn->prepare("SELECT id, name, hex FROM color_library WHERE (LOWER(name) = LOWER(?) OR UPPER(hex) = UPPER(?)) AND id != ? LIMIT 1");
                    if ($dupStmt) {
                        $dupStmt->bind_param('sss', $colorName, $colorHex, $existingColorId);
                        $dupStmt->execute();
                        $dupRow = $dupStmt->get_result()->fetch_assoc();
                        $dupStmt->close();
                        if ($dupRow) {
                            if (strcasecmp($dupRow['name'], $colorName) === 0) {
                                throw new Exception("Duplicate color name: '{$dupRow['name']}' already exists in the Color Library.");
                            }
                            throw new Exception("Duplicate HEX code: {$dupRow['hex']} is already assigned to '{$dupRow['name']}' in the Color Library.");
                        }
                    }

                    $newCls = $clsChanged ? $classification : (string)$clRow['classification'];
                    $updCl = $conn->prepare("UPDATE color_library SET name = ?, hex = ?, classification = ?, updated_by = ? WHERE id = ? AND is_custom = 1");
                    if (!$updCl) {
                        throw new Exception('Failed to prepare color_library update: ' . $conn->error);
                    }
                    $updCl->bind_param('sssss', $colorName, $colorHex, $newCls, $actorName, $existingColorId);
                    if (!$updCl->execute()) {
                        $err = $updCl->error;
                        $updCl->close();
                        throw new Exception('Failed to synchronize updated color to Color Library: ' . $err);
                    }
                    $updCl->close();

                    // Propagate to all products referencing this color_id (never touching stock!)
                    $propP = $conn->prepare("UPDATE products SET color = ?, color_hex = ?, color_classification = ? WHERE color_id = ?");
                    if ($propP) {
                        $propP->bind_param('ssss', $colorName, $colorHex, $newCls, $existingColorId);
                        $propP->execute();
                        $propP->close();
                    }
                    // Propagate HEX to linked formulas
                    $propF = $conn->prepare("UPDATE color_formulas SET hex_reference = ? WHERE color_id = ?");
                    if ($propF) {
                        $propF->bind_param('ss', $colorHex, $existingColorId);
                        $propF->execute();
                        $propF->close();
                    }

                    colorSyncUpsertMapping($conn, $existingColorId, $productId, 'inventory', $actorName);

                    colorLibraryAuditLog(
                        $conn,
                        $actor,
                        'Sync Color From Inventory',
                        $colorName,
                        'color_library',
                        "{$clRow['name']} ({$clRow['hex']})",
                        "{$colorName} ({$colorHex})",
                        "Synchronized color update from Inventory product {$productId} to Color Library '{$colorName}' ({$colorHex})."
                    );

                    return [
                        'synced' => true,
                        'action' => 'updated_color',
                        'colorId' => $existingColorId,
                        'colorName' => $colorName,
                        'colorHex' => $colorHex,
                        'colorClassification' => $newCls,
                        'isColorPigment' => true,
                    ];
                }

                // Ensure mapping and product fields are up-to-date
                $updP = $conn->prepare("UPDATE products SET color_id = ?, color_classification = ?, is_color_pigment = 1 WHERE id = ?");
                if ($updP) {
                    $curCls = (string)$clRow['classification'];
                    $updP->bind_param('sss', $existingColorId, $curCls, $productId);
                    $updP->execute();
                    $updP->close();
                }
                colorSyncUpsertMapping($conn, $existingColorId, $productId, 'inventory', $actorName);
                return [
                    'synced' => true,
                    'action' => 'linked_existing_color',
                    'colorId' => $existingColorId,
                    'colorName' => (string)$clRow['name'],
                    'colorHex' => strtoupper((string)$clRow['hex']),
                    'colorClassification' => (string)$clRow['classification'],
                    'isColorPigment' => true,
                ];
            }
        }

        // Case B: Check if matching color already exists in Color Library (by ID, name, or HEX)
        $matchedColor = null;
        if ($providedColorId !== '') {
            $s1 = $conn->prepare("SELECT * FROM color_library WHERE id = ? LIMIT 1");
            if ($s1) {
                $s1->bind_param('s', $providedColorId);
                $s1->execute();
                $matchedColor = $s1->get_result()->fetch_assoc();
                $s1->close();
            }
        }
        if (!$matchedColor) {
            $s2 = $conn->prepare("SELECT * FROM color_library WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR UPPER(TRIM(hex)) = UPPER(TRIM(?)) LIMIT 1");
            if ($s2) {
                $s2->bind_param('ss', $colorName, $colorHex);
                $s2->execute();
                $matchedColor = $s2->get_result()->fetch_assoc();
                $s2->close();
            }
        }

        if ($matchedColor) {
            // Link to existing Color Library entry instead of creating a duplicate
            $cid = (string)$matchedColor['id'];
            $cName = (string)$matchedColor['name'];
            $cHex = strtoupper((string)$matchedColor['hex']);
            $cCls = (string)($matchedColor['classification'] ?: 'Custom Colors');

            // If archived, restore it cleanly since an active pigment product now links to it
            if ((int)($matchedColor['is_archived'] ?? 0) === 1) {
                $unarch = $conn->prepare("UPDATE color_library SET is_archived = 0, archived_at = NULL, archived_by = NULL, updated_by = ? WHERE id = ?");
                if ($unarch) {
                    $unarch->bind_param('ss', $actorName, $cid);
                    $unarch->execute();
                    $unarch->close();
                }
            }

            $updP = $conn->prepare("UPDATE products SET color_id = ?, color = ?, color_hex = ?, color_classification = ?, is_color_pigment = 1 WHERE id = ?");
            if (!$updP) {
                throw new Exception('Failed to update product color link: ' . $conn->error);
            }
            $updP->bind_param('sssss', $cid, $cName, $cHex, $cCls, $productId);
            if (!$updP->execute()) {
                $err = $updP->error;
                $updP->close();
                throw new Exception('Failed to link product to existing Color Library entry: ' . $err);
            }
            $updP->close();

            colorSyncUpsertMapping($conn, $cid, $productId, 'inventory', $actorName);

            return [
                'synced' => true,
                'action' => 'linked_existing_color',
                'colorId' => $cid,
                'colorName' => $cName,
                'colorHex' => $cHex,
                'colorClassification' => $cCls,
                'isColorPigment' => true,
            ];
        }

        // Case C: Create new Color Library entry automatically
        $newColorId = 'clr_cust_' . bin2hex(random_bytes(5));
        $notes = "Auto-registered from Inventory pigment product ({$productId})";
        $insCl = $conn->prepare("INSERT INTO color_library (id, name, hex, category, classification, color_family, variation, parent_color_id, linked_product_id, is_custom, is_archived, notes, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 0, ?, ?, ?)");
        if (!$insCl) {
            throw new Exception('Failed to prepare Color Library insert: ' . $conn->error);
        }
        $insCl->bind_param('sssssssssss', $newColorId, $colorName, $colorHex, $category, $classification, $colorFamily, $variation, $productId, $notes, $actorName, $actorName);
        if (!$insCl->execute()) {
            $err = $insCl->error;
            $insCl->close();
            throw new Exception('Failed to create Color Library entry from Inventory product: ' . $err);
        }
        $insCl->close();

        // Update product with generated color_id, normalized HEX, classification, and pigment flag
        $updP = $conn->prepare("UPDATE products SET color_id = ?, color = ?, color_hex = ?, color_classification = ?, is_color_pigment = 1 WHERE id = ?");
        if (!$updP) {
            throw new Exception('Failed to update product with new color_id: ' . $conn->error);
        }
        $updP->bind_param('sssss', $newColorId, $colorName, $colorHex, $classification, $productId);
        if (!$updP->execute()) {
            $err = $updP->error;
            $updP->close();
            throw new Exception('Failed to bind new Color Library ID to product: ' . $err);
        }
        $updP->close();

        colorSyncUpsertMapping($conn, $newColorId, $productId, 'inventory', $actorName);

        colorLibraryAuditLog(
            $conn,
            $actor,
            'Auto-Register Color from Inventory',
            $colorName,
            'color_library',
            '',
            "{$colorName} ({$colorHex}, {$classification}) <- {$productId}",
            "Automatically created Color Library entry '{$colorName}' ({$colorHex}) linked to Inventory pigment product {$productId}."
        );

        return [
            'synced' => true,
            'action' => 'created_color',
            'colorId' => $newColorId,
            'colorName' => $colorName,
            'colorHex' => $colorHex,
            'colorClassification' => $classification,
            'isColorPigment' => true,
        ];
    });
}

/**
 * DIRECTION 2: Color Library -> Inventory
 *
 * Called inside an active transaction when Admin creates or updates a Custom Color
 * in the Base Color Library / Custom Colors section.
 *
 * - On Create: finds existing matching pigment product or creates a new Inventory product
 *   with category 'Pigment / Colorant' (or specified pigment category), 0 stock, 1L size variant,
 *   and zero artificial stock/purchase records.
 * - On Edit: synchronizes Color Name, HEX Code, Color Classification, and Product Category
 *   to linked products without touching stock quantities.
 */
function colorSyncToInventoryProduct(mysqli $conn, array $colorRow, ?array $existingColorRow, array $actor, array $options = []): array {
    if (colorSyncIsActive()) {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'loop_guard'];
    }
    if (($actor['role'] ?? '') !== 'admin') {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'admin_only'];
    }
    if (empty($colorRow['is_custom']) && empty($options['allowBuiltin'])) {
        return ['synced' => false, 'action' => 'skipped', 'reason' => 'builtin_color'];
    }

    return colorSyncWithGuard('color_library', function () use ($conn, $colorRow, $existingColorRow, $actor, $options) {
        $colorId = (string)$colorRow['id'];
        $colorName = trim((string)$colorRow['name']);
        $pigmentProdName = colorSyncFormatPigmentProductName($colorName);
        $colorHex = strtoupper(trim((string)$colorRow['hex']));
        $classification = trim((string)($colorRow['classification'] ?? 'Custom Colors')) ?: 'Custom Colors';
        $actorName = (string)($actor['name'] ?? 'Admin');

        $productCategory = trim((string)($options['productCategory'] ?? colorSyncDefaultProductCategory()));
        if ($productCategory === '' || colorSyncIsNonColorCategory($productCategory)) {
            $productCategory = colorSyncDefaultProductCategory();
        }
        $defaultBrand = !empty($colorRow['is_custom']) ? 'Custom Pigment' : 'Base Pigment';
        $brand = trim((string)($options['brand'] ?? $defaultBrand)) ?: $defaultBrand;

        // Simulate failure hook for rollback verification tests
        if (!empty($options['simulateFailure'])) {
            throw new Exception('Simulated synchronization failure (Color Library -> Inventory).');
        }

        // Case 1: Editing an existing Base/Custom Color
        if ($existingColorRow !== null) {
            $oldName = trim((string)($existingColorRow['name'] ?? ''));
            $oldPigmentName = colorSyncFormatPigmentProductName($oldName);
            $linkedProductId = trim((string)($existingColorRow['linked_product_id'] ?? ''));

            // Propagate color name, HEX, and classification to ALL products referencing this color_id (never touch stock!)
            $pStmt = $conn->prepare("UPDATE products SET color = ?, color_hex = ?, color_classification = ?, updated_by = ? WHERE color_id = ?");
            if (!$pStmt) {
                throw new Exception('Failed to prepare product color sync update: ' . $conn->error);
            }
            $pStmt->bind_param('sssss', $colorName, $colorHex, $classification, $actorName, $colorId);
            if (!$pStmt->execute()) {
                $err = $pStmt->error;
                $pStmt->close();
                throw new Exception('Failed to update linked inventory products: ' . $err);
            }
            $pStmt->close();

            // For the primary linked pigment product, also sync display name ("<Color Name> Pigment") and category if provided
            if ($linkedProductId !== '') {
                $lpStmt = $conn->prepare("SELECT id, name, product_name, type, category FROM products WHERE id = ? LIMIT 1");
                $lpRow = null;
                if ($lpStmt) {
                    $lpStmt->bind_param('s', $linkedProductId);
                    $lpStmt->execute();
                    $lpRow = $lpStmt->get_result()->fetch_assoc();
                    $lpStmt->close();
                }
                if ($lpRow) {
                    $curLpName = trim((string)$lpRow['name']);
                    $matchesOldName = (strcasecmp($curLpName, $oldName) === 0 || strcasecmp($curLpName, $oldPigmentName) === 0);
                    $newProdName = $matchesOldName ? $pigmentProdName : (string)$lpRow['name'];
                    $newCat = !empty($options['productCategory']) ? $productCategory : (string)($lpRow['category'] ?: $lpRow['type']);
                    $updLp = $conn->prepare("UPDATE products SET name = ?, product_name = ?, type = ?, category = ?, color = ?, color_hex = ?, color_classification = ?, updated_by = ? WHERE id = ?");
                    if ($updLp) {
                        $updLp->bind_param('sssssssss', $newProdName, $newProdName, $newCat, $newCat, $colorName, $colorHex, $classification, $actorName, $linkedProductId);
                        $updLp->execute();
                        $updLp->close();
                    }
                    if ($newProdName !== (string)$lpRow['name']) {
                        $updBatch = $conn->prepare("UPDATE inventory_batches SET product_name = ? WHERE product_id = ?");
                        if ($updBatch) {
                            $updBatch->bind_param('ss', $newProdName, $linkedProductId);
                            $updBatch->execute();
                            $updBatch->close();
                        }
                    }
                }
            }

            // Propagate HEX to linked formulas
            $fStmt = $conn->prepare("UPDATE color_formulas SET hex_reference = ? WHERE color_id = ?");
            if ($fStmt) {
                $fStmt->bind_param('ss', $colorHex, $colorId);
                $fStmt->execute();
                $fStmt->close();
            }

            return [
                'synced' => true,
                'action' => 'updated_product',
                'productId' => $linkedProductId ?: null,
                'product' => $linkedProductId ? colorSyncFetchProductPayload($conn, $linkedProductId) : null,
            ];
        }

        // Case 2: Creating or reconciling a Base/Custom Color -> Check if a corresponding pigment inventory product already exists
        $existingProd = null;

        // 2a. Already linked on color_library.linked_product_id or explicit linkedProductId
        $reqLinkedPid = trim((string)($options['linkedProductId'] ?? ($colorRow['linked_product_id'] ?? '')));
        if ($reqLinkedPid !== '') {
            $s0 = $conn->prepare("SELECT * FROM products WHERE id = ? LIMIT 1");
            if ($s0) {
                $s0->bind_param('s', $reqLinkedPid);
                $s0->execute();
                $existingProd = $s0->get_result()->fetch_assoc();
                $s0->close();
            }
        }

        // 2b. Existing pigment/colorant product matching this color_id, pigment name, color name, or HEX
        //     (Never hijacks regular House Paint / Automotive Paint / Specialty Paint products!)
        if (!$existingProd) {
            $s1 = $conn->prepare("SELECT * FROM products
                WHERE (is_color_pigment = 1 OR LOWER(COALESCE(category, type)) LIKE '%pigment%' OR LOWER(COALESCE(category, type)) LIKE '%colorant%')
                  AND (
                      color_id = ?
                      OR LOWER(TRIM(name)) = LOWER(TRIM(?))
                      OR LOWER(TRIM(color)) = LOWER(TRIM(?))
                      OR UPPER(TRIM(color_hex)) = UPPER(TRIM(?))
                  )
                ORDER BY (color_id = ?) DESC, is_color_pigment DESC, id ASC
                LIMIT 1");
            if ($s1) {
                $s1->bind_param('sssss', $colorId, $pigmentProdName, $colorName, $colorHex, $colorId);
                $s1->execute();
                $existingProd = $s1->get_result()->fetch_assoc();
                $s1->close();
            }
        }

        if ($existingProd) {
            $pid = (string)$existingProd['id'];
            $updP = $conn->prepare("UPDATE products SET color_id = ?, color = ?, color_hex = ?, color_classification = ?, is_color_pigment = 1, updated_by = ? WHERE id = ?");
            if (!$updP) {
                throw new Exception('Failed to link existing inventory product: ' . $conn->error);
            }
            $updP->bind_param('ssssss', $colorId, $colorName, $colorHex, $classification, $actorName, $pid);
            if (!$updP->execute()) {
                $err = $updP->error;
                $updP->close();
                throw new Exception('Failed to update existing inventory product link: ' . $err);
            }
            $updP->close();

            colorSyncUpsertMapping($conn, $colorId, $pid, 'color_library', $actorName);

            return [
                'synced' => true,
                'action' => 'linked_product',
                'productId' => $pid,
                'product' => !empty($options['skipPayload']) ? null : colorSyncFetchProductPayload($conn, $pid),
            ];
        }

        // Case 3: Create new Inventory Product ("<Color Name> Pigment") initialized to 0 stock (no fabricated stock, batches, or POs)
        $newPid = colorSyncNextProductId($conn);
        $defaultSize = 1.00;
        $defaultMinStock = 5;
        $price = isset($options['price']) && is_numeric($options['price']) && (float)$options['price'] >= 0 ? round((float)$options['price'], 2) : 0.00;
        $canStockJson = json_encode(['1' => 0]);
        $openedBySizeJson = '{}';
        $sizesJson = json_encode([1]);
        $pendingSizesJson = '[]';
        $priceHistoryJson = '[]';
        $thresholdBySizeJson = json_encode(['1' => $defaultMinStock]);
        $status = 'active';
        $taxClass = 'vatable';
        $zero = 0.00;
        $zeroInt = 0;
        $threshold = (float)$defaultMinStock;

        $insProd = $conn->prepare("INSERT INTO products (
                id, product_id, product_name, name, brand, type, category, tax_classification,
                color, color_id, color_classification, color_hex, is_color_pigment, supplier_id,
                price, recent_price, pending_price, price_history,
                stock, can_stock, opened_stock, opened_can_size, opened_by_size,
                sizes, pending_sizes, pending_edit, threshold, threshold_by_size,
                status, updated_by
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, 1, NULL,
                ?, NULL, NULL, ?,
                ?, ?, ?, ?, ?,
                ?, ?, NULL, ?, ?,
                ?, ?
            )");
        if (!$insProd) {
            throw new Exception('Failed to prepare auto-created inventory product insert: ' . $conn->error);
        }
        $insProd->bind_param(
            'ssssssssssssdsdsdisssdsss',
            $newPid, $newPid, $pigmentProdName, $pigmentProdName, $brand, $productCategory, $productCategory, $taxClass,
            $colorName, $colorId, $classification, $colorHex,
            $price, $priceHistoryJson,
            $zero, $canStockJson, $zero, $zeroInt, $openedBySizeJson,
            $sizesJson, $pendingSizesJson, $threshold, $thresholdBySizeJson,
            $status, $actorName
        );
        if (!$insProd->execute()) {
            $err = $insProd->error;
            $insProd->close();
            throw new Exception('Failed to create linked inventory product: ' . $err);
        }
        $insProd->close();

        // Create default 1L container size variant in product_sizes
        $newSizeId = colorSyncNextSizeId($conn);
        $isActive = 1;
        $insSize = $conn->prepare("INSERT INTO product_sizes (size_id, product_id, container_size, price_per_liter, price_per_can, minimum_stock, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)");
        if (!$insSize) {
            throw new Exception('Failed to prepare product_sizes insert: ' . $conn->error);
        }
        $insSize->bind_param('ssdddii', $newSizeId, $newPid, $defaultSize, $price, $price, $defaultMinStock, $isActive);
        if (!$insSize->execute()) {
            $err = $insSize->error;
            $insSize->close();
            throw new Exception('Failed to create product_sizes entry for synced color: ' . $err);
        }
        $insSize->close();

        // Create inventory row initialized strictly to 0 sealed, 0 opened, 0.00 remaining
        $newInvId = colorSyncNextInventoryId($conn);
        $insInv = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume) VALUES (?, ?, 0, 0, 0.00)");
        if (!$insInv) {
            throw new Exception('Failed to prepare inventory insert: ' . $conn->error);
        }
        $insInv->bind_param('ss', $newInvId, $newSizeId);
        if (!$insInv->execute()) {
            $err = $insInv->error;
            $insInv->close();
            throw new Exception('Failed to initialize zero-stock inventory row: ' . $err);
        }
        $insInv->close();

        // Establish two-way link on color_library and color_inventory_sync_map
        colorSyncUpsertMapping($conn, $colorId, $newPid, 'color_library', $actorName);

        if (empty($options['skipAuditPerRow'])) {
            colorLibraryAuditLog(
                $conn,
                $actor,
                'Auto-Create Product from Color Library',
                $pigmentProdName,
                'products',
                '',
                "{$newPid} ({$pigmentProdName}, {$productCategory}, Stock: 0.00 L)",
                "Automatically created Inventory product {$newPid} ('{$pigmentProdName}', {$productCategory}) with 0.00 L stock linked to Color Library '{$colorId}'."
            );
        }

        return [
            'synced' => true,
            'action' => 'created_product',
            'productId' => $newPid,
            'product' => !empty($options['skipPayload']) ? null : colorSyncFetchProductPayload($conn, $newPid),
        ];
    });
}

/**
 * Reconcile all active Base Color Library entries so every Base Color has exactly one
 * corresponding Pigment / Colorant inventory product (initialized to 0 stock, no fabricated batches/POs).
 * Idempotent: safe to run multiple times without creating duplicates.
 */
function colorSyncEnsureAllBaseColorsHaveProducts(mysqli $conn, ?array $actor = null): array {
    $sysActor = $actor ?: ['id' => 'system', 'name' => 'System', 'role' => 'admin'];
    $summary = [
        'totalBaseColors' => 0,
        'alreadyLinked' => 0,
        'linkedExisting' => 0,
        'created' => 0,
        'errors' => [],
    ];

    $res = $conn->query("SELECT * FROM color_library WHERE COALESCE(is_archived, 0) = 0 ORDER BY is_custom ASC, id ASC");
    if (!$res) {
        $summary['errors'][] = 'Failed to query color_library: ' . $conn->error;
        return $summary;
    }

    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = $r;
    }
    $summary['totalBaseColors'] = count($rows);

    $conn->begin_transaction();
    try {
        foreach ($rows as $row) {
            $cid = (string)$row['id'];
            $existingLinked = trim((string)($row['linked_product_id'] ?? ''));

            // Fast path: already linked to a valid product in products table
            if ($existingLinked !== '') {
                $chk = $conn->prepare("SELECT id FROM products WHERE id = ? LIMIT 1");
                $valid = false;
                if ($chk) {
                    $chk->bind_param('s', $existingLinked);
                    $chk->execute();
                    $valid = (bool)$chk->get_result()->fetch_assoc();
                    $chk->close();
                }
                if ($valid) {
                    colorSyncUpsertMapping($conn, $cid, $existingLinked, 'auto_link', (string)($sysActor['name'] ?? 'System'));
                    $summary['alreadyLinked']++;
                    continue;
                }
            }

            $syncRes = colorSyncToInventoryProduct($conn, $row, null, $sysActor, [
                'allowBuiltin' => true,
                'skipAuditPerRow' => true,
                'skipPayload' => true,
                'productCategory' => colorSyncDefaultProductCategory(),
            ]);

            if (($syncRes['action'] ?? '') === 'created_product') {
                $summary['created']++;
            } elseif (($syncRes['action'] ?? '') === 'linked_product') {
                $summary['linkedExisting']++;
            }
        }

        if ($summary['created'] > 0 || $summary['linkedExisting'] > 0) {
            colorLibraryAuditLog(
                $conn,
                $sysActor,
                'Sync Base Color Library to Inventory',
                'Base Color Library',
                'products',
                '',
                "Created: {$summary['created']}, Linked: {$summary['linkedExisting']}, Already Linked: {$summary['alreadyLinked']}",
                "Synchronized all {$summary['totalBaseColors']} Base Color Library entries with Inventory Pigment / Colorant products (0.00 L initial stock)."
            );
        }

        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        $summary['errors'][] = $e->getMessage();
    }

    return $summary;
}

/**
 * Fetch a single product in the exact JSON payload format used by api/db.php GET.
 */
function colorSyncFetchProductPayload(mysqli $conn, string $productId): ?array {
    $stmt = $conn->prepare("SELECT * FROM products WHERE id = ? LIMIT 1");
    if (!$stmt) return null;
    $stmt->bind_param('s', $productId);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$r) return null;

    $variants = [];
    $psStmt = $conn->prepare("SELECT ps.*, inv.inventory_id, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume
        FROM product_sizes ps
        LEFT JOIN inventory inv ON inv.size_id = ps.size_id
        WHERE ps.product_id = ?
        ORDER BY ps.container_size ASC");
    if ($psStmt) {
        $psStmt->bind_param('s', $productId);
        $psStmt->execute();
        $psRes = $psStmt->get_result();
        while ($sRow = $psRes->fetch_assoc()) {
            $variants[] = [
                'sizeId' => $sRow['size_id'],
                'productId' => $sRow['product_id'],
                'containerSize' => (float)$sRow['container_size'],
                'pricePerLiter' => (float)$sRow['price_per_liter'],
                'pricePerCan' => (float)$sRow['price_per_can'],
                'minimumStock' => (int)$sRow['minimum_stock'],
                'isActive' => (bool)$sRow['is_active'],
                'inventoryId' => $sRow['inventory_id'] ?? null,
                'sealedQuantity' => (int)($sRow['sealed_quantity'] ?? 0),
                'openedQuantity' => (int)($sRow['opened_quantity'] ?? 0),
                'remainingVolume' => (float)($sRow['remaining_volume'] ?? 0),
            ];
        }
        $psStmt->close();
    }

    $sizesList = [];
    $canStockObj = [];
    $thresholdObj = [];
    $openedObj = [];
    foreach ($variants as $v) {
        $cSz = $v['containerSize'];
        $cSzStr = (string)$cSz;
        $sizesList[] = $cSz;
        $canStockObj[$cSzStr] = $v['sealedQuantity'];
        $thresholdObj[$cSzStr] = $v['minimumStock'];
        if ($v['remainingVolume'] > 0) {
            $openedObj[$cSzStr] = $v['remainingVolume'];
        }
    }
    if (empty($sizesList) && !empty($r['sizes'])) {
        $sizesList = json_decode($r['sizes'], true) ?: [];
    }

    $prodId = !empty($r['product_id']) ? $r['product_id'] : $r['id'];
    $prodName = !empty($r['product_name']) ? $r['product_name'] : $r['name'];
    $category = !empty($r['category']) ? $r['category'] : $r['type'];
    $taxClassification = !empty($r['tax_classification']) ? $r['tax_classification'] : 'vatable';

    return [
        'taxClassification' => $taxClassification,
        'tax_classification' => $taxClassification,
        'id' => $r['id'],
        'productId' => $prodId,
        'product_id' => $prodId,
        'name' => $prodName,
        'productName' => $prodName,
        'product_name' => $prodName,
        'brand' => $r['brand'],
        'type' => $r['type'],
        'category' => $category,
        'color' => $r['color'],
        'colorId' => $r['color_id'] ?? null,
        'color_id' => $r['color_id'] ?? null,
        'colorClassification' => $r['color_classification'] ?? null,
        'color_classification' => $r['color_classification'] ?? null,
        'colorHex' => $r['color_hex'] ?? null,
        'color_hex' => $r['color_hex'] ?? null,
        'isColorPigment' => !empty($r['is_color_pigment']),
        'is_color_pigment' => !empty($r['is_color_pigment']) ? 1 : 0,
        'supplierId' => $r['supplier_id'] ?? null,
        'supplier_id' => $r['supplier_id'] ?? null,
        'price' => (float)$r['price'],
        'recentPrice' => (isset($r['recent_price']) && $r['recent_price'] !== null && $r['recent_price'] !== '') ? (float)$r['recent_price'] : null,
        'pendingPrice' => (isset($r['pending_price']) && $r['pending_price'] !== null && $r['pending_price'] !== '') ? (float)$r['pending_price'] : null,
        'priceHistory' => (!empty($r['price_history']) && is_array(json_decode($r['price_history'], true))) ? json_decode($r['price_history'], true) : [],
        'stock' => (float)$r['stock'],
        'canStock' => !empty($canStockObj) ? $canStockObj : new stdClass(),
        'openedStock' => (float)($r['opened_stock'] ?? 0),
        'openedCanSize' => (int)($r['opened_can_size'] ?? 0),
        'sizes' => $sizesList,
        'sizesData' => $variants,
        'pendingSizes' => (!empty($r['pending_sizes']) && is_array(json_decode($r['pending_sizes'], true))) ? json_decode($r['pending_sizes'], true) : [],
        'pendingEdit' => (!empty($r['pending_edit']) && is_array(json_decode($r['pending_edit'], true))) ? json_decode($r['pending_edit'], true) : null,
        'openedBySize' => !empty($openedObj) ? $openedObj : new stdClass(),
        'threshold' => (float)$r['threshold'],
        'thresholdBySize' => !empty($thresholdObj) ? $thresholdObj : new stdClass(),
        'status' => $r['status'] ?: 'active',
        'deactivationReason' => $r['deactivation_reason'] ?? null,
        'deactivatedAt' => !empty($r['deactivated_at']) ? $r['deactivated_at'] : null,
        'deactivatedBy' => $r['deactivated_by'] ?? null,
        'updatedBy' => $r['updated_by'] ?? null,
        'updatedAt' => !empty($r['updated_at']) ? $r['updated_at'] : null,
        'discontinueReason' => $r['discontinue_reason'] ?? null,
    ];
}

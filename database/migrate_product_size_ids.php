<?php
/**
 * Migration Script: Product ID and Product Size ID System
 *
 * Implements:
 * 1. products table schema updates (product_id, product_name, category, supplier_id)
 * 2. product_sizes table (size_id PK, product_id FK, container_size, price_per_liter, price_per_can, minimum_stock, is_active)
 * 3. inventory table (inventory_id PK, size_id FK, sealed_quantity, opened_quantity, remaining_volume)
 * 4. movements table updates (size_id, container_size)
 * 5. Data migration:
 *    - Maps products to PRD-001, PRD-002, etc. (PRD-001 = Boysen Permacoat Latex White, PRD-002 = Boysen Permacoat Latex Blue)
 *    - Assigns unique sequential Size IDs (SZ-001, SZ-002, etc.) and Inventory IDs (INV-001, INV-002, etc.)
 *    - Migrates all foreign references across sales, purchase_orders, movements, suppliers, and adjustment_requests
 *    - Preserves all quantities, prices, thresholds, and historical transactions
 */

date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';

echo "--- Starting Product ID & Size ID Migration ---" . PHP_EOL;

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    die("Connection failed: " . $e->getMessage() . PHP_EOL);
}

// 1. Update `products` table columns
echo "1. Ensuring products table columns..." . PHP_EOL;
$cols = [
    'product_id' => "ALTER TABLE products ADD COLUMN product_id VARCHAR(50) NULL AFTER id",
    'product_name' => "ALTER TABLE products ADD COLUMN product_name VARCHAR(200) NULL AFTER name",
    'category' => "ALTER TABLE products ADD COLUMN category VARCHAR(100) NULL AFTER type",
    'supplier_id' => "ALTER TABLE products ADD COLUMN supplier_id VARCHAR(50) NULL AFTER color"
];
foreach ($cols as $col => $sql) {
    $chk = $conn->query("SHOW COLUMNS FROM products LIKE '$col'");
    if ($chk && $chk->num_rows === 0) {
        $conn->query($sql);
        echo "   - Added column '$col' to products." . PHP_EOL;
    }
}

// 2. Create `product_sizes` table
echo "2. Creating product_sizes table..." . PHP_EOL;
$conn->query("CREATE TABLE IF NOT EXISTS `product_sizes` (
    `size_id` VARCHAR(50) NOT NULL PRIMARY KEY,
    `product_id` VARCHAR(50) NOT NULL,
    `container_size` DECIMAL(10,2) NOT NULL,
    `price_per_liter` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `price_per_can` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `minimum_stock` INT NOT NULL DEFAULT 5,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_product_size` (`product_id`, `container_size`),
    KEY `idx_ps_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// 3. Create `inventory` table
echo "3. Creating inventory table..." . PHP_EOL;
$conn->query("CREATE TABLE IF NOT EXISTS `inventory` (
    `inventory_id` VARCHAR(50) NOT NULL PRIMARY KEY,
    `size_id` VARCHAR(50) NOT NULL,
    `sealed_quantity` INT NOT NULL DEFAULT 0,
    `opened_quantity` INT NOT NULL DEFAULT 0,
    `remaining_volume` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_inventory_size` (`size_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// 4. Update `movements` table columns
echo "4. Ensuring movements table columns..." . PHP_EOL;
$mvCols = [
    'size_id' => "ALTER TABLE movements ADD COLUMN size_id VARCHAR(50) NULL AFTER product_id",
    'container_size' => "ALTER TABLE movements ADD COLUMN container_size DECIMAL(10,2) NULL AFTER size_id"
];
foreach ($mvCols as $col => $sql) {
    $chk = $conn->query("SHOW COLUMNS FROM movements LIKE '$col'");
    if ($chk && $chk->num_rows === 0) {
        $conn->query($sql);
        echo "   - Added column '$col' to movements." . PHP_EOL;
    }
}

// 5. Inspect products and determine Product ID mapping
echo "5. Mapping products to clean PRD-xxx IDs..." . PHP_EOL;
$prodRes = $conn->query("SELECT * FROM products ORDER BY id ASC");
$existingProducts = [];
while ($p = $prodRes->fetch_assoc()) {
    $existingProducts[] = $p;
}

// Map definition:
// Ensure PRD-001 is Boysen Permacoat Latex (White), PRD-002 is Boysen Permacoat Latex (Blue)
$idMap = [];
$primaryProducts = [
    'p8' => 'PRD-001', // Boysen Permacoat Latex (White)
    'p9' => 'PRD-002', // Boysen Permacoat Latex (Blue)
    'p1' => 'PRD-003', // K92 Auto Refinish (Red)
    'p3' => 'PRD-004', // K92 Auto Refinish (White)
    'p4' => 'PRD-005', // Weber Top Coat (Clear)
    'p6' => 'PRD-006', // Prime Gray Primer (Gray)
    'p10' => 'PRD-007', // Epoxy Floor Paint (Gray)
    'p_mu32tg2nbh443' => 'PRD-008', // Paint (Green)
    'p_mupto0q7v9tx3' => 'PRD-009', // Latex (Black)
    'p_mvc9g44lbdtyr' => 'PRD-010', // Paint (Blue)
    'p_mvsfyxun3jjtt' => 'PRD-011', // Boysen Permacoat Latex (Yellow)
    'p_mvsfzdb571d2y' => 'PRD-012', // Boysen Permacoat Latex (Brown)
    'p_mvsfznl5x6ow5' => 'PRD-013', // Boysen Permacoat Latex (Purple)
    'p_mvsfzwt3tl4zy' => 'PRD-014', // Boysen Permacoat Latex (Orange)
];

$assignedPrdNumbers = [];
foreach ($primaryProducts as $oldId => $newId) {
    $num = (int)str_replace('PRD-', '', $newId);
    $assignedPrdNumbers[] = $num;
}
$nextPrdNum = 15;

foreach ($existingProducts as $p) {
    $oldId = $p['id'];
    if (strpos($oldId, 'PRD-') === 0) {
        $idMap[$oldId] = $oldId;
        $num = (int)str_replace('PRD-', '', $oldId);
        $assignedPrdNumbers[] = $num;
    } elseif (isset($primaryProducts[$oldId])) {
        $idMap[$oldId] = $primaryProducts[$oldId];
    } else {
        while (in_array($nextPrdNum, $assignedPrdNumbers)) {
            $nextPrdNum++;
        }
        $newId = sprintf('PRD-%03d', $nextPrdNum);
        $assignedPrdNumbers[] = $nextPrdNum;
        $idMap[$oldId] = $newId;
        $nextPrdNum++;
    }
}

// Supplier mapping lookup
$supplierProductMap = [];
$supRes = $conn->query("SELECT id, product_ids FROM suppliers");
while ($s = $supRes->fetch_assoc()) {
    $pids = json_decode($s['product_ids'] ?: '[]', true);
    if (is_array($pids)) {
        foreach ($pids as $pid) {
            $supplierProductMap[$pid] = $s['id'];
        }
    }
}

// 6. Migrate products & generate Size IDs + Inventory records
echo "6. Creating product_sizes & inventory records..." . PHP_EOL;
$sizeCounter = 1;
$invCounter = 1;
$sizeLookup = []; // [productId_containerSize] => size_id

// Clear existing product_sizes and inventory before populating to ensure clean migration
$conn->query("SET FOREIGN_KEY_CHECKS = 0");
$conn->query("TRUNCATE TABLE product_sizes");
$conn->query("TRUNCATE TABLE inventory");
$conn->query("SET FOREIGN_KEY_CHECKS = 1");

// Helper to normalize size number
function normSize($val) {
    $s = trim(strval($val));
    if (strcasecmp($s, 'Gallon') === 0 || strcasecmp($s, '4L') === 0) return 4.0;
    if (strcasecmp($s, '1L') === 0) return 1.0;
    if (strcasecmp($s, '16') === 0 || strcasecmp($s, 'Pail') === 0) return 16.0;
    $n = floatval(preg_replace('/[^0-9.]/', '', $s));
    return $n > 0 ? round($n, 2) : 1.0;
}

// Sort products by new Product ID so sizes are sequential (PRD-001 has SZ-001..SZ-006)
usort($existingProducts, function($a, $b) use ($idMap) {
    return strcmp($idMap[$a['id']], $idMap[$b['id']]);
});

$stmtSize = $conn->prepare("INSERT INTO product_sizes (size_id, product_id, container_size, price_per_liter, price_per_can, minimum_stock, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)");
$stmtInv = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume) VALUES (?, ?, ?, ?, ?)");

foreach ($existingProducts as $p) {
    $oldId = $p['id'];
    $newId = $idMap[$oldId];
    $name = $p['name'];
    $type = $p['type'];
    $price = floatval($p['price']);
    $supplierId = $supplierProductMap[$oldId] ?? ($p['supplier_id'] ?? null);

    // Update product record with new ID and aligned columns
    $updProd = $conn->prepare("UPDATE products SET id = ?, product_id = ?, product_name = ?, category = ?, supplier_id = ? WHERE id = ?");
    $updProd->bind_param("ssssss", $newId, $newId, $name, $type, $supplierId, $oldId);
    $updProd->execute();
    $updProd->close();

    // Parse sizes, can_stock, opened_by_size, threshold_by_size
    $rawSizes = json_decode($p['sizes'] ?: '[]', true);
    if (!is_array($rawSizes) || empty($rawSizes)) {
        $rawSizes = [1, 4, 16];
    }
    $canStock = json_decode($p['can_stock'] ?: '{}', true);
    if (!is_array($canStock)) $canStock = [];
    $openedBySize = json_decode($p['opened_by_size'] ?: '{}', true);
    if (!is_array($openedBySize)) $openedBySize = [];
    $thresholdBySize = json_decode($p['threshold_by_size'] ?: '{}', true);
    if (!is_array($thresholdBySize)) $thresholdBySize = [];

    // Gather all distinct sizes
    $allSizes = [];
    foreach ($rawSizes as $sz) {
        $ns = normSize($sz);
        if (!in_array($ns, $allSizes)) $allSizes[] = $ns;
    }
    foreach (array_keys($canStock) as $sz) {
        $ns = normSize($sz);
        if (!in_array($ns, $allSizes)) $allSizes[] = $ns;
    }
    foreach (array_keys($openedBySize) as $sz) {
        $ns = normSize($sz);
        if (!in_array($ns, $allSizes)) $allSizes[] = $ns;
    }
    sort($allSizes);

    foreach ($allSizes as $sz) {
        $sizeId = sprintf('SZ-%03d', $sizeCounter++);
        $invId = sprintf('INV-%03d', $invCounter++);
        $pricePerLiter = $price;
        $pricePerCan = round($pricePerLiter * $sz, 2);
        
        // Threshold
        $szStr = (string)$sz;
        $minStock = isset($thresholdBySize[$szStr]) ? intval($thresholdBySize[$szStr]) : ($sz >= 16 ? 1 : ($sz >= 4 ? 2 : 5));

        // Insert size
        $stmtSize->bind_param("ssdddi", $sizeId, $newId, $sz, $pricePerLiter, $pricePerCan, $minStock);
        $stmtSize->execute();

        // Stock quantities
        $sealedQty = isset($canStock[$szStr]) ? intval($canStock[$szStr]) : 0;
        $remVol = isset($openedBySize[$szStr]) ? floatval($openedBySize[$szStr]) : 0.0;
        $openedQty = $remVol > 0 ? 1 : 0;

        // Insert inventory
        $stmtInv->bind_param("ssiid", $invId, $sizeId, $sealedQty, $openedQty, $remVol);
        $stmtInv->execute();

        // Record lookup for old and new product IDs
        $sizeLookup[$oldId . '_' . $szStr] = $sizeId;
        $sizeLookup[$newId . '_' . $szStr] = $sizeId;
        $sizeLookup[$oldId . '_' . floatval($sz)] = $sizeId;
        $sizeLookup[$newId . '_' . floatval($sz)] = $sizeId;

        echo "   - [$newId] Size {$sz}L => $sizeId (Inv: $invId, Sealed: $sealedQty, RemVol: {$remVol}L)" . PHP_EOL;
    }
}
$stmtSize->close();
$stmtInv->close();

// Helper to find sizeId for a product and size
function findSizeId($prodId, $rawSize, $lookup, $idMap) {
    $norm = normSize($rawSize);
    $key1 = $prodId . '_' . $norm;
    if (isset($lookup[$key1])) return $lookup[$key1];
    if (isset($idMap[$prodId])) {
        $key2 = $idMap[$prodId] . '_' . $norm;
        if (isset($lookup[$key2])) return $lookup[$key2];
    }
    // Fallback: search any size under product
    foreach ($lookup as $k => $sid) {
        if (strpos($k, $prodId . '_') === 0 || (isset($idMap[$prodId]) && strpos($k, $idMap[$prodId] . '_') === 0)) {
            return $sid;
        }
    }
    return 'SZ-001';
}

// 7. Update `suppliers` table with new Product IDs
echo "7. Updating suppliers with new Product IDs..." . PHP_EOL;
$supRes = $conn->query("SELECT id, product_ids FROM suppliers");
while ($s = $supRes->fetch_assoc()) {
    $pids = json_decode($s['product_ids'] ?: '[]', true);
    if (is_array($pids)) {
        $newPids = [];
        foreach ($pids as $pid) {
            $newPids[] = $idMap[$pid] ?? $pid;
        }
        $newPids = array_values(array_unique($newPids));
        $enc = json_encode($newPids);
        $supUpd = $conn->prepare("UPDATE suppliers SET product_ids = ? WHERE id = ?");
        $supUpd->bind_param("ss", $enc, $s['id']);
        $supUpd->execute();
        $supUpd->close();
    }
}

// 8. Update `sales` table (items_json and returns_json)
echo "8. Updating sales items with Product ID & Size ID..." . PHP_EOL;
$salesRes = $conn->query("SELECT id, items_json, returns_json FROM sales");
$updSale = $conn->prepare("UPDATE sales SET items_json = ?, returns_json = ? WHERE id = ?");
while ($sl = $salesRes->fetch_assoc()) {
    $items = json_decode($sl['items_json'] ?: '[]', true);
    if (is_array($items)) {
        foreach ($items as &$it) {
            $oldPid = $it['productId'] ?? ($it['id'] ?? '');
            $newPid = $idMap[$oldPid] ?? $oldPid;
            $it['productId'] = $newPid;
            $sz = normSize($it['size'] ?? 1);
            $it['size'] = $sz;
            $it['sizeId'] = findSizeId($oldPid, $sz, $sizeLookup, $idMap);
            if (!empty($it['components']) && is_array($it['components'])) {
                foreach ($it['components'] as &$comp) {
                    $compPid = $comp['productId'] ?? '';
                    $comp['productId'] = $idMap[$compPid] ?? $compPid;
                }
            }
        }
        unset($it);
    }

    $returns = json_decode($sl['returns_json'] ?: '[]', true);
    if (is_array($returns)) {
        foreach ($returns as &$ret) {
            $oldPid = $ret['productId'] ?? '';
            $newPid = $idMap[$oldPid] ?? $oldPid;
            $ret['productId'] = $newPid;
            $sz = normSize($ret['size'] ?? 1);
            $ret['size'] = $sz;
            $ret['sizeId'] = findSizeId($oldPid, $sz, $sizeLookup, $idMap);
        }
        unset($ret);
    }

    $itemsEnc = json_encode($items);
    $returnsEnc = json_encode($returns);
    $updSale->bind_param("sss", $itemsEnc, $returnsEnc, $sl['id']);
    $updSale->execute();
}
$updSale->close();

// 9. Update `purchase_orders` table (items_json)
echo "9. Updating purchase_orders with Product ID & Size ID..." . PHP_EOL;
$poRes = $conn->query("SELECT id, items_json FROM purchase_orders");
$updPO = $conn->prepare("UPDATE purchase_orders SET items_json = ? WHERE id = ?");
while ($po = $poRes->fetch_assoc()) {
    $items = json_decode($po['items_json'] ?: '[]', true);
    if (is_array($items)) {
        foreach ($items as &$it) {
            $oldPid = $it['productId'] ?? '';
            $newPid = $idMap[$oldPid] ?? $oldPid;
            $it['productId'] = $newPid;
            $sz = normSize($it['size'] ?? 1);
            $it['size'] = $sz;
            $it['sizeId'] = findSizeId($oldPid, $sz, $sizeLookup, $idMap);
        }
        unset($it);
    }
    $itemsEnc = json_encode($items);
    $updPO->bind_param("ss", $itemsEnc, $po['id']);
    $updPO->execute();
}
$updPO->close();

// 10. Update `movements` table (product_id, size_id, container_size)
echo "10. Updating movements with Product ID & Size ID..." . PHP_EOL;
$mvRes = $conn->query("SELECT id, product_id, note, qty_change FROM movements");
$updMv = $conn->prepare("UPDATE movements SET product_id = ?, size_id = ?, container_size = ? WHERE id = ?");
while ($mv = $mvRes->fetch_assoc()) {
    $oldPid = $mv['product_id'];
    $newPid = $idMap[$oldPid] ?? $oldPid;

    // Detect size from note if available, e.g. "Sold 1 × 4L", "x 16L", "(1L can)", etc.
    $detectedSize = 1.0;
    if (preg_match('/(?:[×x\*\s])([0-9]+(?:\.[0-9]+)?)\s*L/i', $mv['note'], $matches)) {
        $detectedSize = floatval($matches[1]);
    } elseif (preg_match('/\bGallon\b/i', $mv['note'])) {
        $detectedSize = 4.0;
    } elseif (preg_match('/\bPail\b/i', $mv['note'])) {
        $detectedSize = 16.0;
    } elseif (abs(floatval($mv['qty_change'])) >= 16) {
        $detectedSize = 16.0;
    } elseif (abs(floatval($mv['qty_change'])) >= 4) {
        $detectedSize = 4.0;
    }

    $sizeId = $newPid ? findSizeId($oldPid, $detectedSize, $sizeLookup, $idMap) : null;
    $updMv->bind_param("ssds", $newPid, $sizeId, $detectedSize, $mv['id']);
    $updMv->execute();
}
$updMv->close();

// 11. Update `adjustment_requests` table (rows_json)
echo "11. Updating adjustment_requests with Product ID & Size ID..." . PHP_EOL;
$adjRes = $conn->query("SELECT id, rows_json FROM adjustment_requests");
$updAdj = $conn->prepare("UPDATE adjustment_requests SET rows_json = ? WHERE id = ?");
while ($ar = $adjRes->fetch_assoc()) {
    $rows = json_decode($ar['rows_json'] ?: '[]', true);
    if (is_array($rows)) {
        foreach ($rows as &$r) {
            $oldPid = $r['productId'] ?? '';
            $newPid = $idMap[$oldPid] ?? $oldPid;
            $r['productId'] = $newPid;
            $sz = normSize($r['size'] ?? 1);
            $r['size'] = $sz;
            $r['sizeId'] = findSizeId($oldPid, $sz, $sizeLookup, $idMap);
        }
        unset($r);
    }
    $rowsEnc = json_encode($rows);
    $updAdj->bind_param("ss", $rowsEnc, $ar['id']);
    $updAdj->execute();
}
$updAdj->close();

// 12. Add Foreign Key constraints if not already added
echo "12. Adding foreign key constraints..." . PHP_EOL;
try {
    $conn->query("ALTER TABLE product_sizes ADD CONSTRAINT fk_product_sizes_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE");
    echo "   - Added foreign key fk_product_sizes_product." . PHP_EOL;
} catch (Throwable $e) {
    echo "   - fk_product_sizes_product: " . $e->getMessage() . PHP_EOL;
}

try {
    $conn->query("ALTER TABLE inventory ADD CONSTRAINT fk_inventory_size FOREIGN KEY (size_id) REFERENCES product_sizes (size_id) ON DELETE CASCADE ON UPDATE CASCADE");
    echo "   - Added foreign key fk_inventory_size." . PHP_EOL;
} catch (Throwable $e) {
    echo "   - fk_inventory_size: " . $e->getMessage() . PHP_EOL;
}

echo "=== Migration Completed Successfully! ===" . PHP_EOL;

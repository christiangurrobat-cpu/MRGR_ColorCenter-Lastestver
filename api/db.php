<?php
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';

// Schema migration helper: ensures schema consistency without running 30+ redundant DDL queries on every request
function ensureDBSchemaMigrated($conn, $force = false) {
    $flagFile = __DIR__ . '/.schema_migrated';
    if (!$force && file_exists($flagFile)) {
        return;
    }

    try {
        $chk = $conn->query("SHOW COLUMNS FROM products LIKE 'can_stock'");
        if ($chk && $chk->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN can_stock TEXT NULL AFTER stock");
        }
        $chkRecentPrice = $conn->query("SHOW COLUMNS FROM products LIKE 'recent_price'");
        if ($chkRecentPrice && $chkRecentPrice->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN recent_price DECIMAL(10,2) NULL DEFAULT NULL AFTER price");
        }
        $chkPendingPrice = $conn->query("SHOW COLUMNS FROM products LIKE 'pending_price'");
        if ($chkPendingPrice && $chkPendingPrice->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN pending_price DECIMAL(10,2) NULL DEFAULT NULL AFTER recent_price");
        }
        $chkOpened = $conn->query("SHOW COLUMNS FROM products LIKE 'opened_stock'");
        if ($chkOpened && $chkOpened->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN opened_stock DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER can_stock");
        }
        $chkOpenedSize = $conn->query("SHOW COLUMNS FROM products LIKE 'opened_can_size'");
        if ($chkOpenedSize && $chkOpenedSize->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN opened_can_size INT NOT NULL DEFAULT 0 AFTER opened_stock");
        }
        $chkOpenedBySize = $conn->query("SHOW COLUMNS FROM products LIKE 'opened_by_size'");
        if ($chkOpenedBySize && $chkOpenedBySize->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN opened_by_size TEXT NULL AFTER opened_can_size");
        }
        $chkSizes = $conn->query("SHOW COLUMNS FROM products LIKE 'sizes'");
        if ($chkSizes && $chkSizes->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN sizes TEXT NULL AFTER opened_by_size");
        }
        $chkPendingSizes = $conn->query("SHOW COLUMNS FROM products LIKE 'pending_sizes'");
        if ($chkPendingSizes && $chkPendingSizes->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN pending_sizes TEXT NULL AFTER sizes");
        }
        $chkPendingEdit = $conn->query("SHOW COLUMNS FROM products LIKE 'pending_edit'");
        if ($chkPendingEdit && $chkPendingEdit->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN pending_edit TEXT NULL AFTER pending_sizes");
        }
        $chkThresholdBySize = $conn->query("SHOW COLUMNS FROM products LIKE 'threshold_by_size'");
        if ($chkThresholdBySize && $chkThresholdBySize->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN threshold_by_size TEXT NULL AFTER threshold");
        }
        // Ensure obsolete sales columns (customer, discount, payment) are removed
        $obsoleteSalesCols = ['customer_name', 'discount_pct', 'discount', 'cash_tendered', 'change_amount', 'payment_method'];
        foreach ($obsoleteSalesCols as $col) {
            $chkCol = $conn->query("SHOW COLUMNS FROM sales LIKE '$col'");
            if ($chkCol && $chkCol->num_rows > 0) {
                $conn->query("ALTER TABLE sales DROP COLUMN `$col`");
            }
        }

        // Auto-migrate: Product ID, product_name, category, supplier_id on products table
        $chkPid = $conn->query("SHOW COLUMNS FROM products LIKE 'product_id'");
        if ($chkPid && $chkPid->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN product_id VARCHAR(50) NULL AFTER id");
        }
        $chkPname = $conn->query("SHOW COLUMNS FROM products LIKE 'product_name'");
        if ($chkPname && $chkPname->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN product_name VARCHAR(200) NULL AFTER name");
        }
        $chkPcat = $conn->query("SHOW COLUMNS FROM products LIKE 'category'");
        if ($chkPcat && $chkPcat->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN category VARCHAR(100) NULL AFTER type");
        }
        $chkPsup = $conn->query("SHOW COLUMNS FROM products LIKE 'supplier_id'");
        if ($chkPsup && $chkPsup->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN supplier_id VARCHAR(50) NULL AFTER color");
        }
        $chkColorHex = $conn->query("SHOW COLUMNS FROM products LIKE 'color_hex'");
        if ($chkColorHex && $chkColorHex->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN color_hex VARCHAR(20) NULL AFTER color");
        }

        // Auto-migrate: product status column to support discontinued
        try {
            $conn->query("ALTER TABLE products MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'active'");
        } catch (Throwable $e) {}

        // Auto-migrate: price_history, deactivation_reason, deactivated_at, deactivated_by, updated_by, discontinue_reason
        $chkPriceHist = $conn->query("SHOW COLUMNS FROM products LIKE 'price_history'");
        if ($chkPriceHist && $chkPriceHist->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN price_history TEXT NULL AFTER pending_price");
        }
        $chkDeactReason = $conn->query("SHOW COLUMNS FROM products LIKE 'deactivation_reason'");
        if ($chkDeactReason && $chkDeactReason->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN deactivation_reason TEXT NULL AFTER status");
        }
        $chkDeactAt = $conn->query("SHOW COLUMNS FROM products LIKE 'deactivated_at'");
        if ($chkDeactAt && $chkDeactAt->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN deactivated_at DATETIME NULL AFTER deactivation_reason");
        }
        $chkDeactBy = $conn->query("SHOW COLUMNS FROM products LIKE 'deactivated_by'");
        if ($chkDeactBy && $chkDeactBy->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN deactivated_by VARCHAR(150) NULL AFTER deactivated_at");
        }
        $chkUpdatedBy = $conn->query("SHOW COLUMNS FROM products LIKE 'updated_by'");
        if ($chkUpdatedBy && $chkUpdatedBy->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN updated_by VARCHAR(150) NULL AFTER deactivated_by");
        }
        $chkDiscReason = $conn->query("SHOW COLUMNS FROM products LIKE 'discontinue_reason'");
        if ($chkDiscReason && $chkDiscReason->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN discontinue_reason TEXT NULL AFTER updated_by");
        }

        // Auto-migrate: product_sizes table
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

        // Auto-migrate: inventory table
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

        // Auto-migrate: size_id and container_size on movements table
        $chkMvSize = $conn->query("SHOW COLUMNS FROM movements LIKE 'size_id'");
        if ($chkMvSize && $chkMvSize->num_rows === 0) {
            $conn->query("ALTER TABLE movements ADD COLUMN size_id VARCHAR(50) NULL AFTER product_id");
        }
        $chkMvCsize = $conn->query("SHOW COLUMNS FROM movements LIKE 'container_size'");
        if ($chkMvCsize && $chkMvCsize->num_rows === 0) {
            $conn->query("ALTER TABLE movements ADD COLUMN container_size DECIMAL(10,2) NULL AFTER size_id");
        }

        // Auto-migrate: adjustment_requests table
        $conn->query("CREATE TABLE IF NOT EXISTS adjustment_requests (
            id VARCHAR(50) PRIMARY KEY,
            req_number VARCHAR(50) NOT NULL,
            date DATETIME NOT NULL,
            requested_by VARCHAR(100) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'staff',
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            rows_json LONGTEXT NOT NULL,
            batch_note TEXT NULL,
            reviewed_by VARCHAR(100) NULL,
            reviewed_at DATETIME NULL,
            reject_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        @file_put_contents($flagFile, date('Y-m-d H:i:s'));
    } catch (Throwable $e) { /* ignore */ }
}

$isMigrationRequested = ($action === 'migrate_schema' || isset($_GET['migrate']));
if ($isMigrationRequested || !file_exists(__DIR__ . '/.schema_migrated')) {
    ensureDBSchemaMigrated($conn, $isMigrationRequested);
    if ($action === 'migrate_schema') {
        echo json_encode(['success' => true, 'message' => 'Schema migration verified successfully.']);
        exit;
    }
}

// Helper function: check product dependencies on backend before deletion
function getProductBackendDependencies($conn, $productId, $internalId) {
    $deps = [];
    $ids = array_values(array_unique(array_filter([(string)$productId, (string)$internalId])));
    if (empty($ids)) return $deps;

    $id1 = $ids[0];
    $id2 = count($ids) > 1 ? $ids[1] : $ids[0];

    // 1. Stock in products table
    $stmt = $conn->prepare("SELECT name, stock, opened_stock FROM products WHERE id IN (?, ?) OR product_id IN (?, ?)");
    if ($stmt) {
        $stmt->bind_param("ssss", $id1, $id2, $id1, $id2);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($r = $res->fetch_assoc()) {
            if ((float)$r['stock'] > 0) {
                $deps[] = "Has remaining sealed stock (" . ((float)$r['stock']) . " L)";
            }
            if ((float)$r['opened_stock'] > 0) {
                $deps[] = "Has active opened stock (" . ((float)$r['opened_stock']) . " L)";
            }
        }
        $stmt->close();
    }

    // 1b. Stock in inventory table via product_sizes
    $stmt = $conn->prepare("SELECT SUM(inv.sealed_quantity) AS sealed_cnt, SUM(inv.opened_quantity) AS opened_cnt, SUM(inv.remaining_volume) AS rem_vol
                            FROM product_sizes ps
                            JOIN inventory inv ON inv.size_id = ps.size_id
                            WHERE ps.product_id IN (?, ?)");
    if ($stmt) {
        $stmt->bind_param("ss", $id1, $id2);
        $stmt->execute();
        if ($invRow = $stmt->get_result()->fetch_assoc()) {
            if ((int)($invRow['sealed_cnt'] ?? 0) > 0 && !in_array("Has remaining sealed stock", $deps)) {
                $deps[] = "Has " . ((int)$invRow['sealed_cnt']) . " sealed can(s) in warehouse inventory";
            }
            if ((float)($invRow['rem_vol'] ?? 0) > 0) {
                $deps[] = "Has opened can volume (" . ((float)$invRow['rem_vol']) . " L) in warehouse inventory";
            }
        }
        $stmt->close();
    }

    // 2. Stock movements / inventory transaction history
    $stmt = $conn->prepare("SELECT COUNT(*) AS cnt FROM movements WHERE product_id IN (?, ?)");
    if ($stmt) {
        $stmt->bind_param("ss", $id1, $id2);
        $stmt->execute();
        $mCount = (int)($stmt->get_result()->fetch_assoc()['cnt'] ?? 0);
        $stmt->close();
        if ($mCount > 0) {
            $deps[] = "Has $mCount recorded stock movement transaction(s)";
        }
    }

    // 3. Purchase orders
    $poCount = 0;
    $resPo = $conn->query("SELECT items_json FROM purchase_orders");
    if ($resPo) {
        while ($poRow = $resPo->fetch_assoc()) {
            $items = json_decode($poRow['items_json'] ?? '[]', true) ?: [];
            foreach ($items as $it) {
                $itemPid = (string)($it['productId'] ?? ($it['product_id'] ?? ''));
                if (in_array($itemPid, $ids, true)) {
                    $poCount++;
                    break;
                }
            }
        }
    }
    if ($poCount > 0) {
        $deps[] = "Referenced in $poCount purchase order(s)";
    }

    // 4. Sales transactions
    $salesCount = 0;
    $resSales = $conn->query("SELECT items_json FROM sales");
    if ($resSales) {
        while ($sRow = $resSales->fetch_assoc()) {
            $items = json_decode($sRow['items_json'] ?? '[]', true) ?: [];
            foreach ($items as $it) {
                $itemPid = (string)($it['productId'] ?? ($it['product_id'] ?? ''));
                if (in_array($itemPid, $ids, true)) {
                    $salesCount++;
                    break;
                }
            }
        }
    }
    if ($salesCount > 0) {
        $deps[] = "Referenced in $salesCount sales transaction(s)";
    }

    // 5. Adjustment requests
    $adjCount = 0;
    $resAdj = $conn->query("SELECT rows_json FROM adjustment_requests");
    if ($resAdj) {
        while ($aRow = $resAdj->fetch_assoc()) {
            $rows = json_decode($aRow['rows_json'] ?? '[]', true) ?: [];
            foreach ($rows as $arow) {
                $itemPid = (string)($arow['productId'] ?? ($arow['product_id'] ?? ''));
                if (in_array($itemPid, $ids, true)) {
                    $adjCount++;
                    break;
                }
            }
        }
    }
    if ($adjCount > 0) {
        $deps[] = "Referenced in $adjCount stock adjustment request(s)";
    }

    return array_values(array_unique($deps));
}

// Check product dependencies endpoint
if ($action === 'check_product_dependencies') {
    $id = $_GET['id'] ?? '';
    $pid = $_GET['product_id'] ?? $id;
    $deps = getProductBackendDependencies($conn, $pid, $id);
    echo json_encode([
        'success' => true,
        'hasDependencies' => !empty($deps),
        'dependencies' => $deps
    ]);
    exit;
}

// GET: Fetch all data from MySQL
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    try {
        // Load product sizes joined with inventory
        $sizesByProd = [];
        $allProductSizes = [];
        $allInventory = [];
        $psRes = $conn->query("SELECT ps.*, inv.inventory_id, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume 
                               FROM product_sizes ps 
                               LEFT JOIN inventory inv ON inv.size_id = ps.size_id 
                               ORDER BY ps.container_size ASC");
        if ($psRes) {
            while ($sRow = $psRes->fetch_assoc()) {
                $pid = $sRow['product_id'];
                $variant = [
                    'sizeId' => $sRow['size_id'],
                    'productId' => $pid,
                    'containerSize' => (float)$sRow['container_size'],
                    'pricePerLiter' => (float)$sRow['price_per_liter'],
                    'pricePerCan' => (float)$sRow['price_per_can'],
                    'minimumStock' => (int)$sRow['minimum_stock'],
                    'isActive' => (bool)$sRow['is_active'],
                    'inventoryId' => $sRow['inventory_id'] ?? null,
                    'sealedQuantity' => (int)($sRow['sealed_quantity'] ?? 0),
                    'openedQuantity' => (int)($sRow['opened_quantity'] ?? 0),
                    'remainingVolume' => (float)($sRow['remaining_volume'] ?? 0)
                ];
                $sizesByProd[$pid][] = $variant;
                $allProductSizes[] = $variant;
                if (!empty($sRow['inventory_id'])) {
                    $allInventory[] = [
                        'inventoryId' => $sRow['inventory_id'],
                        'sizeId' => $sRow['size_id'],
                        'sealedQuantity' => (int)($sRow['sealed_quantity'] ?? 0),
                        'openedQuantity' => (int)($sRow['opened_quantity'] ?? 0),
                        'remainingVolume' => (float)($sRow['remaining_volume'] ?? 0)
                    ];
                }
            }
        }

        // Products
        $products = [];
        $res = $conn->query("SELECT * FROM products ORDER BY id ASC");
        while ($r = $res->fetch_assoc()) {
            $pid = $r['id'];
            $variants = $sizesByProd[$pid] ?? ($sizesByProd[$r['product_id']] ?? []);

            // Synchronize legacy structures from variants if available
            $canStockObj = (!empty($r['can_stock']) && is_array(json_decode($r['can_stock'], true))) ? json_decode($r['can_stock'], true) : [];
            $sizesList = (!empty($r['sizes']) && is_array(json_decode($r['sizes'], true))) ? json_decode($r['sizes'], true) : [];
            $thresholdObj = (!empty($r['threshold_by_size']) && is_array(json_decode($r['threshold_by_size'], true))) ? json_decode($r['threshold_by_size'], true) : [];
            $openedObj = (!empty($r['opened_by_size']) && is_array(json_decode($r['opened_by_size'], true))) ? json_decode($r['opened_by_size'], true) : [];

            if (!empty($variants)) {
                $sizesList = [];
                $canStockObj = [];
                $thresholdObj = [];
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
                sort($sizesList);
            }

            $prodId = !empty($r['product_id']) ? $r['product_id'] : $r['id'];
            $prodName = !empty($r['product_name']) ? $r['product_name'] : $r['name'];
            $category = !empty($r['category']) ? $r['category'] : $r['type'];

            $products[] = [
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
                'colorHex' => $r['color_hex'] ?? null,
                'color_hex' => $r['color_hex'] ?? null,
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
                'discontinueReason' => $r['discontinue_reason'] ?? null
            ];
        }

        // Suppliers
        $suppliers = [];
        $res = $conn->query("SELECT * FROM suppliers ORDER BY name ASC");
        while ($r = $res->fetch_assoc()) {
            $productIds = [];
            if (!empty($r['product_ids'])) {
                $decoded = json_decode($r['product_ids'], true);
                if (is_array($decoded)) {
                    $productIds = $decoded;
                }
            }
            $suppliers[] = [
                'id' => $r['id'],
                'name' => $r['name'],
                'contact' => $r['contact'] ?? '',
                'phone' => $r['phone'] ?? '',
                'email' => $r['email'] ?? '',
                'address' => $r['address'] ?? '',
                'productIds' => $productIds,
                'status' => $r['status']
            ];
        }

        // Users
        $users = [];
        $res = $conn->query("SELECT * FROM users ORDER BY name ASC");
        while ($r = $res->fetch_assoc()) {
            $users[] = [
                'id' => $r['id'],
                'username' => $r['username'],
                'password' => $r['password'],
                'name' => $r['name'],
                'role' => $r['role'],
                'status' => $r['status']
            ];
        }

        // Sales
        $sales = [];
        $res = $conn->query("SELECT * FROM sales ORDER BY date DESC");
        while ($r = $res->fetch_assoc()) {
            $items = [];
            if (!empty($r['items_json'])) {
                $items = json_decode($r['items_json'], true) ?: [];
            }
            $returns = [];
            if (!empty($r['returns_json'])) {
                $returns = json_decode($r['returns_json'], true) ?: [];
            }
            $saleDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['date'], new DateTimeZone('Asia/Manila'));
            $sales[] = [
                'id' => $r['id'],
                'receiptNo' => $r['receipt_no'] ?? null,
                'date' => $saleDate ? $saleDate->format(DateTime::ATOM) : $r['date'],
                'cashierName' => $r['cashier_name'],
                'subtotal' => (float)$r['subtotal'],
                'total' => (float)($r['total'] ?: $r['subtotal']),
                'status' => $r['status'] ?? 'completed',
                'refundTotal' => (float)($r['refund_total'] ?? 0),
                'returns' => $returns,
                'items' => $items
            ];
        }

        // Movements
        $movements = [];
        $res = $conn->query("SELECT m.*, p.name AS current_product_name
            FROM movements m
            LEFT JOIN products p ON p.id = m.product_id
            ORDER BY m.date DESC");
        while ($r = $res->fetch_assoc()) {
            $movementDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['date'], new DateTimeZone('Asia/Manila'));
            $storedProductName = trim((string)($r['product_name'] ?? ''));
            $productName = ($storedProductName === '' || $storedProductName === '0')
                ? (string)($r['current_product_name'] ?? '')
                : $storedProductName;
            if ($productName === '') {
                $productName = $r['type'] === 'colormix' ? 'Color Mix' : 'Unknown product';
            }
            $movements[] = [
                'id' => $r['id'],
                'date' => $movementDate ? $movementDate->format(DateTime::ATOM) : $r['date'],
                'type' => $r['type'],
                'productId' => $r['product_id'],
                'sizeId' => $r['size_id'] ?? null,
                'containerSize' => isset($r['container_size']) && $r['container_size'] !== null ? (float)$r['container_size'] : null,
                'productName' => $productName,
                'qtyChange' => (float)$r['qty_change'],
                'staffName' => $r['staff_name'],
                'note' => $r['note'] ?? ''
            ];
        }

        // Purchase Orders
        $purchaseOrders = [];
        $res = $conn->query("SELECT * FROM purchase_orders ORDER BY order_date DESC");
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $items = [];
                $rawItemsJson = $r['items_json'] ?? '';
                if (!empty($rawItemsJson)) {
                    $items = json_decode($rawItemsJson, true) ?: [];
                }
                $orderDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['order_date'], new DateTimeZone('Asia/Manila'));
                $purchaseOrders[] = [
                    'id' => $r['id'],
                    'poNumber' => $r['po_number'],
                    'supplierId' => $r['supplier_id'],
                    'supplierName' => $r['supplier_name'],
                    'orderDate' => $orderDate ? $orderDate->format(DateTime::ATOM) : $r['order_date'],
                    'expectedDate' => $r['expected_date'] ?? null,
                    'status' => $r['status'],
                    'totalAmount' => (float)$r['total_amount'],
                    'items' => $items,
                    'itemsJson' => (is_string($rawItemsJson) && !empty($rawItemsJson)) ? $rawItemsJson : json_encode($items),
                    'notes' => $r['notes'] ?? '',
                    'createdBy' => $r['created_by'],
                    'receivedAt' => $r['received_at'] ?? null
                ];
            }
        }

        // Adjustment Requests
        $adjustmentRequests = [];
        $res = $conn->query("SELECT * FROM adjustment_requests ORDER BY date DESC");
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $rows = [];
                $rawRowsJson = $r['rows_json'] ?? '';
                if (!empty($rawRowsJson)) {
                    $rows = json_decode($rawRowsJson, true) ?: [];
                }
                $reqDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['date'], new DateTimeZone('Asia/Manila'));
                $reviewedAt = !empty($r['reviewed_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['reviewed_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['reviewed_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['reviewed_at']) : null;
                $adjustmentRequests[] = [
                    'id' => $r['id'],
                    'reqNumber' => $r['req_number'],
                    'date' => $reqDate ? $reqDate->format(DateTime::ATOM) : $r['date'],
                    'requestedBy' => $r['requested_by'],
                    'role' => $r['role'],
                    'status' => $r['status'],
                    'rows' => $rows,
                    'rowsJson' => $rawRowsJson,
                    'batchNote' => $r['batch_note'] ?? '',
                    'reviewedBy' => $r['reviewed_by'] ?? null,
                    'reviewedAt' => $reviewedAt,
                    'rejectReason' => $r['reject_reason'] ?? null
                ];
            }
        }

        echo json_encode([
            'success' => true,
            'db' => [
                'products' => $products,
                'productSizes' => $allProductSizes,
                'inventory' => $allInventory,
                'suppliers' => $suppliers,
                'users' => $users,
                'sales' => $sales,
                'movements' => $movements,
                'purchaseOrders' => $purchaseOrders,
                'adjustmentRequests' => $adjustmentRequests
            ]
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

// POST: Save/Sync database from client
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    if (!$payload || !isset($payload['db'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload. Expected { db: {...} }']);
        exit;
    }

    $dbData = $payload['db'];
    
    // RBAC: Verify acting user and role from database
    $actingUser = $payload['currentUser'] ?? null;
    $actingUserId = (string)($actingUser['id'] ?? '');
    $actingRole = (string)($actingUser['role'] ?? '');

    if ($actingUserId !== '') {
        $uStmt = $conn->prepare("SELECT id, role, status FROM users WHERE id = ? LIMIT 1");
        if ($uStmt) {
            $uStmt->bind_param("s", $actingUserId);
            $uStmt->execute();
            $uRes = $uStmt->get_result();
            if ($uRow = $uRes->fetch_assoc()) {
                if ($uRow['status'] !== 'active') {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'User account is inactive. Access denied.']);
                    exit;
                }
                $actingRole = (string)$uRow['role'];
            }
            $uStmt->close();
        }
    }

    $conn->begin_transaction();

    try {
        // Pre-fetch existing adjustment request statuses for RBAC
        $existingReqStatuses = [];
        $erRes = $conn->query("SELECT id, status FROM adjustment_requests");
        if ($erRes) {
            while ($erRow = $erRes->fetch_assoc()) {
                $existingReqStatuses[$erRow['id']] = $erRow['status'];
            }
        }

        // Pre-fetch existing product statuses for RBAC
        $existingProdStatuses = [];
        $epRes = $conn->query("SELECT id, status FROM products");
        if ($epRes) {
            while ($epRow = $epRes->fetch_assoc()) {
                $existingProdStatuses[$epRow['id']] = $epRow['status'];
            }
        }

        // 1. Sync Products
        if (!empty($dbData['products']) && is_array($dbData['products'])) {
            $stmt = $conn->prepare("INSERT INTO products (id, product_id, product_name, name, brand, type, category, color, color_hex, supplier_id, price, recent_price, pending_price, price_history, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, pending_edit, threshold, threshold_by_size, status, deactivation_reason, deactivated_at, deactivated_by, updated_by, discontinue_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    product_id = VALUES(product_id),
                    product_name = VALUES(product_name),
                    name = VALUES(name),
                    brand = VALUES(brand),
                    type = VALUES(type),
                    category = VALUES(category),
                    color = VALUES(color),
                    color_hex = VALUES(color_hex),
                    supplier_id = VALUES(supplier_id),
                    price = VALUES(price),
                    recent_price = VALUES(recent_price),
                    pending_price = VALUES(pending_price),
                    price_history = VALUES(price_history),
                    stock = VALUES(stock),
                    can_stock = VALUES(can_stock),
                    opened_stock = VALUES(opened_stock),
                    opened_can_size = VALUES(opened_can_size),
                    opened_by_size = VALUES(opened_by_size),
                    sizes = VALUES(sizes),
                    pending_sizes = VALUES(pending_sizes),
                    pending_edit = VALUES(pending_edit),
                    threshold = VALUES(threshold),
                    threshold_by_size = VALUES(threshold_by_size),
                    status = VALUES(status),
                    deactivation_reason = VALUES(deactivation_reason),
                    deactivated_at = VALUES(deactivated_at),
                    deactivated_by = VALUES(deactivated_by),
                    updated_by = VALUES(updated_by),
                    discontinue_reason = VALUES(discontinue_reason)");

            $stmtSizeUpsert = $conn->prepare("INSERT INTO product_sizes (size_id, product_id, container_size, price_per_liter, price_per_can, minimum_stock, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    price_per_liter = VALUES(price_per_liter),
                    price_per_can = VALUES(price_per_can),
                    minimum_stock = VALUES(minimum_stock),
                    is_active = VALUES(is_active)");

            $stmtInvUpsert = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    sealed_quantity = VALUES(sealed_quantity),
                    opened_quantity = VALUES(opened_quantity),
                    remaining_volume = VALUES(remaining_volume)");

            // Pre-fetch all existing size IDs to avoid collisions
            $existingSizesRes = $conn->query("SELECT size_id, product_id, container_size FROM product_sizes");
            $existingSizeMap = []; // [prodId_containerSize] => size_id
            $maxSizeNum = 0;
            while ($esRow = $existingSizesRes->fetch_assoc()) {
                $existingSizeMap[$esRow['product_id'] . '_' . (float)$esRow['container_size']] = $esRow['size_id'];
                $sNum = (int)str_replace('SZ-', '', $esRow['size_id']);
                if ($sNum > $maxSizeNum) $maxSizeNum = $sNum;
            }

            $existingInvRes = $conn->query("SELECT inventory_id, size_id FROM inventory");
            $existingInvMap = []; // [size_id] => inventory_id
            $maxInvNum = 0;
            while ($eiRow = $existingInvRes->fetch_assoc()) {
                $existingInvMap[$eiRow['size_id']] = $eiRow['inventory_id'];
                $iNum = (int)str_replace('INV-', '', $eiRow['inventory_id']);
                if ($iNum > $maxInvNum) $maxInvNum = $iNum;
            }

            foreach ($dbData['products'] as $p) {
                $id = (string)$p['id'];
                $productId = (string)($p['productId'] ?? ($p['product_id'] ?? $id));
                $name = (string)$p['name'];
                $productName = (string)($p['productName'] ?? ($p['product_name'] ?? $name));
                $brand = (string)($p['brand'] ?? '');
                $type = (string)($p['type'] ?? '');
                $category = (string)($p['category'] ?? $type);
                $color = (string)($p['color'] ?? '-');
                $colorHex = !empty($p['colorHex']) ? (string)$p['colorHex'] : (!empty($p['color_hex']) ? (string)$p['color_hex'] : null);
                $supplierId = !empty($p['supplierId']) ? (string)$p['supplierId'] : (!empty($p['supplier_id']) ? (string)$p['supplier_id'] : null);
                $price = (float)($p['price'] ?? 0);
                $recentPrice = (isset($p['recentPrice']) && $p['recentPrice'] !== null && $p['recentPrice'] !== '') ? (float)$p['recentPrice'] : null;
                $pendingPrice = (isset($p['pendingPrice']) && $p['pendingPrice'] !== null && $p['pendingPrice'] !== '') ? (float)$p['pendingPrice'] : null;
                $priceHistoryJson = json_encode(!empty($p['priceHistory']) && is_array($p['priceHistory']) ? $p['priceHistory'] : []);
                $stock = (float)($p['stock'] ?? 0);
                $canStockObj = isset($p['canStock']) && (is_array($p['canStock']) || is_object($p['canStock'])) ? (array)$p['canStock'] : [];
                $canStock = json_encode(!empty($canStockObj) ? $canStockObj : new stdClass());
                $openedStock = (float)($p['openedStock'] ?? 0);
                $openedCanSize = (int)($p['openedCanSize'] ?? 0);
                $openedBySizeObj = isset($p['openedBySize']) && (is_array($p['openedBySize']) || is_object($p['openedBySize'])) ? (array)$p['openedBySize'] : [];
                $openedBySize = json_encode(!empty($openedBySizeObj) ? $openedBySizeObj : new stdClass());
                $sizesArr = isset($p['sizes']) && is_array($p['sizes']) ? array_values($p['sizes']) : [];
                $sizesJson = json_encode($sizesArr);
                $pendingSizesJson = json_encode(isset($p['pendingSizes']) && is_array($p['pendingSizes']) ? array_values($p['pendingSizes']) : []);
                $pendingEditJson = (!empty($p['pendingEdit']) && (is_array($p['pendingEdit']) || is_object($p['pendingEdit']))) ? json_encode($p['pendingEdit']) : null;
                $threshold = (float)($p['threshold'] ?? 5);
                $thresholdBySizeArr = (isset($p['thresholdBySize']) && (is_array($p['thresholdBySize']) || is_object($p['thresholdBySize']))) ? (array)$p['thresholdBySize'] : [];
                $thresholdBySize = empty($thresholdBySizeArr) ? '{}' : json_encode($thresholdBySizeArr, JSON_FORCE_OBJECT);
                $status = (string)($p['status'] ?? 'active');
                if ($actingRole !== '' && $actingRole !== 'admin') {
                    // RBAC: Non-admin cannot approve products from pending_approval to active
                    if (isset($existingProdStatuses[$id]) && $existingProdStatuses[$id] === 'pending_approval' && $status === 'active') {
                        $status = 'pending_approval';
                    }
                }
                $deactReason = !empty($p['deactivationReason']) ? (string)$p['deactivationReason'] : null;
                $deactAt = !empty($p['deactivatedAt']) ? date('Y-m-d H:i:s', strtotime($p['deactivatedAt'])) : null;
                $deactBy = !empty($p['deactivatedBy']) ? (string)$p['deactivatedBy'] : null;
                $updatedBy = !empty($p['updatedBy']) ? (string)$p['updatedBy'] : null;
                $discReason = !empty($p['discontinueReason']) ? (string)$p['discontinueReason'] : null;

                $stmt->bind_param("ssssssssssdddsdsdissssdsssssss", $id, $productId, $productName, $name, $brand, $type, $category, $color, $colorHex, $supplierId, $price, $recentPrice, $pendingPrice, $priceHistoryJson, $stock, $canStock, $openedStock, $openedCanSize, $openedBySize, $sizesJson, $pendingSizesJson, $pendingEditJson, $threshold, $thresholdBySize, $status, $deactReason, $deactAt, $deactBy, $updatedBy, $discReason);
                $stmt->execute();

                // Sync sizes to product_sizes and inventory
                $variantsToSync = [];
                if (!empty($p['sizesData']) && is_array($p['sizesData'])) {
                    $variantsToSync = $p['sizesData'];
                } else {
                    foreach ($sizesArr as $sz) {
                        $szNum = (float)$sz;
                        $szStr = (string)$sz;
                        $variantsToSync[] = [
                            'containerSize' => $szNum,
                            'pricePerLiter' => $price,
                            'pricePerCan' => round($price * $szNum, 2),
                            'minimumStock' => isset($thresholdBySizeArr[$szStr]) ? (int)$thresholdBySizeArr[$szStr] : ($szNum >= 16 ? 1 : ($szNum >= 4 ? 2 : 5)),
                            'sealedQuantity' => isset($canStockObj[$szStr]) ? (int)$canStockObj[$szStr] : 0,
                            'remainingVolume' => isset($openedBySizeObj[$szStr]) ? (float)$openedBySizeObj[$szStr] : 0,
                            'isActive' => 1
                        ];
                    }
                }

                foreach ($variantsToSync as $v) {
                    $cSz = (float)($v['containerSize'] ?? 1);
                    $mapKey = $productId . '_' . $cSz;
                    $sizeId = !empty($v['sizeId']) ? (string)$v['sizeId'] : ($existingSizeMap[$mapKey] ?? null);
                    if (!$sizeId) {
                        $maxSizeNum++;
                        $sizeId = sprintf('SZ-%03d', $maxSizeNum);
                        $existingSizeMap[$mapKey] = $sizeId;
                    }
                    $pricePerLiter = isset($v['pricePerLiter']) ? (float)$v['pricePerLiter'] : $price;
                    $pricePerCan = isset($v['pricePerCan']) ? (float)$v['pricePerCan'] : round($pricePerLiter * $cSz, 2);
                    $minStock = isset($v['minimumStock']) ? (int)$v['minimumStock'] : ($cSz >= 16 ? 1 : ($cSz >= 4 ? 2 : 5));
                    $isActive = isset($v['isActive']) ? ($v['isActive'] ? 1 : 0) : 1;

                    $stmtSizeUpsert->bind_param("ssdddis", $sizeId, $productId, $cSz, $pricePerLiter, $pricePerCan, $minStock, $isActive);
                    $stmtSizeUpsert->execute();

                    // Inventory
                    $invId = !empty($v['inventoryId']) ? (string)$v['inventoryId'] : ($existingInvMap[$sizeId] ?? null);
                    if (!$invId) {
                        $maxInvNum++;
                        $invId = sprintf('INV-%03d', $maxInvNum);
                        $existingInvMap[$sizeId] = $invId;
                    }
                    $cSzStr = (string)$cSz;
                    $sealedQty = isset($v['sealedQuantity']) ? (int)$v['sealedQuantity'] : (isset($canStockObj[$cSzStr]) ? (int)$canStockObj[$cSzStr] : 0);
                    $remVol = isset($v['remainingVolume']) ? (float)$v['remainingVolume'] : (isset($openedBySizeObj[$cSzStr]) ? (float)$openedBySizeObj[$cSzStr] : 0);
                    $openedQty = $remVol > 0 ? 1 : 0;

                    $stmtInvUpsert->bind_param("ssiid", $invId, $sizeId, $sealedQty, $openedQty, $remVol);
                    $stmtInvUpsert->execute();
                }
            }
            $stmt->close();
            $stmtSizeUpsert->close();
            $stmtInvUpsert->close();
        }

        // 1b. Remove products deleted client-side (enforce backend safety checks)
        if (!empty($dbData['deletedProductIds']) && is_array($dbData['deletedProductIds'])) {
            foreach ($dbData['deletedProductIds'] as $delId) {
                $delId = (string)$delId;
                $chkStmt = $conn->prepare("SELECT product_id FROM products WHERE id = ?");
                $altPid = $delId;
                if ($chkStmt) {
                    $chkStmt->bind_param("s", $delId);
                    $chkStmt->execute();
                    $pidRow = $chkStmt->get_result()->fetch_assoc();
                    $chkStmt->close();
                    if (!empty($pidRow['product_id'])) {
                        $altPid = $pidRow['product_id'];
                    }
                }

                $deps = getProductBackendDependencies($conn, $altPid, $delId);
                if (!empty($deps)) {
                    throw new Exception("Deletion blocked for product $delId: " . implode('; ', $deps) . ". Deactivate or discontinue instead.");
                }

                // Delete child sizes & inventory if clean
                $delSizes = $conn->prepare("DELETE FROM product_sizes WHERE product_id IN (?, ?)");
                if ($delSizes) {
                    $delSizes->bind_param("ss", $delId, $altPid);
                    $delSizes->execute();
                    $delSizes->close();
                }

                $del = $conn->prepare("DELETE FROM products WHERE id = ?");
                if ($del) {
                    $del->bind_param("s", $delId);
                    $del->execute();
                    $del->close();
                }
            }
        }

        // 2. Sync Suppliers (Admin Only RBAC)
        if ($actingRole === 'admin' && !empty($dbData['suppliers']) && is_array($dbData['suppliers'])) {
            $stmt = $conn->prepare("INSERT INTO suppliers (id, name, contact, phone, email, address, product_ids, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    contact = VALUES(contact),
                    phone = VALUES(phone),
                    email = VALUES(email),
                    address = VALUES(address),
                    product_ids = VALUES(product_ids),
                    status = VALUES(status)");

            foreach ($dbData['suppliers'] as $s) {
                $id = (string)$s['id'];
                $name = (string)$s['name'];
                $contact = (string)($s['contact'] ?? '');
                $phone = (string)($s['phone'] ?? '');
                $email = (string)($s['email'] ?? '');
                $address = (string)($s['address'] ?? '');
                $productIds = json_encode($s['productIds'] ?? []);
                $status = (string)($s['status'] ?? 'active');

                $stmt->bind_param("ssssssss", $id, $name, $contact, $phone, $email, $address, $productIds, $status);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 3. Sync Users (Admin Only RBAC)
        if ($actingRole === 'admin' && !empty($dbData['users']) && is_array($dbData['users'])) {
            $stmt = $conn->prepare("INSERT INTO users (id, username, password, name, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    password = VALUES(password),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status)");

            foreach ($dbData['users'] as $u) {
                $id = (string)$u['id'];
                $username = (string)$u['username'];
                $password = (string)$u['password'];
                $name = (string)$u['name'];
                $role = (string)($u['role'] ?? 'cashier');
                $status = (string)($u['status'] ?? 'active');

                $stmt->bind_param("ssssss", $id, $username, $password, $name, $role, $status);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 4. Sync Sales
        if (!empty($dbData['sales']) && is_array($dbData['sales'])) {
            $stmt = $conn->prepare("INSERT INTO sales (id, receipt_no, date, cashier_name, subtotal, total, status, refund_total, returns_json, items_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    receipt_no = VALUES(receipt_no),
                    date = VALUES(date),
                    cashier_name = VALUES(cashier_name),
                    subtotal = VALUES(subtotal),
                    total = VALUES(total),
                    status = VALUES(status),
                    refund_total = VALUES(refund_total),
                    returns_json = VALUES(returns_json),
                    items_json = VALUES(items_json)");

            foreach ($dbData['sales'] as $sale) {
                $id = (string)$sale['id'];
                $receiptNo = (string)($sale['receiptNo'] ?? '');
                $date = date('Y-m-d H:i:s', strtotime($sale['date']));
                $cashierName = (string)$sale['cashierName'];
                $subtotal = (float)($sale['subtotal'] ?? 0);
                $total = (float)($sale['total'] ?? $subtotal);
                $status = (string)($sale['status'] ?? 'completed');
                $refundTotal = (float)($sale['refundTotal'] ?? 0);
                $returnsJson = json_encode($sale['returns'] ?? []);
                $itemsJson = json_encode($sale['items'] ?? []);

                $stmt->bind_param("ssssddsdss", $id, $receiptNo, $date, $cashierName, $subtotal, $total, $status, $refundTotal, $returnsJson, $itemsJson);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 5. Sync Movements
        if (!empty($dbData['movements']) && is_array($dbData['movements'])) {
            $stmt = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, qty_change, staff_name, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    date = VALUES(date),
                    type = VALUES(type),
                    product_id = VALUES(product_id),
                    size_id = VALUES(size_id),
                    container_size = VALUES(container_size),
                    product_name = VALUES(product_name),
                    qty_change = VALUES(qty_change),
                    staff_name = VALUES(staff_name),
                    note = VALUES(note)");

            foreach ($dbData['movements'] as $m) {
                $id = (string)$m['id'];
                $date = date('Y-m-d H:i:s', strtotime($m['date']));
                $type = (string)$m['type'];
                $productId = !empty($m['productId']) ? (string)$m['productId'] : (!empty($m['product_id']) ? (string)$m['product_id'] : null);
                $sizeId = !empty($m['sizeId']) ? (string)$m['sizeId'] : (!empty($m['size_id']) ? (string)$m['size_id'] : null);
                $containerSize = isset($m['containerSize']) && $m['containerSize'] !== null ? (float)$m['containerSize'] : (isset($m['container_size']) && $m['container_size'] !== null ? (float)$m['container_size'] : null);
                $productName = (string)$m['productName'];
                $qtyChange = (float)($m['qtyChange'] ?? 0);
                $staffName = (string)($m['staffName'] ?? '');
                $note = (string)($m['note'] ?? '');

                if (!$sizeId && !empty($note) && preg_match('/\b(SZ-\d+)\b/', $note, $szm)) {
                    $sizeId = $szm[1];
                }
                if (!$containerSize && !empty($note) && preg_match('/(?:Sold|Received|Return|Exchange|Added|Deducted|Adjusted)\s*\d+(?:\.\d+)?\s*[×x]\s*(\d+(?:\.\d+)?)L/i', $note, $csm)) {
                    $containerSize = (float)$csm[1];
                }

                $stmt->bind_param("sssssdsdss", $id, $date, $type, $productId, $sizeId, $containerSize, $productName, $qtyChange, $staffName, $note);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 6. Sync Purchase Orders
        if (!empty($dbData['purchaseOrders']) && is_array($dbData['purchaseOrders'])) {
            $stmt = $conn->prepare("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, expected_date, status, total_amount, items_json, notes, created_by, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    po_number = VALUES(po_number),
                    supplier_id = VALUES(supplier_id),
                    supplier_name = VALUES(supplier_name),
                    order_date = VALUES(order_date),
                    expected_date = VALUES(expected_date),
                    status = VALUES(status),
                    total_amount = VALUES(total_amount),
                    items_json = VALUES(items_json),
                    notes = VALUES(notes),
                    created_by = VALUES(created_by),
                    received_at = VALUES(received_at)");

            foreach ($dbData['purchaseOrders'] as $po) {
                $id = (string)$po['id'];
                $poNumber = (string)($po['poNumber'] ?? '');
                $supplierId = (string)($po['supplierId'] ?? '');
                $supplierName = (string)($po['supplierName'] ?? '');
                $orderDate = date('Y-m-d H:i:s', strtotime($po['orderDate'] ?? 'now'));
                $expectedDate = !empty($po['expectedDate']) ? date('Y-m-d', strtotime($po['expectedDate'])) : null;
                $status = (string)($po['status'] ?? 'ordered');
                $totalAmount = (float)($po['totalAmount'] ?? 0);
                $itemsJson = json_encode($po['items'] ?? []);
                $notes = (string)($po['notes'] ?? '');
                $createdBy = (string)($po['createdBy'] ?? '');
                $receivedAt = !empty($po['receivedAt']) ? date('Y-m-d H:i:s', strtotime($po['receivedAt'])) : null;

                $stmt->bind_param("sssssssdssss", $id, $poNumber, $supplierId, $supplierName, $orderDate, $expectedDate, $status, $totalAmount, $itemsJson, $notes, $createdBy, $receivedAt);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 7. Sync Adjustment Requests
        if (!empty($dbData['adjustmentRequests']) && is_array($dbData['adjustmentRequests'])) {
            $stmt = $conn->prepare("INSERT INTO adjustment_requests (id, req_number, date, requested_by, role, status, rows_json, batch_note, reviewed_by, reviewed_at, reject_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    req_number = VALUES(req_number),
                    date = VALUES(date),
                    requested_by = VALUES(requested_by),
                    role = VALUES(role),
                    status = VALUES(status),
                    rows_json = VALUES(rows_json),
                    batch_note = VALUES(batch_note),
                    reviewed_by = VALUES(reviewed_by),
                    reviewed_at = VALUES(reviewed_at),
                    reject_reason = VALUES(reject_reason)");

            foreach ($dbData['adjustmentRequests'] as $ar) {
                $id = (string)$ar['id'];
                $reqNumber = (string)($ar['reqNumber'] ?? '');
                $date = date('Y-m-d H:i:s', strtotime($ar['date'] ?? 'now'));
                $requestedBy = (string)($ar['requestedBy'] ?? 'staff');
                $role = (string)($ar['role'] ?? 'staff');
                $status = (string)($ar['status'] ?? 'pending');
                $rowsJson = json_encode($ar['rows'] ?? []);
                $batchNote = (string)($ar['batchNote'] ?? '');
                $reviewedBy = !empty($ar['reviewedBy']) ? (string)$ar['reviewedBy'] : null;
                $reviewedAt = !empty($ar['reviewedAt']) ? date('Y-m-d H:i:s', strtotime($ar['reviewedAt'])) : null;
                $rejectReason = !empty($ar['rejectReason']) ? (string)$ar['rejectReason'] : null;

                // RBAC: Only admin can approve or reject adjustment requests; all other roles can only submit 'pending'
                if ($actingRole !== 'admin') {
                    if (isset($existingReqStatuses[$id])) {
                        $prevSt = $existingReqStatuses[$id];
                        if ($prevSt === 'pending' && ($status === 'approved' || $status === 'rejected')) {
                            $status = 'pending';
                            $reviewedBy = null;
                            $reviewedAt = null;
                            $rejectReason = null;
                        }
                    } else {
                        $status = 'pending';
                    }
                }

                $stmt->bind_param("sssssssssss", $id, $reqNumber, $date, $requestedBy, $role, $status, $rowsJson, $batchNote, $reviewedBy, $reviewedAt, $rejectReason);
                $stmt->execute();
            }
            $stmt->close();
        }

        $conn->commit();
        echo json_encode(['success' => true]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

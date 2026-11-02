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

// Auto-migrate: per-size can counts (e.g. {"1":10,"4":5,"16":3}) stored as JSON
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
    $chkCash = $conn->query("SHOW COLUMNS FROM sales LIKE 'cash_tendered'");
    if ($chkCash && $chkCash->num_rows === 0) {
        $conn->query("ALTER TABLE sales ADD COLUMN cash_tendered DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total");
    }
    $chkChange = $conn->query("SHOW COLUMNS FROM sales LIKE 'change_amount'");
    if ($chkChange && $chkChange->num_rows === 0) {
        $conn->query("ALTER TABLE sales ADD COLUMN change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cash_tendered");
    }

    // Auto-migrate: adjustment_requests table for Staff Stock Adjustments with Admin Approval
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
} catch (Throwable $e) { /* ignore */ }

// GET: Fetch all data from MySQL
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        // Products
        $products = [];
        $res = $conn->query("SELECT * FROM products ORDER BY name ASC");
        while ($r = $res->fetch_assoc()) {
            $products[] = [
                'id' => $r['id'],
                'name' => $r['name'],
                'brand' => $r['brand'],
                'type' => $r['type'],
                'color' => $r['color'],
                'price' => (float)$r['price'],
                'recentPrice' => (isset($r['recent_price']) && $r['recent_price'] !== null && $r['recent_price'] !== '') ? (float)$r['recent_price'] : null,
                'pendingPrice' => (isset($r['pending_price']) && $r['pending_price'] !== null && $r['pending_price'] !== '') ? (float)$r['pending_price'] : null,
                'stock' => (float)$r['stock'],
                'canStock' => (!empty($r['can_stock']) && is_array(json_decode($r['can_stock'], true))) ? json_decode($r['can_stock'], true) : new stdClass(),
                'openedStock' => (float)($r['opened_stock'] ?? 0),
                'openedCanSize' => (int)($r['opened_can_size'] ?? 0),
                'sizes' => (!empty($r['sizes']) && is_array(json_decode($r['sizes'], true))) ? json_decode($r['sizes'], true) : [],
                'pendingSizes' => (!empty($r['pending_sizes']) && is_array(json_decode($r['pending_sizes'], true))) ? json_decode($r['pending_sizes'], true) : [],
                'pendingEdit' => (!empty($r['pending_edit']) && is_array(json_decode($r['pending_edit'], true))) ? json_decode($r['pending_edit'], true) : null,
                'openedBySize' => (!empty($r['opened_by_size']) && is_array(json_decode($r['opened_by_size'], true))) ? json_decode($r['opened_by_size'], true) : new stdClass(),
                'threshold' => (float)$r['threshold'],
                'thresholdBySize' => (!empty($r['threshold_by_size']) && is_array(json_decode($r['threshold_by_size'], true)) && !empty(json_decode($r['threshold_by_size'], true))) ? json_decode($r['threshold_by_size'], true) : new stdClass(),
                'status' => $r['status']
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
                'customerName' => $r['customer_name'] ?? '',
                'subtotal' => (float)$r['subtotal'],
                'discountPct' => (float)$r['discount_pct'],
                'discount' => (float)$r['discount'],
                'total' => (float)$r['total'],
                'cashTendered' => (float)($r['cash_tendered'] ?? 0),
                'change' => (float)($r['change_amount'] ?? 0),
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

        // Adjustment Requests (Staff adjustment requests with Admin approval)
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

// POST: Save/Sync data back to MySQL
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!isset($data['db'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing db payload']);
        exit;
    }

    $dbData = $data['db'];
    $conn->begin_transaction();

    try {
        // 1. Sync Products
        if (!empty($dbData['products']) && is_array($dbData['products'])) {
            $stmt = $conn->prepare("INSERT INTO products (id, name, brand, type, color, price, recent_price, pending_price, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, pending_edit, threshold, threshold_by_size, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    brand = VALUES(brand),
                    type = VALUES(type),
                    color = VALUES(color),
                    price = VALUES(price),
                    recent_price = VALUES(recent_price),
                    pending_price = VALUES(pending_price),
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
                    status = VALUES(status)");

            foreach ($dbData['products'] as $p) {
                $id = (string)$p['id'];
                $name = (string)$p['name'];
                $brand = (string)($p['brand'] ?? '');
                $type = (string)($p['type'] ?? '');
                $color = (string)($p['color'] ?? '-');
                $price = (float)($p['price'] ?? 0);
                $recentPrice = (isset($p['recentPrice']) && $p['recentPrice'] !== null && $p['recentPrice'] !== '') ? (float)$p['recentPrice'] : null;
                $pendingPrice = (isset($p['pendingPrice']) && $p['pendingPrice'] !== null && $p['pendingPrice'] !== '') ? (float)$p['pendingPrice'] : null;
                $stock = (float)($p['stock'] ?? 0);
                $canStock = json_encode(isset($p['canStock']) && is_array($p['canStock']) ? $p['canStock'] : new stdClass());
                $openedStock = (float)($p['openedStock'] ?? 0);
                $openedCanSize = (int)($p['openedCanSize'] ?? 0);
                $openedBySize = json_encode(isset($p['openedBySize']) && is_array($p['openedBySize']) ? $p['openedBySize'] : new stdClass());
                $sizesJson = json_encode(isset($p['sizes']) && is_array($p['sizes']) ? array_values($p['sizes']) : []);
                $pendingSizesJson = json_encode(isset($p['pendingSizes']) && is_array($p['pendingSizes']) ? array_values($p['pendingSizes']) : []);
                $pendingEditJson = (!empty($p['pendingEdit']) && (is_array($p['pendingEdit']) || is_object($p['pendingEdit']))) ? json_encode($p['pendingEdit']) : null;
                $threshold = (float)($p['threshold'] ?? 5);
                $thresholdBySizeArr = (isset($p['thresholdBySize']) && is_array($p['thresholdBySize'])) ? $p['thresholdBySize'] : [];
                $thresholdBySize = empty($thresholdBySizeArr) ? '{}' : json_encode($thresholdBySizeArr, JSON_FORCE_OBJECT);
                $status = (string)($p['status'] ?? 'active');

                $stmt->bind_param("sssssddddsdissssdss", $id, $name, $brand, $type, $color, $price, $recentPrice, $pendingPrice, $stock, $canStock, $openedStock, $openedCanSize, $openedBySize, $sizesJson, $pendingSizesJson, $pendingEditJson, $threshold, $thresholdBySize, $status);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 1b. Remove products deleted client-side (e.g. duplicate cleanup)
        if (!empty($dbData['deletedProductIds']) && is_array($dbData['deletedProductIds'])) {
            $del = $conn->prepare("DELETE FROM products WHERE id = ?");
            foreach ($dbData['deletedProductIds'] as $delId) {
                $delId = (string)$delId;
                $del->bind_param("s", $delId);
                $del->execute();
            }
            $del->close();
        }

        // 2. Sync Suppliers
        if (!empty($dbData['suppliers']) && is_array($dbData['suppliers'])) {
            $stmt = $conn->prepare("INSERT INTO suppliers (id, name, contact, phone, product_ids, status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    contact = VALUES(contact),
                    phone = VALUES(phone),
                    product_ids = VALUES(product_ids),
                    status = VALUES(status)");

            foreach ($dbData['suppliers'] as $s) {
                $id = (string)$s['id'];
                $name = (string)$s['name'];
                $contact = (string)($s['contact'] ?? '');
                $phone = (string)($s['phone'] ?? '');
                $productIds = json_encode($s['productIds'] ?? []);
                $status = (string)($s['status'] ?? 'active');

                $stmt->bind_param("ssssss", $id, $name, $contact, $phone, $productIds, $status);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 3. Sync Users
        if (!empty($dbData['users']) && is_array($dbData['users'])) {
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
            $stmt = $conn->prepare("INSERT INTO sales (id, receipt_no, date, cashier_name, customer_name, subtotal, discount_pct, discount, total, cash_tendered, change_amount, status, refund_total, returns_json, items_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    receipt_no = VALUES(receipt_no),
                    date = VALUES(date),
                    cashier_name = VALUES(cashier_name),
                    customer_name = VALUES(customer_name),
                    subtotal = VALUES(subtotal),
                    discount_pct = VALUES(discount_pct),
                    discount = VALUES(discount),
                    total = VALUES(total),
                    cash_tendered = VALUES(cash_tendered),
                    change_amount = VALUES(change_amount),
                    status = VALUES(status),
                    refund_total = VALUES(refund_total),
                    returns_json = VALUES(returns_json),
                    items_json = VALUES(items_json)");

            foreach ($dbData['sales'] as $sale) {
                $id = (string)$sale['id'];
                $receiptNo = (string)($sale['receiptNo'] ?? '');
                $date = date('Y-m-d H:i:s', strtotime($sale['date']));
                $cashierName = (string)$sale['cashierName'];
                $customerName = (string)($sale['customerName'] ?? '');
                $subtotal = (float)($sale['subtotal'] ?? 0);
                $discountPct = (float)($sale['discountPct'] ?? 0);
                $discount = (float)($sale['discount'] ?? 0);
                $total = (float)($sale['total'] ?? 0);
                $cashTendered = (float)($sale['cashTendered'] ?? 0);
                $changeAmount = (float)($sale['change'] ?? 0);
                $status = (string)($sale['status'] ?? 'completed');
                $refundTotal = (float)($sale['refundTotal'] ?? 0);
                $returnsJson = json_encode($sale['returns'] ?? []);
                $itemsJson = json_encode($sale['items'] ?? []);

                $stmt->bind_param("sssssddddddsds" . "s", $id, $receiptNo, $date, $cashierName, $customerName, $subtotal, $discountPct, $discount, $total, $cashTendered, $changeAmount, $status, $refundTotal, $returnsJson, $itemsJson);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 5. Sync Movements
        if (!empty($dbData['movements']) && is_array($dbData['movements'])) {
            $stmt = $conn->prepare("INSERT INTO movements (id, date, type, product_id, product_name, qty_change, staff_name, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    date = VALUES(date),
                    type = VALUES(type),
                    product_id = VALUES(product_id),
                    product_name = VALUES(product_name),
                    qty_change = VALUES(qty_change),
                    staff_name = VALUES(staff_name),
                    note = VALUES(note)");

            foreach ($dbData['movements'] as $m) {
                $id = (string)$m['id'];
                $date = date('Y-m-d H:i:s', strtotime($m['date']));
                $type = (string)$m['type'];
                $productId = !empty($m['productId']) ? (string)$m['productId'] : null;
                $productName = (string)$m['productName'];
                $qtyChange = (float)($m['qtyChange'] ?? 0);
                $staffName = (string)($m['staffName'] ?? '');
                $note = (string)($m['note'] ?? '');

                $stmt->bind_param("sssssdss", $id, $date, $type, $productId, $productName, $qtyChange, $staffName, $note);
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
                $itemsJson = '[]';
                if (!empty($po['itemsJson']) && is_string($po['itemsJson']) && $po['itemsJson'] !== '[]') {
                    $itemsJson = $po['itemsJson'];
                } elseif (!empty($po['items']) && is_array($po['items']) && count($po['items']) > 0) {
                    $itemsJson = json_encode($po['items']);
                } elseif (!empty($po['itemsJson'])) {
                    $itemsJson = is_string($po['itemsJson']) ? $po['itemsJson'] : json_encode($po['itemsJson']);
                } elseif (!empty($po['items'])) {
                    $itemsJson = is_string($po['items']) ? $po['items'] : json_encode($po['items']);
                }
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

            foreach ($dbData['adjustmentRequests'] as $req) {
                $id = (string)$req['id'];
                $reqNumber = (string)($req['reqNumber'] ?? '');
                $date = date('Y-m-d H:i:s', strtotime($req['date'] ?? 'now'));
                $requestedBy = (string)($req['requestedBy'] ?? 'Staff');
                $role = (string)($req['role'] ?? 'staff');
                $status = (string)($req['status'] ?? 'pending');
                $rowsJson = '[]';
                if (!empty($req['rowsJson']) && is_string($req['rowsJson'])) {
                    $rowsJson = $req['rowsJson'];
                } elseif (!empty($req['rows']) && is_array($req['rows'])) {
                    $rowsJson = json_encode($req['rows']);
                }
                $batchNote = (string)($req['batchNote'] ?? '');
                $reviewedBy = !empty($req['reviewedBy']) ? (string)$req['reviewedBy'] : null;
                $reviewedAt = !empty($req['reviewedAt']) ? date('Y-m-d H:i:s', strtotime($req['reviewedAt'])) : null;
                $rejectReason = !empty($req['rejectReason']) ? (string)$req['rejectReason'] : null;

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

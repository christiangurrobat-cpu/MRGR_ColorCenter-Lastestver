<?php
// Audit log API: POST = record an entry (append-only), GET = list entries with filtering, stats, pagination & CSV export.
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

/**
 * Mask or scrub any sensitive credentials (passwords, hashes, tokens) from audit strings.
 */
function sanitizeAuditText($str) {
    if ($str === null || $str === '') return '';
    $s = (string)$str;
    // Mask JSON or key-value password/token patterns
    $s = preg_replace('/("(?:password|passwordHash|password_hash|newPassword|oldPassword|token|auth_token|secret)"\s*:\s*")[^"]*(")/i', '$1[REDACTED]$2', $s);
    $s = preg_replace('/(\b(?:password|passwordHash|password_hash|token|secret)\s*[=:]\s*)([^\s,;]+)/i', '$1[REDACTED]', $s);
    // Mask bcrypt hashes if ever passed accidentally
    $s = preg_replace('/\$2[ayb]\$\d{2}\$[A-Za-z0-9\.\/]{53}/', '[REDACTED_HASH]', $s);
    return $s;
}

/**
 * Recursively scrub sensitive keys from metadata arrays/objects.
 */
function sanitizeAuditMeta($data) {
    if (!is_array($data)) return $data;
    $sensitiveKeys = ['password', 'passwordhash', 'password_hash', 'oldpassword', 'newpassword', 'token', 'auth_token', 'secret', 'pass'];
    $clean = [];
    foreach ($data as $k => $v) {
        $lowerKey = strtolower((string)$k);
        if (in_array($lowerKey, $sensitiveKeys, true)) {
            $clean[$k] = '[REDACTED]';
        } elseif (is_array($v)) {
            $clean[$k] = sanitizeAuditMeta($v);
        } elseif (is_string($v)) {
            $clean[$k] = sanitizeAuditText($v);
        } else {
            $clean[$k] = $v;
        }
    }
    return $clean;
}

/**
 * Strip internal Product IDs (e.g. [PRD-001], (p_12345), p1) and Size IDs (SZ-...) from normal human-readable display text.
 */
function cleanDisplayAuditText($text) {
    if ($text === null || $text === '') return '';
    $s = (string)$text;
    // Remove bracketed or parenthesized internal IDs such as [PRD-001], (PRD-001), [SZ-001-1L], (SZ-001), [p_123...]
    $s = preg_replace('/\s*[\[\(](?:PRD-[A-Za-z0-9_-]+|PROD-[A-Za-z0-9_-]+|SZ-[A-Za-z0-9_-]+|p_[A-Za-z0-9_-]+|p\d+)[\]\)]/i', '', $s);
    // Replace PHP currency prefix with ₱ for uniform display
    $s = preg_replace('/\bPHP\s*(\d)/i', '₱$1', $s);
    return trim(preg_replace('/\s{2,}/', ' ', $s));
}

/**
 * Map an action code to its high-level Action Category.
 */
function getAuditActionCategory($action, $details = '') {
    $a = strtoupper(trim((string)$action));
    if (in_array($a, ['LOGIN', 'LOGOUT', 'USER_LOGIN', 'USER_LOGOUT'], true)) {
        return 'login_logout';
    }
    if (in_array($a, ['LOGIN_FAILED', 'FAILED_LOGIN', 'PASSWORD_CHANGE', 'UNAUTHORIZED_ACCESS'], true)) {
        return 'security_events';
    }
    if (in_array($a, [
        'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_PRICE_CHANGE',
        'PRODUCT_DEACTIVATE', 'PRODUCT_REACTIVATE', 'PRODUCT_DISCONTINUE', 'PRODUCT_DELETE',
        'PRODUCT_STATUS', 'PRODUCT_REQUEST', 'PRODUCT_APPROVE', 'PRODUCT_REJECT',
        'PRODUCT_EDIT_REQUEST', 'PRODUCT_EDIT_APPROVE', 'PRODUCT_EDIT_REJECT', 'PRODUCT_EDIT_CANCEL',
        'PRODUCT_PRICE_REQUEST', 'PRODUCT_PRICE_APPROVE', 'PRODUCT_PRICE_REJECT',
        'PRODUCT_SIZE_APPROVE', 'PRODUCT_SIZE_REJECT', 'PRODUCT_BATCH_APPROVE',
        'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_STATUS', 'SUPPLIER_DEACTIVATE', 'SUPPLIER_REACTIVATE'
    ], true)) {
        return 'product_changes';
    }
    if (in_array($a, [
        'STOCK_RECEIVE', 'STOCK_ADJUST', 'STOCK_INCREASE', 'STOCK_DECREASE',
        'STOCK_THRESHOLD_CHANGE', 'CONTAINER_SIZE_ADD', 'CONTAINER_SIZE_REMOVE',
        'ADJ_REQUEST_SUBMIT', 'ADJ_REQUEST_APPROVE', 'ADJ_REQUEST_REJECT', 'ADJ_BATCH_APPROVE',
        'STOCK_DISPOSE_OPENED'
    ], true)) {
        return 'stock_movements';
    }
    if (in_array($a, [
        'PO_CREATE', 'PO_SUBMIT', 'PO_APPROVE', 'PO_REJECT',
        'PO_RECEIVE', 'PO_PARTIAL_RECEIVE', 'PO_CANCEL', 'PO_BATCH_APPROVE'
    ], true)) {
        return 'purchase_orders';
    }
    if (in_array($a, ['SALE', 'SALE_COMPLETE', 'RECEIPT_GENERATED', 'SALE_VOID'], true)) {
        return 'sales_transactions';
    }
    if (in_array($a, ['SALE_REFUND', 'PARTIAL_REFUND', 'SALE_RETURN', 'SALE_EXCHANGE'], true)) {
        return 'returns_refunds';
    }
    if (in_array($a, [
        'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_REACTIVATE',
        'USER_ROLE_CHANGE', 'USER_STATUS', 'USER_DELETE'
    ], true)) {
        return 'user_management';
    }
    if (in_array($a, ['MIXING_START', 'MIXING_COMPLETE', 'MIXING_CANCEL', 'COLOR_MIX'], true)) {
        return 'color_mixing';
    }
    return 'other';
}

/**
 * Enrich a database row (including historical rows) with structured fields for UI & CSV export.
 */
function enrichAuditRow(array $row, array $productMap) {
    $action = (string)($row['action'] ?? '');
    $entity = (string)($row['entity'] ?? '');
    $details = sanitizeAuditText((string)($row['details'] ?? ''));
    $prodId = (string)($row['product_id'] ?? '');

    $entityName = trim((string)($row['entity_name'] ?? ''));
    $fieldChanged = trim((string)($row['field_changed'] ?? ''));
    $oldValue = $row['old_value'] !== null ? sanitizeAuditText((string)$row['old_value']) : '';
    $newValue = $row['new_value'] !== null ? sanitizeAuditText((string)$row['new_value']) : '';
    $refNo = trim((string)($row['reference_no'] ?? ''));
    $reason = trim((string)($row['reason'] ?? ''));
    $meta = null;
    if (!empty($row['meta_json'])) {
        $decoded = json_decode($row['meta_json'], true);
        if (is_array($decoded)) {
            $meta = sanitizeAuditMeta($decoded);
        }
    }

    // Resolve product name from productMap if product_id is present
    $resolvedProductName = ($prodId !== '' && isset($productMap[$prodId])) ? $productMap[$prodId] : '';

    // Parse legacy details strings when structured fields are empty
    if ($entityName === '' && $resolvedProductName !== '') {
        $entityName = $resolvedProductName;
    }

    // 1. Price changes
    if (preg_match('/Price changed for (.+?) from (?:PHP\s*|₱)([\d,\.]+) to (?:PHP\s*|₱)([\d,\.]+)/i', $details, $m)) {
        if ($entityName === '') $entityName = trim($m[1]);
        if ($fieldChanged === '') $fieldChanged = 'Price per Liter';
        if ($oldValue === '') $oldValue = '₱' . number_format((float)str_replace(',', '', $m[2]), 2);
        if ($newValue === '') $newValue = '₱' . number_format((float)str_replace(',', '', $m[3]), 2);
    } elseif (preg_match('/Updated (.+?) price from (?:PHP\s*|₱)([\d,\.]+) to (?:PHP\s*|₱)([\d,\.]+)/i', $details, $m)) {
        if ($entityName === '') $entityName = trim($m[1]);
        if ($fieldChanged === '') $fieldChanged = 'Price per Liter';
        if ($oldValue === '') $oldValue = '₱' . number_format((float)str_replace(',', '', $m[2]), 2);
        if ($newValue === '') $newValue = '₱' . number_format((float)str_replace(',', '', $m[3]), 2);
    } elseif (preg_match('/(?:Approved|Staff submitted) price change for (.+?):\s*(?:PHP\s*|₱)([\d,\.]+)\s*(?:➔|->|to)\s*(?:PHP\s*|₱)([\d,\.]+)/u', $details, $m)) {
        if ($entityName === '') $entityName = trim($m[1]);
        if ($fieldChanged === '') $fieldChanged = ($action === 'PRODUCT_PRICE_REQUEST') ? 'Requested Price per Liter' : 'Price per Liter';
        if ($oldValue === '') $oldValue = '₱' . number_format((float)str_replace(',', '', $m[2]), 2);
        if ($newValue === '') $newValue = '₱' . number_format((float)str_replace(',', '', $m[3]), 2);
    }

    // 2. Product status / deactivate / reactivate / discontinue
    if (preg_match('/Product (.+?) set to (active|inactive|discontinued)/i', $details, $m)) {
        if ($entityName === '') $entityName = trim($m[1]);
        if ($fieldChanged === '') $fieldChanged = 'Product Status';
        $targetSt = ucfirst(strtolower($m[2]));
        if ($newValue === '') $newValue = $targetSt;
        if ($oldValue === '') $oldValue = ($targetSt === 'Active') ? 'Inactive' : 'Active';
    } elseif (preg_match('/Product (.+?) (deactivated|discontinued|reactivated) by/i', $details, $m)) {
        if ($entityName === '') $entityName = trim($m[1]);
        if ($fieldChanged === '') $fieldChanged = 'Product Status';
        $verb = strtolower($m[2]);
        if ($verb === 'deactivated') {
            if ($oldValue === '') $oldValue = 'Active';
            if ($newValue === '') $newValue = 'Inactive';
        } elseif ($verb === 'discontinued') {
            if ($oldValue === '') $oldValue = 'Active';
            if ($newValue === '') $newValue = 'Discontinued';
        } elseif ($verb === 'reactivated') {
            if ($oldValue === '') $oldValue = 'Inactive';
            if ($newValue === '') $newValue = 'Active';
        }
    }

    // Extract Reason if embedded in details
    if ($reason === '' && preg_match('/Reason:\s*(.+)$/i', $details, $m)) {
        $reason = trim($m[1]);
    }

    // 3. Product edits / updates
    if ($entityName === '' && preg_match('/(?:Admin updated product|Updated|Approved edit request for|Rejected edit request for|cancelled pending edit request for|Staff submitted edit request for)\s+"?([^"\(]+?)"?(?:\s*\(|\s+price|\s+for Admin|$)/i', $details, $m)) {
        $entityName = cleanDisplayAuditText(trim($m[1]));
    }
    if ($fieldChanged === '' && preg_match('/\((Product Name|Brand|Paint Type|Color|Price per Liter|New (?:Can|Container) Size\(s\)|Overall Threshold|Per-Size Thresholds[^)]*)\)/i', $details, $m)) {
        $fieldChanged = trim($m[1]);
    }

    // 4. Sales & Receipts
    if ($refNo === '' && preg_match('/\b(OR-\d{8}-\d+)\b/i', $details, $m)) {
        $refNo = strtoupper($m[1]);
    }
    if (($action === 'SALE' || $action === 'SALE_COMPLETE') && preg_match('/Completed sale\s+(OR-[A-Za-z0-9_-]+)\s+total\s+(?:₱|PHP\s*)?([\d,\.]+)/i', $details, $m)) {
        if ($refNo === '') $refNo = $m[1];
        if ($entityName === '') $entityName = 'Receipt ' . $m[1];
        if ($fieldChanged === '') $fieldChanged = 'Sale Transaction';
        $amt = '₱' . number_format((float)str_replace(',', '', $m[2]), 2);
        if ($newValue === '') $newValue = 'Completed (' . $amt . ')';
        $details = "Completed POS Sale {$m[1]} — Total: {$amt}";
    }

    // 5. Purchase Orders
    if ($refNo === '' && preg_match('/\b(PO-\d{8}-\d+)\b/i', $details, $m)) {
        $refNo = strtoupper($m[1]);
    }
    if ($refNo !== '' && strpos($refNo, 'PO-') === 0 && $entityName === '') {
        $entityName = $refNo;
    }
    if ($action === 'PO_APPROVE' && $fieldChanged === '') {
        $fieldChanged = 'Purchase Order Status';
        if ($oldValue === '') $oldValue = 'Pending Approval';
        if ($newValue === '') $newValue = 'Approved / Ordered';
    } elseif ($action === 'PO_CANCEL' && $fieldChanged === '') {
        $fieldChanged = 'Purchase Order Status';
        if ($oldValue === '') $oldValue = 'Pending / Ordered';
        if ($newValue === '') $newValue = 'Cancelled';
    } elseif (($action === 'PO_CREATE' || $action === 'PO_SUBMIT') && $fieldChanged === '') {
        $fieldChanged = 'Purchase Order Status';
        if ($oldValue === '') $oldValue = 'None';
        if ($newValue === '') $newValue = ($action === 'PO_SUBMIT') ? 'Pending Approval' : 'Created';
    }

    // 6. Stock Adjustments
    if ($refNo === '' && preg_match('/\b(ADJ-\d{4}-\d+)\b/i', $details, $m)) {
        $refNo = strtoupper($m[1]);
    }
    if ($refNo !== '' && strpos($refNo, 'ADJ-') === 0 && $entityName === '') {
        $entityName = $refNo;
    }

    // 7. Login / Logout
    if ($action === 'LOGIN' || $action === 'USER_LOGIN') {
        if ($entityName === '') $entityName = (string)($row['user_name'] ?? 'User Session');
        if ($fieldChanged === '') $fieldChanged = 'Authentication Session';
        if ($oldValue === '') $oldValue = 'Signed Out';
        if ($newValue === '') $newValue = 'Authenticated (Active Session)';
    } elseif ($action === 'LOGOUT' || $action === 'USER_LOGOUT') {
        if ($entityName === '') $entityName = (string)($row['user_name'] ?? 'User Session');
        if ($fieldChanged === '') $fieldChanged = 'Authentication Session';
        if ($oldValue === '') $oldValue = 'Authenticated (Active Session)';
        if ($newValue === '') $newValue = 'Signed Out';
    }

    // 8. User & Supplier updates
    if ($entityName === '' && preg_match('/(?:User|Created user|Updated user)\s+([A-Za-z0-9_.-]+)/i', $details, $m)) {
        $entityName = $m[1];
    }
    if ($entityName === '' && preg_match('/Supplier\s+(.+?)(?:\s+set to|$)/i', $details, $m)) {
        $entityName = trim($m[1]);
    }
    if (($action === 'USER_STATUS' || $action === 'SUPPLIER_STATUS') && preg_match('/set to (active|inactive)/i', $details, $m)) {
        $targetSt = ucfirst(strtolower($m[1]));
        if ($fieldChanged === '') $fieldChanged = ($action === 'USER_STATUS') ? 'Account Status' : 'Supplier Status';
        if ($newValue === '') $newValue = $targetSt;
        if ($oldValue === '') $oldValue = ($targetSt === 'Active') ? 'Inactive' : 'Active';
    }

    // 9. Stock Threshold Changes
    if ($action === 'STOCK_THRESHOLD_CHANGE') {
        if ($fieldChanged === '') $fieldChanged = 'Minimum Stock Threshold';
        if ($oldValue === '' && preg_match('/from\s+([\d\.]+\s*L(?:\s*\([^)]*\))?)\s+(?:to|➔|->)\s+([\d\.]+\s*L(?:\s*\([^)]*\))?)/i', $details, $m)) {
            $oldValue = $m[1];
            $newValue = $m[2];
        }
    }

    // 10. Container Size Added / Removed
    if ($action === 'CONTAINER_SIZE_ADD' || $action === 'CONTAINER_SIZE_REMOVE') {
        if ($fieldChanged === '') $fieldChanged = 'Container Sizes';
        if ($newValue === '' && preg_match('/(?:Added|Removed)\s+container\s+size\(s\)\s+([A-Za-z0-9_,\s]+?)\s+to/i', $details, $m)) {
            $newValue = trim($m[1]);
        }
    }

    // 11. Unauthorized Access Attempt
    if ($action === 'UNAUTHORIZED_ACCESS') {
        if ($fieldChanged === '') $fieldChanged = 'Module Navigation Access';
        if ($newValue === '') $newValue = 'Access Blocked';
        if ($oldValue === '' && preg_match('/by\s+.+?\s*\((staff|cashier|unauthenticated|[^\)]+)\)/i', $details, $m)) {
            $oldValue = 'Role: ' . $m[1];
        }
    }

    // 12. Stock Adjustments / Increase / Decrease
    if (in_array($action, ['STOCK_INCREASE', 'STOCK_DECREASE', 'STOCK_ADJUST'], true)) {
        if ($fieldChanged === '') {
            $fieldChanged = ($action === 'STOCK_ADJUST') ? 'Opened / Used Stock' : 'Sealed Stock Quantity';
        }
    }

    $cleanEntityName = cleanDisplayAuditText($entityName);
    $cleanDetails = cleanDisplayAuditText($details);

    $row['details'] = $details;
    $row['entity_name'] = $cleanEntityName !== '' ? $cleanEntityName : ($entity !== '' ? $entity : 'System');
    $row['field_changed'] = $fieldChanged;
    $row['old_value'] = $oldValue;
    $row['new_value'] = $newValue;
    $row['reference_no'] = $refNo;
    $row['reason'] = $reason;
    $row['meta'] = $meta;
    $row['category'] = getAuditActionCategory($action, $details);
    $row['display_entity'] = $cleanEntityName !== '' ? $cleanEntityName : ($entity !== '' ? $entity : 'System');
    $row['display_details'] = $cleanDetails;

    return $row;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // Section 10: Audit logs must be strictly append-only. Block PUT, PATCH, DELETE.
    if (!in_array($method, ['GET', 'POST'], true)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Forbidden: Audit logs are append-only and cannot be modified or deleted.'
        ]);
        exit;
    }

    $conn = getDBConnection();
    $conn->query("CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL,
        user_id VARCHAR(64) NULL,
        user_name VARCHAR(255) NULL,
        user_role VARCHAR(32) NULL,
        action VARCHAR(64) NOT NULL,
        entity VARCHAR(64) NULL,
        product_id VARCHAR(64) NULL,
        details TEXT NULL,
        ip_address VARCHAR(64) NULL,
        INDEX idx_created (created_at),
        INDEX idx_action (action),
        INDEX idx_user (user_name),
        INDEX idx_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Backwards-compatible non-destructive schema migration for detailed before/after value tracking
    $existingCols = [];
    $colRes = $conn->query("SHOW COLUMNS FROM audit_logs");
    if ($colRes) {
        while ($c = $colRes->fetch_assoc()) {
            $existingCols[$c['Field']] = true;
        }
    }

    $migrations = [
        'product_id'    => "ALTER TABLE audit_logs ADD COLUMN product_id VARCHAR(64) NULL AFTER entity",
        'entity_name'   => "ALTER TABLE audit_logs ADD COLUMN entity_name VARCHAR(255) NULL AFTER product_id",
        'field_changed' => "ALTER TABLE audit_logs ADD COLUMN field_changed VARCHAR(255) NULL AFTER entity_name",
        'old_value'     => "ALTER TABLE audit_logs ADD COLUMN old_value TEXT NULL AFTER field_changed",
        'new_value'     => "ALTER TABLE audit_logs ADD COLUMN new_value TEXT NULL AFTER old_value",
        'reference_no'  => "ALTER TABLE audit_logs ADD COLUMN reference_no VARCHAR(128) NULL AFTER new_value",
        'reason'        => "ALTER TABLE audit_logs ADD COLUMN reason TEXT NULL AFTER reference_no",
        'meta_json'     => "ALTER TABLE audit_logs ADD COLUMN meta_json LONGTEXT NULL AFTER reason",
        'event_key'     => "ALTER TABLE audit_logs ADD COLUMN event_key VARCHAR(128) NULL AFTER ip_address"
    ];
    foreach ($migrations as $colName => $alterSql) {
        if (!isset($existingCols[$colName])) {
            $conn->query($alterSql);
        }
    }

    if ($method === 'POST') {
        $d = json_decode(file_get_contents('php://input'), true) ?: [];

        // Reject any attempt to edit or delete existing audit records via POST payload
        if (!empty($d['deleteId']) || !empty($d['editId']) || !empty($d['clearAll']) || in_array(strtolower((string)($d['mode'] ?? '')), ['delete', 'update', 'edit', 'clear', 'truncate'], true)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Forbidden: Audit records are immutable and append-only.'
            ]);
            exit;
        }

        $now = date('Y-m-d H:i:s');
        $uid = substr(trim((string)($d['userId'] ?? '')), 0, 64);
        $uname = substr(trim((string)($d['userName'] ?? '')), 0, 255);
        $role = substr(trim((string)($d['userRole'] ?? '')), 0, 32);

        // Verify authenticated user details from users table when userId is known
        if ($uid !== '' && ($uname === '' || $role === '')) {
            $uSt = $conn->prepare("SELECT name, role FROM users WHERE id = ? LIMIT 1");
            if ($uSt) {
                $uSt->bind_param('s', $uid);
                $uSt->execute();
                $uRow = $uSt->get_result()->fetch_assoc();
                if ($uRow) {
                    if ($uname === '') $uname = substr((string)$uRow['name'], 0, 255);
                    if ($role === '') $role = substr((string)$uRow['role'], 0, 32);
                }
                $uSt->close();
            }
        }

        $action = substr(strtoupper(trim((string)($d['action'] ?? ''))), 0, 64);
        $entity = substr(trim((string)($d['entity'] ?? '')), 0, 64);
        $prodId = substr(trim((string)($d['productId'] ?? ($d['product_id'] ?? ''))), 0, 64);
        $details = sanitizeAuditText((string)($d['details'] ?? ''));
        $entityName = substr(sanitizeAuditText(trim((string)($d['entityName'] ?? ($d['entity_name'] ?? '')))), 0, 255);
        $fieldChanged = substr(sanitizeAuditText(trim((string)($d['fieldChanged'] ?? ($d['field_changed'] ?? '')))), 0, 255);
        $oldValue = isset($d['oldValue']) || isset($d['old_value']) ? sanitizeAuditText((string)($d['oldValue'] ?? $d['old_value'])) : null;
        $newValue = isset($d['newValue']) || isset($d['new_value']) ? sanitizeAuditText((string)($d['newValue'] ?? $d['new_value'])) : null;
        $refNo = substr(sanitizeAuditText(trim((string)($d['referenceNo'] ?? ($d['reference_no'] ?? '')))), 0, 128);
        $reason = isset($d['reason']) ? sanitizeAuditText(trim((string)$d['reason'])) : null;
        $eventKey = substr(trim((string)($d['eventKey'] ?? ($d['event_key'] ?? ''))), 0, 128);
        $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);

        $metaJson = null;
        if (!empty($d['meta']) && is_array($d['meta'])) {
            $metaJson = json_encode(sanitizeAuditMeta($d['meta']), JSON_UNESCAPED_UNICODE);
        }

        if ($action === '') {
            echo json_encode(['success' => false, 'error' => 'Missing action']);
            exit;
        }

        // Section 7: Transaction-safe Duplicate Event Prevention
        $conn->begin_transaction();
        try {
            // 1. Check explicit idempotency event_key if supplied
            if ($eventKey !== '') {
                $ekSt = $conn->prepare("SELECT id FROM audit_logs WHERE event_key = ? LIMIT 1");
                $ekSt->bind_param('s', $eventKey);
                $ekSt->execute();
                $ekRow = $ekSt->get_result()->fetch_assoc();
                $ekSt->close();
                if ($ekRow) {
                    $conn->commit();
                    echo json_encode(['success' => true, 'id' => (int)$ekRow['id'], 'deduplicated' => true]);
                    exit;
                }
            }

            // 2. Prevent rapid duplicate submissions (same user, action, entity, product, details within 5 seconds)
            $dupSt = $conn->prepare("SELECT id FROM audit_logs 
                WHERE COALESCE(user_id, '') = ? 
                  AND action = ? 
                  AND COALESCE(entity, '') = ? 
                  AND COALESCE(product_id, '') = ? 
                  AND COALESCE(details, '') = ? 
                  AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) <= 5
                ORDER BY id DESC LIMIT 1");
            $dupSt->bind_param('ssssss', $uid, $action, $entity, $prodId, $details, $now);
            $dupSt->execute();
            $dupRow = $dupSt->get_result()->fetch_assoc();
            $dupSt->close();
            if ($dupRow) {
                $conn->commit();
                echo json_encode(['success' => true, 'id' => (int)$dupRow['id'], 'deduplicated' => true]);
                exit;
            }

            // 3. Prevent duplicate consecutive PRODUCT_PRICE_CHANGE with the exact same price transition for the same product
            if ($action === 'PRODUCT_PRICE_CHANGE' && $prodId !== '') {
                $lastPriceSt = $conn->prepare("SELECT id, details, old_value, new_value FROM audit_logs 
                    WHERE action = 'PRODUCT_PRICE_CHANGE' AND product_id = ? 
                    ORDER BY id DESC LIMIT 1");
                $lastPriceSt->bind_param('s', $prodId);
                $lastPriceSt->execute();
                $lastPriceRow = $lastPriceSt->get_result()->fetch_assoc();
                $lastPriceSt->close();
                if ($lastPriceRow) {
                    $sameDetails = (trim((string)$lastPriceRow['details']) === trim($details));
                    $sameOldNew = ($oldValue !== null && $newValue !== null && (string)$lastPriceRow['old_value'] === (string)$oldValue && (string)$lastPriceRow['new_value'] === (string)$newValue);
                    if ($sameDetails || $sameOldNew) {
                        $conn->commit();
                        echo json_encode(['success' => true, 'id' => (int)$lastPriceRow['id'], 'deduplicated' => true]);
                        exit;
                    }
                }
            }

            $st = $conn->prepare("INSERT INTO audit_logs (
                created_at, user_id, user_name, user_role, action, entity, product_id,
                entity_name, field_changed, old_value, new_value, reference_no, reason, meta_json,
                details, ip_address, event_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ekParam = $eventKey !== '' ? $eventKey : null;
            $st->bind_param(
                'sssssssssssssssss',
                $now, $uid, $uname, $role, $action, $entity, $prodId,
                $entityName, $fieldChanged, $oldValue, $newValue, $refNo, $reason, $metaJson,
                $details, $ip, $ekParam
            );
            $st->execute();
            $newId = (int)$conn->insert_id;
            $st->close();
            $conn->commit();

            echo json_encode(['success' => true, 'id' => $newId]);
            exit;
        } catch (Throwable $txErr) {
            $conn->rollback();
            throw $txErr;
        }
    }

    // RBAC: Verify user role for accessing the Audit Log (Administrator Only)
    $reqUserId = trim((string)($_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? ''));
    $isAdminAuthorized = false;
    if ($reqUserId !== '') {
        $uChk = $conn->prepare("SELECT role, status FROM users WHERE id = ? LIMIT 1");
        if ($uChk) {
            $uChk->bind_param("s", $reqUserId);
            $uChk->execute();
            $uRow = $uChk->get_result()->fetch_assoc();
            $uChk->close();
            if ($uRow && $uRow['status'] === 'active' && $uRow['role'] === 'admin') {
                $isAdminAuthorized = true;
            }
        }
    }
    if (!$isAdminAuthorized) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Administrator privileges required to access Audit Log.']);
        exit;
    }

    // Build product lookup map so product_id can always resolve to human-readable name
    $productMap = [];
    $prodRes = $conn->query("SELECT id, product_id, name, product_name FROM products");
    if ($prodRes) {
        while ($pr = $prodRes->fetch_assoc()) {
            $pName = $pr['name'] ?: $pr['product_name'];
            if (!empty($pr['id'])) $productMap[$pr['id']] = $pName;
            if (!empty($pr['product_id'])) $productMap[$pr['product_id']] = $pName;
        }
    }

    // Build WHERE clauses for GET filtering
    $where = [];
    $types = '';
    $params = [];

    // Category filter (Section 6)
    $category = isset($_GET['category']) ? trim((string)$_GET['category']) : '';
    $categoryActionsMap = [
        'login_logout' => ['LOGIN', 'LOGOUT', 'USER_LOGIN', 'USER_LOGOUT'],
        'product_changes' => [
            'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_PRICE_CHANGE',
            'PRODUCT_DEACTIVATE', 'PRODUCT_REACTIVATE', 'PRODUCT_DISCONTINUE', 'PRODUCT_DELETE',
            'PRODUCT_STATUS', 'PRODUCT_REQUEST', 'PRODUCT_APPROVE', 'PRODUCT_REJECT',
            'PRODUCT_EDIT_REQUEST', 'PRODUCT_EDIT_APPROVE', 'PRODUCT_EDIT_REJECT', 'PRODUCT_EDIT_CANCEL',
            'PRODUCT_PRICE_REQUEST', 'PRODUCT_PRICE_APPROVE', 'PRODUCT_PRICE_REJECT',
            'PRODUCT_SIZE_APPROVE', 'PRODUCT_SIZE_REJECT', 'PRODUCT_BATCH_APPROVE',
            'SUPPLIER_CREATE', 'SUPPLIER_UPDATE', 'SUPPLIER_STATUS', 'SUPPLIER_DEACTIVATE', 'SUPPLIER_REACTIVATE'
        ],
        'stock_movements' => [
            'STOCK_RECEIVE', 'STOCK_ADJUST', 'STOCK_INCREASE', 'STOCK_DECREASE',
            'STOCK_THRESHOLD_CHANGE', 'CONTAINER_SIZE_ADD', 'CONTAINER_SIZE_REMOVE',
            'ADJ_REQUEST_SUBMIT', 'ADJ_REQUEST_APPROVE', 'ADJ_REQUEST_REJECT', 'ADJ_BATCH_APPROVE',
            'STOCK_DISPOSE_OPENED'
        ],
        'purchase_orders' => [
            'PO_CREATE', 'PO_SUBMIT', 'PO_APPROVE', 'PO_REJECT',
            'PO_RECEIVE', 'PO_PARTIAL_RECEIVE', 'PO_CANCEL', 'PO_BATCH_APPROVE'
        ],
        'sales_transactions' => ['SALE', 'SALE_COMPLETE', 'RECEIPT_GENERATED', 'SALE_VOID'],
        'returns_refunds' => ['SALE_REFUND', 'PARTIAL_REFUND', 'SALE_RETURN', 'SALE_EXCHANGE'],
        'user_management' => [
            'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_REACTIVATE',
            'USER_ROLE_CHANGE', 'USER_STATUS', 'USER_DELETE'
        ],
        'security_events' => [
            'LOGIN', 'LOGOUT', 'USER_LOGIN', 'USER_LOGOUT',
            'LOGIN_FAILED', 'FAILED_LOGIN', 'PASSWORD_CHANGE', 'UNAUTHORIZED_ACCESS'
        ],
        'color_mixing' => ['MIXING_START', 'MIXING_COMPLETE', 'MIXING_CANCEL', 'COLOR_MIX']
    ];

    if ($category !== '' && isset($categoryActionsMap[$category])) {
        $actList = $categoryActionsMap[$category];
        $placeholders = implode(',', array_fill(0, count($actList), '?'));
        $where[] = "action IN ($placeholders)";
        $types .= str_repeat('s', count($actList));
        foreach ($actList as $actItem) {
            $params[] = $actItem;
        }
    }

    // Specific action filter (supports aliases for historical records)
    if (!empty($_GET['action'])) {
        $reqAction = strtoupper(trim((string)$_GET['action']));
        if ($reqAction === 'SALE' || $reqAction === 'SALE_COMPLETE') {
            $where[] = "action IN ('SALE', 'SALE_COMPLETE')";
        } elseif ($reqAction === 'PRODUCT_DEACTIVATE') {
            $where[] = "(action = 'PRODUCT_DEACTIVATE' OR (action = 'PRODUCT_STATUS' AND details LIKE '%inactive%'))";
        } elseif ($reqAction === 'PRODUCT_REACTIVATE') {
            $where[] = "(action = 'PRODUCT_REACTIVATE' OR (action = 'PRODUCT_STATUS' AND details LIKE '%set to active%'))";
        } elseif ($reqAction === 'USER_DEACTIVATE') {
            $where[] = "(action = 'USER_DEACTIVATE' OR (action = 'USER_STATUS' AND details LIKE '%inactive%'))";
        } elseif ($reqAction === 'USER_REACTIVATE') {
            $where[] = "(action = 'USER_REACTIVATE' OR (action = 'USER_STATUS' AND details LIKE '%set to active%'))";
        } else {
            $where[] = 'action = ?';
            $types .= 's';
            $params[] = $reqAction;
        }
    }

    // User filter (supports partial search by user name, role, or user_id)
    if (!empty($_GET['user'])) {
        $userQ = '%' . trim((string)$_GET['user']) . '%';
        $where[] = '(user_name LIKE ? OR user_role LIKE ? OR user_id LIKE ?)';
        $types .= 'sss';
        $params[] = $userQ;
        $params[] = $userQ;
        $params[] = $userQ;
    }

    // Search query filter (supports multi-keyword search across details, entity, entity_name, reference, user, values)
    if (!empty($_GET['q'])) {
        $keywords = preg_split('/\s+/', trim((string)$_GET['q']));
        foreach ($keywords as $kw) {
            $kw = trim($kw);
            if ($kw === '') continue;
            $like = '%' . $kw . '%';
            $where[] = '(details LIKE ? OR entity LIKE ? OR COALESCE(entity_name, \'\') LIKE ? OR COALESCE(product_id, \'\') LIKE ? OR COALESCE(reference_no, \'\') LIKE ? OR COALESCE(user_name, \'\') LIKE ? OR action LIKE ? OR COALESCE(old_value, \'\') LIKE ? OR COALESCE(new_value, \'\') LIKE ? OR COALESCE(reason, \'\') LIKE ?)';
            $types .= 'ssssssssss';
            for ($i = 0; $i < 10; $i++) {
                $params[] = $like;
            }
        }
    }

    // Keep a copy of non-date filters so "Entries Today" can be accurately computed even if viewing a wider period
    $nonDateWhere = $where;
    $nonDateTypes = $types;
    $nonDateParams = $params;

    // Date range filter
    $from = (!empty($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'])) ? $_GET['from'] : null;
    $to = (!empty($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'])) ? $_GET['to'] : null;
    if ($from && $to && $from > $to) {
        $tmp = $from;
        $from = $to;
        $to = $tmp;
    }
    if ($from) {
        $where[] = 'created_at >= ?';
        $types .= 's';
        $params[] = $from . ' 00:00:00';
    }
    if ($to) {
        $where[] = 'created_at <= ?';
        $types .= 's';
        $params[] = $to . ' 23:59:59';
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    // 1. Calculate total matching records and aggregate summary stats on the server
    $todayDate = date('Y-m-d');
    $countSql = "SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) AS today_in_period,
        COUNT(DISTINCT CASE WHEN user_name IS NOT NULL AND user_name != '' THEN user_name ELSE NULL END) AS active_users,
        SUM(CASE WHEN action IN ('SALE', 'SALE_COMPLETE') THEN 1 ELSE 0 END) AS sales_count
        FROM audit_logs" . $whereSql;
    $countSt = $conn->prepare($countSql);
    $countTypes = 's' . $types;
    $countParams = array_merge([$todayDate], $params);
    $countSt->bind_param($countTypes, ...$countParams);
    $countSt->execute();
    $statsRow = $countSt->get_result()->fetch_assoc() ?: [];
    $countSt->close();

    $total = (int)($statsRow['total'] ?? 0);
    $todayCount = (int)($statsRow['today_in_period'] ?? 0);

    // If the date range includes today (or no date range), today_in_period is exact.
    // Also compute today's count across non-date filters so "Entries Today" is always accurate for today.
    $todayWhere = $nonDateWhere;
    $todayWhere[] = 'DATE(created_at) = ?';
    $todaySql = 'SELECT COUNT(*) AS cnt FROM audit_logs WHERE ' . implode(' AND ', $todayWhere);
    $todaySt = $conn->prepare($todaySql);
    $todayBindTypes = $nonDateTypes . 's';
    $todayBindParams = array_merge($nonDateParams, [$todayDate]);
    $todaySt->bind_param($todayBindTypes, ...$todayBindParams);
    $todaySt->execute();
    $todayGlobalRow = $todaySt->get_result()->fetch_assoc() ?: [];
    $todaySt->close();
    $todayGlobalCount = (int)($todayGlobalRow['cnt'] ?? 0);

    // Total records in the entire audit_logs table (unfiltered)
    $dbTotalRow = $conn->query("SELECT COUNT(*) AS cnt FROM audit_logs")->fetch_assoc();
    $dbTotal = (int)($dbTotalRow['cnt'] ?? 0);

    // 2. Apply server-side LIMIT and OFFSET pagination
    $isExport = !empty($_GET['export']);
    $defaultLimit = $isExport ? 50000 : 10;
    $limit = isset($_GET['limit']) ? min(50000, max(1, (int)$_GET['limit'])) : $defaultLimit;
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $totalPages = max(1, (int)ceil($total / $limit));
    if ($page > $totalPages) {
        $page = $totalPages;
    }
    $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : (($page - 1) * $limit);

    $sql = 'SELECT * FROM audit_logs' . $whereSql . ' ORDER BY id DESC LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;
    $st = $conn->prepare($sql);
    if ($params) {
        $st->bind_param($types, ...$params);
    }
    $st->execute();
    $rawRows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    $st->close();

    $rows = array_map(function ($r) use ($productMap) {
        return enrichAuditRow($r, $productMap);
    }, $rawRows);

    echo json_encode([
        'success' => true,
        'logs' => $rows,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'offset' => $offset,
        'totalPages' => $totalPages,
        'stats' => [
            'total' => $total,
            'dbTotal' => $dbTotal,
            'today' => $todayGlobalCount,
            'todayInPeriod' => $todayCount,
            'users' => (int)($statsRow['active_users'] ?? 0),
            'sales' => (int)($statsRow['sales_count'] ?? 0)
        ]
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

<?php
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/database.php';

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true) ?: [];

// Resolve authenticated user & role
$sessionUserId = $_SESSION['user_id'] ?? null;
$clientUser = $payload['currentUser'] ?? null;
$actingUserId = (string)($sessionUserId ?: ($clientUser['id'] ?? ''));
$actingRole = (string)($clientUser['role'] ?? '');
$actingUser = null;

if ($actingUserId !== '') {
    $uStmt = $conn->prepare("SELECT id, username, name, role, status FROM users WHERE id = ? LIMIT 1");
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
            $actingUser = $uRow;
        }
        $uStmt->close();
    }
}

if (!$actingUser) {
    // If not authenticated, reject
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required.']);
    exit;
}

$action = $_GET['action'] ?? ($payload['action'] ?? '');

// Helper to log audit event
function writeAuditEvent($conn, $userId, $userName, $userRole, $action, $entity, $details, $refNo, $oldVal, $newVal, $reason = '', $meta = []) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $metaJson = !empty($meta) ? json_encode($meta) : null;
    $stmt = $conn->prepare("INSERT INTO audit_logs (created_at, user_id, user_name, user_role, action, entity, details, reference_no, old_value, new_value, reason, meta_json, ip_address)
        VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if ($stmt) {
        $stmt->bind_param("ssssssssssss", $userId, $userName, $userRole, $action, $entity, $details, $refNo, $oldVal, $newVal, $reason, $metaJson, $ip);
        $stmt->execute();
        $stmt->close();
    }
}

// -------------------------------------------------------------
// Action 1: Cashier Submit Void Request
// -------------------------------------------------------------
if ($action === 'submit_request') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    $saleId = trim((string)($payload['saleId'] ?? $payload['sale_id'] ?? ''));
    $reason = trim((string)($payload['reason'] ?? ''));
    $explanation = trim((string)($payload['explanation'] ?? ''));

    if ($saleId === '' || $reason === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Sale ID and void reason are required.']);
        exit;
    }

    if ($reason === 'Other' && $explanation === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide an explanation for reason "Other".']);
        exit;
    }

    // Fetch sale
    $stmt = $conn->prepare("SELECT * FROM sales WHERE id = ? LIMIT 1");
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error.']);
        exit;
    }
    $stmt->bind_param("s", $saleId);
    $stmt->execute();
    $res = $stmt->get_result();
    $sale = $res->fetch_assoc();
    $stmt->close();

    if (!$sale) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Sale transaction not found.']);
        exit;
    }

    // RBAC: Cashiers can only submit void requests for their own sales
    if ($actingRole === 'cashier') {
        $cashierId = (string)($sale['cashier_id'] ?? '');
        $cashierName = (string)($sale['cashier_name'] ?? '');
        $isOwner = ($cashierId === $actingUser['id']) || ($cashierId === '' && strcasecmp($cashierName, $actingUser['name']) === 0);
        if (!$isOwner) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied: You cannot void transactions of other cashiers.']);
            exit;
        }
    }

    $currentStatus = strtolower(trim((string)$sale['status']));
    if ($currentStatus === 'voided' || $currentStatus === 'void') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'This transaction has already been voided.']);
        exit;
    }

    if ($currentStatus === 'pending void approval' || $currentStatus === 'pending_void') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A void request for this receipt is already pending Admin approval.']);
        exit;
    }

    $refundTotal = (float)($sale['refund_total'] ?? 0);
    $returns = json_decode($sale['returns_json'] ?? '[]', true) ?: [];
    if ($currentStatus === 'refunded' || $refundTotal > 0 || count($returns) > 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Cannot void a transaction that already has returns or exchanges processed.']);
        exit;
    }

    // Check for existing pending request in void_requests table
    $chkStmt = $conn->prepare("SELECT id FROM void_requests WHERE sale_id = ? AND status = 'pending' LIMIT 1");
    if ($chkStmt) {
        $chkStmt->bind_param("s", $saleId);
        $chkStmt->execute();
        $chkRes = $chkStmt->get_result();
        if ($chkRes->num_rows > 0) {
            $chkStmt->close();
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'A pending void request already exists for this receipt.']);
            exit;
        }
        $chkStmt->close();
    }

    $conn->begin_transaction();
    try {
        $voidReqId = 'vr_' . bin2hex(random_bytes(6));
        $now = date('Y-m-d H:i:s');
        $cashierName = $actingUser['name'];
        $receiptNo = (string)$sale['receipt_no'];
        $total = (float)$sale['total'];
        $itemsJson = $sale['items_json'];

        // 1. Insert into void_requests
        $vrStmt = $conn->prepare("INSERT INTO void_requests (id, sale_id, receipt_no, date, cashier_id, cashier_name, reason, explanation, total, items_json, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())");
        $vrStmt->bind_param("ssssssssds", $voidReqId, $saleId, $receiptNo, $now, $actingUser['id'], $cashierName, $reason, $explanation, $total, $itemsJson);
        $vrStmt->execute();
        $vrStmt->close();

        // 2. Update sale status to Pending Void Approval
        $upStmt = $conn->prepare("UPDATE sales SET status = 'Pending Void Approval', void_request_id = ?, void_reason = ?, void_explanation = ?, void_requested_at = ?, void_requested_by = ? WHERE id = ?");
        $upStmt->bind_param("ssssss", $voidReqId, $reason, $explanation, $now, $cashierName, $saleId);
        $upStmt->execute();
        $upStmt->close();

        // 3. Log audit event
        writeAuditEvent(
            $conn,
            $actingUser['id'],
            $actingUser['name'],
            $actingRole,
            'SALE_VOID_REQUEST',
            "Receipt {$receiptNo}",
            "Void request submitted by {$cashierName} for receipt {$receiptNo} (Total: {$total}) — Reason: {$reason}. Awaiting Admin approval.",
            $receiptNo,
            'Completed',
            'Pending Void Approval',
            $reason,
            [
                'receiptNo' => $receiptNo,
                'cashierId' => $actingUser['id'],
                'cashierName' => $cashierName,
                'total' => $total,
                'voidRequestId' => $voidReqId,
                'reason' => $reason,
                'explanation' => $explanation
            ]
        );

        $conn->commit();
        echo json_encode([
            'success' => true,
            'message' => "Void request for Receipt {$receiptNo} submitted successfully.",
            'voidRequestId' => $voidReqId,
            'requestId' => $voidReqId
        ]);
        exit;
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

// -------------------------------------------------------------
// Action 2: Admin Approve Void Request
// -------------------------------------------------------------
if ($action === 'approve_request') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    // Security & Authorization: Only Administrators can approve void requests
    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Only authorized Administrators can approve void requests.']);
        exit;
    }

    $voidReqId = trim((string)($payload['voidRequestId'] ?? $payload['requestId'] ?? $payload['id'] ?? ''));
    $adminRemarks = trim((string)($payload['adminRemarks'] ?? $payload['remarks'] ?? ''));

    if ($voidReqId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Void Request ID is required.']);
        exit;
    }

    $conn->begin_transaction();

    try {
        // Lock void request row for update
        $vrStmt = $conn->prepare("SELECT * FROM void_requests WHERE id = ? FOR UPDATE");
        $vrStmt->bind_param("s", $voidReqId);
        $vrStmt->execute();
        $vr = $vrStmt->get_result()->fetch_assoc();
        $vrStmt->close();

        if (!$vr) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Void request not found.']);
            exit;
        }

        if ($vr['status'] === 'approved' || (int)$vr['inventory_restored'] === 1) {
            $conn->rollback();
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'This void request has already been approved and inventory restored.']);
            exit;
        }

        $saleId = (string)$vr['sale_id'];
        $sStmt = $conn->prepare("SELECT * FROM sales WHERE id = ? FOR UPDATE");
        $sStmt->bind_param("s", $saleId);
        $sStmt->execute();
        $sale = $sStmt->get_result()->fetch_assoc();
        $sStmt->close();

        if (!$sale) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Referenced sale transaction not found.']);
            exit;
        }

        if ($sale['status'] === 'Voided' || (int)($sale['void_inventory_restored'] ?? 0) === 1) {
            $conn->rollback();
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Sale transaction is already voided and inventory restored.']);
            exit;
        }

        $receiptNo = (string)$sale['receipt_no'];
        $items = json_decode($sale['items_json'] ?? '[]', true) ?: [];
        $adminName = $actingUser['name'];
        $now = date('Y-m-d H:i:s');
        $revertSummary = [];

        // 1. Revert Inventory: Restores eligible quantities exactly once
        foreach ($items as $item) {
            $itemType = $item['type'] ?? 'product';

            if ($itemType === 'product') {
                $productId = $item['productId'] ?? null;
                $size = (float)($item['size'] ?? 1);
                $qty = (int)($item['qty'] ?? 1);
                $litersRestored = round($qty * $size, 2);

                if ($productId) {
                    // Fetch product
                    $pStmt = $conn->prepare("SELECT id, name, stock, can_stock FROM products WHERE id = ? OR product_id = ? LIMIT 1");
                    $pStmt->bind_param("ss", $productId, $productId);
                    $pStmt->execute();
                    $product = $pStmt->get_result()->fetch_assoc();
                    $pStmt->close();

                    if ($product) {
                        $pDbId = $product['id'];
                        $beforeStock = (float)$product['stock'];
                        $newStock = round($beforeStock + $litersRestored, 2);

                        // Parse and update can_stock
                        $canStockMap = [];
                        if (!empty($product['can_stock'])) {
                            $decoded = json_decode($product['can_stock'], true);
                            if (is_array($decoded)) $canStockMap = $decoded;
                        }
                        $sizeKey = (string)$size;
                        $beforeCans = (int)($canStockMap[$sizeKey] ?? 0);
                        $afterCans = $beforeCans + $qty;
                        $canStockMap[$sizeKey] = $afterCans;
                        $newCanStockJson = json_encode($canStockMap);

                        // Update product stock and can_stock
                        $upP = $conn->prepare("UPDATE products SET stock = ?, can_stock = ? WHERE id = ?");
                        $upP->bind_param("dss", $newStock, $newCanStockJson, $pDbId);
                        $upP->execute();
                        $upP->close();

                        // Resolve size_id from item or product_sizes
                        $sizeId = $item['sizeId'] ?? ($item['size_id'] ?? null);
                        if (!$sizeId) {
                            $psStmt = $conn->prepare("SELECT size_id FROM product_sizes WHERE (product_id = ? OR product_id = ?) AND container_size = ? LIMIT 1");
                            if ($psStmt) {
                                $psStmt->bind_param("ssd", $pDbId, $productId, $size);
                                $psStmt->execute();
                                $psRes = $psStmt->get_result();
                                if ($psRow = $psRes->fetch_assoc()) {
                                    $sizeId = $psRow['size_id'];
                                }
                                $psStmt->close();
                            }
                        }

                        // Update relational inventory table (sealed_quantity)
                        if ($sizeId) {
                            $upInv = $conn->prepare("UPDATE inventory SET sealed_quantity = sealed_quantity + ? WHERE size_id = ?");
                            if ($upInv) {
                                $upInv->bind_param("is", $qty, $sizeId);
                                $upInv->execute();
                                $upInv->close();
                            }
                        }

                        $revertSummary[] = "{$product['name']} ({$qty} × {$size}L)";

                        // Log movement
                        $mvId = 'mv_' . bin2hex(random_bytes(6));
                        $trailNote = "Void Sale Reversal ({$receiptNo}) [Reverted {$qty} × {$size}L · {$size}L Units: {$beforeCans}→{$afterCans}, Stock: {$beforeStock}L→{$newStock}L] · Reason: {$vr['reason']} (Auth: {$adminName})";
                        $mvStmt = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, qty_change, staff_name, note)
                            VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)");
                        if ($mvStmt) {
                            $mvStmt->bind_param("ssssdsdss", $mvId, $now, $pDbId, $sizeId, $size, $product['name'], $litersRestored, $adminName, $trailNote);
                            $mvStmt->execute();
                            $mvStmt->close();
                        }
                    }
                }
            } elseif ($itemType === 'colormix') {
                // Custom Color Mix rule: Do NOT return mixed paint to regular sealed inventory!
                // Record quarantine movement with qty_change = 0 per policy
                $mixLiters = (float)($item['liters'] ?? $item['qty'] ?? 1);
                $colorName = $item['colorName'] ?? ($item['name'] ?? 'Custom Mix');
                $revertSummary[] = "Quarantined Mix: {$colorName} ({$mixLiters}L)";

                $mvId = 'mv_' . bin2hex(random_bytes(6));
                $trailNote = "Void Sale Reversal ({$receiptNo}): {$mixLiters}L Custom Mix quarantined as miscast/defective stock. NOT restored to base sealed units. Reason: {$vr['reason']} (Auth: {$adminName})";
                $mvProdName = "Quarantined Custom Mix — {$colorName}";
                $zeroLiters = 0.0;
                $mvStmt = $conn->prepare("INSERT INTO movements (id, date, type, product_name, qty_change, staff_name, note)
                    VALUES (?, ?, 'adjustment', ?, ?, ?, ?)");
                if ($mvStmt) {
                    $mvStmt->bind_param("sssdsd", $mvId, $now, $mvProdName, $zeroLiters, $adminName, $trailNote);
                    $mvStmt->execute();
                    $mvStmt->close();
                }
            }
        }

        // 2. Update Void Request to Approved
        $upVr = $conn->prepare("UPDATE void_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, admin_remarks = ?, inventory_restored = 1 WHERE id = ?");
        $upVr->bind_param("ssss", $adminName, $now, $adminRemarks, $voidReqId);
        $upVr->execute();
        $upVr->close();

        // 3. Update Sale to Voided and mark inventory restored
        $upSale = $conn->prepare("UPDATE sales SET status = 'Voided', void_reason = ?, voided_at = ?, voided_by = ?, void_admin_remarks = ?, void_inventory_restored = 1 WHERE id = ?");
        $upSale->bind_param("sssss", $vr['reason'], $now, $adminName, $adminRemarks, $saleId);
        $upSale->execute();
        $upSale->close();

        // 4. Record Audit Log
        writeAuditEvent(
            $conn,
            $actingUser['id'],
            $actingUser['name'],
            $actingRole,
            'SALE_VOID_APPROVE',
            "Receipt {$receiptNo}",
            "Void request approved by Admin {$adminName} for receipt {$receiptNo} (Total: {$sale['total']}). Original sale reversed and eligible inventory restored: " . implode(', ', $revertSummary) . ". Remarks: {$adminRemarks}",
            $receiptNo,
            'Pending Void Approval',
            'Voided',
            $vr['reason'],
            [
                'receiptNo' => $receiptNo,
                'cashierName' => $vr['cashier_name'],
                'requestDate' => $vr['date'],
                'voidReason' => $vr['reason'],
                'explanation' => $vr['explanation'],
                'adminName' => $adminName,
                'approvalDate' => $now,
                'adminRemarks' => $adminRemarks,
                'revertSummary' => $revertSummary
            ]
        );

        $conn->commit();
        echo json_encode([
            'success' => true,
            'message' => "Receipt {$receiptNo} successfully voided and inventory restored.",
            'receiptNo' => $receiptNo
        ]);
        exit;
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

// -------------------------------------------------------------
// Action 3: Admin Reject Void Request
// -------------------------------------------------------------
if ($action === 'reject_request') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    // Security & Authorization: Only Administrators can reject void requests
    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Only authorized Administrators can reject void requests.']);
        exit;
    }

    $voidReqId = trim((string)($payload['voidRequestId'] ?? $payload['requestId'] ?? $payload['id'] ?? ''));
    $rejectionReason = trim((string)($payload['rejectionReason'] ?? $payload['rejectReason'] ?? $payload['reason'] ?? $payload['adminRemarks'] ?? ''));

    if ($voidReqId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Void Request ID is required.']);
        exit;
    }

    if ($rejectionReason === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Administrator rejection reason or note is required.']);
        exit;
    }

    $conn->begin_transaction();

    try {
        $vrStmt = $conn->prepare("SELECT * FROM void_requests WHERE id = ? FOR UPDATE");
        $vrStmt->bind_param("s", $voidReqId);
        $vrStmt->execute();
        $vr = $vrStmt->get_result()->fetch_assoc();
        $vrStmt->close();

        if (!$vr) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Void request not found.']);
            exit;
        }

        $saleId = (string)$vr['sale_id'];
        $sStmt = $conn->prepare("SELECT * FROM sales WHERE id = ? FOR UPDATE");
        $sStmt->bind_param("s", $saleId);
        $sStmt->execute();
        $sale = $sStmt->get_result()->fetch_assoc();
        $sStmt->close();

        if (!$sale) {
            $conn->rollback();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Referenced sale transaction not found.']);
            exit;
        }

        $receiptNo = (string)$sale['receipt_no'];
        $adminName = $actingUser['name'];
        $now = date('Y-m-d H:i:s');

        // 1. Update Void Request to Rejected
        $upVr = $conn->prepare("UPDATE void_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, admin_remarks = ? WHERE id = ?");
        $upVr->bind_param("ssss", $adminName, $now, $rejectionReason, $voidReqId);
        $upVr->execute();
        $upVr->close();

        // 2. Update Sale Status to Void Rejected (Keeps original completed sale & inventory intact)
        $upSale = $conn->prepare("UPDATE sales SET status = 'Void Rejected', void_admin_remarks = ?, void_rejected_at = ?, void_rejected_by = ? WHERE id = ?");
        $upSale->bind_param("ssss", $rejectionReason, $now, $adminName, $saleId);
        $upSale->execute();
        $upSale->close();

        // 3. Record Audit Log
        writeAuditEvent(
            $conn,
            $actingUser['id'],
            $actingUser['name'],
            $actingRole,
            'SALE_VOID_REJECT',
            "Receipt {$receiptNo}",
            "Void request rejected by Admin {$adminName} for receipt {$receiptNo} (Total: {$sale['total']}). Original sale kept as Completed. Rejection note: {$rejectionReason}",
            $receiptNo,
            'Pending Void Approval',
            'Void Rejected',
            $rejectionReason,
            [
                'receiptNo' => $receiptNo,
                'cashierName' => $vr['cashier_name'],
                'requestDate' => $vr['date'],
                'voidReason' => $vr['reason'],
                'explanation' => $vr['explanation'],
                'adminName' => $adminName,
                'rejectionDate' => $now,
                'adminRemarks' => $rejectionReason
            ]
        );

        $conn->commit();
        echo json_encode([
            'success' => true,
            'message' => "Void request for Receipt {$receiptNo} rejected. Original transaction preserved.",
            'receiptNo' => $receiptNo
        ]);
        exit;
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

// -------------------------------------------------------------
// Action 4: Get Pending Void Requests
// -------------------------------------------------------------
if ($action === 'get_pending' || $action === 'list') {
    $vres = $conn->query("SELECT * FROM void_requests WHERE status = 'pending' ORDER BY date DESC");
    $list = [];
    if ($vres) {
        while ($r = $vres->fetch_assoc()) {
            $items = json_decode($r['items_json'] ?? '[]', true) ?: [];
            $list[] = [
                'id' => $r['id'],
                'saleId' => $r['sale_id'],
                'receiptNo' => $r['receipt_no'],
                'date' => $r['date'],
                'cashierId' => $r['cashier_id'],
                'cashierName' => $r['cashier_name'],
                'reason' => $r['reason'],
                'explanation' => $r['explanation'] ?? '',
                'total' => (float)$r['total'],
                'items' => $items,
                'status' => $r['status']
            ];
        }
    }
    echo json_encode(['success' => true, 'voidRequests' => $list]);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'error' => 'Invalid action parameter.']);
exit;

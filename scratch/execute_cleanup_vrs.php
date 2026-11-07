<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$conn->begin_transaction();
try {
    // 1. Update approved sales
    $conn->query("UPDATE sales SET status = 'Voided', void_inventory_restored = 1, voided_by = 'Mike Revadulla', voided_at = '2026-11-08 04:43:31' WHERE receipt_no = 'OR-20261108-0126'");
    $conn->query("UPDATE sales SET status = 'Voided', void_inventory_restored = 1, voided_by = 'Mike Revadulla', voided_at = '2026-11-08 04:47:33' WHERE receipt_no = 'OR-20261108-0127'");
    $conn->query("UPDATE sales SET status = 'Voided', void_inventory_restored = 1, voided_by = 'Mike Revadulla', voided_at = '2026-11-08 04:48:27' WHERE receipt_no = 'OR-20261108-0128'");

    // 2. Keep OR-0129 as Pending Void Approval
    $conn->query("UPDATE sales SET status = 'Pending Void Approval', void_inventory_restored = 0 WHERE receipt_no = 'OR-20261108-0129'");

    // 3. Remove duplicate void request rows
    $conn->query("DELETE FROM void_requests WHERE id IN ('vr_e50bd679a914', 'vr_5f1270fbe97b', 'vr_a09b0bc60f7a', 'vr_3a43645d46c4')");

    // Ensure vr_mw6vkt19butzc is approved for OR-0128
    $conn->query("UPDATE void_requests SET status = 'approved', inventory_restored = 1, reviewed_by = 'Mike Revadulla', reviewed_at = '2026-11-08 04:48:27' WHERE receipt_no = 'OR-20261108-0128'");

    // 4. Correct PRD-001 stock to reflect 3 voided sales (restored) + 1 pending sale (1 can pending restoration)
    // Baseline: 166 cans, 333L. Minus 1 can for OR-0129 = 165 cans, 332L.
    $canStock = json_encode(["1" => 165, "2" => 5, "3" => 0, "4" => 9, "5" => 5, "8" => 0, "16" => 6]);
    $conn->query("UPDATE products SET stock = 332.00, can_stock = '$canStock' WHERE id = 'PRD-001'");
    $conn->query("UPDATE inventory SET sealed_quantity = 165 WHERE size_id = 'SZ-001'");

    $conn->commit();
    echo "Cleanup executed successfully!\n";
} catch (Throwable $e) {
    $conn->rollback();
    echo "Error: " . $e->getMessage() . "\n";
}


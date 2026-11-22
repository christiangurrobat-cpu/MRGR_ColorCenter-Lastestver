<?php
/**
 * Standalone Migration / Reconciliation Script:
 * Automatically Generate & Link Inventory Products for all Existing Base Color Library Entries.
 *
 * - Safe & idempotent: checks existing links and matching pigment products before creating.
 * - Preserves all existing regular paint products, stocks, batches, POs, formulas, and sales.
 * - Initializes newly created Pigment / Colorant products to 0.00 L stock (no fabricated batches or receiving).
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/color_library_lib.php';
require_once __DIR__ . '/../api/color_inventory_sync.php';

$conn = getDBConnection();
colorSyncEnsureSchema($conn, true);

$summary = colorSyncEnsureAllBaseColorsHaveProducts($conn, [
    'id' => 'system',
    'name' => 'System Migration',
    'role' => 'admin',
]);

echo "=== Base Color Library -> Inventory Reconciliation ===\n";
echo "Total Active Base Colors : {$summary['totalBaseColors']}\n";
echo "Already Linked           : {$summary['alreadyLinked']}\n";
echo "Linked to Existing Prod  : {$summary['linkedExisting']}\n";
echo "Newly Created Products   : {$summary['created']}\n";
if (!empty($summary['errors'])) {
    echo "Errors:\n";
    foreach ($summary['errors'] as $err) {
        echo "  - {$err}\n";
    }
    exit(1);
}
echo "Status                   : SUCCESS\n";
exit(0);

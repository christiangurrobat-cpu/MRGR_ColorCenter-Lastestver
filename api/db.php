<?php
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/database.php';
mrgrEnableGzip();

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';

require_once __DIR__ . '/batch_lib.php';
try { batchEnsureSchema($conn); } catch (Throwable $e) { error_log('Batch schema: ' . $e->getMessage()); }

require_once __DIR__ . '/color_library_lib.php';
try { colorLibraryEnsureSchema($conn); } catch (Throwable $e) { error_log('Color Library schema: ' . $e->getMessage()); }

require_once __DIR__ . '/color_inventory_sync.php';
try { colorSyncEnsureSchema($conn); } catch (Throwable $e) { error_log('Color Sync schema: ' . $e->getMessage()); }

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
        // Auto-migrate: nullable customer_name column on sales table
        $chkCustomerName = $conn->query("SHOW COLUMNS FROM sales LIKE 'customer_name'");
        if ($chkCustomerName && $chkCustomerName->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN customer_name VARCHAR(150) NULL DEFAULT NULL AFTER receipt_no");
        }

        // Auto-migrate: discount_pct and discount_amount on sales table (Automatic 10% discount promotion)
        $chkDiscountPct = $conn->query("SHOW COLUMNS FROM sales LIKE 'discount_pct'");
        if ($chkDiscountPct && $chkDiscountPct->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER subtotal");
        }
        // Auto-migrate: Admin-designated Base Paint flag & compatibility columns on products (for Color Mixing Studio)
        $chkIsBasePaint = $conn->query("SHOW COLUMNS FROM products LIKE 'is_base_paint'");
        if ($chkIsBasePaint && $chkIsBasePaint->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN is_base_paint TINYINT(1) NOT NULL DEFAULT 0 AFTER is_color_pigment");
        }
        $chkPaintSystem = $conn->query("SHOW COLUMNS FROM products LIKE 'paint_system'");
        if ($chkPaintSystem && $chkPaintSystem->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN paint_system VARCHAR(40) NOT NULL DEFAULT 'unverified' AFTER is_base_paint");
        }
        $chkSpecPig = $conn->query("SHOW COLUMNS FROM products LIKE 'is_specialty_pigment'");
        if ($chkSpecPig && $chkSpecPig->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN is_specialty_pigment TINYINT(1) NOT NULL DEFAULT 0 AFTER paint_system");
        }
        $chkAdminRev = $conn->query("SHOW COLUMNS FROM products LIKE 'admin_review_note'");
        if ($chkAdminRev && $chkAdminRev->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN admin_review_note VARCHAR(255) NULL DEFAULT NULL AFTER is_specialty_pigment");
        }
        $chkDiscountAmt = $conn->query("SHOW COLUMNS FROM sales LIKE 'discount_amount'");
        if ($chkDiscountAmt && $chkDiscountAmt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER discount_pct");
        }

        // Auto-migrate: payment_method, cash_tendered, change_amount on sales table (Cash only store policy)
        $chkPayMethod = $conn->query("SHOW COLUMNS FROM sales LIKE 'payment_method'");
        if ($chkPayMethod && $chkPayMethod->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash' AFTER status");
        }
        $chkCashTendered = $conn->query("SHOW COLUMNS FROM sales LIKE 'cash_tendered'");
        if ($chkCashTendered && $chkCashTendered->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN cash_tendered DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER payment_method");
        }
        $chkChangeAmt = $conn->query("SHOW COLUMNS FROM sales LIKE 'change_amount'");
        if ($chkChangeAmt && $chkChangeAmt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cash_tendered");
        }

        // Auto-migrate: cashier_id column on sales table and backfill
        $chkCashierId = $conn->query("SHOW COLUMNS FROM sales LIKE 'cashier_id'");
        if ($chkCashierId && $chkCashierId->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN cashier_id VARCHAR(50) NULL AFTER date");
            $conn->query("ALTER TABLE sales ADD INDEX idx_sales_cashier_id (cashier_id)");
        }
        // Backfill existing sales transactions matching cashier_name to users
        $conn->query("UPDATE sales s JOIN users u ON (s.cashier_name = u.name OR s.cashier_name = u.username) SET s.cashier_id = u.id WHERE s.cashier_id IS NULL OR s.cashier_id = ''");
        // Fallback: any sales matching 'Mike Revadulla' or 'admin' ensure u1
        $conn->query("UPDATE sales SET cashier_id = 'u1' WHERE (cashier_name LIKE '%Mike%' OR cashier_name LIKE '%Admin%') AND (cashier_id IS NULL OR cashier_id = '')");
        // Fallback: any sales matching 'Ana Cruz' or 'cashier' ensure u2
        $conn->query("UPDATE sales SET cashier_id = 'u2' WHERE (cashier_name LIKE '%Ana%' OR cashier_name LIKE '%Cruz%') AND (cashier_id IS NULL OR cashier_id = '')");

        // Ensure second cashier exists for multi-cashier testing/RBAC
        $chkC2 = $conn->query("SELECT id FROM users WHERE username = 'cashier2' OR id = 'u4' LIMIT 1");
        if ($chkC2 && $chkC2->num_rows === 0) {
            $c2Hash = password_hash('cashier123', PASSWORD_BCRYPT);
            $conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES ('u4', 'cashier2', '$c2Hash', 'Maria Santos', 'cashier', 'active', NOW())");
        }

        // Auto-migrate: void_reason, voided_at, voided_by on sales table
        $chkVoidReason = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_reason'");
        if ($chkVoidReason && $chkVoidReason->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_reason TEXT NULL AFTER change_amount");
        }
        $chkVoidedAt = $conn->query("SHOW COLUMNS FROM sales LIKE 'voided_at'");
        if ($chkVoidedAt && $chkVoidedAt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN voided_at DATETIME NULL AFTER void_reason");
        }
        $chkVoidedBy = $conn->query("SHOW COLUMNS FROM sales LIKE 'voided_by'");
        if ($chkVoidedBy && $chkVoidedBy->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN voided_by VARCHAR(150) NULL AFTER voided_at");
        }
        $chkVRId = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_request_id'");
        if ($chkVRId && $chkVRId->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_request_id VARCHAR(50) NULL AFTER voided_by");
        }
        $chkVoidExpl = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_explanation'");
        if ($chkVoidExpl && $chkVoidExpl->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_explanation TEXT NULL AFTER void_request_id");
        }
        $chkVoidReqAt = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_requested_at'");
        if ($chkVoidReqAt && $chkVoidReqAt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_requested_at DATETIME NULL AFTER void_explanation");
        }
        $chkVoidReqBy = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_requested_by'");
        if ($chkVoidReqBy && $chkVoidReqBy->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_requested_by VARCHAR(150) NULL AFTER void_requested_at");
        }
        $chkVoidAdminRem = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_admin_remarks'");
        if ($chkVoidAdminRem && $chkVoidAdminRem->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_admin_remarks TEXT NULL AFTER void_requested_by");
        }
        $chkVoidRejAt = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_rejected_at'");
        if ($chkVoidRejAt && $chkVoidRejAt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_rejected_at DATETIME NULL AFTER void_admin_remarks");
        }
        $chkVoidRejBy = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_rejected_by'");
        if ($chkVoidRejBy && $chkVoidRejBy->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_rejected_by VARCHAR(150) NULL AFTER void_rejected_at");
        }
        $chkVoidInvRest = $conn->query("SHOW COLUMNS FROM sales LIKE 'void_inventory_restored'");
        if ($chkVoidInvRest && $chkVoidInvRest->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN void_inventory_restored TINYINT(1) NOT NULL DEFAULT 0 AFTER void_rejected_by");
        }

        // Auto-migrate: void_requests table
        $conn->query("CREATE TABLE IF NOT EXISTS void_requests (
            id VARCHAR(50) PRIMARY KEY,
            sale_id VARCHAR(50) NOT NULL,
            receipt_no VARCHAR(50) NOT NULL,
            date DATETIME NOT NULL,
            cashier_id VARCHAR(50) NOT NULL,
            cashier_name VARCHAR(150) NOT NULL,
            reason VARCHAR(255) NOT NULL,
            explanation TEXT NULL,
            total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            items_json LONGTEXT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            reviewed_by VARCHAR(150) NULL,
            reviewed_at DATETIME NULL,
            admin_remarks TEXT NULL,
            inventory_restored TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_vr_sale_id (sale_id),
            INDEX idx_vr_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
        // Auto-migrate: color_hex and formula_json on movements table for Color Mixing Service
        $chkMvHex = $conn->query("SHOW COLUMNS FROM movements LIKE 'color_hex'");
        if ($chkMvHex && $chkMvHex->num_rows === 0) {
            $conn->query("ALTER TABLE movements ADD COLUMN color_hex VARCHAR(20) NULL AFTER product_name");
        }
        $chkMvFormula = $conn->query("SHOW COLUMNS FROM movements LIKE 'formula_json'");
        if ($chkMvFormula && $chkMvFormula->num_rows === 0) {
            $conn->query("ALTER TABLE movements ADD COLUMN formula_json LONGTEXT NULL AFTER note");
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

        // Referential integrity healing: reconcile movements with product_sizes and products
        $conn->query("UPDATE movements m JOIN product_sizes ps ON m.size_id = ps.size_id SET m.product_id = ps.product_id WHERE m.product_id != ps.product_id OR m.product_id IS NULL OR m.product_id = ''");
        $conn->query("UPDATE movements m JOIN products p ON (m.product_id = p.id OR m.product_id = p.product_id) SET m.product_name = p.name WHERE (m.product_name = 'Unknown product' OR m.product_name = '' OR m.product_name = '0') AND m.type != 'colormix'");

        // Auto-migrate: settings table for application configuration
        $conn->query("CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(100) PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Auto-seed default Philippine 12% VAT settings if missing
        $chkSet = $conn->query("SELECT setting_key FROM settings WHERE setting_key = 'vat_settings' LIMIT 1");
        if ($chkSet && $chkSet->num_rows === 0) {
            $defaultVat = json_encode([
                'taxStatus' => 'vat_registered',
                'pricingType' => 'inclusive',
                'vatRate' => 12.00
            ]);
            $conn->query("INSERT INTO settings (setting_key, setting_value) VALUES ('vat_settings', '$defaultVat')");
        }

        // Auto-migrate: Philippine VAT columns on sales table
        $chkVatRate = $conn->query("SHOW COLUMNS FROM sales LIKE 'vat_rate'");
        if ($chkVatRate && $chkVatRate->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN vat_rate DECIMAL(5,2) NOT NULL DEFAULT 12.00 AFTER change_amount");
        }
        $chkVatableSales = $conn->query("SHOW COLUMNS FROM sales LIKE 'vatable_sales'");
        if ($chkVatableSales && $chkVatableSales->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN vatable_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vat_rate");
        }
        $chkVatAmount = $conn->query("SHOW COLUMNS FROM sales LIKE 'vat_amount'");
        if ($chkVatAmount && $chkVatAmount->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vatable_sales");
        }
        $chkVatExempt = $conn->query("SHOW COLUMNS FROM sales LIKE 'vat_exempt_sales'");
        if ($chkVatExempt && $chkVatExempt->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN vat_exempt_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vat_amount");
        }
        $chkZeroRated = $conn->query("SHOW COLUMNS FROM sales LIKE 'zero_rated_sales'");
        if ($chkZeroRated && $chkZeroRated->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN zero_rated_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vat_exempt_sales");
        }
        $chkTaxStatus = $conn->query("SHOW COLUMNS FROM sales LIKE 'tax_status'");
        if ($chkTaxStatus && $chkTaxStatus->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN tax_status VARCHAR(50) NOT NULL DEFAULT 'vat_registered' AFTER zero_rated_sales");
        }
        $chkPricingType = $conn->query("SHOW COLUMNS FROM sales LIKE 'pricing_type'");
        if ($chkPricingType && $chkPricingType->num_rows === 0) {
            $conn->query("ALTER TABLE sales ADD COLUMN pricing_type VARCHAR(50) NOT NULL DEFAULT 'inclusive' AFTER tax_status");
        }

        // Auto-migrate: tax_classification on products table (vatable, exempt, zero_rated)
        $chkTaxClass = $conn->query("SHOW COLUMNS FROM products LIKE 'tax_classification'");
        if ($chkTaxClass && $chkTaxClass->num_rows === 0) {
            $conn->query("ALTER TABLE products ADD COLUMN tax_classification VARCHAR(50) NOT NULL DEFAULT 'vatable' AFTER category");
        }

        // Auto-migrate: product_suppliers table for multi-supplier support per product & container size
        $conn->query("CREATE TABLE IF NOT EXISTS `product_suppliers` (
            `id` VARCHAR(50) NOT NULL PRIMARY KEY,
            `product_id` VARCHAR(50) NOT NULL,
            `supplier_id` VARCHAR(50) NOT NULL,
            `container_size` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `purchase_cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `min_order_qty` INT NOT NULL DEFAULT 10,
            `availability` VARCHAR(50) NOT NULL DEFAULT 'available',
            `notes` VARCHAR(255) NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY `uk_prod_supp_size` (`product_id`, `supplier_id`, `container_size`),
            INDEX `idx_ps_product` (`product_id`),
            INDEX `idx_ps_supplier` (`supplier_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Auto-migrate: purchase_order_items table
        $conn->query("CREATE TABLE IF NOT EXISTS `purchase_order_items` (
            `id` VARCHAR(50) NOT NULL PRIMARY KEY,
            `po_id` VARCHAR(50) NOT NULL,
            `product_id` VARCHAR(50) NOT NULL,
            `product_name` VARCHAR(200) NOT NULL DEFAULT '',
            `brand` VARCHAR(100) NULL,
            `color` VARCHAR(100) NULL,
            `size_id` VARCHAR(50) NULL,
            `container_size` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `quantity` INT NOT NULL DEFAULT 0,
            `received_quantity` INT NOT NULL DEFAULT 0,
            `unit_cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `total_cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            `supplier_id` VARCHAR(50) NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_poi_po` (`po_id`),
            INDEX `idx_poi_supplier` (`supplier_id`),
            INDEX `idx_poi_product` (`product_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Auto-migrate: convert any plaintext passwords in users table to bcrypt hashes
        try {
            $uRes = $conn->query("SELECT id, password FROM users");
            if ($uRes) {
                while ($uRow = $uRes->fetch_assoc()) {
                    $p = (string)$uRow['password'];
                    if ($p !== '' && !preg_match('/^\$2[ayb]\$\d{2}\$/', $p)) {
                        $h = password_hash($p, PASSWORD_BCRYPT);
                        $up = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
                        if ($up) {
                            $up->bind_param("ss", $h, $uRow['id']);
                            $up->execute();
                            $up->close();
                        }
                    }
                }
            }
        } catch (Throwable $e) {}

        // Auto-migrate: heal empty or duplicate receipt_no values in sales table
        try {
            $sRes = $conn->query("SELECT id, receipt_no, date FROM sales ORDER BY date ASC, id ASC");
            if ($sRes) {
                $seenReceipts = [];
                $maxSeq = $sRes->num_rows;
                $rowsToFix = [];
                while ($sRow = $sRes->fetch_assoc()) {
                    $rn = trim((string)($sRow['receipt_no'] ?? ''));
                    if ($rn !== '' && preg_match('/^OR-\d{8}-(\d+)$/i', $rn, $m)) {
                        $seqNum = (int)$m[1];
                        if ($seqNum > $maxSeq) $maxSeq = $seqNum;
                    }
                    $upperRn = strtoupper($rn);
                    if ($rn === '' || isset($seenReceipts[$upperRn])) {
                        $rowsToFix[] = $sRow;
                    } else {
                        $seenReceipts[$upperRn] = true;
                    }
                }
                if (!empty($rowsToFix)) {
                    $upSaleRn = $conn->prepare("UPDATE sales SET receipt_no = ? WHERE id = ?");
                    if ($upSaleRn) {
                        $seqIdx = 1;
                        foreach ($rowsToFix as $fixRow) {
                            $ts = strtotime((string)($fixRow['date'] ?? ''));
                            $datePart = ($ts !== false) ? date('Ymd', $ts) : date('Ymd');
                            do {
                                $cand = sprintf('OR-%s-%04d', $datePart, $seqIdx);
                                $seqIdx++;
                            } while (isset($seenReceipts[strtoupper($cand)]));
                            $seenReceipts[strtoupper($cand)] = true;
                            $upSaleRn->bind_param("ss", $cand, $fixRow['id']);
                            $upSaleRn->execute();
                        }
                        $upSaleRn->close();
                    }
                }
            }
        } catch (Throwable $e) {}

        @file_put_contents($flagFile, date('Y-m-d H:i:s'));
    } catch (Throwable $e) {
        error_log('ensureDBSchemaMigrated error: ' . $e->getMessage());
    }
}

function safeDateSql($val, string $format = 'Y-m-d H:i:s', ?string $default = null): ?string {
    if ($val === null || $val === '') return $default;
    $ts = strtotime((string)$val);
    return ($ts !== false) ? date($format, $ts) : $default;
}

if (!file_exists(__DIR__ . '/.schema_migrated')) {
    ensureDBSchemaMigrated($conn, false);
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
            $hasSealedDep = !empty(array_filter($deps, function($d) { return strpos($d, 'Has remaining sealed stock') === 0; }));
            if ((int)($invRow['sealed_cnt'] ?? 0) > 0 && !$hasSealedDep) {
                $deps[] = "Has " . ((int)$invRow['sealed_cnt']) . " sealed unit(s) in warehouse inventory";
            }
            if ((float)($invRow['rem_vol'] ?? 0) > 0) {
                $deps[] = "Has opened container volume (" . ((float)$invRow['rem_vol']) . " L) in warehouse inventory";
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

// RBAC: Identify authenticated acting user strictly from PHP session
$sessionUserId = $_SESSION['user_id'] ?? null;
session_write_close();

$actingUser = null;
$actingUserId = null;
$actingRole = null;

if (!empty($sessionUserId)) {
    $uStmt = $conn->prepare("SELECT id, username, name, role, status FROM users WHERE id = ? LIMIT 1");
    if ($uStmt) {
        $uStmt->bind_param("s", $sessionUserId);
        $uStmt->execute();
        $uRes = $uStmt->get_result();
        if ($uRow = $uRes->fetch_assoc()) {
            if ($uRow['status'] === 'active') {
                $actingUser = $uRow;
                $actingUserId = (string)$uRow['id'];
                $actingRole = (string)$uRow['role'];
            }
        }
        $uStmt->close();
    }
}

if (!$actingUser) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required.']);
    exit;
}

if ($action === 'migrate_schema' || isset($_GET['migrate'])) {
    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Administrator authorization required.']);
        exit;
    }
    ensureDBSchemaMigrated($conn, true);
    if ($action === 'migrate_schema') {
        echo json_encode(['success' => true, 'message' => 'Schema migration verified successfully.']);
        exit;
    }
}

// Check product dependencies endpoint
if ($action === 'check_product_dependencies') {
    if (!in_array($actingRole, ['admin', 'staff'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied.']);
        exit;
    }
    $id = $_GET['id'] ?? '';
    $pid = $_GET['product_id'] ?? ($_GET['productId'] ?? $id);
    $deps = getProductBackendDependencies($conn, $pid, $id);
    echo json_encode([
        'success' => true,
        'hasDependencies' => !empty($deps),
        'dependencies' => $deps
    ]);
    exit;
}

// Sales History Summary endpoint (Admin Only)
if ($action === 'sales_history_summary') {
    if ($actingRole === 'cashier') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Cashiers are not authorized to access business-wide sales analytics.']);
        exit;
    }
    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Administrator authorization required.']);
        exit;
    }

    $from = trim((string)($_GET['from'] ?? ''));
    $to = trim((string)($_GET['to'] ?? ''));
    $status = trim((string)($_GET['status'] ?? 'all'));

    $where = [];
    $params = [];
    $types = '';
    if ($from !== '') {
        $where[] = "date >= ?";
        $params[] = strlen($from) === 10 ? ($from . ' 00:00:00') : $from;
        $types .= 's';
    }
    if ($to !== '') {
        $where[] = "date <= ?";
        $params[] = strlen($to) === 10 ? ($to . ' 23:59:59') : $to;
        $types .= 's';
    }
    if ($status !== 'all' && $status !== '') {
        $where[] = "LOWER(status) = LOWER(?)";
        $params[] = $status;
        $types .= 's';
    } else {
        $where[] = "LOWER(status) NOT IN ('voided', 'void', 'cancelled', 'canceled')";
    }
    $whereSql = !empty($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
    $sql = "SELECT COUNT(*) as cnt, COALESCE(SUM(total - COALESCE(refund_total, 0)), 0) as total_sum FROM sales $whereSql";
    $stmt = $conn->prepare($sql);
    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $sRes = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    echo json_encode([
        'success' => true,
        'summary' => $sRes
    ]);
    exit;
}

// Save VAT Settings endpoint (Admin Only)
if ($action === 'save_vat_settings') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Only Administrators can configure Philippine VAT settings.']);
        exit;
    }
    $vatSettings = $payload['vatSettings'] ?? $payload;
    if (!$vatSettings || !is_array($vatSettings)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid VAT settings payload.']);
        exit;
    }
    $taxStatus = ($vatSettings['taxStatus'] ?? '') === 'non_vat' ? 'non_vat' : 'vat_registered';
    $pricingType = ($vatSettings['pricingType'] ?? '') === 'exclusive' ? 'exclusive' : 'inclusive';
    $vatRate = isset($vatSettings['vatRate']) ? max(0, (float)$vatSettings['vatRate']) : 12.00;
    
    $cleanSettings = [
        'taxStatus' => $taxStatus,
        'pricingType' => $pricingType,
        'vatRate' => $vatRate
    ];
    
    $setStmt = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('vat_settings', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $valJson = json_encode($cleanSettings);
    $setStmt->bind_param("s", $valJson);
    $setStmt->execute();
    $setStmt->close();
    
    echo json_encode(['success' => true, 'vatSettings' => $cleanSettings]);
    exit;
}

// POS Automatic Promo Discount Configuration (Admin Only)
if ($action === 'save_promo_discount_settings') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Only Administrators can configure POS promo discount settings.']);
        exit;
    }
    $ps = $payload['promoDiscountSettings'] ?? $payload;
    if (!$ps || !is_array($ps)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid promo discount settings payload.']);
        exit;
    }
    $enabled = isset($ps['enabled']) ? (bool)$ps['enabled'] : true;
    $minAmount = isset($ps['minAmount']) ? round((float)$ps['minAmount'], 2) : 2500.00;
    $discountPct = isset($ps['discountPct']) ? round((float)$ps['discountPct'], 2) : 10.00;

    if ($minAmount < 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Minimum purchase amount cannot be negative.']);
        exit;
    }
    if ($discountPct < 0 || $discountPct > 100) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Discount percentage must be between 0 and 100.']);
        exit;
    }

    $cleanPromo = [
        'enabled' => $enabled,
        'minAmount' => $minAmount,
        'discountPct' => $discountPct
    ];

    $setStmt = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('pos_promo_discount', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $valJson = json_encode($cleanPromo);
    $setStmt->bind_param("s", $valJson);
    $setStmt->execute();
    $setStmt->close();

    echo json_encode(['success' => true, 'promoDiscountSettings' => $cleanPromo]);
    exit;
}

// Single Sale / Receipt retrieval endpoint (RBAC Protected)
if ($action === 'get_sale' || $action === 'receipt') {
    $saleId = trim((string)($_GET['id'] ?? $_GET['receipt_no'] ?? ''));
    if ($saleId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Sale ID or receipt number is required.']);
        exit;
    }
    $sStmt = $conn->prepare("SELECT * FROM sales WHERE id = ? OR receipt_no = ? LIMIT 1");
    if (!$sStmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database query error.']);
        exit;
    }
    $sStmt->bind_param("ss", $saleId, $saleId);
    $sStmt->execute();
    $sRes = $sStmt->get_result();
    $r = $sRes->fetch_assoc();
    $sStmt->close();

    if (!$r) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Transaction not found.']);
        exit;
    }

    if ($actingRole === 'cashier') {
        $ownerId = (string)($r['cashier_id'] ?? '');
        $ownerName = (string)($r['cashier_name'] ?? '');
        $isOwner = ($ownerId === $actingUserId) || ($ownerId === '' && strcasecmp($ownerName, $actingUser['name'] ?? '') === 0);
        if (!$isOwner) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied: You are restricted from viewing other cashiers\' transactions.']);
            exit;
        }
    } elseif ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: You are not authorized to view sales transactions.']);
        exit;
    }

    $items = !empty($r['items_json']) ? (json_decode($r['items_json'], true) ?: []) : [];
    $returns = !empty($r['returns_json']) ? (json_decode($r['returns_json'], true) ?: []) : [];
    $saleDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['date'], new DateTimeZone('Asia/Manila'));
    $discountPct = isset($r['discount_pct']) ? (float)$r['discount_pct'] : 0.0;
    $discountAmount = isset($r['discount_amount']) ? (float)$r['discount_amount'] : 0.0;

    echo json_encode([
        'success' => true,
        'sale' => [
            'id' => $r['id'],
            'receiptNo' => $r['receipt_no'] ?? null,
            'customerName' => $r['customer_name'] ?? null,
            'customer_name' => $r['customer_name'] ?? null,
            'date' => $saleDate ? $saleDate->format(DateTime::ATOM) : $r['date'],
            'cashierId' => $r['cashier_id'] ?? null,
            'cashier_id' => $r['cashier_id'] ?? null,
            'cashierName' => $r['cashier_name'],
            'paymentMethod' => $r['payment_method'] ?? 'Cash',
            'cashTendered' => isset($r['cash_tendered']) && (float)$r['cash_tendered'] > 0 ? (float)$r['cash_tendered'] : (float)($r['total'] ?: $r['subtotal']),
            'changeAmount' => isset($r['change_amount']) ? (float)$r['change_amount'] : 0.0,
            'subtotal' => (float)$r['subtotal'],
            'discountPct' => $discountPct,
            'discountPercentage' => $discountPct,
            'discountAmount' => $discountAmount,
            'discount' => $discountAmount,
            'total' => (float)($r['total'] ?: ($r['subtotal'] - $discountAmount)),
            'vatRate' => isset($r['vat_rate']) ? (float)$r['vat_rate'] : 12.00,
            'vat_rate' => isset($r['vat_rate']) ? (float)$r['vat_rate'] : 12.00,
            'vatableSales' => isset($r['vatable_sales']) ? (float)$r['vatable_sales'] : 0.00,
            'vatable_sales' => isset($r['vatable_sales']) ? (float)$r['vatable_sales'] : 0.00,
            'vatAmount' => isset($r['vat_amount']) ? (float)$r['vat_amount'] : 0.00,
            'vat_amount' => isset($r['vat_amount']) ? (float)$r['vat_amount'] : 0.00,
            'vatExemptSales' => isset($r['vat_exempt_sales']) ? (float)$r['vat_exempt_sales'] : 0.00,
            'vat_exempt_sales' => isset($r['vat_exempt_sales']) ? (float)$r['vat_exempt_sales'] : 0.00,
            'zeroRatedSales' => isset($r['zero_rated_sales']) ? (float)$r['zero_rated_sales'] : 0.00,
            'zero_rated_sales' => isset($r['zero_rated_sales']) ? (float)$r['zero_rated_sales'] : 0.00,
            'taxStatus' => $r['tax_status'] ?? 'vat_registered',
            'tax_status' => $r['tax_status'] ?? 'vat_registered',
            'pricingType' => $r['pricing_type'] ?? 'inclusive',
            'pricing_type' => $r['pricing_type'] ?? 'inclusive',
            'status' => $r['status'] ?? 'completed',
            'voidReason' => $r['void_reason'] ?? null,
            'voidedAt' => !empty($r['voided_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['voided_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['voided_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['voided_at']) : null,
            'voidedBy' => $r['voided_by'] ?? null,
            'voidRequestId' => $r['void_request_id'] ?? null,
            'voidExplanation' => $r['void_explanation'] ?? null,
            'voidRequestedAt' => !empty($r['void_requested_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['void_requested_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['void_requested_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['void_requested_at']) : null,
            'voidRequestedBy' => $r['void_requested_by'] ?? null,
            'voidAdminRemarks' => $r['void_admin_remarks'] ?? null,
            'voidRejectedAt' => !empty($r['void_rejected_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['void_rejected_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['void_rejected_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['void_rejected_at']) : null,
            'voidRejectedBy' => $r['void_rejected_by'] ?? null,
            'voidInventoryRestored' => (bool)($r['void_inventory_restored'] ?? false),
            'refundTotal' => (float)($r['refund_total'] ?? 0),
            'returns' => $returns,
            'items' => $items
        ]
    ]);
    exit;
}

// Admin-only Product Category Creation Endpoint
if ($action === 'add_category' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if ($actingRole !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Access denied: Only Administrators can create product categories.']);
        exit;
    }

    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $rawName = isset($payload['name']) ? (string)$payload['name'] : '';
    $name = trim(preg_replace('/\s+/', ' ', $rawName));

    if ($name === '' || mb_strlen($name) < 2) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Category name must be at least 2 characters long.']);
        exit;
    }
    if (mb_strlen($name) > 80) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Category name must not exceed 80 characters.']);
        exit;
    }
    if (preg_match('/[\x00-\x1F\x7F<>]/u', $name)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Category name contains invalid characters.']);
        exit;
    }

    $lowerName = mb_strtolower($name);
    $reserved = ['__add_category__', 'all', 'all categories', 'accessory', 'accessories'];
    if (in_array($lowerName, $reserved, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Category name '$name' is reserved and cannot be used."]);
        exit;
    }

    try {
        $defaults = ['House Paint', 'Automotive Paint', 'Specialty Paint'];
        $stored = [];
        $sStmt = $conn->prepare("SELECT setting_value FROM settings WHERE setting_key = 'product_categories' LIMIT 1");
        if ($sStmt) {
            $sStmt->execute();
            $sRes = $sStmt->get_result();
            if ($sRow = $sRes->fetch_assoc()) {
                $decoded = json_decode($sRow['setting_value'] ?? '', true);
                if (is_array($decoded)) {
                    $stored = $decoded;
                }
            }
            $sStmt->close();
        }

        // Gather existing categories from defaults, settings, and products table for case-insensitive duplicate check
        $allCategories = [];
        $seenLower = [];
        $addUnique = function ($cat) use (&$allCategories, &$seenLower) {
            $c = trim(preg_replace('/\s+/', ' ', (string)$cat));
            if ($c === '' || mb_strtolower($c) === 'accessory') return;
            $key = mb_strtolower($c);
            if (!isset($seenLower[$key])) {
                $seenLower[$key] = true;
                $allCategories[] = $c;
            }
        };

        foreach ($defaults as $d) $addUnique($d);
        foreach ($stored as $st) $addUnique($st);

        $pRes = $conn->query("SELECT DISTINCT type, category FROM products");
        if ($pRes) {
            while ($pRow = $pRes->fetch_assoc()) {
                if (!empty($pRow['type'])) $addUnique($pRow['type']);
                if (!empty($pRow['category'])) $addUnique($pRow['category']);
            }
        }

        if (isset($seenLower[$lowerName])) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => "Category '$name' already exists."]);
            exit;
        }

        $addUnique($name);
        $jsonVal = json_encode(array_values($allCategories), JSON_UNESCAPED_UNICODE);

        $upStmt = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('product_categories', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        if (!$upStmt) {
            throw new Exception('Failed to prepare category save statement: ' . $conn->error);
        }
        $upStmt->bind_param("s", $jsonVal);
        if (!$upStmt->execute()) {
            $err = $upStmt->error;
            $upStmt->close();
            throw new Exception('Failed to save category: ' . $err);
        }
        $upStmt->close();

        echo json_encode([
            'success' => true,
            'category' => $name,
            'categories' => array_values($allCategories)
        ]);
        exit;
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error while saving category: ' . $e->getMessage()]);
        exit;
    }
}

// Centralized Color Library & Formula Endpoints
if ($action === 'color_library_list') {
    $all = colorLibraryFetchAll($conn);
    echo json_encode([
        'success' => true,
        'colorLibrary' => $all['colors'],
        'colorFormulas' => $all['formulas']
    ]);
    exit;
}

if (in_array($action, ['color_library_save', 'color_library_delete', 'color_formula_save', 'color_formula_delete'], true) && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

if ($action === 'color_library_save' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $res = colorLibrarySaveColor($conn, $payload, $actingUser);
    http_response_code($res['status'] ?? 200);
    unset($res['status']);
    echo json_encode($res);
    exit;
}

if ($action === 'color_library_delete' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $res = colorLibraryDeleteColor(
        $conn,
        (string)($payload['id'] ?? ''),
        $actingUser,
        (string)($payload['reassignToColorId'] ?? ''),
        (string)($payload['mode'] ?? 'delete')
    );
    http_response_code($res['status'] ?? 200);
    unset($res['status']);
    echo json_encode($res);
    exit;
}

if ($action === 'color_formula_save' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $res = colorLibrarySaveFormula($conn, $payload, $actingUser);
    http_response_code($res['status'] ?? 200);
    unset($res['status']);
    echo json_encode($res);
    exit;
}

if ($action === 'color_formula_delete' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $res = colorLibraryDeleteFormula($conn, (string)($payload['id'] ?? ''), $actingUser);
    http_response_code($res['status'] ?? 200);
    unset($res['status']);
    echo json_encode($res);
    exit;
}

// GET: Fetch all data from MySQL
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    // RBAC Security Check: Cashier parameter tampering protection
    if ($actingRole === 'cashier') {
        if (isset($_GET['cashier_id']) && (string)$_GET['cashier_id'] !== $actingUserId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied: You cannot view sales transactions of other cashiers.']);
            exit;
        }
        if (isset($_GET['user_id']) && (string)$_GET['user_id'] !== $actingUserId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied: You cannot view sales transactions of other cashiers.']);
            exit;
        }
        if (isset($_GET['cashier']) && (string)$_GET['cashier'] !== ($actingUser['name'] ?? '') && (string)$_GET['cashier'] !== ($actingUser['username'] ?? '') && (string)$_GET['cashier'] !== '') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied: You cannot view sales transactions of other cashiers.']);
            exit;
        }
    }
    try {
        // Load Settings
        $settings = [];
        $resSettings = $conn->query("SELECT setting_key, setting_value FROM settings");
        if ($resSettings) {
            while ($sRow = $resSettings->fetch_assoc()) {
                $decoded = json_decode($sRow['setting_value'] ?? '', true);
                $settings[$sRow['setting_key']] = ($decoded !== null) ? $decoded : $sRow['setting_value'];
            }
        }
        $defaultVatSettings = [
            'taxStatus' => 'vat_registered',
            'pricingType' => 'inclusive',
            'vatRate' => 12.00
        ];
        $vatSettings = $settings['vat_settings'] ?? $defaultVatSettings;

        // Pre-aggregate expired vs sellable batch quantities per size_id so UI & Low-Stock Alerts
        // evaluate strictly non-expired sellable stock while keeping physical sealed_quantity intact.
        $batchStatsBySize = [];
        $bsRes = $conn->query("SELECT size_id,
                                      COALESCE(SUM(CASE WHEN expiration_date IS NOT NULL AND expiration_date < CURDATE() THEN remaining_qty ELSE 0 END), 0) AS expired_qty,
                                      COALESCE(SUM(CASE WHEN expiration_date IS NULL OR expiration_date >= CURDATE() THEN remaining_qty ELSE 0 END), 0) AS sellable_qty,
                                      COUNT(*) AS batch_count
                               FROM inventory_batches
                               GROUP BY size_id");
        if ($bsRes) {
            while ($bsRow = $bsRes->fetch_assoc()) {
                $batchStatsBySize[(string)$bsRow['size_id']] = [
                    'expiredQty' => max(0, (int)$bsRow['expired_qty']),
                    'sellableQty' => max(0, (int)$bsRow['sellable_qty']),
                    'batchCount' => (int)$bsRow['batch_count']
                ];
            }
        }

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
                $sealedQty = (int)($sRow['sealed_quantity'] ?? 0);
                $bStat = $batchStatsBySize[(string)$sRow['size_id']] ?? null;
                $expiredQty = $bStat ? min(max(0, $sealedQty), $bStat['expiredQty']) : 0;
                $sellableQty = max(0, $sealedQty - $expiredQty);

                $variant = [
                    'sizeId' => $sRow['size_id'],
                    'productId' => $pid,
                    'containerSize' => (float)$sRow['container_size'],
                    'pricePerLiter' => (float)$sRow['price_per_liter'],
                    'pricePerCan' => (float)$sRow['price_per_can'],
                    'minimumStock' => (int)$sRow['minimum_stock'],
                    'isActive' => (bool)$sRow['is_active'],
                    'inventoryId' => $sRow['inventory_id'] ?? null,
                    'sealedQuantity' => $sealedQty,
                    'expiredQuantity' => $expiredQty,
                    'sellableQuantity' => $sellableQty,
                    'openedQuantity' => (int)($sRow['opened_quantity'] ?? 0),
                    'remainingVolume' => (float)($sRow['remaining_volume'] ?? 0)
                ];
                $sizesByProd[$pid][] = $variant;
                $allProductSizes[] = $variant;
                if (!empty($sRow['inventory_id'])) {
                    $allInventory[] = [
                        'inventoryId' => $sRow['inventory_id'],
                        'sizeId' => $sRow['size_id'],
                        'sealedQuantity' => $sealedQty,
                        'expiredQuantity' => $expiredQty,
                        'sellableQuantity' => $sellableQty,
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

            // Synchronize legacy structures from variants if available (avoid redundant double json_decode)
            $openedObj = !empty($r['opened_by_size']) ? (json_decode($r['opened_by_size'], true) ?: []) : [];
            if (!is_array($openedObj)) $openedObj = [];

            $expiredBySizeObj = [];
            $sellableBySizeObj = [];
            $expiredLitersTotal = 0.0;

            if (!empty($variants)) {
                $sizesList = [];
                $canStockObj = [];
                $thresholdObj = [];
                foreach ($variants as $v) {
                    $cSz = $v['containerSize'];
                    $cSzStr = (string)$cSz;
                    $sizesList[] = $cSz;
                    $canStockObj[$cSzStr] = $v['sealedQuantity'];
                    $expiredBySizeObj[$cSzStr] = $v['expiredQuantity'];
                    $sellableBySizeObj[$cSzStr] = $v['sellableQuantity'];
                    $expiredLitersTotal += ((int)$v['expiredQuantity']) * ((float)$cSz);
                    $thresholdObj[$cSzStr] = $v['minimumStock'];
                    if ($v['remainingVolume'] > 0) {
                        $openedObj[$cSzStr] = $v['remainingVolume'];
                    } else {
                        unset($openedObj[$cSzStr]);
                    }
                }
                sort($sizesList);
            } else {
                $canStockObj = !empty($r['can_stock']) ? (json_decode($r['can_stock'], true) ?: []) : [];
                if (!is_array($canStockObj)) $canStockObj = [];
                $sizesList = !empty($r['sizes']) ? (json_decode($r['sizes'], true) ?: []) : [];
                if (!is_array($sizesList)) $sizesList = [];
                $thresholdObj = !empty($r['threshold_by_size']) ? (json_decode($r['threshold_by_size'], true) ?: []) : [];
                if (!is_array($thresholdObj)) $thresholdObj = [];
            }

            $totalPhysicalStock = (float)$r['stock'];
            $expiredLitersTotal = round($expiredLitersTotal, 2);
            $sellableStockLiters = round(max(0.0, $totalPhysicalStock - $expiredLitersTotal), 2);

            $priceHistDecoded = !empty($r['price_history']) ? json_decode($r['price_history'], true) : null;
            $pendingSizesDecoded = !empty($r['pending_sizes']) ? json_decode($r['pending_sizes'], true) : null;
            $pendingEditDecoded = !empty($r['pending_edit']) ? json_decode($r['pending_edit'], true) : null;

            $prodId = !empty($r['product_id']) ? $r['product_id'] : $r['id'];
            $prodName = !empty($r['product_name']) ? $r['product_name'] : $r['name'];
            $category = !empty($r['category']) ? $r['category'] : $r['type'];
            $taxClassification = !empty($r['tax_classification']) ? $r['tax_classification'] : 'vatable';

            $products[] = [
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
                'isBasePaint' => !empty($r['is_base_paint']),
                'is_base_paint' => !empty($r['is_base_paint']) ? 1 : 0,
                'paintSystem' => !empty($r['paint_system']) ? (string)$r['paint_system'] : 'unverified',
                'paint_system' => !empty($r['paint_system']) ? (string)$r['paint_system'] : 'unverified',
                'isSpecialtyPigment' => !empty($r['is_specialty_pigment']) || (($r['color_classification'] ?? '') === 'Specialty Colors'),
                'is_specialty_pigment' => (!empty($r['is_specialty_pigment']) || (($r['color_classification'] ?? '') === 'Specialty Colors')) ? 1 : 0,
                'adminReviewNote' => $r['admin_review_note'] ?? null,
                'admin_review_note' => $r['admin_review_note'] ?? null,
                'supplierId' => $r['supplier_id'] ?? null,
                'supplier_id' => $r['supplier_id'] ?? null,
                'price' => (float)$r['price'],
                'recentPrice' => (isset($r['recent_price']) && $r['recent_price'] !== null && $r['recent_price'] !== '') ? (float)$r['recent_price'] : null,
                'pendingPrice' => (isset($r['pending_price']) && $r['pending_price'] !== null && $r['pending_price'] !== '') ? (float)$r['pending_price'] : null,
                'priceHistory' => is_array($priceHistDecoded) ? $priceHistDecoded : [],
                'stock' => $totalPhysicalStock,
                'sellableStock' => $sellableStockLiters,
                'expiredStock' => $expiredLitersTotal,
                'canStock' => !empty($canStockObj) ? $canStockObj : new stdClass(),
                'sellableBySize' => !empty($sellableBySizeObj) ? $sellableBySizeObj : new stdClass(),
                'expiredBySize' => !empty($expiredBySizeObj) ? $expiredBySizeObj : new stdClass(),
                'openedStock' => (float)($r['opened_stock'] ?? 0),
                'openedCanSize' => (int)($r['opened_can_size'] ?? 0),
                'sizes' => $sizesList,
                'sizesData' => $variants,
                'pendingSizes' => is_array($pendingSizesDecoded) ? $pendingSizesDecoded : [],
                'pendingEdit' => is_array($pendingEditDecoded) ? $pendingEditDecoded : null,
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

        // Product Suppliers (Multi-supplier relationships with per-size purchase cost, MOQ, availability)
        $productSuppliers = [];
        $resPs = $conn->query("SELECT * FROM product_suppliers ORDER BY product_id, container_size, purchase_cost");
        if ($resPs) {
            while ($r = $resPs->fetch_assoc()) {
                $productSuppliers[] = [
                    'id' => $r['id'],
                    'productId' => $r['product_id'],
                    'product_id' => $r['product_id'],
                    'supplierId' => $r['supplier_id'],
                    'supplier_id' => $r['supplier_id'],
                    'containerSize' => (float)$r['container_size'],
                    'container_size' => (float)$r['container_size'],
                    'purchaseCost' => (float)$r['purchase_cost'],
                    'purchase_cost' => (float)$r['purchase_cost'],
                    'minOrderQty' => (int)$r['min_order_qty'],
                    'min_order_qty' => (int)$r['min_order_qty'],
                    'availability' => $r['availability'] ?? 'available',
                    'notes' => $r['notes'] ?? ''
                ];
            }
        }

        // Users (passwords and hashes are strictly excluded from API response)
        $users = [];
        $res = $conn->query("SELECT * FROM users ORDER BY name ASC");
        while ($r = $res->fetch_assoc()) {
            $users[] = [
                'id' => $r['id'],
                'username' => $r['username'],
                'name' => $r['name'],
                'role' => $r['role'],
                'status' => $r['status']
            ];
        }

        // Sales (Role-Based Access Controlled)
        $sales = [];
        $cStmt = null;
        if ($actingRole === 'admin') {
            // Admin retains full access to all transactions across all cashiers
            $res = $conn->query("SELECT * FROM sales ORDER BY date DESC");
        } elseif ($actingRole === 'cashier') {
            // Cashiers are strictly restricted to their own sales transactions
            $cName = $actingUser['name'] ?? '';
            $cStmt = $conn->prepare("SELECT * FROM sales WHERE cashier_id = ? OR (cashier_id IS NULL AND cashier_name = ?) ORDER BY date DESC");
            if ($cStmt) {
                $cStmt->bind_param("ss", $actingUserId, $cName);
                $cStmt->execute();
                $res = $cStmt->get_result();
            } else {
                $res = false;
            }
        } else {
            // Unauthenticated or roles without sales module access
            $res = false;
        }

        if ($res) {
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
                $discountPct = isset($r['discount_pct']) ? (float)$r['discount_pct'] : 0.0;
                $discountAmount = isset($r['discount_amount']) ? (float)$r['discount_amount'] : 0.0;
                $sales[] = [
                    'id' => $r['id'],
                    'receiptNo' => $r['receipt_no'] ?? null,
                    'customerName' => $r['customer_name'] ?? null,
                    'customer_name' => $r['customer_name'] ?? null,
                    'date' => $saleDate ? $saleDate->format(DateTime::ATOM) : $r['date'],
                    'cashierId' => $r['cashier_id'] ?? null,
                    'cashier_id' => $r['cashier_id'] ?? null,
                    'cashierName' => $r['cashier_name'],
                    'paymentMethod' => $r['payment_method'] ?? 'Cash',
                    'cashTendered' => isset($r['cash_tendered']) && (float)$r['cash_tendered'] > 0 ? (float)$r['cash_tendered'] : (float)($r['total'] ?: $r['subtotal']),
                    'changeAmount' => isset($r['change_amount']) ? (float)$r['change_amount'] : 0.0,
                    'subtotal' => (float)$r['subtotal'],
                    'discountPct' => $discountPct,
                    'discountPercentage' => $discountPct,
                    'discountAmount' => $discountAmount,
                    'discount' => $discountAmount,
                    'total' => (float)($r['total'] ?: ($r['subtotal'] - $discountAmount)),
                    'vatRate' => isset($r['vat_rate']) ? (float)$r['vat_rate'] : 12.00,
                    'vat_rate' => isset($r['vat_rate']) ? (float)$r['vat_rate'] : 12.00,
                    'vatableSales' => isset($r['vatable_sales']) ? (float)$r['vatable_sales'] : 0.00,
                    'vatable_sales' => isset($r['vatable_sales']) ? (float)$r['vatable_sales'] : 0.00,
                    'vatAmount' => isset($r['vat_amount']) ? (float)$r['vat_amount'] : 0.00,
                    'vat_amount' => isset($r['vat_amount']) ? (float)$r['vat_amount'] : 0.00,
                    'vatExemptSales' => isset($r['vat_exempt_sales']) ? (float)$r['vat_exempt_sales'] : 0.00,
                    'vat_exempt_sales' => isset($r['vat_exempt_sales']) ? (float)$r['vat_exempt_sales'] : 0.00,
                    'zeroRatedSales' => isset($r['zero_rated_sales']) ? (float)$r['zero_rated_sales'] : 0.00,
                    'zero_rated_sales' => isset($r['zero_rated_sales']) ? (float)$r['zero_rated_sales'] : 0.00,
                    'taxStatus' => $r['tax_status'] ?? 'vat_registered',
                    'tax_status' => $r['tax_status'] ?? 'vat_registered',
                    'pricingType' => $r['pricing_type'] ?? 'inclusive',
                    'pricing_type' => $r['pricing_type'] ?? 'inclusive',
                    'status' => $r['status'] ?? 'completed',
                    'voidReason' => $r['void_reason'] ?? null,
                    'voidedAt' => !empty($r['voided_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['voided_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['voided_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['voided_at']) : null,
                    'voidedBy' => $r['voided_by'] ?? null,
                    'voidRequestId' => $r['void_request_id'] ?? null,
                    'voidExplanation' => $r['void_explanation'] ?? null,
                    'voidRequestedAt' => !empty($r['void_requested_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['void_requested_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['void_requested_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['void_requested_at']) : null,
                    'voidRequestedBy' => $r['void_requested_by'] ?? null,
                    'voidAdminRemarks' => $r['void_admin_remarks'] ?? null,
                    'voidRejectedAt' => !empty($r['void_rejected_at']) ? (DateTime::createFromFormat('Y-m-d H:i:s', $r['void_rejected_at'], new DateTimeZone('Asia/Manila')) ? DateTime::createFromFormat('Y-m-d H:i:s', $r['void_rejected_at'], new DateTimeZone('Asia/Manila'))->format(DateTime::ATOM) : $r['void_rejected_at']) : null,
                    'voidRejectedBy' => $r['void_rejected_by'] ?? null,
                    'voidInventoryRestored' => (bool)($r['void_inventory_restored'] ?? false),
                    'refundTotal' => (float)($r['refund_total'] ?? 0),
                    'returns' => $returns,
                    'items' => $items
                ];
            }
            if ($cStmt) {
                $cStmt->close();
            }
        }

        // Movements (single aggregated LEFT JOIN replaces per-row correlated subquery)
        $movements = [];
        $manilaTz = new DateTimeZone('Asia/Manila');
        $res = $conn->query("SELECT m.*, p.name AS current_product_name, bm_agg.batch_numbers
            FROM movements m
            LEFT JOIN products p ON p.id = m.product_id
            LEFT JOIN (
                SELECT bm.movement_id, GROUP_CONCAT(DISTINCT ib.batch_number ORDER BY bm.id ASC SEPARATOR ', ') AS batch_numbers
                FROM batch_movements bm
                JOIN inventory_batches ib ON ib.batch_id = bm.batch_id
                GROUP BY bm.movement_id
            ) bm_agg ON bm_agg.movement_id = m.id
            ORDER BY m.date DESC");
        while ($r = $res->fetch_assoc()) {
            $movementDate = DateTime::createFromFormat('Y-m-d H:i:s', $r['date'], $manilaTz);
            $storedProductName = trim((string)($r['product_name'] ?? ''));
            $productName = ($storedProductName === '' || $storedProductName === '0')
                ? (string)($r['current_product_name'] ?? '')
                : $storedProductName;
            if ($productName === '') {
                $productName = $r['type'] === 'colormix' ? 'Color Mix' : 'Unknown product';
            }
            $formulaJson = $r['formula_json'] ?? null;
            $components = null;
            if (!empty($formulaJson)) {
                $components = json_decode($formulaJson, true) ?: null;
            }
            $movements[] = [
                'id' => $r['id'],
                'date' => $movementDate ? $movementDate->format(DateTime::ATOM) : $r['date'],
                'type' => $r['type'],
                'productId' => $r['product_id'],
                'sizeId' => $r['size_id'] ?? null,
                'containerSize' => isset($r['container_size']) && $r['container_size'] !== null ? (float)$r['container_size'] : null,
                'productName' => $productName,
                'colorHex' => $r['color_hex'] ?? null,
                'hexColor' => $r['color_hex'] ?? null,
                'formulaJson' => $formulaJson,
                'components' => $components,
                'qtyChange' => (float)$r['qty_change'],
                'staffName' => $r['staff_name'],
                'note' => $r['note'] ?? '',
                'batchNumber' => $r['batch_numbers'] ?? ''
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
                    'receivingStage' => $r['receiving_stage'] ?? ($r['status'] === 'received' ? 'completed' : 'open'),
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

        // Void Requests (Cashiers see only their own void requests)
        $voidRequests = [];
        if ($actingRole === 'cashier') {
            $vStmt = $conn->prepare("SELECT * FROM void_requests WHERE cashier_id = ? OR ((cashier_id IS NULL OR cashier_id = '') AND LOWER(TRIM(cashier_name)) = LOWER(TRIM(?))) ORDER BY date DESC");
            $cNameForVr = (string)($actingUser['name'] ?? '');
            $vStmt->bind_param("ss", $actingUserId, $cNameForVr);
            $vStmt->execute();
            $vres = $vStmt->get_result();
        } else {
            $vStmt = null;
            $vres = $conn->query("SELECT * FROM void_requests ORDER BY date DESC");
        }
        if ($vres) {
            while ($vr = $vres->fetch_assoc()) {
                $vitems = [];
                if (!empty($vr['items_json'])) {
                    $vitems = json_decode($vr['items_json'], true) ?: [];
                }
                $vReqDate = DateTime::createFromFormat('Y-m-d H:i:s', $vr['date'], new DateTimeZone('Asia/Manila'));
                $vRevDate = !empty($vr['reviewed_at']) ? DateTime::createFromFormat('Y-m-d H:i:s', $vr['reviewed_at'], new DateTimeZone('Asia/Manila')) : null;
                $voidRequests[] = [
                    'id' => $vr['id'],
                    'saleId' => $vr['sale_id'],
                    'receiptNo' => $vr['receipt_no'],
                    'date' => $vReqDate ? $vReqDate->format(DateTime::ATOM) : $vr['date'],
                    'requestDate' => $vReqDate ? $vReqDate->format(DateTime::ATOM) : $vr['date'],
                    'cashierId' => $vr['cashier_id'],
                    'cashierName' => $vr['cashier_name'],
                    'reason' => $vr['reason'],
                    'explanation' => $vr['explanation'] ?? '',
                    'total' => (float)$vr['total'],
                    'items' => $vitems,
                    'status' => $vr['status'],
                    'reviewedBy' => $vr['reviewed_by'] ?? null,
                    'reviewedAt' => $vRevDate ? $vRevDate->format(DateTime::ATOM) : ($vr['reviewed_at'] ?? null),
                    'adminRemarks' => $vr['admin_remarks'] ?? null,
                    'inventoryRestored' => (bool)($vr['inventory_restored'] ?? false)
                ];
            }
        }

        $clAll = colorLibraryFetchAll($conn);

        $promoDiscountSettings = ['enabled' => true, 'minAmount' => 2500.0, 'discountPct' => 10.0];
        if (isset($settings['pos_promo_discount']) && is_array($settings['pos_promo_discount'])) {
            $pds = $settings['pos_promo_discount'];
            $promoDiscountSettings = [
                'enabled' => isset($pds['enabled']) ? (bool)$pds['enabled'] : true,
                'minAmount' => isset($pds['minAmount']) ? max(0.0, round((float)$pds['minAmount'], 2)) : 2500.0,
                'discountPct' => isset($pds['discountPct']) ? min(100.0, max(0.0, round((float)$pds['discountPct'], 2))) : 10.0
            ];
        }

        echo json_encode([
            'success' => true,
            'db' => [
                'settings' => $settings,
                'vatSettings' => $vatSettings,
                'promoDiscountSettings' => $promoDiscountSettings,
                'colorLibrary' => $clAll['colors'],
                'colorFormulas' => $clAll['formulas'],
                'products' => $products,
                'productSizes' => $allProductSizes,
                'productSuppliers' => $productSuppliers,
                'inventory' => $allInventory,
                'suppliers' => $suppliers,
                'users' => $users,
                'sales' => $sales,
                'movements' => $movements,
                'purchaseOrders' => $purchaseOrders,
                'adjustmentRequests' => $adjustmentRequests,
                'voidRequests' => $voidRequests
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
    // $actingUser, $actingUserId, $actingRole are already verified strictly from $_SESSION['user_id'] above.

    $conn->begin_transaction();

    try {
        // Sync VAT Settings if provided by Admin
        if (isset($dbData['vatSettings']) || isset($dbData['settings']['vat_settings'])) {
            if ($actingRole === 'admin') {
                $vs = $dbData['vatSettings'] ?? $dbData['settings']['vat_settings'];
                if (is_array($vs)) {
                    $taxStatus = ($vs['taxStatus'] ?? '') === 'non_vat' ? 'non_vat' : 'vat_registered';
                    $pricingType = ($vs['pricingType'] ?? '') === 'exclusive' ? 'exclusive' : 'inclusive';
                    $vatRate = isset($vs['vatRate']) ? max(0, (float)$vs['vatRate']) : 12.00;
                    $cleanVs = ['taxStatus' => $taxStatus, 'pricingType' => $pricingType, 'vatRate' => $vatRate];
                    $vsJson = json_encode($cleanVs);
                    $vStmt = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('vat_settings', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
                    if ($vStmt) {
                        $vStmt->bind_param("s", $vsJson);
                        $vStmt->execute();
                        $vStmt->close();
                    }
                }
            }
        }
        // Pre-fetch existing adjustment request statuses for RBAC
        $existingReqStatuses = [];
        $erRes = $conn->query("SELECT id, status FROM adjustment_requests");
        if ($erRes) {
            while ($erRow = $erRes->fetch_assoc()) {
                $existingReqStatuses[$erRow['id']] = $erRow['status'];
            }
        }

        // Pre-fetch existing product statuses (populated below from single products query to avoid duplicate scan)
        $existingProdStatuses = [];

        // Track Inventory -> Color Library sync results for response
        $syncedProductsMap = [];
        $didColorSync = false;

        // 1. Sync Products
        if (!empty($dbData['products']) && is_array($dbData['products'])) {
            $stmt = $conn->prepare("INSERT INTO products (id, product_id, product_name, name, brand, type, category, tax_classification, color, color_id, color_classification, color_hex, is_color_pigment, is_base_paint, paint_system, is_specialty_pigment, admin_review_note, supplier_id, price, recent_price, pending_price, price_history, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, pending_edit, threshold, threshold_by_size, status, deactivation_reason, deactivated_at, deactivated_by, updated_by, discontinue_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    product_id = VALUES(product_id),
                    product_name = VALUES(product_name),
                    name = VALUES(name),
                    brand = VALUES(brand),
                    type = VALUES(type),
                    category = VALUES(category),
                    tax_classification = VALUES(tax_classification),
                    color = VALUES(color),
                    color_id = VALUES(color_id),
                    color_classification = VALUES(color_classification),
                    color_hex = VALUES(color_hex),
                    is_color_pigment = VALUES(is_color_pigment),
                    is_base_paint = VALUES(is_base_paint),
                    paint_system = VALUES(paint_system),
                    is_specialty_pigment = VALUES(is_specialty_pigment),
                    admin_review_note = VALUES(admin_review_note),
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

            // Pre-fetch all existing size IDs and pricing to avoid collisions and enforce RBAC
            $existingSizesRes = $conn->query("SELECT size_id, product_id, container_size, price_per_liter, price_per_can, minimum_stock, is_active FROM product_sizes");
            $existingSizeMap = []; // [prodId_containerSize] => size_id
            $existingSizeMeta = []; // [size_id] => row
            $existingSizesByProd = []; // [product_id] => [size_id, ...]
            $maxSizeNum = 0;
            while ($esRow = $existingSizesRes->fetch_assoc()) {
                $existingSizeMap[$esRow['product_id'] . '_' . (float)$esRow['container_size']] = $esRow['size_id'];
                $existingSizeMeta[$esRow['size_id']] = $esRow;
                $existingSizesByProd[$esRow['product_id']][] = $esRow['size_id'];
                $sNum = (int)str_replace('SZ-', '', $esRow['size_id']);
                if ($sNum > $maxSizeNum) $maxSizeNum = $sNum;
            }

            $existingInvRes = $conn->query("SELECT inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume FROM inventory");
            $existingInvMap = []; // [size_id] => inventory_id
            $existingInvMeta = []; // [size_id] => row
            $maxInvNum = 0;
            while ($eiRow = $existingInvRes->fetch_assoc()) {
                $existingInvMap[$eiRow['size_id']] = $eiRow['inventory_id'];
                $existingInvMeta[$eiRow['size_id']] = $eiRow;
                $iNum = (int)str_replace('INV-', '', $eiRow['inventory_id']);
                if ($iNum > $maxInvNum) $maxInvNum = $iNum;
            }

            // Pre-fetch all existing products to detect and skip unchanged products & enforce RBAC
            $existingProdMap = [];
            $epRes = $conn->query("SELECT id, product_id, product_name, name, brand, type, category, tax_classification, color, color_id, color_classification, color_hex, is_color_pigment, is_base_paint, paint_system, is_specialty_pigment, admin_review_note, supplier_id, price, recent_price, pending_price, price_history, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, pending_edit, threshold, threshold_by_size, status, deactivation_reason, deactivated_at, deactivated_by, updated_by, discontinue_reason, updated_at FROM products");
            if ($epRes) {
                while ($epRow = $epRes->fetch_assoc()) {
                    $pidKey = (string)$epRow['id'];
                    $existingProdMap[$pidKey] = $epRow;
                    $existingProdStatuses[$pidKey] = $epRow['status'];
                }
            }

            // Concurrency guard (#4): if client sent dirtyProductIds / dirtyStockProductIds,
            // never overwrite untouched products or untouched stock quantities from stale browser snapshots.
            $hasDirtyProdList = array_key_exists('dirtyProductIds', $payload) && is_array($payload['dirtyProductIds']);
            $dirtyProdSet = $hasDirtyProdList ? array_flip(array_map('strval', $payload['dirtyProductIds'])) : null;
            $hasDirtyStockList = array_key_exists('dirtyStockProductIds', $payload) && is_array($payload['dirtyStockProductIds']);
            $dirtyStockSet = $hasDirtyStockList ? array_flip(array_map('strval', $payload['dirtyStockProductIds'])) : null;

            foreach ($dbData['products'] as $p) {
                $id = (string)$p['id'];
                $existingP = $existingProdMap[$id] ?? null;

                if ($existingP !== null && $hasDirtyProdList && !isset($dirtyProdSet[$id])) {
                    continue; // Untouched on this terminal: skip to avoid overwriting concurrent changes
                }

                // Concurrency and dirty check: skip updating if product has not changed
                if ($existingP !== null) {
                    $pPrice = (float)($p['price'] ?? 0);
                    $pStock = (float)($p['stock'] ?? 0);
                    $pStatus = (string)($p['status'] ?? 'active');
                    $pThresh = (float)($p['threshold'] ?? 5);
                    $pName = (string)($p['productName'] ?? ($p['product_name'] ?? ($p['name'] ?? '')));
                    $pBrand = (string)($p['brand'] ?? '');
                    $pType = (string)($p['type'] ?? '');
                    $pCategory = (string)($p['category'] ?? $pType);
                    $pTaxClass = (string)($p['taxClassification'] ?? ($p['tax_classification'] ?? 'vatable'));
                    $pColor = (string)($p['color'] ?? '-');
                    $pColorId = !empty($p['colorId']) ? (string)$p['colorId'] : (!empty($p['color_id']) ? (string)$p['color_id'] : '');
                    $pColorCls = !empty($p['colorClassification']) ? (string)$p['colorClassification'] : (!empty($p['color_classification']) ? (string)$p['color_classification'] : '');
                    $pColorHex = !empty($p['colorHex']) ? (string)$p['colorHex'] : (!empty($p['color_hex']) ? (string)$p['color_hex'] : '');
                    $pIsPigment = (!empty($p['isColorPigment']) || !empty($p['is_color_pigment']) || colorSyncIsPigmentCategory($pCategory) || colorSyncIsPigmentCategory($pType)) ? 1 : 0;
                    $pIsBasePaint = $existingP ? (!empty($existingP['is_base_paint']) ? 1 : 0) : 0;
                    $pPaintSystem = !empty($p['paintSystem']) ? (string)$p['paintSystem'] : (!empty($p['paint_system']) ? (string)$p['paint_system'] : ($existingP['paint_system'] ?? 'unverified'));
                    $pIsSpecPig = (!empty($p['isSpecialtyPigment']) || !empty($p['is_specialty_pigment']) || $pColorCls === 'Specialty Colors') ? 1 : 0;
                    $pAdminNote = array_key_exists('adminReviewNote', $p) ? ($p['adminReviewNote'] !== '' ? $p['adminReviewNote'] : null) : (array_key_exists('admin_review_note', $p) ? ($p['admin_review_note'] !== '' ? $p['admin_review_note'] : null) : ($existingP['admin_review_note'] ?? null));
                    $pSupplierId = !empty($p['supplierId']) ? (string)$p['supplierId'] : (!empty($p['supplier_id']) ? (string)$p['supplier_id'] : '');
                    $pDeactReason = !empty($p['deactivationReason']) ? (string)$p['deactivationReason'] : '';
                    $pDiscReason = !empty($p['discontinueReason']) ? (string)$p['discontinueReason'] : '';
                    $pRecent = (isset($p['recentPrice']) && $p['recentPrice'] !== null && $p['recentPrice'] !== '') ? (float)$p['recentPrice'] : null;
                    $pPending = (isset($p['pendingPrice']) && $p['pendingPrice'] !== null && $p['pendingPrice'] !== '') ? (float)$p['pendingPrice'] : null;
                    $exRecent = ($existingP['recent_price'] !== null && $existingP['recent_price'] !== '') ? (float)$existingP['recent_price'] : null;
                    $exPending = ($existingP['pending_price'] !== null && $existingP['pending_price'] !== '') ? (float)$existingP['pending_price'] : null;

                    $pCanStock = isset($p['canStock']) && (is_array($p['canStock']) || is_object($p['canStock'])) ? (array)$p['canStock'] : [];
                    $exCanStockDec = !empty($existingP['can_stock']) ? json_decode($existingP['can_stock'], true) : null;
                    $exCanStock = is_array($exCanStockDec) ? $exCanStockDec : [];

                    $pOpenedBySize = isset($p['openedBySize']) && (is_array($p['openedBySize']) || is_object($p['openedBySize'])) ? (array)$p['openedBySize'] : [];
                    $exOpenedDec = !empty($existingP['opened_by_size']) ? json_decode($existingP['opened_by_size'], true) : null;
                    $exOpenedBySize = is_array($exOpenedDec) ? $exOpenedDec : [];

                    $pSizesArr = isset($p['sizes']) && is_array($p['sizes']) ? array_values($p['sizes']) : [];
                    $exSizesDec = !empty($existingP['sizes']) ? json_decode($existingP['sizes'], true) : null;
                    $exSizesArr = is_array($exSizesDec) ? $exSizesDec : [];

                    $pThreshBySize = (isset($p['thresholdBySize']) && (is_array($p['thresholdBySize']) || is_object($p['thresholdBySize']))) ? (array)$p['thresholdBySize'] : [];
                    $exThreshDec = !empty($existingP['threshold_by_size']) ? json_decode($existingP['threshold_by_size'], true) : null;
                    $exThreshBySize = is_array($exThreshDec) ? $exThreshDec : [];

                    $hasPendingEdits = !empty($p['pendingEdit']) || !empty($p['pendingSizes']) || !empty($existingP['pending_edit']) || !empty($existingP['pending_sizes']);

                    // Compare sizesData + inventory quantities against DB so unchanged products with size variants are skipped
                    $incomingSizes = (!empty($p['sizesData']) && is_array($p['sizesData'])) ? $p['sizesData'] : [];
                    $exProdSizeIds = $existingSizesByProd[$id] ?? [];
                    $sizesDataUnchanged = (count($incomingSizes) === count($exProdSizeIds));
                    if ($sizesDataUnchanged && !empty($incomingSizes)) {
                        foreach ($incomingSizes as $sd) {
                            $cSz = (float)($sd['containerSize'] ?? ($sd['container_size'] ?? 0));
                            $szKey = $id . '_' . $cSz;
                            if (!isset($existingSizeMap[$szKey])) {
                                $sizesDataUnchanged = false;
                                break;
                            }
                            $szId = $existingSizeMap[$szKey];
                            $exSm = $existingSizeMeta[$szId] ?? null;
                            $exIm = $existingInvMeta[$szId] ?? null;
                            if (!$exSm || !$exIm) {
                                $sizesDataUnchanged = false;
                                break;
                            }
                            $sdPpl = (float)($sd['pricePerLiter'] ?? ($sd['price_per_liter'] ?? $pPrice));
                            $sdPpc = (float)($sd['pricePerCan'] ?? ($sd['price_per_can'] ?? ($sdPpl * $cSz)));
                            $sdMin = (int)($sd['minimumStock'] ?? ($sd['minimum_stock'] ?? $pThresh));
                            $sdAct = isset($sd['isActive']) ? ((int)(bool)$sd['isActive']) : (isset($sd['is_active']) ? (int)$sd['is_active'] : 1);
                            $sdSealed = (int)($sd['sealedQuantity'] ?? ($sd['sealed_quantity'] ?? 0));
                            $sdOpened = (int)($sd['openedQuantity'] ?? ($sd['opened_quantity'] ?? 0));
                            $sdRemVol = (float)($sd['remainingVolume'] ?? ($sd['remaining_volume'] ?? 0));
                            if (
                                abs((float)$exSm['price_per_liter'] - $sdPpl) > 0.005 ||
                                abs((float)$exSm['price_per_can'] - $sdPpc) > 0.005 ||
                                (int)$exSm['minimum_stock'] !== $sdMin ||
                                (int)$exSm['is_active'] !== $sdAct ||
                                (int)$exIm['sealed_quantity'] !== $sdSealed ||
                                (int)$exIm['opened_quantity'] !== $sdOpened ||
                                abs((float)$exIm['remaining_volume'] - $sdRemVol) > 0.005
                            ) {
                                $sizesDataUnchanged = false;
                                break;
                            }
                        }
                    }

                    if (
                        !$hasPendingEdits &&
                        $sizesDataUnchanged &&
                        (float)$existingP['price'] === $pPrice &&
                        (float)$existingP['stock'] === $pStock &&
                        (string)$existingP['status'] === $pStatus &&
                        (float)$existingP['threshold'] === $pThresh &&
                        (string)$existingP['name'] === $pName &&
                        (string)$existingP['brand'] === $pBrand &&
                        (string)$existingP['type'] === $pType &&
                        (string)($existingP['category'] ?? '') === $pCategory &&
                        (string)($existingP['tax_classification'] ?? 'vatable') === $pTaxClass &&
                        (string)$existingP['color'] === $pColor &&
                        (string)($existingP['color_id'] ?? '') === $pColorId &&
                        (string)($existingP['color_classification'] ?? '') === $pColorCls &&
                        (string)($existingP['color_hex'] ?? '') === $pColorHex &&
                        (int)($existingP['is_color_pigment'] ?? 0) === $pIsPigment &&
                        (int)($existingP['is_base_paint'] ?? 0) === $pIsBasePaint &&
                        (string)($existingP['paint_system'] ?? 'unverified') === $pPaintSystem &&
                        (int)($existingP['is_specialty_pigment'] ?? 0) === $pIsSpecPig &&
                        (string)($existingP['admin_review_note'] ?? '') === (string)($pAdminNote ?? '') &&
                        (string)($existingP['supplier_id'] ?? '') === $pSupplierId &&
                        (string)($existingP['deactivation_reason'] ?? '') === $pDeactReason &&
                        (string)($existingP['discontinue_reason'] ?? '') === $pDiscReason &&
                        $pRecent === $exRecent &&
                        $pPending === $exPending &&
                        (float)($existingP['opened_stock'] ?? 0) === (float)($p['openedStock'] ?? 0) &&
                        (int)($existingP['opened_can_size'] ?? 0) === (int)($p['openedCanSize'] ?? 0) &&
                        $pCanStock == $exCanStock &&
                        $pOpenedBySize == $exOpenedBySize &&
                        $pSizesArr == $exSizesArr &&
                        $pThreshBySize == $exThreshBySize
                    ) {
                        continue; // UNCHANGED PRODUCT: Skip SQL updates
                    }
                }

                $productId = (string)($p['productId'] ?? ($p['product_id'] ?? $id));
                $name = (string)($p['name'] ?? ($p['productName'] ?? ($p['product_name'] ?? '')));
                $productName = (string)($p['productName'] ?? ($p['product_name'] ?? $name));
                $brand = (string)($p['brand'] ?? '');
                $type = (string)($p['type'] ?? '');
                $category = (string)($p['category'] ?? $type);
                $color = (string)($p['color'] ?? '-');
                $colorId = !empty($p['colorId']) ? (string)$p['colorId'] : (!empty($p['color_id']) ? (string)$p['color_id'] : null);
                $colorClassification = !empty($p['colorClassification']) ? (string)$p['colorClassification'] : (!empty($p['color_classification']) ? (string)$p['color_classification'] : null);
                $colorHex = !empty($p['colorHex']) ? (string)$p['colorHex'] : (!empty($p['color_hex']) ? (string)$p['color_hex'] : null);
                $isColorPigment = (!empty($p['isColorPigment']) || !empty($p['is_color_pigment']) || colorSyncIsPigmentCategory($category) || colorSyncIsPigmentCategory($type)) ? 1 : 0;
                if (colorSyncIsNonColorCategory($category) || colorSyncIsNonColorCategory($type)) {
                    $isColorPigment = 0;
                }
                // Preserve existing Base Paint designation in DB (cannot be manually toggled or accidentally reset via product edits)
                $isBasePaint = $existingP ? (!empty($existingP['is_base_paint']) ? 1 : 0) : 0;
                $allowedPaintSystems = ['unverified', 'water_based', 'solvent_based', 'automotive', 'specialty', 'universal_colorant'];
                $rawPaintSys = !empty($p['paintSystem']) ? (string)$p['paintSystem'] : (!empty($p['paint_system']) ? (string)$p['paint_system'] : ($existingP['paint_system'] ?? 'unverified'));
                $paintSystem = in_array($rawPaintSys, $allowedPaintSystems, true) ? $rawPaintSys : 'unverified';
                $isSpecialtyPigment = (!empty($p['isSpecialtyPigment']) || !empty($p['is_specialty_pigment']) || $colorClassification === 'Specialty Colors') ? 1 : 0;
                $adminReviewNote = array_key_exists('adminReviewNote', $p)
                    ? (!empty($p['adminReviewNote']) ? (string)$p['adminReviewNote'] : null)
                    : (array_key_exists('admin_review_note', $p)
                        ? (!empty($p['admin_review_note']) ? (string)$p['admin_review_note'] : null)
                        : ($existingP['admin_review_note'] ?? null));
                $supplierId = !empty($p['supplierId']) ? (string)$p['supplierId'] : (!empty($p['supplier_id']) ? (string)$p['supplier_id'] : null);
                $price = (float)($p['price'] ?? 0);
                $recentPrice = (isset($p['recentPrice']) && $p['recentPrice'] !== null && $p['recentPrice'] !== '') ? (float)$p['recentPrice'] : null;
                $pendingPrice = (isset($p['pendingPrice']) && $p['pendingPrice'] !== null && $p['pendingPrice'] !== '') ? (float)$p['pendingPrice'] : null;
                $priceHistoryJson = json_encode(!empty($p['priceHistory']) && is_array($p['priceHistory']) ? $p['priceHistory'] : []);
                $stock = (float)($p['stock'] ?? 0);
                if ($stock < 0) {
                    throw new Exception("Negative stock is not allowed for product '$name' ($id).");
                }
                $canStockObj = isset($p['canStock']) && (is_array($p['canStock']) || is_object($p['canStock'])) ? (array)$p['canStock'] : [];
                $canStock = json_encode(!empty($canStockObj) ? $canStockObj : new stdClass());
                $openedStock = (float)($p['openedStock'] ?? 0);
                if ($openedStock < 0) {
                    throw new Exception("Negative opened stock is not allowed for product '$name' ($id).");
                }
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
                $deactAt = safeDateSql($p['deactivatedAt'] ?? null, 'Y-m-d H:i:s', null);
                $deactBy = !empty($p['deactivatedBy']) ? (string)$p['deactivatedBy'] : null;
                $updatedBy = !empty($p['updatedBy']) ? (string)$p['updatedBy'] : null;
                $discReason = !empty($p['discontinueReason']) ? (string)$p['discontinueReason'] : null;
                $taxClassification = (string)($p['taxClassification'] ?? ($p['tax_classification'] ?? 'vatable'));

                // Strict Backend RBAC for Products:
                // Only Admin may edit restricted product metadata, selling prices, or status.
                if ($actingRole === 'cashier') {
                    if ($existingP === null) {
                        continue; // Cashiers cannot create new products
                    }
                    $productId = (string)($existingP['product_id'] ?: $existingP['id']);
                    $name = (string)$existingP['name'];
                    $productName = (string)($existingP['product_name'] ?: $existingP['name']);
                    $brand = (string)$existingP['brand'];
                    $type = (string)$existingP['type'];
                    $category = (string)($existingP['category'] ?: $existingP['type']);
                    $taxClassification = (string)($existingP['tax_classification'] ?: 'vatable');
                    $color = (string)$existingP['color'];
                    $colorId = $existingP['color_id'];
                    $colorClassification = $existingP['color_classification'] ?? null;
                    $colorHex = $existingP['color_hex'];
                    $isColorPigment = !empty($existingP['is_color_pigment']) ? 1 : 0;
                    $isBasePaint = !empty($existingP['is_base_paint']) ? 1 : 0;
                    $paintSystem = !empty($existingP['paint_system']) ? (string)$existingP['paint_system'] : 'unverified';
                    $isSpecialtyPigment = !empty($existingP['is_specialty_pigment']) ? 1 : 0;
                    $adminReviewNote = $existingP['admin_review_note'] ?? null;
                    $supplierId = $existingP['supplier_id'];
                    $price = (float)$existingP['price'];
                    $recentPrice = $existingP['recent_price'] !== null ? (float)$existingP['recent_price'] : null;
                    $pendingPrice = $existingP['pending_price'] !== null ? (float)$existingP['pending_price'] : null;
                    $priceHistoryJson = (string)($existingP['price_history'] ?? '[]');
                    $sizesJson = (string)($existingP['sizes'] ?? '[]');
                    $sizesArr = json_decode($sizesJson, true) ?: [];
                    $pendingSizesJson = (string)($existingP['pending_sizes'] ?? '[]');
                    $pendingEditJson = $existingP['pending_edit'];
                    $threshold = (float)$existingP['threshold'];
                    $thresholdBySize = (string)($existingP['threshold_by_size'] ?? '{}');
                    $thresholdBySizeArr = json_decode($thresholdBySize, true) ?: [];
                    $status = (string)$existingP['status'];
                    $deactReason = $existingP['deactivation_reason'];
                    $deactAt = $existingP['deactivated_at'];
                    $deactBy = $existingP['deactivated_by'];
                    $discReason = $existingP['discontinue_reason'];
                } elseif ($actingRole === 'staff') {
                    if ($existingP === null) {
                        // Staff-created products must enter as pending_approval
                        $status = 'pending_approval';
                    } else {
                        // Staff cannot directly overwrite admin-controlled catalog/price/status fields;
                        // edits must go through pending_edit / pending_price / pending_sizes.
                        $productId = (string)($existingP['product_id'] ?: $existingP['id']);
                        $name = (string)$existingP['name'];
                        $productName = (string)($existingP['product_name'] ?: $existingP['name']);
                        $brand = (string)$existingP['brand'];
                        $type = (string)$existingP['type'];
                        $category = (string)($existingP['category'] ?: $existingP['type']);
                        $taxClassification = (string)($existingP['tax_classification'] ?: 'vatable');
                        $color = (string)$existingP['color'];
                        $colorId = $existingP['color_id'];
                        $colorClassification = $existingP['color_classification'] ?? null;
                        $colorHex = $existingP['color_hex'];
                        $isColorPigment = !empty($existingP['is_color_pigment']) ? 1 : 0;
                    $isBasePaint = !empty($existingP['is_base_paint']) ? 1 : 0;
                    $paintSystem = !empty($existingP['paint_system']) ? (string)$existingP['paint_system'] : 'unverified';
                    $isSpecialtyPigment = !empty($existingP['is_specialty_pigment']) ? 1 : 0;
                    $adminReviewNote = $existingP['admin_review_note'] ?? null;
                        $price = (float)$existingP['price'];
                        $recentPrice = $existingP['recent_price'] !== null ? (float)$existingP['recent_price'] : null;
                        $priceHistoryJson = (string)($existingP['price_history'] ?? '[]');
                        $status = (string)$existingP['status'];
                        $deactReason = $existingP['deactivation_reason'];
                        $deactAt = $existingP['deactivated_at'];
                        $deactBy = $existingP['deactivated_by'];
                        $discReason = $existingP['discontinue_reason'];
                    }
                }

                // Concurrency guard (#4): if this terminal only edited metadata (e.g. price/name/status)
                // and did NOT modify stock quantities for this product, preserve the latest DB stock values.
                $preserveExistingStock = ($existingP !== null && $hasDirtyStockList && !isset($dirtyStockSet[$id]));
                if ($preserveExistingStock) {
                    $stock = (float)$existingP['stock'];
                    $canStock = (string)($existingP['can_stock'] ?? '{}');
                    $canStockObj = json_decode($canStock, true) ?: [];
                    $openedStock = (float)($existingP['opened_stock'] ?? 0);
                    $openedCanSize = (int)($existingP['opened_can_size'] ?? 0);
                    $openedBySize = (string)($existingP['opened_by_size'] ?? '{}');
                    $openedBySizeObj = json_decode($openedBySize, true) ?: [];
                }

                $stmt->bind_param("ssssssssssssiisissdddsdsdissssdsssssss", $id, $productId, $productName, $name, $brand, $type, $category, $taxClassification, $color, $colorId, $colorClassification, $colorHex, $isColorPigment, $isBasePaint, $paintSystem, $isSpecialtyPigment, $adminReviewNote, $supplierId, $price, $recentPrice, $pendingPrice, $priceHistoryJson, $stock, $canStock, $openedStock, $openedCanSize, $openedBySize, $sizesJson, $pendingSizesJson, $pendingEditJson, $threshold, $thresholdBySize, $status, $deactReason, $deactAt, $deactBy, $updatedBy, $discReason);
                $stmt->execute();

                // Genuine DB-level Inventory -> Color Library two-way synchronization (Admin only, pigment/colorant products only)
                if ($actingRole === 'admin') {
                    $syncInput = [
                        'id' => $id,
                        'productId' => $productId,
                        'name' => $name,
                        'type' => $type,
                        'category' => $category,
                        'color' => $color,
                        'colorId' => $colorId,
                        'colorClassification' => $colorClassification,
                        'colorHex' => $colorHex,
                        'isColorPigment' => $isColorPigment,
                    ];
                    $syncRes = colorSyncFromInventoryProduct($conn, $syncInput, $existingP, $actingUser);
                    if (!empty($syncRes['synced'])) {
                        $didColorSync = true;
                        $syncedProductsMap[$id] = [
                            'colorId' => $syncRes['colorId'],
                            'color' => $syncRes['colorName'],
                            'colorHex' => $syncRes['colorHex'],
                            'colorClassification' => $syncRes['colorClassification'],
                            'isColorPigment' => !empty($syncRes['isColorPigment']),
                            'syncAction' => $syncRes['action'],
                        ];
                    }
                }

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
                if ($preserveExistingStock) {
                    foreach ($variantsToSync as &$vSyncRef) {
                        $vSz = (float)($vSyncRef['containerSize'] ?? ($vSyncRef['container_size'] ?? 0));
                        $vSzKey = $id . '_' . $vSz;
                        if (isset($existingSizeMap[$vSzKey]) && isset($existingInvMeta[$existingSizeMap[$vSzKey]])) {
                            $exI = $existingInvMeta[$existingSizeMap[$vSzKey]];
                            $vSyncRef['sealedQuantity'] = (int)$exI['sealed_quantity'];
                            $vSyncRef['openedQuantity'] = (int)$exI['opened_quantity'];
                            $vSyncRef['remainingVolume'] = (float)$exI['remaining_volume'];
                        }
                    }
                    unset($vSyncRef);
                }

                $syncedSizeIds = [];
                foreach ($variantsToSync as $v) {
                    $cSz = (float)($v['containerSize'] ?? 1);
                    $mapKey = $productId . '_' . $cSz;
                    // Always prefer existing DB size_id for (product_id, container_size) to avoid uk_product_size / FK collisions
                    $sizeId = $existingSizeMap[$mapKey] ?? (!empty($v['sizeId']) ? (string)$v['sizeId'] : null);
                    if (!$sizeId) {
                        $maxSizeNum++;
                        $sizeId = sprintf('SZ-%03d', $maxSizeNum);
                        $existingSizeMap[$mapKey] = $sizeId;
                    }
                    $syncedSizeIds[] = $sizeId;

                    $pricePerLiter = isset($v['pricePerLiter']) ? (float)$v['pricePerLiter'] : $price;
                    $pricePerCan = isset($v['pricePerCan']) ? (float)$v['pricePerCan'] : round($pricePerLiter * $cSz, 2);
                    $minStock = isset($v['minimumStock']) ? (int)$v['minimumStock'] : ($cSz >= 16 ? 1 : ($cSz >= 4 ? 2 : 5));
                    $isActive = isset($v['isActive']) ? ($v['isActive'] ? 1 : 0) : 1;

                    // RBAC: Non-admin roles cannot alter selling prices (or minimum_stock/is_active for cashiers) on existing sizes
                    if ($actingRole !== 'admin' && isset($existingSizeMeta[$sizeId])) {
                        $exSz = $existingSizeMeta[$sizeId];
                        $pricePerLiter = (float)$exSz['price_per_liter'];
                        $pricePerCan = (float)$exSz['price_per_can'];
                        $isActive = (int)$exSz['is_active'];
                        if ($actingRole === 'cashier') {
                            $minStock = (int)$exSz['minimum_stock'];
                        }
                    } elseif ($actingRole === 'cashier' && !isset($existingSizeMeta[$sizeId])) {
                        continue; // Cashiers cannot create new container sizes
                    }

                    $stmtSizeUpsert->bind_param("ssdddii", $sizeId, $productId, $cSz, $pricePerLiter, $pricePerCan, $minStock, $isActive);
                    $stmtSizeUpsert->execute();

                    // Inventory: always prefer existing inventory_id for this size_id to prevent duplicate PK collisions
                    $invId = $existingInvMap[$sizeId] ?? (!empty($v['inventoryId']) ? (string)$v['inventoryId'] : null);
                    if (!$invId) {
                        $maxInvNum++;
                        $invId = sprintf('INV-%03d', $maxInvNum);
                        $existingInvMap[$sizeId] = $invId;
                    }
                    $cSzStr = (string)$cSz;
                    $sealedQty = isset($v['sealedQuantity']) ? (int)$v['sealedQuantity'] : (isset($canStockObj[$cSzStr]) ? (int)$canStockObj[$cSzStr] : 0);
                    $remVol = isset($v['remainingVolume']) ? (float)$v['remainingVolume'] : (isset($openedBySizeObj[$cSzStr]) ? (float)$openedBySizeObj[$cSzStr] : 0);
                    if ($sealedQty < 0 || $remVol < 0) {
                        throw new Exception("Negative container inventory is not allowed for product '$name' ({$cSz}L).");
                    }
                    $openedQty = $remVol > 0 ? 1 : 0;

                    $stmtInvUpsert->bind_param("ssiid", $invId, $sizeId, $sealedQty, $openedQty, $remVol);
                    $stmtInvUpsert->execute();
                }

                // Clean up removed container sizes only if Admin and they have zero stock and no batch/PO history
                if ($actingRole === 'admin' && $existingP !== null && !empty($syncedSizeIds)) {
                    $chkSzStmt = $conn->prepare("SELECT ps.size_id, COALESCE(inv.sealed_quantity, 0) AS sealed_qty, COALESCE(inv.remaining_volume, 0) AS rem_vol
                        FROM product_sizes ps
                        LEFT JOIN inventory inv ON inv.size_id = ps.size_id
                        WHERE ps.product_id = ?");
                    if ($chkSzStmt) {
                        $chkSzStmt->bind_param("s", $productId);
                        $chkSzStmt->execute();
                        $chkSzRes = $chkSzStmt->get_result();
                        $toRemoveSizeIds = [];
                        while ($szRow = $chkSzRes->fetch_assoc()) {
                            if (!in_array($szRow['size_id'], $syncedSizeIds, true)) {
                                if ((int)$szRow['sealed_qty'] === 0 && (float)$szRow['rem_vol'] <= 0.0001) {
                                    $toRemoveSizeIds[] = $szRow['size_id'];
                                }
                            }
                        }
                        $chkSzStmt->close();

                        foreach ($toRemoveSizeIds as $remSzId) {
                            $hasRefs = false;
                            $bChk = $conn->prepare("SELECT 1 FROM inventory_batches WHERE size_id = ? LIMIT 1");
                            if ($bChk) {
                                $bChk->bind_param("s", $remSzId);
                                $bChk->execute();
                                if ($bChk->get_result()->num_rows > 0) $hasRefs = true;
                                $bChk->close();
                            }
                            if (!$hasRefs) {
                                $poChk = $conn->prepare("SELECT 1 FROM purchase_order_items WHERE size_id = ? LIMIT 1");
                                if ($poChk) {
                                    $poChk->bind_param("s", $remSzId);
                                    $poChk->execute();
                                    if ($poChk->get_result()->num_rows > 0) $hasRefs = true;
                                    $poChk->close();
                                }
                            }
                            if (!$hasRefs) {
                                $delInvSz = $conn->prepare("DELETE FROM inventory WHERE size_id = ?");
                                if ($delInvSz) {
                                    $delInvSz->bind_param("s", $remSzId);
                                    $delInvSz->execute();
                                    $delInvSz->close();
                                }
                                $delPsSz = $conn->prepare("DELETE FROM product_sizes WHERE size_id = ?");
                                if ($delPsSz) {
                                    $delPsSz->bind_param("s", $remSzId);
                                    $delPsSz->execute();
                                    $delPsSz->close();
                                }
                            }
                        }
                    }

                    // Keep denormalized product_name & brand in inventory_batches synced without touching quantities or expiration dates
                    if ((string)$existingP['name'] !== $name || (string)$existingP['brand'] !== $brand) {
                        $updBatchStmt = $conn->prepare("UPDATE inventory_batches SET product_name = ?, brand = ? WHERE product_id = ?");
                        if ($updBatchStmt) {
                            $updBatchStmt->bind_param("sss", $name, $brand, $id);
                            $updBatchStmt->execute();
                            $updBatchStmt->close();
                        }
                    }
                }
            }
            $stmt->close();
            $stmtSizeUpsert->close();
            $stmtInvUpsert->close();
        }

        // 1b. Remove products deleted client-side (Admin Only, enforce backend safety checks)
        if ($actingRole === 'admin' && !empty($dbData['deletedProductIds']) && is_array($dbData['deletedProductIds'])) {
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

                // Delete child batches, inventory, product_suppliers, & sizes if clean
                $delBatches = $conn->prepare("DELETE FROM inventory_batches WHERE product_id IN (?, ?)");
                if ($delBatches) {
                    $delBatches->bind_param("ss", $delId, $altPid);
                    $delBatches->execute();
                    $delBatches->close();
                }
                $delInv = $conn->prepare("DELETE FROM inventory WHERE size_id IN (SELECT size_id FROM product_sizes WHERE product_id IN (?, ?))");
                if ($delInv) {
                    $delInv->bind_param("ss", $delId, $altPid);
                    $delInv->execute();
                    $delInv->close();
                }
                $delPsup = $conn->prepare("DELETE FROM product_suppliers WHERE product_id IN (?, ?)");
                if ($delPsup) {
                    $delPsup->bind_param("ss", $delId, $altPid);
                    $delPsup->execute();
                    $delPsup->close();
                }
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

        // 2. Sync Suppliers (Admin Only RBAC - skips unchanged suppliers)
        if ($actingRole === 'admin' && !empty($dbData['suppliers']) && is_array($dbData['suppliers'])) {
            $existingSupMap = [];
            $esupRes = $conn->query("SELECT id, name, contact, phone, email, address, product_ids, status FROM suppliers");
            if ($esupRes) {
                while ($esupRow = $esupRes->fetch_assoc()) {
                    $existingSupMap[$esupRow['id']] = $esupRow['name'] . '_' . (string)$esupRow['contact'] . '_' . (string)$esupRow['phone'] . '_' . (string)$esupRow['email'] . '_' . (string)$esupRow['address'] . '_' . (string)$esupRow['product_ids'] . '_' . (string)$esupRow['status'];
                }
            }

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

                $supSig = $name . '_' . $contact . '_' . $phone . '_' . $email . '_' . $address . '_' . $productIds . '_' . $status;
                if (isset($existingSupMap[$id]) && $existingSupMap[$id] === $supSig) {
                    continue; // Skip unchanged supplier
                }

                $stmt->bind_param("ssssssss", $id, $name, $contact, $phone, $email, $address, $productIds, $status);
                $stmt->execute();
            }
            $stmt->close();
        }
        if ($actingRole === 'admin' && !empty($dbData['deletedSupplierIds']) && is_array($dbData['deletedSupplierIds'])) {
            foreach ($dbData['deletedSupplierIds'] as $rawDelSupId) {
                $delSupId = trim((string)$rawDelSupId);
                if ($delSupId === '') continue;
                $chkPo = $conn->prepare("SELECT COUNT(*) AS cnt FROM purchase_orders WHERE supplier_id = ?");
                $poCnt = 0;
                if ($chkPo) {
                    $chkPo->bind_param("s", $delSupId);
                    $chkPo->execute();
                    $poRow = $chkPo->get_result()->fetch_assoc();
                    $poCnt = (int)($poRow['cnt'] ?? 0);
                    $chkPo->close();
                }
                if ($poCnt > 0) {
                    continue; // Preserve supplier with historical purchase orders
                }
                $delPs = $conn->prepare("DELETE FROM product_suppliers WHERE supplier_id = ?");
                if ($delPs) {
                    $delPs->bind_param("s", $delSupId);
                    $delPs->execute();
                    $delPs->close();
                }
                $clrProdSup = $conn->prepare("UPDATE products SET supplier_id = NULL WHERE supplier_id = ?");
                if ($clrProdSup) {
                    $clrProdSup->bind_param("s", $delSupId);
                    $clrProdSup->execute();
                    $clrProdSup->close();
                }
                $delSup = $conn->prepare("DELETE FROM suppliers WHERE id = ?");
                if ($delSup) {
                    $delSup->bind_param("s", $delSupId);
                    $delSup->execute();
                    $delSup->close();
                }
            }
        }

        // 2b. Sync Product-Supplier Relationships (Admin Only RBAC)
        if ($actingRole === 'admin' && !empty($dbData['productSuppliers']) && is_array($dbData['productSuppliers'])) {
            $stmtPs = $conn->prepare("INSERT INTO product_suppliers (id, product_id, supplier_id, container_size, purchase_cost, min_order_qty, availability, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    purchase_cost = VALUES(purchase_cost),
                    min_order_qty = VALUES(min_order_qty),
                    availability = VALUES(availability),
                    notes = VALUES(notes),
                    updated_at = CURRENT_TIMESTAMP");
            if ($stmtPs) {
                foreach ($dbData['productSuppliers'] as $ps) {
                    $psId = (string)($ps['id'] ?? ('ps_' . uniqid()));
                    $prodId = (string)($ps['productId'] ?? $ps['product_id'] ?? '');
                    $suppId = (string)($ps['supplierId'] ?? $ps['supplier_id'] ?? '');
                    $cSize = (float)($ps['containerSize'] ?? $ps['container_size'] ?? 0);
                    $pCost = (float)($ps['purchaseCost'] ?? $ps['purchase_cost'] ?? 0);
                    $moq = (int)($ps['minOrderQty'] ?? $ps['min_order_qty'] ?? 10);
                    $avail = (string)($ps['availability'] ?? 'available');
                    $notes = (string)($ps['notes'] ?? '');
                    if ($prodId !== '' && $suppId !== '') {
                        $stmtPs->bind_param("sssddiss", $psId, $prodId, $suppId, $cSize, $pCost, $moq, $avail, $notes);
                        $stmtPs->execute();
                    }
                }
                $stmtPs->close();
            }
        }
        if ($actingRole === 'admin' && !empty($dbData['deletedProductSupplierIds']) && is_array($dbData['deletedProductSupplierIds'])) {
            $stmtDelPs = $conn->prepare("DELETE FROM product_suppliers WHERE id = ?");
            if ($stmtDelPs) {
                foreach ($dbData['deletedProductSupplierIds'] as $dpsId) {
                    $stmtDelPs->bind_param("s", $dpsId);
                    $stmtDelPs->execute();
                }
                $stmtDelPs->close();
            }
        }

        // 3. Sync Users (Admin Only RBAC)
        if ($actingRole === 'admin' && !empty($dbData['users']) && is_array($dbData['users'])) {
            $existingUserPass = [];
            $eupRes = $conn->query("SELECT id, password FROM users");
            if ($eupRes) {
                while ($eupRow = $eupRes->fetch_assoc()) {
                    $existingUserPass[$eupRow['id']] = $eupRow['password'];
                }
            }

            $stmt = $conn->prepare("INSERT INTO users (id, username, password, name, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    username = VALUES(username),
                    password = VALUES(password),
                    name = VALUES(name),
                    role = VALUES(role),
                    status = VALUES(status)");

            $activeAdminCount = 0;
            foreach ($dbData['users'] as $chkU) {
                if (($chkU['role'] ?? '') === 'admin' && ($chkU['status'] ?? 'active') === 'active') {
                    $activeAdminCount++;
                }
            }
            if ($activeAdminCount < 1) {
                throw new Exception("At least one active Administrator account is required.", 400);
            }

            foreach ($dbData['users'] as $u) {
                $id = (string)$u['id'];
                $username = trim((string)$u['username']);
                $name = trim((string)$u['name']);
                $role = (string)($u['role'] ?? 'cashier');
                $status = (string)($u['status'] ?? 'active');

                if ($id === $actingUserId && ($role !== 'admin' || $status !== 'active')) {
                    throw new Exception("You cannot demote or deactivate your own Administrator account.", 400);
                }
                if ($username === '' || $name === '') {
                    throw new Exception("User username and name cannot be empty.");
                }
                // Pre-check duplicate username (case-insensitive) for a different user ID
                $dupU = $conn->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1");
                if ($dupU) {
                    $dupU->bind_param("ss", $username, $id);
                    $dupU->execute();
                    $dupURow = $dupU->get_result()->fetch_assoc();
                    $dupU->close();
                    if ($dupURow) {
                        throw new Exception("Username '{$username}' is already taken.");
                    }
                }

                // Secure password handling: hash new plaintext passwords, keep existing bcrypt hashes, reject blank passwords for new users
                $passInput = (string)($u['password'] ?? ($u['newPassword'] ?? ''));
                $finalHash = '';
                if ($passInput !== '') {
                    if (preg_match('/^\$2[ayb]\$\d{2}\$/', $passInput)) {
                        $finalHash = $passInput;
                    } else {
                        $finalHash = password_hash($passInput, PASSWORD_BCRYPT);
                    }
                } elseif (isset($existingUserPass[$id]) && $existingUserPass[$id] !== '') {
                    $finalHash = $existingUserPass[$id];
                } else {
                    throw new Exception("A password is required when creating a new user account.", 400);
                }

                $stmt->bind_param("ssssss", $id, $username, $finalHash, $name, $role, $status);
                $stmt->execute();
            }
            $stmt->close();
        }

        // 4. Sync Sales (Optimized: skips unchanged historical sales; Staff cannot create/modify sales)
        if ($actingRole !== 'staff' && !empty($dbData['sales']) && is_array($dbData['sales'])) {
            $existingSalesMap = [];
            $existingSalesOwner = [];
            $existingReceiptsBySaleId = [];
            $usedReceiptsUpper = [];
            $maxGlobalReceiptSeq = 0;
            $esRes = $conn->query("SELECT id, receipt_no, cashier_id, cashier_name, status, total, refund_total, discount_amount, customer_name, void_request_id, voided_at, void_rejected_at, returns_json, void_reason, void_admin_remarks FROM sales");
            if ($esRes) {
                $maxGlobalReceiptSeq = $esRes->num_rows;
                while ($esRow = $esRes->fetch_assoc()) {
                    $existingSalesMap[$esRow['id']] = $esRow['status'] . '_' . (float)$esRow['total'] . '_' . (float)$esRow['refund_total'] . '_' . (float)($esRow['discount_amount'] ?? 0) . '_' . ($esRow['customer_name'] ?? '') . '_' . ($esRow['void_request_id'] ?? '') . '_' . ($esRow['voided_at'] ?? '') . '_' . ($esRow['void_rejected_at'] ?? '') . '_' . ($esRow['returns_json'] ?? '[]') . '_' . ($esRow['void_reason'] ?? '') . '_' . ($esRow['void_admin_remarks'] ?? '');
                    $existingSalesOwner[$esRow['id']] = [
                        'cashier_id' => (string)($esRow['cashier_id'] ?? ''),
                        'cashier_name' => (string)($esRow['cashier_name'] ?? ''),
                        'status' => (string)($esRow['status'] ?? 'completed')
                    ];
                    $rnExisting = trim((string)($esRow['receipt_no'] ?? ''));
                    if ($rnExisting !== '') {
                        $existingReceiptsBySaleId[$esRow['id']] = $rnExisting;
                        $usedReceiptsUpper[strtoupper($rnExisting)] = $esRow['id'];
                        if (preg_match('/^OR-\d{8}-(\d+)$/i', $rnExisting, $mRn)) {
                            $seqN = (int)$mRn[1];
                            if ($seqN > $maxGlobalReceiptSeq) $maxGlobalReceiptSeq = $seqN;
                        }
                    }
                }
            }

            $stmt = $conn->prepare("INSERT INTO sales (id, receipt_no, customer_name, date, cashier_id, cashier_name, payment_method, cash_tendered, change_amount, void_reason, voided_at, voided_by, subtotal, discount_pct, discount_amount, total, status, refund_total, returns_json, items_json, void_request_id, void_explanation, void_requested_at, void_requested_by, void_admin_remarks, void_rejected_at, void_rejected_by, void_inventory_restored, vat_rate, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, tax_status, pricing_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    receipt_no = VALUES(receipt_no),
                    customer_name = VALUES(customer_name),
                    date = VALUES(date),
                    cashier_id = VALUES(cashier_id),
                    cashier_name = VALUES(cashier_name),
                    payment_method = VALUES(payment_method),
                    cash_tendered = VALUES(cash_tendered),
                    change_amount = VALUES(change_amount),
                    void_reason = VALUES(void_reason),
                    voided_at = VALUES(voided_at),
                    voided_by = VALUES(voided_by),
                    subtotal = VALUES(subtotal),
                    discount_pct = VALUES(discount_pct),
                    discount_amount = VALUES(discount_amount),
                    total = VALUES(total),
                    status = VALUES(status),
                    refund_total = VALUES(refund_total),
                    returns_json = VALUES(returns_json),
                    items_json = VALUES(items_json),
                    void_request_id = VALUES(void_request_id),
                    void_explanation = VALUES(void_explanation),
                    void_requested_at = VALUES(void_requested_at),
                    void_requested_by = VALUES(void_requested_by),
                    void_admin_remarks = VALUES(void_admin_remarks),
                    void_rejected_at = VALUES(void_rejected_at),
                    void_rejected_by = VALUES(void_rejected_by),
                    void_inventory_restored = VALUES(void_inventory_restored),
                    vat_rate = VALUES(vat_rate),
                    vatable_sales = VALUES(vatable_sales),
                    vat_amount = VALUES(vat_amount),
                    vat_exempt_sales = VALUES(vat_exempt_sales),
                    zero_rated_sales = VALUES(zero_rated_sales),
                    tax_status = VALUES(tax_status),
                    pricing_type = VALUES(pricing_type)");

            foreach ($dbData['sales'] as $sale) {
                $id = (string)$sale['id'];

                // RBAC Security for Cashiers:
                if ($actingRole === 'cashier') {
                    if (isset($existingSalesOwner[$id])) {
                        $ownerId = $existingSalesOwner[$id]['cashier_id'];
                        $ownerName = $existingSalesOwner[$id]['cashier_name'];
                        $isOwner = ($ownerId === $actingUserId) || ($ownerId === '' && strcasecmp($ownerName, $actingUser['name'] ?? '') === 0);
                        if (!$isOwner) {
                            continue; // Skip unauthorized modification of another cashier's sale
                        }
                    }
                    // Immutable cashier identity enforcement
                    $cashierId = $actingUserId;
                    $cashierName = !empty($actingUser['name']) ? (string)$actingUser['name'] : (!empty($sale['cashierName']) ? (string)$sale['cashierName'] : 'Cashier');
                } else {
                    $cashierId = !empty($sale['cashierId']) ? (string)$sale['cashierId'] : (!empty($sale['cashier_id']) ? (string)$sale['cashier_id'] : ($actingUserId ?: null));
                    $cashierName = (string)($sale['cashierName'] ?? ($actingUser['name'] ?? 'Admin'));
                }

                $status = (string)($sale['status'] ?? 'completed');
                $subtotal = (float)($sale['subtotal'] ?? 0);
                $discountPct = (float)($sale['discountPct'] ?? $sale['discountPercentage'] ?? 0);
                $discountAmount = (float)($sale['discountAmount'] ?? $sale['discount'] ?? 0);
                $total = (float)($sale['total'] ?? ($subtotal - $discountAmount));
                $refundTotal = (float)($sale['refundTotal'] ?? 0);

                $rawCustName = isset($sale['customerName']) ? (string)$sale['customerName'] : (isset($sale['customer_name']) ? (string)$sale['customer_name'] : '');
                $cleanCustName = trim($rawCustName);
                if ($cleanCustName !== '') {
                    if (mb_strlen($cleanCustName) > 150) {
                        $cleanCustName = mb_substr($cleanCustName, 0, 150);
                    }
                    $customerName = $cleanCustName;
                } else {
                    $customerName = null;
                }

                $voidRequestId = !empty($sale['voidRequestId']) ? (string)$sale['voidRequestId'] : null;
                $voidReason = !empty($sale['voidReason']) ? (string)$sale['voidReason'] : null;
                $voidExplanation = !empty($sale['voidExplanation']) ? (string)$sale['voidExplanation'] : null;
                $voidedAt = safeDateSql($sale['voidedAt'] ?? null, 'Y-m-d H:i:s', null);
                $voidedBy = !empty($sale['voidedBy']) ? (string)$sale['voidedBy'] : null;
                $voidRequestedAt = safeDateSql($sale['voidRequestedAt'] ?? null, 'Y-m-d H:i:s', null);
                $voidRequestedBy = !empty($sale['voidRequestedBy']) ? (string)$sale['voidRequestedBy'] : null;
                $voidAdminRemarks = !empty($sale['voidAdminRemarks']) ? (string)$sale['voidAdminRemarks'] : null;
                $voidRejectedAt = safeDateSql($sale['voidRejectedAt'] ?? null, 'Y-m-d H:i:s', null);
                $voidRejectedBy = !empty($sale['voidRejectedBy']) ? (string)$sale['voidRejectedBy'] : null;
                $voidInventoryRestored = !empty($sale['voidInventoryRestored']) ? 1 : 0;

                // RBAC Security for Sales Status:
                // If a sale is already finalized as Voided or Void Rejected in the database, preserve that finalized status!
                $exStatus = (string)($existingSalesOwner[$id]['status'] ?? '');
                $normExStatus = strtolower(trim($exStatus));
                if ($normExStatus === 'voided' || $normExStatus === 'void') {
                    $status = 'Voided';
                    $voidInventoryRestored = 1;
                } elseif ($normExStatus === 'void rejected' || $normExStatus === 'void_rejected') {
                    $status = 'Void Rejected';
                } elseif ($actingRole !== 'admin') {
                    // Non-admins can only submit 'Pending Void Approval' (or keep completed).
                    $normStatus = strtolower(trim($status));
                    if ($normStatus === 'voided' || $normStatus === 'void' || $normStatus === 'void rejected' || $normStatus === 'void_rejected') {
                        $status = 'Pending Void Approval';
                        $voidedAt = null;
                        $voidedBy = null;
                        $voidRejectedAt = null;
                        $voidRejectedBy = null;
                        $voidInventoryRestored = 0;
                    }
                }

                $returnsJson = json_encode($sale['returns'] ?? []);
                $saleSig = $status . '_' . $total . '_' . $refundTotal . '_' . $discountAmount . '_' . ($customerName ?? '') . '_' . ($voidRequestId ?? '') . '_' . ($voidedAt ?? '') . '_' . ($voidRejectedAt ?? '') . '_' . $returnsJson . '_' . ($voidReason ?? '') . '_' . ($voidAdminRemarks ?? '');
                if (isset($existingSalesMap[$id]) && $existingSalesMap[$id] === $saleSig) {
                    continue; // Skip unchanged sale record
                }
                // Validate numeric bounds & RBAC color mix pricing for newly created sales (never block historical records on unrelated saves)
                if (!isset($existingSalesOwner[$id])) {
                    if ($subtotal < 0 || $total < 0 || $discountPct < 0 || $discountPct > 100 || $discountAmount < 0) {
                        throw new Exception('Invalid negative or out-of-range sale amount.', 400);
                    }

                    // Server-side RBAC: Only Administrators may override Paint Color Mixing prices.
                    // For non-admin users (e.g., Cashiers), recompute every colormix item strictly from DB product prices + ₱50 service fee.
                    if ($actingRole !== 'admin' && !empty($sale['items']) && is_array($sale['items'])) {
                        static $authProdPriceMap = null;
                        if ($authProdPriceMap === null) {
                            $authProdPriceMap = [];
                            $pRes = $conn->query("SELECT id, price FROM products");
                            if ($pRes) {
                                while ($pRow = $pRes->fetch_assoc()) {
                                    $authProdPriceMap[(string)$pRow['id']] = (float)$pRow['price'];
                                }
                            }
                        }

                        $hasColorMixItem = false;
                        $recomputedSubtotal = 0.0;
                        foreach ($sale['items'] as $sItem) {
                            $itemType = strtolower(trim((string)($sItem['type'] ?? 'product')));
                            if ($itemType === 'colormix') {
                                $hasColorMixItem = true;
                                $comps = isset($sItem['components']) && is_array($sItem['components']) ? $sItem['components'] : [];
                                if (count($comps) < 2) {
                                    throw new Exception('Forbidden: Invalid custom color mix formula components.', 403);
                                }
                                $baseLiters = (float)($sItem['baseLiters'] ?? ($sItem['liters'] ?? ($sItem['qty'] ?? 1)));
                                $qtyLiters = (float)($sItem['qty'] ?? ($sItem['liters'] ?? $baseLiters));
                                if ($baseLiters < 0.5 || $qtyLiters < 0.5) {
                                    throw new Exception('Invalid custom color mix volume (minimum 0.5 L).', 400);
                                }

                                $pctSum = 0.0;
                                $materialCost = 0.0;
                                foreach ($comps as $comp) {
                                    $compPid = (string)($comp['productId'] ?? ($comp['product_id'] ?? ''));
                                    $compPct = (float)($comp['percentage'] ?? ($comp['pctNum'] ?? ($comp['pct'] ?? 0)));
                                    if ($compPid === '' || !isset($authProdPriceMap[$compPid]) || $compPct <= 0) {
                                        throw new Exception('Forbidden: Unknown or invalid color mix ingredient.', 403);
                                    }
                                    $dbIngPrice = $authProdPriceMap[$compPid];
                                    if ($dbIngPrice <= 0) {
                                        throw new Exception('Cannot sell custom color mix with ₱0.00 ingredient.', 400);
                                    }
                                    $pctSum += $compPct;
                                    $compLiters = round($baseLiters * ($compPct / 100.0), 4);
                                    $materialCost += round($compLiters * $dbIngPrice, 2);
                                }
                                if (abs($pctSum - 100.0) > 0.5) {
                                    throw new Exception('Invalid color mix formula: ingredient percentages must total 100%.', 400);
                                }

                                $materialCost = round($materialCost, 2);
                                $serviceFee = 50.00;
                                $expectedBaseGrandTotal = round($materialCost + $serviceFee, 2);
                                $expectedUnitPrice = round($expectedBaseGrandTotal / $baseLiters, 2);
                                $expectedLineTotal = (abs($qtyLiters - $baseLiters) > 0.0001)
                                    ? round(($qtyLiters / $baseLiters) * $expectedBaseGrandTotal, 2)
                                    : $expectedBaseGrandTotal;

                                $submittedUnitPrice = (float)($sItem['unitPrice'] ?? 0);
                                $submittedLineTotal = (float)($sItem['lineTotal'] ?? 0);
                                $submittedOtherCharges = isset($sItem['priceBreakdown']['otherCharges'])
                                    ? (float)$sItem['priceBreakdown']['otherCharges']
                                    : 0.0;

                                if (
                                    abs($submittedOtherCharges) > 0.05 ||
                                    abs($submittedUnitPrice - $expectedUnitPrice) > 0.05 ||
                                    abs($submittedLineTotal - $expectedLineTotal) > 0.05
                                ) {
                                    throw new Exception('Forbidden: Only Administrators may override Paint Color Mixing prices.', 403);
                                }
                                $recomputedSubtotal += $expectedLineTotal;
                            } else {
                                $recomputedSubtotal += (float)($sItem['lineTotal'] ?? 0);
                            }
                        }

                        if ($hasColorMixItem) {
                            $recomputedSubtotal = round($recomputedSubtotal, 2);
                            if (abs($subtotal - $recomputedSubtotal) > 0.10) {
                                throw new Exception('Forbidden: Sale subtotal does not match authorized Paint Color Mixing prices.', 403);
                            }
                            $netAfterDisc = round(max(0.0, $recomputedSubtotal - $discountAmount), 2);
                            $salePricingType = strtolower(trim((string)($sale['pricingType'] ?? ($sale['pricing_type'] ?? 'inclusive'))));
                            $saleTaxStatus = strtolower(trim((string)($sale['taxStatus'] ?? ($sale['tax_status'] ?? 'vat_registered'))));
                            $saleVatAmt = (float)($sale['vatAmount'] ?? ($sale['vat_amount'] ?? 0));
                            $expectedTotal = ($saleTaxStatus === 'vat_registered' && $salePricingType === 'exclusive')
                                ? round($netAfterDisc + $saleVatAmt, 2)
                                : $netAfterDisc;
                            if (abs($total - $expectedTotal) > 0.10) {
                                throw new Exception('Forbidden: Sale total does not match authorized Paint Color Mixing prices.', 403);
                            }
                        }
                    }
                }

                $receiptNo = trim((string)($sale['receiptNo'] ?? ''));
                $date = safeDateSql($sale['date'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
                if (isset($existingReceiptsBySaleId[$id]) && $existingReceiptsBySaleId[$id] !== '') {
                    $receiptNo = $existingReceiptsBySaleId[$id];
                } else {
                    $datePart = date('Ymd', strtotime($date) ?: time());
                    $upperCand = strtoupper($receiptNo);
                    if ($receiptNo === '' || (isset($usedReceiptsUpper[$upperCand]) && $usedReceiptsUpper[$upperCand] !== $id)) {
                        do {
                            $maxGlobalReceiptSeq++;
                            $receiptNo = sprintf('OR-%s-%04d', $datePart, $maxGlobalReceiptSeq);
                            $upperCand = strtoupper($receiptNo);
                        } while (isset($usedReceiptsUpper[$upperCand]) && $usedReceiptsUpper[$upperCand] !== $id);
                    }
                    $usedReceiptsUpper[$upperCand] = $id;
                    $existingReceiptsBySaleId[$id] = $receiptNo;
                }
                $paymentMethod = !empty($sale['paymentMethod']) ? (string)$sale['paymentMethod'] : 'Cash';
                $cashTendered = isset($sale['cashTendered']) ? (float)$sale['cashTendered'] : (float)$total;
                $changeAmount = isset($sale['changeAmount']) ? (float)$sale['changeAmount'] : 0.0;
                $itemsJson = json_encode($sale['items'] ?? []);
                $vatRate = isset($sale['vatRate']) ? (float)$sale['vatRate'] : (isset($sale['vat_rate']) ? (float)$sale['vat_rate'] : 12.00);
                $vatableSales = isset($sale['vatableSales']) ? (float)$sale['vatableSales'] : (isset($sale['vatable_sales']) ? (float)$sale['vatable_sales'] : 0.0);
                $vatAmount = isset($sale['vatAmount']) ? (float)$sale['vatAmount'] : (isset($sale['vat_amount']) ? (float)$sale['vat_amount'] : 0.0);
                $vatExemptSales = isset($sale['vatExemptSales']) ? (float)$sale['vatExemptSales'] : (isset($sale['vat_exempt_sales']) ? (float)$sale['vat_exempt_sales'] : 0.0);
                $zeroRatedSales = isset($sale['zeroRatedSales']) ? (float)$sale['zeroRatedSales'] : (isset($sale['zero_rated_sales']) ? (float)$sale['zero_rated_sales'] : 0.0);
                $taxStatus = (string)($sale['taxStatus'] ?? ($sale['tax_status'] ?? 'vat_registered'));
                $pricingType = (string)($sale['pricingType'] ?? ($sale['pricing_type'] ?? 'inclusive'));

                $stmt->bind_param(
                    "sssssssddsssddddsdsssssssssidddddss",
                    $id, $receiptNo, $customerName, $date, $cashierId, $cashierName,
                    $paymentMethod, $cashTendered, $changeAmount, $voidReason, $voidedAt, $voidedBy,
                    $subtotal, $discountPct, $discountAmount, $total, $status, $refundTotal,
                    $returnsJson, $itemsJson,
                    $voidRequestId, $voidExplanation, $voidRequestedAt, $voidRequestedBy,
                    $voidAdminRemarks, $voidRejectedAt, $voidRejectedBy, $voidInventoryRestored,
                    $vatRate, $vatableSales, $vatAmount, $vatExemptSales, $zeroRatedSales, $taxStatus, $pricingType
                );
                $stmt->execute();
            }
            $stmt->close();
        }

        // 5. Sync Movements (Optimized: movements are immutable ledger entries, skip existing)
        $mvNewRows = []; // newly inserted movements -> routed into the Expiration Tracking batch ledger below
        if (!empty($dbData['movements']) && is_array($dbData['movements'])) {
            $existingMovementsMap = [];
            $emRes = $conn->query("SELECT id FROM movements");
            if ($emRes) {
                while ($emRow = $emRes->fetch_assoc()) {
                    $existingMovementsMap[$emRow['id']] = true;
                }
            }

            $stmt = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, color_hex, qty_change, staff_name, note, formula_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    date = VALUES(date),
                    type = VALUES(type),
                    product_id = VALUES(product_id),
                    size_id = VALUES(size_id),
                    container_size = VALUES(container_size),
                    product_name = VALUES(product_name),
                    color_hex = VALUES(color_hex),
                    qty_change = VALUES(qty_change),
                    staff_name = VALUES(staff_name),
                    note = VALUES(note),
                    formula_json = VALUES(formula_json)");

            foreach ($dbData['movements'] as $m) {
                $id = (string)$m['id'];
                if (isset($existingMovementsMap[$id])) {
                    continue; // Skip already recorded ledger movement
                }

                $date = safeDateSql($m['date'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
                $type = (string)($m['type'] ?? '');
                if ($actingRole === 'cashier' && !in_array(strtolower($type), ['sale', 'colormix', 'color_mix', 'mix', 'return', 'exchange', 'open_can'], true)) {
                    continue; // Cashiers may only record POS-related movements
                }
                $productId = !empty($m['productId']) ? (string)$m['productId'] : (!empty($m['product_id']) ? (string)$m['product_id'] : null);
                $sizeId = !empty($m['sizeId']) ? (string)$m['sizeId'] : (!empty($m['size_id']) ? (string)$m['size_id'] : null);
                $containerSize = isset($m['containerSize']) && $m['containerSize'] !== null ? (float)$m['containerSize'] : (isset($m['container_size']) && $m['container_size'] !== null ? (float)$m['container_size'] : null);
                $productName = (string)$m['productName'];
                $colorHex = !empty($m['colorHex']) ? (string)$m['colorHex'] : (!empty($m['hexColor']) ? (string)$m['hexColor'] : null);
                $qtyChange = (float)($m['qtyChange'] ?? 0);
                $staffName = (string)($m['staffName'] ?? '');
                $note = (string)($m['note'] ?? '');
                $formulaJson = !empty($m['formulaJson']) ? (string)$m['formulaJson'] : (!empty($m['components']) ? json_encode($m['components']) : null);

                if (!$sizeId && !empty($note) && preg_match('/\b(SZ-\d+)\b/', $note, $szm)) {
                    $sizeId = $szm[1];
                }
                if (!$containerSize && !empty($note) && preg_match('/(?:Sold|Received|Return|Exchange|Added|Deducted|Adjusted)\s*\d+(?:\.\d+)?\s*[×x]\s*(\d+(?:\.\d+)?)L/i', $note, $csm)) {
                    $containerSize = (float)$csm[1];
                }

                $stmt->bind_param("sssssdssdsss", $id, $date, $type, $productId, $sizeId, $containerSize, $productName, $colorHex, $qtyChange, $staffName, $note, $formulaJson);
                $mvNewRows[] = ['m' => $m, 'type' => $type, 'sizeId' => $sizeId, 'productId' => $productId, 'containerSize' => (float)$containerSize, 'qtyChange' => $qtyChange, 'staff' => $staffName, 'note' => $note, 'date' => $date];
                $stmt->execute();
            }
            $stmt->close();
        }

        // 5b. Expiration Tracking: route new movements into batch ledger (FIFO / receiving batches),
        //     then reconcile so batch totals always equal the centralized inventory.
        //     If batch processing fails (e.g. attempting to sell expired stock), abort transaction.
        $blockExpiredReconcile = false;
        foreach ($mvNewRows as $nm) {
            $mvTypeLow = strtolower((string)$nm['type']);
            if (in_array($mvTypeLow, ['colormix', 'color_mix', 'mix', 'sale'], true) || ($mvTypeLow === 'return' && (float)$nm['qtyChange'] < 0)) {
                $blockExpiredReconcile = true;
            }
            if ($mvTypeLow === 'colormix' || $mvTypeLow === 'color_mix' || $mvTypeLow === 'mix') {
                if ((float)$nm['qtyChange'] < 0 && !empty($nm['productId'])) {
                    $cmPid = (string)$nm['productId'];
                    $cmStmt = $conn->prepare("SELECT id, name, status, is_color_pigment, is_base_paint FROM products WHERE id = ? OR product_id = ? LIMIT 1");
                    $cmRow = null;
                    if ($cmStmt) {
                        $cmStmt->bind_param("ss", $cmPid, $cmPid);
                        $cmStmt->execute();
                        $cmRow = $cmStmt->get_result()->fetch_assoc();
                        $cmStmt->close();
                    }
                    if (!$cmRow || strtolower((string)($cmRow['status'] ?? '')) !== 'active') {
                        throw new Exception("Unavailable: Required ingredient '{$cmPid}' is unavailable or inactive in inventory.");
                    }
                    $isEligibleMix = !empty($cmRow['is_color_pigment']) || !empty($cmRow['is_base_paint']);
                    if (!$isEligibleMix) {
                        throw new Exception("Admin Review: '{$cmRow['name']}' is not approved for color mixing.");
                    }
                }
            }
            batchProcessMovement($conn, $nm['m'], $nm['type'], $nm['sizeId'], $nm['productId'], $nm['containerSize'], $nm['qtyChange'], $nm['staff'], $nm['note'], $nm['date']);
        }
        batchReconcile($conn, !empty($actingUser['name']) ? (string)$actingUser['name'] : 'System', $blockExpiredReconcile);

        // 6. Sync Purchase Orders (Admin & Staff only; skips unchanged POs)
        if (in_array($actingRole, ['admin', 'staff'], true) && !empty($dbData['purchaseOrders']) && is_array($dbData['purchaseOrders'])) {
            $existingPOMap = [];
            $existingPOStatus = [];
            $epoRes = $conn->query("SELECT id, status, total_amount, received_at, expected_date, notes, items_json FROM purchase_orders");
            if ($epoRes) {
                while ($epoRow = $epoRes->fetch_assoc()) {
                    $existingPOMap[$epoRow['id']] = $epoRow['status'] . '_' . (float)$epoRow['total_amount'] . '_' . (string)$epoRow['received_at'] . '_' . (string)$epoRow['expected_date'] . '_' . (string)$epoRow['notes'] . '_' . (string)$epoRow['items_json'];
                    $existingPOStatus[$epoRow['id']] = (string)$epoRow['status'];
                }
            }

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
                $status = (string)($po['status'] ?? 'ordered');
                // RBAC: Only Admin may approve a pending PO, create an already-ordered/received PO, or cancel a pending PO
                if ($actingRole !== 'admin') {
                    if (isset($existingPOStatus[$id])) {
                        $prevPoSt = $existingPOStatus[$id];
                        if ($prevPoSt === 'pending' && $status !== 'pending') {
                            $status = 'pending';
                        } elseif (in_array($prevPoSt, ['received', 'cancelled'], true) && $status !== $prevPoSt) {
                            $status = $prevPoSt;
                        }
                    } else {
                        $status = 'pending';
                    }
                }
                $totalAmount = (float)($po['totalAmount'] ?? 0);
                $receivedAt = safeDateSql($po['receivedAt'] ?? null, 'Y-m-d H:i:s', null);
                $expectedDate = safeDateSql($po['expectedDate'] ?? null, 'Y-m-d', null);
                $notes = (string)($po['notes'] ?? '');
                $itemsJson = json_encode($po['items'] ?? []);

                $poSig = $status . '_' . $totalAmount . '_' . (string)$receivedAt . '_' . (string)$expectedDate . '_' . $notes . '_' . $itemsJson;
                if (isset($existingPOMap[$id]) && $existingPOMap[$id] === $poSig) {
                    continue; // Skip unchanged PO
                }

                $poNumber = (string)($po['poNumber'] ?? '');
                $supplierId = (string)($po['supplierId'] ?? '');
                $supplierName = (string)($po['supplierName'] ?? '');
                $orderDate = safeDateSql($po['orderDate'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
                $createdBy = (string)($po['createdBy'] ?? '');

                $stmt->bind_param("sssssssdssss", $id, $poNumber, $supplierId, $supplierName, $orderDate, $expectedDate, $status, $totalAmount, $itemsJson, $notes, $createdBy, $receivedAt);
                $stmt->execute();

                // Sync items to purchase_order_items table only when items array is provided
                if (isset($po['items']) && is_array($po['items'])) {
                    $delPoi = $conn->prepare("DELETE FROM purchase_order_items WHERE po_id = ?");
                    if ($delPoi) {
                        $delPoi->bind_param("s", $id);
                        $delPoi->execute();
                        $delPoi->close();
                    }
                    if (!empty($po['items'])) {
                        $stmtPoi = $conn->prepare("INSERT INTO purchase_order_items (id, po_id, product_id, product_name, brand, color, size_id, container_size, quantity, received_quantity, unit_cost, total_cost, supplier_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        if ($stmtPoi) {
                            foreach ($po['items'] as $idx => $it) {
                                $poiId = !empty($it['id']) ? (string)$it['id'] : ('poi_' . md5($id . '_' . ($it['productId'] ?? '') . '_' . ($it['size'] ?? '') . '_' . $idx));
                                $pId = (string)($it['productId'] ?? $it['product_id'] ?? '');
                                $pName = (string)($it['productName'] ?? $it['product_name'] ?? '');
                                $pBrand = (string)($it['brand'] ?? '');
                                $pColor = (string)($it['color'] ?? '');
                                $pSizeId = (string)($it['sizeId'] ?? $it['size_id'] ?? '');
                                $pSize = (float)($it['size'] ?? $it['containerSize'] ?? $it['container_size'] ?? 0);
                                $pQty = (int)($it['qty'] ?? $it['quantity'] ?? 0);
                                $pRecQty = (int)($it['receivedQty'] ?? $it['received_quantity'] ?? 0);
                                $pCost = (float)($it['unitCost'] ?? $it['purchaseCostPerUnit'] ?? 0);
                                $pTotal = (float)($it['lineTotal'] ?? ($pQty * $pCost));
                                $stmtPoi->bind_param("sssssssdiidds", $poiId, $id, $pId, $pName, $pBrand, $pColor, $pSizeId, $pSize, $pQty, $pRecQty, $pCost, $pTotal, $supplierId);
                                $stmtPoi->execute();
                            }
                            $stmtPoi->close();
                        }
                    }
                }
            }
            $stmt->close();
        }

        // 7. Sync Adjustment Requests (Admin & Staff only; skips unchanged adjustment requests)
        if (in_array($actingRole, ['admin', 'staff'], true) && !empty($dbData['adjustmentRequests']) && is_array($dbData['adjustmentRequests'])) {
            $existingARMap = [];
            $earRes = $conn->query("SELECT id, status, reviewed_at FROM adjustment_requests");
            if ($earRes) {
                while ($earRow = $earRes->fetch_assoc()) {
                    $existingARMap[$earRow['id']] = $earRow['status'] . '_' . (string)$earRow['reviewed_at'];
                }
            }

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
                $status = (string)($ar['status'] ?? 'pending');
                $reviewedAt = safeDateSql($ar['reviewedAt'] ?? null, 'Y-m-d H:i:s', null);

                $arSig = $status . '_' . (string)$reviewedAt;
                if (isset($existingARMap[$id]) && $existingARMap[$id] === $arSig) {
                    continue; // Skip unchanged adjustment request
                }

                $reqNumber = (string)($ar['reqNumber'] ?? '');
                $date = safeDateSql($ar['date'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
                $requestedBy = (string)($ar['requestedBy'] ?? 'staff');
                $role = (string)($ar['role'] ?? 'staff');
                $rowsJson = json_encode($ar['rows'] ?? []);
                $batchNote = (string)($ar['batchNote'] ?? '');
                $reviewedBy = !empty($ar['reviewedBy']) ? (string)$ar['reviewedBy'] : null;
                $rejectReason = !empty($ar['rejectReason']) ? (string)$ar['rejectReason'] : null;

                // RBAC: Only admin can approve or reject adjustment requests; non-admins cannot re-open finalized requests
                if ($actingRole !== 'admin') {
                    if (isset($existingARMap[$id])) {
                        $prevSt = explode('_', $existingARMap[$id])[0];
                        if ($prevSt === 'approved' || $prevSt === 'rejected') {
                            continue; // Finalized adjustment requests are immutable to non-admins
                        }
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

        // 8. Sync Void Requests (Admin Only; cashiers use transactional api/void.php)
        if ($actingRole === 'admin' && !empty($dbData['voidRequests']) && is_array($dbData['voidRequests'])) {
            $existingVRMap = [];
            $evrRes = $conn->query("SELECT id, status, reviewed_at FROM void_requests");
            if ($evrRes) {
                while ($evrRow = $evrRes->fetch_assoc()) {
                    $existingVRMap[$evrRow['id']] = $evrRow['status'] . '_' . (string)$evrRow['reviewed_at'];
                }
            }

            $stmt = $conn->prepare("INSERT INTO void_requests (id, sale_id, receipt_no, date, cashier_id, cashier_name, reason, explanation, total, items_json, status, reviewed_by, reviewed_at, admin_remarks, inventory_restored)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    sale_id = VALUES(sale_id),
                    receipt_no = VALUES(receipt_no),
                    date = VALUES(date),
                    cashier_id = VALUES(cashier_id),
                    cashier_name = VALUES(cashier_name),
                    reason = VALUES(reason),
                    explanation = VALUES(explanation),
                    total = VALUES(total),
                    items_json = VALUES(items_json),
                    status = VALUES(status),
                    reviewed_by = VALUES(reviewed_by),
                    reviewed_at = VALUES(reviewed_at),
                    admin_remarks = VALUES(admin_remarks),
                    inventory_restored = VALUES(inventory_restored)");

            foreach ($dbData['voidRequests'] as $vr) {
                $id = (string)$vr['id'];
                $status = (string)($vr['status'] ?? 'pending');
                $reviewedAt = safeDateSql($vr['reviewedAt'] ?? null, 'Y-m-d H:i:s', null);

                $vrSig = $status . '_' . (string)$reviewedAt;
                if (isset($existingVRMap[$id]) && $existingVRMap[$id] === $vrSig) {
                    continue; // Skip unchanged void request
                }

                $saleId = (string)($vr['saleId'] ?? '');
                $receiptNo = (string)($vr['receiptNo'] ?? '');
                $date = safeDateSql($vr['date'] ?? ($vr['requestDate'] ?? null), 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
                $cashierId = (string)($vr['cashierId'] ?? ($actingUserId ?: 'cashier'));
                $cashierName = (string)($vr['cashierName'] ?? ($actingUser['name'] ?? 'Cashier'));
                $reason = (string)($vr['reason'] ?? '');
                $explanation = (string)($vr['explanation'] ?? '');
                $total = (float)($vr['total'] ?? 0);
                $itemsJson = json_encode($vr['items'] ?? []);
                $reviewedBy = !empty($vr['reviewedBy']) ? (string)$vr['reviewedBy'] : null;
                $adminRemarks = !empty($vr['adminRemarks']) ? (string)$vr['adminRemarks'] : null;
                $inventoryRestored = !empty($vr['inventoryRestored']) ? 1 : 0;

                // RBAC: Only Admin can approve or reject void requests; all other roles can only submit pending
                if ($actingRole !== 'admin') {
                    if (isset($existingVRMap[$id])) {
                        $prevSt = explode('_', $existingVRMap[$id])[0];
                        if ($prevSt === 'approved' || $prevSt === 'rejected') {
                            $status = $prevSt;
                        } elseif ($prevSt === 'pending' && ($status === 'approved' || $status === 'rejected')) {
                            $status = 'pending';
                            $reviewedBy = null;
                            $reviewedAt = null;
                            $adminRemarks = null;
                            $inventoryRestored = 0;
                        }
                    } else {
                        $status = 'pending';
                        $reviewedBy = null;
                        $reviewedAt = null;
                        $adminRemarks = null;
                        $inventoryRestored = 0;
                    }
                }

                $stmt->bind_param("ssssssssdsssssi", $id, $saleId, $receiptNo, $date, $cashierId, $cashierName, $reason, $explanation, $total, $itemsJson, $status, $reviewedBy, $reviewedAt, $adminRemarks, $inventoryRestored);
                $stmt->execute();
            }
            $stmt->close();
        }

        $conn->commit();
        $respPayload = ['success' => true];
        if ($didColorSync) {
            $clAllPost = colorLibraryFetchAll($conn);
            $respPayload['colorLibrary'] = $clAllPost['colors'];
            $respPayload['syncedProducts'] = $syncedProductsMap;
        }
        echo json_encode($respPayload);
    } catch (Throwable $e) {
        $conn->rollback();
        $errCode = (int)$e->getCode();
        http_response_code(($errCode >= 400 && $errCode < 600) ? $errCode : 500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

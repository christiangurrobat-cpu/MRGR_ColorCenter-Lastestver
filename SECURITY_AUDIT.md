# System Health & Security Audit — MRGR Color Center

## 1. Architecture Overview

- **Backend**: `api/db.php` + `config/database.php` (MySQL `MRGR_ColorCenter` with transactional `INSERT ... ON DUPLICATE KEY UPDATE` state synchronization and automatic column migration).
- **Frontend**: Modular Vanilla JS single-page architecture (`core.js`, `shell.js`, `pos.js`, `color-mixing.js`, `inventory.js`, `receiving.js`, `purchase-orders.js`, `sales.js`, `reports.js`, `suppliers.js`, `users.js`, `alerts.js`).

---

## 2. Verified Safeguards & Integrity Rules

1. **Prepared Statements & Transactions**:
   - All MySQL writes in `api/db.php` run inside `$conn->begin_transaction()` using parameterized `prepare()` / `bind_param()` statements with automatic `$conn->rollback()` on failure.
2. **Stock & Per-Size Can Reconciliation**:
   - Sealed stock (`stock`) is kept in sync with per-size can counts (`1L`, `4L`, `16L` in `can_stock`) via `normalizeProductOpenedStock()`.
   - Fractional leftovers from Color Mixing are isolated in `opened_stock` (`openedStock`) and `opened_can_size` (`openedCanSize`), preventing fractional sealed cans.
3. **POS & Color Mix Stock Validation**:
   - POS validates both per-size sealed can counts and cumulative liters across standard product lines and custom color mix ingredients before completing a sale.
   - Changing a Color Mix quantity in the POS cart dynamically scales ingredient liters and verifies available stock (`sealed + opened`).
4. **Stock Adjustment Anti-Wipeout Guardrails**:
   - Manual stock deductions in `receiving.js` are capped at 50% of available stock and at most 5 cans per adjustment (`MAX_ADJ_DEDUCT_CANS = 5`, `MAX_ADJ_DEDUCT_RATIO = 0.5`), preventing accidental 100% inventory wipeouts.
5. **Same-Day Return & Exchange Policy**:
   - Returns and exchanges in `sales.js` are restricted to same-day receipts (`isSaleReturnWithinDay`), lock custom color mixes as Final Sale unless explicitly unlocked for store mixing error/defect, and validate replacement stock before committing.

---

## 3. Production Hardening Recommendations

If deploying beyond a trusted local/LAN store environment:
- **Server-Side Session Authentication**: Move authentication verification from client-side user matching to PHP `$_SESSION` with `password_hash()` / `password_verify()`, and omit password fields from `GET api/db.php`.
- **Role-Based API Authorization**: Enforce role permissions on `POST api/db.php` per entity table rather than accepting full-database snapshots from the client.
- **Environment Credentials**: Load MySQL credentials in `config/database.php` from environment variables when hosting outside local XAMPP.

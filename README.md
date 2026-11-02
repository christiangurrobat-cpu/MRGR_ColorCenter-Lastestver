# MRGR Color Center — Sales & Inventory System

A paint retail, custom color mixing, and inventory management system built with PHP, MySQL, and Vanilla JavaScript for **MRGR Color Center**.

---

## Key Features

- **Role-Based Dashboards & Navigation**:
  - **Administrator (`admin`)**: Executive dashboard, full inventory & product catalog, purchase order creation/approval, supplier management, user management, and comprehensive sales/inventory/mixing/returns reports.
  - **Cashier (`cashier`)**: Point of Sale (POS) with per-size can selection (`1L`, `4L`, `16L`), custom Color Mixing Studio integration, read-only inventory lookup, and same-day customer returns & exchanges.
  - **Inventory Staff (`staff`)**: Staff dashboard, stock receiving against approved Purchase Orders, stock adjustments (with anti-wipeout safeguards), Opened / Used Stock management, Color Mixing service logging, supplier directory, and low-stock alerts.
- **Per-Size Can & Opened / Used Stock Tracking**:
  - Sealed paint stock is tracked across `1L`, `4L`, and `16L` cans (`can_stock`) alongside total sealed liters (`stock`).
  - Partial cans opened during Color Mixing automatically transfer their remaining liters into **Opened / Used Stock** (`opened_stock` & `opened_can_size`) and are consumed first on subsequent color mixes before opening a new sealed can.
- **Paint Color Mixing Studio**:
  - Subtractive RYB/RGB pigment mixing engine with automatic shade & tone family detection, custom percentage balancing, preferred can-size selection (`Auto`, `1L`, `4L`, `16L`), and saved formula presets.
- **Purchase Orders & Stock Receiving**:
  - Multi-size PO creation (`1L`, `4L`, `16L`), Admin approval workflow (`pending` → `ordered` → `partial` / `received`), and partial/full delivery confirmation.
- **Same-Day Returns & Exchanges**:
  - Enforces same-day eligibility, fixed-size/quantity replacement selection, custom mix final-sale protection (with manager override for mixing defects), and printable Return & Exchange Voucher slips.

---

## Requirements

- **XAMPP** (PHP 7.4+ / 8.x and MySQL / MariaDB)
- Modern web browser (Chrome, Edge, Firefox)

---

## Quick Setup

1. **Start MySQL** in the XAMPP Control Panel.
2. **Launch the App**:
   - Double-click `start.bat`, `start-server.bat`, or `start-app.vbs` (starts PHP server on **`http://MRGR_ColorCenter`**), **or**
   - Start Apache in XAMPP and open `http://localhost/sales&inventory/`.
3. **Automatic Database Initialization**:
   - `config/database.php` automatically creates the `MRGR_ColorCenter` database and imports `database/schema.sql` if it does not yet exist, and `api/db.php` auto-migrates any new columns.

---

## Project Structure

```text
sales&inventory/
├── api/
│   └── db.php                 # MySQL state sync & auto-migration endpoint
├── assets/
│   ├── css/
│   │   ├── base.css           # Design tokens, typography, and layout primitives
│   │   ├── shell.css          # Sidebar, topbar, and login layout
│   │   ├── components.css     # Cards, tables, badges, and buttons
│   │   ├── pos.css            # Point of Sale & Color Mixing Studio styles
│   │   ├── purchase-orders.css# Purchase Order timeline, cards, and print views
│   │   ├── forms-modals.css   # Modals, forms, and bulk adjustment tables
│   │   └── charts-alerts.css  # Bar charts, alert banners, and toasts
│   └── js/
│       ├── core.js            # Storage adapter, helpers, and MySQL sync
│       ├── shell.js           # Role navigation, login, and stock/can helpers
│       ├── dashboards.js      # Admin & Inventory Staff dashboards
│       ├── pos.js             # Point of Sale & printable official receipts
│       ├── color-mixing.js    # Subtractive Color Mixing Studio & presets
│       ├── products.js        # Product creation & editing modals
│       ├── inventory.js       # Sortable/filterable inventory & stock table
│       ├── sales.js           # Sales history & same-day returns/exchanges
│       ├── reports.js         # Sales, stock movements, mixing, and return logs
│       ├── suppliers.js       # Supplier CRUD & product linking
│       ├── users.js           # Staff & user account management
│       ├── receiving.js       # PO delivery receiving & stock adjustments
│       ├── alerts.js          # Low-stock watchlist & reorder suggestions
│       ├── purchase-orders.js # Purchase Order lifecycle & print view
│       ├── modals.js          # Modal dialog system
│       └── boot.js            # Application bootstrapper
├── config/
│   └── database.php           # MySQL connection & auto-schema bootstrap
├── database/
│   └── schema.sql             # MRGR_ColorCenter MySQL schema
├── index.html                 # Main application shell
├── index.php                  # PHP entry wrapper
├── start.bat                  # Quick launcher (http://MRGR_ColorCenter)
└── README.md                  # System documentation
```

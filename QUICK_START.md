# Quick Start — MRGR Color Center

## Option A: One-Click Local Server (Recommended)

1. Open **XAMPP Control Panel** and start **MySQL**.
2. Double-click **`start.bat`** (or **`start-server.bat`** / **`start-app.vbs`**) in the project folder.
3. Your browser will open **`http://MRGR_ColorCenter`** automatically.
4. To stop the background server when using `start-app.vbs`, run **`stop-app.bat`**.

---

## Option B: Via XAMPP Apache

1. Open **XAMPP Control Panel** and start both **Apache** and **MySQL**.
2. Ensure the project folder is located at `C:\xampp\htdocs\sales&inventory`.
3. Open your browser and navigate to:
   ```text
   http://localhost/sales&inventory/
   ```

---

## Database Setup (`MRGR_ColorCenter`)

- The system connects to MySQL at `127.0.0.1` (`root`, empty password) and uses the database **`MRGR_ColorCenter`** (configured in `config/database.php`).
- If `MRGR_ColorCenter` does not exist yet, `config/database.php` automatically creates it and imports `database/schema.sql` on first request.
- You can also manually import `database/schema.sql` in **phpMyAdmin** (`http://localhost/phpmyadmin`).

---

## Core Workflows to Test

1. **Inventory & Can Breakdown (`Inventory`)**:
   - View total sealed stock (`L`), per-size sealed cans (`1L`, `4L`, `16L`), and leftover **Opened / Used Stock** (`L` and opened can size).
2. **Purchase Orders & Receiving (`Purchase Orders` → `Stock Receiving / Adjust`)**:
   - Create a PO for a supplier across `1L`, `4L`, and `16L` sizes, approve it as Admin, and receive full or partial deliveries as Inventory Staff.
3. **Point of Sale & Color Mixing Studio (`Point of Sale`)**:
   - Ring up `1L`, `4L`, or `16L` sealed cans or formulate a custom paint blend in the **Color Mixing Studio**.
   - Enter cash tendered and complete the sale to generate a printable Official Receipt.
4. **Same-Day Returns & Exchanges (`Sales History` / `Reports`)**:
   - Select a same-day receipt to process an even or price-adjusted exchange and print the Return & Exchange Voucher.

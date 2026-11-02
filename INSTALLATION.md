# Installation Guide — MRGR Color Center

## 1. Prerequisites

- **XAMPP** installed at `C:\xampp\` (PHP 7.4+ / 8.x and MySQL / MariaDB)
- Modern web browser (Chrome, Edge, or Firefox)

---

## 2. Database Configuration

1. Open **XAMPP Control Panel** and start **MySQL**.
2. Database settings are defined in `config/database.php`:
   ```php
   define('DB_HOST', '127.0.0.1');
   define('DB_USER', 'root');
   define('DB_PASS', '');
   define('DB_NAME', 'MRGR_ColorCenter');
   ```
3. On first load, `config/database.php` automatically creates the `MRGR_ColorCenter` database and runs `database/schema.sql`.
4. `api/db.php` automatically ensures all required columns (`can_stock`, `opened_stock`, `opened_can_size`, `cash_tendered`, `change_amount`) exist on `products` and `sales`.

---

## 3. Running the Application

### Using the Built-In Launcher
- Run `start.bat` or `start-server.bat` to start the PHP server at **`http://MRGR_ColorCenter`**.
- Or run `start-app.vbs` to launch the server hidden in the background at **`http://MRGR_ColorCenter`**, and `stop-app.bat` to stop it.

### Using XAMPP Apache
- Start **Apache** in the XAMPP Control Panel and visit `http://localhost/sales&inventory/`.

---

## 4. Troubleshooting

- **"Could not save to database — check connection"**:
  - Verify **MySQL** is running in XAMPP Control Panel.
  - Check `http://MRGR_ColorCenter/api/db.php` (or `http://localhost/sales&inventory/api/db.php`) in your browser to confirm it returns `{"success":true,"db":{...}}`.
- **Stale Browser Cache after Updates**:
  - Press `Ctrl + F5` (hard refresh) so the browser reloads the latest CSS and JS assets.

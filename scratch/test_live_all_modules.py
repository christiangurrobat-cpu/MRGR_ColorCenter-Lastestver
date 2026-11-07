import asyncio
import json
import subprocess
import urllib.request
import websockets

async def test_modules():
    print("================================================================================")
    print("LIVE BROWSER E2E TEST: ALL 14 MODULES & ROLES")
    print("================================================================================")
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9251',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9251/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1:8000' in t.get('url', '')]
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def eval_js(expr):
                nonlocal msg_id
                msg_id += 1
                await ws.send(json.dumps({
                    'id': msg_id,
                    'method': 'Runtime.evaluate',
                    'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}
                }))
                while True:
                    res = json.loads(await ws.recv())
                    if res.get('id') == msg_id:
                        if 'exceptionDetails' in res.get('result', {}):
                            raise Exception(f"JS Exception: {json.dumps(res['result']['exceptionDetails'])}")
                        return res.get('result', {}).get('result', {}).get('value')

            # 1. Login as Admin
            print("\n>>> Logging in as Admin...")
            login_res = await eval_js("""
            (async function() {
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'admin', password: 'admin123'})
                });
                const d = await res.json();
                if (d.success) {
                    currentUser = d.user;
                    await loadDB();
                }
                return { success: d.success, user: currentUser, salesCount: (db.sales || []).length };
            })()
            """)
            print(f"Admin Login Result: {login_res}")

            # 2. Test Admin Pages
            admin_pages = [
                ('Dashboard', 'dashboard', 'adminDashboard()'),
                ('POS', 'pos', 'posPage()'),
                ('Sales History', 'sales', 'salesHistoryPage()'),
                ('Inventory', 'inventory', 'inventoryPage()'),
                ('Low Stock Alerts', 'alerts', 'alertsPage()'),
                ('Purchase Orders', 'purchaseOrders', 'purchaseOrdersPage()'),
                ('Stock Receiving', 'receiving', 'receivingPage()'),
                ('Color Mixing Studio', 'colorMixing', 'colorMixingPage()'),
                ('Suppliers', 'suppliers', 'suppliersPage()'),
                ('Reports & Analytics', 'reports', 'reportsPage()'),
                ('Audit Logs', 'auditLog', 'auditLogPage()'),
                ('User Management', 'users', 'usersPage()'),
                ('Approvals Hub', 'approvals', 'approvalsPage()')
            ]

            print("\n--- TESTING ADMIN MODULE PAGES ---")
            for title, page_name, fn_call in admin_pages:
                res = await eval_js(f"""
                (function() {{
                    currentPage = '{page_name}';
                    try {{
                        const html = {fn_call};
                        if (typeof html !== 'string') return {{ error: 'Return value not a string: ' + typeof html }};
                        return {{
                            ok: true,
                            len: html.length,
                            hasTable: html.includes('<table'),
                            hasCard: html.includes('card') || html.includes('metric'),
                            hasBtn: html.includes('<button')
                        }};
                    }} catch (e) {{
                        return {{ error: e.message, stack: e.stack }};
                    }}
                }})()
                """)
                if res and res.get('ok'):
                    print(f"  [PASS] [ADMIN] {title:25s} : Rendered HTML ({res['len']} chars)")
                else:
                    print(f"  [FAIL] [ADMIN] {title:25s} : {res}")

            # 3. Test Cashier Role
            print("\n>>> Logging in as Cashier...")
            cashier_login = await eval_js("""
            (async function() {
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'cashier', password: 'cashier123'})
                });
                const d = await res.json();
                if (d.success) {
                    currentUser = d.user;
                    await loadDB();
                }
                return { success: d.success, user: currentUser, salesCount: (db.sales || []).length };
            })()
            """)
            print(f"Cashier Login Result: {cashier_login}")

            cashier_pages = [
                ('POS Module', 'pos', 'posPage()'),
                ('Inventory Lookup', 'inventory', 'inventoryPage()'),
                ('Sales History (Own)', 'sales', 'salesHistoryPage()'),
                ('Color Mixing Studio', 'colorMixing', 'colorMixingPage()')
            ]
            print("\n--- TESTING CASHIER MODULE PAGES ---")
            for title, page_name, fn_call in cashier_pages:
                res = await eval_js(f"""
                (function() {{
                    currentPage = '{page_name}';
                    try {{
                        const html = {fn_call};
                        if (typeof html !== 'string') return {{ error: 'Return value not a string: ' + typeof html }};
                        return {{
                            ok: true,
                            len: html.length
                        }};
                    }} catch (e) {{
                        return {{ error: e.message, stack: e.stack }};
                    }}
                }})()
                """)
                if res and res.get('ok'):
                    print(f"  [PASS] [CASHIER] {title:25s} : Rendered HTML ({res['len']} chars)")
                else:
                    print(f"  [FAIL] [CASHIER] {title:25s} : {res}")

            # Check Cashier RBAC blocking
            rbac_check = await eval_js("""
            (function() {
                const results = {};
                const restricted = ['users', 'auditLog', 'reports', 'approvals'];
                for (const p of restricted) {
                    results[p] = isPageAllowedForRole(currentUser.role, p);
                }
                return results;
            })()
            """)
            print(f"Cashier RBAC access check: {rbac_check}")

            # 4. Test Staff Role
            print("\n>>> Logging in as Staff...")
            staff_login = await eval_js("""
            (async function() {
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'staff', password: 'staff123'})
                });
                const d = await res.json();
                if (d.success) {
                    currentUser = d.user;
                    await loadDB();
                }
                return { success: d.success, user: currentUser };
            })()
            """)
            print(f"Staff Login Result: {staff_login}")

            staff_pages = [
                ('Staff Dashboard', 'staffDashboard', 'staffDashboard()'),
                ('Stock Receiving', 'receiving', 'receivingPage()'),
                ('Inventory Management', 'inventory', 'inventoryPage()'),
                ('Low Stock Alerts', 'alerts', 'alertsPage()'),
                ('Suppliers Directory', 'suppliers', 'suppliersPage()'),
                ('Color Mixing Studio', 'colorMixing', 'colorMixingPage()')
            ]
            print("\n--- TESTING STAFF MODULE PAGES ---")
            for title, page_name, fn_call in staff_pages:
                res = await eval_js(f"""
                (function() {{
                    currentPage = '{page_name}';
                    try {{
                        const html = {fn_call};
                        if (typeof html !== 'string') return {{ error: 'Return value not a string: ' + typeof html }};
                        return {{
                            ok: true,
                            len: html.length
                        }};
                    }} catch (e) {{
                        return {{ error: e.message, stack: e.stack }};
                    }}
                }})()
                """)
                if res and res.get('ok'):
                    print(f"  [PASS] [STAFF] {title:25s} : Rendered HTML ({res['len']} chars)")
                else:
                    print(f"  [FAIL] [STAFF] {title:25s} : {res}")

    finally:
        proc.kill()

asyncio.run(test_modules())

import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

async def test_ui_renderers():
    print("=== Testing UI Page Renderers in Headless Edge ===")
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9237',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9237/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1' in t.get('url', '')]
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            # Fix dashboards.js dynamically by removing lines 670:676
            with open('assets/js/dashboards.js', 'r', encoding='utf-8') as f:
                lines = f.readlines()
            del lines[670:676] # 0-indexed 670 is line 671
            fixed_code = "".join(lines)

            # Evaluate fixed code in global window scope
            fix_expr = f"window.eval({json.dumps(fixed_code)});"
            await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': fix_expr, 'returnByValue': True}}))
            res = json.loads(await ws.recv())
            print("Evaluated fixed dashboards.js:", res)

            # Check if adminDashboard and staffDashboard exist
            await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': '({ admin: typeof adminDashboard, staff: typeof staffDashboard })', 'returnByValue': True}}))
            res2 = json.loads(await ws.recv())
            print("Dashboard functions after eval:", res2.get('result', {}).get('result', {}).get('value'))

            # Test all pages for all 3 roles
            test_pages = [
                ('admin', 'dashboard', 'adminDashboard()'),
                ('admin', 'approvals', 'approvalsPage()'),
                ('admin', 'inventory', 'inventoryPage()'),
                ('admin', 'alerts', 'alertsPage()'),
                ('admin', 'purchaseOrders', 'purchaseOrdersPage()'),
                ('admin', 'suppliers', 'suppliersPage()'),
                ('admin', 'reports', 'reportsPage()'),
                ('admin', 'auditLog', 'auditLogPage()'),
                ('admin', 'users', 'usersPage()'),
                ('staff', 'staffDashboard', 'staffDashboard()'),
                ('staff', 'receiving', 'receivingPage()'),
                ('staff', 'suppliers', 'suppliersPage()'),
                ('staff', 'alerts', 'alertsPage()'),
                ('staff', 'inventory', 'inventoryPage()'),
                ('cashier', 'pos', 'posPage()'),
                ('cashier', 'inventory', 'inventoryPage()'),
                ('cashier', 'sales', 'salesHistoryPage()')
            ]

            msg_id = 10
            for role, page_name, eval_call in test_pages:
                msg_id += 1
                test_expr = f"""
                (function() {{
                    const u = db.users.find(x => x.role === '{role}');
                    currentUser = u;
                    currentPage = '{page_name}';
                    try {{
                        const html = {eval_call};
                        if (typeof html !== 'string') {{
                            return {{ success: false, error: 'Expected string HTML, got ' + typeof html }};
                        }}
                        const target = document.getElementById('page-content') || document.body;
                        target.innerHTML = html;
                        return {{
                            success: true,
                            htmlLength: html.length,
                            buttonsCount: target.querySelectorAll('button').length,
                            tablesCount: target.querySelectorAll('table').length,
                            inputsCount: target.querySelectorAll('input').length,
                            selectsCount: target.querySelectorAll('select').length
                        }};
                    }} catch (e) {{
                        return {{ success: false, error: e.toString(), stack: e.stack }};
                    }}
                }})()
                """
                await ws.send(json.dumps({'id': msg_id, 'method': 'Runtime.evaluate', 'params': {'expression': test_expr, 'returnByValue': True}}))
                eval_res = json.loads(await ws.recv())
                out = eval_res.get('result', {}).get('result', {}).get('value')
                status = "PASS" if out and out.get('success') else "FAIL"
                print(f"[{status}] [{role.upper()}] {page_name:16s}: {json.dumps(out)}")

    finally:
        proc.kill()

asyncio.run(test_ui_renderers())

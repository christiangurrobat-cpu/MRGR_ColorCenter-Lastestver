import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import os

async def run_live_browser_verification():
    print("=" * 70)
    print("RUNNING FINAL POST-FIX LIVE BROWSER VERIFICATION SUITE")
    print("=" * 70)

    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9244',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9244/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1' in t.get('url', '')]
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
                            raise Exception(f"JS Exception: {res['result']['exceptionDetails']}")
                        return res.get('result', {}).get('result', {}).get('value')

            # 1. Verify global functions load naturally without syntax errors
            res_globals = await eval_js("""
            ({
                adminDashboard: typeof adminDashboard,
                staffDashboard: typeof staffDashboard,
                posPage: typeof posPage,
                inventoryPage: typeof inventoryPage,
                alertsPage: typeof alertsPage,
                purchaseOrdersPage: typeof purchaseOrdersPage,
                receivingPage: typeof receivingPage,
                reportsPage: typeof reportsPage,
                salesHistoryPage: typeof salesHistoryPage,
                suppliersPage: typeof suppliersPage,
                usersPage: typeof usersPage,
                auditLogPage: typeof auditLogPage,
                approvalsPage: typeof approvalsPage
            })
            """)
            print("\n--- 1. Verified Native Global Functions Loading ---")
            for fn, t in res_globals.items():
                print(f"  [{'PASS' if t == 'function' else 'FAIL'}] {fn}: {t}")
                assert t == 'function', f"Function {fn} failed to load!"

            # 2. Verify Role Access Control in goTo()
            print("\n--- 2. Verifying Role Access Control & Boundaries ---")
            res_rbac = await eval_js("""
            (function() {
                const results = [];
                // Log in as Cashier
                currentUser = db.users.find(u => u.role === 'cashier');
                currentPage = 'pos';
                const restrictedForCashier = ['receiving', 'purchaseOrders', 'reports', 'suppliers', 'alerts', 'users', 'auditLog', 'approvals', 'dashboard', 'staffDashboard'];
                restrictedForCashier.forEach(target => {
                    goTo(target);
                    results.push({
                        role: 'cashier',
                        target,
                        blocked: currentPage !== target,
                        currentPage
                    });
                });

                // Verify allowed for Cashier
                ['pos', 'inventory', 'sales'].forEach(target => {
                    goTo(target);
                    results.push({
                        role: 'cashier',
                        target,
                        allowed: currentPage === target,
                        currentPage
                    });
                });

                // Log in as Staff
                currentUser = db.users.find(u => u.role === 'staff');
                currentPage = 'staffDashboard';
                const restrictedForStaff = ['pos', 'users', 'auditLog', 'approvals'];
                restrictedForStaff.forEach(target => {
                    goTo(target);
                    results.push({
                        role: 'staff',
                        target,
                        blocked: currentPage !== target,
                        currentPage
                    });
                });

                // Verify allowed for Staff
                ['staffDashboard', 'inventory', 'alerts', 'purchaseOrders', 'receiving', 'suppliers', 'reports'].forEach(target => {
                    goTo(target);
                    results.push({
                        role: 'staff',
                        target,
                        allowed: currentPage === target,
                        currentPage
                    });
                });

                return results;
            })()
            """)
            for r in res_rbac:
                if 'blocked' in r:
                    print(f"  [{'PASS' if r['blocked'] else 'FAIL'}] Role '{r['role']}' blocked from restricted module '{r['target']}'")
                    assert r['blocked'], f"Role {r['role']} was not blocked from {r['target']}"
                if 'allowed' in r:
                    print(f"  [{'PASS' if r['allowed'] else 'FAIL'}] Role '{r['role']}' permitted to access authorized module '{r['target']}'")
                    assert r['allowed'], f"Role {r['role']} was blocked from permitted module {r['target']}"

            # 3. Verify all pages render without exceptions
            print("\n--- 3. Verifying All Page Renderers ---")
            pages_to_render = [
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
            for role, pname, call in pages_to_render:
                expr = f"""
                (function() {{
                    currentUser = db.users.find(u => u.role === '{role}');
                    currentPage = '{pname}';
                    const html = {call};
                    const container = document.getElementById('page-content') || document.body;
                    container.innerHTML = html;
                    return {{
                        rendered: typeof html === 'string' && html.length > 0,
                        len: html.length,
                        buttons: container.querySelectorAll('button').length
                    }};
                }})()
                """
                out = await eval_js(expr)
                print(f"  [PASS] [{role.upper()}] {pname:16s} rendered successfully ({out['len']} bytes, {out['buttons']} buttons)")

            print("\n==============================================================")
            print("FINAL POST-FIX LIVE BROWSER VERIFICATION: ALL TESTS PASSED!")
            print("==============================================================")
    finally:
        proc.kill()

asyncio.run(run_live_browser_verification())


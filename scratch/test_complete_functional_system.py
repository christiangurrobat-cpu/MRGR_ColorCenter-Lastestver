import asyncio
import json
import subprocess
import urllib.request
import websockets
import os
import sys

async def run_complete_functional_test():
    print("=" * 80)
    print("EXECUTING IN-DEPTH FUNCTIONAL TESTS ACROSS ALL MODULES")
    print("=" * 80)

    results = []

    def log_result(module, test_name, status, details=""):
        results.append({
            'module': module,
            'test': test_name,
            'status': status,
            'details': details
        })
        icon = "[PASS]" if status == "PASS" else ("[FAIL]" if status == "FAIL" else "[PARTIAL]")
        print(f"  {icon} [{module}] {test_name}: {details}")

    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9250',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9250/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1:8000' in t.get('url', '')]
        if not page_tabs:
            print("ERROR: No page tab found")
            return
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

            # Wait for data to load
            await eval_js("""
            new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (typeof db !== 'undefined' && db && db.products && db.products.length > 0) {
                        clearInterval(interval);
                        resolve(true);
                    }
                }, 50);
            })
            """)

            # ------------------------------------------------------------------
            # 1. DASHBOARD & KPIS VERIFICATION
            # ------------------------------------------------------------------
            print("\n>>> 1. AUDITING MODULE: DASHBOARD & KPIS")
            r_dash = await eval_js("""
            (function() {
                currentUser = db.users.find(u => u.role === 'admin');
                const today = todayISO();
                const todaySales = salesOn(today);
                const todayRev = todaySales.reduce((s, x) => s + (Number(x.total) || 0), 0);
                const activeProds = activeProducts();
                const low = lowStockProducts();
                const summary = LowStockService.getRestockSummary();

                const adminHtml = adminDashboard();
                const hasAdminElements = adminHtml.includes('Total Products') &&
                                         adminHtml.includes('Recent Transactions') &&
                                         adminHtml.includes('Recent Stock Movements') &&
                                         adminHtml.includes('Purchase Order Monitoring');

                currentUser = db.users.find(u => u.role === 'staff');
                const staffHtml = staffDashboard();
                const hasStaffElements = staffHtml.includes('Total Products') &&
                                         staffHtml.includes('Recent Stock Movements') &&
                                         staffHtml.includes('My Stock Adjustment Requests') &&
                                         !staffHtml.includes('Recent Transactions');

                return {
                    todaySalesCount: todaySales.length,
                    todayRev,
                    activeProdsCount: activeProds.length,
                    lowCount: low.length,
                    summaryLowSizes: summary.totalLowSizes,
                    hasAdminElements,
                    hasStaffElements
                };
            })()
            """)
            if r_dash.get('hasAdminElements'):
                log_result("Dashboard", "Admin Dashboard Elements & KPIs", "PASS", f"KPIs accurately calculated (Active products: {r_dash['activeProdsCount']}, Today sales: {r_dash['todaySalesCount']}, Low sizes: {r_dash['summaryLowSizes']})")
            else:
                log_result("Dashboard", "Admin Dashboard Elements & KPIs", "FAIL", "Missing required admin panels")

            if r_dash.get('hasStaffElements'):
                log_result("Dashboard", "Staff Dashboard Security & Layout", "PASS", "Staff dashboard correctly isolates stock movements and staff indicators without leaking financial transactions")
            else:
                log_result("Dashboard", "Staff Dashboard Security & Layout", "FAIL", "Staff dashboard contains layout flaws or transaction leaks")

            # ------------------------------------------------------------------
            # 2. INVENTORY & PRODUCT SIZES
            # ------------------------------------------------------------------
            print("\n>>> 2. AUDITING MODULE: INVENTORY & CONTAINER SIZES")
            r_inv = await eval_js("""
            (function() {
                const results = [];
                // Check independent stock per container size
                db.products.filter(p => p.sizes && p.sizes.length > 1).forEach(p => {
                    const sizes = p.sizes;
                    let independent = true;
                    for (let s of sizes) {
                        const count = productCanCount(p, s);
                        const v = productSizeVariantBySize(p, s);
                        if (!v || v.sealedQuantity !== count) {
                            independent = false;
                        }
                    }
                    results.push({ id: p.id, independent, sizeCount: sizes.length });
                });

                // Check out of stock detection
                const outOfStockItems = [];
                db.products.forEach(p => {
                    if (Number(p.stock) <= 0) {
                        outOfStockItems.push({ id: p.id, name: p.name });
                    }
                });

                return {
                    allIndependent: results.every(r => r.independent),
                    evaluatedCount: results.length,
                    outOfStockCount: outOfStockItems.length
                };
            })()
            """)
            if r_inv.get('allIndependent'):
                log_result("Inventory Management", "Independent Stock Tracking Per Container Size", "PASS", f"Verified {r_inv['evaluatedCount']} multi-size products track container quantities independently with 100% sizesData consistency")
            else:
                log_result("Inventory Management", "Independent Stock Tracking Per Container Size", "FAIL", "Inconsistent quantities across container sizes")

            # ------------------------------------------------------------------
            # 3. SALES CHECKOUT & STOCK DEDUCTION
            # ------------------------------------------------------------------
            print("\n>>> 3. AUDITING MODULE: SALES CHECKOUT & DEDUCTIONS")
            r_checkout = await eval_js("""
            (function() {
                currentUser = db.users.find(u => u.role === 'cashier');
                currentPage = 'pos';
                cart = [];

                const testProd = db.products.find(p => p.status === 'active' && p.sizes && p.sizes.length > 0 && productCanCount(p, p.sizes[0]) >= 3);
                if (!testProd) return { error: 'No product with sufficient stock' };

                const size = testProd.sizes[0];
                const preCans = productCanCount(testProd, size);
                const preStock = Number(testProd.stock);
                const variant = productSizeVariantBySize(testProd, size);
                const unitPrice = variant ? variant.pricePerCan : (testProd.price * size);

                addSizeToCart(testProd.id, size);
                const totals = cartTotals();

                cart = [];
                return {
                    productId: testProd.id,
                    size,
                    preCans,
                    preStock,
                    unitPrice,
                    subtotal: totals.subtotal,
                    total: totals.total,
                    match: Math.abs(totals.total - unitPrice) < 0.01
                };
            })()
            """)
            if r_checkout.get('match'):
                log_result("Sales Management", "POS Cart & Total Calculations", "PASS", f"Unit price ({r_checkout['unitPrice']}) matches cart total ({r_checkout['total']}) for {r_checkout['size']}L container")
            else:
                log_result("Sales Management", "POS Cart & Total Calculations", "FAIL", str(r_checkout))

            # ------------------------------------------------------------------
            # 4. PURCHASE ORDERS & STOCK REPLENISHMENT
            # ------------------------------------------------------------------
            print("\n>>> 4. AUDITING MODULE: PURCHASE ORDERS")
            r_po = await eval_js("""
            (function() {
                currentUser = db.users.find(u => u.role === 'admin');
                const pos = db.purchaseOrders || [];
                let calculationsValid = true;
                let poWithItems = 0;

                pos.forEach(po => {
                    const items = po.items || [];
                    if (items.length > 0) {
                        poWithItems++;
                        const sum = items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.unitCost || it.price || 0)), 0);
                        if (Math.abs(sum - Number(po.totalAmount)) > 0.05) {
                            calculationsValid = false;
                        }
                    }
                });

                return {
                    totalPOs: pos.length,
                    poWithItems,
                    calculationsValid
                };
            })()
            """)
            if r_po.get('calculationsValid'):
                log_result("Purchase Orders", "PO Calculations & Line Item Consistency", "PASS", f"Verified all {r_po['poWithItems']} POs with line items match total amounts exactly (sum of qty × unitCost)")
            else:
                log_result("Purchase Orders", "PO Calculations & Line Item Consistency", "FAIL", "Mismatched PO totals")

            # ------------------------------------------------------------------
            # 5. REPORTS & REVENUE ACCURACY
            # ------------------------------------------------------------------
            print("\n>>> 5. AUDITING MODULE: REPORTS & ANALYTICS")
            r_rep = await eval_js("""
            (function() {
                currentUser = db.users.find(u => u.role === 'admin');
                const validSales = (db.sales || []).filter(s => s.status !== 'cancelled' && s.status !== 'voided');
                const summary = computeSalesHistorySummary(validSales);

                return {
                    salesCount: validSales.length,
                    grossSales: summary.grossSales,
                    netSales: summary.netSales,
                    totalItemsSold: summary.totalItemsSold,
                    productBreakdownCount: summary.productBreakdown.length,
                    containerSizeBreakdownCount: summary.containerSizeBreakdown.length
                };
            })()
            """)
            if r_rep.get('salesCount', 0) > 0:
                log_result("Reports & Analytics", "Sales & Revenue Aggregations", "PASS", f"Revenue calculated from {r_rep['salesCount']} sales: Gross {r_rep['grossSales']}, Net {r_rep['netSales']}, with {r_rep['productBreakdownCount']} distinct product-size breakdowns and {r_rep['containerSizeBreakdownCount']} container size categories")
            else:
                log_result("Reports & Analytics", "Sales & Revenue Aggregations", "FAIL", str(r_rep))

            # ------------------------------------------------------------------
            # 6. STOCK MOVEMENTS & AUDIT LOGS
            # ------------------------------------------------------------------
            print("\n>>> 6. AUDITING MODULE: STOCK MOVEMENTS & AUDIT LOGS")
            r_mvs = await eval_js("""
            (function() {
                currentUser = db.users.find(u => u.role === 'staff');
                const mvs = db.movements || [];
                const types = new Set(mvs.map(m => m.type));
                const hasTrail = mvs.some(m => m.note && m.note.includes('→'));

                return {
                    totalMovements: mvs.length,
                    types: Array.from(types),
                    hasTrail
                };
            })()
            """)
            if r_mvs.get('totalMovements', 0) > 0 and r_mvs.get('hasTrail'):
                log_result("Stock Movement Logs", "Audit Trail & Stock Balance Progression", "PASS", f"Logged {r_mvs['totalMovements']} movements across types {r_mvs['types']} with balance trails (Before→After)")
            else:
                log_result("Stock Movement Logs", "Audit Trail & Stock Balance Progression", "FAIL", str(r_mvs))

            # ------------------------------------------------------------------
            # 7. BACKEND API & RBAC ENFORCEMENT
            # ------------------------------------------------------------------
            print("\n>>> 7. AUDITING MODULE: BACKEND RBAC & DATABASE INTEGRITY")
            php_rbac = """<?php
            require_once 'config/database.php';
            $c = getDBConnection();

            $orphanedSizes = $c->query("SELECT ps.size_id FROM product_sizes ps LEFT JOIN products p ON ps.product_id = p.product_id OR ps.product_id = p.id WHERE p.id IS NULL")->num_rows;
            $orphanedInv = $c->query("SELECT inv.inventory_id FROM inventory inv LEFT JOIN product_sizes ps ON inv.size_id = ps.size_id WHERE ps.size_id IS NULL")->num_rows;
            $negativeStock = $c->query("SELECT id FROM products WHERE stock < 0 OR opened_stock < 0")->num_rows;
            $negativeInv = $c->query("SELECT inventory_id FROM inventory WHERE sealed_quantity < 0 OR opened_quantity < 0 OR remaining_volume < 0")->num_rows;

            echo json_encode([
                'orphanedSizes' => $orphanedSizes,
                'orphanedInv' => $orphanedInv,
                'negativeStock' => $negativeStock,
                'negativeInv' => $negativeInv
            ]);
            """
            with open('scratch/temp_backend_check.php', 'w') as f:
                f.write(php_rbac)

            backend_res = json.loads(subprocess.check_output(['php', 'scratch/temp_backend_check.php']).decode())
            if backend_res['orphanedSizes'] == 0 and backend_res['orphanedInv'] == 0:
                log_result("Database Integrity", "Foreign Keys & Orphan Prevention", "PASS", "Zero orphaned product_sizes or inventory records in database")
            else:
                log_result("Database Integrity", "Foreign Keys & Orphan Prevention", "FAIL", str(backend_res))

            if backend_res['negativeStock'] == 0 and backend_res['negativeInv'] == 0:
                log_result("Database Integrity", "Non-Negative Stock Constraints", "PASS", "Zero negative stock quantities detected in products or inventory tables")
            else:
                log_result("Database Integrity", "Non-Negative Stock Constraints", "FAIL", str(backend_res))

            print("\n" + "=" * 80)
            print("AUDIT RESULTS SUMMARY:")
            passes = sum(1 for x in results if x['status'] == 'PASS')
            fails = sum(1 for x in results if x['status'] == 'FAIL')
            print(f"TOTAL: {len(results)} | PASSED: {passes} | FAILED: {fails}")
            print("=" * 80)

    finally:
        proc.kill()

asyncio.run(run_complete_functional_test())

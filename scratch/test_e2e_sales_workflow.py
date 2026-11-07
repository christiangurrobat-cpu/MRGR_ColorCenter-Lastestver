import asyncio
import json
import subprocess
import urllib.request
import websockets

async def test_sales_and_inventory():
    print("================================================================================")
    print("LIVE BROWSER E2E TEST: SALES, TRANSACTIONS, DISCOUNTS, STOCK & VOID")
    print("================================================================================")
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9256',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9256/json/list').read().decode())
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

            # 1. Login as Cashier
            print(">>> Step 1: Login as Cashier...")
            await eval_js("""
            (async function() {
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'cashier', password: 'cashier123'})
                });
                const d = await res.json();
                currentUser = d.user;
                await loadDB();
            })()
            """)

            # 2. Test POS Cart & Discount Calculations
            print(">>> Step 2: Testing Cart Addition, Per-size Pricing, and 10% Discount Threshold...")
            cart_tests = await eval_js("""
            (function() {
                cart = [];
                const p = db.products.find(x => x.status === 'active' && x.sizes && x.sizes.length > 0 && productCanCount(x, 1) >= 5);
                if (!p) return { error: 'No test product found' };

                // Test adding 1L unit
                addSizeToCart(p.id, 1);
                const t1 = cartTotals();
                const unitPrice = t1.subtotal;

                // Test discount under 2500
                const isUnder2500 = t1.subtotal < 2500;
                const discUnder = t1.discount || 0;

                // Increase quantity to exceed 2500
                const neededUnits = Math.ceil(2500 / unitPrice);
                setCartQty(0, neededUnits);
                const t2 = cartTotals();
                const sub2 = t2.subtotal;
                const isOver2500 = sub2 >= 2500;
                const discExpected = Math.round(sub2 * 0.10 * 100) / 100;
                const discActual = t2.discount || t2.discountAmount || 0;
                const discMatch = Math.abs(discExpected - discActual) < 0.05;
                const totalExpected = Math.round((sub2 - discActual) * 100) / 100;
                const totalActual = t2.total;
                const totalMatch = Math.abs(totalExpected - totalActual) < 0.05;

                cart = []; // reset

                return {
                    productId: p.id,
                    unitPrice,
                    t1_subtotal: t1.subtotal,
                    isUnder2500,
                    discUnder,
                    neededUnits,
                    t2_subtotal: sub2,
                    isOver2500,
                    discExpected,
                    discActual,
                    discMatch,
                    totalExpected,
                    totalActual,
                    totalMatch
                };
            })()
            """)
            print(f"Cart & Discount Math: {json.dumps(cart_tests, indent=2)}")

            # 3. Test Returns & Exchanges Eligibility Rules
            print("\n>>> Step 3: Testing Returns & Exchanges Rules...")
            return_tests = await eval_js("""
            (function() {
                // Find a completed sale
                const s = (db.sales || []).find(x => x.status === 'completed' && Array.isArray(x.items) && x.items.length > 0);
                if (!s) return { error: 'No completed sale found' };

                const isSameDay = isSaleReturnWithinDay(s);
                
                // Sealed paint item policy
                const sealedItem = s.items.find(it => it.type === 'product');
                let sealedPolicy = null;
                if (sealedItem) {
                    sealedPolicy = getItemReturnPolicy(sealedItem, true, false);
                }

                // Color mix item policy
                const mixItem = s.items.find(it => it.type === 'colormix');
                let mixPolicy = null;
                if (mixItem) {
                    mixPolicy = getItemReturnPolicy(mixItem, true, false);
                }

                return {
                    receiptNo: s.receiptNo,
                    saleDate: s.date,
                    isSameDay,
                    sealedItemPolicy: sealedPolicy ? {
                        badgeText: sealedPolicy.badgeText,
                        restricted: sealedPolicy.restricted
                    } : null,
                    mixItemPolicy: mixPolicy ? {
                        badgeText: mixPolicy.badgeText,
                        restricted: mixPolicy.restricted
                    } : null
                };
            })()
            """)
            print(f"Returns & Exchanges Rules: {json.dumps(return_tests, indent=2)}")

            # 4. Test Cashier Submitting Void Request & Admin Approval
            print("\n>>> Step 4: Testing Cashier Void Request Submission and Admin Approval Workflow...")
            void_workflow = await eval_js("""
            (async function() {
                // Find a sale owned by cashier Ana Cruz
                const mySale = (db.sales || []).find(x => (x.cashierId === currentUser.id || x.cashierName === currentUser.name) && x.status === 'completed' && (x.refundTotal || 0) === 0);
                if (!mySale) return { error: 'No eligible cashier sale found' };

                // Submit void request via api/void.php
                const vRes = await fetch('api/void.php?action=submit_request', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        saleId: mySale.id,
                        reason: 'Customer cancelled transaction before taking goods',
                        explanation: 'Audit test void workflow verification'
                    })
                });
                const vData = await vRes.json();
                if (!vData.success) {
                    return { error: 'Void submission failed: ' + vData.error };
                }

                const voidReqId = vData.voidRequestId;

                // Re-fetch sale from backend
                const sAfterReq = await (await fetch(`api/db.php?action=get_sale&id=${mySale.id}`)).json();

                // Now login as Admin to approve
                const aLog = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'admin', password: 'admin123'})
                });
                const aLogData = await aLog.json();
                currentUser = aLogData.user;

                // Approve void request
                const appRes = await fetch('api/void.php?action=approve_request', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        voidRequestId: voidReqId,
                        adminRemarks: 'Approved in audit automated verification'
                    })
                });
                const appData = await appRes.json();

                // Re-fetch sale after approval
                const sAfterApp = await (await fetch(`api/db.php?action=get_sale&id=${mySale.id}`)).json();

                return {
                    receiptNo: mySale.receiptNo,
                    voidReqId,
                    submitSuccess: vData.success,
                    saleStatusAfterSubmit: sAfterReq.sale ? sAfterReq.sale.status : null,
                    approveSuccess: appData.success,
                    saleStatusAfterApprove: sAfterApp.sale ? sAfterApp.sale.status : null,
                    inventoryRestored: sAfterApp.sale ? sAfterApp.sale.voidInventoryRestored : null
                };
            })()
            """)
            print(f"Void Workflow Result: {json.dumps(void_workflow, indent=2)}")

    finally:
        proc.kill()

asyncio.run(test_sales_and_inventory())

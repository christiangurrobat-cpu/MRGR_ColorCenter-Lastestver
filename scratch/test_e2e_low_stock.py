import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9222
APP_URL = "http://127.0.0.1/"

async def run_e2e_test():
    print("=" * 60)
    print("STARTING MRGR COLOR CENTER LOW-STOCK E2E TEST SUITE")
    print("=" * 60)

    # 1. Launch Edge headless with remote debugging
    cmd = [
        EDGE_PATH,
        f"--remote-debugging-port={PORT}",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-background-networking",
        APP_URL
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)

        # 2. Get WebSocket debugger URL for page tab
        version_url = f"http://127.0.0.1:{PORT}/json/list"
        req = urllib.request.urlopen(version_url)
        tabs = json.loads(req.read().decode())
        page_tabs = [t for t in tabs if t.get("type") == "page"]
        assert len(page_tabs) > 0, "No page tabs found!"
        ws_url = page_tabs[0]["webSocketDebuggerUrl"]
        print(f"[CDP] Connected to Edge at {ws_url}")

        async with websockets.connect(ws_url) as ws:
            msg_id = 0

            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                payload = {"id": msg_id, "method": method, "params": params or {}}
                await ws.send(json.dumps(payload))
                while True:
                    res = json.loads(await ws.recv())
                    if res.get("id") == msg_id:
                        return res.get("result", {})

            async def eval_js(expr):
                res = await send_cmd("Runtime.evaluate", {
                    "expression": expr,
                    "returnByValue": True,
                    "awaitPromise": True
                })
                if "exceptionDetails" in res:
                    raise Exception(f"JS Exception: {res['exceptionDetails']}")
                return res.get("result", {}).get("value")

            # Enable Page domain
            await send_cmd("Page.enable")
            await send_cmd("Page.navigate", {"url": APP_URL})
            
            # Wait for app and database to load completely
            loaded = False
            for _ in range(40):
                await asyncio.sleep(0.5)
                try:
                    is_ready = await eval_js("window.location.href.indexOf('127.0.0.1') !== -1 && typeof db !== 'undefined' && db !== null && Array.isArray(db.users) && db.users.length > 0")
                    if is_ready:
                        loaded = True
                        break
                except Exception:
                    pass
            
            assert loaded, "App failed to load within 20 seconds!"

            # Check page title and login
            title = await eval_js("document.title")
            print(f"[TEST 1] Loaded App. Document Title: {title}")

            # Auto-login as Admin
            login_res = await eval_js("""
                (function() {
                    const u = db.users.find(x => x.username === 'admin');
                    if (u) {
                        currentUser = u;
                        localStorage.setItem('mrgr_user', JSON.stringify(u));
                        renderApp();
                        return { success: true, user: u.username, role: u.role };
                    }
                    return { success: false };
                })()
            """)
            print(f"[TEST 2] Admin login: {login_res}")
            assert login_res["success"], "Failed to log in as admin"
            await asyncio.sleep(1.0)

            # Verify LowStockService is defined
            has_service = await eval_js("typeof window.LowStockService === 'object' && window.LowStockService !== null")
            print(f"[TEST 3] LowStockService exists on window: {has_service}")
            assert has_service, "LowStockService not found on window!"

            # Test LowStockService.getRestockSummary()
            summary = await eval_js("LowStockService.getRestockSummary()")
            print(f"[TEST 4] Database-backed Restock Summary:")
            print(f"  - Total Low-Stock Products: {summary['totalLowProducts']}")
            print(f"  - Total Low-Stock Container Sizes: {summary['totalLowSizes']}")
            print(f"  - Products Needing PO: {summary['needsPOProducts']}")
            print(f"  - Sizes Needing PO: {summary['needsPOSizes']}")
            print(f"  - Products On Order: {summary['onOrderProducts']}")
            print(f"  - Sizes On Order: {summary['onOrderSizes']}")
            assert summary["totalLowProducts"] == 12, f"Expected 12 low products, got {summary['totalLowProducts']}"
            assert summary["totalLowSizes"] == 25, f"Expected 25 low sizes, got {summary['totalLowSizes']}"
            assert summary["onOrderSizes"] == 4, f"Expected 4 sizes on order, got {summary['onOrderSizes']}"
            assert summary["needsPOSizes"] == 21, f"Expected 21 sizes needing PO, got {summary['needsPOSizes']}"

            # Go to Dashboard and verify Low-Stock Watchlist panel
            await eval_js("goTo('dashboard')")
            await asyncio.sleep(0.5)

            dash_check = await eval_js("""
                (function() {
                    const panel = document.querySelector('.table-grouped-product');
                    const rows = document.querySelectorAll('.dash-row');
                    const sizeChks = document.querySelectorAll('.dash-size-chk');
                    const prodChks = document.querySelectorAll('.dash-prod-chk');
                    const sumEl = document.getElementById('dash-selection-summary');
                    const btn = document.getElementById('btn-dash-create-po');
                    return {
                        hasTable: !!panel,
                        rowCount: rows.length,
                        sizeChkCount: sizeChks.length,
                        prodChkCount: prodChks.length,
                        summaryText: sumEl ? sumEl.innerText : '',
                        btnDisabled: btn ? btn.disabled : null,
                        btnText: btn ? btn.innerText.trim() : ''
                    };
                })()
            """)
            print(f"[TEST 5] Dashboard Watchlist Table:")
            print(f"  - Row count: {dash_check['rowCount']}")
            print(f"  - Eligible Size Checkboxes: {dash_check['sizeChkCount']}")
            print(f"  - Product Checkboxes: {dash_check['prodChkCount']}")
            print(f"  - Summary Text: '{dash_check['summaryText']}'")
            print(f"  - PO Button Disabled: {dash_check['btnDisabled']}")
            assert dash_check["hasTable"], "Watchlist table not rendered!"
            assert dash_check["rowCount"] == 25, f"Expected 25 rows for low container sizes, got {dash_check['rowCount']}"
            assert dash_check["sizeChkCount"] == 21, f"Expected 21 eligible checkboxes (excluding 4 on order), got {dash_check['sizeChkCount']}"
            assert dash_check["btnDisabled"] is True, "Create PO button must be disabled when 0 items selected!"

            # Test on-order protection for PRD-011 (Boysen Permacoat Latex Yellow)
            on_order_check = await eval_js("""
                (function() {
                    const p11Rows = document.querySelectorAll('.dash-prod-row-PRD-011');
                    const allP11Chks = Array.from(document.querySelectorAll('.dash-prod-row-PRD-011 input[type="checkbox"]'));
                    const disabledCount = allP11Chks.filter(c => c && c.disabled).length;
                    const viewPOBtns = Array.from(p11Rows).filter(tr => tr.innerHTML.includes('View PO')).length;
                    return {
                        p11RowCount: p11Rows.length,
                        totalChks: allP11Chks.length,
                        disabledCount,
                        viewPOBtns
                    };
                })()
            """)
            print(f"[TEST 6] On-Order Protection for PRD-011:")
            print(f"  - PRD-011 Rows: {on_order_check['p11RowCount']}")
            print(f"  - Total Checkboxes (1 parent + 4 child): {on_order_check['totalChks']}")
            print(f"  - Disabled Checkboxes: {on_order_check['disabledCount']}")
            print(f"  - 'View PO' action buttons: {on_order_check['viewPOBtns']}")
            assert on_order_check["p11RowCount"] == 4, "PRD-011 should have 4 rows"
            assert on_order_check["disabledCount"] == 5, f"All checkboxes (1 parent + 4 child sizes) must be disabled, got {on_order_check['disabledCount']}"
            assert on_order_check["viewPOBtns"] == 4, "All 4 on-order sizes must have 'View PO' button"

            # Test parent-child hierarchical selection on Dashboard Watchlist
            # Find a product with 2 eligible sizes (e.g. PRD-001)
            sel_test_1 = await eval_js("""
                (function() {
                    // PRD-001 sizes: select first size
                    const p1 = db.products.find(x => x.id === 'PRD-001');
                    const eligible = LowStockService.getAllEligibleSizes([p1]);
                    LowStockService.clear();

                    // Select 1 size
                    LowStockService.toggleSize(eligible[0].productId, eligible[0].size, eligible[0].sizeId, true);
                    const stateAfter1 = LowStockService.getProductSelectionState('PRD-001');
                    const counts1 = LowStockService.getSelectionCount();
                    const prodChk = document.querySelector('.dash-prod-chk[data-product-id="PRD-001"]');

                    return {
                        stateAfter1,
                        counts1,
                        prodChkIndeterminate: prodChk ? prodChk.indeterminate : null,
                        prodChkChecked: prodChk ? prodChk.checked : null
                    };
                })()
            """)
            print(f"[TEST 7] Single Size Selection & Indeterminate Checkbox:")
            print(f"  - State for PRD-001: {sel_test_1['stateAfter1']}")
            print(f"  - Selection Counts: Products={sel_test_1['counts1']['prodCount']}, Sizes={sel_test_1['counts1']['sizeCount']}")
            print(f"  - Parent Checkbox Indeterminate: {sel_test_1['prodChkIndeterminate']}")
            assert sel_test_1["stateAfter1"] == "indeterminate", "Expected parent state 'indeterminate'"
            assert sel_test_1["prodChkIndeterminate"] is True, "Parent checkbox DOM element must have indeterminate=true"
            assert sel_test_1["counts1"]["prodCount"] == 1, "Expected 1 product selected"
            assert sel_test_1["counts1"]["sizeCount"] == 1, "Expected 1 size selected"

            # Select remaining sizes for PRD-001 -> parent should become checked
            sel_test_2 = await eval_js("""
                (function() {
                    const p1 = db.products.find(x => x.id === 'PRD-001');
                    const eligible = LowStockService.getAllEligibleSizes([p1]);
                    eligible.forEach(e => LowStockService.toggleSize(e.productId, e.size, e.sizeId, true));
                    const stateAfterAll = LowStockService.getProductSelectionState('PRD-001');
                    const countsAll = LowStockService.getSelectionCount();
                    const prodChk = document.querySelector('.dash-prod-chk[data-product-id="PRD-001"]');

                    return {
                        stateAfterAll,
                        countsAll,
                        prodChkIndeterminate: prodChk ? prodChk.indeterminate : null,
                        prodChkChecked: prodChk ? prodChk.checked : null
                    };
                })()
            """)
            print(f"[TEST 8] All Sizes for Product Selected:")
            print(f"  - State for PRD-001: {sel_test_2['stateAfterAll']}")
            print(f"  - Parent Checkbox Checked: {sel_test_2['prodChkChecked']}, Indeterminate: {sel_test_2['prodChkIndeterminate']}")
            assert sel_test_2["stateAfterAll"] == "checked", "Expected parent state 'checked'"
            assert sel_test_2["prodChkChecked"] is True, "Parent checkbox DOM element must have checked=true"
            assert sel_test_2["prodChkIndeterminate"] is False, "Parent checkbox indeterminate must be false"

            # Parent Checkbox toggle false -> clears all sizes for that product
            sel_test_3 = await eval_js("""
                (function() {
                    LowStockService.toggleProduct('PRD-001', false);
                    const countsAfterDeselect = LowStockService.getSelectionCount();
                    const stateAfterDeselect = LowStockService.getProductSelectionState('PRD-001');
                    return { countsAfterDeselect, stateAfterDeselect };
                })()
            """)
            print(f"[TEST 9] Deselect Parent Checkbox:")
            print(f"  - Counts: {sel_test_3['countsAfterDeselect']}")
            print(f"  - State: {sel_test_3['stateAfterDeselect']}")
            assert sel_test_3["countsAfterDeselect"]["sizeCount"] == 0, "Expected 0 sizes selected after deselecting product"
            assert sel_test_3["stateAfterDeselect"] == "unchecked", "Expected state 'unchecked'"

            # Test Select All and Clear Selection
            sel_all_test = await eval_js("""
                (function() {
                    toggleSelectAllDash(true);
                    const allCounts = LowStockService.getSelectionCount();
                    const btn = document.getElementById('btn-dash-create-po');
                    const sumEl = document.getElementById('dash-selection-summary');

                    // Check that PRD-011 (on order) was NOT selected
                    const p11Selected = Array.from(LowStockService.selectedKeys).filter(k => k.startsWith('PRD-011_')).length;

                    toggleSelectAllDash(false);
                    const clearCounts = LowStockService.getSelectionCount();

                    return {
                        allCounts,
                        p11Selected,
                        btnText: btn ? btn.innerText.trim() : '',
                        btnDisabled: btn ? btn.disabled : null,
                        sumText: sumEl ? sumEl.innerText : '',
                        clearCounts
                    };
                })()
            """)
            print(f"[TEST 10] Select All & Clear:")
            print(f"  - All Selected Products: {sel_all_test['allCounts']['prodCount']}, Sizes: {sel_all_test['allCounts']['sizeCount']}")
            print(f"  - PRD-011 Sizes Selected (Should be 0 because on order): {sel_all_test['p11Selected']}")
            print(f"  - Button Text with All Selected: '{sel_all_test['btnText']}'")
            print(f"  - Counts after Clear: {sel_all_test['clearCounts']['sizeCount']}")
            assert sel_all_test["allCounts"]["sizeCount"] == 21, f"Expected 21 eligible sizes, got {sel_all_test['allCounts']['sizeCount']}"
            assert sel_all_test["allCounts"]["prodCount"] == 11, f"Expected 11 products, got {sel_all_test['allCounts']['prodCount']}"
            assert sel_all_test["p11Selected"] == 0, "On-order sizes must NEVER be selected by Select All!"
            assert sel_all_test["clearCounts"]["sizeCount"] == 0, "Expected 0 sizes after Clear"

            # Navigate to Alerts Page and verify synchronization
            await eval_js("goTo('alerts')")
            await asyncio.sleep(0.5)

            alerts_check = await eval_js("""
                (function() {
                    const cards = document.querySelectorAll('.restock-card');
                    const rows = document.querySelectorAll('.alert-row');
                    const sizeChks = document.querySelectorAll('.alert-size-chk');
                    const prodChks = document.querySelectorAll('.alert-prod-chk');
                    const btn = document.getElementById('btn-create-po-alerts');
                    const sumEl = document.getElementById('alerts-selection-summary');

                    const totalEligibleAll = LowStockService.getAllEligibleSizes(getAlertsList()).length;

                    return {
                        cardCount: cards.length,
                        rowCount: rows.length,
                        sizeChkCount: sizeChks.length,
                        prodChkCount: prodChks.length,
                        totalEligibleAll,
                        btnDisabled: btn ? btn.disabled : null,
                        summaryText: sumEl ? sumEl.innerText : ''
                    };
                })()
            """)
            print(f"[TEST 11] Low-Stock Alerts Page:")
            print(f"  - Summary Cards count: {alerts_check['cardCount']}")
            print(f"  - Page 1 Table Row count: {alerts_check['rowCount']}")
            print(f"  - Page 1 Eligible Size Checkboxes: {alerts_check['sizeChkCount']}")
            print(f"  - Total Filtered Eligible Sizes (Across Pages): {alerts_check['totalEligibleAll']}")
            assert alerts_check["cardCount"] == 5, f"Expected 5 summary cards, got {alerts_check['cardCount']}"
            assert alerts_check["totalEligibleAll"] == 21, f"Expected 21 total eligible sizes, got {alerts_check['totalEligibleAll']}"

            # Test cross-module selection persistence: Select in Alerts, navigate to Dashboard, verify identical selection!
            sync_test = await eval_js("""
                (function() {
                    // Select 2 sizes of PRD-002 on Alerts
                    const p2 = db.products.find(x => x.id === 'PRD-002');
                    const el = LowStockService.getAllEligibleSizes([p2]);
                    LowStockService.clear();
                    el.forEach(e => LowStockService.toggleSize(e.productId, e.size, e.sizeId, true));
                    const countInAlerts = LowStockService.getSelectionCount();

                    // Switch to Dashboard
                    goTo('dashboard');
                    const dashBtn = document.getElementById('btn-dash-create-po');
                    const dashSum = document.getElementById('dash-selection-summary');
                    const countInDash = LowStockService.getSelectionCount();

                    return {
                        countInAlerts,
                        countInDash,
                        dashBtnText: dashBtn ? dashBtn.innerText.trim() : '',
                        dashSumText: dashSum ? dashSum.innerText : ''
                    };
                })()
            """)
            print(f"[TEST 12] Cross-Module Selection Synchronization:")
            print(f"  - Selected in Alerts: {sync_test['countInAlerts']}")
            print(f"  - Maintained in Dashboard: {sync_test['countInDash']}")
            print(f"  - Dashboard Button: '{sync_test['dashBtnText']}'")
            print(f"  - Dashboard Summary: '{sync_test['dashSumText']}'")
            assert sync_test["countInAlerts"]["sizeCount"] == sync_test["countInDash"]["sizeCount"], "Selection counts must match across modules!"
            assert sync_test["countInDash"]["sizeCount"] == 2, "Expected 2 sizes selected"

            # Test Purchase Order Confirmation Dialog & Creation Validation
            po_modal_test = await eval_js("""
                (function() {
                    // Open PO modal for currently selected items
                    LowStockService.createPOFromSelected();
                    const modal = document.querySelector('.modal-backdrop') || document.querySelector('.modal-box');
                    const title = modal ? modal.querySelector('h3') : null;
                    const table = modal ? modal.querySelector('table') : null;
                    const headers = table ? Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim()) : [];
                    const rows = table ? table.querySelectorAll('tbody tr') : [];

                    // Close modal without executing yet
                    const closeBtn = document.getElementById('btn-po-cancel');

                    return {
                        hasModal: !!modal,
                        titleText: title ? title.innerText : '',
                        headers,
                        rowCount: rows.length
                    };
                })()
            """)
            print(f"[TEST 13] PO Confirmation Dialog:")
            print(f"  - Has Modal: {po_modal_test['hasModal']}")
            print(f"  - Title: {po_modal_test['titleText']}")
            print(f"  - Table Headers: {po_modal_test['headers']}")
            print(f"  - Confirmation Rows: {po_modal_test['rowCount']}")
            assert po_modal_test["hasModal"], "Confirmation modal did not open"
            headers_upper = [h.upper() for h in po_modal_test["headers"]]
            assert "PRODUCT NAME" in headers_upper, "Missing 'Product Name' column in confirmation modal"
            assert "COLOR VARIANT" in headers_upper, "Missing 'Color Variant' column"
            assert "SUPPLIER" in headers_upper, "Missing 'Supplier' column"
            assert "CONTAINER SIZE" in headers_upper, "Missing 'Container Size' column"
            assert "CURRENT STOCK" in headers_upper, "Missing 'Current Stock' column"
            assert any("THRESHOLD" in h for h in headers_upper), "Missing 'Threshold' column"
            assert any("SUGGESTED" in h for h in headers_upper), "Missing 'Suggested Order Qty' column"
            assert po_modal_test["rowCount"] == 2, f"Expected 2 rows in PO confirmation dialog, got {po_modal_test['rowCount']}"

            # Execute PO creation and verify:
            # 1. New PO is created in DB
            # 2. Physical inventory stock is NOT changed
            # 3. Newly ordered sizes become ON ORDER
            # 4. Selection is cleared
            exec_po_test = await eval_js("""
                (async function() {
                    const stockBefore = db.products.find(x => x.id === 'PRD-002').stock;
                    const poCountBefore = (db.purchaseOrders || []).length;

                    // Execute PO
                    const result = await LowStockService.executePOCreation();

                    const stockAfter = db.products.find(x => x.id === 'PRD-002').stock;
                    const poCountAfter = (db.purchaseOrders || []).length;
                    const newPO = db.purchaseOrders[db.purchaseOrders.length - 1]; // appended to list
                    const selAfter = LowStockService.getSelectionCount();

                    // Check new PO status
                    const newPOStatus = newPO ? newPO.status : '';
                    const newPOItems = newPO ? newPO.items : [];

                    return {
                        result,
                        stockBefore,
                        stockAfter,
                        poCountBefore,
                        poCountAfter,
                        newPONumber: newPO ? newPO.poNumber : '',
                        newPOStatus,
                        newPOItemCount: newPOItems.length,
                        selCountAfter: selAfter.sizeCount
                    };
                })()
            """)
            print(f"[TEST 14] PO Creation Execution & Inventory Integrity:")
            print(f"  - PO Result: {exec_po_test['result']}")
            print(f"  - Physical Stock Before: {exec_po_test['stockBefore']} L -> After: {exec_po_test['stockAfter']} L")
            print(f"  - POs Count: {exec_po_test['poCountBefore']} -> {exec_po_test['poCountAfter']}")
            print(f"  - Created PO Number: {exec_po_test['newPONumber']} (Status: {exec_po_test['newPOStatus']})")
            print(f"  - Line items in new PO: {exec_po_test['newPOItemCount']}")
            print(f"  - Selections cleared: {exec_po_test['selCountAfter']} remaining")
            assert exec_po_test["stockBefore"] == exec_po_test["stockAfter"], "CRITICAL ERROR: Physical stock must NOT increase upon PO creation!"
            assert exec_po_test["poCountAfter"] == exec_po_test["poCountBefore"] + 1, "New PO record was not created!"
            assert exec_po_test["newPOItemCount"] == 2, f"Expected 2 line items in PO, got {exec_po_test['newPOItemCount']}"
            assert exec_po_test["selCountAfter"] == 0, "Selections must be cleared after PO creation"

            # Check that PRD-002 ordered sizes (4L and 16L) are now marked as ON ORDER
            po_status_check = await eval_js("""
                (function() {
                    const p2 = db.products.find(x => x.id === 'PRD-002');
                    const variant = productSizeVariantBySize(p2, 4);
                    const poSt = LowStockService.getVariantPOStatus(p2, 4, variant ? variant.sizeId : null);
                    const isEligible = LowStockService.isVariantEligible(p2, 4, variant ? variant.sizeId : null);
                    return { poStatus: poSt.status, poNumber: poSt.poNumber, isEligible };
                })()
            """)
            print(f"[TEST 15] Verified Newly Ordered Sizes Status:")
            print(f"  - PO Status: {po_status_check['poStatus']}")
            print(f"  - Linked PO Number: {po_status_check['poNumber']}")
            print(f"  - Eligible for Reorder: {po_status_check['isEligible']}")
            assert po_status_check["poStatus"] == "on_order", "Size must now have status 'on_order'"
            assert po_status_check["isEligible"] is False, "Size on order must NOT be eligible for duplicate order!"

            # Clean up the test PO to leave the database clean and unchanged
            await eval_js("""
                (function() {
                    db.purchaseOrders.pop();
                    saveDB();
                })()
            """)
            print("[TEST 16] Cleaned up temporary test PO. Database restored to baseline.")

            print("=" * 60)
            print("ALL 16 E2E LOW-STOCK TESTS PASSED PERFECTLY!")
            print("=" * 60)

    finally:
        proc.terminate()
        proc.wait()

if __name__ == '__main__':
    asyncio.run(run_e2e_test())

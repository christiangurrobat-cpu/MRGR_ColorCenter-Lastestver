import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9222
APP_URL = "http://127.0.0.1/"

async def run_verification():
    print("=" * 70)
    print("VERIFICATION: DASHBOARD LOW-STOCK WATCHLIST & ALERTS SEPARATION")
    print("=" * 70)

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

            await send_cmd("Page.enable")
            await send_cmd("Page.navigate", {"url": APP_URL})

            loaded = False
            for _ in range(40):
                await asyncio.sleep(0.5)
                try:
                    is_ready = await eval_js("typeof db !== 'undefined' && db !== null && Array.isArray(db.users) && db.users.length > 0")
                    if is_ready:
                        loaded = True
                        break
                except Exception:
                    pass

            assert loaded, "App failed to load!"

            # 1. Login as Admin and set dashboard as current page
            login_res = await eval_js("""
                (function() {
                    const u = db.users.find(x => x.username === 'admin');
                    currentUser = u;
                    currentPage = 'dashboard';
                    localStorage.setItem('mrgr_user', JSON.stringify(u));
                    localStorage.setItem('mrgr_page', 'dashboard');
                    renderApp();
                    return { success: true, role: u.role };
                })()
            """)
            print(f"[AUTH] Logged in as: {login_res}")

            # 2. Go to Dashboard
            await eval_js("goTo('dashboard')")
            await asyncio.sleep(0.5)

            # Test 1: Dashboard Low-Stock Watchlist
            dash_audit = await eval_js("""
                (function() {
                    // Find Watchlist panel
                    const panels = Array.from(document.querySelectorAll('.panel'));
                    const watchlistPanel = panels.find(p => p.innerText.includes('Low-Stock Watchlist'));
                    if (!watchlistPanel) return { error: 'Watchlist panel not found' };

                    const table = watchlistPanel.querySelector('table');
                    const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
                    const rows = watchlistPanel.querySelectorAll('tbody tr.dash-row');

                    // Check for forbidden controls on Dashboard
                    const chkBoxes = watchlistPanel.querySelectorAll('input[type="checkbox"]');
                    const sizeChks = watchlistPanel.querySelectorAll('.dash-size-chk');
                    const prodChks = watchlistPanel.querySelectorAll('.dash-prod-chk');
                    const chkAll = document.getElementById('chk-dash-all');
                    const sumEl = document.getElementById('dash-selection-summary');
                    const poBtn = document.getElementById('btn-dash-create-po');
                    
                    const buttons = Array.from(watchlistPanel.querySelectorAll('button')).map(b => b.innerText.trim());
                    const hasSelectAll = buttons.some(b => b.includes('Select All'));
                    const hasClearSelection = buttons.some(b => b.includes('Clear Selection'));
                    const hasCreatePOBtn = buttons.some(b => b.includes('Create Purchase Order') || b.includes('+ Create PO'));
                    const hasViewAllAlerts = buttons.some(b => b.includes('View All Alerts'));

                    return {
                        foundPanel: true,
                        thCount: ths.length,
                        headers: ths,
                        rowCount: rows.length,
                        totalChkBoxes: chkBoxes.length,
                        sizeChkCount: sizeChks.length,
                        prodChkCount: prodChks.length,
                        hasChkAll: !!chkAll,
                        hasSumEl: !!sumEl,
                        hasPoBtn: !!poBtn,
                        hasSelectAll,
                        hasClearSelection,
                        hasCreatePOBtn,
                        hasViewAllAlerts
                    };
                })()
            """)
            print("\n--- DASHBOARD LOW-STOCK WATCHLIST AUDIT ---")
            print(f"Panel Found: {dash_audit.get('foundPanel')}")
            print(f"Table Headers ({dash_audit.get('thCount')}): {dash_audit.get('headers')}")
            print(f"Total Rows: {dash_audit.get('rowCount')}")
            print(f"Checkboxes in Panel: {dash_audit.get('totalChkBoxes')} (Must be 0)")
            print(f"Size Checkboxes: {dash_audit.get('sizeChkCount')} (Must be 0)")
            print(f"Product Checkboxes: {dash_audit.get('prodChkCount')} (Must be 0)")
            print(f"Master Checkbox (chk-dash-all): {dash_audit.get('hasChkAll')} (Must be False)")
            print(f"Selection Summary (dash-selection-summary): {dash_audit.get('hasSumEl')} (Must be False)")
            print(f"Dashboard Create PO Button (btn-dash-create-po): {dash_audit.get('hasPoBtn')} (Must be False)")
            print(f"Has Select All button: {dash_audit.get('hasSelectAll')} (Must be False)")
            print(f"Has Clear Selection button: {dash_audit.get('hasClearSelection')} (Must be False)")
            print(f"Has Create PO button: {dash_audit.get('hasCreatePOBtn')} (Must be False)")
            print(f"Has View All Alerts link/button: {dash_audit.get('hasViewAllAlerts')} (Must be True)")

            assert dash_audit.get('foundPanel') is True, "Watchlist panel not found on dashboard"
            assert dash_audit.get('thCount') == 10, f"Expected 10 headers, got {dash_audit.get('thCount')}"
            assert dash_audit.get('totalChkBoxes') == 0, f"Dashboard must have 0 checkboxes, got {dash_audit.get('totalChkBoxes')}"
            assert dash_audit.get('hasChkAll') is False, "chk-dash-all must not exist"
            assert dash_audit.get('hasSumEl') is False, "dash-selection-summary must not exist"
            assert dash_audit.get('hasPoBtn') is False, "btn-dash-create-po must not exist"
            assert dash_audit.get('hasSelectAll') is False, "Dashboard must not have Select All button"
            assert dash_audit.get('hasClearSelection') is False, "Dashboard must not have Clear Selection button"
            assert dash_audit.get('hasCreatePOBtn') is False, "Dashboard must not have any Create PO button"
            assert dash_audit.get('hasViewAllAlerts') is True, "Dashboard must retain View All Alerts button"
            print(">>> [PASS] Dashboard Low-Stock Watchlist is cleanly separated and View-Only!")

            # 3. Test Navigation: Click View All Alerts -> should go to alerts page
            await eval_js("goTo('alerts')")
            await asyncio.sleep(0.5)

            # Test 2: Low-Stock Alerts Page Full Functionality Audit
            alerts_audit = await eval_js("""
                (function() {
                    const table = document.querySelector('#alerts-table-panel table');
                    const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
                    const rows = document.querySelectorAll('.alert-row');

                    const chkAll = document.getElementById('chk-all-alerts');
                    const prodChks = document.querySelectorAll('.alert-prod-chk');
                    const sizeChks = document.querySelectorAll('.alert-size-chk');
                    const sumEl = document.getElementById('alerts-selection-summary');
                    const poBtn = document.getElementById('btn-create-po-alerts');

                    const buttons = Array.from(document.querySelectorAll('#alerts-table-panel button')).map(b => b.innerText.trim());
                    const hasSelectAll = buttons.some(b => b.includes('Select All'));
                    const hasClearSelection = buttons.some(b => b.includes('Clear Selection'));
                    const hasCreatePO = buttons.some(b => b.includes('Create Purchase Order'));

                    return {
                        hasTable: !!table,
                        rowCount: rows.length,
                        hasChkAll: !!chkAll,
                        prodChkCount: prodChks.length,
                        sizeChkCount: sizeChks.length,
                        hasSumEl: !!sumEl,
                        sumText: sumEl ? sumEl.innerText : '',
                        hasPoBtn: !!poBtn,
                        poBtnText: poBtn ? poBtn.innerText : '',
                        poBtnDisabled: poBtn ? poBtn.disabled : null,
                        hasSelectAll,
                        hasClearSelection,
                        hasCreatePO
                    };
                })()
            """)
            print("\n--- LOW-STOCK ALERTS PAGE AUDIT ---")
            print(f"Table Found: {alerts_audit.get('hasTable')}")
            print(f"Alert Rows: {alerts_audit.get('rowCount')}")
            print(f"Master Checkbox (chk-all-alerts): {alerts_audit.get('hasChkAll')} (Must be True)")
            print(f"Product Checkboxes (alert-prod-chk): {alerts_audit.get('prodChkCount')} (Must be > 0)")
            print(f"Size Checkboxes (alert-size-chk): {alerts_audit.get('sizeChkCount')} (Must be > 0)")
            print(f"Selection Summary: '{alerts_audit.get('sumText')}'")
            print(f"Create PO Button: '{alerts_audit.get('poBtnText')}', Disabled: {alerts_audit.get('poBtnDisabled')}")
            print(f"Has Select All: {alerts_audit.get('hasSelectAll')} (Must be True)")
            print(f"Has Clear Selection: {alerts_audit.get('hasClearSelection')} (Must be True)")

            assert alerts_audit.get('hasTable') is True, "Alerts table not found"
            assert alerts_audit.get('hasChkAll') is True, "Master checkbox missing on Alerts page"
            assert alerts_audit.get('prodChkCount') > 0, "Product checkboxes missing on Alerts page"
            assert alerts_audit.get('sizeChkCount') > 0, "Size checkboxes missing on Alerts page"
            assert alerts_audit.get('hasSelectAll') is True, "Select All button missing on Alerts page"
            assert alerts_audit.get('hasClearSelection') is True, "Clear Selection button missing on Alerts page"
            assert alerts_audit.get('hasCreatePO') is True, "Create Purchase Order button missing on Alerts page"
            assert alerts_audit.get('poBtnDisabled') is True, "Create PO button must be disabled when 0 sizes selected"
            print(">>> [PASS] Low-Stock Alerts page retains full selection & PO creation controls!")

            # 4. Test Selection Logic: Individual Container Size Selection
            # Find a product with multiple eligible sizes
            sel_test = await eval_js("""
                (function() {
                    LowStockService.clear();

                    // Find a product with multiple eligible sizes (e.g. PRD-001 or first product with > 1 eligible sizes)
                    const low = lowStockProducts();
                    const multiSizeProd = low.find(p => LowStockService.getProductEligibleSizes(p).length > 1);
                    if (!multiSizeProd) return { error: 'No multi-size product found' };

                    const eligible = LowStockService.getProductEligibleSizes(multiSizeProd);
                    const pid = multiSizeProd.id;
                    const size0 = eligible[0];
                    const size1 = eligible[1];

                    // Select ONLY size0
                    LowStockService.toggleSize(pid, size0.size, size0.sizeId, true);

                    const isSize0Selected = LowStockService.isSelected(pid, size0.size, size0.sizeId);
                    const isSize1Selected = LowStockService.isSelected(pid, size1.size, size1.sizeId);
                    const prodState1 = LowStockService.getProductSelectionState(pid);
                    const sum1 = LowStockService.getSelectedSummary();

                    const size0Chk = document.querySelector(`.alert-size-chk[data-product-id="${pid}"][data-size="${size0.size}"]`);
                    const size1Chk = document.querySelector(`.alert-size-chk[data-product-id="${pid}"][data-size="${size1.size}"]`);
                    const prodChk = document.querySelector(`.alert-prod-chk[data-product-id="${pid}"]`);

                    // Now select size1 as well
                    LowStockService.toggleSize(pid, size1.size, size1.sizeId, true);
                    const isSize1SelectedNow = LowStockService.isSelected(pid, size1.size, size1.sizeId);
                    const prodStateAll = LowStockService.getProductSelectionState(pid);
                    const sum2 = LowStockService.getSelectedSummary();

                    return {
                        pid,
                        prodName: multiSizeProd.name,
                        eligibleCount: eligible.length,
                        size0: size0.size,
                        size1: size1.size,
                        isSize0Selected,
                        isSize1Selected,
                        prodState1,
                        sum1Sizes: sum1.sizeCount,
                        sum1Prods: sum1.productCount,
                        size0ChkChecked: size0Chk ? size0Chk.checked : null,
                        size1ChkChecked: size1Chk ? size1Chk.checked : null,
                        prodChkIndeterminate: prodChk ? prodChk.indeterminate : null,
                        isSize1SelectedNow,
                        prodStateAll,
                        sum2Sizes: sum2.sizeCount
                    };
                })()
            """)
            print("\n--- SELECTION LOGIC AUDIT ---")
            print(f"Product tested: {sel_test.get('prodName')} ({sel_test.get('pid')}) with {sel_test.get('eligibleCount')} eligible sizes")
            print(f"Step 1: Selected only {sel_test.get('size0')}:")
            print(f"  - Size {sel_test.get('size0')} selected: {sel_test.get('isSize0Selected')}")
            print(f"  - Size {sel_test.get('size1')} selected: {sel_test.get('isSize1Selected')} (Must be False!)")
            print(f"  - Product Selection State: '{sel_test.get('prodState1')}' (Must be 'indeterminate')")
            print(f"  - DOM Parent Checkbox Indeterminate: {sel_test.get('prodChkIndeterminate')}")
            print(f"  - Summary: {sel_test.get('sum1Sizes')} Size, {sel_test.get('sum1Prods')} Product")
            assert sel_test.get('isSize0Selected') is True, "Size 0 must be selected"
            assert sel_test.get('isSize1Selected') is False, "Size 1 must NOT be automatically selected!"
            assert sel_test.get('prodState1') == 'indeterminate', "Product state must be indeterminate when only 1 size is selected"
            assert sel_test.get('sum1Sizes') == 1, "Expected exactly 1 size in summary"
            assert sel_test.get('sum1Prods') == 1, "Expected 1 product in summary"

            print(f"Step 2: Selected {sel_test.get('size1')} as well:")
            print(f"  - Size {sel_test.get('size1')} selected: {sel_test.get('isSize1SelectedNow')}")
            print(f"  - Product Selection State: '{sel_test.get('prodStateAll')}'")
            print(f"  - Summary: {sel_test.get('sum2Sizes')} Sizes")
            assert sel_test.get('sum2Sizes') == 2, "Expected 2 sizes selected"
            print(">>> [PASS] Granular container size selection verified! Selecting one size does NOT select other sizes.")

            # 5. Test PO Modal Creation Validation
            # When only 1 container size is selected, PO modal must ONLY contain that 1 container size!
            po_modal_audit = await eval_js("""
                (function() {
                    LowStockService.clear();
                    const low = lowStockProducts();
                    const multiSizeProd = low.find(p => LowStockService.getProductEligibleSizes(p).length > 1);
                    const eligible = LowStockService.getProductEligibleSizes(multiSizeProd);
                    const size0 = eligible[0];

                    // Select ONLY size0
                    LowStockService.toggleSize(multiSizeProd.id, size0.size, size0.sizeId, true);

                    // Open PO creation modal
                    LowStockService.openPOCreationModal();

                    const modal = document.querySelector('.modal-overlay');
                    const modalItems = window._poModalGroups ? window._poModalGroups.flatMap(g => g.items) : [];
                    
                    // Close modal
                    closeModal();

                    return {
                        hasModal: !!modal,
                        itemCount: modalItems.length,
                        modalItemSize: modalItems.length > 0 ? modalItems[0].size : null,
                        modalItemProd: modalItems.length > 0 ? modalItems[0].productId : null
                    };
                })()
            """)
            print("\n--- PO CREATION VALIDATION AUDIT ---")
            print(f"PO Confirmation Modal Items: {po_modal_audit.get('itemCount')} (Expected 1)")
            print(f"Item Size in Modal: {po_modal_audit.get('modalItemSize')}")
            assert po_modal_audit.get('itemCount') == 1, f"Expected exactly 1 item in PO modal, got {po_modal_audit.get('itemCount')}"
            print(">>> [PASS] Purchase Order Modal correctly includes ONLY the selected container size!")

            # 6. Test Select All and Clear Selection buttons
            sel_all_clear = await eval_js("""
                (function() {
                    toggleSelectAllAlerts(true);
                    const allCount = LowStockService.getSelectionCount();
                    const totalEligible = LowStockService.getAllEligibleSizes(getAlertsList()).length;

                    toggleSelectAllAlerts(false);
                    const clearCount = LowStockService.getSelectionCount();

                    return {
                        allCount: allCount.sizeCount,
                        totalEligible,
                        clearCount: clearCount.sizeCount
                    };
                })()
            """)
            print("\n--- SELECT ALL & CLEAR SELECTION AUDIT ---")
            print(f"Total Eligible: {sel_all_clear.get('totalEligible')}")
            print(f"Sizes Selected by Select All: {sel_all_clear.get('allCount')}")
            print(f"Sizes after Clear Selection: {sel_all_clear.get('clearCount')}")
            assert sel_all_clear.get('allCount') == sel_all_clear.get('totalEligible'), "Select All must select all eligible sizes"
            assert sel_all_clear.get('clearCount') == 0, "Clear Selection must clear all sizes"
            print(">>> [PASS] Select All & Clear Selection work perfectly!")

            print("\n" + "=" * 70)
            print("ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY!")
            print("=" * 70)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(run_verification())

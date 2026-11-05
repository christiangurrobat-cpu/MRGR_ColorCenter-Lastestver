import asyncio
import json
import subprocess
import urllib.request
import websockets

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9222
APP_URL = "http://127.0.0.1/"

TABS = [
    'all',
    'sales',
    'history',
    'inventory',
    'low_stock',
    'movements',
    'purchase_orders',
    'receiving',
    'suppliers',
    'turnover',
    'custom_mix',
    'returns'
]

async def test_all_tabs():
    cmd = [
        EDGE_PATH,
        f"--remote-debugging-port={PORT}",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        APP_URL
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list").read().decode())
        ws_url = [t for t in tabs if t.get("type") == "page"][0]["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url) as ws:
            msg_id = 0
            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                await ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
                while True:
                    res = json.loads(await ws.recv())
                    if res.get("id") == msg_id:
                        return res.get("result", {})

            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            async def eval_js(expr):
                res = await send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
                if "exceptionDetails" in res:
                    raise Exception(f"JS Exception: {res['exceptionDetails']}")
                return res.get("result", {}).get("value")

            for _ in range(30):
                await asyncio.sleep(0.5)
                ready = await eval_js("typeof window.db !== 'undefined' && window.db !== null && Array.isArray(window.db.users) && window.db.users.length > 0")
                if ready:
                    break

            await eval_js("""
                (function() {
                    const u = db.users.find(x => x.username === 'admin');
                    currentUser = u;
                    localStorage.setItem('mrgr_color_center_session', JSON.stringify({ userId: u.id }));
                    goTo('reports');
                })()
            """)
            await asyncio.sleep(1.0)

            print("Testing each tab in Reports:")
            for tab_name in TABS:
                js_code = """
                    (function() {
                        try {
                            setReportTab('""" + tab_name + """');
                            const target = document.getElementById('report-tab-content') || document.getElementById('page-content');
                            return {
                                success: true,
                                tab: '""" + tab_name + """',
                                contentLength: target ? target.innerHTML.length : 0
                            };
                        } catch (e) {
                            return {
                                success: false,
                                tab: '""" + tab_name + """',
                                error: e.message,
                                stack: e.stack
                            };
                        }
                    })()
                """
                res = await eval_js(js_code)
                print(f"  Tab '{tab_name}': Success={res.get('success')}, ContentLength={res.get('contentLength')}, Error={res.get('error')}")
                assert res.get('success') is True, f"Tab {tab_name} failed: {res.get('error')}"
                assert res.get('contentLength') > 50, f"Tab {tab_name} rendered empty content"

            print("\nALL REPORT TABS FUNCTION CORRECTLY AND RENDER RICH CONTENT!")
    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(test_all_tabs())

import asyncio
import json
import subprocess
import urllib.request
import websockets

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9222
APP_URL = "http://127.0.0.1/"

async def test():
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
                    print("EXC:", res["exceptionDetails"])
                return res.get("result", {}).get("value")

            # Wait for DB to load
            for _ in range(30):
                await asyncio.sleep(0.5)
                ready = await eval_js("typeof window.db !== 'undefined' && window.db !== null && Array.isArray(window.db.users) && window.db.users.length > 0")
                if ready:
                    break

            print("DB loaded!")
            print("typeof reportsPage:", await eval_js("typeof reportsPage"))

            login_res = await eval_js("""
                (function() {
                    const u = db.users.find(x => x.username === 'admin');
                    currentUser = u;
                    localStorage.setItem('mrgr_color_center_session', JSON.stringify({ userId: u.id }));
                    goTo('reports');
                    return { user: u.username, role: u.role };
                })()
            """)
            print("Login res:", login_res)
            await asyncio.sleep(1.0)

            audit = await eval_js("""
                (function() {
                    const title = document.getElementById('page-title') ? document.getElementById('page-title').innerText : '';
                    const content = document.getElementById('page-content') ? document.getElementById('page-content').innerHTML : '';
                    const tabs = Array.from(document.querySelectorAll('.report-toggle-btn')).map(b => b.innerText.trim());
                    const cards = Array.from(document.querySelectorAll('.stat-card')).map(c => c.innerText.trim().split('\\n')[0]);
                    return {
                        title,
                        contentLength: content.length,
                        tabs,
                        cardCount: cards.length,
                        cards: cards.slice(0, 8)
                    };
                })()
            """)
            print("AUDIT:", json.dumps(audit, indent=2))
    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(test())

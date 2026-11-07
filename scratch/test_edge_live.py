import asyncio
import json
import subprocess
import urllib.request
import websockets

async def check():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9240',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9240/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1:8000' in t.get('url', '')]
        if not page_tabs:
            print("No page tab found:", tabs)
            return
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            async def call(method, params=None):
                nonlocal msg_id
                msg_id += 1
                await ws.send(json.dumps({'id': msg_id, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await ws.recv())
                    if m.get('id') == msg_id:
                        return m.get('result', {})

            await ws.send(json.dumps({'id': 100, 'method': 'Console.enable'}))
            await ws.send(json.dumps({'id': 101, 'method': 'Runtime.enable'}))

            # Wait a moment for scripts to execute and initial data load
            await asyncio.sleep(2)

            res = await call('Runtime.evaluate', {
                'expression': """
                ({
                    dbLoaded: typeof db !== 'undefined' && db !== null && Object.keys(db).length > 0,
                    currentUser: typeof currentUser !== 'undefined' ? currentUser : null,
                    currentPage: typeof currentPage !== 'undefined' ? currentPage : null,
                    adminDashboardType: typeof adminDashboard,
                    staffDashboardType: typeof staffDashboard,
                    posPageType: typeof posPage,
                    reportsPageType: typeof reportsPage,
                    inventoryPageType: typeof inventoryPage,
                    appHtmlLength: document.getElementById('app') ? document.getElementById('app').innerHTML.length : 0
                })
                """,
                'returnByValue': True
            })
            print("LIVE BROWSER STATE:", json.dumps(res, indent=2))
    finally:
        proc.kill()

asyncio.run(check())


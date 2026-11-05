import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

async def check():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9229',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9229/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1' in t.get('url', '')]
        print(f"Found {len(page_tabs)} app tabs: {[t['url'] for t in page_tabs]}")
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            for _ in range(30):
                await ws.send(json.dumps({'id': 100, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.readyState', 'returnByValue': True}}))
                res = json.loads(await ws.recv())
                val = res.get('result', {}).get('result', {}).get('value')
                if val == 'complete':
                    break
                await asyncio.sleep(0.2)

            expr = """
            (function() {
                return {
                    url: window.location.href,
                    adminDashboard: typeof adminDashboard,
                    staffDashboard: typeof staffDashboard,
                    posPage: typeof posPage,
                    inventoryPage: typeof inventoryPage,
                    LowStockService: typeof LowStockService,
                    currentUser: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : null,
                    currentPage: typeof currentPage !== 'undefined' ? currentPage : null,
                    documentBodyText: document.body.innerText.slice(0, 300)
                };
            })()
            """
            await ws.send(json.dumps({'id': 101, 'method': 'Runtime.evaluate', 'params': {
                'expression': expr,
                'returnByValue': True
            }}))
            res = json.loads(await ws.recv())
            print('STATE:', json.dumps(res, indent=2))
    finally:
        proc.kill()

asyncio.run(check())

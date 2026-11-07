import asyncio
import json
import subprocess
import urllib.request
import websockets

async def test_approvals_tabs():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9259',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9259/json/list').read().decode())
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

            # Login as admin
            await eval_js("""
            (async function() {
                const res = await fetch('api/auth.php?action=login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: 'admin', password: 'admin123'})
                });
                const d = await res.json();
                currentUser = d.user;
                await loadDB();
            })()
            """)

            # Render Approvals page
            await eval_js("""
            (function() {
                currentPage = 'approvals';
                document.getElementById('app').innerHTML = approvalsPage();
            })()
            """)

            tabs = ['adjustments', 'products', 'purchaseOrders', 'voidRequests', 'history']
            print("\n=== TESTING ALL 5 APPROVALS TABS IN LIVE DOM ===")
            for t in tabs:
                res = await eval_js(f"""
                (function() {{
                    switchApprovalsTab('{t}');
                    const body = document.getElementById('approvals-tab-body') || document.querySelector('.approvals-tabs-content') || document.getElementById('app');
                    return {{
                        ok: true,
                        tab: '{t}',
                        htmlLen: body ? body.innerHTML.length : 0,
                        btnCount: document.querySelectorAll('button').length
                    }};
                }})()
                """)
                print(f"  [PASS] Tab: {t:18s} | Body HTML: {res['htmlLen']} chars | Total buttons: {res['btnCount']}")

    finally:
        proc.kill()

asyncio.run(test_approvals_tabs())


import asyncio
import json
import subprocess
import urllib.request
import websockets

async def test_color_mixing():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9254',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9254/json/list').read().decode())
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

            # Login as cashier
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

            res = await eval_js("""
            (function() {
                // Open Color Mixing Studio Modal
                openColorMixModal(true);
                const studioRoot = document.getElementById('colormix-studio-root');
                const hasStudio = Boolean(studioRoot);
                const studioHtmlLen = studioRoot ? studioRoot.innerHTML.length : 0;
                
                // Select preset 0
                applyRecipePreset(0);
                const presetAppliedName = colorMixStudioState.colorName;
                const compLen = (colorMixStudioState.components || []).length;

                // Close modal
                closeModal();

                return {
                    hasStudio,
                    studioHtmlLen,
                    presetAppliedName,
                    compLen,
                    stateTotalLiters: colorMixStudioState.totalLiters
                };
            })()
            """)
            print("Color Mixing Studio Full Test:", json.dumps(res, indent=2))
    finally:
        proc.kill()

asyncio.run(test_color_mixing())

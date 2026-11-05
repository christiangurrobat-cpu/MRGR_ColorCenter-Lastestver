import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

async def check():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9232',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9232/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1' in t.get('url', '')]
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            # Let's inspect all scripts that were loaded
            msg_id = 1
            async def call(method, params=None):
                nonlocal msg_id
                msg_id += 1
                await ws.send(json.dumps({'id': msg_id, 'method': method, 'params': params or {}}))
                while True:
                    m = json.loads(await ws.recv())
                    if m.get('id') == msg_id:
                        return m.get('result', {})

            # Check network requests or script tags in DOM
            res = await call('Runtime.evaluate', {
                'expression': """
                Array.from(document.querySelectorAll('script')).map(s => ({
                    src: s.src,
                    loaded: typeof window[s.src.split('/').pop().split('?')[0].replace('.js', '')]
                }))
                """,
                'returnByValue': True
            })
            print('SCRIPTS IN DOM:', json.dumps(res, indent=2))

            # Check what functions exist on window
            res2 = await call('Runtime.evaluate', {
                'expression': """
                ({
                    window_adminDashboard: typeof window.adminDashboard,
                    window_staffDashboard: typeof window.staffDashboard,
                    hasDashboardVar: 'adminDashboard' in window,
                    windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('dash'))
                })
                """,
                'returnByValue': True
            })
            print('WINDOW DASH:', json.dumps(res2, indent=2))
    finally:
        proc.kill()

asyncio.run(check())


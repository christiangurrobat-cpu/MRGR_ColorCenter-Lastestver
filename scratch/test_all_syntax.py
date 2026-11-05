import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import os

async def check_all():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9235',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9235/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            js_dir = 'assets/js'
            for fname in sorted(os.listdir(js_dir)):
                if not fname.endswith('.js'): continue
                fpath = os.path.join(js_dir, fname)
                with open(fpath, 'r', encoding='utf-8') as f:
                    code = f.read()
                wrapped = 'try { new Function(' + json.dumps(code) + '); "OK"; } catch(e) { e.message + " at " + e.stack; }'
                await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': wrapped, 'returnByValue': True}}))
                res = json.loads(await ws.recv())
                val = res.get('result', {}).get('result', {}).get('value')
                if val == 'OK':
                    print(f"VALID: {fname}")
                else:
                    print(f"SYNTAX ERROR in {fname}: {val}")
    finally:
        proc.kill()

asyncio.run(check_all())


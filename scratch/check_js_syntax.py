import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import os

async def check():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9231',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9231/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page']
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            js_dir = 'assets/js'
            for fname in sorted(os.listdir(js_dir)):
                if not fname.endswith('.js'): continue
                fpath = os.path.join(js_dir, fname)
                with open(fpath, 'r', encoding='utf-8') as f:
                    code = f.read()
                
                payload = {
                    'id': 1,
                    'method': 'Runtime.compileScript',
                    'params': {
                        'expression': code,
                        'sourceURL': fname,
                        'persistScript': False
                    }
                }
                await ws.send(json.dumps(payload))
                res = json.loads(await ws.recv())
                if 'exceptionDetails' in res.get('result', {}):
                    ex = res['result']['exceptionDetails']
                    print(f"SYNTAX ERROR in {fname} line {ex.get('lineNumber')+1}:{ex.get('columnNumber')}: {ex.get('text')} - {ex.get('exception', {}).get('description')}")
                else:
                    print(f"OK: {fname}")
    finally:
        proc.kill()

asyncio.run(check())


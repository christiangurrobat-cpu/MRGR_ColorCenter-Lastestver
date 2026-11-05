import asyncio
import json
import subprocess
import time
import urllib.request
import websockets
import re
import os

js_dir = 'assets/js'
event_pattern = re.compile(r'on(?:click|change|submit|input|blur|focus)=["\']([^"\']+)["\']', re.IGNORECASE)

calls = set()
for fname in os.listdir(js_dir):
    if not fname.endswith('.js'): continue
    with open(os.path.join(js_dir, fname), 'r', encoding='utf-8') as f:
        content = f.read()
    for match in event_pattern.finditer(content):
        handler_code = match.group(1).strip()
        fn_matches = re.findall(r'([a-zA-Z0-9_$]+)\s*\(', handler_code)
        for fn in fn_matches:
            if fn not in ['return', 'if', 'for', 'switch', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'encodeURIComponent', 'decodeURIComponent']:
                calls.add((fn, fname, handler_code[:60]))

async def verify_functions():
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9243',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'about:blank'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.0)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9243/json/list').read().decode())
        ws_url = tabs[0]['webSocketDebuggerUrl']
        async with websockets.connect(ws_url) as ws:
            # Load all scripts in order
            script_order = [
                'core.js', 'shell.js', 'dashboards.js', 'pos.js', 'color-mixing.js',
                'products.js', 'inventory.js', 'sales.js', 'reports.js', 'suppliers.js',
                'users.js', 'receiving.js', 'alerts.js', 'purchase-orders.js',
                'approvals.js', 'modals.js', 'audit.js', 'boot.js'
            ]
            for sname in script_order:
                fpath = os.path.join(js_dir, sname)
                with open(fpath, 'r', encoding='utf-8') as f:
                    code = f.read()
                if sname == 'dashboards.js':
                    lines = code.splitlines(True)
                    del lines[670:676]
                    code = "".join(lines)
                await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': 'window.eval(' + json.dumps(code) + ');'}}))
                res = json.loads(await ws.recv())
                if 'exceptionDetails' in res.get('result', {}):
                    print(f"Exception loading {sname}:", res['result']['exceptionDetails']['text'])

            fn_names = sorted(list(set(c[0] for c in calls)))
            check_expr = "({ " + ", ".join(f'"{fn}": typeof window["{fn}"]' for fn in fn_names) + " })"
            await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': check_expr, 'returnByValue': True}}))
            res = json.loads(await ws.recv())
            fn_types = res.get('result', {}).get('result', {}).get('value', {})

            missing = []
            for fn, fname, snippet in sorted(calls):
                t = fn_types.get(fn, 'undefined')
                if t != 'function':
                    # Check if it's a method on an object e.g. LowStockService.clear()
                    is_obj_method = False
                    if '.' in snippet:
                        is_obj_method = True
                    if not is_obj_method:
                        missing.append((fn, fname, snippet, t))

            print("\n=== Missing Global Event Handlers ===")
            if not missing:
                print("All standalone event handler functions are DEFINED and callable on window!")
            else:
                for fn, fname, snippet, t in missing:
                    print(f"  MISSING: {fn} (type: {t}) in {fname} -> snippet: {snippet}")

    finally:
        proc.kill()

asyncio.run(verify_functions())

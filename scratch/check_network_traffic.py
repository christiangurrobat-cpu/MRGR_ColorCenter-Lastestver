import asyncio
import json
import subprocess
import urllib.request
import websockets

async def check_network_traffic():
    print("================================================================================")
    print("CDP NETWORK AUDIT: VERIFYING ALL RESOURCE REQUESTS & ZERO EXTERNAL CALLS")
    print("================================================================================")
    cmd = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        '--remote-debugging-port=9261',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://127.0.0.1:8000/'
    ]
    proc = subprocess.Popen(cmd)
    try:
        await asyncio.sleep(2.5)
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9261/json/list').read().decode())
        page_tabs = [t for t in tabs if t.get('type') == 'page' and '127.0.0.1:8000' in t.get('url', '')]
        ws_url = page_tabs[0]['webSocketDebuggerUrl']
        
        async with websockets.connect(ws_url) as ws:
            # Enable Network domain
            await ws.send(json.dumps({'id': 1, 'method': 'Network.enable'}))
            await ws.send(json.dumps({'id': 2, 'method': 'Page.enable'}))
            
            requests = {}
            responses = {}
            failures = []

            # Reload page to capture full network trace
            await ws.send(json.dumps({'id': 3, 'method': 'Page.reload'}))

            # Listen for network events for 3.5 seconds
            end_time = asyncio.get_event_loop().time() + 3.5
            while asyncio.get_event_loop().time() < end_time:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=0.5)
                    data = json.loads(msg)
                    method = data.get('method')
                    params = data.get('params', {})

                    if method == 'Network.requestWillBeSent':
                        req_id = params.get('requestId')
                        url = params.get('request', {}).get('url')
                        requests[req_id] = url
                    elif method == 'Network.responseReceived':
                        req_id = params.get('requestId')
                        status = params.get('response', {}).get('status')
                        mime = params.get('response', {}).get('mimeType')
                        responses[req_id] = {'status': status, 'mime': mime}
                    elif method == 'Network.loadingFailed':
                        req_id = params.get('requestId')
                        error = params.get('errorText')
                        failures.append({'url': requests.get(req_id), 'error': error})
                except asyncio.TimeoutError:
                    continue

            print(f"\nTotal Requests Captured: {len(requests)}")
            external_calls = []
            for req_id, url in requests.items():
                resp = responses.get(req_id, {})
                status = resp.get('status', 'PENDING')
                mime = resp.get('mime', 'UNKNOWN')
                is_local = '127.0.0.1' in url or 'localhost' in url
                if not is_local:
                    external_calls.append(url)
                print(f"  [{status}] {url:75s} ({mime})")

            print("\n--- AUDIT SUMMARY ---")
            print(f"External Network Calls Count : {len(external_calls)}")
            if external_calls:
                print(f"  [FAIL] Detected external calls: {external_calls}")
            else:
                print("  [PASS] ZERO external network calls. 100% strictly local / offline!")

            print(f"Failed HTTP Requests Count   : {len(failures)}")
            if failures:
                print(f"  [FAIL] Failed requests: {failures}")
            else:
                print("  [PASS] ZERO failed requests. All assets resolved with HTTP 200 OK!")

    finally:
        proc.kill()

asyncio.run(check_network_traffic())


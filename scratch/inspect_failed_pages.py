import asyncio
import json
import urllib.request
import websockets

async def inspect_pages():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9246/json/list').read().decode())
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
                'params': {'expression': expr, 'returnByValue': True}
            }))
            while True:
                res = json.loads(await ws.recv())
                if res.get('id') == msg_id:
                    return res.get('result', {})

        res = await eval_js("""
        (function() {
            currentUser = db.users.find(u => u.role === 'admin');
            return {
                repType: typeof reportsPage,
                repSnippet: typeof reportsPage === 'function' ? reportsPage().slice(0, 150) : null,
                usrType: typeof usersPage,
                usrSnippet: typeof usersPage === 'function' ? usersPage().slice(0, 150) : null,
                audType: typeof auditLogPage,
                audSnippet: typeof auditLogPage === 'function' ? auditLogPage().slice(0, 150) : null,
                invType: typeof inventoryPage,
                invSnippet: typeof inventoryPage === 'function' ? inventoryPage().slice(0, 150) : null,
            };
        })()
        """)
        print("INSPECTION:", json.dumps(res, indent=2))

asyncio.run(inspect_pages())


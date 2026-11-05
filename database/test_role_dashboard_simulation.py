import urllib.request
import json
import re

url = "http://127.0.0.1/api/db.php"
req = urllib.request.urlopen(url)
data = json.loads(req.read().decode('utf-8'))
db = data['db']

print("=== Simulating Dashboard Logic for Roles ===")

# --- 1. ADMIN SIMULATION ---
currentUser_admin = {"id": "u1", "username": "admin", "name": "Mike Revadulla", "role": "admin"}

pendingAdj_admin = [r for r in db.get('adjustmentRequests', []) if r.get('status') == 'pending']
pendingPOs_admin = [o for o in db.get('purchaseOrders', []) if o.get('status') == 'pending']
pendingInv_admin = [p for p in db.get('products', []) if (
    p.get('status') == 'pending_approval' or
    bool(p.get('pendingEdit')) or
    bool(p.get('pendingSizes')) or
    (p.get('pendingPrice') is not None and float(p.get('pendingPrice') or 0) > 0)
)]
totalPending_admin = len(pendingAdj_admin) + len(pendingPOs_admin) + len(pendingInv_admin)

print(f"Admin Dashboard:")
print(f"  - Total Pending Approvals: {totalPending_admin}")
print(f"  - Breakdown: {len(pendingAdj_admin)} adjustments, {len(pendingPOs_admin)} POs, {len(pendingInv_admin)} catalog")
assert totalPending_admin == 1, f"Expected 1 total pending, got {totalPending_admin}"
assert len(pendingAdj_admin) == 1, f"Expected 1 pending adjustment, got {len(pendingAdj_admin)}"
assert len(pendingPOs_admin) == 0, f"Expected 0 pending POs, got {len(pendingPOs_admin)}"

# --- 2. STAFF SIMULATION ---
currentUser_staff = {"id": "u3", "username": "staff", "name": "Jun Santos", "role": "staff"}
staffName = currentUser_staff['name'].strip().lower()
staffUsername = currentUser_staff['username'].strip().lower()

myPendingAdj_staff = [r for r in db.get('adjustmentRequests', []) if (
    r.get('status') == 'pending' and
    (r.get('requestedBy', '').strip().lower() in (staffName, staffUsername))
)]

print(f"\nStaff Dashboard (Logged in: Jun Santos):")
print(f"  - My Stock Adjustment Requests (Awaiting Admin Approval): {len(myPendingAdj_staff)}")
assert len(myPendingAdj_staff) == 1, f"Expected 1 request submitted by Jun Santos, got {len(myPendingAdj_staff)}"

# --- 3. OTHER STAFF SIMULATION (e.g. Maria who submitted 0 requests) ---
currentUser_other = {"id": "u4", "username": "maria", "name": "Maria Lopez", "role": "staff"}
otherName = currentUser_other['name'].strip().lower()
otherUsername = currentUser_other['username'].strip().lower()

myPendingAdj_other = [r for r in db.get('adjustmentRequests', []) if (
    r.get('status') == 'pending' and
    (r.get('requestedBy', '').strip().lower() in (otherName, otherUsername))
)]

print(f"\nStaff Dashboard (Logged in: Maria Lopez - No submissions):")
print(f"  - My Stock Adjustment Requests: {len(myPendingAdj_other)}")
assert len(myPendingAdj_other) == 0, f"Expected 0 requests for Maria, got {len(myPendingAdj_other)}"

print("\n>>> ALL DASHBOARD SIMULATION CHECKS PASSED SUCCESSFULLY! <<<")

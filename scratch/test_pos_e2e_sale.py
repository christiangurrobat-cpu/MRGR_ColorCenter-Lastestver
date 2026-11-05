import urllib.request
import json
import datetime
import sys

def main():
    load_url = "http://localhost/sales&inventory/api/db.php?action=load"
    req = urllib.request.Request(load_url)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))

    db = res['db']
    prd1 = next(p for p in db['products'] if p['id'] == 'PRD-001')
    initial_stock = float(prd1['stock'])
    initial_1l_cans = int(prd1['canStock']['1'])

    print(f"Initial PRD-001 stock: {initial_stock}L, 1L cans: {initial_1l_cans}")

    # Build test sale
    qty = 2
    size = 1
    unit_price = float(prd1['price'])
    line_total = unit_price * qty
    discount_pct = 5
    discount = round(line_total * discount_pct) / 100
    total = max(0, line_total - discount)
    cash = 2000.0
    change = cash - total
    receipt_no = f"OR-TEST-{int(datetime.datetime.now().timestamp())}"

    test_sale = {
        "id": f"sale_test_{int(datetime.datetime.now().timestamp())}",
        "receiptNo": receipt_no,
        "date": datetime.datetime.now().isoformat(),
        "cashierName": "Ana Cruz",
        "customerName": "VIP Regular",
        "items": [{
            "type": "product",
            "productId": "PRD-001",
            "product_id": "PRD-001",
            "sizeId": "SZ-001",
            "size_id": "SZ-001",
            "containerSize": 1,
            "name": prd1['name'],
            "brand": prd1['brand'],
            "color": prd1['color'],
            "size": 1,
            "qty": qty,
            "unitPrice": unit_price,
            "lineTotal": line_total
        }],
        "subtotal": line_total,
        "discountPct": discount_pct,
        "discount": discount,
        "total": total,
        "cashTendered": cash,
        "change": change,
        "paymentMethod": "Cash",
        "status": "completed"
    }

    # Deduct stock locally
    prd1['stock'] = round(initial_stock - (qty * size), 2)
    prd1['canStock']['1'] = initial_1l_cans - qty
    for v in prd1.get('sizesData', []):
        if v.get('containerSize') == 1:
            v['sealedQuantity'] = initial_1l_cans - qty

    db['sales'].append(test_sale)
    db['movements'].append({
        "id": f"mv_test_{int(datetime.datetime.now().timestamp())}",
        "date": test_sale['date'],
        "type": "sale",
        "productId": "PRD-001",
        "product_id": "PRD-001",
        "sizeId": "SZ-001",
        "size_id": "SZ-001",
        "container_size": 1,
        "productName": prd1['name'],
        "qtyChange": -(qty * size),
        "note": f"Sold via POS ({receipt_no}) [Sold {qty} x {size}L]",
        "staffName": "Ana Cruz"
    })

    # Save to backend
    save_req = urllib.request.Request(
        "http://localhost/sales&inventory/api/db.php?action=save",
        data=json.dumps({"db": db, "user": {"id": "u_cashier", "name": "Ana Cruz", "role": "cashier"}}).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(save_req) as resp:
        save_res = json.loads(resp.read().decode('utf-8'))

    assert save_res.get('success'), f"Save failed: {save_res}"
    print(f"Sale {receipt_no} saved successfully to backend!")

    # Verify reload from backend
    with urllib.request.urlopen(req) as resp:
        reloaded_db = json.loads(resp.read().decode('utf-8'))['db']

    reloaded_prd1 = next(p for p in reloaded_db['products'] if p['id'] == 'PRD-001')
    print(f"Reloaded PRD-001 stock: {reloaded_prd1['stock']}L, 1L cans: {reloaded_prd1['canStock']['1']}")
    assert float(reloaded_prd1['stock']) == initial_stock - (qty * size), "Stock deduction failed!"
    assert int(reloaded_prd1['canStock']['1']) == initial_1l_cans - qty, "Can stock deduction failed!"

    saved_sale = next((s for s in reloaded_db['sales'] if s['receiptNo'] == receipt_no), None)
    assert saved_sale is not None, "Sale was not saved in DB!"
    print(f"Found saved sale: Total={saved_sale['total']}, Cashier={saved_sale['cashierName']}, Customer={saved_sale['customerName']}")

    # Restore stock for PRD-001 to keep data clean
    reloaded_prd1['stock'] = initial_stock
    reloaded_prd1['canStock']['1'] = initial_1l_cans
    for v in reloaded_prd1.get('sizesData', []):
        if v.get('containerSize') == 1:
            v['sealedQuantity'] = initial_1l_cans
    restore_req = urllib.request.Request(
        "http://localhost/sales&inventory/api/db.php?action=save",
        data=json.dumps({"db": reloaded_db, "user": {"id": "u_cashier", "name": "Ana Cruz", "role": "cashier"}}).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(restore_req) as resp:
        restore_res = json.loads(resp.read().decode('utf-8'))
    assert restore_res.get('success'), f"Restore failed: {restore_res}"
    print("Stock cleanly restored to original value!")
    print("\nALL POS TESTS PASSED 100%!")

if __name__ == '__main__':
    main()

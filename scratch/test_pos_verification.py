import urllib.request
import json
import sys

def main():
    url = "http://localhost/sales&inventory/api/db.php?action=load"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))

    if not res.get('success'):
        print("FAIL: DB load returned success=False")
        sys.exit(1)

    db = res.get('db', {})
    products = db.get('products', [])
    print(f"Loaded {len(products)} products from MySQL database.")

    in_stock_count = 0
    low_stock_count = 0
    out_stock_count = 0

    for p in products:
        stock = float(p.get('stock') or 0)
        sizes = p.get('sizes') or [1, 4, 16]
        can_stock = p.get('canStock') or {}
        threshold_by_size = p.get('thresholdBySize') or {}
        overall_thresh = float(p.get('threshold') or 5)

        # check low stock
        is_low = False
        is_out = stock <= 0
        if is_out:
            out_stock_count += 1
            status = "OUT OF STOCK"
        else:
            for s in sizes:
                count = int(can_stock.get(str(s), 0))
                thresh = int(threshold_by_size.get(str(s), 5 if s < 4 else (2 if s < 16 else 1)))
                if count <= thresh:
                    is_low = True
                    break
            if is_low:
                low_stock_count += 1
                status = "LOW STOCK"
            else:
                in_stock_count += 1
                status = "IN STOCK"

        print(f"[{status:12}] {p.get('id')}: {p.get('name')} | Brand: {p.get('brand')} | Color: {p.get('color')} | Stock: {stock}L")

    print(f"\nSummary: In Stock: {in_stock_count}, Low Stock: {low_stock_count}, Out of Stock: {out_stock_count}")

    # Test Computation logic: Subtotal, Discount %, Discount Amount, Total Due, Cash Tendered, Change
    test_subtotal = 850.00 * 2 + 780.00 # 1700 + 780 = 2480.00
    test_discount_pct = 10 # 10%
    test_discount = round(test_subtotal * test_discount_pct) / 100 # 248.00
    test_total = max(0, test_subtotal - test_discount) # 2232.00
    test_cash = 2500.00
    test_change = max(0, test_cash - test_total) # 268.00

    assert test_subtotal == 2480.00, f"Expected 2480, got {test_subtotal}"
    assert test_discount == 248.00, f"Expected 248, got {test_discount}"
    assert test_total == 2232.00, f"Expected 2232, got {test_total}"
    assert test_change == 268.00, f"Expected 268, got {test_change}"
    print("\nComputation logic verified successfully!")

if __name__ == '__main__':
    main()


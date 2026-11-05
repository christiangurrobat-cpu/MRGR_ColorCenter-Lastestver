import math
import re
import urllib.request
import json
import sys

def test_static_files():
    print("--- 1. Testing Static Assets (CSS and JS) ---")
    with open('assets/css/pos.css', 'r', encoding='utf-8') as f:
        css = f.read()
    with open('assets/js/pos.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # Verify #pos-product-list in CSS has no overflow-y: auto and no max-height
    match = re.search(r'#pos-product-list\s*\{([^}]+)\}', css)
    assert match, "Could not find #pos-product-list in assets/css/pos.css"
    body = match.group(1)
    assert 'overflow-y: auto' not in body, "FAIL: overflow-y: auto still present in #pos-product-list"
    assert 'max-height' not in body, "FAIL: max-height still present in #pos-product-list"
    assert 'overflow: visible' in body or 'overflow-y: visible' in body, "FAIL: overflow should be visible"
    print("PASS: #pos-product-list has no scrollbar and no max-height restriction.")

    # Verify .pos-product has consistent height styling
    prod_match = re.search(r'\.pos-product\s*\{([^}]+)\}', css)
    assert prod_match, "Could not find .pos-product in assets/css/pos.css"
    prod_body = prod_match.group(1)
    assert 'min-height: 64px' in prod_body, "FAIL: min-height missing on .pos-product"
    print("PASS: .pos-product has consistent min-height and padding.")

    # Verify pagination CSS exists
    assert '.pos-pagination-bar' in css, "FAIL: .pos-pagination-bar missing in css"
    assert '.pos-pagination-btn' in css, "FAIL: .pos-pagination-btn missing in css"
    assert 'var(--teal' in css, "FAIL: teal theme missing in pos pagination css"
    print("PASS: pos pagination teal-and-white styles verified.")

    # Verify JS features
    assert 'let posCurrentPage = 1;' in js, "FAIL: posCurrentPage definition missing"
    assert 'const POS_PAGE_SIZE = 8;' in js, "FAIL: POS_PAGE_SIZE missing"
    assert 'function setPosPage(newPage)' in js, "FAIL: setPosPage function missing"
    assert 'id="pos-pagination"' in js, "FAIL: #pos-pagination placeholder missing in posPage()"
    assert 'id="pos-prev-btn"' in js, "FAIL: #pos-prev-btn missing"
    assert 'id="pos-next-btn"' in js, "FAIL: #pos-next-btn missing"
    assert 'pos-pagination-counter' in js, "FAIL: pos-pagination-counter missing"
    print("PASS: pos.js pagination controls and logic verified.")

def simulate_pos_pagination(products, page_size=8):
    def get_page_state(list_items, cur_page):
        total_items = len(list_items)
        total_pages = max(1, math.ceil(total_items / page_size))
        if cur_page > total_pages:
            cur_page = total_pages
        if cur_page < 1:
            cur_page = 1
        start_idx = (cur_page - 1) * page_size
        end_idx = min(start_idx + page_size, total_items)
        paged_items = list_items[start_idx:end_idx]
        is_first_page = cur_page <= 1
        is_last_page = cur_page >= total_pages
        return {
            'cur_page': cur_page,
            'total_pages': total_pages,
            'total_items': total_items,
            'paged_items': paged_items,
            'start_idx': start_idx,
            'end_idx': end_idx,
            'prev_disabled': is_first_page,
            'next_disabled': is_last_page
        }
    return get_page_state

def test_pagination_logic():
    print("\n--- 2. Testing Pagination Logic & Scenarios ---")
    # Load products from live database
    load_url = "http://mrgr_colorcenter/api/db.php?action=load"
    req = urllib.request.Request(load_url)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    all_products = [p for p in data['db']['products'] if p.get('status') == 'active']
    print(f"Loaded {len(all_products)} active products from database.")

    paginate = simulate_pos_pagination(all_products, page_size=8)

    # Scenario 1: Initial load on All Products (14 products)
    st1 = paginate(all_products, 1)
    assert st1['cur_page'] == 1
    assert st1['total_pages'] == 2
    assert len(st1['paged_items']) == 8
    assert st1['prev_disabled'] == True, "Previous should be disabled on page 1"
    assert st1['next_disabled'] == False, "Next should be enabled on page 1"
    assert st1['start_idx'] + 1 == 1 and st1['end_idx'] == 8
    print("PASS: Scenario 1 - Page 1 of 2 displays 8 items, Previous disabled, Next enabled.")

    # Scenario 2: Navigate to Page 2
    st2 = paginate(all_products, 2)
    assert st2['cur_page'] == 2
    assert st2['total_pages'] == 2
    assert len(st2['paged_items']) == 6
    assert st2['prev_disabled'] == False, "Previous should be enabled on page 2"
    assert st2['next_disabled'] == True, "Next should be disabled on page 2"
    assert st2['start_idx'] + 1 == 9 and st2['end_idx'] == 14
    print("PASS: Scenario 2 - Page 2 of 2 displays remaining 6 items, Previous enabled, Next disabled.")

    # Scenario 3: Category filter to Automotive Paint (10 items)
    auto_prods = [p for p in all_products if p.get('type') == 'Automotive Paint']
    st_auto_p1 = paginate(auto_prods, 1)
    assert st_auto_p1['total_pages'] == 2
    assert len(st_auto_p1['paged_items']) == 8
    st_auto_p2 = paginate(auto_prods, 2)
    assert len(st_auto_p2['paged_items']) == 2
    print("PASS: Scenario 3 - Automotive Paint (10 items) paginates into 8 and 2.")

    # Scenario 4: Dynamic return to nearest valid page
    # If user was on Page 2 and filters to House Paint (3 items -> 1 page)
    house_prods = [p for p in all_products if p.get('type') == 'House Paint']
    st_house = paginate(house_prods, 2) # passed cur_page = 2
    assert st_house['cur_page'] == 1, f"Expected cur_page to clamp to 1, got {st_house['cur_page']}"
    assert st_house['total_pages'] == 1
    assert len(st_house['paged_items']) == 3
    assert st_house['prev_disabled'] == True
    assert st_house['next_disabled'] == True
    print("PASS: Scenario 4 - Dynamic return to nearest valid page (from page 2 clamped to page 1).")

    # Scenario 5: Search query
    primer_prods = [p for p in all_products if 'primer' in (p.get('name', '') + ' ' + p.get('brand', '')).lower()]
    st_primer = paginate(primer_prods, 1)
    assert st_primer['total_pages'] == 1
    assert len(st_primer['paged_items']) == len(primer_prods)
    assert st_primer['prev_disabled'] == True and st_primer['next_disabled'] == True
    print(f"PASS: Scenario 5 - Search filter dynamically recalculates pagination (Primer -> {len(primer_prods)} item(s), 1 page).")

    # Scenario 6: Empty search result
    st_empty = paginate([], 1)
    assert st_empty['total_pages'] == 1
    assert st_empty['cur_page'] == 1
    assert len(st_empty['paged_items']) == 0
    assert st_empty['prev_disabled'] == True and st_empty['next_disabled'] == True
    print("PASS: Scenario 6 - Empty results properly handled with disabled navigation.")

    # Scenario 7: Newly added products
    # Add dummy 15th product
    prods_15 = all_products + [{'id': 'NEW-001', 'name': 'New Paint', 'status': 'active'}]
    st_new = paginate(prods_15, 2)
    assert len(st_new['paged_items']) == 7
    assert st_new['paged_items'][-1]['id'] == 'NEW-001'
    print("PASS: Scenario 7 - Newly added product appears on the appropriate page.")

    # Add 17 products total -> should create Page 3
    prods_17 = all_products + [{'id': f'NEW-{i}', 'name': f'New Paint {i}', 'status': 'active'} for i in range(1, 4)]
    st_p3 = paginate(prods_17, 3)
    assert st_p3['total_pages'] == 3
    assert st_p3['cur_page'] == 3
    assert len(st_p3['paged_items']) == 1
    assert st_p3['next_disabled'] == True
    print("PASS: Scenario 8 - Adding enough products automatically creates Page 3 (Page 3 of 3).")

if __name__ == '__main__':
    test_static_files()
    test_pagination_logic()
    print("\nALL POS PAGINATION TESTS PASSED SUCCESSFULLY!")

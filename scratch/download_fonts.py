import urllib.request
import re
import os

os.makedirs('assets/fonts', exist_ok=True)

url = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
req = urllib.request.Request(url, headers=headers)
css_content = urllib.request.urlopen(req).read().decode('utf-8')

# Extract latin font face blocks
blocks = css_content.split('@font-face')
local_css = "/* Localized Google Fonts for 100% Offline Support */\n\n"

for b in blocks:
    if '/* latin */' in b:
        family_m = re.search(r"font-family:\s*['\"]([^'\"]+)['\"]", b)
        weight_m = re.search(r"font-weight:\s*(\d+)", b)
        url_m = re.search(r"url\((https://[^\)]+\.woff2)\)", b)
        
        if family_m and weight_m and url_m:
            family = family_m.group(1)
            weight = weight_m.group(1)
            font_url = url_m.group(1)
            
            clean_family = family.lower().replace(' ', '-')
            filename = f"{clean_family}-{weight}.woff2"
            filepath = os.path.join('assets', 'fonts', filename)
            
            print(f"Downloading {family} ({weight}) -> {filename}...")
            font_bytes = urllib.request.urlopen(urllib.request.Request(font_url, headers=headers)).read()
            with open(filepath, 'wb') as f:
                f.write(font_bytes)
                
            local_css += f"""@font-face {{
  font-family: '{family}';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url('../fonts/{filename}') format('woff2');
}}

"""

with open('assets/css/fonts.css', 'w', encoding='utf-8') as f:
    f.write(local_css)

print("Saved assets/css/fonts.css successfully!")


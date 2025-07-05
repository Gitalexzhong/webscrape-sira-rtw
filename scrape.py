import re
import pandas as pd
from bs4 import BeautifulSoup
from geopy.geocoders import Nominatim
import time
import datetime

# Helper to normalize whitespace
def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

# Helper to extract company name (before ' - ')
def extract_company(name):
    if ' - ' in name:
        return name.split(' - ')[0].strip()
    return name.strip()

# Read the HTML file
with open('data-raw.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
rows = soup.find_all('tr')

data = []
geolocator = Nominatim(user_agent="sira_rtw_scraper_v2")

# Parse all rows and build a list of dicts (without geocoding yet)
for idx, row in enumerate(rows):
    tds = row.find_all('td')
    comments = [c for c in row.children if isinstance(c, type(soup.comment))]
    provider_number = None
    for comment in comments:
        match = re.search(r'<td>(\\d+)</td>', comment)
        if match:
            provider_number = match.group(1)
    if len(tds) >= 7:
        link_tag = tds[0].find('a')
        name = clean_text(link_tag.text) if link_tag else ''
        link = link_tag['href'] if link_tag else ''
        business_address = clean_text(tds[1].text)
        suburb = clean_text(tds[2].text)
        state = clean_text(tds[3].text)
        postcode = clean_text(tds[4].text)
        region = clean_text(tds[5].text)
        phone = clean_text(tds[6].text)
        company = extract_company(name)
        full_address = f"{business_address}, {suburb}, {state} {postcode}, Australia"
        data.append({
            'Name': name,
            'Company': company,
            'Business address': business_address,
            'Suburb': suburb,
            'State': state,
            'Postcode': postcode,
            'Region': region,
            'Phone': phone,
            'Link': link,
            'Provider number': provider_number,
            'Full address': full_address
        })

# Geocode sequentially
results = [None] * len(data)
start_time = time.time()

total = len(data)
for i, row in enumerate(data):
    lat, lon = None, None
    # Try full address, then postcode, then just suburb+state+postcode
    attempts = [
        row['Full address'],
        f"{row['Postcode']}, Australia",
        f"{row['Suburb']}, {row['State']} {row['Postcode']}, Australia"
    ]
    for attempt in attempts:
        try:
            location = geolocator.geocode(attempt)
            if location:
                lat, lon = location.latitude, location.longitude
                break
        except Exception:
            pass
        time.sleep(1)  # Respect Nominatim's 1 request/sec limit
    results[i] = (lat, lon)
    elapsed = time.time() - start_time
    avg_time = elapsed / (i+1)
    remaining = total - (i+1)
    eta = datetime.timedelta(seconds=int(avg_time * remaining))
    print(f"[{i+1}/{total} | ETA: {eta}] Processed: {row['Name']} | Lat: {lat} Lon: {lon}")

# Attach geocode results
enriched = []
for i, row in enumerate(data):
    lat, lon = results[i]
    row['Latitude'] = lat
    row['Longitude'] = lon
    del row['Full address']
    enriched.append(row)

# Save to CSV
missing_coords = sum(1 for lat, lon in results if lat is None or lon is None)
df = pd.DataFrame(enriched)
df.to_csv('cleaned_providers.csv', index=False)
print('Saved cleaned data to cleaned_providers.csv')
if missing_coords > 0:
    print(f"Warning: {missing_coords} entries did not have coordinates generated. Please check the address or postcode for these entries.")
else:
    print("All entries have coordinates.")

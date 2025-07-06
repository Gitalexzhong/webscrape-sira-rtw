import re
import pandas as pd
from bs4 import BeautifulSoup, Comment
from geopy.geocoders import Nominatim
import time
import datetime
import os
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed

# Helper to normalize whitespace
def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

# Helper to extract company name (before ' - ')
def extract_company(name):
    if ' - ' in name:
        return name.split(' - ')[0].strip()
    return name.strip()

CACHE_FILE = 'geocode_cache.csv'

def load_geocode_cache():
    cache = {}
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) == 3:
                    addr, lat, lon = row
                    if lat and lon:
                        cache[addr] = (float(lat), float(lon))
    return cache

def save_geocode_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        for addr, (lat, lon) in cache.items():
            writer.writerow([addr, lat, lon])

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
    # Find all comments in the row (BeautifulSoup treats comments as Comment type)
    provider_number = None
    for c in row.children:
        if isinstance(c, Comment):
            match = re.search(r'<td>(\d+)</td>', c)
            if match:
                provider_number = match.group(1)  # Always use the last one found
    # If multiple, take the last one (usually the second one)
    # (If you want the first, use break after assigning)
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

# Load geocode cache
geocode_cache = load_geocode_cache()

# Split data into cache-only and needs-api
cache_results = [None] * len(data)
api_indices = []
api_rows = []

# Helper to check if any attempt is not in cache
for i, row in enumerate(data):
    attempts = [
        row['Full address'],
        f"{row['Postcode']}, Australia",
        f"{row['Suburb']}, {row['State']} {row['Postcode']}, Australia"
    ]
    found = False
    for attempt in attempts:
        if attempt in geocode_cache:
            lat, lon = geocode_cache[attempt]
            cache_results[i] = (lat, lon)
            found = True
            break
    if not found:
        api_indices.append(i)
        api_rows.append(row)

# Threaded lookup for cache hits
results = [None] * len(data)
def cache_lookup(i):
    return (i, cache_results[i])
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = [executor.submit(cache_lookup, i) for i in range(len(data)) if cache_results[i] is not None]
    for fut in as_completed(futures):
        i, res = fut.result()
        results[i] = res

# Sequential API requests for non-cached
start_time = time.time()
total = len(data)
for idx, (i, row) in enumerate(zip(api_indices, api_rows)):
    lat, lon = None, None
    attempts = [
        row['Full address'],
        f"{row['Postcode']}, Australia",
        f"{row['Suburb']}, {row['State']} {row['Postcode']}, Australia"
    ]
    for attempt in attempts:
        if attempt in geocode_cache:
            lat, lon = geocode_cache[attempt]
            break
        try:
            location = geolocator.geocode(attempt)
            if location:
                lat, lon = location.latitude, location.longitude
                geocode_cache[attempt] = (lat, lon)
                break
        except Exception:
            pass
        if attempt not in geocode_cache:
            time.sleep(1)  # Respect Nominatim's 1 request/sec limit
    results[i] = (lat, lon)
    elapsed = time.time() - start_time
    avg_time = elapsed / (idx+1)
    remaining = len(api_rows) - (idx+1)
    eta = datetime.timedelta(seconds=int(avg_time * remaining))
    print(f"[{i+1}/{total} | ETA: {eta}] Processed: {row['Name']} | Provider#: {row['Provider number']} | Lat: {lat} Lon: {lon}")

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

# Save geocode cache after processing
save_geocode_cache(geocode_cache)

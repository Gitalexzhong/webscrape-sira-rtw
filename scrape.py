from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time
import csv
import re

# Setup Chrome options
chrome_options = Options()
chrome_options.add_argument("--headless")  # Run in headless mode
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--no-sandbox")

# Launch the browser
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

# Load the target URL
url = "https://www.sira.nsw.gov.au/information-search/rehab-provider/search"
driver.get(url)

# Wait for the JavaScript to load content
time.sleep(5)

# Scroll to load all providers (if it's infinite scrolling or lazy loaded)
# driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
# time.sleep(2)  # Optional

# Find all provider cards
provider_cards = driver.find_elements(By.CLASS_NAME, "search-result-card")

results = []

if not provider_cards:
    print("No provider cards found. The page might have changed or failed to load.")
else:
    for card in provider_cards:
        try:
            name = card.find_element(By.CLASS_NAME, "provider-name-heading").text.strip()

            address_block = card.find_element(By.CLASS_NAME, "address-block").text.strip()
            business_address = address_block

            postcode = ""
            suburb = ""
            region = ""
            state = "NSW"

            postcode_match = re.search(r'\b(\d{4})\b', business_address)
            if postcode_match:
                postcode = postcode_match.group(1)

            suburb_match = re.search(r',\s*([A-Z\s]+)\s+NSW\s+\d{4}', business_address)
            if suburb_match:
                suburb = suburb_match.group(1).title().strip()

            try:
                phone = card.find_element(By.CLASS_NAME, "phone-number-value").text.strip()
            except:
                phone = "N/A"

            results.append({
                "Name": name,
                "Business Address": business_address,
                "Suburb": suburb,
                "State": state,
                "Postcode": postcode,
                "Region": region,
                "Phone": phone
            })

        except Exception as e:
            print(f"Error processing card: {e}")
            continue

# Close the browser
driver.quit()

# Save to CSV
if results:
    keys = results[0].keys()
    with open('sira_rehab_providers.csv', 'w', newline='', encoding='utf-8') as output_file:
        dict_writer = csv.DictWriter(output_file, fieldnames=keys)
        dict_writer.writeheader()
        dict_writer.writerows(results)
    print("Data saved to sira_rehab_providers.csv")
else:
    print("No results to save.")

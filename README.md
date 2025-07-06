# RTW Rehab Provider Search – Project Overview

This repository contains all code and data for the RTW Rehab Provider Search web application, including data scraping, cleaning, and the interactive map website.

## Project Structure

- `scrape.py` – Python script to scrape, clean, and geocode provider data from the SIRA website.
- `geocode_cache.csv` – Local cache of geocoded addresses to minimize API calls.
- `cleaned_providers.csv` – Cleaned, geocoded provider data (CSV) for use in the web app.
- `website/` – Vite + React + Leaflet web application for searching and visualizing providers.
    - `public/cleaned_providers.csv` – Data file used by the web app (copied from root).
    - `src/` – React source code.
    - `README.md` – Frontend usage and deployment instructions.

## Data Source

All provider data is sourced from the official SIRA NSW website:

https://www.sira.nsw.gov.au/information-search/rehab-provider/search

Data is periodically scraped and cleaned for accuracy.

## Data Scraping & Cleaning

### Requirements
- Python 3.8+
- `requests`, `beautifulsoup4`, `pandas`

Install dependencies:

```sh
pip install -r requirements.txt
```

### Usage

1. Run the scraper to fetch and clean provider data:
   ```sh
   python scrape.py
   ```
   - This will create/update `cleaned_providers.csv` and `geocode_cache.csv`.
2. Copy the cleaned CSV to the web app:
   ```sh
   cp cleaned_providers.csv website/public/cleaned_providers.csv
   ```

- The script uses a geocode cache to avoid redundant API calls and minimize rate limits.
- Geocoding is performed using the Nominatim (OpenStreetMap) API.

## Web Application

See `website/README.md` for frontend setup, development, and deployment instructions.

## License
MIT

---

*This project is for demonstration and research purposes only. Data is sourced from the public SIRA NSW website. For official information, visit [SIRA NSW](https://www.sira.nsw.gov.au/information-search/rehab-provider/search).*

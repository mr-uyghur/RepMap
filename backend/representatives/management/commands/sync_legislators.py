"""
Management command to sync all current US legislators from the public
unitedstates/congress-legislators dataset (no API key required).

Usage:
    python manage.py sync_legislators
"""
import yaml
import requests
from django.core.management.base import BaseCommand

from representatives.models import Representative

LEGISLATORS_URL = (
    'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
)
TIGER_BASE = (
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer'
)

# Geographic center of each state (lat, lng)
STATE_CENTROIDS = {
    'AL': (32.7794, -86.8287), 'AK': (64.0685, -153.3694),
    'AZ': (34.2744, -111.6602), 'AR': (34.8938, -92.4426),
    'CA': (37.1841, -119.4696), 'CO': (38.9972, -105.5478),
    'CT': (41.6219, -72.7273), 'DE': (38.9896, -75.5050),
    'FL': (28.6305, -82.4497), 'GA': (32.6415, -83.4426),
    'HI': (20.2927, -156.3737), 'ID': (44.3509, -114.6130),
    'IL': (40.0417, -89.1965), 'IN': (39.8942, -86.2816),
    'IA': (42.0751, -93.4960), 'KS': (38.4937, -98.3804),
    'KY': (37.5347, -85.3021), 'LA': (31.0689, -91.9968),
    'ME': (45.3695, -69.2428), 'MD': (39.0550, -76.7909),
    'MA': (42.2596, -71.8083), 'MI': (44.3467, -85.4102),
    'MN': (46.2807, -94.3053), 'MS': (32.7364, -89.6678),
    'MO': (38.3566, -92.4580), 'MT': (46.8797, -110.3626),
    'NE': (41.5378, -99.7951), 'NV': (39.3289, -116.6312),
    'NH': (43.6805, -71.5811), 'NJ': (40.1907, -74.6728),
    'NM': (34.4071, -106.1126), 'NY': (42.9538, -75.5268),
    'NC': (35.5557, -79.3877), 'ND': (47.4501, -100.4659),
    'OH': (40.2862, -82.7937), 'OK': (35.5889, -97.4943),
    'OR': (43.9336, -120.5583), 'PA': (40.8781, -77.7996),
    'RI': (41.6762, -71.5562), 'SC': (33.9169, -80.8964),
    'SD': (44.4443, -100.2263), 'TN': (35.8580, -86.3505),
    'TX': (31.4757, -99.3312), 'UT': (39.3210, -111.0937),
    'VT': (44.0687, -72.6658), 'VA': (37.5215, -78.8537),
    'WA': (47.3826, -120.4472), 'WV': (38.6409, -80.6227),
    'WI': (44.6243, -89.9941), 'WY': (42.9957, -107.5512),
    'DC': (38.9072, -77.0369),
}

STATE_FIPS = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
    'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
    'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
    'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
    'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
    'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
    'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
    'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
    'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
    'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56',
    'DC': '11',
}

PARTY_MAP = {
    'Democrat': 'democrat',
    'Republican': 'republican',
    'Independent': 'independent',
}


def _fetch_district_centroids(state):
    """
    Return dict of {district_number: (lat, lng)} for all congressional
    districts in the given state, using pre-computed centroids from Census TIGER.
    Uses the 119th Congress layer with STATE (FIPS) and CD119 fields.
    """
    fips = STATE_FIPS.get(state)
    if not fips:
        return {}
    url = f'{TIGER_BASE}/0/query'
    params = {
        'where': f"STATE='{fips}'",
        'outFields': 'STATE,CD119,INTPTLAT,INTPTLON',
        'returnGeometry': 'false',
        'f': 'json',
    }
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return {}

    if 'error' in data:
        return {}

    centroids = {}
    for feature in data.get('features', []):
        attrs = feature.get('attributes', {})
        cd = attrs.get('CD119')
        centlat = attrs.get('INTPTLAT')
        centlon = attrs.get('INTPTLON')
        if cd is None or centlat is None or centlon is None:
            continue
        try:
            district_num = int(cd)  # '00' → 0 for at-large; skip non-numeric ('ZZ')
        except (ValueError, TypeError):
            continue
        centroids[district_num] = (float(centlat), float(centlon))
    return centroids


class Command(BaseCommand):
    help = 'Sync all current US legislators from unitedstates.io'

    def handle(self, *args, **options):
        self.stdout.write('Fetching legislators from unitedstates.io...')
        try:
            resp = requests.get(LEGISLATORS_URL, timeout=30)
            resp.raise_for_status()
            legislators = yaml.safe_load(resp.text)
        except Exception as e:
            self.stderr.write(f'Failed to fetch legislators: {e}')
            return

        self.stdout.write(f'Fetched {len(legislators)} legislators.')

        # Separate senators and house reps, grab each person's current term
        senators = []
        house_reps = []
        for person in legislators:
            terms = person.get('terms', [])
            if not terms:
                continue
            current_term = terms[-1]
            chamber = current_term.get('type')  # 'sen' or 'rep'
            if chamber == 'sen':
                senators.append((person, current_term))
            elif chamber == 'rep':
                house_reps.append((person, current_term))

        # Collect which states have house reps so we can batch Census calls
        house_states = sorted({t.get('state') for _, t in house_reps if t.get('state')})

        self.stdout.write(f'Fetching district centroids for {len(house_states)} states...')
        # district_centroids[state][district_number] = (lat, lng)
        district_centroids = {}
        for i, state in enumerate(house_states, 1):
            self.stdout.write(f'  [{i}/{len(house_states)}] {state}', ending='\r')
            self.stdout.flush()
            district_centroids[state] = _fetch_district_centroids(state)
        self.stdout.write('')  # newline after \r progress

        self.stdout.write('Clearing existing representatives...')
        Representative.objects.all().delete()

        created = 0
        skipped = 0

        # --- Senators ---
        for person, term in senators:
            state = term.get('state', '')
            if state not in STATE_CENTROIDS:
                skipped += 1
                continue

            bio = person.get('bio', {})
            name_info = person.get('name', {})
            full_name = (
                f"{name_info.get('first', '')} {name_info.get('last', '')}".strip()
            )
            party_raw = term.get('party', '')
            party = PARTY_MAP.get(party_raw, 'other')
            bioguide_id = person.get('id', {}).get('bioguide', '')
            lat, lng = STATE_CENTROIDS[state]

            Representative.objects.create(
                name=full_name,
                level='senate',
                party=party,
                state=state,
                district_number=None,
                photo_url='',
                website=term.get('url', ''),
                phone=term.get('phone', ''),
                social_links={},
                term_start=term.get('start') or None,
                term_end=term.get('end') or None,
                latitude=lat,
                longitude=lng,
                external_ids={'bioguide_id': bioguide_id},
            )
            created += 1

        # --- House reps ---
        for person, term in house_reps:
            state = term.get('state', '')
            district = term.get('district', 0)  # 0 = at-large

            # Get coordinates: try district centroid, fall back to state centroid
            state_dists = district_centroids.get(state, {})
            coords = state_dists.get(district) or STATE_CENTROIDS.get(state)
            if coords is None:
                skipped += 1
                continue
            lat, lng = coords

            name_info = person.get('name', {})
            full_name = (
                f"{name_info.get('first', '')} {name_info.get('last', '')}".strip()
            )
            party_raw = term.get('party', '')
            party = PARTY_MAP.get(party_raw, 'other')
            bioguide_id = person.get('id', {}).get('bioguide', '')

            Representative.objects.create(
                name=full_name,
                level='house',
                party=party,
                state=state,
                district_number=district if district != 0 else None,
                photo_url='',
                website=term.get('url', ''),
                phone=term.get('phone', ''),
                social_links={},
                term_start=term.get('start') or None,
                term_end=term.get('end') or None,
                latitude=lat,
                longitude=lng,
                external_ids={'bioguide_id': bioguide_id},
            )
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created {created} legislators ({skipped} skipped).'
            )
        )

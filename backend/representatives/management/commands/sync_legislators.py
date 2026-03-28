"""
Management command to sync all current US legislators from the public
unitedstates/congress-legislators dataset (no API key required).

Usage:
    python manage.py sync_legislators
"""
import yaml
import requests
from django.core.management.base import BaseCommand
from django.utils import timezone

from representatives.models import Representative, SyncStatus
from representatives.constants import STATE_FIPS

LEGISLATORS_URL = (
    'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
)
COMMITTEES_URL = (
    'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/committees-current.yaml'
)
COMMITTEE_MEMBERSHIP_URL = (
    'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/'
    'committee-membership-current.yaml'
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

PARTY_MAP = {
    'Democrat': 'democrat',
    'Republican': 'republican',
    'Independent': 'independent',
}

SOCIAL_URL_BUILDERS = {
    'twitter': lambda value: f'https://x.com/{value}',
    'facebook': lambda value: value if str(value).startswith('http') else f'https://www.facebook.com/{value}',
    'youtube': lambda value: value if str(value).startswith('http') else f'https://www.youtube.com/{value}',
    'instagram': lambda value: f'https://www.instagram.com/{value}',
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


def _fetch_committee_data(log=None):
    """
    Return a dict mapping bioguide_id → [committee name, ...] using the
    unitedstates/congress-legislators committee files. Returns an empty dict
    on any fetch failure so the rest of the sync continues unaffected.

    Pass a callable as `log` to receive diagnostic messages (e.g. self.stdout.write).
    """
    if log is None:
        log = lambda msg: None  # noqa: E731

    try:
        committees_resp = requests.get(COMMITTEES_URL, timeout=30)
        committees_resp.raise_for_status()
        committees_raw = yaml.safe_load(committees_resp.text)
        log(f'  committees-current.yaml: fetched OK ({len(committees_raw or [])} top-level entries)')
    except Exception as exc:
        log(f'  ERROR fetching committees YAML: {exc}')
        return {}

    # Build thomas_id → human-readable name map (top-level committees only).
    id_to_name: dict[str, str] = {}
    for committee in (committees_raw or []):
        thomas_id = committee.get('thomas_id', '')
        name = committee.get('name', '')
        if thomas_id and name:
            id_to_name[thomas_id] = name
        # Include subcommittees so members show their subcommittee assignments too.
        for sub in committee.get('subcommittees', []):
            sub_id = thomas_id + sub.get('thomas_id', '')
            sub_name = f"{name} — {sub.get('name', '')}"
            if sub_id and sub.get('name'):
                id_to_name[sub_id] = sub_name
    log(f'  Built id_to_name map: {len(id_to_name)} committee/subcommittee entries')

    try:
        membership_resp = requests.get(COMMITTEE_MEMBERSHIP_URL, timeout=30)
        membership_resp.raise_for_status()
        membership = yaml.safe_load(membership_resp.text)
        log(f'  committee-membership-current.yaml: fetched OK ({len(membership)} committee keys)')
    except Exception as exc:
        log(f'  ERROR fetching committee membership JSON: {exc}')
        return {}

    # Invert: bioguide → [committee name, ...]
    bioguide_to_committees: dict[str, list[str]] = {}
    skipped_unknown_id = 0
    for thomas_id, members in membership.items():
        committee_name = id_to_name.get(thomas_id, '')
        if not committee_name:
            skipped_unknown_id += 1
            continue
        for member in members:
            bioguide = member.get('bioguide', '')
            if not bioguide:
                continue
            bioguide_to_committees.setdefault(bioguide, []).append(committee_name)

    log(f'  Membership: {skipped_unknown_id} committee keys had no name match (subcommittees not in YAML)')
    log(f'  Result: {len(bioguide_to_committees)} legislators with 1+ committee assignments')
    return bioguide_to_committees


def _build_social_links(person_ids):
    links = {}
    for platform, builder in SOCIAL_URL_BUILDERS.items():
        value = person_ids.get(platform)
        if not value:
            continue
        try:
            links[platform] = builder(value)
        except Exception:
            continue
    return links


def _build_external_ids(person_ids):
    keys = [
        'bioguide', 'govtrack', 'opensecrets', 'votesmart', 'wikidata',
        'ballotpedia', 'cspan',
    ]
    external_ids = {}
    for key in keys:
        value = person_ids.get(key)
        if value:
            external_ids[f'{key}_id'] = value
    return external_ids


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

        self.stdout.write('Fetching committee membership data...')
        committee_data = _fetch_committee_data(log=self.stdout.write)
        if committee_data:
            self.stdout.write(f'  Loaded committee assignments for {len(committee_data)} legislators.')
        else:
            self.stdout.write('  Committee data unavailable; assignments will be empty.')

        # Separate legislators by chamber and keep only the latest/current term.
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

        # Batch centroid requests by state so we do not hit Census once per representative.
        house_states = sorted({t.get('state') for _, t in house_reps if t.get('state')})

        self.stdout.write(f'Fetching district centroids for {len(house_states)} states...')
        # district_centroids[state][district_number] = (lat, lng)
        district_centroids = {}
        for i, state in enumerate(house_states, 1):
            self.stdout.write(f'  [{i}/{len(house_states)}] {state}', ending='\r')
            self.stdout.flush()
            district_centroids[state] = _fetch_district_centroids(state)
        self.stdout.write('')  # newline after \r progress

        # Pre-load existing records so we can update in place rather than
        # delete-and-recreate — this prevents the empty-table window that causes
        # the API to return [] with 200 OK while a sync is in progress.
        self.stdout.write('Loading existing representatives...')
        existing_by_bioguide: dict[str, Representative] = {}
        for rep in Representative.objects.all():
            bg = (rep.external_ids or {}).get('bioguide_id', '')
            if bg:
                existing_by_bioguide[bg] = rep
        self.stdout.write(f'  Found {len(existing_by_bioguide)} existing records.')

        created = 0
        updated = 0
        skipped = 0

        # Senators get state-level centroids because they represent the whole state.
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
            person_ids = person.get('id', {})
            bioguide_id = person_ids.get('bioguide', '')
            lat, lng = STATE_CENTROIDS[state]

            # Office room: address field is "Room Building; Washington DC zip".
            # Take the part before the semicolon if present.
            raw_address = term.get('address', '') or ''
            office_room = raw_address.split(';')[0].strip()

            fields = dict(
                name=full_name,
                level='senate',
                party=party,
                state=state,
                district_number=None,
                photo_url='',
                website=term.get('url', ''),
                phone=term.get('phone', ''),
                social_links=_build_social_links(person_ids),
                term_start=term.get('start') or None,
                term_end=term.get('end') or None,
                office_room=office_room,
                committee_assignments=committee_data.get(bioguide_id, []),
                latitude=lat,
                longitude=lng,
                external_ids=_build_external_ids(person_ids),
            )
            if bioguide_id and bioguide_id in existing_by_bioguide:
                rep = existing_by_bioguide[bioguide_id]
                for attr, val in fields.items():
                    setattr(rep, attr, val)
                rep.save()
                updated += 1
            else:
                Representative.objects.create(**fields)
                created += 1

        # House members prefer district centroids and fall back to state centroids.
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
            person_ids = person.get('id', {})
            bioguide_id = person_ids.get('bioguide', '')

            raw_address = term.get('address', '') or ''
            office_room = raw_address.split(';')[0].strip()

            fields = dict(
                name=full_name,
                level='house',
                party=party,
                state=state,
                district_number=district if district != 0 else None,
                photo_url='',
                website=term.get('url', ''),
                phone=term.get('phone', ''),
                social_links=_build_social_links(person_ids),
                term_start=term.get('start') or None,
                term_end=term.get('end') or None,
                office_room=office_room,
                committee_assignments=committee_data.get(bioguide_id, []),
                latitude=lat,
                longitude=lng,
                external_ids=_build_external_ids(person_ids),
            )
            if bioguide_id and bioguide_id in existing_by_bioguide:
                rep = existing_by_bioguide[bioguide_id]
                for attr, val in fields.items():
                    setattr(rep, attr, val)
                rep.save()
                updated += 1
            else:
                Representative.objects.create(**fields)
                created += 1

        with_committees = Representative.objects.exclude(committee_assignments='[]').count()
        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created {created}, updated {updated} legislators ({skipped} skipped). '
                f'{with_committees} have non-empty committee assignments.'
            )
        )

        # Mark the sync as successful so auto-refresh knows the data is current again.
        SyncStatus.objects.update_or_create(
            id=1,
            defaults={
                'last_synced_at': timezone.now(),
                'is_syncing': False,
                'last_error': '',
            },
        )

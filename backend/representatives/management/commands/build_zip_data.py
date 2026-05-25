"""
Management command: build_zip_data

Downloads the Census Gazetteer ZCTA centroid file and runs point-in-polygon
tests against the pre-built local district boundary files to produce a single
lookup table at backend/representatives/zip_data/zips.json.gz:

    {"95131": {"lat": 37.3869, "lng": -121.897, "state": "CA", "district": 17}, ...}

Requires that district_data/*.json files already exist
(run `python manage.py build_district_data` first).

Source for centroids:
    Census 2024 Gazetteer — ZCTA centroids (public domain, no key required):
    https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/
    2024_Gaz_zcta_national.zip

District assignment uses point-in-polygon against local GeoJSON files,
so no external API calls are needed at runtime.

Usage:
    python manage.py build_zip_data
    python manage.py build_zip_data --overwrite   # re-build even if file exists
"""

import csv
import gzip
import io
import json
import zipfile
from pathlib import Path

import requests
from django.core.management.base import BaseCommand, CommandError

from representatives.constants import STATE_FIPS

_FIPS_TO_STATE = {v: k for k, v in STATE_FIPS.items()}

_GAZETTEER_URL = (
    'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/'
    '2024_Gazetteer/2024_Gaz_zcta_national.zip'
)

OUTPUT_FILENAME = 'zips.json.gz'


def _get_zip_data_dir() -> Path:
    # commands/ → management/ → representatives/ → zip_data/
    return Path(__file__).resolve().parents[2] / 'zip_data'


def _get_district_data_dir() -> Path:
    # commands/ → management/ → representatives/ → district_data/
    return Path(__file__).resolve().parents[2] / 'district_data'


# ---------------------------------------------------------------------------
# Gazetteer parsing
# ---------------------------------------------------------------------------

def _fetch_gazetteer(stdout) -> dict[str, tuple[float, float]]:
    """Return {zcta5: (lat, lng)} from the Census Gazetteer zip file."""
    stdout.write('  Downloading ZCTA centroid file from Census Gazetteer... ', ending='')
    stdout.flush()
    resp = requests.get(_GAZETTEER_URL, timeout=120)
    resp.raise_for_status()
    stdout.write(f'{len(resp.content) // 1024} KB\n')

    centroids: dict[str, tuple[float, float]] = {}
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        txt_name = next(n for n in zf.namelist() if n.endswith('.txt'))
        with zf.open(txt_name) as fh:
            reader = csv.DictReader(
                io.TextIOWrapper(fh, encoding='utf-8'), delimiter='\t'
            )
            # Strip trailing whitespace from column headers (Census files have it).
            reader.fieldnames = [f.strip() for f in (reader.fieldnames or [])]
            for row in reader:
                zcta = row.get('GEOID', '').strip().zfill(5)
                lat_raw = row.get('INTPTLAT', '').strip()
                lng_raw = row.get('INTPTLONG', '').strip()
                if not (zcta and lat_raw and lng_raw):
                    continue
                try:
                    centroids[zcta] = (float(lat_raw), float(lng_raw))
                except ValueError:
                    pass

    stdout.write(f'  Parsed {len(centroids):,} ZCTA centroids\n')
    return centroids


# ---------------------------------------------------------------------------
# Spatial index from local district GeoJSON files
# ---------------------------------------------------------------------------

def _build_spatial_index(district_dir: Path, stdout) -> list[tuple]:
    """
    Return a flat list of (state_abbr, district_number, min_lng, min_lat, max_lng, max_lat, geometry)
    tuples from all district_data/*.json files.
    """
    index: list[tuple] = []
    files = sorted(district_dir.glob('*.json'))
    if not files:
        raise CommandError(
            f'No district data files found in {district_dir}. '
            'Run `python manage.py build_district_data` first.'
        )

    stdout.write(f'  Loading {len(files)} district boundary files... ', ending='')
    stdout.flush()

    for path in files:
        with open(path) as f:
            data = json.load(f)

        for feat in data.get('features', []):
            props = feat.get('properties', {})
            state_fips = props.get('STATE', '')
            state_abbr = _FIPS_TO_STATE.get(state_fips, '')
            if not state_abbr:
                continue

            cd_str = props.get('CD119', '00')
            try:
                cd_int = int(cd_str)
            except ValueError:
                # 'ZZ' = water-body placeholder — not a real district, skip it.
                continue
            # 0 = at-large; 98 = DC delegate seat — both stored as None in the DB.
            district_number: int | None = None if (cd_int == 0 or cd_int >= 90) else cd_int

            geom = feat.get('geometry', {})
            all_coords = _extract_outer_rings(geom)
            if not all_coords:
                continue

            lngs = [c[0] for ring in all_coords for c in ring]
            lats = [c[1] for ring in all_coords for c in ring]
            bbox = (min(lngs), min(lats), max(lngs), max(lats))

            index.append((state_abbr, district_number, *bbox, geom))

    stdout.write(f'{len(index)} district polygons indexed\n')
    return index


def _extract_outer_rings(geometry: dict) -> list[list]:
    """Return outer rings of a Polygon or MultiPolygon as a list of coord lists."""
    gtype = geometry.get('type', '')
    coords = geometry.get('coordinates', [])
    if gtype == 'Polygon' and coords:
        return [coords[0]]
    if gtype == 'MultiPolygon':
        return [poly[0] for poly in coords if poly]
    return []


# ---------------------------------------------------------------------------
# Point-in-polygon
# ---------------------------------------------------------------------------

def _pip_ring(lng: float, lat: float, ring: list) -> bool:
    """Ray-casting point-in-polygon test against a single ring."""
    inside = False
    n = len(ring)
    x0, y0 = ring[-1]
    for i in range(n):
        x1, y1 = ring[i]
        if (y0 > lat) != (y1 > lat):
            if lng < (x1 - x0) * (lat - y0) / (y1 - y0) + x0:
                inside = not inside
        x0, y0 = x1, y1
    return inside


def _point_in_geometry(lng: float, lat: float, geometry: dict) -> bool:
    """Return True if (lng, lat) falls inside the Polygon or MultiPolygon."""
    gtype = geometry.get('type', '')
    coords = geometry.get('coordinates', [])
    if gtype == 'Polygon':
        return bool(coords) and _pip_ring(lng, lat, coords[0])
    if gtype == 'MultiPolygon':
        return any(_pip_ring(lng, lat, poly[0]) for poly in coords if poly)
    return False


def _lookup(
    lng: float,
    lat: float,
    index: list[tuple],
) -> tuple[str | None, int | None]:
    """Return (state_abbr, district_number) for a point, or (None, None)."""
    for state_abbr, district_number, min_lng, min_lat, max_lng, max_lat, geom in index:
        if min_lng <= lng <= max_lng and min_lat <= lat <= max_lat:
            if _point_in_geometry(lng, lat, geom):
                return state_abbr, district_number
    return None, None


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = (
        'Build the local ZIP → (lat, lng, state, district) lookup table from '
        'Census Gazetteer centroids and local district boundary files. '
        'Commit the output file so deployments never need a network connection at runtime.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Re-build even if the output file already exists',
        )

    def handle(self, *args, **options):
        out_dir = _get_zip_data_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / OUTPUT_FILENAME

        if out_path.exists() and not options['overwrite']:
            self.stdout.write(
                self.style.WARNING(
                    f'{out_path} already exists. Use --overwrite to rebuild.'
                )
            )
            return

        self.stdout.write('Building ZIP lookup table:\n')

        # 1. Gazetteer centroids
        centroids = _fetch_gazetteer(self.stdout)

        # 2. Spatial index from local district files
        district_dir = _get_district_data_dir()
        index = _build_spatial_index(district_dir, self.stdout)

        # 3. Point-in-polygon assignment
        self.stdout.write(
            f'  Running PIP for {len(centroids):,} ZCTAs against '
            f'{len(index)} district polygons...\n'
        )
        lookup: dict[str, dict] = {}
        unmatched = 0
        for i, (zcta, (lat, lng)) in enumerate(centroids.items()):
            state_abbr, district_number = _lookup(lng, lat, index)
            if state_abbr is None:
                unmatched += 1
                continue
            lookup[zcta] = {
                'lat': round(lat, 6),
                'lng': round(lng, 6),
                'state': state_abbr,
                'district': district_number,
            }
            if (i + 1) % 5000 == 0:
                self.stdout.write(f'    {i + 1:,} / {len(centroids):,}...\n')

        self.stdout.write(
            f'  Matched {len(lookup):,} ZCTAs '
            f'({unmatched} unmatched — likely water-area ZCTAs outside district boundaries)\n'
        )

        # 4. Write gzipped JSON
        json_bytes = json.dumps(lookup, separators=(',', ':')).encode('utf-8')
        with gzip.open(out_path, 'wb', compresslevel=9) as gz:
            gz.write(json_bytes)

        kb = out_path.stat().st_size // 1024
        self.stdout.write(self.style.SUCCESS(
            f'\nWrote {out_path} ({kb} KB compressed, {len(lookup):,} ZCTAs)\n'
            'Commit this file to version control.\n'
        ))

"""
Management command: export_static_data

Exports the current representative dataset and all committed static geo/reference
data into frontend/public/data/ as the frontend's sole data source (no backend API
calls at runtime for these paths). Part of the frontend-only Vercel migration —
this command is the bridge between the Django-managed dataset and the static site.

Output is deterministic (sorted, compact JSON) so a re-run against unchanged data
produces zero git diff. Validation runs against an in-memory build first; nothing
is written to the real output directory unless every check passes.

Usage:
    python manage.py export_static_data
    python manage.py export_static_data --out ../frontend/public/data
"""

import datetime
import gzip
import json
import shutil
import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from representatives.models import Representative

SCHEMA_VERSION = 1

FEDERAL_LEVELS = ('us_house', 'us_senate')
VALID_PARTIES = {'democrat', 'republican', 'independent', 'other'}

HOUSE_COUNT_RANGE = (430, 441)
SENATE_COUNT_RANGE = (96, 100)


def _default_out_dir() -> Path:
    # <repo>/backend/representatives/management/commands/export_static_data.py
    # parents: [0]=commands [1]=management [2]=representatives [3]=backend [4]=repo root
    return Path(__file__).resolve().parents[4] / 'frontend' / 'public' / 'data'


def _district_label(rep: Representative) -> str:
    if rep.level == 'us_senate':
        return rep.state
    if rep.district_number is None:
        return f'{rep.state} - At-Large'
    return f'{rep.state} - District {rep.district_number}'


def _bioguide_id(rep: Representative) -> str:
    return (rep.external_ids or {}).get('bioguide_id', '')


def _serialize_rep(rep: Representative) -> dict:
    bioguide_id = _bioguide_id(rep)
    return {
        'id': rep.id,
        'name': rep.name,
        'level': rep.level,
        'party': rep.party,
        'state': rep.state,
        'district_number': rep.district_number,
        'photo_url': rep.photo_url,
        'website': rep.website,
        'phone': rep.phone,
        'social_links': rep.social_links or {},
        'term_start': rep.term_start.isoformat() if rep.term_start else None,
        'term_end': rep.term_end.isoformat() if rep.term_end else None,
        'office_room': rep.office_room,
        'office_address': rep.office_room,
        'latitude': rep.latitude,
        'longitude': rep.longitude,
        'external_ids': rep.external_ids or {},
        'district_label': _district_label(rep),
        'congress_gov_url': f'https://www.congress.gov/member/{bioguide_id}' if bioguide_id else '',
        'bioguide_url': f'https://bioguide.congress.gov/search/bio/{bioguide_id}' if bioguide_id else '',
        'bioguide_id': bioguide_id,
    }


def _dedupe_stale_seat_holders(reps: list[Representative], stdout) -> list[Representative]:
    """Resolve mid-term seat transitions.

    The upstream congress-legislators source occasionally lists both an outgoing
    and incoming member for the same seat for a short window around a resignation,
    death, or appointment (observed: SC senate class 3, 2026 — the outgoing member's
    row lags behind the appointee's). Both rows share (state, level, term_end); the
    later term_start identifies the current occupant. This is a narrow, well-defined
    signal — it does not fire for the normal case of two senators with different
    class years, which have different term_end values.
    """
    groups: dict[tuple, list[Representative]] = {}
    for rep in reps:
        key = (rep.state, rep.level, rep.district_number, rep.term_end)
        groups.setdefault(key, []).append(rep)

    resolved = []
    for key, group in groups.items():
        if len(group) == 1:
            resolved.append(group[0])
            continue
        group.sort(key=lambda r: r.term_start or datetime.date.min, reverse=True)
        kept = group[0]
        dropped = group[1:]
        stdout.write(
            f'  Seat transition resolved: {key[0]}/{key[1]} — '
            f'kept "{kept.name}" (term_start={kept.term_start}), '
            f'dropped stale {[d.name for d in dropped]}'
        )
        resolved.append(kept)
    return resolved


def _validate(reps: list[dict]) -> list[str]:
    errors = []

    for rep in reps:
        if not rep['bioguide_id']:
            errors.append(f"rep id={rep['id']} ({rep['name']!r}) has no bioguide_id")
        if rep['latitude'] is None or rep['longitude'] is None:
            errors.append(f"rep id={rep['id']} ({rep['name']!r}) missing lat/lng")
        if rep['party'] not in VALID_PARTIES:
            errors.append(f"rep id={rep['id']} ({rep['name']!r}) has invalid party {rep['party']!r}")

    house = [r for r in reps if r['level'] == 'us_house']
    senate = [r for r in reps if r['level'] == 'us_senate']

    lo, hi = HOUSE_COUNT_RANGE
    if not (lo <= len(house) <= hi):
        errors.append(f'House count {len(house)} outside expected range [{lo}, {hi}]')

    lo, hi = SENATE_COUNT_RANGE
    if not (lo <= len(senate) <= hi):
        errors.append(f'Senate count {len(senate)} outside expected range [{lo}, {hi}]')

    senate_by_state: dict[str, int] = {}
    for r in senate:
        senate_by_state[r['state']] = senate_by_state.get(r['state'], 0) + 1
    for state, count in senate_by_state.items():
        if count > 2:
            errors.append(f'{state} has {count} senators after dedup (expected <=2)')

    house_seats: dict[tuple, int] = {}
    for r in house:
        seat = (r['state'], r['district_number'])
        house_seats[seat] = house_seats.get(seat, 0) + 1
    for seat, count in house_seats.items():
        if count > 1:
            errors.append(f'House seat {seat} has {count} occupants after dedup (expected 1)')

    return errors


class Command(BaseCommand):
    help = (
        'Export federal representatives, ZIP lookup table, district GeoJSON, and '
        'election dates to frontend/public/data/ as static JSON for the frontend-only build.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--out', default=None,
            help='Output directory (default: <repo>/frontend/public/data)',
        )

    def handle(self, *args, **options):
        out_dir = Path(options['out']).resolve() if options['out'] else _default_out_dir()

        # -- Representatives --------------------------------------------------
        raw_reps = list(Representative.objects.filter(level__in=FEDERAL_LEVELS))
        self.stdout.write(f'Loaded {len(raw_reps)} federal representatives from the database.')

        deduped = _dedupe_stale_seat_holders(raw_reps, self.stdout)
        if len(deduped) != len(raw_reps):
            self.stdout.write(f'Deduped {len(raw_reps) - len(deduped)} stale seat-transition row(s).')

        committees = {
            _bioguide_id(rep): list(rep.committee_assignments or [])
            for rep in deduped
            if _bioguide_id(rep) and rep.committee_assignments
        }

        serialized = [_serialize_rep(r) for r in deduped]
        serialized.sort(key=lambda r: (r['bioguide_id'] or '', r['id']))

        errors = _validate(serialized)
        if errors:
            self.stdout.write(self.style.ERROR('Validation failed:'))
            for e in errors:
                self.stdout.write(self.style.ERROR(f'  - {e}'))
            raise CommandError(
                f'{len(errors)} validation error(s); no files were written. '
                'Investigate the source data before re-running.'
            )
        self.stdout.write(self.style.SUCCESS(
            f'Validation passed: {len(serialized)} representatives '
            f'({sum(1 for r in serialized if r["level"] == "us_house")} house, '
            f'{sum(1 for r in serialized if r["level"] == "us_senate")} senate).'
        ))

        # -- Build everything in a temp dir first ------------------------------
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self._write_json(tmp_path / 'representatives.json', serialized)
            self._write_json(tmp_path / 'committees.json', committees)
            self._export_zips(tmp_path)
            self._export_elections(tmp_path)
            district_count = self._copy_geo_dir(
                Path(__file__).resolve().parents[2] / 'district_data',
                tmp_path / 'districts',
            )
            state_district_count = self._copy_geo_dir(
                Path(__file__).resolve().parents[2] / 'state_district_data',
                tmp_path / 'state_district',
            )
            historical_count = self._copy_geo_dir(
                Path(__file__).resolve().parents[2] / 'historical_district_data',
                tmp_path / 'historical',
            )

            meta = {
                'schema_version': SCHEMA_VERSION,
                'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'counts': {
                    'representatives': len(serialized),
                    'house': sum(1 for r in serialized if r['level'] == 'us_house'),
                    'senate': sum(1 for r in serialized if r['level'] == 'us_senate'),
                    'districts': district_count,
                    'state_district_files': state_district_count,
                    'historical_districts': historical_count,
                },
            }
            self._write_json(tmp_path / 'meta.json', meta)

            # -- Atomically replace the output directory's generated files ----
            out_dir.mkdir(parents=True, exist_ok=True)
            for item in tmp_path.iterdir():
                dest = out_dir / item.name
                if dest.is_dir():
                    shutil.rmtree(dest)
                elif dest.exists():
                    dest.unlink()
                shutil.move(str(item), str(dest))

        self.stdout.write(self.style.SUCCESS(f'Wrote static data to {out_dir}'))

    # -- helpers --------------------------------------------------------------

    def _write_json(self, path: Path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(data, sort_keys=True, separators=(',', ':')),
            encoding='utf-8',
        )

    def _export_zips(self, tmp_path: Path) -> None:
        src = Path(__file__).resolve().parents[2] / 'zip_data' / 'zips.json.gz'
        if not src.exists():
            self.stdout.write(self.style.WARNING(
                f'  zips.json.gz not found at {src} — run build_zip_data first. Skipping.'
            ))
            return
        with gzip.open(src, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        self._write_json(tmp_path / 'zips.json', data)
        self.stdout.write(f'  zips.json: {len(data)} ZIP codes')

    def _export_elections(self, tmp_path: Path) -> None:
        src = Path(__file__).resolve().parents[2] / 'election_data' / 'elections.json'
        if not src.exists():
            self.stdout.write(self.style.WARNING(f'  elections.json not found at {src}. Skipping.'))
            return
        data = json.loads(src.read_text(encoding='utf-8'))
        self._write_json(tmp_path / 'elections.json', data)
        self.stdout.write('  elections.json: copied')

    def _copy_geo_dir(self, src_dir: Path, dest_dir: Path) -> int:
        if not src_dir.exists():
            return 0
        files = sorted(src_dir.glob('*.json'))
        if not files:
            return 0
        dest_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            shutil.copyfile(f, dest_dir / f.name)
        self.stdout.write(f'  {dest_dir.name}/: {len(files)} files')
        return len(files)

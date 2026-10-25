"""
Management command: export_election_data

Builds the cycle-agnostic election files the frontend reads from
frontend/public/data/elections/:

    index.json      list of active cycles (current + next presidential)
    <cycle>.json    races (House by district, Senate by seat up, President) with
                    FEC-filed candidates

Reads the already-exported representatives.json (no database needed) and the
committed congressional district GeoJSON, and downloads FEC bulk candidate files.
Output is deterministic — no timestamps — so an unchanged FEC dataset produces zero
git diff. All validation runs before anything is written.

Usage:
    python manage.py export_election_data
    python manage.py export_election_data --today 2026-10-25
"""

import datetime
import json
import shutil
import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from representatives.services import elections

SCHEMA_VERSION = 1

# CD119 codes that are not ordinary numbered districts: 00 = at-large, 98 = non-voting delegate.
_AT_LARGE_CODES = {'00', '98'}


def _repo_root() -> Path:
    # parents: [0]=commands [1]=management [2]=representatives [3]=backend [4]=repo root
    return Path(__file__).resolve().parents[4]


def _default_out_dir() -> Path:
    return _repo_root() / 'frontend' / 'public' / 'data'


def _districts_by_state(district_dir: Path) -> dict[str, list[int]]:
    result = {}
    for path in sorted(district_dir.glob('*.json')):
        state = path.stem.upper()
        data = json.loads(path.read_text(encoding='utf-8'))
        numbers = set()
        for feature in data.get('features', []):
            code = str((feature.get('properties') or {}).get('CD119', '')).zfill(2)
            if code in _AT_LARGE_CODES:
                numbers.add(0)
            elif code.isdigit():
                numbers.add(int(code))
        if numbers:
            result[state] = sorted(numbers)
    return result


class Command(BaseCommand):
    help = 'Export election cycles, races and FEC-filed candidates to frontend/public/data/elections/.'

    def add_arguments(self, parser):
        parser.add_argument('--out', default=None,
                            help='Data directory (default: <repo>/frontend/public/data)')
        parser.add_argument('--today', default=None,
                            help='Override today (YYYY-MM-DD) to pick the active cycles.')

    def handle(self, *args, **options):
        out_dir = Path(options['out']).resolve() if options['out'] else _default_out_dir()
        today = (
            datetime.date.fromisoformat(options['today'])
            if options['today'] else datetime.datetime.now(datetime.timezone.utc).date()
        )

        reps_path = out_dir / 'representatives.json'
        if not reps_path.exists():
            raise CommandError(f'{reps_path} not found — run export_static_data first.')
        reps = json.loads(reps_path.read_text(encoding='utf-8'))

        districts = _districts_by_state(Path(__file__).resolve().parents[2] / 'district_data')
        if not districts:
            raise CommandError('No congressional district data found in representatives/district_data.')

        cycles = elections.active_cycles(today)
        self.stdout.write(f'Active cycles for {today}: {cycles}')

        docs = []
        for i, cycle in enumerate(cycles):
            # The nearest cycle must have FEC data; a far-future cycle may not be published yet.
            current = i == 0
            try:
                doc = elections.build_cycle(
                    cycle, reps, districts, require_candidates=current, today=today,
                )
            except elections.ElectionDataError as e:
                if current:
                    raise CommandError(f'Cycle {cycle}: {e}; no files were written.')
                self.stdout.write(self.style.WARNING(f'  Cycle {cycle} skipped: {e}'))
                continue
            docs.append(doc)
            self.stdout.write(
                f'  {cycle}: {doc["stats"]["races"]} races, {doc["stats"]["candidates"]} candidates '
                f'({doc["stats"]["dropped"]} outside tracked races), data through {doc["data_through"]}'
            )

        index = {
            'schema_version': SCHEMA_VERSION,
            'cycles': [
                {
                    'cycle': d['cycle'],
                    'general_date': d['general_date'],
                    'label': d['label'],
                    'presidential': d['presidential'],
                    'data_through': d['data_through'],
                    'path': f'/data/elections/{d["cycle"]}.json',
                }
                for d in docs
            ],
        }

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            self._write_json(tmp_path / 'index.json', index)
            for d in docs:
                self._write_json(tmp_path / f'{d["cycle"]}.json', d)

            dest_dir = out_dir / 'elections'
            if dest_dir.exists():
                shutil.rmtree(dest_dir)
            shutil.copytree(tmp_path, dest_dir)

        self.stdout.write(self.style.SUCCESS(f'Wrote election data to {dest_dir}'))

    def _write_json(self, path: Path, data) -> None:
        path.write_text(json.dumps(data, sort_keys=True, separators=(',', ':')), encoding='utf-8')

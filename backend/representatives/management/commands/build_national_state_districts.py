"""
Management command: build_national_state_districts

Concatenates all per-state state legislative district GeoJSON files into two
combined national files (lower + upper chamber) and writes them to the frontend
public/data directory so they can be loaded as static assets — mirroring the
approach used for national_districts.json (federal congressional districts).

Run this once after build_state_district_data has been run, or whenever the
per-state files are refreshed.

Usage:
    python manage.py build_national_state_districts
    python manage.py build_national_state_districts --overwrite
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from representatives.integrations.census import get_state_district_data_dir


def get_frontend_data_dir() -> Path:
    # Resolve frontend/public/data relative to the repo root.
    # __file__ is at  <repo>/backend/representatives/management/commands/<name>.py
    # parents: [0]=commands, [1]=management, [2]=representatives, [3]=backend, [4]=repo root
    return (
        Path(__file__).resolve().parents[4]
        / 'frontend' / 'public' / 'data'
    )


class Command(BaseCommand):
    help = (
        'Combine per-state legislative district GeoJSON files into two national '
        'files (lower + upper) for use as static frontend assets.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Overwrite output files if they already exist (default: skip).',
        )

    def handle(self, *args, **options):
        src_dir = get_state_district_data_dir()
        out_dir = get_frontend_data_dir()
        out_dir.mkdir(parents=True, exist_ok=True)

        lower_out = out_dir / 'national_state_lower.json'
        upper_out = out_dir / 'national_state_upper.json'

        for path in (lower_out, upper_out):
            if path.exists() and not options['overwrite']:
                self.stdout.write(
                    f'{path.name}: already exists — use --overwrite to regenerate'
                )
                return

        self.stdout.write(f'Source directory: {src_dir}')
        self.stdout.write(f'Output directory: {out_dir}')
        self.stdout.write('')

        lower_features = []
        upper_features = []
        missing_lower = []
        missing_upper = []

        lower_files = sorted(src_dir.glob('*_lower.json'))
        upper_files = sorted(src_dir.glob('*_upper.json'))

        if not lower_files and not upper_files:
            self.stdout.write(
                self.style.ERROR(
                    f'No *_lower.json or *_upper.json files found in {src_dir}.\n'
                    'Run build_state_district_data first.'
                )
            )
            return

        for path in lower_files:
            state = path.stem.split('_')[0]
            try:
                fc = json.loads(path.read_text())
                feats = fc.get('features') or []
                lower_features.extend(feats)
                self.stdout.write(f'  {state} lower: {len(feats)} features')
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f'  {state} lower: FAILED ({exc})'))
                missing_lower.append(state)

        for path in upper_files:
            state = path.stem.split('_')[0]
            try:
                fc = json.loads(path.read_text())
                feats = fc.get('features') or []
                upper_features.extend(feats)
                self.stdout.write(f'  {state} upper: {len(feats)} features')
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f'  {state} upper: FAILED ({exc})'))
                missing_upper.append(state)

        self.stdout.write('')

        # Write lower
        lower_fc = {'type': 'FeatureCollection', 'features': lower_features}
        lower_out.write_text(json.dumps(lower_fc, separators=(',', ':')))
        lower_kb = lower_out.stat().st_size // 1024
        self.stdout.write(
            self.style.SUCCESS(
                f'Wrote {lower_out.name}: {len(lower_features)} features, {lower_kb} KB'
            )
        )

        # Write upper
        upper_fc = {'type': 'FeatureCollection', 'features': upper_features}
        upper_out.write_text(json.dumps(upper_fc, separators=(',', ':')))
        upper_kb = upper_out.stat().st_size // 1024
        self.stdout.write(
            self.style.SUCCESS(
                f'Wrote {upper_out.name}: {len(upper_features)} features, {upper_kb} KB'
            )
        )

        if missing_lower or missing_upper:
            self.stdout.write('')
            self.stdout.write(
                self.style.WARNING(
                    f'Failed states — lower: {missing_lower or "none"}  '
                    f'upper: {missing_upper or "none"}'
                )
            )
            self.stdout.write(
                'Re-run build_state_district_data --states <STATE> to fix missing files, '
                'then re-run this command with --overwrite.'
            )
        else:
            self.stdout.write('')
            self.stdout.write('All states combined successfully.')

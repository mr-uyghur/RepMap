"""
Management command: build_historical_district_data

Fetches simplified historical (CD116) congressional district GeoJSON from the Census TIGER API
and saves one JSON file per state to the local historical_district_data directory.

Usage:
    python manage.py build_historical_district_data              # fetch all 51 states
    python manage.py build_historical_district_data --states CA TX NY
    python manage.py build_historical_district_data --overwrite  # re-download existing files
"""

import json
from django.core.management.base import BaseCommand, CommandError
from representatives.integrations.census import (
    fetch_historical_congressional_districts,
    get_historical_district_data_dir,
    STATE_FIPS,
)


class Command(BaseCommand):
    help = (
        'Fetch and store historical (CD116) congressional district GeoJSON from Census TIGER. '
        'Used for redistricting comparison against current CD119 boundaries.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes, e.g. CA TX NY (default: all)',
        )
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Re-download and overwrite files that already exist',
        )

    def handle(self, *args, **options):
        data_dir = get_historical_district_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f'Historical district data directory: {data_dir}\n')

        states = [s.upper() for s in (options.get('states') or sorted(STATE_FIPS))]
        invalid = [s for s in states if s not in STATE_FIPS]
        if invalid:
            raise CommandError(f'Unknown state code(s): {", ".join(invalid)}')

        ok = skip = fail = 0
        for state in states:
            path = data_dir / f'{state}.json'
            if path.exists() and not options['overwrite']:
                self.stdout.write(f'  {state}: skipped (file exists, use --overwrite to refresh)')
                skip += 1
                continue

            self.stdout.write(f'  {state}: fetching...', ending='')
            self.stdout.flush()
            try:
                data = fetch_historical_congressional_districts(state)
                path.write_text(json.dumps(data, separators=(',', ':')))
                feature_count = len(data.get('features', []))
                self.stdout.write(self.style.SUCCESS(f' saved ({feature_count} districts)'))
                ok += 1
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f' FAILED: {exc}'))
                fail += 1

        self.stdout.write('')
        self.stdout.write(f'Done: {ok} fetched, {skip} skipped, {fail} failed.')
        if fail:
            self.stdout.write(
                self.style.WARNING('Re-run to retry failed states, or use --overwrite.')
            )
        if ok:
            self.stdout.write(
                'Commit the generated files to version control so deployments '
                'do not require a live Census connection.'
            )

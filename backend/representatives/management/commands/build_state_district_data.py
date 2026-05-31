"""
Management command: build_state_district_data

Fetches simplified state legislative district GeoJSON from the Census TIGER API
and saves two JSON files per state (lower + upper) to the state_district_data directory.

Usage:
    python manage.py build_state_district_data
    python manage.py build_state_district_data --states CA TX NY
    python manage.py build_state_district_data --overwrite
    python manage.py build_state_district_data --chamber lower
"""
import json
from django.core.management.base import BaseCommand, CommandError
from representatives.integrations.census import (
    fetch_state_legislative_districts,
    get_state_district_data_dir,
)
from representatives.constants import STATE_FIPS


class Command(BaseCommand):
    help = 'Fetch and store simplified state legislative district GeoJSON from Census TIGER.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes (default: all)',
        )
        parser.add_argument(
            '--overwrite', action='store_true',
            help='Re-download and overwrite files that already exist',
        )
        parser.add_argument(
            '--chamber', choices=['lower', 'upper'],
            help='Fetch only one chamber (default: both)',
        )

    def handle(self, *args, **options):
        data_dir = get_state_district_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f'State district data directory: {data_dir}\n')

        states = [s.upper() for s in (options.get('states') or sorted(STATE_FIPS))]
        invalid = [s for s in states if s not in STATE_FIPS]
        if invalid:
            raise CommandError(f'Unknown state code(s): {", ".join(invalid)}')

        chambers = ['lower', 'upper']
        if options.get('chamber'):
            chambers = [options['chamber']]

        ok = skip = fail = 0
        for state in states:
            for chamber in chambers:
                path = data_dir / f'{state}_{chamber}.json'
                if path.exists() and not options['overwrite']:
                    self.stdout.write(f'  {state} {chamber}: skipped (file exists)')
                    skip += 1
                    continue

                self.stdout.write(f'  {state} {chamber}: fetching...', ending='')
                self.stdout.flush()
                try:
                    data = fetch_state_legislative_districts(state, chamber)
                    path.write_text(json.dumps(data, separators=(',', ':')))
                    feature_count = len(data.get('features', []))
                    self.stdout.write(
                        self.style.SUCCESS(f' saved ({feature_count} districts)')
                    )
                    ok += 1
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f' FAILED: {exc}'))
                    fail += 1

        self.stdout.write('')
        self.stdout.write(f'Done: {ok} fetched, {skip} skipped, {fail} failed.')

"""
One-shot backfill: replace degenerate state-centroid coordinates on
existing state_house / state_senate rows with the centroid of their
actual district polygon from the on-disk boundary files.

No external API calls — uses state_district_data/ files that are
already present. Run once after the openstates.py coordinate fix to
bring existing rows in line without a full re-sync.
"""
from django.core.management.base import BaseCommand

from representatives.integrations.openstates import _get_district_centroids
from representatives.models import Representative


class Command(BaseCommand):
    help = 'Backfill district-centroid coordinates onto existing state legislators'

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes (default: all)',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would be updated without saving',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        filter_states = [s.upper() for s in (options.get('states') or [])]

        qs = Representative.objects.filter(level__in=['state_house', 'state_senate'])
        if filter_states:
            qs = qs.filter(state__in=filter_states)

        updated = 0
        skipped = 0

        for rep in qs.iterator():
            chamber = 'lower' if rep.level == 'state_house' else 'upper'
            centroids = _get_district_centroids(rep.state, chamber)

            if rep.district_number is None or rep.district_number not in centroids:
                skipped += 1
                continue

            lat, lng = centroids[rep.district_number]
            if rep.latitude == lat and rep.longitude == lng:
                skipped += 1
                continue

            if not dry_run:
                rep.latitude = lat
                rep.longitude = lng
                rep.save(update_fields=['latitude', 'longitude'])

            updated += 1

        action = 'Would update' if dry_run else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f'{action} {updated} legislator(s). Skipped {skipped} '
                f'(no matching district polygon or already correct).'
            )
        )

import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from representatives.constants import STATE_FIPS
from representatives.integrations.openstates import OpenStatesUnavailable, fetch_state_legislators
from representatives.models import Representative


class Command(BaseCommand):
    help = 'Sync state legislators from the OpenStates API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--states', nargs='*', metavar='STATE',
            help='Limit to specific state codes, e.g. CA TX NY (default: all)',
        )
        parser.add_argument(
            '--purge', action='store_true',
            help='Remove state legislators no longer returned by OpenStates',
        )

    def handle(self, *args, **options):
        if not getattr(settings, 'OPENSTATES_API_KEY', ''):
            raise CommandError(
                'OPENSTATES_API_KEY is not set. '
                'Add it to your .env before running this command.'
            )

        states = [s.upper() for s in (options.get('states') or sorted(STATE_FIPS))]
        invalid = [s for s in states if s not in STATE_FIPS]
        if invalid:
            raise CommandError(f'Unknown state code(s): {", ".join(invalid)}')

        # Pre-load all existing state-level records keyed by openstates_id.
        existing_by_os_id = {}
        for rep in Representative.objects.filter(level__in=['state_house', 'state_senate']):
            os_id = (rep.external_ids or {}).get('openstates_id', '')
            if os_id:
                existing_by_os_id[os_id] = rep

        total_created = 0
        total_updated = 0
        total_skipped = 0
        total_purged = 0

        for i, state in enumerate(states, 1):
            self.stdout.write(f'[{i}/{len(states)}] {state}: fetching...', ending='')
            self.stdout.flush()

            try:
                people = fetch_state_legislators(state)
            except OpenStatesUnavailable as e:
                self.stdout.write(self.style.ERROR(f' FAILED: {e}'))
                total_skipped += 1
                continue

            created = 0
            updated = 0
            synced_os_ids = set()

            for person in people:
                os_id = person.get('external_ids', {}).get('openstates_id', '')
                synced_os_ids.add(os_id)

                if os_id and os_id in existing_by_os_id:
                    rep = existing_by_os_id[os_id]
                    for attr, val in person.items():
                        setattr(rep, attr, val)
                    rep.save()
                    updated += 1
                else:
                    rep = Representative.objects.create(**person)
                    if os_id:
                        existing_by_os_id[os_id] = rep
                    created += 1

            purged = 0
            if options['purge']:
                for rep in Representative.objects.filter(
                    state=state, level__in=['state_house', 'state_senate']
                ):
                    os_id = (rep.external_ids or {}).get('openstates_id', '')
                    if os_id and os_id not in synced_os_ids:
                        rep.delete()
                        purged += 1

            total_created += created
            total_updated += updated
            total_purged += purged
            self.stdout.write(
                self.style.SUCCESS(f' {created} created, {updated} updated, {len(people)} total')
                + (f', {purged} purged' if purged else '')
            )

            if i < len(states):
                time.sleep(3.0)  # Respect OpenStates rate limits between states

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Created {total_created}, updated {total_updated} state legislators '
                f'for {len(states)} states ({total_skipped} skipped).'
            )
            + (f' Purged {total_purged} retired legislators.' if total_purged else '')
        )

import datetime
import io
import json
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from representatives.management.commands.export_static_data import (
    _dedupe_stale_seat_holders,
    _serialize_rep,
    _validate,
)
from representatives.models import Representative


def make_rep(**overrides):
    defaults = dict(
        name='Test Person',
        level='us_house',
        party='democrat',
        state='CA',
        district_number=1,
        latitude=34.0,
        longitude=-118.0,
        external_ids={'bioguide_id': 'T000001'},
    )
    defaults.update(overrides)
    return Representative.objects.create(**defaults)


class DedupeStaleSeatHoldersTests(TestCase):
    def test_two_senators_different_term_end_are_both_kept(self):
        a = make_rep(level='us_senate', district_number=None, state='CA',
                      external_ids={'bioguide_id': 'A000001'},
                      term_start=datetime.date(2021, 1, 3), term_end=datetime.date(2027, 1, 3))
        b = make_rep(level='us_senate', district_number=None, state='CA',
                      external_ids={'bioguide_id': 'B000001'},
                      term_start=datetime.date(2023, 1, 3), term_end=datetime.date(2029, 1, 3))
        result = _dedupe_stale_seat_holders([a, b], io.StringIO())
        self.assertEqual({r.id for r in result}, {a.id, b.id})

    def test_seat_transition_keeps_later_term_start(self):
        outgoing = make_rep(level='us_senate', district_number=None, state='SC',
                             name='Outgoing', external_ids={'bioguide_id': 'G000359'},
                             term_start=datetime.date(2021, 1, 3), term_end=datetime.date(2027, 1, 3))
        incoming = make_rep(level='us_senate', district_number=None, state='SC',
                             name='Incoming', external_ids={'bioguide_id': 'G000608'},
                             term_start=datetime.date(2026, 7, 14), term_end=datetime.date(2027, 1, 3))
        result = _dedupe_stale_seat_holders([outgoing, incoming], io.StringIO())
        self.assertEqual([r.id for r in result], [incoming.id])


STATES_50 = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]


class ValidateTests(TestCase):
    def _house(self, n):
        # Unique (state, district_number) per rep; state doesn't need real
        # apportionment for these checks, only total count and uniqueness.
        return [
            _serialize_rep(make_rep(level='us_house', state='CA', district_number=i,
                                     external_ids={'bioguide_id': f'H{i:06d}'}))
            for i in range(n)
        ]

    def _senate_full(self):
        # Two senators per state with different class-year term_end values,
        # matching the real Senate's staggered-term structure.
        reps = []
        for i, state in enumerate(STATES_50):
            reps.append(_serialize_rep(make_rep(
                level='us_senate', state=state, district_number=None,
                external_ids={'bioguide_id': f'A{i:06d}'}, term_end=datetime.date(2027, 1, 3),
            )))
            reps.append(_serialize_rep(make_rep(
                level='us_senate', state=state, district_number=None,
                external_ids={'bioguide_id': f'B{i:06d}'}, term_end=datetime.date(2029, 1, 3),
            )))
        return reps

    def test_valid_dataset_passes(self):
        reps = self._house(435) + self._senate_full()
        self.assertEqual(_validate(reps), [])

    def test_missing_bioguide_id_fails(self):
        rep = _serialize_rep(make_rep(external_ids={}))
        errors = _validate([rep])
        self.assertTrue(any('bioguide_id' in e for e in errors))

    def test_invalid_party_fails(self):
        rep = _serialize_rep(make_rep(party='martian'))
        errors = _validate([rep])
        self.assertTrue(any('party' in e for e in errors))

    def test_house_count_out_of_range_fails(self):
        reps = self._house(5)
        errors = _validate(reps)
        self.assertTrue(any('House count' in e for e in errors))

    def test_more_than_two_senators_per_state_fails(self):
        reps = [
            _serialize_rep(make_rep(
                level='us_senate', state='CA', district_number=None,
                external_ids={'bioguide_id': f'S{i:06d}'}, term_end=datetime.date(2027 + i, 1, 3),
            ))
            for i in range(3)
        ]
        errors = _validate(reps)
        self.assertTrue(any('CA has 3 senators' in e for e in errors))


class ExportCommandTests(TestCase):
    def _seed_full_dataset(self):
        for i in range(435):
            make_rep(level='us_house', state='CA', district_number=i,
                      external_ids={'bioguide_id': f'H{i:06d}'})
        for i, state in enumerate(STATES_50):
            make_rep(level='us_senate', state=state, district_number=None,
                      external_ids={'bioguide_id': f'A{i:06d}'}, term_end=datetime.date(2027, 1, 3))
            make_rep(level='us_senate', state=state, district_number=None,
                      external_ids={'bioguide_id': f'B{i:06d}'}, term_end=datetime.date(2029, 1, 3))

    def test_command_writes_files_for_valid_data(self):
        self._seed_full_dataset()

        with tempfile.TemporaryDirectory() as tmp:
            call_command('export_static_data', out=tmp)
            reps_path = Path(tmp) / 'representatives.json'
            self.assertTrue(reps_path.exists())
            data = json.loads(reps_path.read_text())
            self.assertEqual(len(data), 535)
            meta = json.loads((Path(tmp) / 'meta.json').read_text())
            self.assertEqual(meta['counts']['representatives'], 535)

    def test_command_fails_hard_on_unresolvable_anomaly(self):
        make_rep(level='us_senate', state='CA', district_number=None,
                  external_ids={'bioguide_id': 'S000001'}, term_end=datetime.date(2027, 1, 3))
        make_rep(level='us_senate', state='CA', district_number=None,
                  external_ids={'bioguide_id': 'S000002'}, term_end=datetime.date(2029, 1, 3))
        make_rep(level='us_senate', state='CA', district_number=None,
                  external_ids={'bioguide_id': 'S000003'}, term_end=datetime.date(2031, 1, 3))

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(CommandError):
                call_command('export_static_data', out=tmp)
            # Nothing should be written on failure.
            self.assertFalse((Path(tmp) / 'representatives.json').exists())

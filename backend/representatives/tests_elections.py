import datetime
import json
import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase

from representatives.services import elections as el

# Minimal FEC bulk fixtures. cn columns: id|name|party|election_yr|state|office|district|ici|status|committee
CN_2026 = '\n'.join([
    'S6OH00304|HUSTED, JON|REP|2026|OH|S|00|I|C|C1',
    'S6OH00163|BROWN, SHERROD|DEM|2026|OH|S|00|C|C|C2',
    'S6OH00346|VOLPE, CHRISTOPHER|DEM|2026|OH|S|00|C|C|C3',
    'S6OH00353|VOLPE, CHRISTOPHER|DEM|2026|OH|S|00|C|C|C4',
    'S6OH00312|BIBLER, BRIAN CHRISTOPHER MR|REP|2026|OH|S|00|C|N|C5',
    'H4CA12154|SIMON, LATEEFAH|DEM|2026|CA|H|12|I|C|C6',
    'H6CA12209|JOYCE, JAMIE|DEM|2026|CA|H|12|C|C|C7',
    'H6TX09124|CAIN, BRISCOE ROWELL III|REP|2026|TX|H|09|C|C|C8',
    'H0AL01055|OLD, CANDIDATE|REP|2024|AL|H|01|C|C|C9',
    'H0PR00001|TERRITORY, CAND|DEM|2026|PR|H|00|C|C|C10',
    'P00003244|WINTERBOTTOM, THOMAS|DEM|2028|US|P|00||C|C11',
])


def _weball_row(cand_id, name, receipts, cash, cvg):
    f = [''] * 30
    f[0], f[1], f[5], f[10], f[27] = cand_id, name, str(receipts), str(cash), cvg
    return '|'.join(f)


WEBALL_2026 = '\n'.join([
    _weball_row('S6OH00304', 'HUSTED, JON', 19894785.94, 4239097.0, '10/22/2026'),
    _weball_row('S6OH00163', 'BROWN, SHERROD', 68409199.85, 4452803.0, '10/14/2026'),
    _weball_row('S6OH00346', 'VOLPE, CHRISTOPHER', 4337.18, 100, '02/15/2026'),
    _weball_row('S6OH00353', 'VOLPE, CHRISTOPHER', 4337.18, 100, '02/15/2026'),
    _weball_row('H4CA12154', 'SIMON, LATEEFAH', 1703905.82, 500000, '10/14/2026'),
    _weball_row('H6CA12209', 'JOYCE, JAMIE', 69669.05, 1000, '12/31/2099'),  # typo'd future date
])


class CalendarTests(SimpleTestCase):
    def test_general_election_is_tuesday_after_first_monday(self):
        self.assertEqual(el.general_election_date(2026), datetime.date(2026, 11, 3))
        self.assertEqual(el.general_election_date(2028), datetime.date(2028, 11, 7))
        self.assertEqual(el.general_election_date(2030), datetime.date(2030, 11, 5))
        # Nov 1 is a Monday -> election is Nov 2.
        self.assertEqual(el.general_election_date(2032), datetime.date(2032, 11, 2))

    def test_presidential_years(self):
        self.assertTrue(el.is_presidential(2028))
        self.assertFalse(el.is_presidential(2026))

    def test_active_cycles_include_next_presidential(self):
        self.assertEqual(el.active_cycles(datetime.date(2026, 10, 25)), [2026, 2028])

    def test_cycle_rolls_forward_after_grace_period(self):
        # Within the 60-day results window the 2026 cycle is still active.
        self.assertEqual(el.active_cycles(datetime.date(2026, 12, 1))[0], 2026)
        self.assertEqual(el.active_cycles(datetime.date(2027, 1, 15))[0], 2028)

    def test_presidential_cycle_alone_when_current_is_presidential(self):
        cycles = el.active_cycles(datetime.date(2028, 5, 1))
        self.assertEqual(cycles[0], 2028)
        self.assertTrue(el.is_presidential(cycles[-1]))

    def test_seat_up_window(self):
        d = datetime.date
        self.assertTrue(el.seat_up_in_cycle(d(2027, 1, 3), 2026))   # regular
        self.assertTrue(el.seat_up_in_cycle(d(2026, 11, 3), 2026))  # special
        self.assertFalse(el.seat_up_in_cycle(d(2029, 1, 3), 2026))
        self.assertFalse(el.seat_up_in_cycle(None, 2026))
        self.assertTrue(el.is_special_term_end(d(2026, 11, 3), 2026))
        self.assertFalse(el.is_special_term_end(d(2027, 1, 3), 2026))


class NameAndPartyTests(SimpleTestCase):
    def test_clean_candidate_name(self):
        cases = {
            'KINCAID, RONALD E JR': 'Ronald E Kincaid Jr.',
            'IVEY, R. TODD DR.': 'R. Todd Ivey',
            'EMMERT, PETER VAN MR': 'Peter Van Emmert',
            "O'BRIEN, MEGAN": "Megan O'Brien",
            'MCCARTHY, KEVIN': 'Kevin McCarthy',
            'CAIN, BRISCOE ROWELL III': 'Briscoe Rowell Cain III',
            'LYLES, TAMIKA MS': 'Tamika Lyles',
        }
        for raw, expected in cases.items():
            self.assertEqual(el.clean_candidate_name(raw), expected, raw)

    def test_normalize_party(self):
        self.assertEqual(el.normalize_party('DEM'), ('democrat', 'Democratic'))
        self.assertEqual(el.normalize_party('DFL')[0], 'democrat')
        self.assertEqual(el.normalize_party('LIB'), ('other', 'Libertarian'))
        self.assertEqual(el.normalize_party('XYZ'), ('other', 'XYZ'))


class ParsingTests(SimpleTestCase):
    def test_candidate_master(self):
        rows = el.parse_candidate_master(CN_2026)
        self.assertEqual(len(rows), 11)
        self.assertEqual(rows[0]['fec_id'], 'S6OH00304')
        self.assertEqual(rows[0]['election_year'], 2026)

    def test_financial_summary_parses_dates_and_money(self):
        fin = el.parse_financial_summary(WEBALL_2026)
        self.assertEqual(fin['S6OH00304']['reports_through'], '2026-10-22')
        self.assertAlmostEqual(fin['S6OH00163']['receipts'], 68409199.85)

    def test_malformed_rows_are_skipped(self):
        self.assertEqual(el.parse_candidate_master('garbage\n|||\n'), [])


def _reps():
    def rep(level, state, term_end, district=None):
        return {'level': level, 'state': state, 'term_end': term_end, 'district_number': district}
    return [
        rep('us_senate', 'OH', '2026-11-03'),   # special
        rep('us_senate', 'OH', '2029-01-03'),   # not up
        rep('us_senate', 'CA', '2027-01-03'),   # regular
        rep('us_senate', 'TX', '2027-01-03'),
    ]


def _districts():
    # Padded to the 436 House races a full run has so validation passes.
    d = {'CA': list(range(1, 53)), 'TX': list(range(1, 39)), 'OH': list(range(1, 16))}
    n = sum(len(v) for v in d.values())
    d['ZZ'] = list(range(1, 436 - n + 1))  # filler state; irrelevant to assertions
    return d


def _fetch(cycle_file):
    if cycle_file == 2026:
        return CN_2026, WEBALL_2026
    return None


class BuildCycleTests(SimpleTestCase):
    def build(self, **kw):
        return el.build_cycle(
            2026, _reps(), _districts(), fetch=_fetch,
            require_candidates=False, today=datetime.date(2026, 10, 25),
            check_counts=False, **kw,
        )

    def test_races_derived_from_district_list_and_senate_terms(self):
        doc = self.build()
        races = doc['races']
        self.assertIn('US-SEN-OH-S', races)           # special
        self.assertNotIn('US-SEN-OH', races)           # other OH senator not up
        self.assertIn('US-SEN-CA', races)
        self.assertTrue(races['US-SEN-OH-S']['special'])
        self.assertIn('US-HOU-CA-12', races)
        self.assertEqual(races['US-HOU-CA-12']['district'], 12)

    def test_vacant_seat_still_has_a_race(self):
        # Races come from districts, so a seat with no sitting member still exists.
        self.assertIn('US-HOU-TX-38', self.build()['races'])

    def test_candidates_filtered_deduped_sorted(self):
        senate = self.build()['races']['US-SEN-OH-S']['candidates']
        names = [c['name'] for c in senate]
        self.assertEqual(names[0], 'Jon Husted')                   # incumbent first
        self.assertEqual(names[1], 'Sherrod Brown')                # then by receipts
        self.assertEqual(names.count('Christopher Volpe'), 1)      # duplicate FEC ids collapsed
        self.assertNotIn('Brian Christopher Bibler', names)        # status N, non-incumbent
        self.assertTrue(senate[0]['incumbent'])
        self.assertEqual(senate[0]['party'], 'republican')

    def test_same_name_different_party_ids_collapse_to_one(self):
        cn = CN_2026 + '\nH6OH04999|WILSON, TAMARA|IND|2026|OH|H|04|C|C|C20' \
                       '\nH6OH04998|WILSON, TAMARA|DEM|2026|OH|H|04|C|C|C21'
        fetch = lambda c: (cn, WEBALL_2026) if c == 2026 else None  # noqa: E731
        doc = el.build_cycle(
            2026, _reps(), _districts(), fetch=fetch, require_candidates=False,
            today=datetime.date(2026, 10, 25), check_counts=False,
        )
        wilsons = [c for c in doc['races']['US-HOU-OH-04']['candidates'] if c['name'] == 'Tamara Wilson']
        self.assertEqual(len(wilsons), 1)

    def test_wrong_cycle_and_territories_excluded(self):
        doc = self.build()
        all_ids = {c['fec_id'] for r in doc['races'].values() for c in r['candidates']}
        self.assertNotIn('H0AL01055', all_ids)   # 2024 candidate
        self.assertNotIn('H0PR00001', all_ids)   # territory
        self.assertEqual(doc['stats']['dropped'], 1)

    def test_data_through_ignores_future_dates(self):
        self.assertEqual(self.build()['data_through'], '2026-10-22')

    def test_presidential_cycle_gets_president_race_and_reads_prior_file(self):
        def fetch(cycle_file):
            return (CN_2026, WEBALL_2026) if cycle_file == 2026 else None
        doc = el.build_cycle(
            2028, [], _districts(), fetch=fetch, require_candidates=False,
            today=datetime.date(2026, 10, 25), check_counts=False,
        )
        pres = doc['races']['US-PRES']
        self.assertEqual([c['name'] for c in pres['candidates']], ['Thomas Winterbottom'])

    def test_missing_required_files_raise(self):
        with self.assertRaises(el.ElectionDataError):
            el.build_cycle(2026, _reps(), _districts(), fetch=lambda c: None, require_candidates=True)

    def test_implausible_candidate_count_fails_validation(self):
        with self.assertRaisesRegex(el.ElectionDataError, 'candidates parsed'):
            el.build_cycle(
                2026, _reps(), _districts(), fetch=_fetch, require_candidates=True, check_counts=False,
            )

    def test_implausible_race_counts_fail_validation(self):
        with self.assertRaisesRegex(el.ElectionDataError, 'regular Senate races'):
            el.build_cycle(2026, _reps(), _districts(), fetch=_fetch, require_candidates=False)

    def test_output_is_deterministic(self):
        self.assertEqual(
            json.dumps(self.build(), sort_keys=True), json.dumps(self.build(), sort_keys=True)
        )

    def test_ambiguous_senate_state_leaves_candidates_unassigned(self):
        reps = _reps() + [
            {'level': 'us_senate', 'state': 'OH', 'term_end': '2027-01-03', 'district_number': None}
        ]
        doc = el.build_cycle(
            2026, reps, _districts(), fetch=_fetch, require_candidates=False,
            today=datetime.date(2026, 10, 25), check_counts=False,
        )
        self.assertEqual(doc['races']['US-SEN-OH']['candidates'], [])
        self.assertEqual(doc['races']['US-SEN-OH-S']['candidates'], [])


class ExportCommandTests(TestCase):
    def test_requires_exported_representatives(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(CommandError):
                call_command('export_election_data', out=tmp, today='2026-10-25', stdout=StringIO())

    def test_writes_index_and_cycle_files(self):
        from unittest.mock import patch
        full = el.build_cycle(
            2026, _reps(), _districts(), fetch=_fetch, require_candidates=False,
            today=datetime.date(2026, 10, 25), check_counts=False,
        )
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'representatives.json').write_text('[]')
            with patch.object(el, 'build_cycle', return_value=full):
                call_command('export_election_data', out=tmp, today='2026-10-25', stdout=StringIO())
            index = json.loads(Path(tmp, 'elections', 'index.json').read_text())
            self.assertEqual(index['cycles'][0]['cycle'], 2026)
            self.assertEqual(index['cycles'][0]['path'], '/data/elections/2026.json')
            self.assertTrue(Path(tmp, 'elections', '2026.json').exists())


class SyncExternalIdsTests(SimpleTestCase):
    def test_fec_ids_are_kept_as_a_list(self):
        from representatives.management.commands.sync_legislators import _build_external_ids
        ids = _build_external_ids({'bioguide': 'A000055', 'fec': ['H2AL02087', 'H6AL04098']})
        self.assertEqual(ids['fec_ids'], ['H2AL02087', 'H6AL04098'])
        self.assertEqual(ids['bioguide_id'], 'A000055')

    def test_missing_fec_ids_are_omitted(self):
        from representatives.management.commands.sync_legislators import _build_external_ids
        self.assertNotIn('fec_ids', _build_external_ids({'bioguide': 'A000055'}))


class SittingIncumbentTests(SimpleTestCase):
    def test_incumbent_flag_follows_sitting_members_not_fec_ici(self):
        # FEC still flags TURNER as incumbent; only HUSTED is a sitting member.
        cn = ('S6OH00304|HUSTED, JON|REP|2026|OH|S|00|I|C|C1\n'
              'H0TX18001|TURNER, SYLVESTER|DEM|2026|TX|H|18|I|C|C2')
        rows = el.parse_candidate_master(cn)
        out = el.build_candidates(rows, {}, 2026, sitting_fec_ids={'S6OH00304'})
        flags = {c['fec_id']: c['incumbent'] for c in out}
        self.assertEqual(flags, {'S6OH00304': True, 'H0TX18001': False})

    def test_falls_back_to_fec_flag_without_member_ids(self):
        rows = el.parse_candidate_master('S6OH00304|HUSTED, JON|REP|2026|OH|S|00|I|C|C1')
        self.assertTrue(el.build_candidates(rows, {}, 2026, sitting_fec_ids=set())[0]['incumbent'])

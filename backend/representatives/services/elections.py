"""
Election calendar, "who is up", and FEC candidate data for the static election files.

Pure stdlib + deterministic: no Django, no DB. `export_election_data` is the thin
command around it. Everything here is cycle-agnostic — nothing is hard-coded to
2026; a new cycle appears in the output as soon as the calendar says it is active.

Candidate data comes from the FEC bulk candidate master (cn{YY}) and the
all-candidates financial summary (weball{YY}) files. Both are keyless and
unthrottled, unlike api.open.fec.gov (30 req/hr on DEMO_KEY). They list everyone
who *filed* — not who is on the ballot — so the UI labels the list "Filed with FEC".
"""

from __future__ import annotations

import csv
import datetime
import io
import re
import time
import urllib.error
import urllib.request
import zipfile
from typing import Callable, Iterable

FEC_BULK_URL = 'https://www.fec.gov/files/bulk-downloads/{year}/{kind}{yy}.zip'
FEC_MEMBER_NAME = {'cn': 'cn.txt', 'weball': 'weball{yy}.txt'}

# How long after election day a cycle stays "active" (results season, certification,
# recounts) before the calendar rolls forward. Congress is seated Jan 3, after which
# the weekly legislator sync moves term_end dates to the next cycle anyway.
CYCLE_GRACE_DAYS = 60

# Senate seats are in three classes of 33/33/34; specials are rare.
REGULAR_SENATE_RANGE = (32, 35)
MAX_SENATE_SPECIALS = 5
# 50 states + DC (delegate). Territories are not in the app's district data.
HOUSE_RACE_RANGE = (435, 437)

_HONORIFICS = {'MR', 'MRS', 'MS', 'MISS', 'DR', 'HON', 'REV', 'PROF', 'SEN', 'REP', 'GOV'}
_SUFFIXES = {'JR': 'Jr.', 'SR': 'Sr.', 'II': 'II', 'III': 'III', 'IV': 'IV', 'V': 'V'}

_PARTY_GROUPS = {
    'DEM': 'democrat', 'DFL': 'democrat',
    'REP': 'republican',
    'IND': 'independent', 'NPA': 'independent', 'NNE': 'independent', 'UNK': 'independent',
}
PARTY_LABELS = {
    'DEM': 'Democratic', 'DFL': 'Democratic-Farmer-Labor', 'REP': 'Republican',
    'IND': 'Independent', 'NPA': 'No Party Affiliation', 'NNE': 'None',
    'LIB': 'Libertarian', 'GRE': 'Green', 'CON': 'Constitution', 'UNK': 'Unknown',
    'IDP': 'Independence', 'WFP': 'Working Families', 'PSL': 'Socialism and Liberation',
    'LBU': 'Liberal', 'ACE': 'Ace Party',
}


class ElectionDataError(Exception):
    """Source data is missing or fails a sanity check; nothing should be written."""


# -- Calendar -----------------------------------------------------------------

def general_election_date(year: int) -> datetime.date:
    """Federal general election: the Tuesday after the first Monday in November."""
    nov1 = datetime.date(year, 11, 1)
    first_monday = nov1 + datetime.timedelta(days=(0 - nov1.weekday()) % 7)
    return first_monday + datetime.timedelta(days=1)


def is_presidential(year: int) -> bool:
    return year % 4 == 0


def active_cycles(today: datetime.date, grace_days: int = CYCLE_GRACE_DAYS) -> list[int]:
    """Election years to publish: the current cycle, plus the next presidential one.

    "Current" is the first even year whose general election (plus a results-season
    grace period) has not yet passed.
    """
    year = today.year + (today.year % 2)
    while general_election_date(year) + datetime.timedelta(days=grace_days) < today:
        year += 2
    cycles = [year]
    nxt = year
    while True:
        nxt += 2
        if is_presidential(nxt):
            break
    if nxt != year:
        cycles.append(nxt)
    return cycles


def cycle_label(year: int) -> str:
    return f'{year} Presidential Election' if is_presidential(year) else f'{year} General Election'


def seat_up_in_cycle(term_end: datetime.date | None, cycle: int) -> bool:
    """True if a term ending on `term_end` is contested at the `cycle` general election.

    Regular terms end Jan 3 after the election; a special-election seat ends at the
    election itself (term_end == election day), so the window opens Nov 1.
    """
    if term_end is None:
        return False
    return datetime.date(cycle, 11, 1) <= term_end <= datetime.date(cycle + 1, 1, 3)


def is_special_term_end(term_end: datetime.date, cycle: int) -> bool:
    return term_end.year == cycle


# -- FEC parsing ---------------------------------------------------------------

def clean_candidate_name(raw: str) -> str:
    """'KINCAID, RONALD E JR' -> 'Ronald E Kincaid Jr.'; drops 'MR', 'DR.' etc."""
    raw = (raw or '').strip()
    if ',' in raw:
        last, _, rest = raw.partition(',')
    else:
        last, rest = raw, ''
    tokens = [t for t in re.split(r'\s+', rest.strip()) if t]
    suffix = ''
    kept = []
    for tok in tokens:
        bare = tok.strip('.,').upper()
        if bare in _HONORIFICS:
            continue
        if bare in _SUFFIXES:
            suffix = _SUFFIXES[bare]
            continue
        kept.append(tok)
    last_tokens = []
    for tok in last.split():
        bare = tok.strip('.,').upper()
        if bare in _SUFFIXES:
            suffix = _SUFFIXES[bare]
        else:
            last_tokens.append(tok)
    parts = kept + last_tokens
    name = ' '.join(_titlecase(p) for p in parts if p)
    return f'{name} {suffix}'.strip()


def _titlecase(token: str) -> str:
    if len(token) <= 2 and token.endswith('.'):  # initial: "R."
        return token.upper()
    if token.isupper() and len(token) == 1:
        return token
    out = token.lower()
    out = re.sub(r"(^|[-'])([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    out = re.sub(r'^(Mc)([a-z])', lambda m: m.group(1) + m.group(2).upper(), out)
    return out


def normalize_party(code: str) -> tuple[str, str]:
    """-> (group used for colors, human label)."""
    code = (code or '').strip().upper()
    return _PARTY_GROUPS.get(code, 'other'), PARTY_LABELS.get(code, code or 'Unknown')


def _to_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_iso_date(value: str) -> str | None:
    try:
        return datetime.datetime.strptime(value.strip(), '%m/%d/%Y').date().isoformat()
    except (AttributeError, ValueError):
        return None


def _read_pipe_file(text: str) -> Iterable[list[str]]:
    return csv.reader(io.StringIO(text), delimiter='|', quoting=csv.QUOTE_NONE)


def parse_candidate_master(text: str) -> list[dict]:
    """cn{YY}.txt rows -> dicts. Columns per FEC's candidate master layout."""
    rows = []
    for r in _read_pipe_file(text):
        if len(r) < 9 or not r[0]:
            continue
        try:
            year = int(r[3])
        except ValueError:
            continue
        rows.append({
            'fec_id': r[0], 'name_raw': r[1], 'party_code': r[2], 'election_year': year,
            'state': r[4], 'office': r[5], 'district': r[6], 'ici': r[7], 'status': r[8],
        })
    return rows


def parse_financial_summary(text: str) -> dict[str, dict]:
    """weball{YY}.txt -> {fec_id: {receipts, cash, reports_through}}."""
    out = {}
    for r in _read_pipe_file(text):
        if len(r) < 28 or not r[0]:
            continue
        out[r[0]] = {
            'receipts': _to_float(r[5]),
            'cash': _to_float(r[10]),
            'reports_through': _to_iso_date(r[27]),
        }
    return out


# -- Download ------------------------------------------------------------------

def _download_zip_member(url: str, member: str, retries: int = 3) -> str | None:
    """Download a zip and return `member` decoded, or None on 404 (file not yet published)."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'RepMap-data-export/1.0'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = resp.read()
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                return zf.read(member).decode('latin-1')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last_err = e
        except (urllib.error.URLError, zipfile.BadZipFile, TimeoutError, KeyError) as e:
            last_err = e
        time.sleep(2 * (attempt + 1))
    raise ElectionDataError(f'Could not fetch {url}: {last_err}')


def fetch_fec_files(cycle_file: int) -> tuple[str, str] | None:
    """-> (candidate_master_text, financial_summary_text) for an FEC two-year file, or None."""
    yy = f'{cycle_file % 100:02d}'
    base = {'year': cycle_file, 'yy': yy}
    cn = _download_zip_member(FEC_BULK_URL.format(kind='cn', **base), FEC_MEMBER_NAME['cn'].format(yy=yy))
    if cn is None:
        return None
    wb = _download_zip_member(
        FEC_BULK_URL.format(kind='weball', **base), FEC_MEMBER_NAME['weball'].format(yy=yy)
    )
    return cn, (wb or '')


# -- Race construction ---------------------------------------------------------

def house_race_id(state: str, district: int) -> str:
    return f'US-HOU-{state}-{district:02d}'


def senate_race_id(state: str, special: bool) -> str:
    return f'US-SEN-{state}-S' if special else f'US-SEN-{state}'


PRESIDENT_RACE_ID = 'US-PRES'


def house_races_from_districts(districts_by_state: dict[str, list[int]]) -> dict[str, dict]:
    """districts_by_state: {'OH': [1..15], 'AK': [0], 'DC': [0]}. Built from the *district
    list*, not from reps, so a vacant seat still has a race."""
    races = {}
    for state, numbers in districts_by_state.items():
        for n in numbers:
            races[house_race_id(state, n)] = {
                'office': 'H', 'state': state, 'district': n, 'special': False, 'candidates': [],
            }
    return races


def senate_races_from_reps(reps: list[dict], cycle: int) -> dict[str, dict]:
    """A Senate race exists for every state with a senator whose term_end falls in the cycle."""
    races = {}
    for rep in reps:
        if rep.get('level') != 'us_senate' or not rep.get('term_end'):
            continue
        term_end = datetime.date.fromisoformat(rep['term_end'])
        if not seat_up_in_cycle(term_end, cycle):
            continue
        special = is_special_term_end(term_end, cycle)
        rid = senate_race_id(rep['state'], special)
        races[rid] = {
            'office': 'S', 'state': rep['state'], 'district': None,
            'special': special, 'candidates': [],
        }
    return races


def build_candidates(
    master_rows: list[dict],
    financials: dict[str, dict],
    cycle: int,
    sitting_fec_ids: set[str] | None = None,
) -> list[dict]:
    """Filter FEC master rows to statutory candidates (>$5k threshold) or incumbents for
    `cycle`, attach financials, and normalize. Does not assign races.

    "Incumbent" means a current member of Congress when we know the sitting members'
    FEC ids; FEC's own incumbent flag is only a fallback because it goes stale (it
    still marks members who have died or left office)."""
    out = []
    for row in master_rows:
        if row['election_year'] != cycle:
            continue
        if row['office'] not in ('H', 'S', 'P'):
            continue
        incumbent = (
            row['fec_id'] in sitting_fec_ids if sitting_fec_ids else row['ici'] == 'I'
        )
        if row['status'] != 'C' and not incumbent:
            continue
        fin = financials.get(row['fec_id'], {})
        group, label = normalize_party(row['party_code'])
        district = row['district']
        out.append({
            'fec_id': row['fec_id'],
            'name': clean_candidate_name(row['name_raw']),
            'party': group,
            'party_label': label,
            'incumbent': incumbent,
            'receipts': int(round(fin['receipts'])) if fin.get('receipts') is not None else None,
            'cash': int(round(fin['cash'])) if fin.get('cash') is not None else None,
            'reports_through': fin.get('reports_through'),
            '_office': row['office'],
            '_state': row['state'],
            '_district': int(district) if district.isdigit() else None,
        })
    return out


def assign_candidates(races: dict[str, dict], candidates: list[dict], cycle: int) -> dict:
    """Place candidates into races; returns stats. Candidates for races not in `races`
    (territories, seats not up this cycle) are dropped and counted."""
    dropped = 0
    ambiguous_states = {
        r['state'] for r in races.values() if r['office'] == 'S' and r['special']
    } & {r['state'] for r in races.values() if r['office'] == 'S' and not r['special']}

    if is_presidential(cycle) and PRESIDENT_RACE_ID not in races:
        races[PRESIDENT_RACE_ID] = {
            'office': 'P', 'state': 'US', 'district': None, 'special': False, 'candidates': [],
        }

    for c in candidates:
        office, state, district = c['_office'], c['_state'], c['_district']
        rid = None
        if office == 'H' and district is not None:
            rid = house_race_id(state, district)
        elif office == 'S':
            # Ambiguous when a state has both a regular and a special Senate race: FEC
            # bulk data does not say which; leave unassigned rather than guess.
            if state not in ambiguous_states:
                rid = senate_race_id(state, True) if senate_race_id(state, True) in races \
                    else senate_race_id(state, False)
        elif office == 'P':
            rid = PRESIDENT_RACE_ID
        if rid not in races:
            dropped += 1
            continue
        races[rid]['candidates'].append(c)
    return {'dropped': dropped, 'ambiguous_senate_states': sorted(ambiguous_states)}


def _finalize_candidates(race: dict) -> None:
    """Dedupe, sort, strip internals. FEC issues several IDs to one person (re-filed for
    another office/committee, sometimes under a different party label); within a single
    race the same name is the same person, so keep the strongest record per name."""
    best: dict[str, dict] = {}
    for c in race['candidates']:
        key = c['name'].upper()
        cur = best.get(key)
        rank = (c['incumbent'], c['receipts'] or 0, c['fec_id'])
        if cur is None or rank > (cur['incumbent'], cur['receipts'] or 0, cur['fec_id']):
            best[key] = c
    final = []
    for c in best.values():
        final.append({k: v for k, v in c.items() if not k.startswith('_')})
    final.sort(key=lambda c: (not c['incumbent'], -(c['receipts'] or 0), c['name'], c['fec_id']))
    race['candidates'] = final


def validate_cycle(
    cycle: int, races: dict[str, dict], require_candidates: bool, check_counts: bool = True,
) -> list[str]:
    errors = []
    house = [r for r in races.values() if r['office'] == 'H']
    sen_regular = [r for r in races.values() if r['office'] == 'S' and not r['special']]
    sen_special = [r for r in races.values() if r['office'] == 'S' and r['special']]

    if check_counts:
        lo, hi = HOUSE_RACE_RANGE
        if not (lo <= len(house) <= hi):
            errors.append(f'{cycle}: {len(house)} House races outside [{lo}, {hi}]')
        lo, hi = REGULAR_SENATE_RANGE
        if not (lo <= len(sen_regular) <= hi):
            errors.append(f'{cycle}: {len(sen_regular)} regular Senate races outside [{lo}, {hi}]')
        if len(sen_special) > MAX_SENATE_SPECIALS:
            errors.append(f'{cycle}: {len(sen_special)} special Senate races (max {MAX_SENATE_SPECIALS})')
    if is_presidential(cycle) and PRESIDENT_RACE_ID not in races:
        errors.append(f'{cycle}: presidential cycle missing {PRESIDENT_RACE_ID}')
    if require_candidates:
        total = sum(len(r['candidates']) for r in races.values())
        if total < 500:
            errors.append(f'{cycle}: only {total} candidates parsed — FEC file format may have changed')
        for r in races.values():
            if r['office'] == 'S' and not r['candidates']:
                errors.append(f'{cycle}: Senate race {r["state"]} has no candidates')
    return errors


FetchFn = Callable[[int], 'tuple[str, str] | None']


def build_cycle(
    cycle: int,
    reps: list[dict],
    districts_by_state: dict[str, list[int]],
    fetch: FetchFn = fetch_fec_files,
    require_candidates: bool = True,
    today: datetime.date | None = None,
    check_counts: bool = True,
) -> dict:
    """Build the full document for one election cycle."""
    races = house_races_from_districts(districts_by_state)
    races.update(senate_races_from_reps(reps, cycle))

    master: list[dict] = []
    financials: dict[str, dict] = {}
    # Presidential candidates file in the cycle *before* their election year, so a
    # presidential year also reads the previous two-year file.
    files = [cycle] + ([cycle - 2] if is_presidential(cycle) else [])
    found_any = False
    for file_cycle in files:
        got = fetch(file_cycle)
        if got is None:
            continue
        found_any = True
        master.extend(parse_candidate_master(got[0]))
        financials.update(parse_financial_summary(got[1]))
    if require_candidates and not found_any:
        raise ElectionDataError(f'FEC bulk files for cycle {cycle} are not available')

    # Later file wins when the same FEC id appears in both.
    by_id = {}
    for row in master:
        by_id[row['fec_id']] = row
    sitting = {
        fid for r in reps for fid in (r.get('external_ids') or {}).get('fec_ids', [])
    }
    candidates = build_candidates(list(by_id.values()), financials, cycle, sitting)
    stats = assign_candidates(races, candidates, cycle)
    for race in races.values():
        _finalize_candidates(race)

    errors = validate_cycle(cycle, races, require_candidates, check_counts)
    if errors:
        raise ElectionDataError('; '.join(errors))

    # FEC rows occasionally carry future coverage dates (typos); ignore them so the
    # "data through" label reflects reports that could actually exist.
    cutoff = (today or datetime.date.max).isoformat()
    through = [
        c['reports_through'] for r in races.values() for c in r['candidates']
        if c['reports_through'] and c['reports_through'] <= cutoff
    ]
    return {
        'cycle': cycle,
        'general_date': general_election_date(cycle).isoformat(),
        'presidential': is_presidential(cycle),
        'label': cycle_label(cycle),
        'source': {
            'name': 'FEC bulk candidate files',
            'caveat': (
                'Candidates who have filed with the FEC (statutory candidates and incumbents). '
                'This is not the official ballot: it can include candidates eliminated in '
                'primaries and omit write-in or non-federally-registered candidates.'
            ),
        },
        'data_through': max(through) if through else None,
        'stats': {
            'races': len(races),
            'candidates': sum(len(r['candidates']) for r in races.values()),
            'dropped': stats['dropped'],
        },
        'races': dict(sorted(races.items())),
    }

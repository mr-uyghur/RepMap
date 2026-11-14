import type { Representative } from '../../types'
import ElectionCountdown from './ElectionCountdown'
import './HowToVoteTab.css'

interface StateResource {
  name: string
  boardUrl: string
}

export const STATE_VOTING_RESOURCES: Record<string, StateResource> = {
  AL: { name: 'Alabama',         boardUrl: 'https://www.sos.alabama.gov/alabama-votes' },
  AK: { name: 'Alaska',          boardUrl: 'https://www.elections.alaska.gov' },
  AZ: { name: 'Arizona',         boardUrl: 'https://azsos.gov/elections' },
  AR: { name: 'Arkansas',        boardUrl: 'https://www.sos.arkansas.gov/elections' },
  CA: { name: 'California',      boardUrl: 'https://www.sos.ca.gov/elections' },
  CO: { name: 'Colorado',        boardUrl: 'https://www.coloradosos.gov/voter' },
  CT: { name: 'Connecticut',     boardUrl: 'https://portal.ct.gov/SOTS/Election-Services' },
  DE: { name: 'Delaware',        boardUrl: 'https://elections.delaware.gov' },
  FL: { name: 'Florida',         boardUrl: 'https://dos.myflorida.com/elections' },
  GA: { name: 'Georgia',         boardUrl: 'https://sos.ga.gov/georgia-elections-division' },
  HI: { name: 'Hawaii',          boardUrl: 'https://elections.hawaii.gov' },
  ID: { name: 'Idaho',           boardUrl: 'https://sos.idaho.gov/elections-division' },
  IL: { name: 'Illinois',        boardUrl: 'https://www.elections.il.gov' },
  IN: { name: 'Indiana',         boardUrl: 'https://www.in.gov/sos/elections' },
  IA: { name: 'Iowa',            boardUrl: 'https://sos.iowa.gov/elections' },
  KS: { name: 'Kansas',          boardUrl: 'https://sos.ks.gov/elections' },
  KY: { name: 'Kentucky',        boardUrl: 'https://elect.ky.gov' },
  LA: { name: 'Louisiana',       boardUrl: 'https://www.sos.la.gov/ElectionsAndVoting' },
  ME: { name: 'Maine',           boardUrl: 'https://www.maine.gov/sos/cec/elec' },
  MD: { name: 'Maryland',        boardUrl: 'https://elections.maryland.gov' },
  MA: { name: 'Massachusetts',   boardUrl: 'https://www.sec.state.ma.us/ele' },
  MI: { name: 'Michigan',        boardUrl: 'https://mvic.sos.state.mi.us' },
  MN: { name: 'Minnesota',       boardUrl: 'https://www.sos.state.mn.us/elections-voting' },
  MS: { name: 'Mississippi',     boardUrl: 'https://www.sos.ms.gov/elections-voting' },
  MO: { name: 'Missouri',        boardUrl: 'https://www.sos.mo.gov/elections' },
  MT: { name: 'Montana',         boardUrl: 'https://sosmt.gov/elections' },
  NE: { name: 'Nebraska',        boardUrl: 'https://sos.nebraska.gov/elections' },
  NV: { name: 'Nevada',          boardUrl: 'https://www.nvsos.gov/sos/elections' },
  NH: { name: 'New Hampshire',   boardUrl: 'https://www.sos.nh.gov/elections' },
  NJ: { name: 'New Jersey',      boardUrl: 'https://www.nj.gov/state/elections' },
  NM: { name: 'New Mexico',      boardUrl: 'https://www.sos.nm.gov/voting-elections' },
  NY: { name: 'New York',        boardUrl: 'https://www.elections.ny.gov' },
  NC: { name: 'North Carolina',  boardUrl: 'https://www.ncsbe.gov' },
  ND: { name: 'North Dakota',    boardUrl: 'https://vip.sos.nd.gov' },
  OH: { name: 'Ohio',            boardUrl: 'https://www.ohiosos.gov/elections' },
  OK: { name: 'Oklahoma',        boardUrl: 'https://www.ok.gov/elections' },
  OR: { name: 'Oregon',          boardUrl: 'https://sos.oregon.gov/voting' },
  PA: { name: 'Pennsylvania',    boardUrl: 'https://www.vote.pa.gov' },
  RI: { name: 'Rhode Island',    boardUrl: 'https://vote.sos.ri.gov' },
  SC: { name: 'South Carolina',  boardUrl: 'https://www.scvotes.gov' },
  SD: { name: 'South Dakota',    boardUrl: 'https://sdsos.gov/elections-voting' },
  TN: { name: 'Tennessee',       boardUrl: 'https://sos.tn.gov/elections' },
  TX: { name: 'Texas',           boardUrl: 'https://www.sos.state.tx.us/elections' },
  UT: { name: 'Utah',            boardUrl: 'https://elections.utah.gov' },
  VT: { name: 'Vermont',         boardUrl: 'https://sos.vermont.gov/elections' },
  VA: { name: 'Virginia',        boardUrl: 'https://www.elections.virginia.gov' },
  WA: { name: 'Washington',      boardUrl: 'https://www.sos.wa.gov/elections' },
  WV: { name: 'West Virginia',   boardUrl: 'https://sos.wv.gov/elections' },
  WI: { name: 'Wisconsin',       boardUrl: 'https://elections.wi.gov' },
  WY: { name: 'Wyoming',         boardUrl: 'https://sos.wyo.gov/elections' },
  DC: { name: 'Washington D.C.', boardUrl: 'https://www.vote4dc.com' },
}

export function stateElectionsOffice(state: string): StateResource | null {
  return STATE_VOTING_RESOURCES[state] ?? null
}

function CapitolSealIcon() {
  return (
    <svg className="htv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18" />
      <path d="M5 21V10l7-5 7 5v11" />
      <path d="M9 21v-6h6v6" />
    </svg>
  )
}

function CheckBallotIcon() {
  return (
    <svg className="htv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m9 11 2 2 4-4" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  )
}

function MapPinIcon() {
  return (
    <svg className="htv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

interface Props {
  rep: Representative
}

/** Legacy standalone tab; the member panel now uses BallotCard, which renders HowToVote. */
export default function HowToVoteTab({ rep }: Props) {
  return (
    <div className="htv-tab-content">
      <ElectionCountdown state={rep.state} />
      <HowToVote state={rep.state} />
    </div>
  )
}

interface HowToVoteProps {
  state: string
  /** Heading level inside the host view (default h3). */
  headingLevel?: 'h2' | 'h3' | 'h4'
  /** Formatted or ISO date of the registration deadline, if known and still ahead. */
  registrationDeadline?: string | null
}

/** "How to vote in <State>": official links for registration, deadlines and polling places.
 *  We hold no per-state deadline data we can vouch for, so the state office is the primary link. */
export function HowToVote({ state, headingLevel = 'h3', registrationDeadline }: HowToVoteProps) {
  const resource = STATE_VOTING_RESOURCES[state]
  const name = resource?.name ?? state
  const Heading = headingLevel
  return (
    <section className="htv" aria-label={`How to vote in ${name}`}>
      <div className="htv-head">
        <Heading className="htv-title">How to vote in {name}</Heading>
        <span className="htv-kicker">Voter Readiness</span>
      </div>
      {registrationDeadline && (
        <p className="htv-deadline">
          <span className="htv-deadline-dot" aria-hidden="true" />
          <span>Registration deadline: <strong>{registrationDeadline}</strong></span>
        </p>
      )}
      <ul className="htv-list">
        {resource && (
          <li>
            <a href={resource.boardUrl} target="_blank" rel="noopener noreferrer" className="htv-link htv-link--primary">
              <CapitolSealIcon />
              <span className="htv-link-body">
                <span className="htv-link-top">
                  <span className="htv-link-title">{name} elections office</span>
                  <span className="htv-badge">Official State</span>
                </span>
                <span className="htv-link-sub">Official sample ballot, registration deadlines &amp; polling places</span>
              </span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        )}
        <li>
          <a href="https://vote.gov" target="_blank" rel="noopener noreferrer" className="htv-link">
            <CheckBallotIcon />
            <span className="htv-link-body">
              <span className="htv-link-top">
                <span className="htv-link-title">vote.gov</span>
                <span className="htv-badge htv-badge--neutral">U.S. Gov</span>
              </span>
              <span className="htv-link-sub">Register to vote or verify state rules (federal portal)</span>
            </span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
        <li>
          <a href="https://www.vote.org" target="_blank" rel="noopener noreferrer" className="htv-link">
            <MapPinIcon />
            <span className="htv-link-body">
              <span className="htv-link-top">
                <span className="htv-link-title">Vote.org</span>
                <span className="htv-badge htv-badge--neutral">Nonprofit</span>
              </span>
              <span className="htv-link-sub">Check registration status and locate your polling place</span>
            </span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      </ul>
    </section>
  )
}

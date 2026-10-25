import type { Representative } from '../../types'
import ElectionCountdown from './ElectionCountdown'
import './HowToVoteTab.css'

interface StateResource {
  name: string
  boardUrl: string
}

export const STATE_VOTING_RESOURCES: Record<string, StateResource> = {
  AL: { name: 'Alabama',        boardUrl: 'https://www.sos.alabama.gov/alabama-votes' },
  AK: { name: 'Alaska',         boardUrl: 'https://www.elections.alaska.gov' },
  AZ: { name: 'Arizona',        boardUrl: 'https://azsos.gov/elections' },
  AR: { name: 'Arkansas',       boardUrl: 'https://www.sos.arkansas.gov/elections' },
  CA: { name: 'California',     boardUrl: 'https://www.sos.ca.gov/elections' },
  CO: { name: 'Colorado',       boardUrl: 'https://www.coloradosos.gov/voter' },
  CT: { name: 'Connecticut',    boardUrl: 'https://portal.ct.gov/SOTS/Election-Services' },
  DE: { name: 'Delaware',       boardUrl: 'https://elections.delaware.gov' },
  FL: { name: 'Florida',        boardUrl: 'https://dos.myflorida.com/elections' },
  GA: { name: 'Georgia',        boardUrl: 'https://sos.ga.gov/georgia-elections-division' },
  HI: { name: 'Hawaii',         boardUrl: 'https://elections.hawaii.gov' },
  ID: { name: 'Idaho',          boardUrl: 'https://sos.idaho.gov/elections-division' },
  IL: { name: 'Illinois',       boardUrl: 'https://www.elections.il.gov' },
  IN: { name: 'Indiana',        boardUrl: 'https://www.in.gov/sos/elections' },
  IA: { name: 'Iowa',           boardUrl: 'https://sos.iowa.gov/elections' },
  KS: { name: 'Kansas',         boardUrl: 'https://sos.ks.gov/elections' },
  KY: { name: 'Kentucky',       boardUrl: 'https://elect.ky.gov' },
  LA: { name: 'Louisiana',      boardUrl: 'https://www.sos.la.gov/ElectionsAndVoting' },
  ME: { name: 'Maine',          boardUrl: 'https://www.maine.gov/sos/cec/elec' },
  MD: { name: 'Maryland',       boardUrl: 'https://elections.maryland.gov' },
  MA: { name: 'Massachusetts',  boardUrl: 'https://www.sec.state.ma.us/ele' },
  MI: { name: 'Michigan',       boardUrl: 'https://mvic.sos.state.mi.us' },
  MN: { name: 'Minnesota',      boardUrl: 'https://www.sos.state.mn.us/elections-voting' },
  MS: { name: 'Mississippi',    boardUrl: 'https://www.sos.ms.gov/elections-voting' },
  MO: { name: 'Missouri',       boardUrl: 'https://www.sos.mo.gov/elections' },
  MT: { name: 'Montana',        boardUrl: 'https://sosmt.gov/elections' },
  NE: { name: 'Nebraska',       boardUrl: 'https://sos.nebraska.gov/elections' },
  NV: { name: 'Nevada',         boardUrl: 'https://www.nvsos.gov/sos/elections' },
  NH: { name: 'New Hampshire',  boardUrl: 'https://www.sos.nh.gov/elections' },
  NJ: { name: 'New Jersey',     boardUrl: 'https://www.nj.gov/state/elections' },
  NM: { name: 'New Mexico',     boardUrl: 'https://www.sos.nm.gov/voting-elections' },
  NY: { name: 'New York',       boardUrl: 'https://www.elections.ny.gov' },
  NC: { name: 'North Carolina', boardUrl: 'https://www.ncsbe.gov' },
  ND: { name: 'North Dakota',   boardUrl: 'https://vip.sos.nd.gov' },
  OH: { name: 'Ohio',           boardUrl: 'https://www.ohiosos.gov/elections' },
  OK: { name: 'Oklahoma',       boardUrl: 'https://www.ok.gov/elections' },
  OR: { name: 'Oregon',         boardUrl: 'https://sos.oregon.gov/voting' },
  PA: { name: 'Pennsylvania',   boardUrl: 'https://www.vote.pa.gov' },
  RI: { name: 'Rhode Island',   boardUrl: 'https://vote.sos.ri.gov' },
  SC: { name: 'South Carolina', boardUrl: 'https://www.scvotes.gov' },
  SD: { name: 'South Dakota',   boardUrl: 'https://sdsos.gov/elections-voting' },
  TN: { name: 'Tennessee',      boardUrl: 'https://sos.tn.gov/elections' },
  TX: { name: 'Texas',          boardUrl: 'https://www.sos.state.tx.us/elections' },
  UT: { name: 'Utah',           boardUrl: 'https://elections.utah.gov' },
  VT: { name: 'Vermont',        boardUrl: 'https://sos.vermont.gov/elections' },
  VA: { name: 'Virginia',       boardUrl: 'https://www.elections.virginia.gov' },
  WA: { name: 'Washington',     boardUrl: 'https://www.sos.wa.gov/elections' },
  WV: { name: 'West Virginia',  boardUrl: 'https://sos.wv.gov/elections' },
  WI: { name: 'Wisconsin',      boardUrl: 'https://elections.wi.gov' },
  WY: { name: 'Wyoming',        boardUrl: 'https://sos.wyo.gov/elections' },
  DC: { name: 'Washington D.C.', boardUrl: 'https://www.vote4dc.com' },
}

export function stateElectionsOffice(state: string): StateResource | null {
  return STATE_VOTING_RESOURCES[state] ?? null
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
  /** ISO date of the registration deadline, if known and still ahead. */
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
      <Heading className="htv-title">How to vote in {name}</Heading>
      {registrationDeadline && (
        <p className="htv-deadline">Registration deadline: <strong>{registrationDeadline}</strong></p>
      )}
      <ul className="htv-list">
        {resource && (
          <li>
            <a href={resource.boardUrl} target="_blank" rel="noopener noreferrer" className="htv-link">
              <span className="htv-link-title">{name} elections office</span>
              <span className="htv-link-sub">Official sample ballot, registration deadlines, polling places</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        )}
        <li>
          <a href="https://vote.gov" target="_blank" rel="noopener noreferrer" className="htv-link">
            <span className="htv-link-title">vote.gov</span>
            <span className="htv-link-sub">Register or check how to register (U.S. government)</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
        <li>
          <a href="https://www.vote.org" target="_blank" rel="noopener noreferrer" className="htv-link">
            <span className="htv-link-title">Vote.org</span>
            <span className="htv-link-sub">Check your registration and find your polling place (nonprofit)</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      </ul>
    </section>
  )
}

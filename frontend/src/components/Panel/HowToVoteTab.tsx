import type { Representative } from '../../types'

interface StateResource {
  name: string
  boardUrl: string
}

const STATE_VOTING_RESOURCES: Record<string, StateResource> = {
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

interface Props {
  rep: Representative
}

export default function HowToVoteTab({ rep }: Props) {
  const resource = STATE_VOTING_RESOURCES[rep.state]
  const stateName = resource?.name ?? rep.state

  return (
    <div className="htv-tab-content">
      <h3 className="htv-tab-title">How to Vote in {stateName}</h3>
      <p className="htv-resources-desc">Official resources for {stateName} voters:</p>
      <div className="htv-links">
        {resource && (
          <a
            href={resource.boardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bio-tab-btn"
          >
            {stateName} Elections Website
          </a>
        )}
        <a
          href="https://vote.gov"
          target="_blank"
          rel="noopener noreferrer"
          className="bio-tab-btn"
        >
          vote.gov — Official U.S. Voter Info
        </a>
        <a
          href="https://www.vote.org"
          target="_blank"
          rel="noopener noreferrer"
          className="bio-tab-btn"
        >
          Vote.org — Registration &amp; Ballot Info
        </a>
      </div>
    </div>
  )
}

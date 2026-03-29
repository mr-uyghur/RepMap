import type { Representative } from '../../types'

interface Props {
  rep: Representative
}

export default function HowToVoteTab({ rep }: Props) {
  return (
    <div className="htv-tab-content">
      <h3 className="htv-tab-title">
        How to Vote in {rep.state}
      </h3>

      <div className="tab-coming-soon">
        🗳 State-level voting information coming soon
      </div>
    </div>
  )
}

import type { Representative } from '../../types'
import AISummaryTab from './AISummaryTab'

interface Props {
  rep: Representative
}

export default function HowToVoteTab({ rep }: Props) {
  return (
    <div className="htv-tab-content">
      <h3 className="htv-tab-title">How to Vote in {rep.state}</h3>
      <AISummaryTab repId={rep.id} type="how_to_vote" />
    </div>
  )
}

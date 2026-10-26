// Stub: Agent B replaces this. Keep the props signature (MEMBERS_FIRST_CONTRACT.md).
import type { Representative } from '../../types'

interface Props {
  rep: Representative
  variant?: 'card' | 'row'
  /** Short status line, e.g. "Up for re-election Nov 3" or "Term ends 2031". */
  status?: string
  onSelect: (rep: Representative) => void
}

export default function MemberCard({ rep }: Props) {
  return <div>{rep.name}</div>
}

// Phase 0 stub: Agent B replaces this. Keep the props signature (REDESIGN_CONTRACT.md).
interface Props {
  onSelectState: (code: string) => void
  currentState?: string
}

export default function StateList(_props: Props) {
  return <nav aria-label="States A to Z" />
}

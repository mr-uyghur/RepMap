import { useMapStore } from '../../store/mapStore'
import type { ViewLevel } from '../../types'
import './LevelToggle.css'

const OPTIONS: { value: ViewLevel; label: string }[] = [
  { value: 'federal', label: 'Federal' },
  // { value: 'state', label: 'State' },
]

export default function LevelToggle() {
  const viewLevel = useMapStore((s) => s.viewLevel)
  const setViewLevel = useMapStore((s) => s.setViewLevel)

  return (
    <div
      className="level-toggle"
      role="group"
      aria-label="Representative level"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`level-toggle-btn${viewLevel === value ? ' level-toggle-btn--active' : ''}`}
          aria-pressed={viewLevel === value}
          onClick={() => setViewLevel(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

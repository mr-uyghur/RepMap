import type { CSSProperties } from 'react'
import { useMapStore } from '../../store/mapStore'
import { stateName } from '../../utils/elections'
import './RedistrictingSlider.css'

const PRESETS = [
  { value: 0, label: '2013–2023', sub: 'CD116' },
  { value: 50, label: '50 / 50', sub: 'Overlay' },
  { value: 100, label: '2023–Now', sub: 'CD119' },
] as const

export default function RedistrictingSlider() {
  const sliderValue = useMapStore((s) => s.redistrictingSliderValue)
  const setSliderValue = useMapStore((s) => s.setRedistrictingSliderValue)
  const selectedStateCode = useMapStore((s) => s.selectedStateCode)

  const isStateActive = Boolean(selectedStateCode)
  const activeStateLabel = selectedStateCode ? stateName(selectedStateCode) : null
  const historicalPct = 100 - sliderValue

  const blendReadout = !isStateActive
    ? 'Awaiting state'
    : sliderValue === 0
      ? '100% 116th Congress'
      : sliderValue === 100
        ? '100% 119th Congress'
        : `${historicalPct}% CD116 · ${sliderValue}% CD119`

  return (
    <div
      className={`redistricting-slider${isStateActive ? '' : ' redistricting-slider--inactive'}`}
      role="group"
      aria-label="Redistricting comparison slider"
    >
      <div className="redistricting-slider-header">
        {isStateActive ? (
          <span className="redistricting-slider-badge redistricting-slider-badge--active">
            <span className="redistricting-slider-dot" aria-hidden="true" />
            {activeStateLabel} · Redistricting Atlas
          </span>
        ) : (
          <span className="redistricting-slider-badge redistricting-slider-badge--prompt">
            Select a state to compare 2013 vs. 2023 district lines
          </span>
        )}
        <span className="redistricting-slider-readout" aria-live="polite">
          {blendReadout}
        </span>
      </div>

      <div className="redistricting-slider-presets" role="group" aria-label="Boundary era presets">
        {PRESETS.map((preset) => {
          const active = isStateActive && sliderValue === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              className={`redistricting-preset-btn${active ? ' redistricting-preset-btn--active' : ''}`}
              disabled={!isStateActive}
              aria-pressed={active}
              onClick={() => setSliderValue(preset.value)}
            >
              <span className="redistricting-preset-main">{preset.label}</span>
              <span className="redistricting-preset-sub">{preset.sub}</span>
            </button>
          )
        })}
      </div>

      <div className="redistricting-slider-track-wrap">
        <div className="redistricting-slider-labels" aria-hidden="true">
          <span className="redistricting-slider-label redistricting-slider-label--historical">
            <span className="redistricting-swatch redistricting-swatch--historical" />
            2013–2023 (CD116)
          </span>
          <span className="redistricting-slider-label redistricting-slider-label--current">
            <span className="redistricting-swatch redistricting-swatch--current" />
            2023–Present (CD119)
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={sliderValue}
          disabled={!isStateActive}
          onChange={(e) => setSliderValue(Number(e.target.value))}
          className="redistricting-slider-input"
          style={{ '--slider-pct': `${sliderValue}%` } as CSSProperties}
          aria-label="Slide to compare historical and current district boundaries"
          aria-valuetext={
            !isStateActive
              ? 'Select a state on the map to compare historical and current boundaries'
              : sliderValue === 0
                ? 'Historical boundaries (CD116, 2013 to 2023) only'
                : sliderValue === 100
                  ? 'Current boundaries (CD119, 2023 to present) only'
                  : `${sliderValue}% current (CD119), ${historicalPct}% historical (CD116)`
          }
        />
      </div>
    </div>
  )
}

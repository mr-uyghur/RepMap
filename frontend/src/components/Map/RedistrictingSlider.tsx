import type { CSSProperties } from 'react'
import { useMapStore } from '../../store/mapStore'
import './RedistrictingSlider.css'

export default function RedistrictingSlider() {
  const sliderValue = useMapStore((s) => s.redistrictingSliderValue)
  const setSliderValue = useMapStore((s) => s.setRedistrictingSliderValue)
  const selectedStateCode = useMapStore((s) => s.selectedStateCode)
  const zoom = useMapStore((s) => s.zoom)

  const isStateActive = Boolean(selectedStateCode && zoom >= 5)

  return (
    <div
      className={`redistricting-slider${isStateActive ? '' : ' redistricting-slider--inactive'}`}
      role="group"
      aria-label="Redistricting comparison slider"
    >
      <div className="redistricting-slider-status">
        {isStateActive ? (
          <span className="redistricting-slider-badge redistricting-slider-badge--active">
            Comparing {selectedStateCode}: CD116 vs. CD119
          </span>
        ) : (
          <span className="redistricting-slider-badge redistricting-slider-badge--prompt">
            Click any state on the map to compare 2013 vs. 2023 district boundaries
          </span>
        )}
      </div>
      <div className="redistricting-slider-labels">
        <span className="redistricting-slider-label redistricting-slider-label--historical">
          2013–2023 (CD116)
        </span>
        <span className="redistricting-slider-label redistricting-slider-label--current">
          2023–present (CD119)
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
            ? 'Historical boundaries (CD116) only'
            : sliderValue === 100
            ? 'Current boundaries (CD119) only'
            : `${sliderValue}% current, ${100 - sliderValue}% historical`
        }
      />
    </div>
  )
}

import { useMapStore } from '../../store/mapStore'
import './RedistrictingSlider.css'

export default function RedistrictingSlider() {
  const sliderValue = useMapStore((s) => s.redistrictingSliderValue)
  const setSliderValue = useMapStore((s) => s.setRedistrictingSliderValue)

  return (
    <div className="redistricting-slider" role="group" aria-label="Redistricting comparison slider">
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
        onChange={(e) => setSliderValue(Number(e.target.value))}
        className="redistricting-slider-input"
        aria-label="Slide to compare historical and current district boundaries"
        aria-valuetext={
          sliderValue === 0
            ? 'Historical boundaries (CD116) only'
            : sliderValue === 100
            ? 'Current boundaries (CD119) only'
            : `${sliderValue}% current, ${100 - sliderValue}% historical`
        }
      />
    </div>
  )
}

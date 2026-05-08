/**
 * FiltersPanel — Cinematic post-processing controls.
 *
 * Color grading, bloom, vignette, film grain, chromatic aberration.
 * Subtlety is key — all defaults are intentionally gentle.
 */
import { useEngineStore } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'

interface FiltersPanelProps {
  engine: EngineAPI
}

export function FiltersPanel({ engine }: FiltersPanelProps) {
  const bloom = useEngineStore((s) => s.bloom)
  const cinematic = useEngineStore((s) => s.cinematic)
  const rangeHistoryProps = {
    onPointerDown: () => engine.beginHistoryBatch(),
    onPointerUp: () => engine.endHistoryBatch(),
    onPointerCancel: () => engine.endHistoryBatch(),
    onBlur: () => engine.endHistoryBatch(),
  }

  return (
    <div className="panel" id="filters-panel">
      <h3 className="panel-title">Filters</h3>

      {/* ── Color Grading ── */}
      <label className="slider-label">
        <span>Color Temperature</span>
        <span className="slider-value">
          {cinematic.colorTemperature === 0
            ? 'Neutral'
            : cinematic.colorTemperature > 0
              ? `Warm ${cinematic.colorTemperature.toFixed(2)}`
              : `Cool ${Math.abs(cinematic.colorTemperature).toFixed(2)}`}
        </span>
      </label>
      <input
        type="range"
        min="-1"
        max="1"
        step="0.05"
        value={cinematic.colorTemperature}
        onChange={(e) => engine.setColorTemperature(parseFloat(e.target.value))}
        className="slider"
        id="filter-color-temp"
        {...rangeHistoryProps}
      />

      {/* ── Bloom ── */}
      <label className="slider-label">
        <span>Bloom</span>
        <span className="slider-value">{bloom.strength.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={bloom.strength}
        onChange={(e) =>
          engine.setBloom(parseFloat(e.target.value), bloom.radius, bloom.threshold)
        }
        className="slider"
        id="filter-bloom-strength"
        {...rangeHistoryProps}
      />

      <label className="slider-label">
        <span>Bloom Radius</span>
        <span className="slider-value">{bloom.radius.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={bloom.radius}
        onChange={(e) =>
          engine.setBloom(bloom.strength, parseFloat(e.target.value), bloom.threshold)
        }
        className="slider"
        id="filter-bloom-radius"
        {...rangeHistoryProps}
      />

      {/* ── Vignette ── */}
      <div className="filter-header-row">
        <label className="slider-label">
          <span>Vignette</span>
          <span className="slider-value">{cinematic.vignette.toFixed(2)}</span>
        </label>
        <input 
          type="checkbox" 
          checked={cinematic.vignetteEnabled}
          onChange={(e) => engine.setVignetteEnabled(e.target.checked)}
          className="filter-checkbox"
        />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        value={cinematic.vignette}
        onChange={(e) => engine.setVignette(parseFloat(e.target.value))}
        className="slider"
        id="filter-vignette"
        disabled={!cinematic.vignetteEnabled}
        {...rangeHistoryProps}
      />

      {/* ── Film Grain ── */}
      <label className="slider-label">
        <span>Film Grain</span>
        <span className="slider-value">{cinematic.filmGrain.toFixed(3)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="0.15"
        step="0.005"
        value={cinematic.filmGrain}
        onChange={(e) => engine.setFilmGrain(parseFloat(e.target.value))}
        className="slider"
        id="filter-grain"
        {...rangeHistoryProps}
      />

      {/* ── Chromatic Aberration ── */}
      <label className="slider-label">
        <span>Chromatic Aberration</span>
        <span className="slider-value">{cinematic.chromaticAberration.toFixed(4)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="0.02"
        step="0.001"
        value={cinematic.chromaticAberration}
        onChange={(e) => engine.setChromaticAberration(parseFloat(e.target.value))}
        className="slider"
        id="filter-chromatic"
        {...rangeHistoryProps}
      />

      {/* ── Reset ── */}
      <button
        className="filter-reset-btn"
        onClick={() => engine.resetFilters()}
        id="filter-reset"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 1 1 9 9" />
          <polyline points="3 3 3 12 12 12" />
        </svg>
        Reset Defaults
      </button>
    </div>
  )
}

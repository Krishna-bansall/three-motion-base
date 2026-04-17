/**
 * LightingPanel — HDRI selector, exposure, bloom controls, auto-rotate.
 */
import { useMemo } from 'react'
import { useEngineStore } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'
import type { HDRIPreset } from '../../engine/runtime/types'

interface LightingPanelProps {
  engine: EngineAPI
}

function setParallaxVars(element: HTMLButtonElement, clientX: number, clientY: number): void {
  const rect = element.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width - 0.5) * 2
  const y = ((clientY - rect.top) / rect.height - 0.5) * 2
  element.style.setProperty('--tilt-x', `${(-y * 8).toFixed(2)}deg`)
  element.style.setProperty('--tilt-y', `${(x * 10).toFixed(2)}deg`)
  element.style.setProperty('--shift-x', `${(x * 11).toFixed(2)}px`)
  element.style.setProperty('--shift-y', `${(y * 7).toFixed(2)}px`)
}

function resetParallaxVars(element: HTMLButtonElement): void {
  element.style.setProperty('--tilt-x', '0deg')
  element.style.setProperty('--tilt-y', '0deg')
  element.style.setProperty('--shift-x', '0px')
  element.style.setProperty('--shift-y', '0px')
}

export function LightingPanel({ engine }: LightingPanelProps) {
  const activeHDRI = useEngineStore((s) => s.activeHDRI)
  const exposure = useEngineStore((s) => s.exposure)
  const autoRotate = useEngineStore((s) => s.autoRotate)
  const autoRotateSpeed = useEngineStore((s) => s.autoRotateSpeed)
  const hdriOptions = useMemo(
    () => engine.getEnvironmentPreviews().map((preview) => ({
      key: preview.preset as HDRIPreset,
      label: preview.label,
      mood: preview.mood,
      icon: preview.icon,
      imageUrl: preview.imageUrl,
    })),
    [engine],
  )
  const rangeHistoryProps = {
    onPointerDown: () => engine.beginHistoryBatch(),
    onPointerUp: () => engine.endHistoryBatch(),
    onPointerCancel: () => engine.endHistoryBatch(),
    onBlur: () => engine.endHistoryBatch(),
  }

  return (
    <div className="panel" id="lighting-panel">
      <h3 className="panel-title">Lighting</h3>

      {/* HDRI Selector */}
      <label className="slider-label"><span>Environment</span></label>
      <div className="hdri-selector">
        {hdriOptions.map(({ key, label, mood, icon, imageUrl }) => (
          <button
            key={key}
            className={`hdri-card hdri-card-${key} ${activeHDRI === key ? 'active' : ''}`}
            onClick={() => { void engine.setHDRI(key) }}
            onMouseMove={(e) => setParallaxVars(e.currentTarget, e.clientX, e.clientY)}
            onMouseLeave={(e) => resetParallaxVars(e.currentTarget)}
            onBlur={(e) => resetParallaxVars(e.currentTarget)}
          >
            <img src={imageUrl} className="hdri-card-canvas" alt="" aria-hidden />
            <span className="hdri-card-fade" aria-hidden />
            <span className="material-symbols-rounded hdri-card-icon" aria-hidden>{icon}</span>
            <span className="hdri-card-label">{label}</span>
            <span className="hdri-card-mood">{mood}</span>
          </button>
        ))}
      </div>

      {/* Exposure */}
      <label className="slider-label">
        <span>Exposure</span>
        <span className="slider-value">{exposure.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0.1"
        max="3"
        step="0.05"
        value={exposure}
        onChange={(e) => engine.setExposure(parseFloat(e.target.value))}
        className="slider"
        {...rangeHistoryProps}
      />

      {/* Auto-Rotate */}
      <div className="toggle-row">
        <label className="slider-label"><span>Auto Rotate</span></label>
        <button
          className={`toggle-btn ${autoRotate ? 'active' : ''}`}
          onClick={() => engine.setAutoRotate(!autoRotate)}
        >
          {autoRotate ? 'ON' : 'OFF'}
        </button>
      </div>

      {autoRotate && (
        <>
          <label className="slider-label">
            <span>Rotate Speed</span>
            <span className="slider-value">{autoRotateSpeed.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value={autoRotateSpeed}
            onChange={(e) => engine.setAutoRotateSpeed(parseFloat(e.target.value))}
            className="slider"
            {...rangeHistoryProps}
          />
        </>
      )}
    </div>
  )
}

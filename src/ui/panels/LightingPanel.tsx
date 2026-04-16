/**
 * LightingPanel — HDRI selector, exposure, bloom controls, auto-rotate.
 */
import { useEngineStore } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'
import type { HDRIPreset } from '../../engine/renderer/ThreeRenderer'

interface LightingPanelProps {
  engine: EngineAPI
}

const HDRI_OPTIONS: { key: HDRIPreset; label: string; emoji: string }[] = [
  { key: 'studio', label: 'Studio', emoji: '💡' },
  { key: 'moody', label: 'Moody', emoji: '🌙' },
  { key: 'daylight', label: 'Daylight', emoji: '☀️' },
]

export function LightingPanel({ engine }: LightingPanelProps) {
  const activeHDRI = useEngineStore((s) => s.activeHDRI)
  const exposure = useEngineStore((s) => s.exposure)
  const autoRotate = useEngineStore((s) => s.autoRotate)
  const autoRotateSpeed = useEngineStore((s) => s.autoRotateSpeed)

  return (
    <div className="panel" id="lighting-panel">
      <h3 className="panel-title">Lighting</h3>

      {/* HDRI Selector */}
      <label className="slider-label"><span>Environment</span></label>
      <div className="hdri-selector">
        {HDRI_OPTIONS.map(({ key, label, emoji }) => (
          <button
            key={key}
            className={`hdri-btn ${activeHDRI === key ? 'active' : ''}`}
            onClick={() => engine.setHDRI(key)}
          >
            <span className="hdri-emoji">{emoji}</span>
            <span>{label}</span>
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
          />
        </>
      )}
    </div>
  )
}

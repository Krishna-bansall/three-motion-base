/**
 * MaterialPanel — Sliders and color picker for PBR material properties.
 */
import { useEngineStore, type EntityInfo } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'

interface MaterialPanelProps {
  engine: EngineAPI
}

export function MaterialPanel({ engine }: MaterialPanelProps) {
  const entities = useEngineStore((s) => s.entities)

  if (entities.length === 0) {
    return (
      <div className="panel" id="material-panel">
        <h3 className="panel-title">Material</h3>
        <p className="panel-empty">No model loaded</p>
      </div>
    )
  }

  return (
    <div className="panel" id="material-panel">
      <h3 className="panel-title">Material</h3>
      <div className="panel-scroll">
        {entities.map((entity) => (
          <MaterialEntity key={entity.eid} entity={entity} engine={engine} />
        ))}
      </div>
    </div>
  )
}

function MaterialEntity({ entity, engine }: { entity: EntityInfo; engine: EngineAPI }) {
  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (v: number) =>
      Math.round(Math.max(0, Math.min(1, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return { r, g, b }
  }

  return (
    <div className="material-entity">
      <span className="entity-name">{entity.name}</span>

      <label className="slider-label">
        <span>Roughness</span>
        <span className="slider-value">{entity.roughness.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={entity.roughness}
        onChange={(e) =>
          engine.setMaterial(entity.eid, { roughness: parseFloat(e.target.value) })
        }
        className="slider"
      />

      <label className="slider-label">
        <span>Metalness</span>
        <span className="slider-value">{entity.metalness.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={entity.metalness}
        onChange={(e) =>
          engine.setMaterial(entity.eid, { metalness: parseFloat(e.target.value) })
        }
        className="slider"
      />

      <label className="slider-label">
        <span>Env Intensity</span>
        <span className="slider-value">{entity.envMapIntensity.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0"
        max="3"
        step="0.05"
        value={entity.envMapIntensity}
        onChange={(e) =>
          engine.setMaterial(entity.eid, { envMapIntensity: parseFloat(e.target.value) })
        }
        className="slider"
      />

      <label className="slider-label">
        <span>Color</span>
      </label>
      <input
        type="color"
        value={rgbToHex(entity.r, entity.g, entity.b)}
        onChange={(e) => {
          const { r, g, b } = hexToRgb(e.target.value)
          engine.setMaterial(entity.eid, { r, g, b })
        }}
        className="color-picker"
      />
    </div>
  )
}

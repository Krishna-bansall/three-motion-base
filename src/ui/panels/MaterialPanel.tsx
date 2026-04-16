/**
 * MaterialPanel — Sliders and color picker for PBR material properties.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { useEngineStore, type EntityInfo } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'

interface MaterialPanelProps {
  engine: EngineAPI
}

export function MaterialPanel({ engine }: MaterialPanelProps) {
  const entities = useEngineStore((s) => s.entities)
  const [selectedEid, setSelectedEid] = useState<number | null>(null)

  useEffect(() => {
    if (entities.length === 0) {
      if (selectedEid !== null) {
        setSelectedEid(null)
      }
      return
    }

    if (selectedEid === null || !entities.some((entity) => entity.eid === selectedEid)) {
      setSelectedEid(entities[0].eid)
    }
  }, [entities, selectedEid])

  if (entities.length === 0) {
    return (
      <div className="panel" id="material-panel">
        <h3 className="panel-title">Material</h3>
        <p className="panel-empty">No model loaded</p>
      </div>
    )
  }

  const selectedEntity = entities.find((entity) => entity.eid === selectedEid) ?? entities[0]

  return (
    <div className="panel" id="material-panel">
      <h3 className="panel-title">Material</h3>
      <label className="slider-label"><span>Elements</span></label>
      <div className="element-selector">
        {entities.map((entity, index) => {
          const elementStyle = {
            '--element-accent': rgbToCss(entity.r, entity.g, entity.b),
          } as CSSProperties

          return (
            <button
              key={entity.eid}
              className={`element-card ${selectedEntity.eid === entity.eid ? 'active' : ''}`}
              onClick={() => setSelectedEid(entity.eid)}
              style={elementStyle}
            >
              <span className="element-card-bg" aria-hidden />
              <span className="element-card-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.3 7 12 12 20.7 7" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                </svg>
              </span>
              <span className="element-card-name">{entity.name}</span>
              <span className="element-card-meta">Part {index + 1}</span>
            </button>
          )
        })}
      </div>

      <div className="material-editor">
        <span className="entity-name">{selectedEntity.name}</span>
        <MaterialEntity entity={selectedEntity} engine={engine} />
      </div>
    </div>
  )
}

function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
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

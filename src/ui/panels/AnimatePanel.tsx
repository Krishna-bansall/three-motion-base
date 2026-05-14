import type { ChangeEvent } from 'react'
import type { EngineAPI } from '../../engine/EngineAPI'
import type { MotionLayerParameters } from '../../engine/project/types'
import { useEngineStore } from '../../store/useEngineStore'

interface AnimatePanelProps {
  engine: EngineAPI
  selectedTargetNodeId: string | null
  selectedLayerId: string | null
  onSelectTarget: (nodeId: string) => void
  onSelectLayer: (layerId: string | null) => void
}

export function AnimatePanel({
  engine,
  selectedTargetNodeId,
  selectedLayerId,
  onSelectTarget,
  onSelectLayer,
}: AnimatePanelProps) {
  const activeShot = useEngineStore((s) => s.activeShot)
  const rows = useEngineStore((s) => s.timelineRows)
  const selectedRow = rows.find((row) => row.targetNodeId === selectedTargetNodeId) ?? rows[0] ?? null
  const selectedLayer = selectedRow?.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const presets = selectedRow ? engine.getMotionPresets(selectedRow.targetKind) : []

  return (
    <div className="panel" id="animate-panel">
      <div className="panel-title-row">
        <h3 className="panel-title">Animate</h3>
        <span className="panel-kicker">{activeShot.name}</span>
      </div>

      <div className="timeline-shot-meta">
        <span>{activeShot.durationSeconds}s</span>
        <span>{activeShot.fps} fps</span>
        <span>{activeShot.aspect.width}:{activeShot.aspect.height}</span>
      </div>

      <div className="target-picker">
        {rows.map((row) => (
          <button
            key={row.id}
            className={`target-pill ${selectedRow?.targetNodeId === row.targetNodeId ? 'active' : ''}`}
            onClick={() => {
              onSelectTarget(row.targetNodeId)
              onSelectLayer(row.layers[0]?.id ?? null)
            }}
          >
            <span className="target-pill-kind">{row.category}</span>
            <strong>{row.name}</strong>
          </button>
        ))}
      </div>

      <div className="panel-section">
        <div className="section-label">Presets</div>
        {selectedRow ? (
          <div className="preset-grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className="preset-card"
                onClick={() => {
                  const layerId = engine.addMotionPreset(selectedRow.targetNodeId, preset.id)
                  onSelectTarget(selectedRow.targetNodeId)
                  onSelectLayer(layerId)
                }}
              >
                <strong>{preset.name}</strong>
                <span>{preset.durationSeconds}s</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="panel-empty">Select a target to add presets</p>
        )}
      </div>

      <div className="panel-section">
        <div className="section-label">Layer</div>
        {selectedLayer ? (
          <div className="layer-editor">
            <label className="field">
              <span>Name</span>
              <input
                value={selectedLayer.name}
                onChange={(event) => engine.updateMotionLayer(selectedLayer.id, { name: event.target.value })}
              />
            </label>
            <div className="field-grid">
              <label className="field">
                <span>Start</span>
                <input
                  type="number"
                  step="0.1"
                  value={selectedLayer.startTimeSeconds}
                  onChange={(event) => updateNumber(engine, selectedLayer.id, 'startTimeSeconds', event)}
                />
              </label>
              <label className="field">
                <span>Duration</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={selectedLayer.durationSeconds}
                  onChange={(event) => updateNumber(engine, selectedLayer.id, 'durationSeconds', event)}
                />
              </label>
            </div>
            <label className="field">
              <span>Strength</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={selectedLayer.strength}
                onChange={(event) => updateNumber(engine, selectedLayer.id, 'strength', event)}
              />
              <strong>{selectedLayer.strength.toFixed(2)}</strong>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={selectedLayer.enabled}
                onChange={(event) => engine.updateMotionLayer(selectedLayer.id, { enabled: event.target.checked })}
              />
              <span>Enabled</span>
            </label>
            <div className="field-list">
              {Object.entries(selectedLayer.parameters).map(([key, value]) => (
                <ParameterField
                  key={key}
                  name={key}
                  value={value}
                  onChange={(nextValue) => {
                    engine.updateMotionLayer(selectedLayer.id, {
                      parameters: {
                        [key]: nextValue,
                      } satisfies MotionLayerParameters,
                    })
                  }}
                />
              ))}
            </div>
            <button
              className="danger-btn"
              onClick={() => {
                engine.removeMotionLayer(selectedLayer.id)
                onSelectLayer(null)
              }}
            >
              Remove Layer
            </button>
          </div>
        ) : (
          <p className="panel-empty">Select a layer in the timeline to edit timing and parameters</p>
        )}
      </div>
    </div>
  )
}

function ParameterField(
  props: {
    name: string
    value: string | number | boolean
    onChange: (value: string | number | boolean) => void
  },
) {
  const { name, value, onChange } = props

  if (typeof value === 'boolean') {
    return (
      <label className="field checkbox-field">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        <span>{humanize(name)}</span>
      </label>
    )
  }

  if (name === 'axis' && typeof value === 'string') {
    return (
      <label className="field">
        <span>{humanize(name)}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="x">X</option>
          <option value="y">Y</option>
          <option value="z">Z</option>
        </select>
      </label>
    )
  }

  return (
    <label className="field">
      <span>{humanize(name)}</span>
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        step={typeof value === 'number' ? '0.05' : undefined}
        value={String(value)}
        onChange={(event) => {
          if (typeof value === 'number') {
            const nextValue = Number(event.target.value)
            if (!Number.isFinite(nextValue)) return
            onChange(nextValue)
            return
          }

          onChange(event.target.value)
        }}
      />
    </label>
  )
}

function updateNumber(
  engine: EngineAPI,
  layerId: string,
  key: 'startTimeSeconds' | 'durationSeconds' | 'strength',
  event: ChangeEvent<HTMLInputElement>,
): void {
  const value = Number(event.target.value)
  if (!Number.isFinite(value)) return
  engine.updateMotionLayer(layerId, { [key]: value })
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}

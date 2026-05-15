import type { ChangeEvent } from 'react'
import type { EngineAPI } from '../../engine/EngineAPI'
import type {
  MotionEasing,
  MotionFeatureTag,
  MotionLayerParameters,
  MotionParameterControl,
  MotionPreset,
} from '../../engine/project/types'
import { useEngineStore } from '../../store/useEngineStore'

interface AnimatePanelProps {
  engine: EngineAPI
  selectedTargetNodeId: string | null
  selectedTrackId: string | null
  selectedLayerId: string | null
  onSelectTarget: (nodeId: string) => void
  onSelectTrack: (trackId: string | null) => void
  onSelectLayer: (layerId: string | null) => void
}

const EASING_OPTIONS: Array<{ value: MotionEasing; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
]

export function AnimatePanel({
  engine,
  selectedTargetNodeId,
  selectedTrackId,
  selectedLayerId,
  onSelectTarget,
  onSelectTrack,
  onSelectLayer,
}: AnimatePanelProps) {
  const activeShot = useEngineStore((s) => s.activeShot)
  const rows = useEngineStore((s) => s.timelineRows)
  const selectedRow = rows.find((row) => row.targetNodeId === selectedTargetNodeId) ?? rows[0] ?? null
  const selectedTrack = selectedRow?.tracks.find((track) => track.id === selectedTrackId) ?? selectedRow?.tracks[0] ?? null
  const selectedLayer = selectedTrack?.layers.find((layer) => layer.id === selectedLayerId)
    ?? selectedTrack?.layers[0]
    ?? selectedRow?.tracks.flatMap((track) => track.layers)[0]
    ?? null
  const presets = selectedRow ? engine.getMotionPresets(selectedRow.targetKind) : []
  const selectedPreset = selectedLayer
    ? presets.find((preset) => preset.id === selectedLayer.presetId) ?? null
    : null
  const parameterControls = selectedLayer
    ? buildParameterControls(selectedLayer.parameters, selectedPreset)
    : []

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
        {rows.map((row) => {
          const rowTracks = row.tracks
          const rowLayers = rowTracks.flatMap((track) => track.layers)

          return (
            <button
              key={row.id}
              className={`target-pill ${selectedRow?.targetNodeId === row.targetNodeId ? 'active' : ''}`}
              onClick={() => {
                onSelectTarget(row.targetNodeId)
                onSelectTrack(rowTracks[0]?.id ?? null)
                onSelectLayer(rowLayers[0]?.id ?? null)
              }}
            >
              <span className="target-pill-kind">{row.category}</span>
              <strong>{row.name}</strong>
            </button>
          )
        })}
      </div>

      <div className="panel-section">
        <div className="section-label">Tracks</div>
        {selectedRow ? (
          <div className="track-picker">
            {selectedRow.tracks.map((track) => (
              <button
                key={track.id}
                className={`track-pill ${selectedTrack?.id === track.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectTarget(selectedRow.targetNodeId)
                  onSelectTrack(track.id)
                  onSelectLayer(track.layers[0]?.id ?? null)
                }}
              >
                <span>{track.name}</span>
                <small>{track.layers.length}</small>
              </button>
            ))}
            <button
              className="track-add-pill"
              onClick={() => {
                const nextTrackId = engine.addTrack(selectedRow.targetNodeId)
                onSelectTarget(selectedRow.targetNodeId)
                onSelectTrack(nextTrackId)
                onSelectLayer(null)
              }}
            >
              + Track
            </button>
          </div>
        ) : (
          <p className="panel-empty">Select a target to manage tracks</p>
        )}
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
                  const layerId = engine.addMotionPreset(selectedRow.targetNodeId, preset.id, selectedTrack?.id)
                  onSelectTarget(selectedRow.targetNodeId)
                  onSelectTrack(selectedTrack?.id ?? null)
                  onSelectLayer(layerId)
                }}
              >
                <strong>{preset.name}</strong>
                <div className="preset-card-meta">
                  <span>{preset.durationSeconds}s</span>
                  <span>{formatEasing(preset.defaultEasing)}</span>
                </div>
                <div className="preset-feature-list">
                  {preset.features.map((feature) => (
                    <span key={feature} className="preset-feature-chip">
                      {humanizeFeature(feature)}
                    </span>
                  ))}
                </div>
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
            <div className="field-grid">
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
              <label className="field">
                <span>Easing</span>
                <select
                  value={selectedLayer.easing}
                  onChange={(event) => {
                    engine.updateMotionLayer(selectedLayer.id, { easing: event.target.value as MotionEasing })
                  }}
                >
                  {EASING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={selectedLayer.enabled}
                onChange={(event) => engine.updateMotionLayer(selectedLayer.id, { enabled: event.target.checked })}
              />
              <span>Enabled</span>
            </label>
            <div className="field-list">
              {parameterControls.map((control) => (
                <ParameterField
                  key={control.key}
                  control={control}
                  value={selectedLayer.parameters[control.key]}
                  onChange={(nextValue) => {
                    engine.updateMotionLayer(selectedLayer.id, {
                      parameters: {
                        [control.key]: nextValue,
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
    control: MotionParameterControl
    value: string | number | boolean | undefined
    onChange: (value: string | number | boolean) => void
  },
) {
  const { control, value, onChange } = props

  switch (control.kind) {
    case 'boolean':
      return (
        <label className="field checkbox-field">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
          <span>{control.label}</span>
        </label>
      )
    case 'select':
      return (
        <label className="field">
          <span>{control.label}</span>
          <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'text':
      return (
        <label className="field">
          <span>{control.label}</span>
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )
    case 'number':
      return (
        <label className="field">
          <span>{control.label}</span>
          <input
            type="number"
            min={control.min}
            max={control.max}
            step={control.step ?? 0.05}
            value={typeof value === 'number' ? value : 0}
            onChange={(event) => {
              const nextValue = Number(event.target.value)
              if (!Number.isFinite(nextValue)) return
              onChange(nextValue)
            }}
          />
        </label>
      )
  }
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

function buildParameterControls(
  parameters: MotionLayerParameters,
  preset: MotionPreset | null,
): MotionParameterControl[] {
  const presetControls = preset?.parameterControls ?? []
  const controlKeys = new Set(presetControls.map((control) => control.key))
  const fallbackControls = Object.entries(parameters)
    .filter(([key]) => !controlKeys.has(key))
    .map(([key, value]): MotionParameterControl => inferParameterControl(key, value))

  return [...presetControls, ...fallbackControls]
}

function inferParameterControl(
  key: string,
  value: string | number | boolean,
): MotionParameterControl {
  if (typeof value === 'boolean') {
    return { key, label: humanize(key), kind: 'boolean' }
  }

  if (typeof value === 'number') {
    return { key, label: humanize(key), kind: 'number', step: 0.05 }
  }

  return { key, label: humanize(key), kind: 'text' }
}

function formatEasing(easing: MotionEasing): string {
  return EASING_OPTIONS.find((option) => option.value === easing)?.label ?? humanize(easing)
}

function humanizeFeature(feature: MotionFeatureTag): string {
  return feature
    .split('-')
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ')
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}

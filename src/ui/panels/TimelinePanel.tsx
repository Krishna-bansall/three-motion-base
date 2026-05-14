import { useEngineStore } from '../../store/useEngineStore'
import { getTimelineScrubberStep } from './timelinePlayback'
import { PlayIcon, PauseIcon } from './icons'

type TimelineCategory = 'all' | 'objects' | 'camera' | 'lights'

interface TimelinePanelProps {
  category: TimelineCategory
  onCategoryChange: (category: TimelineCategory) => void
  isPlaying: boolean
  onTogglePlayback: () => void
  onSeek: (timeSeconds: number) => void
  selectedTargetNodeId: string | null
  selectedLayerId: string | null
  onSelectTarget: (nodeId: string) => void
  onSelectLayer: (layerId: string | null) => void
}

export function TimelinePanel({
  category,
  onCategoryChange,
  isPlaying,
  onTogglePlayback,
  onSeek,
  selectedTargetNodeId,
  selectedLayerId,
  onSelectTarget,
  onSelectLayer,
}: TimelinePanelProps) {
  const activeShot = useEngineStore((s) => s.activeShot)
  const rows = useEngineStore((s) => s.timelineRows)
  const timeSeconds = useEngineStore((s) => s.timelineTimeSeconds)
  const visibleRows = category === 'all'
    ? rows
    : rows.filter((row) => row.category === category)

  return (
    <section className="timeline-shell" aria-label="Animation timeline">
      <div className="timeline-header">
        <div>
          <div className="timeline-overline">Main Sequence</div>
          <h2>{activeShot.name}</h2>
        </div>
        <div className="timeline-meta">
          <span>{activeShot.durationSeconds}s</span>
          <span>{activeShot.fps} fps</span>
        </div>
      </div>

      <div className="timeline-controls">
        <div className="timeline-category-tabs">
          {(['all', 'objects', 'camera', 'lights'] as TimelineCategory[]).map((value) => (
            <button
              key={value}
              className={`timeline-tab ${category === value ? 'active' : ''}`}
              onClick={() => onCategoryChange(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="timeline-transport">
          <button
            className={`timeline-play-btn ${isPlaying ? 'active' : ''}`}
            onClick={onTogglePlayback}
            disabled={rows.length === 0}
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <label className="timeline-scrubber">
            <span>{timeSeconds.toFixed(2)} / {activeShot.durationSeconds.toFixed(2)}s</span>
            <input
              type="range"
              min="0"
              max={activeShot.durationSeconds}
              step={getTimelineScrubberStep(activeShot.fps)}
              value={timeSeconds}
              onChange={(event) => onSeek(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="timeline-grid">
        {visibleRows.map((row) => {
          const rowLayers = row.tracks.flatMap((track) => track.layers)

          return (
            <div
              key={row.id}
              className={`timeline-row ${selectedTargetNodeId === row.targetNodeId ? 'active' : ''}`}
            >
              <button
                className="timeline-row-label"
                onClick={() => {
                  onSelectTarget(row.targetNodeId)
                  onSelectLayer(rowLayers[0]?.id ?? null)
                }}
              >
                <span className="timeline-row-category">{row.category}</span>
                <strong>{row.name}</strong>
              </button>
              <div className="timeline-row-track">
                {rowLayers.length === 0 ? (
                  <div className="timeline-row-empty">Add a preset</div>
                ) : rowLayers.map((layer) => (
                  <button
                    key={layer.id}
                    className={`timeline-layer-chip ${selectedLayerId === layer.id ? 'active' : ''} ${layer.enabled ? '' : 'muted'}`}
                    style={layerStyle(layer.startTimeSeconds, layer.durationSeconds, activeShot.durationSeconds)}
                    onClick={() => {
                      onSelectTarget(row.targetNodeId)
                      onSelectLayer(layer.id)
                    }}
                    title={`${layer.name} · ${layer.startTimeSeconds.toFixed(2)}s → ${(layer.startTimeSeconds + layer.durationSeconds).toFixed(2)}s`}
                  >
                    <span>{layer.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function layerStyle(startTimeSeconds: number, durationSeconds: number, shotDurationSeconds: number) {
  const total = Math.max(shotDurationSeconds, 0.1)
  const left = (startTimeSeconds / total) * 100
  const width = Math.max((durationSeconds / total) * 100, 6)

  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

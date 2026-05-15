import { useEngineStore, type TimelineTrackInfo } from '../../store/useEngineStore'
import { getTimelineScrubberStep } from './timelinePlayback'

type TimelineCategory = 'all' | 'objects' | 'camera' | 'lights'

interface TimelinePanelProps {
  category: TimelineCategory
  onCategoryChange: (category: TimelineCategory) => void
  isPlaying: boolean
  onTogglePlayback: () => void
  onSeek: (timeSeconds: number) => void
  selectedTargetNodeId: string | null
  selectedTrackId: string | null
  selectedLayerId: string | null
  onSelectTarget: (nodeId: string) => void
  onSelectTrack: (trackId: string | null) => void
  onSelectLayer: (layerId: string | null) => void
  onAddTrack: (targetNodeId: string) => void
  onRemoveTrack: (targetNodeId: string, trackId: string) => void
}

export function TimelinePanel({
  category,
  onCategoryChange,
  isPlaying,
  onTogglePlayback,
  onSeek,
  selectedTargetNodeId,
  selectedTrackId,
  selectedLayerId,
  onSelectTarget,
  onSelectTrack,
  onSelectLayer,
  onAddTrack,
  onRemoveTrack,
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
          >
            {isPlaying ? 'Pause' : 'Play'}
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
          const firstTrack = row.tracks[0] ?? null
          const firstLayer = firstTrack?.layers[0] ?? row.tracks.flatMap((track) => track.layers)[0] ?? null

          return (
            <div
              key={row.id}
              className={`timeline-row ${selectedTargetNodeId === row.targetNodeId ? 'active' : ''}`}
            >
              <button
                className="timeline-row-label"
                onClick={() => {
                  onSelectTarget(row.targetNodeId)
                  onSelectTrack(firstTrack?.id ?? null)
                  onSelectLayer(firstLayer?.id ?? null)
                }}
              >
                <span className="timeline-row-category">{row.category}</span>
                <strong>{row.name}</strong>
              </button>
              <div className="timeline-row-tracks">
                {row.tracks.map((track) => (
                  <TrackLane
                    key={track.id}
                    track={track}
                    targetNodeId={row.targetNodeId}
                    shotDurationSeconds={activeShot.durationSeconds}
                    selectedTrackId={selectedTrackId}
                    selectedLayerId={selectedLayerId}
                    onSelectTarget={onSelectTarget}
                    onSelectTrack={onSelectTrack}
                    onSelectLayer={onSelectLayer}
                    canRemove={row.tracks.length > 1}
                    onRemoveTrack={() => onRemoveTrack(row.targetNodeId, track.id)}
                  />
                ))}
                <button
                  className="timeline-add-track-btn"
                  onClick={() => onAddTrack(row.targetNodeId)}
                >
                  + Track
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TrackLane(
  props: {
    track: TimelineTrackInfo
    targetNodeId: string
    shotDurationSeconds: number
    selectedTrackId: string | null
    selectedLayerId: string | null
    onSelectTarget: (nodeId: string) => void
    onSelectTrack: (trackId: string | null) => void
    onSelectLayer: (layerId: string | null) => void
    canRemove: boolean
    onRemoveTrack: () => void
  },
) {
  const {
    track,
    targetNodeId,
    shotDurationSeconds,
    selectedTrackId,
    selectedLayerId,
    onSelectTarget,
    onSelectTrack,
    onSelectLayer,
    canRemove,
    onRemoveTrack,
  } = props

  const isActive = selectedTrackId === track.id

  return (
    <div className={`timeline-track ${track.enabled ? '' : 'muted'} ${isActive ? 'active' : ''}`}>
      <div className="timeline-track-header">
        <button
          className="timeline-track-name-btn"
          onClick={() => {
            onSelectTarget(targetNodeId)
            onSelectTrack(track.id)
            onSelectLayer(track.layers[0]?.id ?? null)
          }}
        >
          <span className="timeline-track-name">{track.name}</span>
        </button>
        {canRemove ? (
          <button className="timeline-track-remove-btn" onClick={onRemoveTrack} title="Remove track">
            Remove
          </button>
        ) : null}
      </div>
      <div className="timeline-track-lane">
        {track.layers.length === 0 ? (
          <div className="timeline-track-empty">Add a preset</div>
        ) : track.layers.map((layer) => (
          <button
            key={layer.id}
            className={`timeline-layer-chip ${selectedLayerId === layer.id ? 'active' : ''} ${layer.enabled ? '' : 'muted'}`}
            style={layerStyle(layer.startTimeSeconds, layer.durationSeconds, shotDurationSeconds)}
            onClick={() => {
              onSelectTarget(targetNodeId)
              onSelectTrack(track.id)
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

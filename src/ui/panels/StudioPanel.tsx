import { useEngineStore } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'

interface StudioPanelProps {
  engine: EngineAPI
}

export function StudioPanel({ engine }: StudioPanelProps) {
  const objects = useEngineStore((s) => s.studioSetupObjects)
  const selectedNodeId = useEngineStore((s) => s.selectedStudioObjectNodeId)

  return (
    <div className="panel" id="studio-panel">
      <div className="panel-title-row">
        <h3 className="panel-title">Studio</h3>
        <button
          className="studio-preset-btn"
          onClick={() => { void engine.applyStudioPreset('soft-box-plinth') }}
        >
          Soft Box
        </button>
      </div>

      {objects.length === 0 ? (
        <p className="panel-empty">No studio preset applied</p>
      ) : (
        <div className="studio-object-list">
          {objects.map((object) => (
            <div
              key={object.id}
              className={`studio-object-row ${selectedNodeId === object.nodeId ? 'active' : ''}`}
            >
              <button
                className="studio-object-select"
                onClick={() => engine.selectStudioObject(object.nodeId)}
              >
                <span className="material-symbols-rounded" aria-hidden>
                  {object.kind === 'plinth' ? 'deployed_code' : 'crop_square'}
                </span>
                <span>{object.name}</span>
              </button>
              <button
                className={`studio-visibility-btn ${object.visible ? 'active' : ''}`}
                aria-label={`${object.visible ? 'Hide' : 'Show'} ${object.name}`}
                onClick={() => engine.setStudioObjectVisible(object.nodeId, !object.visible)}
              >
                <span className="material-symbols-rounded" aria-hidden>
                  {object.visible ? 'visibility' : 'visibility_off'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

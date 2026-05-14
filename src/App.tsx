/**
 * App — Root layout with StartScreen → Viewer flow.
 * 
 * Creates a single EngineAPI instance and passes it to all children.
 * React never touches THREE objects — only calls EngineAPI methods.
 * 
 * Flow: StartScreen picks the model source → Viewer mounts → engine loads the model.
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { EngineAPI } from './engine/EngineAPI'
import { useEngineStore } from './store/useEngineStore'
import { StartScreen } from './ui/StartScreen'
import { Viewport } from './ui/Viewport'
import { DragDropZone } from './ui/DragDropZone'
import { MaterialPanel } from './ui/panels/MaterialPanel'
import { LightingPanel } from './ui/panels/LightingPanel'
import { StudioPanel } from './ui/panels/StudioPanel'
import { ExportPanel } from './ui/panels/ExportPanel'
import { FiltersPanel } from './ui/panels/FiltersPanel'
import { AnimatePanel } from './ui/panels/AnimatePanel'
import { TimelinePanel } from './ui/panels/TimelinePanel'

/** Describes what the start screen selected */
type ModelSource =
  | { type: 'sample' }
  | { type: 'file'; file: File }
  | { type: 'files'; files: File[] }

type EditorMode = 'setup' | 'animate'
type TimelineCategory = 'all' | 'objects' | 'camera' | 'lights'

function App() {
  const engine = useMemo(() => new EngineAPI(), [])
  const [modelSource, setModelSource] = useState<ModelSource | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('setup')
  const [timelineCategory, setTimelineCategory] = useState<TimelineCategory>('all')
  const [selectedTargetNodeId, setSelectedTargetNodeId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const timelineRows = useEngineStore((s) => s.timelineRows)
  const timelineTimeSeconds = useEngineStore((s) => s.timelineTimeSeconds)

  const handleModelSelected = useCallback((source: ModelSource) => {
    setModelSource(source)
  }, [])

  useEffect(() => {
    window.threeMotion = engine.getConsoleAPI()

    return () => {
      delete window.threeMotion
    }
  }, [engine])

  useEffect(() => {
    if (editorMode === 'animate') {
      if (!selectedTargetNodeId && timelineRows.length > 0) {
        setSelectedTargetNodeId(timelineRows[0].targetNodeId)
      }
      engine.previewAnimation(timelineTimeSeconds)
      return
    }

    engine.clearAnimationPreview()
    setSelectedLayerId(null)
  }, [editorMode, engine, selectedTargetNodeId, timelineRows, timelineTimeSeconds])

  useEffect(() => {
    if (selectedTargetNodeId && timelineRows.some((row) => row.targetNodeId === selectedTargetNodeId)) {
      return
    }

    setSelectedTargetNodeId(timelineRows[0]?.targetNodeId ?? null)
    setSelectedLayerId(null)
  }, [selectedTargetNodeId, timelineRows])

  useEffect(() => {
    if (!selectedLayerId) return

    const layerExists = timelineRows.some((row) => row.layers.some((layer) => layer.id === selectedLayerId))
    if (!layerExists) {
      setSelectedLayerId(null)
    }
  }, [selectedLayerId, timelineRows])

  // Show start screen until user makes a choice
  if (!modelSource) {
    return <StartScreen onModelSelected={handleModelSelected} />
  }

  return (
    <div id="app" className={`app-layout ${editorMode === 'animate' ? 'app-layout-animate' : ''}`}>
      <div className="workspace-area">
        <main className="viewport-area">
          <Viewport engine={engine} modelSource={modelSource} />
          <DragDropZone engine={engine} />
        </main>
        {editorMode === 'animate' ? (
          <TimelinePanel
            engine={engine}
            category={timelineCategory}
            onCategoryChange={setTimelineCategory}
            selectedTargetNodeId={selectedTargetNodeId}
            selectedLayerId={selectedLayerId}
            onSelectTarget={setSelectedTargetNodeId}
            onSelectLayer={setSelectedLayerId}
          />
        ) : null}
      </div>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            <h1 className="app-title">
              <span className="title-accent">◆</span> three-motion
            </h1>
            <div className="mode-toggle" role="tablist" aria-label="Editor mode">
              <button
                className={`mode-toggle-btn ${editorMode === 'setup' ? 'active' : ''}`}
                onClick={() => setEditorMode('setup')}
              >
                Setup
              </button>
              <button
                className={`mode-toggle-btn ${editorMode === 'animate' ? 'active' : ''}`}
                onClick={() => setEditorMode('animate')}
              >
                Animate
              </button>
            </div>
          </div>
        </div>
        <div className="sidebar-panels">
          {editorMode === 'setup' ? (
            <>
              <StudioPanel engine={engine} />
              <LightingPanel engine={engine} />
              <FiltersPanel engine={engine} />
              <MaterialPanel engine={engine} />
            </>
          ) : (
            <AnimatePanel
              engine={engine}
              selectedTargetNodeId={selectedTargetNodeId}
              selectedLayerId={selectedLayerId}
              onSelectTarget={setSelectedTargetNodeId}
              onSelectLayer={setSelectedLayerId}
            />
          )}
          <ExportPanel engine={engine} />
        </div>
      </aside>
    </div>
  )
}

export default App

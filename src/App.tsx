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
import { StartScreen } from './ui/StartScreen'
import { Viewport } from './ui/Viewport'
import { DragDropZone } from './ui/DragDropZone'
import { MaterialPanel } from './ui/panels/MaterialPanel'
import { LightingPanel } from './ui/panels/LightingPanel'
import { StudioPanel } from './ui/panels/StudioPanel'
import { ExportPanel } from './ui/panels/ExportPanel'
import { FiltersPanel } from './ui/panels/FiltersPanel'

/** Describes what the start screen selected */
type ModelSource =
  | { type: 'sample' }
  | { type: 'file'; file: File }
  | { type: 'files'; files: File[] }

function App() {
  const engine = useMemo(() => new EngineAPI(), [])
  const [modelSource, setModelSource] = useState<ModelSource | null>(null)

  const handleModelSelected = useCallback((source: ModelSource) => {
    setModelSource(source)
  }, [])

  useEffect(() => {
    window.threeMotion = engine.getConsoleAPI()

    return () => {
      delete window.threeMotion
    }
  }, [engine])

  // Show start screen until user makes a choice
  if (!modelSource) {
    return <StartScreen onModelSelected={handleModelSelected} />
  }

  return (
    <div id="app" className="app-layout">
      {/* ── Viewport ── */}
      <main className="viewport-area">
        <Viewport engine={engine} modelSource={modelSource} />
        <DragDropZone engine={engine} />
      </main>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">
            <span className="title-accent">◆</span> three-motion
          </h1>
        </div>
        <div className="sidebar-panels">
          <StudioPanel engine={engine} />
          <LightingPanel engine={engine} />
          <FiltersPanel engine={engine} />
          <MaterialPanel engine={engine} />
          <ExportPanel engine={engine} />
        </div>
      </aside>
    </div>
  )
}

export default App

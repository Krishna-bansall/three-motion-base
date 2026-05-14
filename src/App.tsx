/**
 * App — Root layout with StartScreen → Viewer flow.
 *
 * Creates a single EngineAPI instance and passes it to all children.
 * React never touches THREE objects — only calls EngineAPI methods.
 *
 * Flow: StartScreen picks the model source → Viewer mounts → engine loads the model.
 */
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
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
import {
  advanceTimelinePlayback,
  clampTimelineTime,
  getPlaybackStartTime,
} from './ui/panels/timelinePlayback'

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
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false)
  const playbackFrameRef = useRef<number | null>(null)
  const playbackStartedAtRef = useRef<number | null>(null)
  const playbackOriginTimeRef = useRef(0)
  const activeShot = useEngineStore((s) => s.activeShot)
  const timelineRows = useEngineStore((s) => s.timelineRows)
  const timelineTimeSeconds = useEngineStore((s) => s.timelineTimeSeconds)

  const effectiveSelectedTargetNodeId = selectedTargetNodeId && timelineRows.some(
    (row) => row.targetNodeId === selectedTargetNodeId,
  )
    ? selectedTargetNodeId
    : (timelineRows[0]?.targetNodeId ?? null)

  const effectiveSelectedLayerId = selectedLayerId && timelineRows.some(
    (row) => row.tracks.some((track) => track.layers.some((layer) => layer.id === selectedLayerId)),
  )
    ? selectedLayerId
    : null

  const canPlayTimeline = editorMode === 'animate' && timelineRows.length > 0 && activeShot.durationSeconds > 0
  const timelinePlaybackActive = isTimelinePlaying && canPlayTimeline

  const handleModelSelected = useCallback((source: ModelSource) => {
    setModelSource(source)
  }, [])

  const seekTimeline = useCallback((timeSeconds: number) => {
    engine.previewAnimation(clampTimelineTime(timeSeconds, activeShot.durationSeconds))
  }, [activeShot.durationSeconds, engine])

  const handleEditorModeChange = useCallback((nextMode: EditorMode) => {
    if (nextMode === 'setup') {
      setIsTimelinePlaying(false)
      setSelectedLayerId(null)
    }

    setEditorMode(nextMode)
  }, [])

  const handleTimelineSeek = useCallback((timeSeconds: number) => {
    if (timelinePlaybackActive) {
      setIsTimelinePlaying(false)
    }

    seekTimeline(timeSeconds)
  }, [seekTimeline, timelinePlaybackActive])

  const handleToggleTimelinePlayback = useCallback(() => {
    if (!canPlayTimeline) {
      return
    }

    if (timelinePlaybackActive) {
      setIsTimelinePlaying(false)
      return
    }

    const startTime = getPlaybackStartTime(timelineTimeSeconds, activeShot.durationSeconds)
    seekTimeline(startTime)
    setIsTimelinePlaying(true)
  }, [
    activeShot.durationSeconds,
    canPlayTimeline,
    seekTimeline,
    timelinePlaybackActive,
    timelineTimeSeconds,
  ])

  // Space key toggles timeline playback (only in animate mode, not while typing in inputs)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (editorMode !== 'animate') return
      if (event.code !== 'Space') return

      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return
      }

      event.preventDefault()
      handleToggleTimelinePlayback()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editorMode, handleToggleTimelinePlayback])

  useEffect(() => {
    window.threeMotion = engine.getConsoleAPI()

    return () => {
      delete window.threeMotion
    }
  }, [engine])

  useEffect(() => {
    if (editorMode === 'animate') {
      seekTimeline(useEngineStore.getState().timelineTimeSeconds)
      return
    }

    engine.clearAnimationPreview()
  }, [editorMode, engine, seekTimeline])

  useEffect(() => {
    if (!timelinePlaybackActive) {
      return
    }

    playbackOriginTimeRef.current = clampTimelineTime(
      useEngineStore.getState().timelineTimeSeconds,
      activeShot.durationSeconds,
    )
    playbackStartedAtRef.current = null

    const stepPlayback = (frameTime: number) => {
      if (playbackStartedAtRef.current === null) {
        playbackStartedAtRef.current = frameTime
      }

      const nextFrame = advanceTimelinePlayback({
        startTimeSeconds: playbackOriginTimeRef.current,
        elapsedSeconds: (frameTime - playbackStartedAtRef.current) / 1000,
        durationSeconds: activeShot.durationSeconds,
      })

      engine.previewAnimation(nextFrame.timeSeconds)

      if (nextFrame.completed) {
        playbackFrameRef.current = null
        playbackStartedAtRef.current = null
        setIsTimelinePlaying(false)
        return
      }

      playbackFrameRef.current = requestAnimationFrame(stepPlayback)
    }

    playbackFrameRef.current = requestAnimationFrame(stepPlayback)

    return () => {
      if (playbackFrameRef.current !== null) {
        cancelAnimationFrame(playbackFrameRef.current)
      }

      playbackFrameRef.current = null
      playbackStartedAtRef.current = null
    }
  }, [activeShot.durationSeconds, engine, timelinePlaybackActive])

  useEffect(() => {
    const clampedTime = clampTimelineTime(timelineTimeSeconds, activeShot.durationSeconds)
    if (clampedTime === timelineTimeSeconds) {
      return
    }

    seekTimeline(clampedTime)
  }, [activeShot.durationSeconds, seekTimeline, timelineTimeSeconds])

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
            category={timelineCategory}
            onCategoryChange={setTimelineCategory}
            isPlaying={timelinePlaybackActive}
            onTogglePlayback={handleToggleTimelinePlayback}
            onSeek={handleTimelineSeek}
            selectedTargetNodeId={effectiveSelectedTargetNodeId}
            selectedLayerId={effectiveSelectedLayerId}
            onSelectTarget={setSelectedTargetNodeId}
            onSelectLayer={setSelectedLayerId}
            onAddTrack={(nodeId) => engine.addTrack(nodeId)}
            onRemoveTrack={(nodeId, trackId) => engine.removeTrack(nodeId, trackId)}
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
                onClick={() => handleEditorModeChange('setup')}
              >
                Setup
              </button>
              <button
                className={`mode-toggle-btn ${editorMode === 'animate' ? 'active' : ''}`}
                onClick={() => handleEditorModeChange('animate')}
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
              selectedTargetNodeId={effectiveSelectedTargetNodeId}
              selectedLayerId={effectiveSelectedLayerId}
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

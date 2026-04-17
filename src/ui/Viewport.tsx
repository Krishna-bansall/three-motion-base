/**
 * Viewport — Canvas container for Three.js renderer.
 *
 * Mounts the engine, then loads the model from the provided source.
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { useEngineStore } from '../store/useEngineStore'
import type { EngineAPI } from '../engine/EngineAPI'
import type { TransformGizmoMode } from '../engine/runtime/types'

type ModelSource =
  | { type: 'sample' }
  | { type: 'file'; file: File }
  | { type: 'files'; files: File[] }

interface ViewportProps {
  engine: EngineAPI
  modelSource: ModelSource
}

type HistoryToast = {
  id: number
  label: 'Undo' | 'Redo'
  icon: 'undo' | 'redo'
}

export function Viewport({ engine, modelSource }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isLoading = useEngineStore((s) => s.isLoading)
  const canUndo = useEngineStore((s) => s.canUndo)
  const canRedo = useEngineStore((s) => s.canRedo)
  const hasInitialized = useRef(false)
  const [transformMode, setTransformMode] = useState<TransformGizmoMode | null>('rotate')
  const [toast, setToast] = useState<HistoryToast | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((label: HistoryToast['label'], icon: HistoryToast['icon']) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }

    setToast({ id: Date.now(), label, icon })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 1200)
  }, [])

  const runUndo = useCallback(async () => {
    const didUndo = await engine.undo()
    if (didUndo) {
      showToast('Undo', 'undo')
    }
  }, [engine, showToast])

  const runRedo = useCallback(async () => {
    const didRedo = await engine.redo()
    if (didRedo) {
      showToast('Redo', 'redo')
    }
  }, [engine, showToast])

  useEffect(() => {
    if (!containerRef.current || hasInitialized.current) return
    hasInitialized.current = true

    // 1. Initialize renderer (mounts canvas, starts render loop, loads HDRI)
    engine.init(containerRef.current)

    // 2. Load the model once renderer is ready
    const loadModel = async () => {
      try {
        switch (modelSource.type) {
          case 'sample':
            await engine.loadModel('/models/sample.glb')
            break
          case 'file':
            await engine.loadModelFromFile(modelSource.file)
            break
          case 'files':
            await engine.loadModelFromFiles(modelSource.files)
            break
        }
      } catch (e) {
        console.error('Failed to load model:', e)
      }
    }

    // Small delay to let HDRI load first for better visual experience
    const loadTimer = window.setTimeout(loadModel, 500)

    return () => {
      window.clearTimeout(loadTimer)
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
      engine.dispose()
      hasInitialized.current = false
    }
  }, [engine, modelSource])

  useEffect(() => {
    engine.setTransformGizmoMode(transformMode)
  }, [engine, transformMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const isUndoRedoChord = event.ctrlKey || event.metaKey

      if (isUndoRedoChord) {
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          void runUndo()
          return
        }

        if (key === 'r' || (key === 'z' && event.shiftKey)) {
          event.preventDefault()
          void runRedo()
          return
        }
      }

      switch (key) {
        case 'q':
          setTransformMode(null)
          break
        case 'w':
          setTransformMode('translate')
          break
        case 'e':
          setTransformMode('rotate')
          break
        case 'r':
          setTransformMode('scale')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runRedo, runUndo])

  return (
    <div id="viewport-wrapper" className="viewport-wrapper">
      <div ref={containerRef} className="viewport-canvas" />
      <div className="viewport-history-toolbar">
        <button
          className="viewport-history-btn"
          onClick={() => void runUndo()}
          type="button"
          disabled={!canUndo}
          title="Undo (Ctrl/Cmd+Z)"
        >
          <span>Undo</span>
          <strong>Ctrl+Z</strong>
        </button>
        <button
          className="viewport-history-btn"
          onClick={() => void runRedo()}
          type="button"
          disabled={!canRedo}
          title="Redo (Ctrl/Cmd+R)"
        >
          <span>Redo</span>
          <strong>Ctrl+R</strong>
        </button>
      </div>
      <div className="viewport-toolbar">
        <button
          className={`viewport-tool-btn ${transformMode === null ? 'active' : ''}`}
          onClick={() => setTransformMode(null)}
          type="button"
        >
          Off
          <span>Q</span>
        </button>
        <button
          className={`viewport-tool-btn ${transformMode === 'translate' ? 'active' : ''}`}
          onClick={() => setTransformMode('translate')}
          type="button"
        >
          Move
          <span>W</span>
        </button>
        <button
          className={`viewport-tool-btn ${transformMode === 'rotate' ? 'active' : ''}`}
          onClick={() => setTransformMode('rotate')}
          type="button"
        >
          Rotate
          <span>E</span>
        </button>
        <button
          className={`viewport-tool-btn ${transformMode === 'scale' ? 'active' : ''}`}
          onClick={() => setTransformMode('scale')}
          type="button"
        >
          Scale
          <span>R</span>
        </button>
      </div>
      {toast && (
        <div key={toast.id} className="viewport-history-toast" role="status" aria-live="polite">
          <span className="material-symbols-rounded" aria-hidden>{toast.icon}</span>
          <span>{toast.label}</span>
        </div>
      )}
      {isLoading && (
        <div className="viewport-loader">
          <div className="loader-spinner" />
          <span>Loading model…</span>
        </div>
      )}
    </div>
  )
}

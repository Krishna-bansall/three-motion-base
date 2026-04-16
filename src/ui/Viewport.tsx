/**
 * Viewport — Canvas container for Three.js renderer.
 * 
 * Mounts the engine, then loads the model from the provided source.
 */
import { useRef, useEffect } from 'react'
import { useEngineStore } from '../store/useEngineStore'
import type { EngineAPI } from '../engine/EngineAPI'

type ModelSource =
  | { type: 'sample' }
  | { type: 'file'; file: File }
  | { type: 'files'; files: File[] }

interface ViewportProps {
  engine: EngineAPI
  modelSource: ModelSource
}

export function Viewport({ engine, modelSource }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isLoading = useEngineStore((s) => s.isLoading)
  const hasInitialized = useRef(false)

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
    setTimeout(loadModel, 500)

    return () => {
      engine.dispose()
      hasInitialized.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div id="viewport-wrapper" className="viewport-wrapper">
      <div ref={containerRef} className="viewport-canvas" />
      {isLoading && (
        <div className="viewport-loader">
          <div className="loader-spinner" />
          <span>Loading model…</span>
        </div>
      )}
    </div>
  )
}

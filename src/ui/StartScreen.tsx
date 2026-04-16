/**
 * StartScreen — Full-screen landing with two action buttons.
 * 
 * "Load Sample Model" or "Import Your Own"
 * Also accepts drag-drop of .glb files anywhere on the screen.
 * 
 * Does NOT touch the engine — just picks a model source and passes it up.
 */
import { useState, useCallback, useRef } from 'react'

type ModelSource =
  | { type: 'sample' }
  | { type: 'file'; file: File }
  | { type: 'files'; files: File[] }

interface StartScreenProps {
  onModelSelected: (source: ModelSource) => void
}

export function StartScreen({ onModelSelected }: StartScreenProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // ── Load sample ──
  const handleLoadSample = useCallback(() => {
    onModelSelected({ type: 'sample' })
  }, [onModelSelected])

  // ── File input (GLB or single GLTF) ──
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const glbFile = Array.from(files).find(f => f.name.endsWith('.glb'))
    if (glbFile) {
      onModelSelected({ type: 'file', file: glbFile })
      return
    }

    const gltfFile = Array.from(files).find(f => f.name.endsWith('.gltf'))
    if (gltfFile) {
      onModelSelected({ type: 'files', files: Array.from(files) })
    }
  }, [onModelSelected])

  // ── Folder input (GLTF + textures) ──
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const allFiles = Array.from(files)
    const glbFile = allFiles.find(f => f.name.endsWith('.glb'))

    if (glbFile) {
      onModelSelected({ type: 'file', file: glbFile })
    } else {
      const gltfFile = allFiles.find(f => f.name.endsWith('.gltf'))
      if (gltfFile) {
        onModelSelected({ type: 'files', files: allFiles })
      }
    }
  }, [onModelSelected])

  // ── Drag and drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const { clientX, clientY } = e
    if (
      clientX <= rect.left || clientX >= rect.right ||
      clientY <= rect.top || clientY >= rect.bottom
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const glbFile = files.find(f => f.name.endsWith('.glb'))

    if (glbFile) {
      onModelSelected({ type: 'file', file: glbFile })
      return
    }

    const gltfFile = files.find(f => f.name.endsWith('.gltf'))
    if (gltfFile) {
      onModelSelected({ type: 'files', files })
    }
  }, [onModelSelected])

  return (
    <div
      className={`start-screen ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver ? (
        <div className="start-drop-active">
          <div className="drop-ring large" />
          <p className="start-drop-text">Release to load model</p>
        </div>
      ) : (
        <div className="start-content">
          {/* Title */}
          <div className="start-header">
            <div className="start-logo">
              <span className="start-logo-diamond">◆</span>
            </div>
            <h1 className="start-title">three-motion</h1>
            <p className="start-subtitle">Cinematic 3D product viewer</p>
          </div>

          {/* Action buttons */}
          <div className="start-actions">
            {/* Load sample */}
            <button
              className="start-card"
              onClick={handleLoadSample}
              id="btn-load-sample"
            >
              <div className="start-card-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <h2 className="start-card-title">Load Sample</h2>
              <p className="start-card-desc">Start with the demo model to explore the viewer</p>
            </button>

            {/* Import your own */}
            <button
              className="start-card"
              onClick={() => fileInputRef.current?.click()}
              id="btn-import-model"
            >
              <div className="start-card-icon accent">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h2 className="start-card-title">Import Your Own</h2>
              <p className="start-card-desc">
                Select a <strong>.glb</strong> file from disk
              </p>
              <span className="start-card-hint">
                For .gltf with textures, use folder import ↓
              </span>
            </button>
          </div>

          {/* Folder import for GLTF + assets */}
          <button
            className="start-folder-btn"
            onClick={() => folderInputRef.current?.click()}
            id="btn-import-folder"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Import folder (.gltf + textures + .bin)
          </button>

          {/* Drag-drop hint */}
          <p className="start-drag-hint">
            or drag &amp; drop a <strong>.glb</strong> file anywhere
          </p>

          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is non-standard
            webkitdirectory=""
            onChange={handleFolderSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  )
}

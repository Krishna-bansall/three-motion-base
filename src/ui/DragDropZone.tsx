/**
 * DragDropZone — Viewport overlay for replacing models via drag-drop.
 * 
 * Always active (even when a model is loaded) but invisible until drag starts.
 * Only supports .glb (self-contained binary GLTF).
 */
import { useState, useCallback } from 'react'
import type { EngineAPI } from '../engine/EngineAPI'

interface DragDropZoneProps {
  engine: EngineAPI
}

export function DragDropZone({ engine }: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only dismiss if actually leaving the container
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const { clientX, clientY } = e
    if (
      clientX <= rect.left || clientX >= rect.right ||
      clientY <= rect.top || clientY >= rect.bottom
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      const glbFile = files.find(f => f.name.endsWith('.glb'))

      if (glbFile) {
        await engine.loadModelFromFile(glbFile)
      }
    },
    [engine],
  )

  return (
    <div
      id="drag-drop-zone"
      className={`drag-drop-zone viewport-drop ${isDragOver ? 'drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drop-active">
          <div className="drop-ring" />
          <p>Drop .glb to replace model</p>
        </div>
      )}
    </div>
  )
}

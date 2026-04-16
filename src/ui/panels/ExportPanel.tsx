/**
 * ExportPanel — PNG export button with scale selector.
 */
import { useState } from 'react'
import type { EngineAPI } from '../../engine/EngineAPI'

interface ExportPanelProps {
  engine: EngineAPI
}

export function ExportPanel({ engine }: ExportPanelProps) {
  const [scale, setScale] = useState(3)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await engine.exportPNG(scale)

      // Trigger download — defer revokeObjectURL so the browser
      // has time to start the download before the blob URL is freed.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `product-render-${scale}x.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="panel" id="export-panel">
      <h3 className="panel-title">Export</h3>

      <label className="slider-label">
        <span>Resolution Scale</span>
        <span className="slider-value">{scale}×</span>
      </label>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={scale}
        onChange={(e) => setScale(parseInt(e.target.value))}
        className="slider"
      />

      <button
        className="export-btn"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? (
          <>
            <span className="loader-spinner small" />
            Rendering…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PNG
          </>
        )}
      </button>
    </div>
  )
}

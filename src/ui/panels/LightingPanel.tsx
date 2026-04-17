/**
 * LightingPanel — HDRI selector, exposure, bloom controls, auto-rotate.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { useEngineStore } from '../../store/useEngineStore'
import type { EngineAPI } from '../../engine/EngineAPI'
import { HDRI_PATHS, type HDRIPreset } from '../../engine/renderer/ThreeRenderer'

interface LightingPanelProps {
  engine: EngineAPI
}

const HDRI_OPTIONS: { key: HDRIPreset; label: string; mood: string; icon: string }[] = [
  {
    key: 'studio',
    label: 'Studio',
    mood: 'Clean Focus',
    icon: 'wb_incandescent',
  },
  {
    key: 'moody',
    label: 'Moody',
    mood: 'Night Drama',
    icon: 'dark_mode',
  },
  {
    key: 'daylight',
    label: 'Daylight',
    mood: 'Open Air',
    icon: 'light_mode',
  },
]

function renderPreview(canvas: HTMLCanvasElement, path: string): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
  camera.position.set(0, 0.24, 2.15)
  camera.lookAt(0, 0, 0)

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.54, 40, 40),
    new THREE.MeshStandardMaterial({ color: 0xe3e6ef, metalness: 0.88, roughness: 0.18 }),
  )
  sphere.position.y = -0.12
  scene.add(sphere)

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.92, 0.1, 36),
    new THREE.MeshStandardMaterial({ color: 0x222431, metalness: 0.3, roughness: 0.5 }),
  )
  base.position.y = -0.72
  scene.add(base)

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  pmremGenerator.compileEquirectangularShader()

  let envMap: THREE.Texture | null = null
  let disposed = false

  const renderFrame = (): void => {
    const width = Math.max(1, Math.floor(canvas.clientWidth || 160))
    const height = Math.max(1, Math.floor(canvas.clientHeight || 110))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }

  const resizeObserver = new ResizeObserver(() => {
    if (!disposed) {
      renderFrame()
    }
  })
  resizeObserver.observe(canvas)

  new RGBELoader().load(
    path,
    (texture) => {
      if (disposed) {
        texture.dispose()
        return
      }
      envMap = pmremGenerator.fromEquirectangular(texture).texture
      scene.environment = envMap
      scene.background = envMap
      scene.backgroundBlurriness = 0.9
      scene.backgroundIntensity = 1.05
      texture.dispose()
      renderFrame()
    },
    undefined,
    () => {
      if (!disposed) {
        renderFrame()
      }
    },
  )

  renderFrame()

  return () => {
    disposed = true
    resizeObserver.disconnect()
    scene.environment = null
    scene.background = null
    envMap?.dispose()
    pmremGenerator.dispose()
    sphere.geometry.dispose()
    ;(sphere.material as THREE.Material).dispose()
    base.geometry.dispose()
    ;(base.material as THREE.Material).dispose()
    renderer.dispose()
  }
}

function HDRIPreview({ path }: { path: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    return renderPreview(canvasRef.current, path)
  }, [path])

  return <canvas ref={canvasRef} className="hdri-card-canvas" aria-hidden />
}

function setParallaxVars(element: HTMLButtonElement, clientX: number, clientY: number): void {
  const rect = element.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width - 0.5) * 2
  const y = ((clientY - rect.top) / rect.height - 0.5) * 2
  element.style.setProperty('--tilt-x', `${(-y * 8).toFixed(2)}deg`)
  element.style.setProperty('--tilt-y', `${(x * 10).toFixed(2)}deg`)
  element.style.setProperty('--shift-x', `${(x * 11).toFixed(2)}px`)
  element.style.setProperty('--shift-y', `${(y * 7).toFixed(2)}px`)
}

function resetParallaxVars(element: HTMLButtonElement): void {
  element.style.setProperty('--tilt-x', '0deg')
  element.style.setProperty('--tilt-y', '0deg')
  element.style.setProperty('--shift-x', '0px')
  element.style.setProperty('--shift-y', '0px')
}

export function LightingPanel({ engine }: LightingPanelProps) {
  const activeHDRI = useEngineStore((s) => s.activeHDRI)
  const exposure = useEngineStore((s) => s.exposure)
  const autoRotate = useEngineStore((s) => s.autoRotate)
  const autoRotateSpeed = useEngineStore((s) => s.autoRotateSpeed)
  const rangeHistoryProps = {
    onPointerDown: () => engine.beginHistoryBatch(),
    onPointerUp: () => engine.endHistoryBatch(),
    onPointerCancel: () => engine.endHistoryBatch(),
    onBlur: () => engine.endHistoryBatch(),
  }

  return (
    <div className="panel" id="lighting-panel">
      <h3 className="panel-title">Lighting</h3>

      {/* HDRI Selector */}
      <label className="slider-label"><span>Environment</span></label>
      <div className="hdri-selector">
        {HDRI_OPTIONS.map(({ key, label, mood, icon }) => (
          <button
            key={key}
            className={`hdri-card hdri-card-${key} ${activeHDRI === key ? 'active' : ''}`}
            onClick={() => { void engine.setHDRI(key) }}
            onMouseMove={(e) => setParallaxVars(e.currentTarget, e.clientX, e.clientY)}
            onMouseLeave={(e) => resetParallaxVars(e.currentTarget)}
            onBlur={(e) => resetParallaxVars(e.currentTarget)}
          >
            <HDRIPreview path={HDRI_PATHS[key]} />
            <span className="hdri-card-fade" aria-hidden />
            <span className="material-symbols-rounded hdri-card-icon" aria-hidden>{icon}</span>
            <span className="hdri-card-label">{label}</span>
            <span className="hdri-card-mood">{mood}</span>
          </button>
        ))}
      </div>

      {/* Exposure */}
      <label className="slider-label">
        <span>Exposure</span>
        <span className="slider-value">{exposure.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min="0.1"
        max="3"
        step="0.05"
        value={exposure}
        onChange={(e) => engine.setExposure(parseFloat(e.target.value))}
        className="slider"
        {...rangeHistoryProps}
      />

      {/* Auto-Rotate */}
      <div className="toggle-row">
        <label className="slider-label"><span>Auto Rotate</span></label>
        <button
          className={`toggle-btn ${autoRotate ? 'active' : ''}`}
          onClick={() => engine.setAutoRotate(!autoRotate)}
        >
          {autoRotate ? 'ON' : 'OFF'}
        </button>
      </div>

      {autoRotate && (
        <>
          <label className="slider-label">
            <span>Rotate Speed</span>
            <span className="slider-value">{autoRotateSpeed.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value={autoRotateSpeed}
            onChange={(e) => engine.setAutoRotateSpeed(parseFloat(e.target.value))}
            className="slider"
            {...rangeHistoryProps}
          />
        </>
      )}
    </div>
  )
}

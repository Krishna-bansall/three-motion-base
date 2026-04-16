/**
 * Step 1: ThreeRenderer
 * 
 * Canvas, camera, scene, HDRI environment loading, and render loop.
 * Steps 2, 5, 6 are integrated via composition.
 */
import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { PostProcessing } from './PostProcessing'
import { TurntableController } from './TurntableController'
import { runSyncSystems } from '../ecs/systems'
import { world } from '../ecs/world'

export type HDRIPreset = 'studio' | 'moody' | 'daylight'
export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'

/** Bundled HDRI paths (relative to /public) */
const HDRI_PATHS: Record<HDRIPreset, string> = {
  studio: '/hdri/studio.hdr',
  moody: '/hdri/moody.hdr',
  daylight: '/hdri/daylight.hdr',
}

export class ThreeRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly postProcessing: PostProcessing
  readonly clock = new THREE.Clock()

  /** The root group that the TurntableController rotates */
  readonly productRoot = new THREE.Group()
  readonly transformControls: TransformControls
  readonly transformControlsHelper: THREE.Object3D

  turntable: TurntableController | null = null
  onProductTransformChange: (() => void) | null = null
  onTransformInteractionStart: (() => void) | null = null
  onTransformInteractionEnd: (() => void) | null = null
  private container: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private animationFrameId = 0
  private pmremGenerator: THREE.PMREMGenerator
  private activeHDRI: HDRIPreset = 'studio'
  private transformMode: TransformGizmoMode | null = null

  constructor() {
    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // needed for PNG export
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // ── Scene ──
    this.scene = new THREE.Scene()
    this.scene.add(this.productRoot)

    // ── Camera ──
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.camera.position.set(0, 0.5, 3)
    this.camera.lookAt(0, 0, 0)

    // ── Transform Controls ──
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement)
    this.transformControls.attach(this.productRoot)
    this.transformControls.enabled = false
    this.transformControls.setSpace('local')
    this.transformControlsHelper = this.transformControls.getHelper()
    this.transformControlsHelper.visible = false
    this.transformControls.addEventListener('objectChange', () => {
      this.onProductTransformChange?.()
    })
    this.transformControls.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean((event as { value?: boolean }).value)
      if (isDragging) {
        this.onTransformInteractionStart?.()
      } else {
        this.onTransformInteractionEnd?.()
      }
      if (this.turntable) {
        this.turntable.enabled = !isDragging && this.transformMode === null
      }
    })
    this.scene.add(this.transformControlsHelper)

    // ── PMREMGenerator ──
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer)
    this.pmremGenerator.compileEquirectangularShader()

    // ── Post-processing ──
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera)
  }

  // ── Lifecycle ───────────────────────────────────────────────

  mount(container: HTMLElement): void {
    this.container = container
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cursor = 'grab'

    // Turntable controller on the product root
    this.turntable = new TurntableController(this.productRoot, this.renderer.domElement)
    this.syncTurntableState()

    // Initial size
    this.resize()

    // Watch for container resize
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    // Start render loop
    this.clock.start()
    this.loop()

    // Load default HDRI
    this.loadHDRI('studio')
  }

  unmount(): void {
    cancelAnimationFrame(this.animationFrameId)
    this.resizeObserver?.disconnect()
    this.turntable?.dispose()
    this.transformControls.detach()
    this.transformControls.dispose()
    this.renderer.domElement.remove()
    this.renderer.dispose()
    this.postProcessing.dispose()
    this.pmremGenerator.dispose()
    this.container = null
  }

  private resize(): void {
    if (!this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return

    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.postProcessing.setSize(w, h)
  }

  // ── Render Loop ─────────────────────────────────────────────

  private loop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.loop)
    const delta = this.clock.getDelta()

    // Sync ECS → Three.js
    runSyncSystems(world)

    // Update turntable
    this.turntable?.update(delta)

    // Render with post-processing
    this.postProcessing.render()
  }

  // ── HDRI Loading ────────────────────────────────────────────

  async loadHDRI(preset: HDRIPreset): Promise<void> {
    this.activeHDRI = preset
    const path = HDRI_PATHS[preset]

    return new Promise<void>((resolve, reject) => {
      new RGBELoader().load(
        path,
        (texture) => {
          const envMap = this.pmremGenerator.fromEquirectangular(texture).texture
          this.scene.environment = envMap
          this.scene.background = envMap
          this.scene.backgroundBlurriness = 0.5
          this.scene.backgroundIntensity = 0.8
          texture.dispose()
          resolve()
        },
        undefined,
        (err) => reject(err),
      )
    })
  }

  getActiveHDRI(): HDRIPreset {
    return this.activeHDRI
  }

  // ── Exposure ────────────────────────────────────────────────

  setExposure(value: number): void {
    this.renderer.toneMappingExposure = value
  }

  getExposure(): number {
    return this.renderer.toneMappingExposure
  }

  setTransformMode(mode: TransformGizmoMode | null): void {
    this.transformMode = mode
    this.transformControls.enabled = mode !== null
    this.transformControlsHelper.visible = mode !== null

    if (mode) {
      this.transformControls.setMode(mode)
    }

    this.syncTurntableState()
  }

  getTransformMode(): TransformGizmoMode | null {
    return this.transformMode
  }

  private syncTurntableState(): void {
    if (!this.turntable) return
    this.turntable.enabled = this.transformMode === null
    this.renderer.domElement.style.cursor = this.transformMode === null ? 'grab' : 'default'
  }
}

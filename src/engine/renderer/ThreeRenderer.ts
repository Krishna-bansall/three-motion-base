/** Low-level Three.js runtime: scene setup, controls, render loop, and HDRI. */
import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { PostProcessing } from './PostProcessing'
import { TurntableController } from './TurntableController'
import { HDRI_PATHS } from '../runtime/environment'
import type { HDRIPreset, TransformGizmoMode } from '../runtime/types'

export class ThreeRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly postProcessing: PostProcessing
  readonly timer = new THREE.Timer()

  /** Root transform manipulated by both the turntable and transform gizmo. */
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
  private hdrLoader = new HDRLoader()
  private activeHDRI: HDRIPreset = 'studio'
  private transformMode: TransformGizmoMode | null = null
  private activeEnvironmentMap: THREE.Texture | null = null
  private hdriLoadToken = 0

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene = new THREE.Scene()
    this.scene.add(this.productRoot)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.camera.position.set(0, 0.5, 3)
    this.camera.lookAt(0, 0, 0)

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

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer)
    this.pmremGenerator.compileEquirectangularShader()

    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera)
  }

  mount(container: HTMLElement): void {
    this.container = container
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cursor = 'grab'

    this.turntable = new TurntableController(this.productRoot, this.renderer.domElement)
    this.syncTurntableState()
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.timer.reset()
    this.loop()
    void this.loadHDRI('studio')
  }

  unmount(): void {
    cancelAnimationFrame(this.animationFrameId)
    this.resizeObserver?.disconnect()
    this.turntable?.dispose()
    this.transformControls.detach()
    this.transformControls.dispose()
    this.disposeEnvironmentMap()
    this.scene.environment = null
    this.scene.background = null
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

  private loop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.loop)
    this.timer.update()
    const delta = this.timer.getDelta()
    const elapsed = this.timer.getElapsed()

    this.turntable?.update(delta)
    this.postProcessing.render(elapsed)
  }

  async loadHDRI(preset: HDRIPreset): Promise<void> {
    this.activeHDRI = preset
    const path = HDRI_PATHS[preset]
    const loadToken = ++this.hdriLoadToken

    return new Promise<void>((resolve, reject) => {
      this.hdrLoader.load(
        path,
        (texture) => {
          const envMap = this.pmremGenerator.fromEquirectangular(texture).texture
          texture.dispose()

          if (loadToken !== this.hdriLoadToken) {
            envMap.dispose()
            resolve()
            return
          }

          this.disposeEnvironmentMap()
          this.activeEnvironmentMap = envMap
          this.scene.environment = envMap
          this.scene.background = envMap
          this.scene.backgroundBlurriness = 0.5
          this.scene.backgroundIntensity = 0.8
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

  private disposeEnvironmentMap(): void {
    this.activeEnvironmentMap?.dispose()
    this.activeEnvironmentMap = null
  }
}

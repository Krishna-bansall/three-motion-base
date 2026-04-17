/**
 * Step 7: Engine API
 *
 * The ONLY public surface that React calls.
 * Orchestrates renderer, ECS, asset loading, and store updates.
 */
import { addComponent } from 'bitecs'
import { ThreeRenderer, type HDRIPreset, type TransformGizmoMode } from './renderer/ThreeRenderer'
import type { BloomSettings, CinematicSettings } from './renderer/PostProcessing'
import { loadGLTFFromURL, loadGLTFFromFile, loadGLTFFromFiles, type LoadedModel } from './assets/loadGLTF'
import { exportPNG } from './renderer/exportPNG'
import { world } from './ecs/world'
import {
  Transform,
  Material,
  DirtyTransform,
  DirtyMaterial,
  eidToObject3D,
  eidToMaterial,
} from './ecs/components'
import { useEngineStore, type EntityInfo } from '../store/useEngineStore'

interface TransformSnapshot {
  px: number
  py: number
  pz: number
  rx: number
  ry: number
  rz: number
  sx: number
  sy: number
  sz: number
}

interface MaterialSnapshot {
  eid: number
  roughness: number
  metalness: number
  envMapIntensity: number
  r: number
  g: number
  b: number
}

interface EngineSnapshot {
  rootTransform: TransformSnapshot | null
  materials: MaterialSnapshot[]
  activeHDRI: HDRIPreset
  exposure: number
  bloom: BloomSettings
  cinematic: CinematicSettings
  autoRotate: boolean
  autoRotateSpeed: number
}

export interface ECSStateGraph {
  history: {
    canUndo: boolean
    canRedo: boolean
    undoDepth: number
    redoDepth: number
    currentIndex: number
    totalStates: number
  }
  scene: {
    hasModel: boolean
    isLoading: boolean
    activeHDRI: HDRIPreset
    exposure: number
    bloom: BloomSettings
    cinematic: CinematicSettings
    autoRotate: boolean
    autoRotateSpeed: number
    transformMode: TransformGizmoMode | null
  }
  root: {
    eid: number
    name: string
    transform: TransformSnapshot
  } | null
  meshes: Array<{
    eid: number
    name: string
    transform: TransformSnapshot
    material: Omit<MaterialSnapshot, 'eid'>
  }>
}

export interface ThreeMotionConsoleAPI {
  help: () => string[]
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  state: () => object
  scene: () => object
  ecs: () => ECSStateGraph
  printState: () => object
  printEcsGraph: () => ECSStateGraph
  setTransformMode: (mode: TransformGizmoMode | null) => void
}

declare global {
  interface Window {
    threeMotion?: ThreeMotionConsoleAPI
  }
}

const HISTORY_LIMIT = 100

export class EngineAPI {
  private threeRenderer: ThreeRenderer | null = null
  private currentModel: LoadedModel | null = null
  private history: EngineSnapshot[] = []
  private historyIndex = -1
  private pendingTransformSnapshot: EngineSnapshot | null = null
  private isApplyingHistory = false
  private historyBatchDepth = 0
  private historyBatchStart: EngineSnapshot | null = null

  // ── Lifecycle ───────────────────────────────────────────

  init(container: HTMLElement): void {
    this.threeRenderer = new ThreeRenderer()
    this.threeRenderer.mount(container)
    this.threeRenderer.onProductTransformChange = () => this.syncProductRootTransform()
    this.threeRenderer.onTransformInteractionStart = () => this.beginTransformHistory()
    this.threeRenderer.onTransformInteractionEnd = () => this.commitTransformHistory()
    this.publishHistoryState()
  }

  dispose(): void {
    if (this.threeRenderer) {
      this.threeRenderer.onProductTransformChange = null
      this.threeRenderer.onTransformInteractionStart = null
      this.threeRenderer.onTransformInteractionEnd = null
    }
    this.threeRenderer?.unmount()
    this.threeRenderer = null
  }

  // ── Model Loading ───────────────────────────────────────

  async loadModel(url: string): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      this.clearModel()

      const model = await loadGLTFFromURL(url)
      this.currentModel = model
      this.threeRenderer.productRoot.add(model.group)

      store.setHasModel(true)
      this.syncEntitiesToStore()
      this.initializeHistory()
    } finally {
      store.setLoading(false)
    }
  }

  async loadModelFromFile(file: File): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      this.clearModel()

      const model = await loadGLTFFromFile(file)
      this.currentModel = model
      this.threeRenderer.productRoot.add(model.group)

      store.setHasModel(true)
      this.syncEntitiesToStore()
      this.initializeHistory()
    } finally {
      store.setLoading(false)
    }
  }

  async loadModelFromFiles(files: File[]): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      this.clearModel()

      const model = await loadGLTFFromFiles(files)
      this.currentModel = model
      this.threeRenderer.productRoot.add(model.group)

      store.setHasModel(true)
      this.syncEntitiesToStore()
      this.initializeHistory()
    } finally {
      store.setLoading(false)
    }
  }

  private clearModel(): void {
    if (this.currentModel && this.threeRenderer) {
      this.threeRenderer.productRoot.remove(this.currentModel.group)

      eidToObject3D.delete(this.currentModel.rootEid)
      for (const eid of this.currentModel.meshEids) {
        eidToObject3D.delete(eid)
        eidToMaterial.delete(eid)
      }
    }

    this.currentModel = null
    this.pendingTransformSnapshot = null
    this.historyBatchDepth = 0
    this.historyBatchStart = null

    const store = useEngineStore.getState()
    store.setHasModel(false)
    store.setEntities([])
    this.resetHistory()
  }

  // ── Transform ───────────────────────────────────────────

  setTransform(
    eid: number,
    t: Partial<{
      px: number; py: number; pz: number
      rx: number; ry: number; rz: number
      sx: number; sy: number; sz: number
    }>,
  ): void {
    if (!this.hasTransformChange(eid, t)) return

    if (t.px !== undefined) Transform.px[eid] = t.px
    if (t.py !== undefined) Transform.py[eid] = t.py
    if (t.pz !== undefined) Transform.pz[eid] = t.pz
    if (t.rx !== undefined) Transform.rx[eid] = t.rx
    if (t.ry !== undefined) Transform.ry[eid] = t.ry
    if (t.rz !== undefined) Transform.rz[eid] = t.rz
    if (t.sx !== undefined) Transform.sx[eid] = t.sx
    if (t.sy !== undefined) Transform.sy[eid] = t.sy
    if (t.sz !== undefined) Transform.sz[eid] = t.sz

    addComponent(world, eid, DirtyTransform)
    this.syncEntitiesToStore()
    this.commitCurrentSnapshot()
  }

  // ── Material ────────────────────────────────────────────

  setMaterial(
    eid: number,
    m: Partial<{
      roughness: number
      metalness: number
      envMapIntensity: number
      r: number
      g: number
      b: number
    }>,
  ): void {
    if (!this.hasMaterialChange(eid, m)) return

    if (m.roughness !== undefined) Material.roughness[eid] = m.roughness
    if (m.metalness !== undefined) Material.metalness[eid] = m.metalness
    if (m.envMapIntensity !== undefined) Material.envMapIntensity[eid] = m.envMapIntensity
    if (m.r !== undefined) Material.r[eid] = m.r
    if (m.g !== undefined) Material.g[eid] = m.g
    if (m.b !== undefined) Material.b[eid] = m.b

    addComponent(world, eid, DirtyMaterial)
    this.syncEntitiesToStore()
    this.commitCurrentSnapshot()
  }

  // ── HDRI ────────────────────────────────────────────────

  async setHDRI(preset: HDRIPreset): Promise<void> {
    if (!this.threeRenderer || this.threeRenderer.getActiveHDRI() === preset) return

    await this.threeRenderer.loadHDRI(preset)
    useEngineStore.getState().setActiveHDRI(preset)
    this.commitCurrentSnapshot()
  }

  // ── Exposure ────────────────────────────────────────────

  setExposure(value: number): void {
    const currentExposure = this.threeRenderer?.getExposure() ?? useEngineStore.getState().exposure
    if (currentExposure === value) return

    this.threeRenderer?.setExposure(value)
    useEngineStore.getState().setExposure(value)
    this.commitCurrentSnapshot()
  }

  // ── Bloom ───────────────────────────────────────────────

  setBloom(strength: number, radius: number, threshold: number): void {
    const bloom = useEngineStore.getState().bloom
    if (
      bloom.strength === strength
      && bloom.radius === radius
      && bloom.threshold === threshold
    ) {
      return
    }

    this.threeRenderer?.postProcessing.setBloom(strength, radius, threshold)
    useEngineStore.getState().setBloom({ strength, radius, threshold })
    this.commitCurrentSnapshot()
  }

  // ── Auto-rotate ─────────────────────────────────────────

  setAutoRotate(enabled: boolean): void {
    if (useEngineStore.getState().autoRotate === enabled) return

    if (this.threeRenderer?.turntable) {
      this.threeRenderer.turntable.autoRotate = enabled
    }
    useEngineStore.getState().setAutoRotate(enabled)
    this.commitCurrentSnapshot()
  }

  setAutoRotateSpeed(speed: number): void {
    if (useEngineStore.getState().autoRotateSpeed === speed) return

    if (this.threeRenderer?.turntable) {
      this.threeRenderer.turntable.autoRotateSpeed = speed
    }
    useEngineStore.getState().setAutoRotateSpeed(speed)
    this.commitCurrentSnapshot()
  }

  beginHistoryBatch(): void {
    if (this.isApplyingHistory) return

    if (this.historyBatchDepth === 0) {
      this.historyBatchStart = this.captureSnapshot()
    }

    this.historyBatchDepth += 1
  }

  endHistoryBatch(): void {
    if (this.isApplyingHistory || this.historyBatchDepth === 0) return

    this.historyBatchDepth -= 1

    if (this.historyBatchDepth > 0) return

    const before = this.historyBatchStart
    const after = this.captureSnapshot()
    this.historyBatchStart = null

    if (!before || !after || this.areSnapshotsEqual(before, after)) {
      this.publishHistoryState()
      return
    }

    this.pushHistorySnapshot(after)
  }

  runHistoryBatch(action: () => void): void {
    this.beginHistoryBatch()
    try {
      action()
    } finally {
      this.endHistoryBatch()
    }
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo()) {
      this.publishHistoryState()
      return false
    }

    const targetIndex = this.historyIndex - 1
    const snapshot = this.history[targetIndex]
    if (!snapshot) {
      this.publishHistoryState()
      return false
    }

    await this.applySnapshot(snapshot)
    this.historyIndex = targetIndex
    this.publishHistoryState()
    return true
  }

  async redo(): Promise<boolean> {
    if (!this.canRedo()) {
      this.publishHistoryState()
      return false
    }

    const targetIndex = this.historyIndex + 1
    const snapshot = this.history[targetIndex]
    if (!snapshot) {
      this.publishHistoryState()
      return false
    }

    await this.applySnapshot(snapshot)
    this.historyIndex = targetIndex
    this.publishHistoryState()
    return true
  }

  setTransformGizmoMode(mode: TransformGizmoMode | null): void {
    this.threeRenderer?.setTransformMode(mode)
  }

  getTransformGizmoMode(): TransformGizmoMode | null {
    return this.threeRenderer?.getTransformMode() ?? null
  }

  // ── Cinematic / Filters ─────────────────────────────────

  setVignette(intensity: number): void {
    if (useEngineStore.getState().cinematic.vignette === intensity) return

    this.threeRenderer?.postProcessing.setVignette(intensity, 0.9)
    this.syncCinematicToStore()
    this.commitCurrentSnapshot()
  }

  setVignetteEnabled(enabled: boolean): void {
    if (useEngineStore.getState().cinematic.vignetteEnabled === enabled) return

    this.threeRenderer?.postProcessing.setVignetteEnabled(enabled)
    this.syncCinematicToStore()
    this.commitCurrentSnapshot()
  }

  setChromaticAberration(strength: number): void {
    if (useEngineStore.getState().cinematic.chromaticAberration === strength) return

    this.threeRenderer?.postProcessing.setChromaticAberration(strength)
    this.syncCinematicToStore()
    this.commitCurrentSnapshot()
  }

  setFilmGrain(intensity: number): void {
    if (useEngineStore.getState().cinematic.filmGrain === intensity) return

    this.threeRenderer?.postProcessing.setFilmGrain(intensity)
    this.syncCinematicToStore()
    this.commitCurrentSnapshot()
  }

  setColorTemperature(temperature: number): void {
    if (useEngineStore.getState().cinematic.colorTemperature === temperature) return

    this.threeRenderer?.postProcessing.setColorTemperature(temperature)
    this.syncCinematicToStore()
    this.commitCurrentSnapshot()
  }

  private syncCinematicToStore(): void {
    if (!this.threeRenderer) return
    const cinematic = this.threeRenderer.postProcessing.getCinematic()
    useEngineStore.getState().setCinematic(cinematic)
  }

  // ── Export ──────────────────────────────────────────────

  async exportPNG(scale: number = 3): Promise<Blob> {
    if (!this.threeRenderer) throw new Error('Engine not initialized')
    return exportPNG(this.threeRenderer.renderer, this.threeRenderer.postProcessing, scale)
  }

  // ── Scene snapshot / Console API ────────────────────────

  getSceneSnapshot(): object {
    const state = useEngineStore.getState()
    return {
      entities: state.entities,
      activeHDRI: state.activeHDRI,
      exposure: state.exposure,
      bloom: state.bloom,
      cinematic: state.cinematic,
      autoRotate: state.autoRotate,
      autoRotateSpeed: state.autoRotateSpeed,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      transformMode: this.getTransformGizmoMode(),
    }
  }

  getConsoleAPI(): ThreeMotionConsoleAPI {
    return {
      help: () => [
        'window.threeMotion.undo()',
        'window.threeMotion.redo()',
        'window.threeMotion.state()',
        'window.threeMotion.scene()',
        'window.threeMotion.ecs()',
        'window.threeMotion.printState()',
        'window.threeMotion.printEcsGraph()',
        "window.threeMotion.setTransformMode('translate' | 'rotate' | 'scale' | null)",
      ],
      undo: () => this.undo(),
      redo: () => this.redo(),
      state: () => this.getConsoleState(),
      scene: () => this.getSceneSnapshot(),
      ecs: () => this.getEcsStateGraph(),
      printState: () => {
        const state = this.getConsoleState()
        console.dir(state, { depth: null })
        return state
      },
      printEcsGraph: () => {
        const graph = this.getEcsStateGraph()
        console.dir(graph, { depth: null })
        return graph
      },
      setTransformMode: (mode) => this.setTransformGizmoMode(mode),
    }
  }

  getEcsStateGraph(): ECSStateGraph {
    const state = useEngineStore.getState()
    const root = this.currentModel
      ? {
          eid: this.currentModel.rootEid,
          name: 'ProductRoot',
          transform: this.captureTransform(this.currentModel.rootEid),
        }
      : null

    const meshes = this.currentModel
      ? this.currentModel.meshEids.map((eid, index) => {
          const obj = eidToObject3D.get(eid)
          const material = this.captureMaterial(eid)
          return {
            eid,
            name: obj?.name || `Mesh ${index + 1}`,
            transform: this.captureTransform(eid),
            material: {
              roughness: material.roughness,
              metalness: material.metalness,
              envMapIntensity: material.envMapIntensity,
              r: material.r,
              g: material.g,
              b: material.b,
            },
          }
        })
      : []

    return {
      history: {
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        undoDepth: this.getUndoDepth(),
        redoDepth: this.getRedoDepth(),
        currentIndex: this.historyIndex,
        totalStates: this.history.length,
      },
      scene: {
        hasModel: state.hasModel,
        isLoading: state.isLoading,
        activeHDRI: state.activeHDRI,
        exposure: state.exposure,
        bloom: { ...state.bloom },
        cinematic: { ...state.cinematic },
        autoRotate: state.autoRotate,
        autoRotateSpeed: state.autoRotateSpeed,
        transformMode: this.getTransformGizmoMode(),
      },
      root,
      meshes,
    }
  }

  // ── Internal ────────────────────────────────────────────

  private syncEntitiesToStore(): void {
    if (!this.currentModel) {
      useEngineStore.getState().setEntities([])
      return
    }

    const entities: EntityInfo[] = this.currentModel.meshEids.map((eid, i) => {
      const obj = eidToObject3D.get(eid)
      return {
        eid,
        name: obj?.name || `Mesh ${i + 1}`,
        roughness: Material.roughness[eid],
        metalness: Material.metalness[eid],
        envMapIntensity: Material.envMapIntensity[eid],
        r: Material.r[eid],
        g: Material.g[eid],
        b: Material.b[eid],
      }
    })

    useEngineStore.getState().setEntities(entities)
  }

  private syncProductRootTransform(): void {
    if (!this.currentModel || !this.threeRenderer) return

    const eid = this.currentModel.rootEid
    const { position, rotation, scale } = this.threeRenderer.productRoot

    Transform.px[eid] = position.x
    Transform.py[eid] = position.y
    Transform.pz[eid] = position.z
    Transform.rx[eid] = rotation.x
    Transform.ry[eid] = rotation.y
    Transform.rz[eid] = rotation.z
    Transform.sx[eid] = scale.x
    Transform.sy[eid] = scale.y
    Transform.sz[eid] = scale.z
  }

  private beginTransformHistory(): void {
    if (this.isApplyingHistory || !this.currentModel) return
    this.pendingTransformSnapshot = this.captureSnapshot()
  }

  private commitTransformHistory(): void {
    if (this.isApplyingHistory || !this.pendingTransformSnapshot) return

    const before = this.pendingTransformSnapshot
    const after = this.captureSnapshot()
    this.pendingTransformSnapshot = null

    if (!after || this.areSnapshotsEqual(before, after)) return

    this.pushHistorySnapshot(after)
  }

  private initializeHistory(): void {
    const snapshot = this.captureSnapshot()
    if (!snapshot) {
      this.resetHistory()
      return
    }

    this.history = [snapshot]
    this.historyIndex = 0
    this.pendingTransformSnapshot = null
    this.historyBatchDepth = 0
    this.historyBatchStart = null
    this.publishHistoryState()
  }

  private commitCurrentSnapshot(): void {
    if (this.isApplyingHistory) return
    if (this.historyBatchDepth > 0) return

    const snapshot = this.captureSnapshot()
    if (!snapshot) return

    this.pushHistorySnapshot(snapshot)
  }

  private pushHistorySnapshot(snapshot: EngineSnapshot): void {
    const current = this.getCurrentHistorySnapshot()
    if (current && this.areSnapshotsEqual(current, snapshot)) return

    let nextHistory = this.history.slice(0, this.historyIndex + 1)
    nextHistory.push(snapshot)

    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT)
    }

    this.history = nextHistory
    this.historyIndex = this.history.length - 1
    this.publishHistoryState()
  }

  private resetHistory(): void {
    this.history = []
    this.historyIndex = -1
    this.pendingTransformSnapshot = null
    this.historyBatchDepth = 0
    this.historyBatchStart = null
    this.publishHistoryState()
  }

  private publishHistoryState(): void {
    useEngineStore.getState().setHistoryAvailability({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    })
  }

  private captureSnapshot(): EngineSnapshot | null {
    if (!this.threeRenderer) return null

    const state = useEngineStore.getState()
    return {
      rootTransform: this.currentModel ? this.captureTransform(this.currentModel.rootEid) : null,
      materials: this.currentModel
        ? this.currentModel.meshEids.map((eid) => this.captureMaterial(eid))
        : [],
      activeHDRI: state.activeHDRI,
      exposure: state.exposure,
      bloom: { ...state.bloom },
      cinematic: { ...state.cinematic },
      autoRotate: state.autoRotate,
      autoRotateSpeed: state.autoRotateSpeed,
    }
  }

  private async applySnapshot(snapshot: EngineSnapshot): Promise<void> {
    const store = useEngineStore.getState()

    this.isApplyingHistory = true
    try {
      if (this.currentModel && snapshot.rootTransform) {
        this.applyTransformSnapshot(this.currentModel.rootEid, snapshot.rootTransform)
      }

      for (const material of snapshot.materials) {
        this.applyMaterialSnapshot(material.eid, material)
      }

      if (this.threeRenderer) {
        if (this.threeRenderer.getActiveHDRI() !== snapshot.activeHDRI) {
          await this.threeRenderer.loadHDRI(snapshot.activeHDRI)
        }

        this.threeRenderer.setExposure(snapshot.exposure)
        this.threeRenderer.postProcessing.setBloom(
          snapshot.bloom.strength,
          snapshot.bloom.radius,
          snapshot.bloom.threshold,
        )
        this.threeRenderer.postProcessing.setVignetteEnabled(snapshot.cinematic.vignetteEnabled)
        this.threeRenderer.postProcessing.setVignette(snapshot.cinematic.vignette, 0.9)
        this.threeRenderer.postProcessing.setChromaticAberration(snapshot.cinematic.chromaticAberration)
        this.threeRenderer.postProcessing.setFilmGrain(snapshot.cinematic.filmGrain)
        this.threeRenderer.postProcessing.setColorTemperature(snapshot.cinematic.colorTemperature)

        if (this.threeRenderer.turntable) {
          this.threeRenderer.turntable.autoRotate = snapshot.autoRotate
          this.threeRenderer.turntable.autoRotateSpeed = snapshot.autoRotateSpeed
        }
      }

      store.setActiveHDRI(snapshot.activeHDRI)
      store.setExposure(snapshot.exposure)
      store.setBloom({ ...snapshot.bloom })
      store.setCinematic({ ...snapshot.cinematic })
      store.setAutoRotate(snapshot.autoRotate)
      store.setAutoRotateSpeed(snapshot.autoRotateSpeed)
      this.syncEntitiesToStore()
    } finally {
      this.isApplyingHistory = false
    }
  }

  private applyTransformSnapshot(eid: number, transform: TransformSnapshot): void {
    Transform.px[eid] = transform.px
    Transform.py[eid] = transform.py
    Transform.pz[eid] = transform.pz
    Transform.rx[eid] = transform.rx
    Transform.ry[eid] = transform.ry
    Transform.rz[eid] = transform.rz
    Transform.sx[eid] = transform.sx
    Transform.sy[eid] = transform.sy
    Transform.sz[eid] = transform.sz
    addComponent(world, eid, DirtyTransform)
  }

  private applyMaterialSnapshot(eid: number, material: MaterialSnapshot): void {
    Material.roughness[eid] = material.roughness
    Material.metalness[eid] = material.metalness
    Material.envMapIntensity[eid] = material.envMapIntensity
    Material.r[eid] = material.r
    Material.g[eid] = material.g
    Material.b[eid] = material.b
    addComponent(world, eid, DirtyMaterial)
  }

  private captureTransform(eid: number): TransformSnapshot {
    return {
      px: Transform.px[eid],
      py: Transform.py[eid],
      pz: Transform.pz[eid],
      rx: Transform.rx[eid],
      ry: Transform.ry[eid],
      rz: Transform.rz[eid],
      sx: Transform.sx[eid],
      sy: Transform.sy[eid],
      sz: Transform.sz[eid],
    }
  }

  private captureMaterial(eid: number): MaterialSnapshot {
    return {
      eid,
      roughness: Material.roughness[eid],
      metalness: Material.metalness[eid],
      envMapIntensity: Material.envMapIntensity[eid],
      r: Material.r[eid],
      g: Material.g[eid],
      b: Material.b[eid],
    }
  }

  private hasTransformChange(
    eid: number,
    transform: Partial<TransformSnapshot>,
  ): boolean {
    return (
      (transform.px !== undefined && Transform.px[eid] !== transform.px)
      || (transform.py !== undefined && Transform.py[eid] !== transform.py)
      || (transform.pz !== undefined && Transform.pz[eid] !== transform.pz)
      || (transform.rx !== undefined && Transform.rx[eid] !== transform.rx)
      || (transform.ry !== undefined && Transform.ry[eid] !== transform.ry)
      || (transform.rz !== undefined && Transform.rz[eid] !== transform.rz)
      || (transform.sx !== undefined && Transform.sx[eid] !== transform.sx)
      || (transform.sy !== undefined && Transform.sy[eid] !== transform.sy)
      || (transform.sz !== undefined && Transform.sz[eid] !== transform.sz)
    )
  }

  private hasMaterialChange(
    eid: number,
    material: Partial<Omit<MaterialSnapshot, 'eid'>>,
  ): boolean {
    return (
      (material.roughness !== undefined && Material.roughness[eid] !== material.roughness)
      || (material.metalness !== undefined && Material.metalness[eid] !== material.metalness)
      || (
        material.envMapIntensity !== undefined
        && Material.envMapIntensity[eid] !== material.envMapIntensity
      )
      || (material.r !== undefined && Material.r[eid] !== material.r)
      || (material.g !== undefined && Material.g[eid] !== material.g)
      || (material.b !== undefined && Material.b[eid] !== material.b)
    )
  }

  private areSnapshotsEqual(a: EngineSnapshot, b: EngineSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private getCurrentHistorySnapshot(): EngineSnapshot | null {
    return this.history[this.historyIndex] ?? null
  }

  private canUndo(): boolean {
    return this.historyIndex > 0
  }

  private canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1
  }

  private getUndoDepth(): number {
    return Math.max(this.historyIndex, 0)
  }

  private getRedoDepth(): number {
    if (this.historyIndex < 0) return 0
    return Math.max(this.history.length - this.historyIndex - 1, 0)
  }

  private getConsoleState(): object {
    const state = useEngineStore.getState()
    return {
      isLoading: state.isLoading,
      hasModel: state.hasModel,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      history: {
        undoDepth: this.getUndoDepth(),
        redoDepth: this.getRedoDepth(),
        currentIndex: this.historyIndex,
        totalStates: this.history.length,
      },
      transformMode: this.getTransformGizmoMode(),
      entities: state.entities,
      activeHDRI: state.activeHDRI,
      exposure: state.exposure,
      bloom: state.bloom,
      cinematic: state.cinematic,
      autoRotate: state.autoRotate,
      autoRotateSpeed: state.autoRotateSpeed,
    }
  }
}

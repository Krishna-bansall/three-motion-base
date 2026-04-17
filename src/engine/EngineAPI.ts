/**
 * Engine API
 *
 * Public surface React uses to load models, mutate canonical scene data,
 * and control the runtime adapter.
 */
import { loadGLTFFromFile, loadGLTFFromFiles, loadGLTFFromURL, type LoadedModel } from './assets/loadGLTF'
import { patchMaterial, setNodeTRS } from './scene/mutations'
import { cloneSceneDoc, createEmptySceneDoc } from './scene/snapshot'
import { diffSceneDocs, isSceneDeltaEmpty } from './scene/diff'
import type { NodeId, Quat, SceneDoc } from './scene/types'
import type {
  EnvironmentPreview,
  HDRIPreset,
  TransformGizmoMode,
  TRS,
} from './runtime/types'
import type { RuntimeAdapter } from './runtime/RuntimeAdapter'
import { ThreeAdapter } from './runtime/three/ThreeAdapter'
import { convertCanonicalToBackendSchema } from './runtime/conversion/canonicalToBackend'
import { EngineHistory, type EngineSnapshot } from './history/EngineHistory'
import {
  buildConsoleState,
  buildRuntimeStateGraph,
  buildSceneSnapshot,
  publishEntities,
  publishHasModel,
  publishHistoryAvailability,
  publishLoading,
  publishViewSettings,
  readViewSettingsFromStore,
  type RuntimeStateGraph,
} from './store/engineStateBridge'

export interface ThreeMotionConsoleAPI {
  help: () => string[]
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  state: () => object
  scene: () => object
  canonical: () => SceneDoc | null
  ecs: () => RuntimeStateGraph
  printState: () => object
  printCanonical: () => SceneDoc | null
  printEcsGraph: () => RuntimeStateGraph
  setTransformMode: (mode: TransformGizmoMode | null) => void
}

declare global {
  interface Window {
    threeMotion?: ThreeMotionConsoleAPI
  }
}
export class EngineAPI {
  private readonly runtime: RuntimeAdapter
  private currentScene: SceneDoc | null = null
  private currentAssets: LoadedModel['runtimeAssets'] | null = null
  private readonly history = new EngineHistory()

  constructor(runtime: RuntimeAdapter = new ThreeAdapter()) {
    this.runtime = runtime
  }

  init(container: HTMLElement): void {
    this.runtime.mount(container)
    this.runtime.onRuntimeTransformChanged((nodeId, trs) => this.syncRuntimeTransform(nodeId, trs))
    this.runtime.onTransformInteractionStart(() => this.beginTransformHistory())
    this.runtime.onTransformInteractionEnd(() => this.commitTransformHistory())
    void this.runtime.setViewSettings(readViewSettingsFromStore())
    this.publishHistoryState()
  }

  dispose(): void {
    this.runtime.onRuntimeTransformChanged(null)
    this.runtime.onTransformInteractionStart(null)
    this.runtime.onTransformInteractionEnd(null)
    this.runtime.unmount()
  }

  async loadModel(url: string): Promise<void> {
    await this.loadLoadedModel(() => loadGLTFFromURL(url))
  }

  async loadModelFromFile(file: File): Promise<void> {
    await this.loadLoadedModel(() => loadGLTFFromFile(file))
  }

  async loadModelFromFiles(files: File[]): Promise<void> {
    await this.loadLoadedModel(() => loadGLTFFromFiles(files))
  }

  async setHDRI(preset: HDRIPreset): Promise<void> {
    const next = readViewSettingsFromStore()
    if (next.activeHDRI === preset) return

    next.activeHDRI = preset
    await this.runtime.setViewSettings(next)
    publishViewSettings(next)
    this.commitCurrentSnapshot()
  }

  setExposure(value: number): void {
    this.updateViewSettings((next) => {
      next.exposure = value
    })
  }

  setBloom(strength: number, radius: number, threshold: number): void {
    this.updateViewSettings((next) => {
      next.bloom = { strength, radius, threshold }
    })
  }

  setAutoRotate(enabled: boolean): void {
    this.updateViewSettings((next) => {
      next.autoRotate = enabled
    })
  }

  setAutoRotateSpeed(speed: number): void {
    this.updateViewSettings((next) => {
      next.autoRotateSpeed = speed
    })
  }

  setVignette(intensity: number): void {
    this.updateViewSettings((next) => {
      next.cinematic.vignette = intensity
    })
  }

  setVignetteEnabled(enabled: boolean): void {
    this.updateViewSettings((next) => {
      next.cinematic.vignetteEnabled = enabled
    })
  }

  setChromaticAberration(strength: number): void {
    this.updateViewSettings((next) => {
      next.cinematic.chromaticAberration = strength
    })
  }

  setFilmGrain(intensity: number): void {
    this.updateViewSettings((next) => {
      next.cinematic.filmGrain = intensity
    })
  }

  setColorTemperature(temperature: number): void {
    this.updateViewSettings((next) => {
      next.cinematic.colorTemperature = temperature
    })
  }

  setTransform(
    nodeId: NodeId,
    t: Partial<{
      px: number; py: number; pz: number
      rx: number; ry: number; rz: number
      sx: number; sy: number; sz: number
    }>,
  ): void {
    this.applySceneMutation((scene) => {
      const node = scene.nodes[nodeId]
      if (!node) return

      const hasRotationUpdate = t.rx !== undefined || t.ry !== undefined || t.rz !== undefined
      const nextRotation = hasRotationUpdate
        ? (() => {
            const [rx, ry, rz] = quaternionToEulerXYZ(node.r)
            const nextEuler: [number, number, number] = [
              t.rx ?? rx,
              t.ry ?? ry,
              t.rz ?? rz,
            ]
            return eulerToQuaternionTuple(...nextEuler)
          })()
        : [...node.r] as Quat

      setNodeTRS(scene, nodeId, {
        t: [t.px ?? node.t[0], t.py ?? node.t[1], t.pz ?? node.t[2]],
        r: nextRotation,
        s: [t.sx ?? node.s[0], t.sy ?? node.s[1], t.sz ?? node.s[2]],
      })
    })
  }

  setMaterial(
    nodeId: NodeId,
    m: Partial<{
      roughness: number
      metalness: number
      envMapIntensity: number
      r: number
      g: number
      b: number
    }>,
  ): void {
    this.applySceneMutation((scene) => {
      const materialId = scene.nodes[nodeId]?.materialId
      if (!materialId) return

      const material = scene.materials[materialId]
      if (!material) return

      patchMaterial(scene, materialId, {
        baseColor: [
          m.r ?? material.baseColor[0],
          m.g ?? material.baseColor[1],
          m.b ?? material.baseColor[2],
        ],
        roughness: m.roughness ?? material.roughness,
        metalness: m.metalness ?? material.metalness,
        envMapIntensity: m.envMapIntensity ?? material.envMapIntensity,
      })
    })
  }

  beginHistoryBatch(): void {
    this.history.beginBatch(() => this.captureSnapshot())
  }

  endHistoryBatch(): void {
    this.history.endBatch(
      () => this.captureSnapshot(),
      (left, right) => this.areSnapshotsEqual(left, right),
    )
    this.publishHistoryState()
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
    const snapshot = this.history.getUndoSnapshot()
    if (!snapshot) {
      this.publishHistoryState()
      return false
    }

    await this.applySnapshot(snapshot)
    this.history.markUndoApplied()
    this.publishHistoryState()
    return true
  }

  async redo(): Promise<boolean> {
    const snapshot = this.history.getRedoSnapshot()
    if (!snapshot) {
      this.publishHistoryState()
      return false
    }

    await this.applySnapshot(snapshot)
    this.history.markRedoApplied()
    this.publishHistoryState()
    return true
  }

  setTransformGizmoMode(mode: TransformGizmoMode | null): void {
    this.runtime.setTransformToolMode(mode)
  }

  getTransformGizmoMode(): TransformGizmoMode | null {
    return this.runtime.getTransformToolMode()
  }

  async exportPNG(scale: number = 3): Promise<Blob> {
    return this.runtime.exportPNG(scale)
  }

  getEnvironmentPreviews(): EnvironmentPreview[] {
    return this.runtime.getEnvironmentPreviews()
  }

  getSceneSnapshot(): object {
    return buildSceneSnapshot(Boolean(this.currentScene), this.getTransformGizmoMode())
  }

  getCanonicalSceneSnapshot(): SceneDoc | null {
    return this.currentScene ? cloneSceneDoc(this.currentScene) : null
  }

  getRuntimeStateGraph(): RuntimeStateGraph {
    const runtimeGraph = this.currentScene
      ? this.runtime.getRuntimeDebugGraph(this.currentScene)
      : { root: null, meshes: [] }

    return buildRuntimeStateGraph({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDepth: this.getUndoDepth(),
      redoDepth: this.getRedoDepth(),
      currentIndex: this.history.currentIndex,
      totalStates: this.history.totalStates,
      transformMode: this.getTransformGizmoMode(),
      runtimeGraph,
    })
  }

  getConsoleAPI(): ThreeMotionConsoleAPI {
    return {
      help: () => [
        'window.threeMotion.undo()',
        'window.threeMotion.redo()',
        'window.threeMotion.state()',
        'window.threeMotion.scene()',
        'window.threeMotion.canonical()',
        'window.threeMotion.ecs()',
        'window.threeMotion.printState()',
        'window.threeMotion.printCanonical()',
        'window.threeMotion.printEcsGraph()',
        "window.threeMotion.setTransformMode('translate' | 'rotate' | 'scale' | null)",
      ],
      undo: () => this.undo(),
      redo: () => this.redo(),
      state: () => this.getConsoleState(),
      scene: () => this.getSceneSnapshot(),
      canonical: () => this.getCanonicalSceneSnapshot(),
      ecs: () => this.getRuntimeStateGraph(),
      printState: () => {
        const state = this.getConsoleState()
        console.dir(state, { depth: null })
        return state
      },
      printCanonical: () => {
        const scene = this.getCanonicalSceneSnapshot()
        console.dir(scene, { depth: null })
        return scene
      },
      printEcsGraph: () => {
        const graph = this.getRuntimeStateGraph()
        console.dir(graph, { depth: null })
        return graph
      },
      setTransformMode: (mode) => this.setTransformGizmoMode(mode),
    }
  }

  getPathTracingReadinessReport() {
    const scene = this.currentScene
    if (!scene) {
      return {
        nodes: [],
        warnings: ['No scene loaded'],
      }
    }

    const backendScene = convertCanonicalToBackendSchema(scene)
    const nodes = backendScene.nodes
      .filter((node) => node.meshId)
      .map((node) => ({
        nodeId: node.id,
        meshId: node.meshId!,
        materialId: node.materialId ?? null,
        source: backendScene.meshes.find((mesh) => mesh.id === node.meshId) ?? null,
      }))

    const warnings = backendScene.unsupported.map(
      (warning) => `${warning.id}: ${warning.reason}`,
    )

    return { nodes, warnings }
  }

  private async loadLoadedModel(loader: () => Promise<LoadedModel>): Promise<void> {
    publishLoading(true)

    try {
      await this.clearModel()

      const model = await loader()
      this.currentScene = cloneSceneDoc(model.canonicalScene)
      this.currentAssets = model.runtimeAssets
      this.runtime.setSceneAssets(model.runtimeAssets)
      await this.runtime.buildFromCanonical(this.currentScene)
      await this.runtime.setViewSettings(readViewSettingsFromStore())

      publishHasModel(true)
      publishEntities(this.currentScene)
      this.initializeHistory()
    } finally {
      publishLoading(false)
    }
  }

  private async clearModel(): Promise<void> {
    this.currentScene = null
    this.currentAssets = null
    this.runtime.setSceneAssets(null)
    await this.runtime.buildFromCanonical(createEmptySceneDoc())
    publishHasModel(false)
    publishEntities(null)
    this.resetHistory()
  }

  private applySceneMutation(mutator: (scene: SceneDoc) => void): void {
    if (!this.currentScene) return

    const previous = cloneSceneDoc(this.currentScene)
    mutator(this.currentScene)
    const delta = diffSceneDocs(previous, this.currentScene)

    if (isSceneDeltaEmpty(delta)) {
      return
    }

    void this.runtime.applyDirty(delta, this.currentScene)
    publishEntities(this.currentScene)
    this.commitCurrentSnapshot()
  }

  private updateViewSettings(mutator: (next: EngineSnapshot['viewSettings']) => void): void {
    const next = readViewSettingsFromStore()
    const before = JSON.stringify(next)
    mutator(next)

    if (before === JSON.stringify(next)) return

    publishViewSettings(next)
    void this.runtime.setViewSettings(next)
    this.commitCurrentSnapshot()
  }

  private syncRuntimeTransform(nodeId: NodeId, trs: TRS): void {
    if (!this.currentScene) return

    const node = this.currentScene.nodes[nodeId]
    if (!node) return

    setNodeTRS(this.currentScene, nodeId, {
      t: trs.t,
      r: trs.r,
      s: trs.s,
    })
  }

  private beginTransformHistory(): void {
    if (!this.currentScene) return
    this.history.beginTransform(() => this.captureSnapshot())
  }

  private commitTransformHistory(): void {
    this.history.endTransform(
      () => this.captureSnapshot(),
      (left, right) => this.areSnapshotsEqual(left, right),
    )
    this.publishHistoryState()
  }

  private initializeHistory(): void {
    this.history.initialize(this.captureSnapshot())
    this.publishHistoryState()
  }

  private commitCurrentSnapshot(): void {
    this.history.commitCurrentSnapshot(
      () => this.captureSnapshot(),
      (left, right) => this.areSnapshotsEqual(left, right),
    )
    this.publishHistoryState()
  }

  private resetHistory(): void {
    this.history.reset()
    this.publishHistoryState()
  }

  private publishHistoryState(): void {
    publishHistoryAvailability(this.canUndo(), this.canRedo())
  }

  private captureSnapshot(): EngineSnapshot | null {
    return {
      scene: this.currentScene ? cloneSceneDoc(this.currentScene) : null,
      viewSettings: readViewSettingsFromStore(),
    }
  }

  private async applySnapshot(snapshot: EngineSnapshot): Promise<void> {
    this.history.beginApplyingHistory()
    try {
      this.currentScene = snapshot.scene ? cloneSceneDoc(snapshot.scene) : null
      this.runtime.setSceneAssets(this.currentAssets)
      await this.runtime.buildFromCanonical(this.currentScene ?? createEmptySceneDoc())
      await this.runtime.setViewSettings(snapshot.viewSettings)
      publishViewSettings(snapshot.viewSettings)
      publishEntities(this.currentScene)
    } finally {
      this.history.endApplyingHistory()
    }
  }

  private areSnapshotsEqual(a: EngineSnapshot, b: EngineSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private canUndo(): boolean {
    return this.history.canUndo()
  }

  private canRedo(): boolean {
    return this.history.canRedo()
  }

  private getUndoDepth(): number {
    return this.history.getUndoDepth()
  }

  private getRedoDepth(): number {
    return this.history.getRedoDepth()
  }

  private getConsoleState(): object {
    return buildConsoleState({
      hasCanonicalScene: Boolean(this.currentScene),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDepth: this.getUndoDepth(),
      redoDepth: this.getRedoDepth(),
      currentIndex: this.history.currentIndex,
      totalStates: this.history.totalStates,
      transformMode: this.getTransformGizmoMode(),
      pathTracingReadiness: this.getPathTracingReadinessReport(),
    })
  }
}

function eulerToQuaternionTuple(
  rx: number,
  ry: number,
  rz: number,
): Quat {
  const halfX = rx * 0.5
  const halfY = ry * 0.5
  const halfZ = rz * 0.5

  const sx = Math.sin(halfX)
  const cx = Math.cos(halfX)
  const sy = Math.sin(halfY)
  const cy = Math.cos(halfY)
  const sz = Math.sin(halfZ)
  const cz = Math.cos(halfZ)

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}

function quaternionToEulerXYZ([x, y, z, w]: Quat): [number, number, number] {
  const sinrCosp = 2 * (w * x + y * z)
  const cosrCosp = 1 - 2 * (x * x + y * y)
  const rx = Math.atan2(sinrCosp, cosrCosp)

  const sinp = 2 * (w * y - z * x)
  const ry = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

  const sinyCosp = 2 * (w * z + x * y)
  const cosyCosp = 1 - 2 * (y * y + z * z)
  const rz = Math.atan2(sinyCosp, cosyCosp)

  return [rx, ry, rz]
}

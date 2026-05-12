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
import type { NodeId, Quat, SceneDoc, SceneNode } from './scene/types'
import { eulerToQuaternionTuple, quaternionToEulerXYZ } from './scene/transformMath'
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
  applyLookPreset as applyProjectLookPreset,
  applyStudioPreset as applyProjectStudioPreset,
  cloneProjectDoc,
  createDefaultProject,
  getLookPresets,
  replaceProductSlotAsset,
  updateStudioEnvironment,
} from './project/document'
import type { CameraDef, LookPreset, LookPresetId, ProjectDoc, StudioGeometryKind, StudioPresetId } from './project/types'
import {
  buildConsoleState,
  buildRuntimeStateGraph,
  buildSceneSnapshot,
  publishEntities,
  publishHasModel,
  publishHistoryAvailability,
  publishLoading,
  publishProjectLook,
  publishSelectedStudioObject,
  publishStudioSetupObjects,
  publishTrackedObjectTransform,
  publishViewSettings,
  readViewSettingsFromStore,
  type RuntimeStateGraph,
} from './store/engineStateBridge'
import {
  areViewSettingsEqual,
  applyProjectLookToViewSettings,
  createDefaultViewSettings,
  updateViewSettings as updateSharedViewSettings,
} from './viewSettings'

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
  private currentProject: ProjectDoc = createDefaultProject()
  private currentScene: SceneDoc | null = null
  private currentProductScene: SceneDoc | null = null
  private currentPreviewScene: SceneDoc | null = null
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
    this.syncRenderCameraToRuntime()
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
    const nextProject = updateStudioEnvironment(this.currentProject, { hdriId: preset })
    const previous = readViewSettingsFromStore()
    const next = readViewSettingsFromStore()
    const projectChanged = JSON.stringify(nextProject) !== JSON.stringify(this.currentProject)

    if (next.activeHDRI === preset && !projectChanged) return

    this.currentProject = nextProject
    next.activeHDRI = preset

    if (!areViewSettingsEqual(previous, next)) {
      publishViewSettings(next)
      await this.runtime.setViewSettings(next)
    }

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

  resetFilters(): void {
    const defaults = createDefaultViewSettings()
    this.runHistoryBatch(() => {
      this.updateViewSettings((next) => {
        next.bloom = { ...defaults.bloom }
        next.cinematic = { ...defaults.cinematic }
      })
    })
  }

  getLookPresets(): LookPreset[] {
    return getLookPresets()
  }

  applyLookPreset(presetId: LookPresetId): void {
    const nextProject = applyProjectLookPreset(this.currentProject, presetId)
    const look = nextProject.look
    const projectChanged = JSON.stringify(nextProject) !== JSON.stringify(this.currentProject)

    this.currentProject = nextProject
    publishProjectLook(this.currentProject)
    this.setViewSettings(
      applyProjectLookToViewSettings(readViewSettingsFromStore(), look),
      readViewSettingsFromStore(),
      { commitSnapshot: false },
    )

    if (projectChanged) {
      this.commitCurrentSnapshot()
    }
  }

  async applyStudioPreset(presetId: StudioPresetId): Promise<void> {
    const nextProject = applyProjectStudioPreset(this.currentProject, presetId)
    const nextScene = this.composeCanonicalProjectScene(nextProject, this.currentProductScene)
    const previous = this.currentScene ? cloneSceneDoc(this.currentScene) : createEmptySceneDoc()

    this.currentProject = nextProject
    this.currentScene = nextScene

    if (this.currentAssets) {
      this.currentAssets = {
        ...this.currentAssets,
        canonicalScene: cloneSceneDoc(nextScene),
      }
      this.runtime.setSceneAssets(this.currentAssets)
    }

    const delta = diffSceneDocs(previous, nextScene)
    if (isSceneDeltaEmpty(delta)) {
      await this.runtime.buildFromCanonical(nextScene)
    } else {
      await this.runtime.applyDirty(delta, nextScene)
    }

    publishStudioSetupObjects(this.currentProject)
    publishEntities(this.currentScene)
    publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
    this.syncRenderCameraToRuntime()
    this.commitCurrentSnapshot()
  }

  setStudioObjectVisible(nodeId: NodeId, visible: boolean): void {
    const nextProject = cloneProjectDoc(this.currentProject)
    const object = Object.values(nextProject.studioScene.studioGeometry)
      .find((studioObject) => studioObject.nodeId === nodeId)

    if (!object || object.visible === visible) return

    object.visible = visible
    this.currentProject = nextProject

    if (this.currentScene?.nodes[nodeId]) {
      const previous = cloneSceneDoc(this.currentScene)
      this.currentScene.nodes[nodeId].visible = visible
      const delta = diffSceneDocs(previous, this.currentScene)

      if (!isSceneDeltaEmpty(delta)) {
        void this.runtime.applyDirty(delta, this.currentScene)
        publishEntities(this.currentScene)
        publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
      }
    }

    publishStudioSetupObjects(this.currentProject)
    this.commitCurrentSnapshot()
  }

  selectStudioObject(nodeId: NodeId | null): void {
    publishSelectedStudioObject(nodeId)
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

  previewTransform(
    nodeId: NodeId,
    t: Partial<{
      px: number; py: number; pz: number
      rx: number; ry: number; rz: number
      sx: number; sy: number; sz: number
    }>,
  ): void {
    if (!this.currentScene) return

    const previous = this.currentPreviewScene ?? this.currentScene
    const next = cloneSceneDoc(this.currentScene)
    const node = next.nodes[nodeId]
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

    setNodeTRS(next, nodeId, {
      t: [t.px ?? node.t[0], t.py ?? node.t[1], t.pz ?? node.t[2]],
      r: nextRotation,
      s: [t.sx ?? node.s[0], t.sy ?? node.s[1], t.sz ?? node.s[2]],
    })

    const delta = diffSceneDocs(previous, next)
    this.currentPreviewScene = next

    if (isSceneDeltaEmpty(delta)) {
      return
    }

    void this.runtime.applyDirty(delta, next)
    publishTrackedObjectTransform(next, this.getTrackedProductRootNodeId())
  }

  clearPreviewTransform(): void {
    if (!this.currentScene || !this.currentPreviewScene) return

    const delta = diffSceneDocs(this.currentPreviewScene, this.currentScene)
    this.currentPreviewScene = null

    if (isSceneDeltaEmpty(delta)) {
      return
    }

    void this.runtime.applyDirty(delta, this.currentScene)
    publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
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

  getProjectSnapshot(): ProjectDoc {
    return cloneProjectDoc(this.currentProject)
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
      const model = await loader()
      const nextProject = replaceProductSlotAsset(this.currentProject, {
        uri: model.source.reference.uri,
        rootNodeId: model.source.rootNodeId,
      })
      const nextScene = this.composeCanonicalProjectScene(nextProject, model.canonicalScene)
      const nextAssets = {
        ...model.runtimeAssets,
        canonicalScene: cloneSceneDoc(nextScene),
      }
      this.currentProject = nextProject
      this.currentScene = nextScene
      this.currentProductScene = cloneSceneDoc(model.canonicalScene)
      this.currentPreviewScene = null
      this.currentAssets = nextAssets
      this.runtime.setSceneAssets(nextAssets)
      await this.runtime.buildFromCanonical(this.currentScene)
      await this.runtime.setViewSettings(readViewSettingsFromStore())
      this.syncRenderCameraToRuntime()

      publishHasModel(true)
      publishProjectLook(this.currentProject)
      publishStudioSetupObjects(this.currentProject)
      publishEntities(this.currentScene)
      publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
      if (this.history.totalStates === 0) {
        this.initializeHistory()
      } else {
        this.commitCurrentSnapshot()
      }
      this.publishHistoryState()
    } finally {
      publishLoading(false)
    }
  }

  private composeCanonicalProjectScene(project: ProjectDoc, importedScene: SceneDoc | null): SceneDoc {
    const scene = createEmptySceneDoc()
    const primarySlotId = project.studioScene.primaryProductSlotId
    const primarySlot = project.studioScene.productSlots[primarySlotId]
    const studioRootId: NodeId = 'node-studio-root'

    scene.roots.push(studioRootId)
    scene.nodes[studioRootId] = createProjectNode({
      id: studioRootId,
      parentId: null,
      name: project.studioScene.name,
      children: [
        primarySlot.nodeId,
        project.studioScene.renderCameraNodeId,
        ...Object.values(project.studioScene.studioGeometry).map((object) => object.nodeId),
      ],
    })
    scene.nodes[primarySlot.nodeId] = createProjectNode({
      id: primarySlot.nodeId,
      parentId: studioRootId,
      name: primarySlot.name,
      children: importedScene ? [...importedScene.roots] : [],
    })
    scene.nodes[project.studioScene.renderCameraNodeId] = createProjectNode({
      id: project.studioScene.renderCameraNodeId,
      parentId: studioRootId,
      name: 'Render Camera',
      children: [],
      t: [0, 0.8, 4],
    })

    for (const object of Object.values(project.studioScene.studioGeometry)) {
      const material = Object.values(project.studioScene.materials)[0]
      scene.nodes[object.nodeId] = createProjectNode({
        id: object.nodeId,
        parentId: studioRootId,
        name: object.name,
        children: [],
        visible: object.visible,
        t: getStudioGeometryTransform(object.kind),
        meshId: `mesh-${object.id}`,
        materialId: material?.materialId,
      })
      scene.meshes[`mesh-${object.id}`] = {
        source: {
          uri: `builtin:studio/${object.kind}`,
        },
      }
    }

    for (const material of Object.values(project.studioScene.materials)) {
      scene.materials[material.materialId] = {
        baseColor: [0.86, 0.86, 0.82],
        roughness: 0.78,
        metalness: 0.02,
        envMapIntensity: project.studioScene.environment.intensity,
      }
    }

    if (importedScene) {
      for (const [nodeId, node] of Object.entries(importedScene.nodes)) {
        scene.nodes[nodeId] = {
          ...structuredClone(node),
          parentId: importedScene.roots.includes(nodeId) ? primarySlot.nodeId : node.parentId,
        }
      }

      scene.meshes = {
        ...scene.meshes,
        ...structuredClone(importedScene.meshes),
      }
      scene.materials = {
        ...scene.materials,
        ...structuredClone(importedScene.materials),
      }
    }

    return scene
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
    publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
    this.commitCurrentSnapshot()
  }

  private updateViewSettings(mutator: (next: EngineSnapshot['viewSettings']) => void): void {
    const previous = readViewSettingsFromStore()
    const next = updateSharedViewSettings(previous, mutator)

    this.setViewSettings(next, previous)
  }

  private setViewSettings(
    next: EngineSnapshot['viewSettings'],
    previous: EngineSnapshot['viewSettings'] = readViewSettingsFromStore(),
    options: { commitSnapshot?: boolean } = {},
  ): boolean {
    if (areViewSettingsEqual(previous, next)) return false

    publishViewSettings(next)
    void this.runtime.setViewSettings(next)
    if (options.commitSnapshot ?? true) {
      this.commitCurrentSnapshot()
    }
    return true
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
    publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
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

  private publishHistoryState(): void {
    publishHistoryAvailability(this.canUndo(), this.canRedo())
  }

  private captureSnapshot(): EngineSnapshot | null {
    return {
      scene: this.currentScene ? cloneSceneDoc(this.currentScene) : null,
      viewSettings: readViewSettingsFromStore(),
      project: cloneProjectDoc(this.currentProject),
    }
  }

  private async applySnapshot(snapshot: EngineSnapshot): Promise<void> {
    this.history.beginApplyingHistory()
    try {
      this.currentProject = snapshot.project
        ? cloneProjectDoc(snapshot.project)
        : createDefaultProject()
      this.currentScene = snapshot.scene ? cloneSceneDoc(snapshot.scene) : null
      this.runtime.setSceneAssets(this.currentAssets)
      await this.runtime.buildFromCanonical(this.currentScene ?? createEmptySceneDoc())
      await this.runtime.setViewSettings(snapshot.viewSettings)
      this.syncRenderCameraToRuntime()
      publishViewSettings(snapshot.viewSettings)
      publishProjectLook(this.currentProject)
      publishStudioSetupObjects(this.currentProject)
      publishEntities(this.currentScene)
      publishTrackedObjectTransform(this.currentScene, this.getTrackedProductRootNodeId())
    } finally {
      this.history.endApplyingHistory()
    }
  }

  private areSnapshotsEqual(a: EngineSnapshot, b: EngineSnapshot): boolean {
    return (
      JSON.stringify(a.scene) === JSON.stringify(b.scene)
      && JSON.stringify(a.project) === JSON.stringify(b.project)
      && areViewSettingsEqual(a.viewSettings, b.viewSettings)
    )
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

  private getTrackedProductRootNodeId(): NodeId | null {
    const slotId = this.currentProject.studioScene.primaryProductSlotId
    return this.currentProject.studioScene.productSlots[slotId]?.asset?.rootNodeId ?? null
  }

  private getRenderCameraDef(): CameraDef | null {
    const nodeId = this.currentProject.studioScene.renderCameraNodeId
    return Object.values(this.currentProject.studioScene.cameras).find((cam) => cam.nodeId === nodeId) ?? null
  }

  private syncRenderCameraToRuntime(): void {
    const camera = this.getRenderCameraDef()
    if (!camera) return
    this.runtime.setRenderCamera(camera.nodeId, camera.fovDegrees, camera.near, camera.far)
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

function createProjectNode(params: {
  id: NodeId
  parentId: NodeId | null
  name: string
  children: NodeId[]
  t?: [number, number, number]
  visible?: boolean
  meshId?: string
  materialId?: string
}): SceneNode {
  return {
    id: params.id,
    parentId: params.parentId,
    children: params.children,
    name: params.name,
    t: params.t ?? [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: params.visible ?? true,
    ...(params.meshId ? { meshId: params.meshId } : {}),
    ...(params.materialId ? { materialId: params.materialId } : {}),
  }
}

function getStudioGeometryTransform(kind: StudioGeometryKind): [number, number, number] {
  switch (kind) {
    case 'floor':
      return [0, -0.78, 0]
    case 'backdrop':
      return [0, 0.55, -2.15]
    case 'plinth':
      return [0, -0.52, 0]
  }
}

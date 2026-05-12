import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EngineAPI } from '../../src/engine/EngineAPI.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { cloneSceneDoc } from '../../src/engine/scene/snapshot.ts'
import { cloneViewSettings, createDefaultViewSettings } from '../../src/engine/viewSettings.ts'
import type { RuntimeAdapter } from '../../src/engine/runtime/RuntimeAdapter.ts'
import type {
  EnvironmentPreview,
  RuntimeDebugGraph,
  RuntimeSceneAssetBundle,
  TRS,
  TransformGizmoMode,
  ViewSettings,
} from '../../src/engine/runtime/types.ts'
import type { NodeId, SceneDoc } from '../../src/engine/scene/types.ts'

class FakeRuntime implements RuntimeAdapter {
  public buildCalls: SceneDoc[] = []
  public applyDirtyCalls: SceneDoc[] = []
  public viewSettingsCalls: ViewSettings[] = []
  public runtimeTransformChanged: ((nodeId: NodeId, trs: TRS) => void) | null = null
  public transformInteractionStart: (() => void) | null = null
  public transformInteractionEnd: (() => void) | null = null

  mount(): void {}
  unmount(): void {}
  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void {
    void assets
  }

  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    this.buildCalls.push(cloneSceneDoc(scene))
  }

  async applyDirty(delta: unknown, scene: SceneDoc): Promise<void> {
    void delta
    this.applyDirtyCalls.push(cloneSceneDoc(scene))
  }

  async setViewSettings(settings: ViewSettings): Promise<void> {
    this.viewSettingsCalls.push(cloneViewSettings(settings))
  }

  getViewSettings(): ViewSettings {
    return cloneViewSettings(this.viewSettingsCalls.at(-1) ?? createDefaultViewSettings())
  }

  setTransformToolMode(mode: TransformGizmoMode | null): void {
    void mode
  }
  getTransformToolMode(): TransformGizmoMode | null { return null }

  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void {
    this.runtimeTransformChanged = cb
  }

  onTransformInteractionStart(cb: (() => void) | null): void {
    this.transformInteractionStart = cb
  }

  onTransformInteractionEnd(cb: (() => void) | null): void {
    this.transformInteractionEnd = cb
  }

  async exportPNG(): Promise<Blob> {
    return new Blob(['fake'], { type: 'image/png' })
  }

  getEnvironmentPreviews(): EnvironmentPreview[] {
    return []
  }

  renderCameraCalls: Array<{ nodeId: NodeId; fovDegrees: number; near: number; far: number }> = []
  setRenderCamera(nodeId: NodeId, fovDegrees: number, near: number, far: number): void {
    this.renderCameraCalls.push({ nodeId, fovDegrees, near, far })
  }

  getRuntimeDebugGraph(scene: SceneDoc): RuntimeDebugGraph {
    const rootNode = scene.roots[0] ? scene.nodes[scene.roots[0]] : null
    return {
      root: rootNode
        ? {
            nodeId: rootNode.id,
            name: rootNode.name,
            transform: {
              t: [...rootNode.t] as TRS['t'],
              r: [...rootNode.r] as TRS['r'],
              s: [...rootNode.s] as TRS['s'],
            },
            materialId: rootNode.materialId,
          }
        : null,
      meshes: [],
    }
  }

  fireTransformStart(): void {
    this.transformInteractionStart?.()
  }

  fireTransformChange(nodeId: NodeId, trs: TRS): void {
    this.runtimeTransformChanged?.(nodeId, trs)
  }

  fireTransformEnd(): void {
    this.transformInteractionEnd?.()
  }
}

function resetStore(): void {
  useEngineStore.setState({
    isLoading: false,
    entities: [],
    hasModel: false,
    canUndo: false,
    canRedo: false,
    trackedObjectTransform: null,
    studioSetupObjects: [],
    selectedStudioObjectNodeId: null,
    activeLookId: 'look-studio-neutral',
    ...createDefaultViewSettings(),
  })
}

function createStubGLTFScene(sceneName: string): THREE.Group {
  const root = new THREE.Group()
  root.name = sceneName

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.1, 0.2, 0.3),
      roughness: 0.6,
      metalness: 0.2,
    }),
  )
  mesh.name = `${sceneName}-mesh`
  root.add(mesh)

  return root
}

function withMockedLoader(
  loadAsync: (url: string) => Promise<{ scene: THREE.Group }>,
  run: () => Promise<void>,
): Promise<void> {
  const originalLoadAsync = GLTFLoader.prototype.loadAsync
  GLTFLoader.prototype.loadAsync = async function mockedLoadAsync(url: string) {
    return loadAsync(url)
  }

  return run().finally(() => {
    GLTFLoader.prototype.loadAsync = originalLoadAsync
  })
}

async function createLoadedEngine(): Promise<{ engine: EngineAPI; runtime: FakeRuntime }> {
  const runtime = new FakeRuntime()
  const engine = new EngineAPI(runtime)
  engine.init({} as HTMLElement)

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('history-root') }),
    async () => {
      await engine.loadModel('/models/history.glb')
    },
  )

  return { engine, runtime }
}

test.beforeEach(() => {
  resetStore()
})

test('history batch collapses multiple material edits into one undo step', async () => {
  const { engine, runtime } = await createLoadedEngine()
  const initialEntity = useEngineStore.getState().entities[0]
  const entityNodeId = initialEntity?.nodeId
  assert.ok(entityNodeId)
  assert.ok(initialEntity)

  engine.beginHistoryBatch()
  engine.setMaterial(entityNodeId, { roughness: 0.2 })
  engine.setMaterial(entityNodeId, { roughness: 0.8, metalness: 0.5 })
  engine.endHistoryBatch()

  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)
  assert.equal(useEngineStore.getState().canUndo, true)
  assert.equal(runtime.applyDirtyCalls.length, 2)
  assert.equal(useEngineStore.getState().entities[0]?.roughness, 0.8)
  assert.equal(useEngineStore.getState().entities[0]?.metalness, 0.5)

  const didUndo = await engine.undo()

  assert.equal(didUndo, true)
  assert.equal(useEngineStore.getState().entities[0]?.roughness, initialEntity.roughness)
  assert.equal(useEngineStore.getState().entities[0]?.metalness, initialEntity.metalness)
  assert.equal(runtime.buildCalls.length, 2)
})

test('nested history batches still produce one undo step', async () => {
  const { engine } = await createLoadedEngine()

  engine.beginHistoryBatch()
  engine.setExposure(1.4)
  engine.beginHistoryBatch()
  engine.setExposure(1.8)
  engine.endHistoryBatch()
  engine.endHistoryBatch()

  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)

  await engine.undo()

  assert.equal(useEngineStore.getState().exposure, 1)
  assert.equal(engine.getRuntimeStateGraph().history.redoDepth, 1)
})

test('transform interaction creates a single undo step for a gesture', async () => {
  const { engine, runtime } = await createLoadedEngine()
  const originalScene = engine.getCanonicalSceneSnapshot()
  assert.ok(originalScene)

  runtime.fireTransformStart()
  runtime.fireTransformChange('node-0', {
    t: [3, 4, 5],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
  })
  runtime.fireTransformChange('node-0', {
    t: [6, 7, 8],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
  })
  runtime.fireTransformEnd()

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.t, [6, 7, 8])
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [6, 7, 8])
  assert.equal(useEngineStore.getState().trackedObjectTransform?.distanceFromOrigin, 12.207)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)

  await engine.undo()

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.t, originalScene.nodes['node-0']?.t)
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [0, 0, 0])
})

test('preview transforms update runtime state without mutating canonical scene or history', async () => {
  const { engine, runtime } = await createLoadedEngine()
  const originalScene = engine.getCanonicalSceneSnapshot()
  assert.ok(originalScene)
  const initialApplyDirtyCount = runtime.applyDirtyCalls.length

  engine.previewTransform('node-0', {
    py: 2,
    ry: Math.PI / 2,
  })

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.t, originalScene.nodes['node-0']?.t)
  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.r, originalScene.nodes['node-0']?.r)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 0)
  assert.equal(useEngineStore.getState().canUndo, false)
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [0, 2, 0])
  assert.equal(runtime.applyDirtyCalls.length, initialApplyDirtyCount + 1)
  assert.deepEqual(runtime.applyDirtyCalls.at(-1)?.nodes['node-0']?.t, [0, 2, 0])

  engine.clearPreviewTransform()

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.t, originalScene.nodes['node-0']?.t)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 0)
  assert.equal(runtime.applyDirtyCalls.length, initialApplyDirtyCount + 2)
  assert.deepEqual(runtime.applyDirtyCalls.at(-1)?.nodes['node-0']?.t, [0, 0, 0])
})

test('undo and redo restore view settings and rebuild runtime from history snapshots', async () => {
  const { engine, runtime } = await createLoadedEngine()
  const initialBuildCount = runtime.buildCalls.length
  const initialViewSettingsCalls = runtime.viewSettingsCalls.length

  engine.setExposure(2.2)
  engine.setAutoRotate(true)

  assert.equal(useEngineStore.getState().exposure, 2.2)
  assert.equal(useEngineStore.getState().autoRotate, true)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 2)

  const didUndo = await engine.undo()
  assert.equal(didUndo, true)
  assert.equal(useEngineStore.getState().exposure, 2.2)
  assert.equal(useEngineStore.getState().autoRotate, false)

  const didUndoAgain = await engine.undo()
  assert.equal(didUndoAgain, true)
  assert.equal(useEngineStore.getState().exposure, 1)
  assert.equal(useEngineStore.getState().autoRotate, false)

  const didRedo = await engine.redo()
  assert.equal(didRedo, true)
  assert.equal(useEngineStore.getState().exposure, 2.2)
  assert.equal(useEngineStore.getState().autoRotate, false)
  assert.equal(runtime.buildCalls.length, initialBuildCount + 3)
  assert.equal(runtime.viewSettingsCalls.length, initialViewSettingsCalls + 5)
})

test('look preset history restores project Look and runtime view settings', async () => {
  const { engine } = await createLoadedEngine()

  engine.applyLookPreset('warm-hero')

  assert.equal(engine.getProjectSnapshot().look.id, 'look-warm-hero')
  assert.equal(useEngineStore.getState().exposure, 1.25)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)

  await engine.undo()

  assert.equal(engine.getProjectSnapshot().look.id, 'look-studio-neutral')
  assert.equal(useEngineStore.getState().activeLookId, 'look-studio-neutral')
  assert.equal(useEngineStore.getState().exposure, 1)

  await engine.redo()

  assert.equal(engine.getProjectSnapshot().look.id, 'look-warm-hero')
  assert.equal(useEngineStore.getState().activeLookId, 'look-warm-hero')
  assert.equal(useEngineStore.getState().exposure, 1.25)
})

test('look preset project changes publish active Look even when view settings are already equal', async () => {
  const { engine, runtime } = await createLoadedEngine()
  useEngineStore.setState({
    exposure: 1.25,
    bloom: {
      strength: 0.45,
      radius: 0.7,
      threshold: 0.82,
    },
    cinematic: {
      vignette: 0.42,
      vignetteEnabled: true,
      chromaticAberration: 0.002,
      filmGrain: 0.012,
      colorTemperature: 0.28,
    },
  })
  const initialViewSettingsCalls = runtime.viewSettingsCalls.length

  engine.applyLookPreset('warm-hero')

  assert.equal(engine.getProjectSnapshot().look.id, 'look-warm-hero')
  assert.equal(useEngineStore.getState().activeLookId, 'look-warm-hero')
  assert.equal(runtime.viewSettingsCalls.length, initialViewSettingsCalls)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)
})

test('equivalent nested view settings updates do not create history or runtime writes', async () => {
  const { engine, runtime } = await createLoadedEngine()
  useEngineStore.setState({
    bloom: { threshold: 0.85, radius: 0.6, strength: 0.3 },
  })
  const initialViewSettingsCalls = runtime.viewSettingsCalls.length

  engine.setBloom(0.3, 0.6, 0.85)

  assert.equal(runtime.viewSettingsCalls.length, initialViewSettingsCalls)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 0)
  assert.deepEqual(useEngineStore.getState().bloom, {
    threshold: 0.85,
    radius: 0.6,
    strength: 0.3,
  })
})

test('filter reset restores shared defaults and batches one history entry', async () => {
  const { engine } = await createLoadedEngine()
  const defaults = createDefaultViewSettings()

  engine.setExposure(1.7)
  engine.setAutoRotate(true)
  engine.setBloom(1.1, 0.2, 0.4)
  engine.setVignetteEnabled(false)
  engine.setVignette(0.8)
  engine.setFilmGrain(0.09)
  engine.setChromaticAberration(0.012)
  engine.setColorTemperature(-0.45)
  const undoDepthBeforeReset = engine.getRuntimeStateGraph().history.undoDepth

  engine.resetFilters()

  assert.equal(useEngineStore.getState().exposure, 1.7)
  assert.equal(useEngineStore.getState().autoRotate, true)
  assert.deepEqual(useEngineStore.getState().bloom, defaults.bloom)
  assert.deepEqual(useEngineStore.getState().cinematic, defaults.cinematic)
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, undoDepthBeforeReset + 1)

  await engine.undo()

  assert.deepEqual(useEngineStore.getState().bloom, {
    strength: 1.1,
    radius: 0.2,
    threshold: 0.4,
  })
  assert.equal(useEngineStore.getState().cinematic.vignetteEnabled, false)
  assert.equal(useEngineStore.getState().cinematic.vignette, 0.8)
  assert.equal(useEngineStore.getState().cinematic.filmGrain, 0.09)
  assert.equal(useEngineStore.getState().cinematic.chromaticAberration, 0.012)
  assert.equal(useEngineStore.getState().cinematic.colorTemperature, -0.45)
})

test('camera transform edits are undoable and redoable through history', async () => {
  const { engine, runtime } = await createLoadedEngine()
  const cameraNodeId = engine.getProjectSnapshot().studioScene.renderCameraNodeId

  const originalCameraPosition = engine.getCanonicalSceneSnapshot()?.nodes[cameraNodeId]?.t
  assert.deepEqual(originalCameraPosition, [0, 0.8, 4])

  engine.setTransform(cameraNodeId, { px: 2, py: 1.5, pz: 6 })

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes[cameraNodeId]?.t, [2, 1.5, 6])
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)
  assert.equal(runtime.applyDirtyCalls.length, 1)

  const didUndo = await engine.undo()

  assert.equal(didUndo, true)
  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes[cameraNodeId]?.t, originalCameraPosition)
  assert.equal(runtime.buildCalls.length, 2)

  const didRedo = await engine.redo()

  assert.equal(didRedo, true)
  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes[cameraNodeId]?.t, [2, 1.5, 6])
})

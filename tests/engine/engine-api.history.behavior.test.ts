import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EngineAPI } from '../../src/engine/EngineAPI.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { cloneSceneDoc } from '../../src/engine/scene/snapshot.ts'
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
  setSceneAssets(_: RuntimeSceneAssetBundle | null): void {}

  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    this.buildCalls.push(cloneSceneDoc(scene))
  }

  async applyDirty(_: unknown, scene: SceneDoc): Promise<void> {
    this.applyDirtyCalls.push(cloneSceneDoc(scene))
  }

  async setViewSettings(settings: ViewSettings): Promise<void> {
    this.viewSettingsCalls.push(cloneViewSettings(settings))
  }

  getViewSettings(): ViewSettings {
    return cloneViewSettings(this.viewSettingsCalls.at(-1) ?? createDefaultViewSettings())
  }

  setTransformToolMode(_: TransformGizmoMode | null): void {}
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

function createDefaultViewSettings(): ViewSettings {
  return {
    activeHDRI: 'studio',
    exposure: 1,
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 },
    cinematic: {
      vignette: 0.35,
      vignetteEnabled: true,
      chromaticAberration: 0.003,
      filmGrain: 0,
      colorTemperature: 0,
    },
    autoRotate: false,
    autoRotateSpeed: 0.3,
  }
}

function cloneViewSettings(settings: ViewSettings): ViewSettings {
  return {
    activeHDRI: settings.activeHDRI,
    exposure: settings.exposure,
    bloom: { ...settings.bloom },
    cinematic: { ...settings.cinematic },
    autoRotate: settings.autoRotate,
    autoRotateSpeed: settings.autoRotateSpeed,
  }
}

function resetStore(): void {
  useEngineStore.setState({
    isLoading: false,
    entities: [],
    hasModel: false,
    canUndo: false,
    canRedo: false,
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
  assert.equal(runtime.buildCalls.length, 3)
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
  assert.equal(engine.getRuntimeStateGraph().history.undoDepth, 1)

  await engine.undo()

  assert.deepEqual(engine.getCanonicalSceneSnapshot()?.nodes['node-0']?.t, originalScene.nodes['node-0']?.t)
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

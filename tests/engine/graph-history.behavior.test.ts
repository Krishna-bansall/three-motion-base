import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineAPI } from '../../src/engine/EngineAPI.ts'
import { diffSceneDocs, isSceneDeltaEmpty } from '../../src/engine/scene/diff.ts'
import { cloneSceneDoc, createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'
import { patchMaterial } from '../../src/engine/scene/mutations.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
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
  public sceneAssets: RuntimeSceneAssetBundle | null = null
  public buildCalls: SceneDoc[] = []
  public dirtyCalls: Array<{ scene: SceneDoc }> = []
  public transformMode: TransformGizmoMode | null = null
  public viewSettings: ViewSettings = createDefaultViewSettings()
  private transformChangedCb: ((nodeId: NodeId, trs: TRS) => void) | null = null
  private transformStartCb: (() => void) | null = null
  private transformEndCb: (() => void) | null = null

  mount(): void {}
  unmount(): void {}

  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void {
    this.sceneAssets = assets
  }

  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    this.buildCalls.push(cloneSceneDoc(scene))
  }

  async applyDirty(_: unknown, scene: SceneDoc): Promise<void> {
    this.dirtyCalls.push({ scene: cloneSceneDoc(scene) })
  }

  async setViewSettings(settings: ViewSettings): Promise<void> {
    this.viewSettings = cloneViewSettings(settings)
  }

  getViewSettings(): ViewSettings {
    return cloneViewSettings(this.viewSettings)
  }

  setTransformToolMode(mode: TransformGizmoMode | null): void {
    this.transformMode = mode
  }

  getTransformToolMode(): TransformGizmoMode | null {
    return this.transformMode
  }

  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void {
    this.transformChangedCb = cb
  }

  onTransformInteractionStart(cb: (() => void) | null): void {
    this.transformStartCb = cb
  }

  onTransformInteractionEnd(cb: (() => void) | null): void {
    this.transformEndCb = cb
  }

  async exportPNG(): Promise<Blob> {
    return new Blob(['fake'], { type: 'image/png' })
  }

  getEnvironmentPreviews(): EnvironmentPreview[] {
    return []
  }

  getRuntimeDebugGraph(): RuntimeDebugGraph {
    return { root: null, meshes: [] }
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
    ...createDefaultViewSettings(),
  })
}

function createSceneWithSingleMesh(quaternion: [number, number, number, number]): SceneDoc {
  const scene = createEmptySceneDoc()
  scene.roots.push('node-0')
  scene.meshes['mesh-0'] = {
    source: { uri: 'sample.glb', primitive: 0 },
  }
  scene.materials['material-0'] = {
    baseColor: [1, 0, 0],
    roughness: 0.5,
    metalness: 0.2,
    envMapIntensity: 1,
  }
  scene.nodes['node-0'] = {
    id: 'node-0',
    parentId: null,
    children: [],
    name: 'Root',
    t: [0, 0, 0],
    r: quaternion,
    s: [1, 1, 1],
    meshId: 'mesh-0',
    materialId: 'material-0',
    visible: true,
  }
  return scene
}

test.beforeEach(() => {
  resetStore()
})

test('cloneSceneDoc deep-clones canonical data', () => {
  const original = createSceneWithSingleMesh([0, 0, 0, 1])
  const clone = cloneSceneDoc(original)

  clone.nodes['node-0'].t[0] = 42
  clone.materials['material-0'].baseColor[1] = 0.7

  assert.equal(original.nodes['node-0'].t[0], 0)
  assert.equal(original.materials['material-0'].baseColor[1], 0)
})

test('diffSceneDocs detects material edits and stays empty for identical scenes', () => {
  const original = createSceneWithSingleMesh([0, 0, 0, 1])
  const identical = cloneSceneDoc(original)
  assert.equal(isSceneDeltaEmpty(diffSceneDocs(original, identical)), true)

  const edited = cloneSceneDoc(original)
  patchMaterial(edited, 'material-0', { roughness: 0.9 })
  const delta = diffSceneDocs(original, edited)

  assert.equal(delta.changedMaterials['material-0']?.roughness, 0.9)
  assert.equal(isSceneDeltaEmpty(delta), false)
})

test('position-only transform should not rewrite an existing quaternion', () => {
  const runtime = new FakeRuntime()
  const engine = new EngineAPI(runtime)
  const startingQuaternion: [number, number, number, number] = [0.2, 0.3, 0.4, 0.8426149773176358]
  const scene = createSceneWithSingleMesh(startingQuaternion)

  ;(engine as unknown as { currentScene: SceneDoc }).currentScene = cloneSceneDoc(scene)
  ;(engine as unknown as { currentAssets: RuntimeSceneAssetBundle | null }).currentAssets = null
  ;(engine as unknown as { initializeHistory: () => void }).initializeHistory()

  engine.setTransform('node-0', { px: 5 })

  const mutated = (
    engine as unknown as { currentScene: SceneDoc }
  ).currentScene.nodes['node-0']

  assert.deepEqual(
    mutated.r,
    startingQuaternion,
    'changing only position should preserve the stored quaternion exactly',
  )
})

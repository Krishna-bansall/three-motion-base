import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EngineAPI } from '../../src/engine/EngineAPI.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { cloneSceneDoc, createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'
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
  public mountCount = 0
  public unmountCount = 0
  public sceneAssets: RuntimeSceneAssetBundle | null = null
  public sceneAssetsHistory: Array<RuntimeSceneAssetBundle | null> = []
  public buildCalls: SceneDoc[] = []
  public viewSettingsCalls: ViewSettings[] = []
  public transformMode: TransformGizmoMode | null = null
  public runtimeTransformChanged: ((nodeId: NodeId, trs: TRS) => void) | null = null
  public transformInteractionStart: (() => void) | null = null
  public transformInteractionEnd: (() => void) | null = null

  mount(): void {
    this.mountCount += 1
  }

  unmount(): void {
    this.unmountCount += 1
  }

  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void {
    this.sceneAssets = assets
    this.sceneAssetsHistory.push(assets)
  }

  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    this.buildCalls.push(cloneSceneDoc(scene))
  }

  async applyDirty(): Promise<void> {}

  async setViewSettings(settings: ViewSettings): Promise<void> {
    this.viewSettingsCalls.push(cloneViewSettings(settings))
  }

  getViewSettings(): ViewSettings {
    return cloneViewSettings(
      this.viewSettingsCalls.at(-1) ?? createDefaultViewSettings(),
    )
  }

  setTransformToolMode(mode: TransformGizmoMode | null): void {
    this.transformMode = mode
  }

  getTransformToolMode(): TransformGizmoMode | null {
    return this.transformMode
  }

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
    ...createDefaultViewSettings(),
  })
}

function createStubGLTFScene(sceneName: string): THREE.Group {
  const root = new THREE.Group()
  root.name = sceneName

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.2, 0.4, 0.6),
      roughness: 0.7,
      metalness: 0.1,
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

function withMockedBlobUrls(
  run: (state: {
    created: string[]
    revoked: string[]
  }) => Promise<void>,
): Promise<void> {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const created: string[] = []
  const revoked: string[] = []
  let nextId = 0

  URL.createObjectURL = ((value: Blob | MediaSource) => {
    void value
    const url = `blob:mock-${++nextId}`
    created.push(url)
    return url
  }) as typeof URL.createObjectURL

  URL.revokeObjectURL = ((url: string) => {
    revoked.push(url)
  }) as typeof URL.revokeObjectURL

  return run({ created, revoked }).finally(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })
}

function createMountedEngine(): { engine: EngineAPI; runtime: FakeRuntime } {
  const runtime = new FakeRuntime()
  const engine = new EngineAPI(runtime)
  engine.init({} as HTMLElement)
  return { engine, runtime }
}

test.beforeEach(() => {
  resetStore()
})

test('EngineAPI.init mounts runtime, registers callbacks, and pushes store view settings', () => {
  useEngineStore.setState({
    activeHDRI: 'moody',
    exposure: 1.8,
    autoRotate: true,
    autoRotateSpeed: 0.75,
    canUndo: true,
    canRedo: true,
  })

  const runtime = new FakeRuntime()
  const engine = new EngineAPI(runtime)

  engine.init({} as HTMLElement)

  assert.equal(runtime.mountCount, 1)
  assert.equal(typeof runtime.runtimeTransformChanged, 'function')
  assert.equal(typeof runtime.transformInteractionStart, 'function')
  assert.equal(typeof runtime.transformInteractionEnd, 'function')
  assert.equal(runtime.viewSettingsCalls.length, 1)
  assert.deepEqual(runtime.viewSettingsCalls[0], {
    activeHDRI: 'moody',
    exposure: 1.8,
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 },
    cinematic: {
      vignette: 0.35,
      vignetteEnabled: true,
      chromaticAberration: 0.003,
      filmGrain: 0,
      colorTemperature: 0,
    },
    autoRotate: true,
    autoRotateSpeed: 0.75,
  })
  assert.equal(useEngineStore.getState().canUndo, false)
  assert.equal(useEngineStore.getState().canRedo, false)
})

test('EngineAPI.dispose unregisters runtime callbacks and unmounts runtime', () => {
  const runtime = new FakeRuntime()
  const engine = new EngineAPI(runtime)

  engine.init({} as HTMLElement)
  engine.dispose()

  assert.equal(runtime.runtimeTransformChanged, null)
  assert.equal(runtime.transformInteractionStart, null)
  assert.equal(runtime.transformInteractionEnd, null)
  assert.equal(runtime.unmountCount, 1)
})

test('loadModel loads a scene, clears runtime first, and publishes canonical entities', async () => {
  const { engine, runtime } = createMountedEngine()

  await withMockedLoader(
    async (url) => {
      assert.equal(url, '/models/sample.glb')
      return { scene: createStubGLTFScene('sample-root') }
    },
    async () => {
      await engine.loadModel('/models/sample.glb')
    },
  )

  assert.equal(useEngineStore.getState().isLoading, false)
  assert.equal(useEngineStore.getState().hasModel, true)
  assert.equal(useEngineStore.getState().entities.length, 1)
  assert.equal(useEngineStore.getState().entities[0]?.name, 'sample-root-mesh')
  assert.equal(runtime.sceneAssetsHistory.length, 2)
  assert.equal(runtime.sceneAssetsHistory[0], null)
  assert.ok(runtime.sceneAssetsHistory[1], 'loaded assets should be stored on the runtime')
  assert.equal(runtime.buildCalls.length, 2)
  assert.deepEqual(runtime.buildCalls[0], createEmptySceneDoc())
  assert.equal(runtime.buildCalls[1].roots.length, 1)
  assert.equal(runtime.buildCalls[1].materials['material-0']?.envMapIntensity, 1.2)
  assert.equal(useEngineStore.getState().canUndo, false)
  assert.equal(useEngineStore.getState().canRedo, false)
})

test('loadModelFromFile uses the shared load path and revokes its blob URL', async () => {
  const { engine } = createMountedEngine()
  const file = new File(['binary'], 'product.glb', { type: 'model/gltf-binary' })

  await withMockedBlobUrls(async ({ created, revoked }) => {
    await withMockedLoader(
      async (url) => {
        assert.equal(url, created[0])
        return { scene: createStubGLTFScene('file-root') }
      },
      async () => {
        await engine.loadModelFromFile(file)
      },
    )

    assert.deepEqual(revoked, created)
  })

  assert.equal(useEngineStore.getState().hasModel, true)
  assert.equal(useEngineStore.getState().entities[0]?.name, 'file-root-mesh')
})

test('loadModelFromFiles uses the shared load path and revokes every blob URL', async () => {
  const { engine } = createMountedEngine()
  const gltfFile = new File(['{"asset":{"version":"2.0"}}'], 'scene.gltf', {
    type: 'model/gltf+json',
  })
  const textureFile = new File(['png'], 'albedo.png', { type: 'image/png' })
  Object.defineProperty(textureFile, 'webkitRelativePath', { value: 'textures/albedo.png' })

  await withMockedBlobUrls(async ({ created, revoked }) => {
    await withMockedLoader(
      async (url) => {
        assert.equal(url, created[0])
        return { scene: createStubGLTFScene('files-root') }
      },
      async () => {
        await engine.loadModelFromFiles([gltfFile, textureFile])
      },
    )

    assert.deepEqual(revoked.sort(), created.sort())
  })

  assert.equal(useEngineStore.getState().hasModel, true)
  assert.equal(useEngineStore.getState().entities[0]?.name, 'files-root-mesh')
})

test('failed replacement load keeps the previous scene active and clears loading state', async () => {
  const { engine, runtime } = createMountedEngine()

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('first-root') }),
    async () => {
      await engine.loadModel('/models/first.glb')
    },
  )

  const previousScene = engine.getCanonicalSceneSnapshot()
  const previousEntities = [...useEngineStore.getState().entities]
  const previousBuildCount = runtime.buildCalls.length

  await assert.rejects(
    () =>
      withMockedLoader(
        async () => {
          throw new Error('synthetic loader failure')
        },
        async () => {
          await engine.loadModel('/models/second.glb')
        },
      ),
    /synthetic loader failure/,
  )

  assert.equal(useEngineStore.getState().isLoading, false)
  assert.equal(useEngineStore.getState().hasModel, true)
  assert.deepEqual(engine.getCanonicalSceneSnapshot(), previousScene)
  assert.deepEqual(useEngineStore.getState().entities, previousEntities)
  assert.equal(runtime.buildCalls.length, previousBuildCount)
})

test('failed initial load leaves the engine empty and clears loading state', async () => {
  const { engine, runtime } = createMountedEngine()

  await assert.rejects(
    () =>
      withMockedLoader(
        async () => {
          throw new Error('initial load failure')
        },
        async () => {
          await engine.loadModel('/models/missing.glb')
        },
      ),
    /initial load failure/,
  )

  assert.equal(useEngineStore.getState().isLoading, false)
  assert.equal(useEngineStore.getState().hasModel, false)
  assert.deepEqual(useEngineStore.getState().entities, [])
  assert.equal(engine.getCanonicalSceneSnapshot(), null)
  assert.equal(runtime.buildCalls.length, 0)
})

test('successful replacement load clears the old runtime scene before applying the new one', async () => {
  const { engine, runtime } = createMountedEngine()

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('first-root') }),
    async () => {
      await engine.loadModel('/models/first.glb')
    },
  )

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('second-root') }),
    async () => {
      await engine.loadModel('/models/second.glb')
    },
  )

  assert.equal(runtime.buildCalls.length, 4)
  assert.deepEqual(runtime.buildCalls[2], createEmptySceneDoc())
  assert.equal(runtime.buildCalls[3].roots.length, 1)
  assert.equal(useEngineStore.getState().entities[0]?.name, 'second-root-mesh')
})

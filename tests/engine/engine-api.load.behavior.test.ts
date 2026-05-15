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
    trackedObjectTransform: null,
    studioSetupObjects: [],
    selectedStudioObjectNodeId: null,
    activeLookId: 'look-studio-neutral',
    activeShot: {
      id: 'shot-main',
      name: 'Main Shot',
      durationSeconds: 5,
      fps: 30,
      aspect: { width: 16, height: 9 },
    },
    timelineRows: [],
    timelineTimeSeconds: 0,
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

test('loadModel loads a scene into the project studio shell and publishes canonical entities', async () => {
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
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [0, 0, 0])
  assert.equal(runtime.sceneAssetsHistory.length, 1)
  assert.ok(runtime.sceneAssetsHistory[0], 'loaded assets should be stored on the runtime')
  assert.equal(runtime.buildCalls.length, 1)
  assert.deepEqual(runtime.buildCalls[0].roots, ['node-studio-root'])
  assert.deepEqual(runtime.buildCalls[0].nodes['node-render-camera']?.camera, {
    kind: 'perspective',
    fovDegrees: 45,
    near: 0.1,
    far: 100,
  })
  assert.deepEqual(runtime.buildCalls[0].nodes['node-light-key']?.light, {
    kind: 'directional',
    intensity: 1.2,
    color: [1, 0.98, 0.95],
  })
  assert.equal(runtime.buildCalls[0].materials['material-0']?.envMapIntensity, 1.2)
  assert.equal(useEngineStore.getState().canUndo, false)
  assert.equal(useEngineStore.getState().canRedo, false)
})

test('EngineAPI keeps a studio project before import and replaces only the primary product slot', async () => {
  const { engine } = createMountedEngine()
  const initialProject = engine.getProjectSnapshot()

  assert.equal(initialProject.studioScene.name, 'Studio Scene')
  assert.equal(
    initialProject.studioScene.productSlots[initialProject.studioScene.primaryProductSlotId].asset,
    null,
  )

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('first-product') }),
    async () => {
      await engine.loadModel('/models/first.glb')
    },
  )

  const afterFirstImport = engine.getProjectSnapshot()
  const sceneAfterFirstImport = engine.getCanonicalSceneSnapshot()
  const primarySlotId = afterFirstImport.studioScene.primaryProductSlotId
  const primarySlotNodeId = afterFirstImport.studioScene.productSlots[primarySlotId].nodeId
  const environmentBeforeReplacement = structuredClone(afterFirstImport.studioScene.environment)
  const lookBeforeReplacement = structuredClone(afterFirstImport.look)
  const mainShotBeforeReplacement = structuredClone(afterFirstImport.shots['shot-main'])

  assert.ok(sceneAfterFirstImport)
  assert.deepEqual(sceneAfterFirstImport.roots, ['node-studio-root'])
  assert.ok(sceneAfterFirstImport.nodes['node-studio-root']?.children.includes(primarySlotNodeId))
  assert.deepEqual(sceneAfterFirstImport.nodes[primarySlotNodeId]?.children, ['node-0'])
  assert.equal(sceneAfterFirstImport.nodes['node-0']?.parentId, primarySlotNodeId)
  assert.equal(sceneAfterFirstImport.nodes['node-1']?.parentId, 'node-0')
  assert.deepEqual(afterFirstImport.studioScene.productSlots[primarySlotId].asset, {
    uri: '/models/first.glb',
    rootNodeId: 'node-0',
  })

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('second-product') }),
    async () => {
      await engine.loadModel('/models/second.glb')
    },
  )

  const afterReplacement = engine.getProjectSnapshot()
  const sceneAfterReplacement = engine.getCanonicalSceneSnapshot()

  assert.deepEqual(afterReplacement.studioScene.productSlots[primarySlotId].asset, {
    uri: '/models/second.glb',
    rootNodeId: 'node-0',
  })
  assert.ok(sceneAfterReplacement)
  assert.equal(sceneAfterReplacement.nodes[primarySlotNodeId]?.children.length, 1)
  assert.equal(sceneAfterReplacement.nodes[primarySlotNodeId]?.children[0], 'node-0')
  assert.equal(sceneAfterReplacement.nodes['node-0']?.name, 'ProductRoot')
  assert.equal(sceneAfterReplacement.nodes['node-1']?.name, 'second-product')
  assert.deepEqual(afterReplacement.studioScene.environment, environmentBeforeReplacement)
  assert.deepEqual(afterReplacement.look, lookBeforeReplacement)
  assert.deepEqual(afterReplacement.shots['shot-main'], mainShotBeforeReplacement)
})

test('EngineAPI applies Look presets through project state and runtime view settings', () => {
  const { engine, runtime } = createMountedEngine()
  const initialViewSettingsCallCount = runtime.viewSettingsCalls.length

  engine.applyLookPreset('warm-hero')

  assert.deepEqual(engine.getLookPresets().map((preset) => preset.id), [
    'look-studio-neutral',
    'look-warm-hero',
    'look-cool-contrast',
  ])
  assert.equal(engine.getProjectSnapshot().look.id, 'look-warm-hero')
  assert.equal(useEngineStore.getState().exposure, 1.25)
  assert.deepEqual(useEngineStore.getState().bloom, {
    strength: 0.45,
    radius: 0.7,
    threshold: 0.82,
  })
  assert.deepEqual(useEngineStore.getState().cinematic, {
    vignette: 0.42,
    vignetteEnabled: true,
    chromaticAberration: 0.002,
    filmGrain: 0.012,
    colorTemperature: 0.28,
  })
  assert.equal(runtime.viewSettingsCalls.length, initialViewSettingsCallCount + 1)
  assert.equal(runtime.viewSettingsCalls.at(-1)?.exposure, 1.25)
})

test('EngineAPI keeps Studio Scene HDRI in project state and runtime view settings', async () => {
  const { engine, runtime } = createMountedEngine()
  const initialViewSettingsCallCount = runtime.viewSettingsCalls.length

  await engine.setHDRI('moody')

  assert.equal(engine.getProjectSnapshot().studioScene.environment.hdriId, 'moody')
  assert.equal(useEngineStore.getState().activeHDRI, 'moody')
  assert.equal(runtime.viewSettingsCalls.length, initialViewSettingsCallCount + 1)
  assert.equal(runtime.viewSettingsCalls.at(-1)?.activeHDRI, 'moody')
})

test('EngineAPI applies a studio preset before import and preserves it through replacement', async () => {
  const { engine } = createMountedEngine()

  await engine.applyStudioPreset('soft-box-plinth')

  assert.deepEqual(useEngineStore.getState().studioSetupObjects.map((object) => object.nodeId), [
    'node-studio-floor',
    'node-studio-backdrop',
    'node-studio-plinth',
  ])
  assert.deepEqual(
    useEngineStore.getState().studioSetupObjects.map((object) => object.editable.animationTarget),
    [false, false, false],
  )
  assert.equal(engine.getCanonicalSceneSnapshot()?.nodes['node-studio-floor']?.visible, true)
  assert.equal(engine.getCanonicalSceneSnapshot()?.nodes['node-studio-floor']?.meshId, 'mesh-studio-geometry-floor')
  assert.equal(
    engine.getCanonicalSceneSnapshot()?.nodes['node-studio-floor']?.materialId,
    'material-studio-matte-white',
  )
  assert.equal(
    engine.getCanonicalSceneSnapshot()?.meshes['mesh-studio-geometry-backdrop']?.source.uri,
    '/models/room/source/Untitled.glb',
  )
  assert.equal(
    engine.getCanonicalSceneSnapshot()?.meshes['mesh-studio-geometry-plinth']?.source.uri,
    'builtin:studio/plinth',
  )

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('preset-product') }),
    async () => {
      await engine.loadModel('/models/preset-product.glb')
    },
  )

  const projectAfterImport = engine.getProjectSnapshot()
  const studioGeometryBeforeReplacement = structuredClone(projectAfterImport.studioScene.studioGeometry)

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('preset-replacement') }),
    async () => {
      await engine.loadModel('/models/preset-replacement.glb')
    },
  )

  assert.deepEqual(engine.getProjectSnapshot().studioScene.studioGeometry, studioGeometryBeforeReplacement)
  assert.equal(engine.getCanonicalSceneSnapshot()?.nodes['node-studio-plinth']?.parentId, 'node-studio-root')
})

test('EngineAPI publishes timeline rows and motion layers for animate mode', async () => {
  const { engine } = createMountedEngine()

  await withMockedLoader(
    async () => ({ scene: createStubGLTFScene('animated-product') }),
    async () => {
      await engine.loadModel('/models/animated-product.glb')
    },
  )

  const layerId = engine.addMotionPreset('node-render-camera', 'camera-dolly-in')
  engine.updateMotionLayer(layerId, {
    startTimeSeconds: 1,
    durationSeconds: 4,
    strength: 0.8,
  })
  engine.previewAnimation(1.5)

  const state = useEngineStore.getState()
  const cameraRow = state.timelineRows.find((row) => row.targetNodeId === 'node-render-camera')
  const cameraLayer = cameraRow?.tracks[0]?.layers[0]

  assert.equal(state.activeShot.id, 'shot-main')
  assert.equal(state.timelineTimeSeconds, 1.5)
  assert.equal(cameraLayer?.id, layerId)
  assert.equal(cameraLayer?.presetId, 'camera-dolly-in')
  assert.equal(cameraLayer?.durationSeconds, 4)
  assert.equal(cameraLayer?.strength, 0.8)
  assert.equal(cameraLayer?.easing, 'ease-out')
})

test('EngineAPI can add a motion preset to a secondary track in the active row', () => {
  const { engine } = createMountedEngine()

  const trackId = engine.addTrack('node-product-slot-primary', 'Spin')
  const layerId = engine.addMotionPreset('node-product-slot-primary', 'object-spin', trackId)

  const state = useEngineStore.getState()
  const productRow = state.timelineRows.find((row) => row.targetNodeId === 'node-product-slot-primary')

  assert.equal(productRow?.tracks.length, 2)
  assert.equal(productRow?.tracks[1]?.id, trackId)
  assert.equal(productRow?.tracks[1]?.layers[0]?.id, layerId)
  assert.equal(productRow?.tracks[1]?.layers[0]?.presetId, 'object-spin')
  assert.equal(productRow?.tracks[0]?.layers.length, 0)
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
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [0, 0, 0])
  assert.deepEqual(
    engine.getProjectSnapshot().studioScene.productSlots['product-slot-primary'].asset,
    {
      uri: 'product.glb',
      rootNodeId: 'node-0',
    },
  )
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
  assert.deepEqual(useEngineStore.getState().trackedObjectTransform?.position, [0, 0, 0])
  assert.deepEqual(
    engine.getProjectSnapshot().studioScene.productSlots['product-slot-primary'].asset,
    {
      uri: 'scene.gltf',
      rootNodeId: 'node-0',
    },
  )
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
  const previousProject = engine.getProjectSnapshot()
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
  assert.deepEqual(engine.getProjectSnapshot(), previousProject)
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
  assert.equal(useEngineStore.getState().trackedObjectTransform, null)
  assert.equal(engine.getCanonicalSceneSnapshot(), null)
  assert.equal(runtime.buildCalls.length, 0)
})

test('successful replacement load rebuilds directly from the next studio scene', async () => {
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

  assert.equal(runtime.buildCalls.length, 2)
  assert.deepEqual(runtime.sceneAssetsHistory.map((assets) => assets?.sourceUri ?? null), [
    '/models/first.glb',
    '/models/second.glb',
  ])
  assert.deepEqual(runtime.buildCalls[1].roots, ['node-studio-root'])
  assert.equal(useEngineStore.getState().entities[0]?.name, 'second-root-mesh')
})

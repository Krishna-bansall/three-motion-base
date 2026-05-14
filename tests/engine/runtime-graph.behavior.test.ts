import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineAPI } from '../../src/engine/EngineAPI.ts'
import { convertCanonicalToBackendSchema } from '../../src/engine/runtime/conversion/canonicalToBackend.ts'
import { createEmptySceneDoc, cloneSceneDoc } from '../../src/engine/scene/snapshot.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { createDefaultViewSettings } from '../../src/engine/viewSettings.ts'
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
  constructor(public runtimeGraph: RuntimeDebugGraph) {}
  mount(): void {}
  unmount(): void {}
  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void {
    void assets
  }
  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    void scene
  }
  async applyDirty(delta: unknown, scene: SceneDoc): Promise<void> {
    void delta
    void scene
  }
  async setViewSettings(settings: ViewSettings): Promise<void> {
    void settings
  }
  getViewSettings(): ViewSettings {
    return createDefaultViewSettings()
  }
  setTransformToolMode(mode: TransformGizmoMode | null): void {
    void mode
  }
  getTransformToolMode(): TransformGizmoMode | null { return 'rotate' }
  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void {
    void cb
  }
  onTransformInteractionStart(cb: (() => void) | null): void {
    void cb
  }
  onTransformInteractionEnd(cb: (() => void) | null): void {
    void cb
  }
  async exportPNG(): Promise<Blob> { return new Blob(['fake'], { type: 'image/png' }) }
  getEnvironmentPreviews(): EnvironmentPreview[] { return [] }
  getRuntimeDebugGraph(scene: SceneDoc): RuntimeDebugGraph {
    void scene
    return this.runtimeGraph
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

function createSceneWithExtras(): SceneDoc {
  const scene = createEmptySceneDoc()
  scene.roots.push('node-root')
  scene.meshes['mesh-body'] = {
    source: { uri: 'sample.glb', primitive: 0 },
  }
  scene.materials['material-body'] = {
    baseColor: [0.2, 0.5, 0.8],
    roughness: 0.35,
    metalness: 0.1,
    envMapIntensity: 1.2,
    extras: { clearcoat: 0.4 },
  }
  scene.nodes['node-root'] = {
    id: 'node-root',
    parentId: null,
    children: ['node-body'],
    name: 'ProductRoot',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['node-body'] = {
    id: 'node-body',
    parentId: 'node-root',
    children: [],
    name: 'Body',
    t: [1, 2, 3],
    r: [0, 0.5, 0, 0.8660254037844386],
    s: [2, 2, 2],
    meshId: 'mesh-body',
    materialId: 'material-body',
    visible: false,
    extras: { backendHint: 'requires-special-case' },
  }
  return scene
}

test.beforeEach(() => {
  resetStore()
})

test('convertCanonicalToBackendSchema preserves canonical content and reports extras as unsupported', () => {
  const backendScene = convertCanonicalToBackendSchema(createSceneWithExtras())

  assert.deepEqual(backendScene.roots, ['node-root'])
  assert.deepEqual(backendScene.meshes, [
    { id: 'mesh-body', sourceUri: 'sample.glb', primitive: 0 },
  ])
  assert.deepEqual(backendScene.materials, [
    {
      id: 'material-body',
      baseColor: [0.2, 0.5, 0.8],
      roughness: 0.35,
      metalness: 0.1,
      envMapIntensity: 1.2,
    },
  ])
  assert.deepEqual(backendScene.unsupported, [
    {
      id: 'node-body',
      reason: 'Node extras require backend-specific interpretation.',
      severity: 'warning',
    },
    {
      id: 'material-body',
      reason: 'Material extras are preserved but not translated into backend schema fields.',
      severity: 'warning',
    },
  ])
})

test('getRuntimeStateGraph merges store state, history state, and runtime debug graph', () => {
  const runtime = new FakeRuntime({
    root: {
      nodeId: 'node-root',
      name: 'ProductRoot',
      transform: {
        t: [0, 0, 0],
        r: [0, 0, 0, 1],
        s: [1, 1, 1],
      },
    },
    meshes: [
      {
        nodeId: 'node-body',
        name: 'Body',
        transform: {
          t: [1, 2, 3],
          r: [0, 0.5, 0, 0.8660254037844386],
          s: [2, 2, 2],
        },
        materialId: 'material-body',
      },
    ],
  })
  const engine = new EngineAPI(runtime)
  ;(engine as unknown as { currentScene: SceneDoc }).currentScene = cloneSceneDoc(createSceneWithExtras())
  ;(engine as unknown as { initializeHistory: () => void }).initializeHistory()

  useEngineStore.setState({
    hasModel: true,
    activeHDRI: 'daylight',
    exposure: 1.7,
    autoRotate: true,
    autoRotateSpeed: 0.6,
    trackedObjectTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      distanceFromOrigin: 0,
    },
  })

  engine.setExposure(2.1)

  const graph = engine.getRuntimeStateGraph()

  assert.deepEqual(graph.history, {
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
    currentIndex: 1,
    totalStates: 2,
  })
  assert.deepEqual(graph.scene, {
    hasModel: true,
    isLoading: false,
    activeHDRI: 'daylight',
    exposure: 2.1,
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 },
    cinematic: {
      vignette: 0.35,
      vignetteEnabled: true,
      chromaticAberration: 0.003,
      filmGrain: 0,
      colorTemperature: 0,
    },
    autoRotate: true,
    autoRotateSpeed: 0.6,
    transformMode: 'rotate',
    trackedObjectTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      distanceFromOrigin: 0,
    },
  })
  assert.deepEqual(graph.root, runtime.runtimeGraph.root)
  assert.deepEqual(graph.meshes, runtime.runtimeGraph.meshes)
})

test('getPathTracingReadinessReport surfaces mesh sources and unsupported warnings', () => {
  const engine = new EngineAPI(new FakeRuntime({ root: null, meshes: [] }))
  ;(engine as unknown as { currentScene: SceneDoc }).currentScene = cloneSceneDoc(createSceneWithExtras())

  assert.deepEqual(engine.getPathTracingReadinessReport(), {
    nodes: [
      {
        nodeId: 'node-body',
        meshId: 'mesh-body',
        materialId: 'material-body',
        source: {
          id: 'mesh-body',
          sourceUri: 'sample.glb',
          primitive: 0,
        },
      },
    ],
    warnings: [
      'node-body: Node extras require backend-specific interpretation.',
      'material-body: Material extras are preserved but not translated into backend schema fields.',
    ],
  })
})

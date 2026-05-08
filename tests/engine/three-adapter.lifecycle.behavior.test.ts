import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { ThreeAdapter } from '../../src/engine/runtime/three/ThreeAdapter.ts'
import { createEmptySceneDoc, cloneSceneDoc } from '../../src/engine/scene/snapshot.ts'
import { diffSceneDocs } from '../../src/engine/scene/diff.ts'
import { getEnvironmentPreviews, HDRI_PATHS } from '../../src/engine/runtime/environment.ts'
import {
  buildConsoleState,
  buildSceneSnapshot,
  publishEntities,
  publishViewSettings,
  readViewSettingsFromStore,
} from '../../src/engine/store/engineStateBridge.ts'
import { setNodeMaterial, setNodeVisible, patchMaterial, setNodeTRS } from '../../src/engine/scene/mutations.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { createDefaultViewSettings } from '../../src/engine/viewSettings.ts'
import type { RuntimeSceneAssetBundle, RuntimeSceneInstance, ViewSettings } from '../../src/engine/runtime/types.ts'
import type { SceneDoc } from '../../src/engine/scene/types.ts'

function createScene(): SceneDoc {
  const scene = createEmptySceneDoc()
  scene.roots.push('node-root')
  scene.meshes['mesh-0'] = { source: { uri: 'sample.glb', primitive: 0 } }
  scene.materials['material-0'] = {
    baseColor: [1, 0, 0],
    roughness: 0.4,
    metalness: 0.1,
    envMapIntensity: 1,
  }
  scene.nodes['node-root'] = {
    id: 'node-root',
    parentId: null,
    children: ['node-mesh'],
    name: 'ProductRoot',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['node-mesh'] = {
    id: 'node-mesh',
    parentId: 'node-root',
    children: [],
    name: 'MeshNode',
    t: [1, 2, 3],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    meshId: 'mesh-0',
    materialId: 'material-0',
    visible: true,
  }
  return scene
}

function createRuntimeAssets(): RuntimeSceneAssetBundle {
  return {
    canonicalScene: createScene(),
    sourceUri: 'sample.glb',
    rootNodeId: 'node-root',
    instantiate(): RuntimeSceneInstance {
      const rootObject = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
      mesh.name = 'MeshNode'
      rootObject.add(mesh)
      return {
        rootNodeId: 'node-root',
        rootObject,
        nodeObjects: new Map([
          ['node-root', rootObject],
          ['node-mesh', mesh],
        ]),
        materialObjects: new Map([
          ['material-0', [mesh.material]],
        ]),
      }
    },
  }
}

function createViewSettings(overrides: Partial<ViewSettings> = {}): ViewSettings {
  const defaults = createDefaultViewSettings()
  return {
    ...defaults,
    ...overrides,
    bloom: {
      ...defaults.bloom,
      ...overrides.bloom,
    },
    cinematic: {
      ...defaults.cinematic,
      ...overrides.cinematic,
    },
  }
}

function attachFakeRenderer(adapter: ThreeAdapter) {
  const productRoot = new THREE.Group()
  const loadHDRICalls: string[] = []
  const setExposureCalls: number[] = []
  let transformMode: 'translate' | 'rotate' | 'scale' | null = null
  const renderer = {
    productRoot,
    renderer: { domElement: {} } as THREE.WebGLRenderer,
    postProcessing: {
      setBloom: (...args: [number, number, number]) => bloomCalls.push(args),
      setVignetteEnabled: (value: boolean) => vignetteEnabledCalls.push(value),
      setVignette: (...args: [number, number]) => vignetteCalls.push(args),
      setChromaticAberration: (value: number) => chromaticCalls.push(value),
      setFilmGrain: (value: number) => grainCalls.push(value),
      setColorTemperature: (value: number) => tempCalls.push(value),
    },
    turntable: {
      autoRotate: false,
      autoRotateSpeed: 0,
    },
    onProductTransformChange: null as (() => void) | null,
    onTransformInteractionStart: null as (() => void) | null,
    onTransformInteractionEnd: null as (() => void) | null,
    mount: () => {},
    unmount: () => { unmountCount += 1 },
    loadHDRI: async (preset: string) => { loadHDRICalls.push(preset) },
    setExposure: (value: number) => { setExposureCalls.push(value) },
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale' | null) => { transformMode = mode },
    getTransformMode: () => transformMode,
  }
  const bloomCalls: Array<[number, number, number]> = []
  const vignetteEnabledCalls: boolean[] = []
  const vignetteCalls: Array<[number, number]> = []
  const chromaticCalls: number[] = []
  const grainCalls: number[] = []
  const tempCalls: number[] = []
  let unmountCount = 0

  ;(adapter as unknown as { renderer: typeof renderer }).renderer = renderer

  return {
    renderer,
    productRoot,
    loadHDRICalls,
    setExposureCalls,
    bloomCalls,
    vignetteEnabledCalls,
    vignetteCalls,
    chromaticCalls,
    grainCalls,
    tempCalls,
    getTransformMode: () => transformMode,
    getUnountCount: () => unmountCount,
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

test.beforeEach(() => {
  resetStore()
})

test('ThreeAdapter.buildFromCanonical clears previous runtime children before rebuilding', async () => {
  const adapter = new ThreeAdapter()
  const runtime = attachFakeRenderer(adapter)
  runtime.productRoot.add(new THREE.Group(), new THREE.Group())

  adapter.setSceneAssets(createRuntimeAssets())
  await adapter.buildFromCanonical(createScene())

  assert.equal(runtime.productRoot.children.length, 1)
  assert.equal((runtime.productRoot.children[0] as THREE.Mesh).name, 'MeshNode')
})

test('ThreeAdapter.setViewSettings loads HDRI only when preset changes and pushes renderer settings', async () => {
  const adapter = new ThreeAdapter()
  const runtime = attachFakeRenderer(adapter)

  const studio = createViewSettings()
  const moody = createViewSettings({
    activeHDRI: 'moody',
    exposure: 2.2,
    autoRotate: true,
    autoRotateSpeed: 0.8,
    bloom: { strength: 0.7, radius: 0.4, threshold: 0.2 },
    cinematic: {
      vignette: 0.6,
      vignetteEnabled: false,
      chromaticAberration: 0.01,
      filmGrain: 0.05,
      colorTemperature: 0.4,
    },
  })

  await adapter.setViewSettings(studio)
  await adapter.setViewSettings(studio)
  await adapter.setViewSettings(moody)

  assert.deepEqual(runtime.loadHDRICalls, ['moody'])
  assert.deepEqual(runtime.setExposureCalls, [1, 1, 2.2])
  assert.deepEqual(runtime.bloomCalls.at(-1), [0.7, 0.4, 0.2])
  assert.deepEqual(runtime.vignetteEnabledCalls.at(-1), false)
  assert.deepEqual(runtime.vignetteCalls.at(-1), [0.6, 0.9])
  assert.equal(runtime.chromaticCalls.at(-1), 0.01)
  assert.equal(runtime.grainCalls.at(-1), 0.05)
  assert.equal(runtime.tempCalls.at(-1), 0.4)
  assert.equal(runtime.renderer.turntable.autoRotate, true)
  assert.equal(runtime.renderer.turntable.autoRotateSpeed, 0.8)
  assert.deepEqual(adapter.getViewSettings(), moody)
})

test('ThreeAdapter exportPNG throws when runtime is not mounted', async () => {
  const adapter = new ThreeAdapter()
  await assert.rejects(() => adapter.exportPNG(3), /Runtime adapter not mounted/)
})

test('ThreeAdapter delegates transform mode to the renderer', () => {
  const adapter = new ThreeAdapter()
  const runtime = attachFakeRenderer(adapter)

  adapter.setTransformToolMode('scale')

  assert.equal(runtime.getTransformMode(), 'scale')
  assert.equal(adapter.getTransformToolMode(), 'scale')
})

test('ThreeAdapter unmount clears callbacks and object caches', () => {
  const adapter = new ThreeAdapter()
  const runtime = attachFakeRenderer(adapter)
  ;(adapter as unknown as { nodeObjects: Map<string, object> }).nodeObjects.set('node-root', {})
  ;(adapter as unknown as { materialObjects: Map<string, object[]> }).materialObjects.set('material-0', [{}])

  adapter.unmount()

  assert.equal(runtime.renderer.onProductTransformChange, null)
  assert.equal(runtime.renderer.onTransformInteractionStart, null)
  assert.equal(runtime.renderer.onTransformInteractionEnd, null)
  assert.equal((adapter as unknown as { nodeObjects: Map<string, object> }).nodeObjects.size, 0)
  assert.equal((adapter as unknown as { materialObjects: Map<string, object[]> }).materialObjects.size, 0)
  assert.equal(runtime.getUnountCount(), 1)
})

test('scene mutations and diffs capture structural changes and extras patches', () => {
  const original = createScene()
  const next = cloneSceneDoc(original)

  setNodeVisible(next, 'node-mesh', false)
  setNodeMaterial(next, 'node-mesh', undefined)
  setNodeTRS(next, 'node-root', { t: [9, 8, 7] })
  patchMaterial(next, 'material-0', { extras: { clearcoat: 0.5 } })
  next.roots = ['node-mesh']
  next.meshes['mesh-1'] = { source: { uri: 'alt.glb', primitive: 1 } }
  next.nodes['node-new'] = {
    id: 'node-new',
    parentId: 'node-root',
    children: [],
    name: 'NewNode',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  delete next.nodes['node-mesh']
  delete next.meshes['mesh-0']
  next.materials['material-1'] = {
    baseColor: [0, 1, 0],
    roughness: 0.2,
    metalness: 0.6,
    envMapIntensity: 1.3,
  }
  delete next.materials['material-0']

  const delta = diffSceneDocs(original, next)

  assert.equal(delta.rootsChanged, true)
  assert.deepEqual(delta.addedNodeIds, ['node-new'])
  assert.deepEqual(delta.removedNodeIds, ['node-mesh'])
  assert.deepEqual(delta.changedNodes['node-root']?.t, [9, 8, 7])
  assert.deepEqual(delta.addedMeshIds, ['mesh-1'])
  assert.deepEqual(delta.removedMeshIds, ['mesh-0'])
  assert.deepEqual(delta.addedMaterialIds, ['material-1'])
  assert.deepEqual(delta.removedMaterialIds, ['material-0'])
  assert.deepEqual(next.materials['material-0'], undefined)
})

test('scene mutations throw on unknown ids', () => {
  const scene = createScene()

  assert.throws(() => setNodeVisible(scene, 'missing', true), /Unknown scene node/)
  assert.throws(() => setNodeMaterial(scene, 'missing', 'material-0'), /Unknown scene node/)
  assert.throws(() => patchMaterial(scene, 'missing', { roughness: 0.2 }), /Unknown material/)
})

test('environment previews and store bridge expose stable UI-ready state', () => {
  publishViewSettings(createViewSettings({
    activeHDRI: 'moody',
    exposure: 1.9,
    autoRotate: true,
    autoRotateSpeed: 0.7,
  }))
  publishEntities(createScene())

  const previews = getEnvironmentPreviews()
  const viewSettings = readViewSettingsFromStore()
  const sceneSnapshot = buildSceneSnapshot(true, 'scale')
  const consoleState = buildConsoleState({
    hasCanonicalScene: true,
    canUndo: true,
    canRedo: false,
    undoDepth: 2,
    redoDepth: 0,
    currentIndex: 2,
    totalStates: 3,
    transformMode: 'scale',
    pathTracingReadiness: { warnings: [] },
  })

  assert.deepEqual(HDRI_PATHS, {
    studio: '/hdri/studio.hdr',
    moody: '/hdri/moody.hdr',
    daylight: '/hdri/daylight.hdr',
  })
  assert.equal(previews.length, 3)
  assert.equal(previews[0]?.imageUrl.startsWith('data:image/svg+xml'), true)
  assert.deepEqual(viewSettings.activeHDRI, 'moody')
  assert.equal((sceneSnapshot as { hasCanonicalScene: boolean }).hasCanonicalScene, true)
  assert.equal((sceneSnapshot as { transformMode: string }).transformMode, 'scale')
  assert.equal((sceneSnapshot as { trackedObjectTransform: null }).trackedObjectTransform, null)
  assert.equal((consoleState as { history: { undoDepth: number } }).history.undoDepth, 2)
  assert.equal((consoleState as { pathTracingReadiness: { warnings: unknown[] } }).pathTracingReadiness.warnings.length, 0)
})

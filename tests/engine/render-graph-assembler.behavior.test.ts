import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStudioPreset, createDefaultProject, replaceProductSlotAsset } from '../../src/engine/project/document.ts'
import { createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'
import type { AssetGraphDoc, RenderGraphDoc, SceneDoc } from '../../src/engine/scene/types.ts'
import type { MountOverrides } from '../../src/engine/project/types.ts'
import { assemble } from '../../src/engine/renderGraph/RenderGraphAssembler.ts'

test('assemble creates a render graph from project-owned studio setup without loading assets', () => {
  const project = applyStudioPreset(createDefaultProject(), 'soft-box-plinth')

  const renderGraph = assemble(project, new Map())

  assert.deepEqual(renderGraph.roots, ['node-studio-root'])
  assert.equal(renderGraph.nodes['node-studio-root'].name, 'Studio Scene')
  assert.deepEqual(renderGraph.nodes['node-studio-root'].children, [
    'node-product-slot-primary',
    'node-render-camera',
    'node-light-key',
    'node-light-fill',
    'node-light-rim',
    'node-studio-floor',
    'node-studio-backdrop',
    'node-studio-plinth',
  ])
  assert.deepEqual(renderGraph.nodes['node-render-camera'].camera, {
    kind: 'perspective',
    fovDegrees: 45,
    near: 0.1,
    far: 100,
  })
  assert.deepEqual(renderGraph.nodes['node-light-key'].light, {
    kind: 'directional',
    intensity: 1.2,
    color: [1, 0.98, 0.95],
  })
  assert.equal(renderGraph.nodes['node-studio-floor'].meshId, 'mesh-studio-geometry-floor')
  assert.deepEqual(renderGraph.meshes['mesh-studio-geometry-plinth'].source, {
    uri: 'builtin:studio/plinth',
  })
  assert.equal(renderGraph.materials['material-studio-matte-white'].roughness, 0.78)
})

test('assemble mounts AssetGraphDoc roots under the project product slot without mutating source content', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'asset-root',
  })
  const assetGraph = createAssetGraph()
  const originalAssetGraph = structuredClone(assetGraph)

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetGraph],
  ]))

  assert.deepEqual(renderGraph.nodes['node-product-slot-primary'].children, ['asset-root'])
  assert.equal(renderGraph.nodes['asset-root'].parentId, 'node-product-slot-primary')
  assert.equal(renderGraph.nodes['asset-child'].parentId, 'asset-root')
  assert.equal(renderGraph.nodes['asset-child'].meshId, 'mesh-watch-body')
  assert.deepEqual(renderGraph.meshes['mesh-watch-body'], {
    source: {
      uri: 'file:///imports/watch.glb',
      primitive: 0,
    },
  })
  assert.deepEqual(renderGraph.materials['material-watch-body'].baseColor, [0.7, 0.2, 0.1])
  assert.deepEqual(assetGraph, originalAssetGraph)
})

test('assemble strips imported cameras from mounted asset content because only studio cameras render', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/scene-with-camera.glb',
    rootNodeId: 'asset-root',
  })
  const assetWithCamera = createAssetGraphWithCamera()

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetWithCamera],
  ]))

  assert.equal(renderGraph.nodes['asset-camera'].camera, undefined)
  assert.equal(renderGraph.nodes['asset-camera'].name, 'Imported Camera')
  assert.equal(renderGraph.nodes['asset-camera'].parentId, 'asset-root')
})

test('assemble strips imported lights from mounted asset content because imported lights are candidates, not active', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/scene-with-light.glb',
    rootNodeId: 'asset-root',
  })
  const assetWithLight = createAssetGraphWithLight()

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetWithLight],
  ]))

  assert.equal(renderGraph.nodes['asset-light'].light, undefined)
  assert.equal(renderGraph.nodes['asset-light'].name, 'Imported Light')
  assert.equal(renderGraph.nodes['asset-light'].parentId, 'asset-root')
})

function createAssetGraph(): AssetGraphDoc {
  const scene: SceneDoc = createEmptySceneDoc()
  scene.roots.push('asset-root')
  scene.nodes['asset-root'] = {
    id: 'asset-root',
    parentId: null,
    children: ['asset-child'],
    name: 'Watch',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['asset-child'] = {
    id: 'asset-child',
    parentId: 'asset-root',
    children: [],
    name: 'Watch Body',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    meshId: 'mesh-watch-body',
    materialId: 'material-watch-body',
    visible: true,
  }
  scene.meshes['mesh-watch-body'] = {
    source: {
      uri: 'file:///imports/watch.glb',
      primitive: 0,
    },
  }
  scene.materials['material-watch-body'] = {
    baseColor: [0.7, 0.2, 0.1],
    roughness: 0.4,
    metalness: 0.8,
    envMapIntensity: 1,
  }

  return scene
}

function createAssetGraphWithCamera(): AssetGraphDoc {
  const scene = structuredClone(createAssetGraph()) as SceneDoc
  const root = scene.nodes['asset-root']!
  root.children = [...root.children, 'asset-camera']
  scene.nodes['asset-camera'] = {
    id: 'asset-camera',
    parentId: 'asset-root',
    children: [],
    name: 'Imported Camera',
    t: [0, 1, 2],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    camera: {
      kind: 'perspective',
      fovDegrees: 35,
      near: 0.1,
      far: 100,
    },
    visible: true,
  }
  return scene
}

function createAssetGraphWithLight(): AssetGraphDoc {
  const scene = structuredClone(createAssetGraph()) as SceneDoc
  const root = scene.nodes['asset-root']!
  root.children = [...root.children, 'asset-light']
  scene.nodes['asset-light'] = {
    id: 'asset-light',
    parentId: 'asset-root',
    children: [],
    name: 'Imported Light',
    t: [2, 3, 1],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    light: {
      kind: 'directional',
      intensity: 0.8,
      color: [1, 1, 1],
    },
    visible: true,
  }
  return scene
}

test('assemble applies visibility overrides from mount overrides to mounted asset nodes', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'asset-root',
  })
  // Simulate a mount with a visibility override hiding 'asset-child'
  const mountOverrides: MountOverrides = {
    transforms: {},
    materials: {},
    visibility: {
      'asset-child': { visible: false },
    },
    variants: {},
  }
  const slotId = project.studioScene.primaryProductSlotId
  project.studioScene.productSlots[slotId]!.asset = {
    ...project.studioScene.productSlots[slotId]!.asset!,
    mount: {
      id: `mount-${slotId}`,
      kind: 'product-slot',
      slotId,
      assetId: 'asset-watch',
      assetRootNodeId: 'asset-root',
      overrides: mountOverrides,
    },
  }
  const assetGraph = createAssetGraph()

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetGraph],
  ]))

  // The asset-child should be hidden in the render graph via the override
  assert.equal(renderGraph.nodes['asset-child'].visible, false)
  // The root should remain visible (no override)
  assert.equal(renderGraph.nodes['asset-root'].visible, true)
})

test('assemble applies material overrides from mount overrides to mounted asset nodes', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'asset-root',
  })
  // Simulate a mount with a material override changing roughness on 'asset-child'
  const mountOverrides: MountOverrides = {
    transforms: {},
    materials: {
      'asset-child': {
        roughness: 0.9,
        metalness: 0.1,
      },
    },
    visibility: {},
    variants: {},
  }
  const slotId = project.studioScene.primaryProductSlotId
  project.studioScene.productSlots[slotId]!.asset = {
    ...project.studioScene.productSlots[slotId]!.asset!,
    mount: {
      id: `mount-${slotId}`,
      kind: 'product-slot',
      slotId,
      assetId: 'asset-watch',
      assetRootNodeId: 'asset-root',
      overrides: mountOverrides,
    },
  }
  const assetGraph = createAssetGraph()

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetGraph],
  ]))

  // The asset-child's material should be patched by the override
  assert.equal(renderGraph.materials['material-watch-body'].roughness, 0.9)
  assert.equal(renderGraph.materials['material-watch-body'].metalness, 0.1)
  // Base color should be preserved (not overridden)
  assert.deepEqual(renderGraph.materials['material-watch-body'].baseColor, [0.7, 0.2, 0.1])
})

test('assemble applies transform overrides from mount overrides to mounted asset nodes', () => {
  const baseProject = createDefaultProject()
  const project = replaceProductSlotAsset(baseProject, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'asset-root',
  })
  // Simulate a mount with a transform override translating 'asset-child'
  const mountOverrides: MountOverrides = {
    transforms: {
      'asset-child': {
        t: [1, 2, 3],
      },
    },
    materials: {},
    visibility: {},
    variants: {},
  }
  const slotId = project.studioScene.primaryProductSlotId
  project.studioScene.productSlots[slotId]!.asset = {
    ...project.studioScene.productSlots[slotId]!.asset!,
    mount: {
      id: `mount-${slotId}`,
      kind: 'product-slot',
      slotId,
      assetId: 'asset-watch',
      assetRootNodeId: 'asset-root',
      overrides: mountOverrides,
    },
  }
  const assetGraph = createAssetGraph()

  const renderGraph = assemble(project, new Map([
    ['product-slot-primary', assetGraph],
  ]))

  // The asset-child's transform should be overridden
  assert.deepEqual(renderGraph.nodes['asset-child'].t, [1, 2, 3])
  // Original rotation and scale should be preserved (no override for those)
  assert.deepEqual(renderGraph.nodes['asset-child'].r, [0, 0, 0, 1])
  assert.deepEqual(renderGraph.nodes['asset-child'].s, [1, 1, 1])
})

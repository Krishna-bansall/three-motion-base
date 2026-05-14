import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyStudioPreset,
  applyLookPreset,
  addLayerToActiveShot,
  cloneProjectDoc,
  createDefaultProject,
  getLookPresets,
  replaceProductSlotAsset,
  updateStudioEnvironment,
  updateActiveShotTiming,
  updateActiveShotLayer,
} from '../../src/engine/project/document.ts'

test('createDefaultProject creates a durable studio project with one main shot', () => {
  const project = createDefaultProject()

  assert.equal(project.name, 'Untitled Project')
  assert.equal(project.studioScene.name, 'Studio Scene')
  assert.equal(project.look.name, 'Studio Neutral')

  assert.equal(project.studioScene.primaryProductSlotId, 'product-slot-primary')
  assert.deepEqual(project.studioScene.productSlots['product-slot-primary'], {
    id: 'product-slot-primary',
    name: 'Primary Product',
    nodeId: 'node-product-slot-primary',
    asset: null,
  })
  assert.deepEqual(project.studioScene.environment, {
    id: 'environment-studio',
    name: 'Studio HDRI',
    hdriId: 'studio',
    intensity: 1,
    rotation: 0,
  })
  assert.equal(project.studioScene.renderCameraNodeId, 'node-render-camera')
  assert.deepEqual(project.studioScene.cameras['camera-render'], {
    id: 'camera-render',
    name: 'Render Camera',
    nodeId: 'node-render-camera',
    kind: 'perspective',
    fovDegrees: 45,
    near: 0.1,
    far: 100,
  })
  assert.deepEqual(Object.keys(project.studioScene.lights).sort(), [
    'light-fill',
    'light-key',
    'light-rim',
  ])
  assert.deepEqual(project.studioScene.lights['light-key'], {
    id: 'light-key',
    name: 'Key Light',
    nodeId: 'node-light-key',
    kind: 'directional',
    intensity: 1.2,
    color: [1, 0.98, 0.95],
  })
  assert.deepEqual(project.studioScene.studioGeometry, {})
  assert.deepEqual(project.studioScene.materials, {})

  assert.deepEqual(project.shotOrder, ['shot-main'])
  assert.equal(project.activeShotId, 'shot-main')
  assert.deepEqual(project.shots['shot-main'], {
    id: 'shot-main',
    name: 'Main Shot',
    durationSeconds: 5,
    fps: 30,
    aspect: { width: 16, height: 9 },
    renderCameraNodeId: 'node-render-camera',
    sequence: {
      id: 'sequence-main',
      name: 'Main Sequence',
      rows: [
        {
          id: 'row-product-primary',
          name: 'Primary Product',
          targetNodeId: 'node-product-slot-primary',
          targetKind: 'object',
          category: 'objects',
          items: [],
          children: [],
        },
        {
          id: 'row-camera-render',
          name: 'Render Camera',
          targetNodeId: 'node-render-camera',
          targetKind: 'camera',
          category: 'camera',
          items: [],
          children: [],
        },
        {
          id: 'row-light-key',
          name: 'Key Light',
          targetNodeId: 'node-light-key',
          targetKind: 'light',
          category: 'lights',
          items: [],
          children: [],
        },
        {
          id: 'row-light-fill',
          name: 'Fill Light',
          targetNodeId: 'node-light-fill',
          targetKind: 'light',
          category: 'lights',
          items: [],
          children: [],
        },
        {
          id: 'row-light-rim',
          name: 'Rim Light',
          targetNodeId: 'node-light-rim',
          targetKind: 'light',
          category: 'lights',
          items: [],
          children: [],
        },
      ],
    },
  })
})

test('cloneProjectDoc isolates nested project state for snapshots', () => {
  const original = createDefaultProject()
  const clone = cloneProjectDoc(original)

  clone.look.bloom.strength = 1.2
  clone.studioScene.environment.hdriId = 'moody'
  clone.shots['shot-main'].sequence.rows.push({
    id: 'row-product',
    name: 'Primary Product',
    targetNodeId: 'node-product-slot-primary',
    targetKind: 'object',
    category: 'objects',
    items: [],
    children: [],
  })

  assert.equal(original.look.bloom.strength, 0.3)
  assert.equal(original.studioScene.environment.hdriId, 'studio')
  assert.equal(original.shots['shot-main'].sequence.rows.length, 5)
})

test('replaceProductSlotAsset fills the primary product slot with an imported asset', () => {
  const project = createDefaultProject()

  const updated = replaceProductSlotAsset(project, {
    uri: 'file:///imports/chair.glb',
    rootNodeId: 'node-imported-chair-root',
  })

  assert.deepEqual(updated.studioScene.productSlots['product-slot-primary'].asset, {
    uri: 'file:///imports/chair.glb',
    rootNodeId: 'node-imported-chair-root',
  })
  assert.equal(project.studioScene.productSlots['product-slot-primary'].asset, null)
})

test('updateStudioEnvironment changes HDRI without mutating the input project', () => {
  const project = createDefaultProject()

  const updated = updateStudioEnvironment(project, { hdriId: 'moody', intensity: 0.7 })

  assert.equal(updated.studioScene.environment.hdriId, 'moody')
  assert.equal(updated.studioScene.environment.intensity, 0.7)
  assert.equal(updated.studioScene.environment.rotation, 0)
  assert.equal(project.studioScene.environment.hdriId, 'studio')
})

test('replaceProductSlotAsset preserves studio setup, look, and shot metadata', () => {
  const project = createDefaultProject()
  project.studioScene.environment = {
    id: 'environment-night-studio',
    name: 'Night Studio',
    hdriId: 'moody',
    intensity: 0.7,
    rotation: 0.25,
  }
  project.look.exposure = 1.4
  project.look.bloom.strength = 0.6
  project.shots['shot-main'] = {
    ...project.shots['shot-main'],
    name: 'Hero Turntable',
    durationSeconds: 8,
    fps: 24,
    aspect: { width: 4, height: 5 },
    sequence: {
      id: 'sequence-hero',
      name: 'Hero Sequence',
      rows: [
        {
          id: 'row-camera',
          name: 'Render Camera',
          targetNodeId: 'node-render-camera',
          targetKind: 'camera',
          category: 'camera',
          items: [],
          children: [],
        },
      ],
    },
  }

  const environmentBefore = structuredClone(project.studioScene.environment)
  const lookBefore = structuredClone(project.look)
  const shotsBefore = structuredClone(project.shots)
  const renderCameraNodeIdBefore = project.studioScene.renderCameraNodeId
  const shotOrderBefore = structuredClone(project.shotOrder)
  const activeShotIdBefore = project.activeShotId

  const updated = replaceProductSlotAsset(project, {
    uri: 'file:///imports/lamp.glb',
    rootNodeId: 'node-imported-lamp-root',
  })

  assert.deepEqual(updated.studioScene.environment, environmentBefore)
  assert.deepEqual(updated.look, lookBefore)
  assert.deepEqual(updated.shots, shotsBefore)
  assert.equal(updated.studioScene.renderCameraNodeId, renderCameraNodeIdBefore)
  assert.deepEqual(updated.shotOrder, shotOrderBefore)
  assert.equal(updated.activeShotId, activeShotIdBefore)
})

test('replaceProductSlotAsset targets the primary slot when a project has multiple product slots', () => {
  const project = createDefaultProject()
  project.studioScene.productSlots['product-slot-packaging'] = {
    id: 'product-slot-packaging',
    name: 'Packaging',
    nodeId: 'node-product-slot-packaging',
    asset: {
      uri: 'file:///imports/box.glb',
      rootNodeId: 'node-imported-box-root',
    },
  }

  const updated = replaceProductSlotAsset(project, {
    uri: 'file:///imports/bottle.glb',
    rootNodeId: 'node-imported-bottle-root',
  })

  assert.deepEqual(updated.studioScene.productSlots['product-slot-primary'].asset, {
    uri: 'file:///imports/bottle.glb',
    rootNodeId: 'node-imported-bottle-root',
  })
  assert.deepEqual(updated.studioScene.productSlots['product-slot-packaging'].asset, {
    uri: 'file:///imports/box.glb',
    rootNodeId: 'node-imported-box-root',
  })
})

test('replaceProductSlotAsset preserves applied studio presets and isolates asset input', () => {
  const project = applyStudioPreset(createDefaultProject(), 'soft-box-plinth')
  const geometryBefore = structuredClone(project.studioScene.studioGeometry)
  const materialsBefore = structuredClone(project.studioScene.materials)
  const asset = {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'node-imported-watch-root',
  }

  const updated = replaceProductSlotAsset(project, asset)
  asset.uri = 'file:///imports/mutated.glb'

  assert.deepEqual(updated.studioScene.studioGeometry, geometryBefore)
  assert.deepEqual(updated.studioScene.materials, materialsBefore)
  assert.deepEqual(updated.studioScene.productSlots['product-slot-primary'].asset, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'node-imported-watch-root',
  })
})

test('applyStudioPreset creates limited-editable studio objects for product staging', () => {
  const project = createDefaultProject()

  const updated = applyStudioPreset(project, 'soft-box-plinth')

  assert.deepEqual(Object.keys(updated.studioScene.studioGeometry).sort(), [
    'studio-geometry-backdrop',
    'studio-geometry-floor',
    'studio-geometry-plinth',
  ])
  assert.deepEqual(updated.studioScene.studioGeometry['studio-geometry-floor'], {
    id: 'studio-geometry-floor',
    name: 'Matte Floor',
    nodeId: 'node-studio-floor',
    kind: 'floor',
    visible: true,
    editable: {
      transform: ['position', 'scale'],
      material: true,
      visibility: true,
      animationTarget: false,
    },
  })
  assert.deepEqual(updated.studioScene.studioGeometry['studio-geometry-plinth'].editable, {
    transform: ['position', 'rotation', 'scale'],
    material: true,
    visibility: true,
    animationTarget: false,
  })
  assert.deepEqual(project.studioScene.studioGeometry, {})
})

test('applyLookPreset updates project Look without changing Studio Scene or Main Shot', () => {
  const project = createDefaultProject()
  const studioBefore = structuredClone(project.studioScene)
  const shotsBefore = structuredClone(project.shots)

  const updated = applyLookPreset(project, 'warm-hero')

  assert.deepEqual(getLookPresets().map((preset) => preset.id), [
    'look-studio-neutral',
    'look-warm-hero',
    'look-cool-contrast',
  ])
  assert.deepEqual(updated.look, {
    id: 'look-warm-hero',
    name: 'Warm Hero',
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
  assert.deepEqual(updated.studioScene, studioBefore)
  assert.deepEqual(updated.shots, shotsBefore)
  assert.equal(project.look.id, 'look-studio-neutral')
})

test('shot timing edits preserve project-level Look', () => {
  const project = applyLookPreset(createDefaultProject(), 'cool-contrast')
  const lookBefore = structuredClone(project.look)

  const updated = updateActiveShotTiming(project, {
    durationSeconds: 7.5,
    fps: 24,
    aspect: { width: 4, height: 5 },
  })

  assert.deepEqual(updated.look, lookBefore)
  assert.deepEqual(updated.shots[updated.activeShotId], {
    ...project.shots[project.activeShotId],
    durationSeconds: 7.5,
    fps: 24,
    aspect: { width: 4, height: 5 },
  })
})

test('addLayerToActiveShot adds contextual motion presets to object, camera, and light rows', () => {
  const project = createDefaultProject()

  const withObjectLayer = addLayerToActiveShot(project, {
    targetNodeId: 'node-product-slot-primary',
    presetId: 'object-float',
  })
  const withCameraLayer = addLayerToActiveShot(withObjectLayer, {
    targetNodeId: 'node-render-camera',
    presetId: 'camera-dolly-in',
  })
  const withLightLayer = addLayerToActiveShot(withCameraLayer, {
    targetNodeId: 'node-light-key',
    presetId: 'light-pulse',
  })

  const rows = withLightLayer.shots[withLightLayer.activeShotId].sequence.rows

  assert.deepEqual(rows.find((row) => row.targetNodeId === 'node-product-slot-primary')?.items[0], {
    id: 'layer-1',
    kind: 'layer',
    name: 'Float',
    targetNodeId: 'node-product-slot-primary',
    targetKind: 'object',
    presetId: 'object-float',
    blendMode: 'additive',
    enabled: true,
    startTimeSeconds: 0,
    durationSeconds: 3,
    strength: 1,
    parameters: {
      amplitude: 0.35,
      cycles: 1,
      axis: 'y',
    },
    curveOverrides: [],
  })
  assert.equal(rows.find((row) => row.targetNodeId === 'node-render-camera')?.items[0]?.presetId, 'camera-dolly-in')
  assert.equal(rows.find((row) => row.targetNodeId === 'node-light-key')?.items[0]?.presetId, 'light-pulse')
  assert.deepEqual(project.shots[project.activeShotId].sequence.rows.every((row) => row.items.length === 0), true)
})

test('updateActiveShotLayer patches one layer without mutating other timeline rows', () => {
  const project = addLayerToActiveShot(createDefaultProject(), {
    targetNodeId: 'node-render-camera',
    presetId: 'camera-roundturn',
  })

  const updated = updateActiveShotLayer(project, 'layer-1', {
    startTimeSeconds: 1.25,
    durationSeconds: 6.5,
    strength: 0.55,
    enabled: false,
  })

  const cameraRow = updated.shots[updated.activeShotId].sequence.rows
    .find((row) => row.targetNodeId === 'node-render-camera')

  assert.deepEqual(cameraRow?.items[0], {
    ...cameraRow?.items[0],
    id: 'layer-1',
    name: 'Roundturn',
    targetNodeId: 'node-render-camera',
    targetKind: 'camera',
    presetId: 'camera-roundturn',
    kind: 'layer',
    blendMode: 'additive',
    startTimeSeconds: 1.25,
    durationSeconds: 6.5,
    strength: 0.55,
    enabled: false,
  })
  assert.deepEqual(
    updated.shots[updated.activeShotId].sequence.rows
      .filter((row) => row.targetNodeId !== 'node-render-camera')
      .map((row) => row.items.length),
    [0, 0, 0, 0],
  )
  assert.equal(project.shots[project.activeShotId].sequence.rows
    .find((row) => row.targetNodeId === 'node-render-camera')?.items[0]?.enabled, true)
})

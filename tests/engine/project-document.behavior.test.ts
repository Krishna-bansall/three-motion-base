import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyStudioPreset,
  applyLookPreset,
  addLayerToActiveShot,
  addTrackToActiveShot,
  cloneProjectDoc,
  createDefaultProject,
  getLookPresets,
  removeLayerFromActiveShot,
  removeTrackFromActiveShot,
  replaceProductSlotAsset,
  updateStudioEnvironment,
  updateActiveShotTiming,
  updateActiveShotLayer,
  updateTrackInActiveShot,
} from '../../src/engine/project/document.ts'

test('createDefaultProject creates a durable studio project with one main shot', () => {
  const project = createDefaultProject()
  const createTrack = (rowId: string) => ({
    id: `${rowId}-track-1`,
    name: 'Track 1',
    enabled: true,
    collapsed: false,
    items: [],
  })

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
assert.equal(project.studioScene.studioGeometry.studioGeometry, {})
  assert.deepEqual(project.studioScene.materials, {})

  assert.deepEqual(project.shotOrder, ['shot-main'])
  assert.equal(project.activeShotId, 'shot-main')

  const shot = project.shots['shot-main']
  assert.equal(shot.name, 'Main Shot')
  assert.equal(shot.durationSeconds, 5)
  assert.equal(shot.fps, 30)
  assert.deepEqual(shot.aspect, { width: 16, height: 9 })
  assert.equal(shot.renderCameraNodeId, 'node-render-camera')

  const expectedRows = [
    {
      id: 'row-product-primary',
      name: 'Primary Product',
      targetNodeId: 'node-product-slot-primary',
      targetKind: 'object',
      category: 'objects',
      tracks: [{ id: 'row-product-primary-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
      children: [],
    },
    {
      id: 'row-camera-render',
      name: 'Render Camera',
      targetNodeId: 'node-render-camera',
      targetKind: 'camera',
      category: 'camera',
      tracks: [{ id: 'row-camera-render-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
      children: [],
    },
    {
      id: 'row-light-key',
      name: 'Key Light',
      targetNodeId: 'node-light-key',
      targetKind: 'light',
      category: 'lights',
      tracks: [{ id: 'row-light-key-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
      children: [],
    },
    {
      id: 'row-light-fill',
      name: 'Fill Light',
      targetNodeId: 'node-light-fill',
      targetKind: 'light',
      category: 'lights',
      tracks: [{ id: 'row-light-fill-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
      children: [],
    },
    {
      id: 'row-light-rim',
      name: 'Rim Light',
      targetNodeId: 'node-light-rim',
      targetKind: 'light',
      category: 'lights',
      tracks: [{ id: 'row-light-rim-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
      children: [],
    },
  ]
  assert.deepEqual(shot.sequence.rows, expectedRows)
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
    tracks: [{ id: 'row-product-track-1', name: 'Track 1', enabled: true, collapsed: false, items: [] }],
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
  const productTrack = rows.find((row) => row.targetNodeId === 'node-product-slot-primary')?.tracks[0]
  const cameraTrack = rows.find((row) => row.targetNodeId === 'node-render-camera')?.tracks[0]
  const lightTrack = rows.find((row) => row.targetNodeId === 'node-light-key')?.tracks[0]

  assert.deepEqual(productTrack?.items[0], {
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
    easing: 'linear',
    parameters: {
      amplitude: 0.35,
      cycles: 1,
      axis: 'y',
    },
    curveOverrides: [],
  })
  assert.equal(cameraTrack?.items[0]?.presetId, 'camera-dolly-in')
  assert.equal(lightTrack?.items[0]?.presetId, 'light-pulse')
  assert.deepEqual(project.shots[project.activeShotId].sequence.rows.every(
    (row) => row.tracks.every((track) => track.items.length === 0),
  ), true)
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
  const cameraTrack = cameraRow?.tracks[0]

  assert.deepEqual(cameraTrack?.items[0], {
    ...cameraTrack?.items[0],
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
    easing: 'linear',
    enabled: false,
  })
  assert.deepEqual(
    updated.shots[updated.activeShotId].sequence.rows
      .filter((row) => row.targetNodeId !== 'node-render-camera')
      .map((row) => row.tracks.reduce((total, track) => total + track.items.length, 0)),
    [0, 0, 0, 0],
  )
  assert.equal(project.shots[project.activeShotId].sequence.rows
    .find((row) => row.targetNodeId === 'node-render-camera')?.tracks[0]?.items[0]?.enabled, true)
})

test('getMotionPresets exposes default easing, feature tags, and typed parameter controls', () => {
  const [floatPreset] = getMotionPresets('object')
  const [dollyPreset] = getMotionPresets('camera').filter((preset) => preset.id === 'camera-dolly-in')

  assert.equal(floatPreset?.defaultEasing, 'linear')
  assert.deepEqual(floatPreset?.features, ['translate', 'oscillate'])
  assert.deepEqual(floatPreset?.parameterControls, [
    { key: 'amplitude', label: 'Amplitude', kind: 'number', min: 0, max: 2, step: 0.05 },
    { key: 'cycles', label: 'Cycles', kind: 'number', min: 0.25, max: 6, step: 0.25 },
    {
      key: 'axis',
      label: 'Axis',
      kind: 'select',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z' },
      ],
    },
  ])
  assert.equal(dollyPreset?.defaultEasing, 'ease-out')
})

import { CAMERA_KINDS } from './types'
import type {
  AnimationTargetKind,
  LookPresetId,
  LookPreset,
  MotionLayer,
  MotionPreset,
  MotionPresetId,
  ProductSlotAsset,
  ProjectDoc,
  ProjectLook,
  SequenceCategory,
  SequenceRow,
  StudioEnvironment,
  ShotDoc,
  StudioPresetId,
} from './types'

const LOOK_PRESETS: Record<LookPresetId, ProjectLook> = {
  'studio-neutral': {
    id: 'look-studio-neutral',
    name: 'Studio Neutral',
    exposure: 1,
    bloom: {
      strength: 0.3,
      radius: 0.6,
      threshold: 0.85,
    },
    cinematic: {
      vignette: 0.35,
      vignetteEnabled: true,
      chromaticAberration: 0.003,
      filmGrain: 0,
      colorTemperature: 0,
    },
  },
  'warm-hero': {
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
  },
  'cool-contrast': {
    id: 'look-cool-contrast',
    name: 'Cool Contrast',
    exposure: 0.9,
    bloom: {
      strength: 0.2,
      radius: 0.48,
      threshold: 0.78,
    },
    cinematic: {
      vignette: 0.5,
      vignetteEnabled: true,
      chromaticAberration: 0.004,
      filmGrain: 0.006,
      colorTemperature: -0.22,
    },
  },
}

const MOTION_PRESETS: Record<MotionPresetId, MotionPreset> = {
  'object-float': {
    id: 'object-float',
    targetKind: 'object',
    name: 'Float',
    durationSeconds: 3,
    parameters: {
      amplitude: 0.35,
      cycles: 1,
      axis: 'y',
    },
  },
  'object-spin': {
    id: 'object-spin',
    targetKind: 'object',
    name: 'Spin',
    durationSeconds: 3,
    parameters: {
      revolutions: 1,
      axis: 'y',
    },
  },
  'object-roundturn': {
    id: 'object-roundturn',
    targetKind: 'object',
    name: 'Roundturn',
    durationSeconds: 4,
    parameters: {
      revolutions: 1,
      axis: 'y',
    },
  },
  'camera-dolly-in': {
    id: 'camera-dolly-in',
    targetKind: 'camera',
    name: 'Dolly In',
    durationSeconds: 4,
    parameters: {
      distance: 1.25,
      axis: 'z',
    },
  },
  'camera-orbit': {
    id: 'camera-orbit',
    targetKind: 'camera',
    name: 'Orbit',
    durationSeconds: 5,
    parameters: {
      revolutions: 1,
      radiusScale: 1,
    },
  },
  'camera-roundturn': {
    id: 'camera-roundturn',
    targetKind: 'camera',
    name: 'Roundturn',
    durationSeconds: 5,
    parameters: {
      revolutions: 1,
      radiusScale: 1,
    },
  },
  'light-pulse': {
    id: 'light-pulse',
    targetKind: 'light',
    name: 'Pulse',
    durationSeconds: 3,
    parameters: {
      intensityMultiplier: 0.45,
      cycles: 2,
    },
  },
  'light-sweep': {
    id: 'light-sweep',
    targetKind: 'light',
    name: 'Sweep',
    durationSeconds: 4,
    parameters: {
      distance: 1.2,
      axis: 'x',
      cycles: 1,
    },
  },
}

export function createDefaultProject(): ProjectDoc {
  const primaryProductNodeId = 'node-product-slot-primary'
  const renderCameraNodeId = 'node-render-camera'
  const lightRows = [
    createSequenceRow('row-light-key', 'Key Light', 'node-light-key', 'light', 'lights'),
    createSequenceRow('row-light-fill', 'Fill Light', 'node-light-fill', 'light', 'lights'),
    createSequenceRow('row-light-rim', 'Rim Light', 'node-light-rim', 'light', 'lights'),
  ]

  return {
    id: 'project-default',
    name: 'Untitled Project',
    studioScene: {
      id: 'studio-scene-default',
      name: 'Studio Scene',
      primaryProductSlotId: 'product-slot-primary',
      productSlots: {
        'product-slot-primary': {
          id: 'product-slot-primary',
          name: 'Primary Product',
          nodeId: primaryProductNodeId,
          asset: null,
        },
      },
      environment: {
        id: 'environment-studio',
        name: 'Studio HDRI',
        hdriId: 'studio',
        intensity: 1,
        rotation: 0,
      },
      renderCameraNodeId,
      cameras: {
        'camera-render': {
          id: 'camera-render',
          name: 'Render Camera',
          nodeId: renderCameraNodeId,
          kind: CAMERA_KINDS.perspective,
          fovDegrees: 45,
          near: 0.1,
          far: 100,
        },
      },
      lights: {
        'light-key': {
          id: 'light-key',
          name: 'Key Light',
          nodeId: 'node-light-key',
          kind: 'directional',
          intensity: 1.2,
          color: [1, 0.98, 0.95],
        },
        'light-fill': {
          id: 'light-fill',
          name: 'Fill Light',
          nodeId: 'node-light-fill',
          kind: 'directional',
          intensity: 0.65,
          color: [0.82, 0.88, 1],
        },
        'light-rim': {
          id: 'light-rim',
          name: 'Rim Light',
          nodeId: 'node-light-rim',
          kind: 'spot',
          intensity: 1.05,
          color: [1, 0.94, 0.86],
        },
      },
      studioGeometry: {},
      materials: {},
    },
    look: cloneLookPreset('studio-neutral'),
    shots: {
      'shot-main': {
        id: 'shot-main',
        name: 'Main Shot',
        durationSeconds: 5,
        fps: 30,
        aspect: { width: 16, height: 9 },
        renderCameraNodeId,
        sequence: {
          id: 'sequence-main',
          name: 'Main Sequence',
          rows: [
            createSequenceRow('row-product-primary', 'Primary Product', primaryProductNodeId, 'object', 'objects'),
            createSequenceRow('row-camera-render', 'Render Camera', renderCameraNodeId, 'camera', 'camera'),
            ...lightRows,
          ],
        },
      },
    },
    shotOrder: ['shot-main'],
    activeShotId: 'shot-main',
  }
}

export function cloneProjectDoc(project: ProjectDoc): ProjectDoc {
  return structuredClone(project)
}

export function getLookPresets(): LookPreset[] {
  return (Object.keys(LOOK_PRESETS) as LookPresetId[]).map((presetId) => ({
    presetId,
    ...structuredClone(LOOK_PRESETS[presetId]),
  }))
}

export function getMotionPresets(targetKind: AnimationTargetKind): MotionPreset[] {
  return (Object.keys(MOTION_PRESETS) as MotionPresetId[])
    .map((presetId) => MOTION_PRESETS[presetId])
    .filter((preset) => preset.targetKind === targetKind)
    .map((preset) => structuredClone(preset))
}

export function applyLookPreset(project: ProjectDoc, presetId: LookPresetId): ProjectDoc {
  const updated = cloneProjectDoc(project)
  updated.look = cloneLookPreset(presetId)
  return updated
}

export function updateStudioEnvironment(
  project: ProjectDoc,
  environment: Partial<Pick<StudioEnvironment, 'hdriId' | 'intensity' | 'rotation'>>,
): ProjectDoc {
  const updated = cloneProjectDoc(project)
  updated.studioScene.environment = {
    ...updated.studioScene.environment,
    ...environment,
  }
  return updated
}

export function updateActiveShotTiming(
  project: ProjectDoc,
  timing: Partial<Pick<ShotDoc, 'durationSeconds' | 'fps' | 'aspect'>>,
): ProjectDoc {
  const updated = cloneProjectDoc(project)
  const activeShot = updated.shots[updated.activeShotId]

  if (!activeShot) {
    throw new Error(`Unknown active shot: ${updated.activeShotId}`)
  }

  updated.shots[updated.activeShotId] = {
    ...activeShot,
    ...timing,
    aspect: timing.aspect ? { ...timing.aspect } : activeShot.aspect,
  }

  return updated
}

export function replaceProductSlotAsset(project: ProjectDoc, asset: ProductSlotAsset): ProjectDoc {
  const updated = cloneProjectDoc(project)
  const slotId = updated.studioScene.primaryProductSlotId

  updated.studioScene.productSlots[slotId].asset = structuredClone(asset)

  return updated
}

export function addLayerToActiveShot(
  project: ProjectDoc,
  params: {
    targetNodeId: string
    presetId: MotionPresetId
  },
): ProjectDoc {
  const updated = cloneProjectDoc(project)
  const activeShot = updated.shots[updated.activeShotId]
  const row = activeShot.sequence.rows.find((entry) => entry.targetNodeId === params.targetNodeId)
  const preset = MOTION_PRESETS[params.presetId]

  if (!row) {
    throw new Error(`Unknown timeline target: ${params.targetNodeId}`)
  }

  if (!preset) {
    throw new Error(`Unknown motion preset: ${params.presetId}`)
  }

  if (row.targetKind !== preset.targetKind) {
    throw new Error(`Preset ${params.presetId} does not match target kind ${row.targetKind}`)
  }

  const nextLayer: MotionLayer = {
    id: `layer-${countLayers(activeShot.sequence.rows) + 1}`,
    kind: 'layer',
    name: preset.name,
    targetNodeId: row.targetNodeId,
    targetKind: row.targetKind,
    presetId: preset.id,
    blendMode: 'additive',
    enabled: true,
    startTimeSeconds: 0,
    durationSeconds: preset.durationSeconds,
    strength: 1,
    parameters: structuredClone(preset.parameters),
    curveOverrides: [],
  }

  row.items.push(nextLayer)
  return updated
}

export function updateActiveShotLayer(
  project: ProjectDoc,
  layerId: string,
  patch: Partial<Pick<MotionLayer, 'startTimeSeconds' | 'durationSeconds' | 'strength' | 'enabled' | 'name'>>
    & { parameters?: MotionLayer['parameters'] },
): ProjectDoc {
  const updated = cloneProjectDoc(project)
  const layer = findActiveShotLayer(updated, layerId)

  if (!layer) {
    throw new Error(`Unknown active shot layer: ${layerId}`)
  }

  if (patch.name !== undefined) layer.name = patch.name
  if (patch.startTimeSeconds !== undefined) layer.startTimeSeconds = patch.startTimeSeconds
  if (patch.durationSeconds !== undefined) layer.durationSeconds = patch.durationSeconds
  if (patch.strength !== undefined) layer.strength = patch.strength
  if (patch.enabled !== undefined) layer.enabled = patch.enabled
  if (patch.parameters) {
    layer.parameters = {
      ...layer.parameters,
      ...structuredClone(patch.parameters),
    }
  }

  return updated
}

export function applyStudioPreset(project: ProjectDoc, presetId: StudioPresetId): ProjectDoc {
  const updated = cloneProjectDoc(project)

  if (presetId !== 'soft-box-plinth') {
    throw new Error(`Unknown studio preset: ${presetId satisfies never}`)
  }

  updated.studioScene.studioGeometry = {
    'studio-geometry-floor': {
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
    },
    'studio-geometry-backdrop': {
      id: 'studio-geometry-backdrop',
      name: 'Soft Backdrop',
      nodeId: 'node-studio-backdrop',
      kind: 'backdrop',
      visible: true,
      editable: {
        transform: ['position', 'scale'],
        material: true,
        visibility: true,
        animationTarget: false,
      },
    },
    'studio-geometry-plinth': {
      id: 'studio-geometry-plinth',
      name: 'Product Plinth',
      nodeId: 'node-studio-plinth',
      kind: 'plinth',
      visible: true,
      editable: {
        transform: ['position', 'rotation', 'scale'],
        material: true,
        visibility: true,
        animationTarget: false,
      },
    },
  }

  updated.studioScene.materials = {
    'studio-material-matte-white': {
      id: 'studio-material-matte-white',
      name: 'Matte White',
      materialId: 'material-studio-matte-white',
    },
  }

  return updated
}

function cloneLookPreset(presetId: LookPresetId): ProjectLook {
  return structuredClone(LOOK_PRESETS[presetId])
}

function createSequenceRow(
  id: string,
  name: string,
  targetNodeId: string,
  targetKind: AnimationTargetKind,
  category: SequenceCategory,
): SequenceRow {
  return {
    id,
    name,
    targetNodeId,
    targetKind,
    category,
    items: [],
    children: [],
  }
}

function countLayers(rows: SequenceRow[]): number {
  return rows.reduce((total, row) => total + row.items.length, 0)
}

function findActiveShotLayer(project: ProjectDoc, layerId: string): MotionLayer | null {
  const activeShot = project.shots[project.activeShotId]

  for (const row of activeShot.sequence.rows) {
    const layer = row.items.find((item) => item.kind === 'layer' && item.id === layerId)
    if (layer?.kind === 'layer') {
      return layer
    }
  }

  return null
}

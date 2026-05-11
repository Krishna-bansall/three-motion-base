import { CAMERA_KINDS } from './types'
import type {
  LookPresetId,
  LookPreset,
  ProductSlotAsset,
  ProjectDoc,
  ProjectLook,
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

export function createDefaultProject(): ProjectDoc {
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
          nodeId: 'node-product-slot-primary',
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
      renderCameraNodeId: 'node-render-camera',
      cameras: {
        'camera-render': {
          id: 'camera-render',
          name: 'Render Camera',
          nodeId: 'node-render-camera',
          kind: CAMERA_KINDS.perspective,
          fovDegrees: 45,
          near: 0.1,
          far: 100,
        },
      },
      lights: {},
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
        renderCameraNodeId: 'node-render-camera',
        sequence: {
          id: 'sequence-main',
          name: 'Main Sequence',
          rows: [],
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

export function applyLookPreset(project: ProjectDoc, presetId: LookPresetId): ProjectDoc {
  const updated = cloneProjectDoc(project)
  updated.look = cloneLookPreset(presetId)
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

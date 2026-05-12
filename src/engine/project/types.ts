import type { NodeId } from '../scene/types'

export type ProjectId = string
export type StudioSceneId = string
export type ProductSlotId = string
export type EnvironmentId = string
export type LookId = string
export type ShotId = string
export type SequenceId = string
export type CameraId = string
export type LightId = string
export type StudioGeometryId = string
export type StudioMaterialId = string
export type StudioPresetId = 'soft-box-plinth'
export type StudioGeometryKind = 'floor' | 'backdrop' | 'plinth'
export type StudioTransformEdit = 'position' | 'rotation' | 'scale'
export type LookPresetId = 'studio-neutral' | 'warm-hero' | 'cool-contrast'

export const CAMERA_KINDS = {
  perspective: 'perspective',
} as const

export type CameraKind = (typeof CAMERA_KINDS)[keyof typeof CAMERA_KINDS]

export const LIGHT_KINDS = {
  directional: 'directional',
  point: 'point',
  spot: 'spot',
} as const

export type LightKind = (typeof LIGHT_KINDS)[keyof typeof LIGHT_KINDS]

export interface ProjectDoc {
  id: ProjectId
  name: string
  studioScene: StudioSceneDoc
  look: ProjectLook
  shots: Record<ShotId, ShotDoc>
  shotOrder: ShotId[]
  activeShotId: ShotId
}

export interface StudioSceneDoc {
  id: StudioSceneId
  name: string
  primaryProductSlotId: ProductSlotId
  productSlots: Record<ProductSlotId, ProductSlot>
  environment: StudioEnvironment
  renderCameraNodeId: NodeId
  cameras: Record<CameraId, CameraDef>
  lights: Record<LightId, LightDef>
  studioGeometry: Record<StudioGeometryId, StudioGeometryRef>
  materials: Record<StudioMaterialId, StudioMaterialRef>
}

export interface ProductSlot {
  id: ProductSlotId
  name: string
  nodeId: NodeId
  asset: ProductSlotAsset | null
}

export interface ProductSlotAsset {
  uri: string
  rootNodeId: NodeId
}

export interface StudioEnvironment {
  id: EnvironmentId
  name: string
  hdriId: string
  intensity: number
  rotation: number
}

export interface CameraDef {
  id: CameraId
  name: string
  nodeId: NodeId
  kind: CameraKind
  fovDegrees: number
  near: number
  far: number
}

export interface LightDef {
  id: LightId
  name: string
  nodeId: NodeId
  kind: LightKind
  intensity: number
  color: [number, number, number]
}

export interface StudioGeometryRef {
  id: StudioGeometryId
  name: string
  nodeId: NodeId
  kind: StudioGeometryKind
  visible: boolean
  editable: {
    transform: StudioTransformEdit[]
    material: boolean
    visibility: boolean
    animationTarget: boolean
  }
}

export interface StudioMaterialRef {
  id: StudioMaterialId
  name: string
  materialId: string
}

export interface ProjectLook {
  id: LookId
  name: string
  exposure: number
  bloom: {
    strength: number
    radius: number
    threshold: number
  }
  cinematic: {
    vignette: number
    vignetteEnabled: boolean
    chromaticAberration: number
    filmGrain: number
    colorTemperature: number
  }
}

export type LookPreset = ProjectLook & {
  presetId: LookPresetId
}

export interface ShotDoc {
  id: ShotId
  name: string
  durationSeconds: number
  fps: number
  aspect: {
    width: number
    height: number
  }
  renderCameraNodeId: NodeId
  sequence: AnimationSequence
}

export interface AnimationSequence {
  id: SequenceId
  name: string
  rows: SequenceRow[]
}

export interface SequenceRow {
  id: string
  targetNodeId: NodeId
  children: SequenceRow[]
}

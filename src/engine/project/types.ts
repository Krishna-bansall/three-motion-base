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
export type AnimationTargetKind = 'object' | 'camera' | 'light'
export type SequenceCategory = 'objects' | 'camera' | 'lights'
export type TrackId = string
export type MotionItemId = string
export type MotionItemKind = 'layer' | 'group'
export type MotionLayerBlendMode = 'additive'
export type MotionAxis = 'x' | 'y' | 'z'
export type MotionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type MotionFeatureTag =
  | 'translate'
  | 'rotate'
  | 'light'
  | 'oscillate'
  | 'camera-move'
  | 'hero-turn'
export type MotionPresetId =
  | 'object-float'
  | 'object-spin'
  | 'object-roundturn'
  | 'camera-dolly-in'
  | 'camera-orbit'
  | 'camera-roundturn'
  | 'light-pulse'
  | 'light-sweep'

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

export interface SequenceTrack {
  id: TrackId
  name: string
  enabled: boolean
  collapsed: boolean
  items: MotionSequenceItem[]
}

export interface SequenceRow {
  id: string
  name: string
  targetNodeId: NodeId
  targetKind: AnimationTargetKind
  category: SequenceCategory
  tracks: SequenceTrack[]
  children: SequenceRow[]
}

export type MotionSequenceItem = MotionLayer | MotionGroup

export interface MotionLayer {
  id: MotionItemId
  kind: 'layer'
  name: string
  targetNodeId: NodeId
  targetKind: AnimationTargetKind
  presetId: MotionPresetId
  blendMode: MotionLayerBlendMode
  enabled: boolean
  startTimeSeconds: number
  durationSeconds: number
  strength: number
  easing: MotionEasing
  parameters: MotionLayerParameters
  curveOverrides: MotionCurveOverride[]
}

export interface MotionGroup {
  id: MotionItemId
  kind: 'group'
  name: string
  enabled: boolean
  startTimeSeconds: number
  durationSeconds: number
  strength: number
  items: MotionSequenceItem[]
}

export type MotionLayerParameters = Record<string, number | string | boolean>

export interface MotionParameterOption {
  value: string
  label: string
}

interface MotionParameterControlBase {
  key: string
  label: string
}

export interface MotionNumberParameterControl extends MotionParameterControlBase {
  kind: 'number'
  min?: number
  max?: number
  step?: number
}

export interface MotionBooleanParameterControl extends MotionParameterControlBase {
  kind: 'boolean'
}

export interface MotionTextParameterControl extends MotionParameterControlBase {
  kind: 'text'
}

export interface MotionSelectParameterControl extends MotionParameterControlBase {
  kind: 'select'
  options: MotionParameterOption[]
}

export type MotionParameterControl =
  | MotionNumberParameterControl
  | MotionBooleanParameterControl
  | MotionTextParameterControl
  | MotionSelectParameterControl

export interface MotionCurveOverride {
  propertyPath: string
  points: Array<{
    time: number
    value: number
  }>
}

export interface MotionPreset {
  id: MotionPresetId
  targetKind: AnimationTargetKind
  name: string
  durationSeconds: number
  defaultEasing: MotionEasing
  features: MotionFeatureTag[]
  parameterControls: MotionParameterControl[]
  parameters: MotionLayerParameters
}

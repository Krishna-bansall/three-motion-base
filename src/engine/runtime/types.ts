import type { NodeId, Quat, SceneDoc, Vec3 } from '../scene/types'
import type { HDRIPreset } from '../viewSettings'

export type { HDRIPreset, ViewSettings } from '../viewSettings'
export type TransformGizmoMode = 'translate' | 'rotate' | 'scale'

/** Shared transform shape passed between the engine and runtime adapters. */
export interface TRS {
  t: Vec3
  r: Quat
  s: Vec3
}

/** UI-ready environment card metadata exposed by the runtime layer. */
export interface EnvironmentPreview {
  preset: HDRIPreset
  label: string
  mood: string
  icon: string
  imageUrl: string
}

/** Minimal runtime inspection payload for console/debug views. */
export interface RuntimeDebugNode {
  nodeId: NodeId
  name: string
  transform: TRS
  materialId?: string
}

export interface RuntimeDebugGraph {
  root: RuntimeDebugNode | null
  meshes: RuntimeDebugNode[]
}

/** Renderer-specific source assets used to rebuild the runtime scene on demand. */
export interface RuntimeSceneAssetBundle {
  canonicalScene: SceneDoc
  sourceUri: string
  rootNodeId: NodeId
  instantiate(): RuntimeSceneInstance
}

/** Materialized runtime objects created from a scene asset bundle. */
export interface RuntimeSceneInstance {
  rootNodeId: NodeId
  rootObject: object
  nodeObjects: Map<NodeId, object>
  materialObjects: Map<string, object[]>
}

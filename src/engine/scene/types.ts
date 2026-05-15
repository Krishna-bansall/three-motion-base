export type NodeId = string
export type MeshId = string
export type MaterialId = string
export type AssetNodeId = NodeId

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export type SceneCameraKind = 'perspective'
export type SceneLightKind = 'directional' | 'point' | 'spot'

export interface SceneDoc {
  roots: NodeId[]
  nodes: Record<NodeId, SceneNode>
  meshes: Record<MeshId, MeshDef>
  materials: Record<MaterialId, MaterialDef>
  metadata: {
    units: 'm'
    upAxis: 'Y'
    colorSpace: 'linear-srgb'
  }
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/**
 * Imported or bundled graph-shaped 3D content.
 *
 * Asset graphs are reusable source content. Project-owned placement,
 * visibility, transform, and material edits belong to mount overrides in
 * ProjectDoc/RenderGraph assembly, not to this graph.
 */
export type AssetGraphDoc = DeepReadonly<SceneDoc>

/**
 * Renderer-facing canonical graph assembled from ProjectDoc plus mounted
 * AssetGraphDoc content.
 */
export type RenderGraphDoc = SceneDoc

/**
 * Animation-evaluated transient graph state. It is derived from a
 * RenderGraphDoc for preview/playback and is not durable authoring state.
 */
export type EvaluatedRenderState = SceneDoc

export interface SceneNode {
  id: NodeId
  parentId: NodeId | null
  children: NodeId[]
  name: string
  t: Vec3
  r: Quat
  s: Vec3
  camera?: CameraComponent
  light?: LightComponent
  meshId?: MeshId
  materialId?: MaterialId
  visible: boolean
  extras?: Record<string, unknown>
}

export interface CameraComponent {
  kind: SceneCameraKind
  fovDegrees: number
  near: number
  far: number
}

export interface LightComponent {
  kind: SceneLightKind
  intensity: number
  color: [number, number, number]
  angleDegrees?: number
  distance?: number
}

export interface MeshDef {
  source: {
    uri: string
    primitive?: number
  }
}

export interface MaterialDef {
  baseColor: [number, number, number]
  roughness: number
  metalness: number
  envMapIntensity: number
  extras?: Record<string, unknown>
}

export interface ImportedLightCandidate {
  assetNodeId: AssetNodeId
  name: string
  light: LightComponent
}

export const DEFAULT_SCENE_METADATA: SceneDoc['metadata'] = {
  units: 'm',
  upAxis: 'Y',
  colorSpace: 'linear-srgb',
}

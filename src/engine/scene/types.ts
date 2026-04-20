export type NodeId = string
export type MeshId = string
export type MaterialId = string

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

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

export interface SceneNode {
  id: NodeId
  parentId: NodeId | null
  children: NodeId[]
  name: string
  t: Vec3
  r: Quat
  s: Vec3
  meshId?: MeshId
  materialId?: MaterialId
  visible: boolean
  extras?: Record<string, unknown>
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

export const DEFAULT_SCENE_METADATA: SceneDoc['metadata'] = {
  units: 'm',
  upAxis: 'Y',
  colorSpace: 'linear-srgb',
}

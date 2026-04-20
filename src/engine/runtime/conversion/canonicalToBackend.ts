import type { MaterialId, MeshId, NodeId, SceneDoc } from '../../scene/types'

/** Backend-agnostic node payload derived from the canonical scene graph. */
export interface BackendSceneNode {
  id: NodeId
  parentId: NodeId | null
  meshId?: MeshId
  materialId?: MaterialId
  translation: [number, number, number]
  rotation: [number, number, number, number]
  scale: [number, number, number]
  visible: boolean
}

export interface BackendSceneMaterial {
  id: MaterialId
  baseColor: [number, number, number]
  roughness: number
  metalness: number
  envMapIntensity: number
}

export interface UnsupportedFeature {
  id: string
  reason: string
  severity: 'info' | 'warning'
}

export interface BackendSceneSchema {
  metadata: SceneDoc['metadata']
  roots: NodeId[]
  nodes: BackendSceneNode[]
  meshes: Array<{
    id: MeshId
    sourceUri: string
    primitive?: number
  }>
  materials: BackendSceneMaterial[]
  unsupported: UnsupportedFeature[]
}

/** Converts canonical scene state into a renderer/backend-friendly schema. */
export function convertCanonicalToBackendSchema(scene: SceneDoc): BackendSceneSchema {
  const unsupported = collectUnsupportedFeatures(scene)

  return {
    metadata: { ...scene.metadata },
    roots: [...scene.roots],
    nodes: Object.values(scene.nodes).map((node) => ({
      id: node.id,
      parentId: node.parentId,
      meshId: node.meshId,
      materialId: node.materialId,
      translation: [...node.t],
      rotation: [...node.r],
      scale: [...node.s],
      visible: node.visible,
    })),
    meshes: Object.entries(scene.meshes).map(([id, mesh]) => ({
      id,
      sourceUri: mesh.source.uri,
      primitive: mesh.source.primitive,
    })),
    materials: Object.entries(scene.materials).map(([id, material]) => ({
      id,
      baseColor: [...material.baseColor],
      roughness: material.roughness,
      metalness: material.metalness,
      envMapIntensity: material.envMapIntensity,
    })),
    unsupported,
  }
}

/** Reports scene features that still require backend-specific handling. */
export function collectUnsupportedFeatures(scene: SceneDoc): UnsupportedFeature[] {
  const unsupported: UnsupportedFeature[] = []

  for (const node of Object.values(scene.nodes)) {
    if (node.extras && Object.keys(node.extras).length > 0) {
      unsupported.push({
        id: node.id,
        reason: 'Node extras require backend-specific interpretation.',
        severity: 'warning',
      })
    }
  }

  for (const [materialId, material] of Object.entries(scene.materials)) {
    if (material.extras && Object.keys(material.extras).length > 0) {
      unsupported.push({
        id: materialId,
        reason: 'Material extras are preserved but not translated into backend schema fields.',
        severity: 'warning',
      })
    }
  }

  return unsupported
}

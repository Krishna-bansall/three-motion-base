import type { MaterialDef, MaterialId, MeshDef, MeshId, NodeId, SceneDoc, SceneNode } from './types'

export interface SceneDelta {
  rootsChanged: boolean
  addedNodeIds: NodeId[]
  removedNodeIds: NodeId[]
  changedNodes: Record<NodeId, Partial<SceneNode>>
  addedMeshIds: MeshId[]
  removedMeshIds: MeshId[]
  changedMeshes: Record<MeshId, Partial<MeshDef>>
  addedMaterialIds: MaterialId[]
  removedMaterialIds: MaterialId[]
  changedMaterials: Record<MaterialId, Partial<MaterialDef>>
}

export function diffSceneDocs(previous: SceneDoc, next: SceneDoc): SceneDelta {
  const changedNodes: Record<NodeId, Partial<SceneNode>> = {}
  const changedMeshes: Record<MeshId, Partial<MeshDef>> = {}
  const changedMaterials: Record<MaterialId, Partial<MaterialDef>> = {}

  const previousNodeIds = Object.keys(previous.nodes)
  const nextNodeIds = Object.keys(next.nodes)
  const previousMeshIds = Object.keys(previous.meshes)
  const nextMeshIds = Object.keys(next.meshes)
  const previousMaterialIds = Object.keys(previous.materials)
  const nextMaterialIds = Object.keys(next.materials)

  for (const nodeId of intersect(previousNodeIds, nextNodeIds)) {
    const prevNode = previous.nodes[nodeId]
    const nextNode = next.nodes[nodeId]
    const patch: Partial<SceneNode> = {}

    if (!isEqual(prevNode.parentId, nextNode.parentId)) patch.parentId = nextNode.parentId
    if (!isEqual(prevNode.children, nextNode.children)) patch.children = [...nextNode.children]
    if (!isEqual(prevNode.name, nextNode.name)) patch.name = nextNode.name
    if (!isEqual(prevNode.t, nextNode.t)) patch.t = [...nextNode.t]
    if (!isEqual(prevNode.r, nextNode.r)) patch.r = [...nextNode.r]
    if (!isEqual(prevNode.s, nextNode.s)) patch.s = [...nextNode.s]
    if (!isEqual(prevNode.meshId, nextNode.meshId)) patch.meshId = nextNode.meshId
    if (!isEqual(prevNode.materialId, nextNode.materialId)) patch.materialId = nextNode.materialId
    if (!isEqual(prevNode.visible, nextNode.visible)) patch.visible = nextNode.visible

    if (Object.keys(patch).length > 0) {
      changedNodes[nodeId] = patch
    }
  }

  for (const meshId of intersect(previousMeshIds, nextMeshIds)) {
    const prevMesh = previous.meshes[meshId]
    const nextMesh = next.meshes[meshId]
    const patch: Partial<MeshDef> = {}

    if (!isEqual(prevMesh.source.uri, nextMesh.source.uri)) {
      patch.source = { ...nextMesh.source }
    } else if (!isEqual(prevMesh.source.primitive, nextMesh.source.primitive)) {
      patch.source = { ...nextMesh.source }
    }

    if (Object.keys(patch).length > 0) {
      changedMeshes[meshId] = patch
    }
  }

  for (const materialId of intersect(previousMaterialIds, nextMaterialIds)) {
    const prevMaterial = previous.materials[materialId]
    const nextMaterial = next.materials[materialId]
    const patch: Partial<MaterialDef> = {}

    if (!isEqual(prevMaterial.baseColor, nextMaterial.baseColor)) {
      patch.baseColor = [...nextMaterial.baseColor]
    }
    if (!isEqual(prevMaterial.roughness, nextMaterial.roughness)) {
      patch.roughness = nextMaterial.roughness
    }
    if (!isEqual(prevMaterial.metalness, nextMaterial.metalness)) {
      patch.metalness = nextMaterial.metalness
    }
    if (!isEqual(prevMaterial.envMapIntensity, nextMaterial.envMapIntensity)) {
      patch.envMapIntensity = nextMaterial.envMapIntensity
    }

    if (Object.keys(patch).length > 0) {
      changedMaterials[materialId] = patch
    }
  }

  return {
    rootsChanged: !isEqual(previous.roots, next.roots),
    addedNodeIds: subtract(nextNodeIds, previousNodeIds),
    removedNodeIds: subtract(previousNodeIds, nextNodeIds),
    changedNodes,
    addedMeshIds: subtract(nextMeshIds, previousMeshIds),
    removedMeshIds: subtract(previousMeshIds, nextMeshIds),
    changedMeshes,
    addedMaterialIds: subtract(nextMaterialIds, previousMaterialIds),
    removedMaterialIds: subtract(previousMaterialIds, nextMaterialIds),
    changedMaterials,
  }
}

export function isSceneDeltaEmpty(delta: SceneDelta): boolean {
  return (
    !delta.rootsChanged
    && delta.addedNodeIds.length === 0
    && delta.removedNodeIds.length === 0
    && Object.keys(delta.changedNodes).length === 0
    && delta.addedMeshIds.length === 0
    && delta.removedMeshIds.length === 0
    && Object.keys(delta.changedMeshes).length === 0
    && delta.addedMaterialIds.length === 0
    && delta.removedMaterialIds.length === 0
    && Object.keys(delta.changedMaterials).length === 0
  )
}

function subtract<T extends string>(left: T[], right: T[]): T[] {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function intersect<T extends string>(left: T[], right: T[]): T[] {
  const rightSet = new Set(right)
  return left.filter((value) => rightSet.has(value))
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

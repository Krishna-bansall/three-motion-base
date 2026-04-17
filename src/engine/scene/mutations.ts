import type { MaterialDef, MaterialId, NodeId, Quat, SceneDoc, Vec3 } from './types'

export function setNodeTRS(
  scene: SceneDoc,
  nodeId: NodeId,
  trs: Partial<{
    t: Vec3
    r: Quat
    s: Vec3
  }>,
): void {
  const node = getNode(scene, nodeId)

  if (trs.t) node.t = [...trs.t]
  if (trs.r) node.r = [...trs.r]
  if (trs.s) node.s = [...trs.s]
}

export function setNodeVisible(scene: SceneDoc, nodeId: NodeId, visible: boolean): void {
  getNode(scene, nodeId).visible = visible
}

export function setNodeMaterial(
  scene: SceneDoc,
  nodeId: NodeId,
  materialId: MaterialId | undefined,
): void {
  getNode(scene, nodeId).materialId = materialId
}

export function patchMaterial(
  scene: SceneDoc,
  materialId: MaterialId,
  patch: Partial<MaterialDef>,
): void {
  const material = getMaterial(scene, materialId)

  if (patch.baseColor) material.baseColor = [...patch.baseColor]
  if (patch.roughness !== undefined) material.roughness = patch.roughness
  if (patch.metalness !== undefined) material.metalness = patch.metalness
  if (patch.envMapIntensity !== undefined) {
    material.envMapIntensity = patch.envMapIntensity
  }
  if (patch.extras) {
    material.extras = {
      ...material.extras,
      ...patch.extras,
    }
  }
}

function getNode(scene: SceneDoc, nodeId: NodeId) {
  const node = scene.nodes[nodeId]
  if (!node) {
    throw new Error(`Unknown scene node: ${nodeId}`)
  }

  return node
}

function getMaterial(scene: SceneDoc, materialId: MaterialId) {
  const material = scene.materials[materialId]
  if (!material) {
    throw new Error(`Unknown material: ${materialId}`)
  }

  return material
}

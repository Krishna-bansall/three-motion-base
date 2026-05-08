import * as THREE from 'three'
import type { NodeId, SceneDoc, SceneNode } from '../../scene/types'
import type { RuntimeSceneInstance, RuntimeSceneSource } from '../types'

export function buildRuntimeSceneInstanceFromSource(
  scene: SceneDoc,
  source: RuntimeSceneSource,
): RuntimeSceneInstance {
  const templateRoot = source.templateRoot as THREE.Object3D
  const rootObject = cloneTemplateObject(templateRoot)
  const nodeObjects = new Map<NodeId, object>()
  const materialObjects = new Map<string, object[]>()
  const rootNodeId = source.rootNodeId ?? scene.roots[0] ?? ''

  if (rootNodeId && scene.nodes[rootNodeId]) {
    mapSceneNodeToObject(scene, rootNodeId, rootObject, nodeObjects, materialObjects)
  }

  return {
    rootNodeId,
    rootObject,
    nodeObjects,
    materialObjects,
  }
}

function cloneTemplateObject(templateRoot: THREE.Object3D): THREE.Object3D {
  const clone = templateRoot.clone(true)

  clone.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (Array.isArray(object.material)) {
        object.material = object.material.map((material) => material.clone())
      } else if (object.material) {
        object.material = object.material.clone()
      }
    }
  })

  return clone
}

function mapSceneNodeToObject(
  scene: SceneDoc,
  nodeId: NodeId,
  object: THREE.Object3D,
  nodeObjects: Map<NodeId, object>,
  materialObjects: Map<string, object[]>,
): void {
  const node = scene.nodes[nodeId]
  if (!node) return

  tagObject(nodeId, object)
  applySceneNodeState(node, object)
  nodeObjects.set(nodeId, object)

  if (object instanceof THREE.Mesh && node.materialId) {
    tagMaterialInstances(object.material, node.materialId)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const nextMaterials = materialObjects.get(node.materialId) ?? []
    nextMaterials.push(...materials)
    materialObjects.set(node.materialId, nextMaterials)
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const childId = node.children[index]
    const childObject = object.children[index] as THREE.Object3D | undefined
    if (!childObject) continue

    mapSceneNodeToObject(scene, childId, childObject, nodeObjects, materialObjects)
  }
}

function applySceneNodeState(node: SceneNode, object: THREE.Object3D): void {
  object.name = node.name
  object.visible = node.visible
  object.position.set(...node.t)
  object.quaternion.set(...node.r)
  object.scale.set(...node.s)
}

function tagObject(nodeId: NodeId, object: THREE.Object3D): void {
  object.userData.threeMotionNodeId = nodeId
}

function tagMaterialInstances(materialLike: THREE.Material | THREE.Material[], materialId: string): void {
  const materials = Array.isArray(materialLike) ? materialLike : [materialLike]
  for (const material of materials) {
    material.userData.threeMotionMaterialId = materialId
  }
}

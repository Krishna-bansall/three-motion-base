import * as THREE from 'three'
import type { NodeId, SceneDoc, SceneNode } from '../../scene/types'
import type { RuntimeSceneInstance, RuntimeSceneSource } from '../types'

export function buildRuntimeSceneInstanceFromSource(
  scene: SceneDoc,
  source?: RuntimeSceneSource,
): RuntimeSceneInstance {
  const importedRootNodeId = source?.rootNodeId ?? ''
  const importedRootObject = source
    ? cloneTemplateObject(source.templateRoot as THREE.Object3D)
    : new THREE.Group()
  const importedNodeObjects = new Map<NodeId, object>()
  const nodeObjects = new Map<NodeId, object>()
  const materialObjects = new Map<string, object[]>()
  const rootNodeId = scene.roots[0] ?? importedRootNodeId

  if (importedRootNodeId && scene.nodes[importedRootNodeId]) {
    mapImportedSceneNodeToObject(
      scene,
      importedRootNodeId,
      importedRootObject,
      importedNodeObjects,
      materialObjects,
    )
  }

  const rootObject = rootNodeId && scene.nodes[rootNodeId]
    ? buildCanonicalObject(scene, rootNodeId, {
        importedNodeObjects,
        nodeObjects,
        materialObjects,
      })
    : new THREE.Group()

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

function mapImportedSceneNodeToObject(
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
  collectMaterialObject(node, object, materialObjects)

  for (let index = 0; index < node.children.length; index += 1) {
    const childId = node.children[index]
    const childObject = object.children[index] as THREE.Object3D | undefined
    if (!childObject) continue

    mapImportedSceneNodeToObject(scene, childId, childObject, nodeObjects, materialObjects)
  }
}

function buildCanonicalObject(
  scene: SceneDoc,
  nodeId: NodeId,
  context: {
    importedNodeObjects: Map<NodeId, object>
    nodeObjects: Map<NodeId, object>
    materialObjects: Map<string, object[]>
  },
): THREE.Object3D {
  const node = scene.nodes[nodeId]
  const importedObject = context.importedNodeObjects.get(nodeId) as THREE.Object3D | undefined
  const object = importedObject ?? createObjectForNode(scene, node)

  tagObject(nodeId, object)
  applySceneNodeState(node, object)
  context.nodeObjects.set(nodeId, object)
  collectMaterialObject(node, object, context.materialObjects)

  if (importedObject) {
    for (const [importedNodeId, childObject] of context.importedNodeObjects.entries()) {
      context.nodeObjects.set(importedNodeId, childObject)
    }
    return object
  }

  for (const childId of node.children) {
    const child = scene.nodes[childId]
    if (!child) continue

    object.add(buildCanonicalObject(scene, childId, context))
  }

  return object
}

function createObjectForNode(scene: SceneDoc, node: SceneNode): THREE.Object3D {
  if (node.light) {
    return createLight(node.light)
  }

  if (node.camera) {
    return new THREE.PerspectiveCamera(node.camera.fovDegrees, 1, node.camera.near, node.camera.far)
  }

  const mesh = node.meshId ? scene.meshes[node.meshId] : undefined

  if (!mesh) {
    return new THREE.Group()
  }

  const material = createMaterial(scene, node.materialId)

  switch (mesh.source.uri) {
    case 'builtin:studio/floor':
      return new THREE.Mesh(new THREE.CircleGeometry(3.2, 96), material)
    case 'builtin:studio/backdrop':
      return new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.8, 0.12), material)
    case 'builtin:studio/plinth':
      return new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.46, 64), material)
    default:
      return new THREE.Group()
  }
}

function createMaterial(scene: SceneDoc, materialId: string | undefined): THREE.Material {
  const material = materialId ? scene.materials[materialId] : undefined

  if (!material) {
    return new THREE.MeshStandardMaterial()
  }

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(...material.baseColor),
    roughness: material.roughness,
    metalness: material.metalness,
    envMapIntensity: material.envMapIntensity,
  })
}

function applySceneNodeState(node: SceneNode, object: THREE.Object3D): void {
  object.name = node.name
  object.visible = node.visible
  object.position.set(...node.t)
  object.quaternion.set(...node.r)
  object.scale.set(...node.s)

  if (object instanceof THREE.PerspectiveCamera && node.camera) {
    object.fov = node.camera.fovDegrees
    object.near = node.camera.near
    object.far = node.camera.far
    object.updateProjectionMatrix()
  }

  if (object instanceof THREE.Light && node.light) {
    object.color.setRGB(...node.light.color)
    object.intensity = node.light.intensity
  }
}

function collectMaterialObject(
  node: SceneNode,
  object: THREE.Object3D,
  materialObjects: Map<string, object[]>,
): void {
  if (!(object instanceof THREE.Mesh) || !node.materialId) return

  tagMaterialInstances(object.material, node.materialId)
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  const nextMaterials = materialObjects.get(node.materialId) ?? []
  for (const material of materials) {
    if (!nextMaterials.includes(material)) {
      nextMaterials.push(material)
    }
  }
  materialObjects.set(node.materialId, nextMaterials)
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

function createLight(light: NonNullable<SceneNode['light']>): THREE.Light {
  switch (light.kind) {
    case 'directional':
      return new THREE.DirectionalLight(new THREE.Color(...light.color), light.intensity)
    case 'point':
      return new THREE.PointLight(new THREE.Color(...light.color), light.intensity, light.distance ?? 0)
    case 'spot':
      return new THREE.SpotLight(
        new THREE.Color(...light.color),
        light.intensity,
        light.distance ?? 0,
        THREE.MathUtils.degToRad(light.angleDegrees ?? 36),
      )
  }
}

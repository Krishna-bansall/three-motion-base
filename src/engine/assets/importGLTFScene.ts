/**
 * Canonical GLTF import seam.
 *
 * This module turns a loaded Three.js glTF scene graph into the engine's
 * canonical SceneDoc plus explicit source information for runtime adapters.
 */
import * as THREE from 'three'
import { applySmartPBRDefaultsToScene } from './applySmartPBR'
import { createEmptySceneDoc } from '../scene/snapshot'
import type { MaterialId, MeshId, NodeId, SceneDoc, SceneNode } from '../scene/types'

export interface GLTFSourceReference {
  uri: string
  label: string
}

export interface ImportedGLTFSceneSourceCache {
  rootObject: THREE.Group
}

export interface ImportedGLTFSceneSource {
  reference: GLTFSourceReference
  rootNodeId: NodeId
  cache: ImportedGLTFSceneSourceCache
}

export interface ImportedGLTFScene {
  scene: SceneDoc
  source: ImportedGLTFSceneSource
}

export function importGLTFScene(
  gltfScene: THREE.Group,
  reference: GLTFSourceReference,
): ImportedGLTFScene {
  applySmartPBRDefaultsToScene(gltfScene)
  centerAndNormalize(gltfScene)

  const productRoot = new THREE.Group()
  productRoot.name = 'ProductRoot'
  productRoot.add(gltfScene)

  const scene = createEmptySceneDoc()
  const materialIdByMaterial = new WeakMap<THREE.Material, MaterialId>()
  let nextNodeIndex = 0
  let nextMeshIndex = 0
  let nextMaterialIndex = 0

  const rootNodeId = visitObject(productRoot, null, 'ProductRoot')
  scene.roots.push(rootNodeId)

  return {
    scene,
    source: {
      reference,
      rootNodeId,
      cache: {
        rootObject: productRoot,
      },
    },
  }

  function visitObject(
    object: THREE.Object3D,
    parentId: NodeId | null,
    fallbackName: string,
  ): NodeId {
    const nodeId = `node-${nextNodeIndex++}`
    const sceneNode: SceneNode = {
      id: nodeId,
      parentId,
      children: [],
      name: object.name || fallbackName,
      t: vector3ToTuple(object.position),
      r: quaternionToTuple(object.quaternion),
      s: vector3ToTuple(object.scale),
      visible: object.visible,
    }

    if (object instanceof THREE.Mesh) {
      const meshId: MeshId = `mesh-${nextMeshIndex}`
      scene.meshes[meshId] = {
        source: {
          uri: reference.uri,
          primitive: nextMeshIndex,
        },
      }
      sceneNode.meshId = meshId
      nextMeshIndex += 1

      const material = getCanonicalMaterial(object.material)
      if (material) {
        sceneNode.materialId = material
      }
    }

    scene.nodes[nodeId] = sceneNode

    for (let index = 0; index < object.children.length; index += 1) {
      const child = object.children[index]
      const childId = visitObject(child, nodeId, `${child.type}-${index}`)
      sceneNode.children.push(childId)
    }

    return nodeId
  }

  function getCanonicalMaterial(
    materialLike: THREE.Material | THREE.Material[],
  ): MaterialId | undefined {
    const material = Array.isArray(materialLike) ? materialLike[0] : materialLike
    if (!(material instanceof THREE.Material)) {
      return undefined
    }

    const existingId = materialIdByMaterial.get(material)
    if (existingId) {
      return existingId
    }

    const materialId: MaterialId = `material-${nextMaterialIndex++}`
    const standardMaterial = material as THREE.MeshStandardMaterial

    scene.materials[materialId] = {
      baseColor: standardMaterial.isMeshStandardMaterial
        ? colorToTuple(standardMaterial.color)
        : [1, 1, 1],
      roughness: standardMaterial.isMeshStandardMaterial ? standardMaterial.roughness : 1,
      metalness: standardMaterial.isMeshStandardMaterial ? standardMaterial.metalness : 0,
      envMapIntensity: standardMaterial.isMeshStandardMaterial ? standardMaterial.envMapIntensity : 1,
    }

    materialIdByMaterial.set(material, materialId)
    return materialId
  }
}

/** Normalizes imported content into the viewer's expected framing volume. */
function centerAndNormalize(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  object.position.sub(center)

  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) {
    const scale = 1.5 / maxDim
    object.scale.multiplyScalar(scale)
  }
}

function vector3ToTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function quaternionToTuple(quaternion: THREE.Quaternion): [number, number, number, number] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
}

function colorToTuple(color: THREE.Color): [number, number, number] {
  return [color.r, color.g, color.b]
}

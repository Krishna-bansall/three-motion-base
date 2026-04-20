/**
 * Loads GLTF/GLB assets into the engine's canonical scene format and produces
 * a cloneable runtime template for the active renderer.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { applySmartPBRDefaultsToScene } from './applySmartPBR'
import { cloneSceneDoc, createEmptySceneDoc } from '../scene/snapshot'
import type { MaterialId, MeshId, NodeId, SceneDoc, SceneNode } from '../scene/types'
import type { RuntimeSceneAssetBundle, RuntimeSceneInstance } from '../runtime/types'

const gltfLoader = new GLTFLoader()

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
dracoLoader.setDecoderConfig({ type: 'js' })
gltfLoader.setDRACOLoader(dracoLoader)

type FileWithRelativePath = File & { webkitRelativePath?: string }

export interface LoadedModel {
  /** Canonical renderer-agnostic scene graph */
  canonicalScene: SceneDoc
  /** Runtime asset bundle used by adapters to rebuild renderer state */
  runtimeAssets: RuntimeSceneAssetBundle
}

/** Loads a model from a URL. */
export async function loadGLTFFromURL(url: string): Promise<LoadedModel> {
  const gltf = await gltfLoader.loadAsync(url)
  return processGLTF(gltf.scene, url)
}

/** Loads a self-contained model file, typically from drag and drop. */
export async function loadGLTFFromFile(file: File): Promise<LoadedModel> {
  const url = URL.createObjectURL(file)
  try {
    const gltf = await gltfLoader.loadAsync(url)
    return processGLTF(gltf.scene, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Loads a split `.gltf` package by translating relative asset references into
 * in-memory blob URLs for the loader.
 */
export async function loadGLTFFromFiles(files: File[]): Promise<LoadedModel> {
  const gltfFile = files.find(f => f.name.endsWith('.gltf'))
  if (!gltfFile) {
    throw new Error('No .gltf file found in the provided files')
  }

  const blobUrlMap = new Map<string, string>()
  const allBlobUrls: string[] = []

  for (const file of files) {
    const blobUrl = URL.createObjectURL(file)
    allBlobUrls.push(blobUrl)

    const relativePath = normalizeAssetPath(
      (file as FileWithRelativePath).webkitRelativePath || file.name,
    )

    const filename = relativePath.split('/').pop() || file.name
    blobUrlMap.set(filename, blobUrl)
    blobUrlMap.set(relativePath, blobUrl)
  }

  const manager = new THREE.LoadingManager()
  const gltfRelativePath = normalizeAssetPath(
    (gltfFile as FileWithRelativePath).webkitRelativePath || gltfFile.name,
  )
  const gltfBlobUrl = blobUrlMap.get(gltfRelativePath) || blobUrlMap.get(gltfFile.name)
  if (!gltfBlobUrl) {
    throw new Error(`Unable to resolve blob URL for ${gltfRelativePath}`)
  }

  manager.setURLModifier((url: string) => {
    if (url === gltfBlobUrl) return url

    const normalizedUrl = normalizeAssetPath(url)
    const filename = normalizedUrl.split('/').pop() || normalizedUrl

    const mapped = blobUrlMap.get(normalizedUrl) || blobUrlMap.get(filename)
    if (mapped) return mapped

    return url
  })

  const customLoader = new GLTFLoader(manager)
  customLoader.setDRACOLoader(dracoLoader)

  try {
    const gltf = await customLoader.loadAsync(gltfBlobUrl)
    return processGLTF(gltf.scene, gltfFile.name)
  } finally {
    for (const url of allBlobUrls) {
      URL.revokeObjectURL(url)
    }
  }
}

function processGLTF(gltfScene: THREE.Group, sourceUri: string): LoadedModel {
  applySmartPBRDefaultsToScene(gltfScene)
  centerAndNormalize(gltfScene)

  const group = new THREE.Group()
  group.name = 'ProductRoot'
  group.add(gltfScene)

  const canonicalScene = createEmptySceneDoc()
  const nodeIdByObject = new Map<THREE.Object3D, NodeId>()
  const materialIdByMaterial = new Map<THREE.Material, MaterialId>()
  let nextNodeIndex = 0
  let nextMeshIndex = 0
  let nextMaterialIndex = 0

  const rootNodeId = visitObject(group, null, 'ProductRoot')
  canonicalScene.roots.push(rootNodeId)
  const runtimeAssets = createRuntimeSceneAssetBundle(
    cloneSceneDoc(canonicalScene),
    sourceUri,
    rootNodeId,
    group,
  )

  return {
    canonicalScene,
    runtimeAssets,
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

    object.userData.threeMotionNodeId = nodeId

    if (object instanceof THREE.Mesh) {
      const meshId: MeshId = `mesh-${nextMeshIndex}`
      canonicalScene.meshes[meshId] = {
        source: {
          uri: sourceUri,
          primitive: nextMeshIndex,
        },
      }
      sceneNode.meshId = meshId
      nextMeshIndex += 1

      const material = getCanonicalMaterial(object.material)
      if (material) {
        sceneNode.materialId = material
        tagMaterials(object.material, material)
      }
    }

    canonicalScene.nodes[nodeId] = sceneNode
    nodeIdByObject.set(object, nodeId)

    for (let i = 0; i < object.children.length; i += 1) {
      const child = object.children[i]
      const childId = visitObject(child, nodeId, `${child.type}-${i}`)
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

    canonicalScene.materials[materialId] = {
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

function createRuntimeSceneAssetBundle(
  canonicalScene: SceneDoc,
  sourceUri: string,
  rootNodeId: NodeId,
  templateRoot: THREE.Group,
): RuntimeSceneAssetBundle {
  return {
    canonicalScene,
    sourceUri,
    rootNodeId,
    instantiate(): RuntimeSceneInstance {
      // Clone geometry graph once per rebuild and fork materials so edits do not
      // leak back into the reusable template.
      const rootObject = cloneTemplateGroup(templateRoot)
      const nodeObjects = new Map<NodeId, object>()
      const materialObjects = new Map<string, object[]>()

      rootObject.traverse((object) => {
        const nodeId = object.userData.threeMotionNodeId as NodeId | undefined
        if (nodeId) {
          nodeObjects.set(nodeId, object)
        }

        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            const materialId = material.userData.threeMotionMaterialId as string | undefined
            if (!materialId) continue

            const entries = materialObjects.get(materialId) ?? []
            entries.push(material)
            materialObjects.set(materialId, entries)
          }
        }
      })

      return {
        rootNodeId,
        rootObject,
        nodeObjects,
        materialObjects,
      }
    },
  }
}

function cloneTemplateGroup(templateRoot: THREE.Group): THREE.Group {
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

function tagMaterials(
  materialLike: THREE.Material | THREE.Material[],
  materialId: MaterialId,
): void {
  const materials = Array.isArray(materialLike) ? materialLike : [materialLike]
  for (const material of materials) {
    material.userData.threeMotionMaterialId = materialId
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

function normalizeAssetPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
}

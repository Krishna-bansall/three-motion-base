/**
 * Step 4: GLTF Loader Pipeline
 * 
 * GLTFLoader → traverse → mint ECS entities → side-maps.
 * Centers and normalizes the loaded model to fit a unit bounding box.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { addEntity, addComponent } from 'bitecs'
import { world } from '../ecs/world'
import {
  Transform,
  Material,
  MeshRef,
  ProductRoot,
  eidToObject3D,
  eidToMaterial,
} from '../ecs/components'
import { applySmartPBRDefaultsToScene } from './applySmartPBR'

// ── Loader setup ────────────────────────────────────────────

const gltfLoader = new GLTFLoader()

// DRACO decoder for compressed meshes
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
dracoLoader.setDecoderConfig({ type: 'js' })
gltfLoader.setDRACOLoader(dracoLoader)

// ── Types ───────────────────────────────────────────────────

export interface LoadedModel {
  /** The ECS entity ID of the product root */
  rootEid: number
  /** All mesh entity IDs created */
  meshEids: number[]
  /** The Three.js group added to the scene */
  group: THREE.Group
}

// ── Loading ─────────────────────────────────────────────────

/**
 * Load a GLTF/GLB model from a URL.
 */
export async function loadGLTFFromURL(url: string): Promise<LoadedModel> {
  const gltf = await gltfLoader.loadAsync(url)
  return processGLTF(gltf.scene)
}

/**
 * Load a GLTF/GLB model from a File (drag-drop workflow).
 * Works for .glb (self-contained) files.
 */
export async function loadGLTFFromFile(file: File): Promise<LoadedModel> {
  const url = URL.createObjectURL(file)
  try {
    const gltf = await gltfLoader.loadAsync(url)
    return processGLTF(gltf.scene)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Load a GLTF model from multiple files (GLTF + textures + .bin).
 * 
 * Builds an in-memory blob URL filesystem so GLTFLoader can resolve
 * relative resource references (textures, .bin buffers).
 * 
 * How it works:
 * 1. Find the .gltf file among the provided files
 * 2. Create blob URLs for every file, keyed by relative path
 * 3. Set GLTFLoader's resource path to "" and use a custom LoadingManager
 *    that intercepts URL resolution and maps relative paths to blob URLs
 * 4. Load the GLTF using the blob URL of the .gltf file
 * 5. Clean up all blob URLs afterward
 */
export async function loadGLTFFromFiles(files: File[]): Promise<LoadedModel> {
  const gltfFile = files.find(f => f.name.endsWith('.gltf'))
  if (!gltfFile) {
    throw new Error('No .gltf file found in the provided files')
  }

  // Build a map of filename → blob URL for all files
  // Handle both flat file lists and webkitdirectory paths
  const blobUrlMap = new Map<string, string>()
  const allBlobUrls: string[] = []

  for (const file of files) {
    const blobUrl = URL.createObjectURL(file)
    allBlobUrls.push(blobUrl)

    // Use webkitRelativePath if available (folder upload), otherwise just name
    const relativePath = (file as any).webkitRelativePath || file.name

    // Store by filename only (no directory prefix)
    const filename = relativePath.split('/').pop() || file.name
    blobUrlMap.set(filename, blobUrl)

    // Also store the full relative path (some GLTF files use subdirectory refs)
    blobUrlMap.set(relativePath, blobUrl)
  }

  // Create a custom LoadingManager that resolves resource URLs via our blob map
  const manager = new THREE.LoadingManager()
  const gltfBlobUrl = blobUrlMap.get(gltfFile.name)!

  manager.setURLModifier((url: string) => {
    // If it's the main GLTF file, return as-is
    if (url === gltfBlobUrl) return url

    // Extract the filename from the URL (handles both relative and absolute paths)
    const filename = url.split('/').pop() || url

    // Check our blob map
    const mapped = blobUrlMap.get(filename) || blobUrlMap.get(url)
    if (mapped) return mapped

    // Fallback: return the original URL
    return url
  })

  // Create a loader instance with our custom manager
  const customLoader = new GLTFLoader(manager)
  customLoader.setDRACOLoader(dracoLoader)

  try {
    const gltf = await customLoader.loadAsync(gltfBlobUrl)
    return processGLTF(gltf.scene)
  } finally {
    // Clean up all blob URLs
    for (const url of allBlobUrls) {
      URL.revokeObjectURL(url)
    }
  }
}

// ── Processing ──────────────────────────────────────────────

function processGLTF(gltfScene: THREE.Group): LoadedModel {
  // Apply smart PBR defaults
  applySmartPBRDefaultsToScene(gltfScene)

  // Center and normalize
  centerAndNormalize(gltfScene)

  // Create wrapper group
  const group = new THREE.Group()
  group.add(gltfScene)

  // Mint product root entity
  const rootEid = addEntity(world)
  addComponent(world, rootEid, ProductRoot)
  addComponent(world, rootEid, Transform)
  eidToObject3D.set(rootEid, group)

  // Set initial transform
  Transform.px[rootEid] = 0
  Transform.py[rootEid] = 0
  Transform.pz[rootEid] = 0
  Transform.rx[rootEid] = 0
  Transform.ry[rootEid] = 0
  Transform.rz[rootEid] = 0
  Transform.sx[rootEid] = 1
  Transform.sy[rootEid] = 1
  Transform.sz[rootEid] = 1

  // Mint entities for each mesh
  const meshEids: number[] = []

  gltfScene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const eid = addEntity(world)
      addComponent(world, eid, MeshRef)
      addComponent(world, eid, Transform)
      addComponent(world, eid, Material)

      eidToObject3D.set(eid, node)

      // Populate transform from the mesh
      Transform.px[eid] = node.position.x
      Transform.py[eid] = node.position.y
      Transform.pz[eid] = node.position.z
      Transform.rx[eid] = node.rotation.x
      Transform.ry[eid] = node.rotation.y
      Transform.rz[eid] = node.rotation.z
      Transform.sx[eid] = node.scale.x
      Transform.sy[eid] = node.scale.y
      Transform.sz[eid] = node.scale.z

      // Populate material from the mesh
      const mat = node.material as THREE.MeshStandardMaterial
      if (mat && mat.isMeshStandardMaterial) {
        eidToMaterial.set(eid, mat)
        Material.roughness[eid] = mat.roughness
        Material.metalness[eid] = mat.metalness
        Material.envMapIntensity[eid] = mat.envMapIntensity
        Material.r[eid] = mat.color.r
        Material.g[eid] = mat.color.g
        Material.b[eid] = mat.color.b
      }

      meshEids.push(eid)
    }
  })

  return { rootEid, meshEids, group }
}

/**
 * Centers a model on the origin and scales it to fit within a unit bounding box.
 */
function centerAndNormalize(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  // Center on origin
  object.position.sub(center)

  // Scale to fit unit bounding box
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) {
    const scale = 1.5 / maxDim
    object.scale.multiplyScalar(scale)
  }
}

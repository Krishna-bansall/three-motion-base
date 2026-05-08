/**
 * Compatibility loaders for GLTF/GLB assets.
 *
 * The canonical scene construction lives in `importGLTFScene.ts`. These
 * wrappers keep the existing public loading entrypoints alive for EngineAPI
 * while the runtime adapter transition continues.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { cloneSceneDoc } from '../scene/snapshot'
import type { NodeId, SceneDoc } from '../scene/types'
import type { RuntimeSceneAssetBundle, RuntimeSceneSource } from '../runtime/types'
import { buildRuntimeSceneInstanceFromSource } from '../runtime/three/runtimeScene'
import {
  importGLTFScene,
  type GLTFSourceReference,
  type ImportedGLTFSceneSource,
} from './importGLTFScene'

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
  /** Adapter-facing source reference and runtime cache */
  source: ImportedGLTFSceneSource
}

/** Loads a model from a URL. */
export async function loadGLTFFromURL(url: string): Promise<LoadedModel> {
  const gltf = await gltfLoader.loadAsync(url)
  return buildLoadedModel(gltf.scene, {
    uri: url,
    label: deriveSourceLabel(url),
  })
}

/** Loads a self-contained model file, typically from drag and drop. */
export async function loadGLTFFromFile(file: File): Promise<LoadedModel> {
  const url = URL.createObjectURL(file)
  try {
    const gltf = await gltfLoader.loadAsync(url)
    return buildLoadedModel(gltf.scene, {
      uri: normalizeAssetPath((file as FileWithRelativePath).webkitRelativePath || file.name),
      label: file.name,
    })
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
    return buildLoadedModel(gltf.scene, {
      uri: gltfRelativePath,
      label: gltfFile.name,
    })
  } finally {
    for (const url of allBlobUrls) {
      URL.revokeObjectURL(url)
    }
  }
}

function buildLoadedModel(
  gltfScene: THREE.Group,
  sourceReference: GLTFSourceReference,
): LoadedModel {
  const imported = importGLTFScene(gltfScene, sourceReference)
  const canonicalScene = cloneSceneDoc(imported.scene)
  const runtimeSource: RuntimeSceneSource = {
    rootNodeId: imported.source.rootNodeId,
    templateRoot: imported.source.cache.rootObject,
  }
  const runtimeAssets = createRuntimeSceneAssetBundle(
    cloneSceneDoc(canonicalScene),
    imported.source.reference.uri,
    imported.source.rootNodeId,
    runtimeSource,
  )

  return {
    canonicalScene,
    runtimeAssets,
    source: imported.source,
  }
}

function createRuntimeSceneAssetBundle(
  canonicalScene: SceneDoc,
  sourceUri: string,
  rootNodeId: NodeId,
  source: RuntimeSceneSource,
): RuntimeSceneAssetBundle {
  return {
    canonicalScene,
    sourceUri,
    rootNodeId,
    source,
    instantiate: () => buildRuntimeSceneInstanceFromSource(canonicalScene, source),
  }
}

function normalizeAssetPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
}

function deriveSourceLabel(uri: string): string {
  const normalized = normalizeAssetPath(uri)
  const withoutQuery = normalized.split('?')[0].split('#')[0]
  return withoutQuery.split('/').pop() || withoutQuery || uri
}

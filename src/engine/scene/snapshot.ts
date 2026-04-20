import { DEFAULT_SCENE_METADATA } from './types'
import type { SceneDoc } from './types'

export function createEmptySceneDoc(): SceneDoc {
  return {
    roots: [],
    nodes: {},
    meshes: {},
    materials: {},
    metadata: { ...DEFAULT_SCENE_METADATA },
  }
}

export function cloneSceneDoc(scene: SceneDoc): SceneDoc {
  return structuredClone(scene)
}

export function serializeSceneDoc(scene: SceneDoc): string {
  return JSON.stringify(scene, null, 2)
}

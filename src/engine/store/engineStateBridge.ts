import { useEngineStore, type EntityInfo } from '../../store/useEngineStore'
import type { RuntimeDebugGraph, TransformGizmoMode } from '../runtime/types'
import type { SceneDoc } from '../scene/types'
import {
  cloneViewSettings,
  type BloomSettings,
  type CinematicSettings,
  type HDRIPreset,
  type ViewSettings,
} from '../viewSettings'

export interface RuntimeStateGraph {
  history: {
    canUndo: boolean
    canRedo: boolean
    undoDepth: number
    redoDepth: number
    currentIndex: number
    totalStates: number
  }
  scene: {
    hasModel: boolean
    isLoading: boolean
    activeHDRI: HDRIPreset
    exposure: number
    bloom: BloomSettings
    cinematic: CinematicSettings
    autoRotate: boolean
    autoRotateSpeed: number
    transformMode: TransformGizmoMode | null
  }
  root: RuntimeDebugGraph['root']
  meshes: RuntimeDebugGraph['meshes']
}

export interface RuntimeStateGraphParams {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  currentIndex: number
  totalStates: number
  transformMode: TransformGizmoMode | null
  runtimeGraph: RuntimeDebugGraph
}

export interface ConsoleStateParams {
  hasCanonicalScene: boolean
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  currentIndex: number
  totalStates: number
  transformMode: TransformGizmoMode | null
  pathTracingReadiness: object
}

export function readViewSettingsFromStore(): ViewSettings {
  const state = useEngineStore.getState()
  return cloneViewSettings({
    activeHDRI: state.activeHDRI,
    exposure: state.exposure,
    bloom: state.bloom,
    cinematic: state.cinematic,
    autoRotate: state.autoRotate,
    autoRotateSpeed: state.autoRotateSpeed,
  })
}

export function publishViewSettings(settings: ViewSettings): void {
  const store = useEngineStore.getState()
  const next = cloneViewSettings(settings)
  store.setActiveHDRI(next.activeHDRI)
  store.setExposure(next.exposure)
  store.setBloom(next.bloom)
  store.setCinematic(next.cinematic)
  store.setAutoRotate(next.autoRotate)
  store.setAutoRotateSpeed(next.autoRotateSpeed)
}

export function publishHistoryAvailability(canUndo: boolean, canRedo: boolean): void {
  useEngineStore.getState().setHistoryAvailability({ canUndo, canRedo })
}

export function publishHasModel(hasModel: boolean): void {
  useEngineStore.getState().setHasModel(hasModel)
}

export function publishLoading(isLoading: boolean): void {
  useEngineStore.getState().setLoading(isLoading)
}

export function publishEntities(scene: SceneDoc | null): void {
  if (!scene) {
    useEngineStore.getState().setEntities([])
    return
  }

  const entities: EntityInfo[] = Object.values(scene.nodes)
    .filter((node) => node.meshId && node.materialId)
    .map((node) => {
      const material = scene.materials[node.materialId!]
      return {
        nodeId: node.id,
        materialId: node.materialId!,
        name: node.name,
        roughness: material.roughness,
        metalness: material.metalness,
        envMapIntensity: material.envMapIntensity,
        r: material.baseColor[0],
        g: material.baseColor[1],
        b: material.baseColor[2],
      }
    })

  useEngineStore.getState().setEntities(entities)
}

export function buildSceneSnapshot(
  hasCanonicalScene: boolean,
  transformMode: TransformGizmoMode | null,
): object {
  const state = useEngineStore.getState()
  return {
    entities: state.entities,
    hasCanonicalScene,
    activeHDRI: state.activeHDRI,
    exposure: state.exposure,
    bloom: state.bloom,
    cinematic: state.cinematic,
    autoRotate: state.autoRotate,
    autoRotateSpeed: state.autoRotateSpeed,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    transformMode,
  }
}

export function buildRuntimeStateGraph(params: RuntimeStateGraphParams): RuntimeStateGraph {
  const state = useEngineStore.getState()
  return {
    history: {
      canUndo: params.canUndo,
      canRedo: params.canRedo,
      undoDepth: params.undoDepth,
      redoDepth: params.redoDepth,
      currentIndex: params.currentIndex,
      totalStates: params.totalStates,
    },
    scene: {
      hasModel: state.hasModel,
      isLoading: state.isLoading,
      activeHDRI: state.activeHDRI,
      exposure: state.exposure,
      bloom: { ...state.bloom },
      cinematic: { ...state.cinematic },
      autoRotate: state.autoRotate,
      autoRotateSpeed: state.autoRotateSpeed,
      transformMode: params.transformMode,
    },
    root: params.runtimeGraph.root,
    meshes: params.runtimeGraph.meshes,
  }
}

export function buildConsoleState(params: ConsoleStateParams): object {
  const state = useEngineStore.getState()
  return {
    isLoading: state.isLoading,
    hasModel: state.hasModel,
    hasCanonicalScene: params.hasCanonicalScene,
    canUndo: params.canUndo,
    canRedo: params.canRedo,
    history: {
      undoDepth: params.undoDepth,
      redoDepth: params.redoDepth,
      currentIndex: params.currentIndex,
      totalStates: params.totalStates,
    },
    transformMode: params.transformMode,
    entities: state.entities,
    activeHDRI: state.activeHDRI,
    exposure: state.exposure,
    bloom: state.bloom,
    cinematic: state.cinematic,
    autoRotate: state.autoRotate,
    autoRotateSpeed: state.autoRotateSpeed,
    pathTracingReadiness: params.pathTracingReadiness,
  }
}

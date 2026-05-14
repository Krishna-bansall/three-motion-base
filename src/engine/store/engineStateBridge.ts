import {
  useEngineStore,
  type ActiveShotInfo,
  type EntityInfo,
  type StudioSetupObjectInfo,
  type TimelineLayerInfo,
  type TimelineRowInfo,
  type TrackedObjectTransform,
} from '../../store/useEngineStore'
import type { ProjectDoc } from '../project/types'
import type { RuntimeDebugGraph, TransformGizmoMode } from '../runtime/types'
import type { SceneDoc } from '../scene/types'
import { quaternionToEulerXYZ, radiansToDegrees } from '../scene/transformMath'
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
    trackedObjectTransform: TrackedObjectTransform | null
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

export function publishTrackedObjectTransform(scene: SceneDoc | null, nodeId?: string | null): void {
  useEngineStore.getState().setTrackedObjectTransform(buildTrackedObjectTransform(scene, nodeId))
}

export function publishStudioSetupObjects(project: ProjectDoc): void {
  const objects: StudioSetupObjectInfo[] = Object.values(project.studioScene.studioGeometry)
    .map((object) => ({
      id: object.id,
      nodeId: object.nodeId,
      name: object.name,
      kind: object.kind,
      visible: object.visible,
      editable: {
        transform: [...object.editable.transform],
        material: object.editable.material,
        visibility: object.editable.visibility,
        animationTarget: object.editable.animationTarget,
      },
    }))

  useEngineStore.getState().setStudioSetupObjects(objects)
}

export function publishSelectedStudioObject(nodeId: string | null): void {
  useEngineStore.getState().setSelectedStudioObjectNodeId(nodeId)
}

export function publishProjectLook(project: ProjectDoc): void {
  useEngineStore.getState().setActiveLookId(project.look.id)
}

export function publishAnimationTimeline(project: ProjectDoc): void {
  const activeShot = project.shots[project.activeShotId]
  const store = useEngineStore.getState()
  const shotInfo: ActiveShotInfo = {
    id: activeShot.id,
    name: activeShot.name,
    durationSeconds: activeShot.durationSeconds,
    fps: activeShot.fps,
    aspect: { ...activeShot.aspect },
  }
  const rows: TimelineRowInfo[] = activeShot.sequence.rows.map((row) => ({
    id: row.id,
    name: row.name,
    targetNodeId: row.targetNodeId,
    targetKind: row.targetKind,
    category: row.category,
    layers: row.items
      .filter((item) => item.kind === 'layer')
      .map((item): TimelineLayerInfo => ({
        id: item.id,
        name: item.name,
        targetNodeId: item.targetNodeId,
        targetKind: item.targetKind,
        presetId: item.presetId,
        enabled: item.enabled,
        startTimeSeconds: item.startTimeSeconds,
        durationSeconds: item.durationSeconds,
        strength: item.strength,
        parameters: structuredClone(item.parameters),
      })),
  }))

  store.setActiveShot(shotInfo)
  store.setTimelineRows(rows)
}

export function publishTimelineTime(timeSeconds: number): void {
  useEngineStore.getState().setTimelineTimeSeconds(timeSeconds)
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
    trackedObjectTransform: state.trackedObjectTransform,
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
      trackedObjectTransform: state.trackedObjectTransform,
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
    trackedObjectTransform: state.trackedObjectTransform,
    activeHDRI: state.activeHDRI,
    exposure: state.exposure,
    bloom: state.bloom,
    cinematic: state.cinematic,
    autoRotate: state.autoRotate,
    autoRotateSpeed: state.autoRotateSpeed,
    pathTracingReadiness: params.pathTracingReadiness,
  }
}

function buildTrackedObjectTransform(
  scene: SceneDoc | null,
  trackedNodeId?: string | null,
): TrackedObjectTransform | null {
  if (!scene) {
    return null
  }

  const rootNodeId = trackedNodeId ?? scene.roots[0]
  if (!rootNodeId) {
    return null
  }

  const rootNode = scene.nodes[rootNodeId]
  if (!rootNode) {
    return null
  }

  const [rx, ry, rz] = quaternionToEulerXYZ(rootNode.r)
  const [px, py, pz] = rootNode.t

  return {
    position: rootNode.t.map(round3) as TrackedObjectTransform['position'],
    rotation: [rx, ry, rz].map((value) => round3(radiansToDegrees(value))) as TrackedObjectTransform['rotation'],
    scale: rootNode.s.map(round3) as TrackedObjectTransform['scale'],
    distanceFromOrigin: round3(Math.hypot(px, py, pz)),
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

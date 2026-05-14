/**
 * Step 7: Zustand Store
 * 
 * Engine writes display state here; React reads it.
 * React never touches Three.js objects — only reads from this store.
 */
import { create } from 'zustand'
import {
  createDefaultViewSettings,
  type BloomSettings,
  type CinematicSettings,
  type HDRIPreset,
} from '../engine/viewSettings'
import type { AnimationTargetKind, MotionLayerParameters, MotionPresetId, SequenceCategory } from '../engine/project/types'

export interface EntityInfo {
  nodeId: string
  materialId: string
  name: string
  roughness: number
  metalness: number
  envMapIntensity: number
  r: number
  g: number
  b: number
}

export interface TrackedObjectTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  distanceFromOrigin: number
}

export interface StudioSetupObjectInfo {
  id: string
  nodeId: string
  name: string
  kind: string
  visible: boolean
  editable: {
    transform: string[]
    material: boolean
    visibility: boolean
    animationTarget: boolean
  }
}

export interface TimelineLayerInfo {
  id: string
  name: string
  targetNodeId: string
  targetKind: AnimationTargetKind
  presetId: MotionPresetId
  enabled: boolean
  startTimeSeconds: number
  durationSeconds: number
  strength: number
  parameters: MotionLayerParameters
}

export interface TimelineRowInfo {
  id: string
  name: string
  targetNodeId: string
  targetKind: AnimationTargetKind
  category: SequenceCategory
  layers: TimelineLayerInfo[]
}

export interface ActiveShotInfo {
  id: string
  name: string
  durationSeconds: number
  fps: number
  aspect: {
    width: number
    height: number
  }
}

export interface EngineState {
  // ── Model ──
  isLoading: boolean
  entities: EntityInfo[]
  hasModel: boolean
  canUndo: boolean
  canRedo: boolean
  trackedObjectTransform: TrackedObjectTransform | null
  studioSetupObjects: StudioSetupObjectInfo[]
  selectedStudioObjectNodeId: string | null
  activeLookId: string
  activeShot: ActiveShotInfo
  timelineRows: TimelineRowInfo[]
  timelineTimeSeconds: number

  // ── Lighting ──
  activeHDRI: HDRIPreset
  exposure: number

  // ── Post-processing ──
  bloom: BloomSettings
  cinematic: CinematicSettings

  // ── Turntable ──
  autoRotate: boolean
  autoRotateSpeed: number

  // ── Actions (called by engine, not by React directly) ──
  setLoading: (v: boolean) => void
  setEntities: (e: EntityInfo[]) => void
  setHasModel: (v: boolean) => void
  setHistoryAvailability: (history: { canUndo: boolean; canRedo: boolean }) => void
  setTrackedObjectTransform: (transform: TrackedObjectTransform | null) => void
  setStudioSetupObjects: (objects: StudioSetupObjectInfo[]) => void
  setSelectedStudioObjectNodeId: (nodeId: string | null) => void
  setActiveLookId: (lookId: string) => void
  setActiveShot: (shot: ActiveShotInfo) => void
  setTimelineRows: (rows: TimelineRowInfo[]) => void
  setTimelineTimeSeconds: (time: number) => void
  setActiveHDRI: (h: HDRIPreset) => void
  setExposure: (v: number) => void
  setBloom: (b: BloomSettings) => void
  setCinematic: (c: CinematicSettings) => void
  setAutoRotate: (v: boolean) => void
  setAutoRotateSpeed: (v: number) => void
}

export const useEngineStore = create<EngineState>((set) => ({
  isLoading: false,
  entities: [],
  hasModel: false,
  canUndo: false,
  canRedo: false,
  trackedObjectTransform: null,
  studioSetupObjects: [],
  selectedStudioObjectNodeId: null,
  activeLookId: 'look-studio-neutral',
  activeShot: {
    id: 'shot-main',
    name: 'Main Shot',
    durationSeconds: 5,
    fps: 30,
    aspect: { width: 16, height: 9 },
  },
  timelineRows: [],
  timelineTimeSeconds: 0,

  ...createDefaultViewSettings(),

  setLoading: (v) => set({ isLoading: v }),
  setEntities: (e) => set({ entities: e }),
  setHasModel: (v) => set({ hasModel: v }),
  setHistoryAvailability: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
  setTrackedObjectTransform: (transform) => set({ trackedObjectTransform: transform }),
  setStudioSetupObjects: (objects) => set({ studioSetupObjects: objects }),
  setSelectedStudioObjectNodeId: (nodeId) => set({ selectedStudioObjectNodeId: nodeId }),
  setActiveLookId: (lookId) => set({ activeLookId: lookId }),
  setActiveShot: (shot) => set({ activeShot: shot }),
  setTimelineRows: (rows) => set({ timelineRows: rows }),
  setTimelineTimeSeconds: (time) => set({ timelineTimeSeconds: time }),
  setActiveHDRI: (h) => set({ activeHDRI: h }),
  setExposure: (v) => set({ exposure: v }),
  setBloom: (b) => set({ bloom: b }),
  setCinematic: (c) => set({ cinematic: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setAutoRotateSpeed: (v) => set({ autoRotateSpeed: v }),
}))

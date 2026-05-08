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

export interface EngineState {
  // ── Model ──
  isLoading: boolean
  entities: EntityInfo[]
  hasModel: boolean
  canUndo: boolean
  canRedo: boolean

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

  ...createDefaultViewSettings(),

  setLoading: (v) => set({ isLoading: v }),
  setEntities: (e) => set({ entities: e }),
  setHasModel: (v) => set({ hasModel: v }),
  setHistoryAvailability: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
  setActiveHDRI: (h) => set({ activeHDRI: h }),
  setExposure: (v) => set({ exposure: v }),
  setBloom: (b) => set({ bloom: b }),
  setCinematic: (c) => set({ cinematic: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setAutoRotateSpeed: (v) => set({ autoRotateSpeed: v }),
}))

/**
 * Step 7: Zustand Store
 * 
 * Engine writes display state here; React reads it.
 * React never touches Three.js objects — only reads from this store.
 */
import { create } from 'zustand'
import type { BloomSettings, CinematicSettings } from '../engine/renderer/PostProcessing'
import type { HDRIPreset } from '../engine/renderer/ThreeRenderer'

export interface EntityInfo {
  eid: number
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

  activeHDRI: 'studio',
  exposure: 1.0,

  bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 },
  cinematic: {
    vignette: 0.35,
    vignetteEnabled: true,
    chromaticAberration: 0.003,
    filmGrain: 0.0,
    colorTemperature: 0.0,
  },

  autoRotate: false,
  autoRotateSpeed: 0.3,

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

/**
 * Step 7: Engine API
 * 
 * The ONLY public surface that React calls.
 * Orchestrates renderer, ECS, asset loading, and store updates.
 */
import { addComponent } from 'bitecs'
import { ThreeRenderer, type HDRIPreset } from './renderer/ThreeRenderer'
import { loadGLTFFromURL, loadGLTFFromFile, loadGLTFFromFiles, type LoadedModel } from './assets/loadGLTF'
import { exportPNG } from './renderer/exportPNG'
import { world } from './ecs/world'
import {
  Transform,
  Material,
  DirtyTransform,
  DirtyMaterial,
  eidToObject3D,
  eidToMaterial,
} from './ecs/components'
import { useEngineStore, type EntityInfo } from '../store/useEngineStore'

export class EngineAPI {
  private threeRenderer: ThreeRenderer | null = null
  private currentModel: LoadedModel | null = null

  // ── Lifecycle ───────────────────────────────────────────

  init(container: HTMLElement): void {
    this.threeRenderer = new ThreeRenderer()
    this.threeRenderer.mount(container)
  }

  dispose(): void {
    this.threeRenderer?.unmount()
    this.threeRenderer = null
  }

  // ── Model Loading ───────────────────────────────────────

  async loadModel(url: string): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      // Remove previous model
      this.clearModel()

      // Load new model
      const model = await loadGLTFFromURL(url)
      this.currentModel = model

      // Add to scene's product root
      this.threeRenderer.productRoot.add(model.group)

      // Update store
      store.setHasModel(true)
      this.syncEntitiesToStore()
    } finally {
      store.setLoading(false)
    }
  }

  async loadModelFromFile(file: File): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      this.clearModel()

      const model = await loadGLTFFromFile(file)
      this.currentModel = model

      this.threeRenderer.productRoot.add(model.group)

      store.setHasModel(true)
      this.syncEntitiesToStore()
    } finally {
      store.setLoading(false)
    }
  }

  async loadModelFromFiles(files: File[]): Promise<void> {
    if (!this.threeRenderer) return
    const store = useEngineStore.getState()

    store.setLoading(true)

    try {
      this.clearModel()

      const model = await loadGLTFFromFiles(files)
      this.currentModel = model

      this.threeRenderer.productRoot.add(model.group)

      store.setHasModel(true)
      this.syncEntitiesToStore()
    } finally {
      store.setLoading(false)
    }
  }

  private clearModel(): void {
    if (this.currentModel && this.threeRenderer) {
      this.threeRenderer.productRoot.remove(this.currentModel.group)

      // Clean up side-maps
      eidToObject3D.delete(this.currentModel.rootEid)
      for (const eid of this.currentModel.meshEids) {
        eidToObject3D.delete(eid)
        eidToMaterial.delete(eid)
      }

      this.currentModel = null
    }
  }

  // ── Transform ───────────────────────────────────────────

  setTransform(
    eid: number,
    t: Partial<{
      px: number; py: number; pz: number
      rx: number; ry: number; rz: number
      sx: number; sy: number; sz: number
    }>,
  ): void {
    if (t.px !== undefined) Transform.px[eid] = t.px
    if (t.py !== undefined) Transform.py[eid] = t.py
    if (t.pz !== undefined) Transform.pz[eid] = t.pz
    if (t.rx !== undefined) Transform.rx[eid] = t.rx
    if (t.ry !== undefined) Transform.ry[eid] = t.ry
    if (t.rz !== undefined) Transform.rz[eid] = t.rz
    if (t.sx !== undefined) Transform.sx[eid] = t.sx
    if (t.sy !== undefined) Transform.sy[eid] = t.sy
    if (t.sz !== undefined) Transform.sz[eid] = t.sz

    addComponent(world, eid, DirtyTransform)
    this.syncEntitiesToStore()
  }

  // ── Material ────────────────────────────────────────────

  setMaterial(
    eid: number,
    m: Partial<{
      roughness: number
      metalness: number
      envMapIntensity: number
      r: number
      g: number
      b: number
    }>,
  ): void {
    if (m.roughness !== undefined) Material.roughness[eid] = m.roughness
    if (m.metalness !== undefined) Material.metalness[eid] = m.metalness
    if (m.envMapIntensity !== undefined) Material.envMapIntensity[eid] = m.envMapIntensity
    if (m.r !== undefined) Material.r[eid] = m.r
    if (m.g !== undefined) Material.g[eid] = m.g
    if (m.b !== undefined) Material.b[eid] = m.b

    addComponent(world, eid, DirtyMaterial)
    this.syncEntitiesToStore()
  }

  // ── HDRI ────────────────────────────────────────────────

  async setHDRI(preset: HDRIPreset): Promise<void> {
    if (!this.threeRenderer) return
    await this.threeRenderer.loadHDRI(preset)
    useEngineStore.getState().setActiveHDRI(preset)
  }

  // ── Exposure ────────────────────────────────────────────

  setExposure(value: number): void {
    this.threeRenderer?.setExposure(value)
    useEngineStore.getState().setExposure(value)
  }

  // ── Bloom ───────────────────────────────────────────────

  setBloom(strength: number, radius: number, threshold: number): void {
    this.threeRenderer?.postProcessing.setBloom(strength, radius, threshold)
    useEngineStore.getState().setBloom({ strength, radius, threshold })
  }

  // ── Auto-rotate ─────────────────────────────────────────

  setAutoRotate(enabled: boolean): void {
    if (this.threeRenderer?.turntable) {
      this.threeRenderer.turntable.autoRotate = enabled
    }
    useEngineStore.getState().setAutoRotate(enabled)
  }

  setAutoRotateSpeed(speed: number): void {
    if (this.threeRenderer?.turntable) {
      this.threeRenderer.turntable.autoRotateSpeed = speed
    }
    useEngineStore.getState().setAutoRotateSpeed(speed)
  }

  // ── Cinematic / Filters ─────────────────────────────────

  setVignette(intensity: number): void {
    this.threeRenderer?.postProcessing.setVignette(intensity, 0.9)
    this.syncCinematicToStore()
  }

  setVignetteEnabled(enabled: boolean): void {
    this.threeRenderer?.postProcessing.setVignetteEnabled(enabled)
    this.syncCinematicToStore()
  }

  setChromaticAberration(strength: number): void {
    this.threeRenderer?.postProcessing.setChromaticAberration(strength)
    this.syncCinematicToStore()
  }

  setFilmGrain(intensity: number): void {
    this.threeRenderer?.postProcessing.setFilmGrain(intensity)
    this.syncCinematicToStore()
  }

  setColorTemperature(temperature: number): void {
    this.threeRenderer?.postProcessing.setColorTemperature(temperature)
    this.syncCinematicToStore()
  }

  private syncCinematicToStore(): void {
    if (!this.threeRenderer) return
    const cinematic = this.threeRenderer.postProcessing.getCinematic()
    useEngineStore.getState().setCinematic(cinematic)
  }

  // ── Export ──────────────────────────────────────────────

  async exportPNG(scale: number = 3): Promise<Blob> {
    if (!this.threeRenderer) throw new Error('Engine not initialized')
    return exportPNG(this.threeRenderer.renderer, this.threeRenderer.postProcessing, scale)
  }

  // ── Scene snapshot (for LLM context in v2) ──────────────

  getSceneSnapshot(): object {
    return {
      entities: useEngineStore.getState().entities,
      activeHDRI: useEngineStore.getState().activeHDRI,
      exposure: useEngineStore.getState().exposure,
      bloom: useEngineStore.getState().bloom,
    }
  }

  // ── Internal ────────────────────────────────────────────

  private syncEntitiesToStore(): void {
    if (!this.currentModel) return

    const entities: EntityInfo[] = this.currentModel.meshEids.map((eid, i) => {
      const obj = eidToObject3D.get(eid)
      return {
        eid,
        name: obj?.name || `Mesh ${i + 1}`,
        roughness: Material.roughness[eid],
        metalness: Material.metalness[eid],
        envMapIntensity: Material.envMapIntensity[eid],
        r: Material.r[eid],
        g: Material.g[eid],
        b: Material.b[eid],
      }
    })

    useEngineStore.getState().setEntities(entities)
  }
}

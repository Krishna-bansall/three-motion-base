import * as THREE from 'three'
import { exportPNG } from '../../renderer/exportPNG'
import { ThreeRenderer } from '../../renderer/ThreeRenderer'
import { cloneViewSettings, createDefaultViewSettings } from '../../viewSettings'
import type { ViewSettings } from '../../viewSettings'
import type { RuntimeAdapter } from '../RuntimeAdapter'
import { getEnvironmentPreviews } from '../environment'
import type {
  EnvironmentPreview,
  RuntimeDebugGraph,
  RuntimeSceneAssetBundle,
  RuntimeSceneInstance,
  TransformGizmoMode,
  TRS,
} from '../types'
import { buildRuntimeSceneInstanceFromSource } from './runtimeScene'
import type { SceneDelta } from '../../scene/diff'
import type { NodeId, SceneDoc, SceneNode } from '../../scene/types'

export class ThreeAdapter implements RuntimeAdapter {
  private renderer: ThreeRenderer | null = null
  private sceneAssets: RuntimeSceneAssetBundle | null = null
  private activeRootNodeId: NodeId | null = null
  private nodeObjects = new Map<NodeId, THREE.Object3D>()
  private materialObjects = new Map<string, THREE.Material[]>()
  private viewSettings: ViewSettings = createDefaultViewSettings()
  private runtimeTransformChanged: ((nodeId: NodeId, trs: TRS) => void) | null = null
  private transformInteractionStart: (() => void) | null = null
  private transformInteractionEnd: (() => void) | null = null

  mount(container: HTMLElement): void {
    this.renderer = new ThreeRenderer()
    this.renderer.mount(container)
    this.renderer.onProductTransformChange = () => {
      if (!this.activeRootNodeId || !this.runtimeTransformChanged || !this.renderer) return
      this.runtimeTransformChanged(this.activeRootNodeId, captureTRS(this.renderer.productRoot))
    }
    this.renderer.onTransformInteractionStart = () => this.transformInteractionStart?.()
    this.renderer.onTransformInteractionEnd = () => this.transformInteractionEnd?.()
  }

  unmount(): void {
    if (this.renderer) {
      this.renderer.onProductTransformChange = null
      this.renderer.onTransformInteractionStart = null
      this.renderer.onTransformInteractionEnd = null
    }

    this.renderer?.unmount()
    this.renderer = null
    this.activeRootNodeId = null
    this.nodeObjects.clear()
    this.materialObjects.clear()
  }

  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void {
    this.sceneAssets = assets
    if (!assets) {
      this.activeRootNodeId = null
    }
  }

  async buildFromCanonical(scene: SceneDoc): Promise<void> {
    if (!this.renderer) return

    this.clearRuntimeScene()
    this.nodeObjects.clear()
    this.materialObjects.clear()

    if (!this.sceneAssets || scene.roots.length === 0) {
      this.activeRootNodeId = null
      return
    }

    const instance = this.createRuntimeSceneInstance(scene)
    const templateRoot = instance.rootObject as THREE.Object3D

    for (const child of [...templateRoot.children]) {
      this.renderer.productRoot.add(child)
    }

    const rootNodeId = instance.rootNodeId || scene.roots[0]
    if (rootNodeId) {
      this.activeRootNodeId = rootNodeId
      this.nodeObjects.set(rootNodeId, this.renderer.productRoot)
      this.renderer.productRoot.userData.threeMotionNodeId = rootNodeId
    }

    for (const [nodeId, object] of instance.nodeObjects.entries()) {
      if (nodeId === rootNodeId) continue
      this.nodeObjects.set(nodeId, object as THREE.Object3D)
    }

    for (const [materialId, materials] of instance.materialObjects.entries()) {
      this.materialObjects.set(
        materialId,
        materials as THREE.Material[],
      )
    }

    this.applyFullScene(scene)
  }

  async applyDirty(delta: SceneDelta, scene: SceneDoc): Promise<void> {
    if (!this.renderer) return

    const requiresRebuild = (
      delta.rootsChanged
      || delta.addedNodeIds.length > 0
      || delta.removedNodeIds.length > 0
      || delta.addedMeshIds.length > 0
      || delta.removedMeshIds.length > 0
      || delta.changedMeshes && Object.keys(delta.changedMeshes).length > 0
      || delta.addedMaterialIds.length > 0
      || delta.removedMaterialIds.length > 0
      || Object.values(delta.changedNodes).some((nodePatch) =>
        nodePatch.meshId !== undefined || nodePatch.materialId !== undefined,
      )
    )

    if (requiresRebuild) {
      await this.buildFromCanonical(scene)
      return
    }

    for (const nodeId of Object.keys(delta.changedNodes)) {
      const node = scene.nodes[nodeId]
      if (node) {
        this.applyNodeState(nodeId, node)
      }
    }

    for (const materialId of Object.keys(delta.changedMaterials)) {
      const material = scene.materials[materialId]
      if (material) {
        this.applyMaterialState(materialId, material)
      }
    }

  }

  async setViewSettings(settings: ViewSettings): Promise<void> {
    if (!this.renderer) {
      this.viewSettings = cloneViewSettings(settings)
      return
    }

    const previousHDRI = this.viewSettings.activeHDRI
    this.viewSettings = cloneViewSettings(settings)

    if (previousHDRI !== settings.activeHDRI) {
      await this.renderer.loadHDRI(settings.activeHDRI)
    }

    this.renderer.setExposure(settings.exposure)
    this.renderer.postProcessing.setBloom(
      settings.bloom.strength,
      settings.bloom.radius,
      settings.bloom.threshold,
    )
    this.renderer.postProcessing.setVignetteEnabled(settings.cinematic.vignetteEnabled)
    this.renderer.postProcessing.setVignette(settings.cinematic.vignette, 0.9)
    this.renderer.postProcessing.setChromaticAberration(settings.cinematic.chromaticAberration)
    this.renderer.postProcessing.setFilmGrain(settings.cinematic.filmGrain)
    this.renderer.postProcessing.setColorTemperature(settings.cinematic.colorTemperature)

    if (this.renderer.turntable) {
      this.renderer.turntable.autoRotate = settings.autoRotate
      this.renderer.turntable.autoRotateSpeed = settings.autoRotateSpeed
    }
  }

  getViewSettings(): ViewSettings {
    return cloneViewSettings(this.viewSettings)
  }

  setTransformToolMode(mode: TransformGizmoMode | null): void {
    this.renderer?.setTransformMode(mode)
  }

  getTransformToolMode(): TransformGizmoMode | null {
    return this.renderer?.getTransformMode() ?? null
  }

  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void {
    this.runtimeTransformChanged = cb
  }

  onTransformInteractionStart(cb: (() => void) | null): void {
    this.transformInteractionStart = cb
  }

  onTransformInteractionEnd(cb: (() => void) | null): void {
    this.transformInteractionEnd = cb
  }

  async exportPNG(scale: number): Promise<Blob> {
    if (!this.renderer) {
      throw new Error('Runtime adapter not mounted')
    }

    return exportPNG(this.renderer.renderer, this.renderer.postProcessing, scale)
  }

  getEnvironmentPreviews(): EnvironmentPreview[] {
    return getEnvironmentPreviews()
  }

  getRuntimeDebugGraph(scene: SceneDoc): RuntimeDebugGraph {
    const rootNodeId = scene.roots[0] ?? this.activeRootNodeId ?? this.sceneAssets?.rootNodeId ?? null
    const root = rootNodeId ? buildDebugNode(scene, rootNodeId) : null
    const meshes = Object.values(scene.nodes)
      .filter((node) => node.meshId)
      .map((node) => buildDebugNode(scene, node.id))

    return { root, meshes }
  }

  private clearRuntimeScene(): void {
    if (!this.renderer) return

    for (const child of [...this.renderer.productRoot.children]) {
      this.renderer.productRoot.remove(child)
    }
  }

  private createRuntimeSceneInstance(scene: SceneDoc): RuntimeSceneInstance {
    if (!this.sceneAssets) {
      throw new Error('Scene assets must be set before building the runtime scene')
    }

    if (this.sceneAssets.source) {
      return buildRuntimeSceneInstanceFromSource(scene, this.sceneAssets.source)
    }

    return this.sceneAssets.instantiate()
  }

  private applyFullScene(scene: SceneDoc): void {
    for (const node of Object.values(scene.nodes)) {
      this.applyNodeState(node.id, node)
    }

    for (const [materialId, material] of Object.entries(scene.materials)) {
      this.applyMaterialState(materialId, material)
    }
  }

  private applyNodeState(nodeId: NodeId, node: SceneNode): void {
    const object = this.nodeObjects.get(nodeId)
    if (!object) return

    object.name = node.name
    object.visible = node.visible
    object.position.set(...node.t)
    object.quaternion.set(...node.r)
    object.scale.set(...node.s)
  }

  private applyMaterialState(materialId: string, materialDef: SceneDoc['materials'][string]): void {
    const materials = this.materialObjects.get(materialId)
    if (!materials) return

    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue

      material.color.setRGB(...materialDef.baseColor)
      material.roughness = materialDef.roughness
      material.metalness = materialDef.metalness
      material.envMapIntensity = materialDef.envMapIntensity
      material.needsUpdate = true
    }
  }
}

function captureTRS(object: THREE.Object3D): TRS {
  return {
    t: [object.position.x, object.position.y, object.position.z],
    r: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    s: [object.scale.x, object.scale.y, object.scale.z],
  }
}

function buildDebugNode(scene: SceneDoc, nodeId: NodeId) {
  const node = scene.nodes[nodeId]
  return {
    nodeId,
    name: node.name,
    transform: {
      t: [...node.t] as TRS['t'],
      r: [...node.r] as TRS['r'],
      s: [...node.s] as TRS['s'],
    },
    materialId: node.materialId,
  }
}

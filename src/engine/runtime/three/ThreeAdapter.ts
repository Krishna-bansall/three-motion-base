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
import { buildRuntimeSceneInstanceFromScene } from './runtimeScene'
import type { SceneDelta } from '../../scene/diff'
import type { NodeId, SceneDoc, SceneNode } from '../../scene/types'

export class ThreeAdapter implements RuntimeAdapter {
  private renderer: ThreeRenderer | null = null
  private sceneAssets: RuntimeSceneAssetBundle | null = null
  private activeRootNodeId: NodeId | null = null
  private activeSceneCameraNodeId: NodeId | null = null
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
    this.activeSceneCameraNodeId = null
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

    if (scene.roots.length === 0) {
      this.activeRootNodeId = null
      this.activeSceneCameraNodeId = null
      return
    }

    const instance = await this.createRuntimeSceneInstance(scene)
    const rootObject = instance.rootObject as THREE.Object3D
    this.renderer.productRoot.add(rootObject)

    for (const [nodeId, object] of instance.nodeObjects.entries()) {
      this.nodeObjects.set(nodeId, object as THREE.Object3D)
    }

    for (const [materialId, materials] of instance.materialObjects.entries()) {
      this.materialObjects.set(
        materialId,
        materials as THREE.Material[],
      )
    }

    const interactionNodeId = this.resolveInteractionNodeId(scene, instance.rootNodeId)
    const interactionObject = interactionNodeId ? this.nodeObjects.get(interactionNodeId) : null
    this.activeRootNodeId = interactionNodeId
    this.activeSceneCameraNodeId = this.resolveSceneCameraNodeId(scene)

    if (interactionObject) {
      this.renderer.setInteractionTarget(interactionObject)
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

  private async createRuntimeSceneInstance(scene: SceneDoc): Promise<RuntimeSceneInstance> {
    if (this.sceneAssets?.source) {
      return buildRuntimeSceneInstanceFromScene(scene, {
        ...this.sceneAssets.source,
        rootNodeId: this.sceneAssets.source.rootNodeId ?? this.sceneAssets.rootNodeId,
      })
    }

    return buildRuntimeSceneInstanceFromScene(scene)
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

    if (object instanceof THREE.PerspectiveCamera && node.camera) {
      object.fov = node.camera.fovDegrees
      object.near = node.camera.near
      object.far = node.camera.far
      object.updateProjectionMatrix()

      if (nodeId === this.activeSceneCameraNodeId) {
        const activeCamera = this.renderer?.camera
        if (activeCamera) {
          activeCamera.position.set(...node.t)
          activeCamera.quaternion.set(...node.r)
          activeCamera.fov = node.camera.fovDegrees
          activeCamera.near = node.camera.near
          activeCamera.far = node.camera.far
          activeCamera.updateProjectionMatrix()
        }
      }
    }

    if (object instanceof THREE.Light && node.light) {
      object.color.setRGB(...node.light.color)
      object.intensity = node.light.intensity
    }
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

  private resolveInteractionNodeId(scene: SceneDoc, fallbackRootNodeId: NodeId): NodeId | null {
    const assetRootNodeId = this.sceneAssets?.rootNodeId

    if (assetRootNodeId && scene.nodes[assetRootNodeId]) {
      return assetRootNodeId
    }

    return fallbackRootNodeId || scene.roots[0] || null
  }

  private resolveSceneCameraNodeId(scene: SceneDoc): NodeId | null {
    const cameraNode = Object.values(scene.nodes).find((node) => node.camera)
    return cameraNode?.id ?? null
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

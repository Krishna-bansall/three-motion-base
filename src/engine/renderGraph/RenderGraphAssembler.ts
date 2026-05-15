import { createEmptySceneDoc } from '../scene/snapshot'
import type {
  AssetGraphDoc,
  NodeId,
  RenderGraphDoc,
  SceneDoc,
  SceneNode,
} from '../scene/types'
import type {
  MountOverrides,
  ProductSlotId,
  ProjectDoc,
  StudioGeometryKind,
} from '../project/types'
import { publicAsset } from '../runtime/environment'

export interface RenderGraphAssembler {
  assemble(project: ProjectDoc, mountedAssets: Map<ProductSlotId, AssetGraphDoc>): RenderGraphDoc
}

export const renderGraphAssembler: RenderGraphAssembler = {
  assemble,
}

export function assemble(
  project: ProjectDoc,
  mountedAssets: Map<ProductSlotId, AssetGraphDoc>,
): RenderGraphDoc {
  const scene = createEmptySceneDoc()
  const primarySlotId = project.studioScene.primaryProductSlotId
  const primarySlot = project.studioScene.productSlots[primarySlotId]
  const primaryAsset = mountedAssets.get(primarySlotId) ?? null
  const studioRootId: NodeId = 'node-studio-root'

  scene.roots.push(studioRootId)
  scene.nodes[studioRootId] = createProjectNode({
    id: studioRootId,
    parentId: null,
    name: project.studioScene.name,
    children: [
      primarySlot.nodeId,
      project.studioScene.renderCameraNodeId,
      ...Object.values(project.studioScene.lights).map((light) => light.nodeId),
      ...Object.values(project.studioScene.studioGeometry).map((object) => object.nodeId),
    ],
  })
  scene.nodes[primarySlot.nodeId] = createProjectNode({
    id: primarySlot.nodeId,
    parentId: studioRootId,
    name: primarySlot.name,
    children: primaryAsset ? [...primaryAsset.roots] : [],
  })
  scene.nodes[project.studioScene.renderCameraNodeId] = createProjectNode({
    id: project.studioScene.renderCameraNodeId,
    parentId: studioRootId,
    name: 'Render Camera',
    children: [],
    t: [0, 0.8, 4],
    camera: project.studioScene.cameras['camera-render']
      ? {
          kind: project.studioScene.cameras['camera-render'].kind,
          fovDegrees: project.studioScene.cameras['camera-render'].fovDegrees,
          near: project.studioScene.cameras['camera-render'].near,
          far: project.studioScene.cameras['camera-render'].far,
        }
      : undefined,
  })

  for (const light of Object.values(project.studioScene.lights)) {
    scene.nodes[light.nodeId] = createProjectNode({
      id: light.nodeId,
      parentId: studioRootId,
      name: light.name,
      children: [],
      t: getStudioLightTransform(light.id),
      light: {
        kind: light.kind,
        intensity: light.intensity,
        color: [...light.color],
      },
    })
  }

  for (const object of Object.values(project.studioScene.studioGeometry)) {
    const material = Object.values(project.studioScene.materials)[0]
    const isBackdrop = object.kind === 'backdrop'
    scene.nodes[object.nodeId] = createProjectNode({
      id: object.nodeId,
      parentId: studioRootId,
      name: object.name,
      children: [],
      visible: object.visible,
      t: getStudioGeometryTransform(object.kind),
      s: isBackdrop ? [4, 4, 4] : undefined,
      meshId: `mesh-${object.id}`,
      materialId: isBackdrop ? undefined : material?.materialId,
    })
    scene.meshes[`mesh-${object.id}`] = {
      source: {
        uri: isBackdrop
          ? publicAsset('models/room/source/Untitled.glb')
          : `builtin:studio/${object.kind}`,
      },
    }
  }

  for (const material of Object.values(project.studioScene.materials)) {
    scene.materials[material.materialId] = {
      baseColor: [0.86, 0.86, 0.82],
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: project.studioScene.environment.intensity,
    }
  }

  if (primaryAsset) {
    const mountOverrides = primarySlot.asset?.mount?.overrides ?? emptyMountOverrides()
    mountAssetGraph(scene, primarySlot.nodeId, primaryAsset, mountOverrides)
  }

  return scene
}

function mountAssetGraph(
  renderGraph: RenderGraphDoc,
  parentNodeId: NodeId,
  assetGraph: AssetGraphDoc,
  overrides: MountOverrides,
): void {
  const mountedGraph = structuredClone(assetGraph) as SceneDoc

  for (const [nodeId, node] of Object.entries(mountedGraph.nodes)) {
    renderGraph.nodes[nodeId] = {
      ...node,
      parentId: mountedGraph.roots.includes(nodeId) ? parentNodeId : node.parentId,
      // Imported cameras are not promoted to active render cameras;
      // only StudioSceneDoc cameras render. Strip the component.
      camera: undefined,
      // Imported lights are candidates, not active render lights.
      // Strip the component; future promotion goes through StudioSceneDoc.
      light: undefined,
    }
  }

  renderGraph.meshes = {
    ...renderGraph.meshes,
    ...mountedGraph.meshes,
  }
  renderGraph.materials = {
    ...renderGraph.materials,
    ...mountedGraph.materials,
  }

  applyMountOverrides(renderGraph, overrides)
}

function applyMountOverrides(renderGraph: RenderGraphDoc, overrides: MountOverrides): void {
  for (const [nodeId, visibilityOverride] of Object.entries(overrides.visibility)) {
    const node = renderGraph.nodes[nodeId]
    if (node) {
      node.visible = visibilityOverride.visible
    }
  }

  for (const [nodeId, transformOverride] of Object.entries(overrides.transforms)) {
    const node = renderGraph.nodes[nodeId]
    if (node) {
      if (transformOverride.t) node.t = [...transformOverride.t]
      if (transformOverride.r) node.r = [...transformOverride.r]
      if (transformOverride.s) node.s = [...transformOverride.s]
    }
  }

  for (const [nodeId, materialOverride] of Object.entries(overrides.materials)) {
    const node = renderGraph.nodes[nodeId]
    if (node) {
      if (materialOverride.materialId) node.materialId = materialOverride.materialId
    }
    if (node?.materialId) {
      const material = renderGraph.materials[node.materialId]
      if (material) {
        if (materialOverride.baseColor) material.baseColor = [...materialOverride.baseColor]
        if (materialOverride.roughness !== undefined) material.roughness = materialOverride.roughness
        if (materialOverride.metalness !== undefined) material.metalness = materialOverride.metalness
        if (materialOverride.envMapIntensity !== undefined) material.envMapIntensity = materialOverride.envMapIntensity
      }
    }
  }
}

function emptyMountOverrides(): MountOverrides {
  return {
    transforms: {},
    materials: {},
    visibility: {},
    variants: {},
  }
}

function createProjectNode(params: {
  id: NodeId
  parentId: NodeId | null
  name: string
  children: NodeId[]
  t?: [number, number, number]
  s?: [number, number, number]
  visible?: boolean
  camera?: SceneNode['camera']
  light?: SceneNode['light']
  meshId?: string
  materialId?: string
}): SceneNode {
  return {
    id: params.id,
    parentId: params.parentId,
    children: params.children,
    name: params.name,
    t: params.t ?? [0, 0, 0],
    r: [0, 0, 0, 1],
    s: params.s ?? [1, 1, 1],
    visible: params.visible ?? true,
    ...(params.camera ? { camera: structuredClone(params.camera) } : {}),
    ...(params.light ? { light: structuredClone(params.light) } : {}),
    ...(params.meshId ? { meshId: params.meshId } : {}),
    ...(params.materialId ? { materialId: params.materialId } : {}),
  }
}

function getStudioGeometryTransform(kind: StudioGeometryKind): [number, number, number] {
  switch (kind) {
    case 'floor':
      return [0, -1.1, 0]
    case 'backdrop':
      return [0, -0.55, -2.15]
    case 'plinth':
      return [0, -0.52, 0]
  }
}

function getStudioLightTransform(lightId: string): [number, number, number] {
  switch (lightId) {
    case 'light-key':
      return [1.8, 2.2, 2.4]
    case 'light-fill':
      return [-1.6, 1.4, 2]
    case 'light-rim':
      return [-1.2, 1.9, -2.4]
    default:
      return [0, 2, 2]
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'

// Scene domain types
import type {
  AssetGraphDoc,
  AssetNodeId,
  CameraComponent,
  EvaluatedRenderState,
  ImportedLightCandidate,
  MaterialDef,
  MaterialId,
  MeshDef,
  MeshId,
  NodeId,
  RenderGraphDoc,
  SceneCameraKind,
  SceneDoc,
  SceneLightKind,
  SceneNode,
  Vec3,
  Quat,
} from '../../src/engine/scene/types.ts'

// Project domain types
import type {
  AnimationTargetKind,
  AssetId,
  CameraDef,
  CameraId,
  CameraKind,
  EnvironmentId,
  LightDef,
  LightId,
  LightKind,
  LookId,
  LookPresetId,
  MountMaterialOverride,
  MountOverrideTargetId,
  MountOverrides,
  MountTransformOverride,
  MountVariantOverride,
  MountVisibilityOverride,
  MotionItemKind,
  MotionLayerBlendMode,
  MotionPresetId,
  ProductSlot,
  ProductSlotAsset,
  ProductSlotId,
  ProjectDoc,
  ProjectId,
  RenderGraphMount,
  RenderGraphMountId,
  RenderGraphMountKind,
  SequenceCategory,
  ShotId,
  StudioGeometryId,
  StudioGeometryKind,
  StudioMaterialId,
  StudioPresetId,
  StudioSceneDoc,
  StudioTransformEdit,
  TrackId,
} from '../../src/engine/project/types.ts'

// Project domain constants
import {
  CAMERA_KINDS,
  LIGHT_KINDS,
  MOUNT_OVERRIDE_KINDS,
  RENDER_GRAPH_MOUNT_KINDS,
} from '../../src/engine/project/types.ts'

// Render graph assembly
import type { RenderGraphAssembler } from '../../src/engine/renderGraph/RenderGraphAssembler.ts'
import { assemble, renderGraphAssembler } from '../../src/engine/renderGraph/RenderGraphAssembler.ts'

// Scene snapshot utilities
import { cloneSceneDoc, createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'

test('all domain vocabulary types are importable from their module paths', () => {
  // Scene domain type aliases exist and are distinct names
  const _sceneDoc: SceneDoc = createEmptySceneDoc()
  const _assetGraph: AssetGraphDoc = _sceneDoc as AssetGraphDoc
  const _renderGraph: RenderGraphDoc = _sceneDoc as RenderGraphDoc
  const _evaluated: EvaluatedRenderState = _sceneDoc as EvaluatedRenderState

  // Key domain types are present
  assert.ok(_sceneDoc)
  assert.ok(_assetGraph)
  assert.ok(_renderGraph)
  assert.ok(_evaluated)
})

test('all mount override vocabulary types are importable from project/types', () => {
  // Mount override types exist and have the expected shape
  const overrides: MountOverrides = {
    transforms: {},
    materials: {},
    visibility: {},
    variants: {},
  }
  assert.ok(overrides)

  const transformOverride: MountTransformOverride = { t: [1, 2, 3] }
  assert.ok(transformOverride)

  const materialOverride: MountMaterialOverride = { roughness: 0.5 }
  assert.ok(materialOverride)

  const visibilityOverride: MountVisibilityOverride = { visible: false }
  assert.ok(visibilityOverride)

  const variantOverride: MountVariantOverride = { variantId: 'v1' }
  assert.ok(variantOverride)
})

test('RenderGraphMount type carries slotId, assetId, and overrides', () => {
  const mount: RenderGraphMount = {
    id: 'mount-primary',
    kind: 'product-slot',
    slotId: 'product-slot-primary',
    assetId: 'asset-watch',
    assetRootNodeId: 'asset-root',
    overrides: {
      transforms: {},
      materials: {},
      visibility: {},
      variants: {},
    },
  }
  assert.equal(mount.kind, 'product-slot')
  assert.equal(mount.slotId, 'product-slot-primary')
  assert.ok(mount.overrides)
})

test('domain constants enumerate kind values', () => {
  assert.deepEqual(Object.keys(RENDER_GRAPH_MOUNT_KINDS).sort(), ['productSlot', 'studioSet'])
  assert.deepEqual(Object.keys(MOUNT_OVERRIDE_KINDS).sort(), ['material', 'transform', 'variant', 'visibility'])
  assert.deepEqual(Object.keys(CAMERA_KINDS), ['perspective'])
  assert.deepEqual(Object.keys(LIGHT_KINDS).sort(), ['directional', 'point', 'spot'])
})

test('ImportedLightCandidate type carries assetNodeId, name, and light', () => {
  const candidate: ImportedLightCandidate = {
    assetNodeId: 'asset-light-1',
    name: 'Sun Light',
    light: {
      kind: 'directional',
      intensity: 1.5,
      color: [1, 0.95, 0.9],
    },
  }
  assert.equal(candidate.assetNodeId, 'asset-light-1')
  assert.equal(candidate.name, 'Sun Light')
  assert.equal(candidate.light.kind, 'directional')
})

test('RenderGraphAssembler interface and singleton are importable', () => {
  assert.equal(typeof renderGraphAssembler.assemble, 'function')
  assert.equal(typeof assemble, 'function')
})
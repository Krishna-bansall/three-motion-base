import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStudioPreset, createDefaultProject, replaceProductSlotAsset } from '../../src/engine/project/document.ts'
import { createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'
import type { SceneDoc } from '../../src/engine/scene/types.ts'
import { syncEngineState } from '../../src/engine/store/engineStateBridge.ts'
import { useEngineStore } from '../../src/store/useEngineStore.ts'
import { createDefaultViewSettings } from '../../src/engine/viewSettings.ts'
import { assemble } from '../../src/engine/renderGraph/RenderGraphAssembler.ts'

function resetStore(): void {
  useEngineStore.setState({
    isLoading: false,
    entities: [],
    hasModel: false,
    canUndo: false,
    canRedo: false,
    trackedObjectTransform: null,
    studioSetupObjects: [],
    selectedStudioObjectNodeId: null,
    activeLookId: '',
    activeShot: {
      id: '',
      name: '',
      durationSeconds: 5,
      fps: 30,
      aspect: { width: 16, height: 9 },
    },
    timelineRows: [],
    timelineTimeSeconds: 0,
    ...createDefaultViewSettings(),
  })
}

function createAssetScene(): SceneDoc {
  const scene = createEmptySceneDoc()
  scene.roots.push('asset-root')
  scene.nodes['asset-root'] = {
    id: 'asset-root',
    parentId: null,
    children: ['asset-child'],
    name: 'Watch',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['asset-child'] = {
    id: 'asset-child',
    parentId: 'asset-root',
    children: [],
    name: 'Watch Body',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    meshId: 'mesh-watch-body',
    materialId: 'material-watch-body',
    visible: true,
  }
  scene.meshes['mesh-watch-body'] = {
    source: {
      uri: 'file:///imports/watch.glb',
      primitive: 0,
    },
  }
  scene.materials['material-watch-body'] = {
    baseColor: [0.7, 0.2, 0.1],
    roughness: 0.4,
    metalness: 0.8,
    envMapIntensity: 1,
  }
  return scene
}

test.beforeEach(() => {
  resetStore()
})

test('syncEngineState publishes entities, studio objects, look, timeline, and tracked transform from project and scene', () => {
  const project = applyStudioPreset(createDefaultProject(), 'soft-box-plinth')
  const projectWithAsset = replaceProductSlotAsset(project, {
    uri: 'file:///imports/watch.glb',
    rootNodeId: 'asset-root',
  })
  const scene = assemble(projectWithAsset, new Map([
    ['product-slot-primary', createAssetScene()],
  ]))

  syncEngineState(projectWithAsset, scene, 'asset-root')

  const state = useEngineStore.getState()

  // Entities published — should include both asset and studio entities
  assert.ok(state.entities.length >= 2)
  const watchBody = state.entities.find((e: { name: string }) => e.name === 'Watch Body')
  assert.ok(watchBody, 'expected Watch Body entity')

  // Studio objects published
  assert.ok(state.studioSetupObjects.length > 0)

  // Active look published
  assert.equal(state.activeLookId, projectWithAsset.look.id)

  // Timeline published
  assert.ok(state.timelineRows.length > 0)

  // Tracked transform published
  assert.ok(state.trackedObjectTransform)
})

test('syncEngineState handles null scene by clearing entities and tracked transform', () => {
  const project = createDefaultProject()

  syncEngineState(project, null, null)

  const state = useEngineStore.getState()

  // Entities cleared
  assert.deepEqual(state.entities, [])

  // Tracked transform is null
  assert.equal(state.trackedObjectTransform, null)
})
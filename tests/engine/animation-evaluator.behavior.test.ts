import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateActiveShot } from '../../src/engine/animation/evaluate.ts'
import {
  addLayerToActiveShot,
  createDefaultProject,
  updateActiveShotLayer,
} from '../../src/engine/project/document.ts'
import { createEmptySceneDoc, cloneSceneDoc } from '../../src/engine/scene/snapshot.ts'
import type { SceneDoc } from '../../src/engine/scene/types.ts'

function createBaseScene(): SceneDoc {
  const scene = createEmptySceneDoc()

  scene.roots.push('node-studio-root')
  scene.nodes['node-studio-root'] = {
    id: 'node-studio-root',
    parentId: null,
    children: ['node-product-slot-primary', 'node-render-camera', 'node-light-key'],
    name: 'Studio Root',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['node-product-slot-primary'] = {
    id: 'node-product-slot-primary',
    parentId: 'node-studio-root',
    children: [],
    name: 'Primary Product',
    t: [0, 0, 0],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
  }
  scene.nodes['node-render-camera'] = {
    id: 'node-render-camera',
    parentId: 'node-studio-root',
    children: [],
    name: 'Render Camera',
    t: [0, 0.8, 4],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
    camera: {
      kind: 'perspective',
      fovDegrees: 45,
      near: 0.1,
      far: 100,
    },
  }
  scene.nodes['node-light-key'] = {
    id: 'node-light-key',
    parentId: 'node-studio-root',
    children: [],
    name: 'Key Light',
    t: [1.8, 2.2, 2.4],
    r: [0, 0, 0, 1],
    s: [1, 1, 1],
    visible: true,
    light: {
      kind: 'directional',
      intensity: 1.2,
      color: [1, 0.98, 0.95],
    },
  }

  return scene
}

test('evaluateActiveShot applies coordinated object, camera, and light layers without mutating the base scene', () => {
  let project = createDefaultProject()
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-product-slot-primary',
    presetId: 'object-float',
  })
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-render-camera',
    presetId: 'camera-dolly-in',
  })
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-light-key',
    presetId: 'light-pulse',
  })

  const baseScene = createBaseScene()
  const before = cloneSceneDoc(baseScene)
  const evaluated = evaluateActiveShot(project, baseScene, 0.75)

  assert.deepEqual(baseScene, before)
  assert.equal(evaluated.nodes['node-product-slot-primary']?.t[1], 0.35)
  assert.equal(evaluated.nodes['node-render-camera']?.t[2], 3.766)
  assert.equal(evaluated.nodes['node-light-key']?.light?.intensity, 1.74)
})

test('evaluateActiveShot time-scales layer motion by duration instead of trimming it', () => {
  let project = createDefaultProject()
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-product-slot-primary',
    presetId: 'object-float',
  })
  project = updateActiveShotLayer(project, 'layer-1', {
    durationSeconds: 6,
  })

  const evaluated = evaluateActiveShot(project, createBaseScene(), 1.5)

  assert.equal(evaluated.nodes['node-product-slot-primary']?.t[1], 0.35)
})

test('evaluateActiveShot adds overlapping layers on the same target', () => {
  let project = createDefaultProject()
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-product-slot-primary',
    presetId: 'object-float',
  })
  project = addLayerToActiveShot(project, {
    targetNodeId: 'node-product-slot-primary',
    presetId: 'object-float',
  })
  project = updateActiveShotLayer(project, 'layer-2', {
    parameters: {
      amplitude: 0.1,
    },
  })

  const evaluated = evaluateActiveShot(project, createBaseScene(), 0.75)

  assert.equal(evaluated.nodes['node-product-slot-primary']?.t[1], 0.45)
})

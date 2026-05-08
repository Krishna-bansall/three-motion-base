import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { importGLTFScene } from '../../src/engine/assets/importGLTFScene.ts'
import {
  loadGLTFFromFile,
  loadGLTFFromFiles,
  loadGLTFFromURL,
} from '../../src/engine/assets/loadGLTF.ts'

function createSyntheticScene(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'ImportedRoot'

  const sharedMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.7, 0.2, 0.1),
    roughness: 0.9,
    metalness: 0.6,
  })
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.1, 0.6, 0.9),
    roughness: 0.2,
    metalness: 0.8,
  })

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), sharedMaterial)
  bodyMesh.name = 'Body'
  bodyMesh.position.set(1, 0, 0)

  const badgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMaterial)
  badgeMesh.name = 'Badge'
  badgeMesh.visible = false
  badgeMesh.position.set(-1, 0, 0)

  const nestedGroup = new THREE.Group()
  nestedGroup.name = 'Nested'
  nestedGroup.position.set(0, 1, 0)

  const accentMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), accentMaterial)
  accentMesh.name = 'Accent'
  accentMesh.position.set(0, 0, 2)

  nestedGroup.add(accentMesh)
  root.add(bodyMesh)
  root.add(badgeMesh)
  root.add(nestedGroup)

  return root
}

function withMockedLoader(
  loadAsync: (url: string) => Promise<{ scene: THREE.Group }>,
  run: () => Promise<void>,
): Promise<void> {
  const originalLoadAsync = GLTFLoader.prototype.loadAsync
  GLTFLoader.prototype.loadAsync = async function mockedLoadAsync(url: string) {
    return loadAsync(url)
  }

  return run().finally(() => {
    GLTFLoader.prototype.loadAsync = originalLoadAsync
  })
}

function withMockedBlobUrls(
  run: (state: {
    created: string[]
    revoked: string[]
  }) => Promise<void>,
): Promise<void> {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const created: string[] = []
  const revoked: string[] = []
  let nextId = 0

  URL.createObjectURL = ((value: Blob | MediaSource) => {
    void value
    const url = `blob:gltf-${++nextId}`
    created.push(url)
    return url
  }) as typeof URL.createObjectURL

  URL.revokeObjectURL = ((url: string) => {
    revoked.push(url)
  }) as typeof URL.revokeObjectURL

  return run({ created, revoked }).finally(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })
}

test('importGLTFScene builds a canonical SceneDoc and explicit source reference', () => {
  const imported = importGLTFScene(createSyntheticScene(), {
    uri: '/models/synthetic.glb',
    label: 'synthetic.glb',
  })

  assert.deepEqual(Object.keys(imported).sort(), ['scene', 'source'])
  assert.deepEqual(Object.keys(imported.source).sort(), ['cache', 'reference', 'rootNodeId'])
  assert.deepEqual(imported.source.reference, {
    uri: '/models/synthetic.glb',
    label: 'synthetic.glb',
  })

  const { scene } = imported
  assert.deepEqual(scene.roots, ['node-0'])
  assert.equal(imported.source.rootNodeId, scene.roots[0])
  assert.ok(imported.source.cache.rootObject instanceof THREE.Group)

  const nodesByName = Object.fromEntries(
    Object.values(scene.nodes).map((node) => [node.name, node]),
  )

  assert.equal(nodesByName.ProductRoot?.parentId, null)
  assert.equal(nodesByName.ImportedRoot?.parentId, 'node-0')
  assert.equal(nodesByName.Body?.parentId, nodesByName.ImportedRoot?.id)
  assert.equal(nodesByName.Badge?.parentId, nodesByName.ImportedRoot?.id)
  assert.equal(nodesByName.Nested?.parentId, nodesByName.ImportedRoot?.id)
  assert.equal(nodesByName.Accent?.parentId, nodesByName.Nested?.id)
  assert.equal(nodesByName.Badge?.visible, false)
  assert.notDeepEqual(nodesByName.ImportedRoot?.s, [1, 1, 1])

  assert.equal(Object.keys(scene.meshes).length, 3)
  assert.equal(Object.keys(scene.materials).length, 2)
  assert.equal(nodesByName.Body?.materialId, nodesByName.Badge?.materialId)
  assert.notEqual(nodesByName.Body?.materialId, nodesByName.Accent?.materialId)

  const sharedMaterialId = nodesByName.Body?.materialId
  assert.ok(sharedMaterialId)
  assert.deepEqual(scene.materials[sharedMaterialId].baseColor, [0.7, 0.2, 0.1])
  assert.equal(scene.materials[sharedMaterialId].roughness, 0.4)
  assert.equal(scene.materials[sharedMaterialId].metalness, 0)
  assert.equal(scene.materials[sharedMaterialId].envMapIntensity, 1.2)
})

test('loadGLTFFromURL builds canonical nodes, preserves hierarchy, and deduplicates shared materials', async () => {
  let requestedUrl = ''

  await withMockedLoader(
    async (url) => {
      requestedUrl = url
      return { scene: createSyntheticScene() }
    },
    async () => {
      const model = await loadGLTFFromURL('/models/synthetic.glb')
      const { canonicalScene, runtimeAssets } = model

      assert.equal(requestedUrl, '/models/synthetic.glb')
      assert.deepEqual(model.source.reference, {
        uri: '/models/synthetic.glb',
        label: 'synthetic.glb',
      })
      assert.equal(model.source.rootNodeId, canonicalScene.roots[0])
      assert.deepEqual(canonicalScene.roots, ['node-0'])

      const nodesByName = Object.fromEntries(
        Object.values(canonicalScene.nodes).map((node) => [node.name, node]),
      )

      assert.equal(nodesByName.ProductRoot?.parentId, null)
      assert.equal(nodesByName.ImportedRoot?.parentId, 'node-0')
      assert.equal(nodesByName.Body?.parentId, nodesByName.ImportedRoot?.id)
      assert.equal(nodesByName.Badge?.parentId, nodesByName.ImportedRoot?.id)
      assert.equal(nodesByName.Nested?.parentId, nodesByName.ImportedRoot?.id)
      assert.equal(nodesByName.Accent?.parentId, nodesByName.Nested?.id)
      assert.equal(nodesByName.Badge?.visible, false)
      assert.notDeepEqual(nodesByName.ImportedRoot?.s, [1, 1, 1])

      assert.equal(Object.keys(canonicalScene.meshes).length, 3)
      assert.equal(Object.keys(canonicalScene.materials).length, 2)
      assert.equal(nodesByName.Body?.materialId, nodesByName.Badge?.materialId)
      assert.notEqual(nodesByName.Body?.materialId, nodesByName.Accent?.materialId)

      const sharedMaterialId = nodesByName.Body?.materialId
      assert.ok(sharedMaterialId)
      assert.deepEqual(canonicalScene.materials[sharedMaterialId].baseColor, [0.7, 0.2, 0.1])
      assert.equal(canonicalScene.materials[sharedMaterialId].roughness, 0.4)
      assert.equal(canonicalScene.materials[sharedMaterialId].metalness, 0)
      assert.equal(canonicalScene.materials[sharedMaterialId].envMapIntensity, 1.2)

      const instanceA = runtimeAssets.instantiate()
      const instanceB = runtimeAssets.instantiate()
      const materialA = instanceA.materialObjects.get(sharedMaterialId)?.[0] as THREE.MeshStandardMaterial
      const materialB = instanceB.materialObjects.get(sharedMaterialId)?.[0] as THREE.MeshStandardMaterial

      assert.ok(materialA)
      assert.ok(materialB)
      assert.notEqual(materialA, materialB)
      materialA.roughness = 0.95
      assert.equal(materialB.roughness, 0.4)
    },
  )
})

test('loadGLTFFromFiles preserves split-package source reference and runtime assets', async () => {
  const gltfFile = new File(['{"asset":{"version":"2.0"}}'], 'scene.gltf', {
    type: 'model/gltf+json',
  })
  const textureFile = new File(['png'], 'albedo.png', { type: 'image/png' })
  Object.defineProperty(gltfFile, 'webkitRelativePath', {
    value: 'packages/model/scene.gltf',
  })
  Object.defineProperty(textureFile, 'webkitRelativePath', {
    value: 'packages/model/textures/albedo.png',
  })

  await withMockedBlobUrls(async ({ created }) => {
    await withMockedLoader(
      async (url) => {
        assert.equal(url, created[0])
        return { scene: createSyntheticScene() }
      },
      async () => {
        const model = await loadGLTFFromFiles([gltfFile, textureFile])

        assert.deepEqual(model.source.reference, {
          uri: 'packages/model/scene.gltf',
          label: 'scene.gltf',
        })
        assert.equal(model.source.rootNodeId, model.canonicalScene.roots[0])

        const instance = model.runtimeAssets.instantiate()
        assert.ok(instance.rootObject)
      },
    )
  })
})

test('loadGLTFFromFile revokes its blob URL when loading fails', async () => {
  const file = new File(['binary'], 'broken.glb', { type: 'model/gltf-binary' })

  await withMockedBlobUrls(async ({ created, revoked }) => {
    await assert.rejects(
      () =>
        withMockedLoader(
          async (url) => {
            assert.equal(url, created[0])
            throw new Error('broken glb')
          },
          async () => {
            await loadGLTFFromFile(file)
          },
        ),
      /broken glb/,
    )

    assert.deepEqual(revoked, created)
  })
})

test('loadGLTFFromFiles revokes every blob URL when loading fails', async () => {
  const gltfFile = new File(['{"asset":{"version":"2.0"}}'], 'scene.gltf', {
    type: 'model/gltf+json',
  })
  const textureFile = new File(['png'], 'albedo.png', { type: 'image/png' })
  Object.defineProperty(textureFile, 'webkitRelativePath', { value: 'textures/albedo.png' })

  await withMockedBlobUrls(async ({ created, revoked }) => {
    await assert.rejects(
      () =>
        withMockedLoader(
          async (url) => {
            assert.equal(url, created[0])
            throw new Error('broken gltf package')
          },
          async () => {
            await loadGLTFFromFiles([gltfFile, textureFile])
          },
        ),
      /broken gltf package/,
    )

    assert.deepEqual(revoked.sort(), created.sort())
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadGLTFFromFiles } from '../../src/engine/assets/loadGLTF.ts'

test('loadGLTFFromFiles rejects a file set with no .gltf asset', async () => {
  const files = [new File(['binary'], 'model.glb', { type: 'model/gltf-binary' })]
  await assert.rejects(
    () => loadGLTFFromFiles(files),
    /No \.gltf file found/,
  )
})

test('loadGLTFFromFiles should resolve the exact relative asset path when basenames collide', async () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalLoadAsync = GLTFLoader.prototype.loadAsync

  const objectUrls = new Map<object, string>()
  let nextId = 0
  let resolvedTextureUrl = ''

  URL.createObjectURL = ((value: object) => {
    const url = `blob:test-${++nextId}`
    objectUrls.set(value, url)
    return url
  }) as typeof URL.createObjectURL

  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL

  GLTFLoader.prototype.loadAsync = async function loadAsync() {
    resolvedTextureUrl = this.manager.resolveURL('a/diffuse.png')
    return { scene: new THREE.Group() } as Awaited<ReturnType<typeof originalLoadAsync>>
  }

  try {
    const gltfFile = new File(['{"asset":{"version":"2.0"}}'], 'scene.gltf', {
      type: 'model/gltf+json',
    })
    const diffuseA = new File(['a'], 'diffuse.png', { type: 'image/png' })
    const diffuseB = new File(['b'], 'diffuse.png', { type: 'image/png' })

    Object.defineProperty(diffuseA, 'webkitRelativePath', { value: 'a/diffuse.png' })
    Object.defineProperty(diffuseB, 'webkitRelativePath', { value: 'b/diffuse.png' })

    await loadGLTFFromFiles([gltfFile, diffuseA, diffuseB])

    assert.equal(
      resolvedTextureUrl,
      objectUrls.get(diffuseA),
      'path resolution should prefer the exact relative path over a duplicate basename',
    )
  } finally {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    GLTFLoader.prototype.loadAsync = originalLoadAsync
  }
})

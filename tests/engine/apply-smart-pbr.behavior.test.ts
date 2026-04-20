import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  applySmartPBRDefaults,
  applySmartPBRDefaultsToScene,
} from '../../src/engine/assets/applySmartPBR.ts'

test('applySmartPBRDefaults preserves authored maps while still applying global fallback tuning', () => {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.6,
  })
  material.roughnessMap = new THREE.Texture()
  material.metalnessMap = new THREE.Texture()
  material.envMapIntensity = 0.25
  const versionBefore = material.version

  applySmartPBRDefaults(material)

  assert.equal(material.roughness, 0.8)
  assert.equal(material.metalness, 0.6)
  assert.equal(material.envMapIntensity, 1.2)
  assert.equal(material.version > versionBefore, true)
})

test('applySmartPBRDefaultsToScene updates standard materials in arrays and enables mesh shadows', () => {
  const root = new THREE.Group()
  const firstMaterial = new THREE.MeshStandardMaterial()
  const secondMaterial = new THREE.MeshStandardMaterial()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [firstMaterial, secondMaterial])
  root.add(mesh)

  applySmartPBRDefaultsToScene(root)

  assert.equal(firstMaterial.roughness, 0.4)
  assert.equal(firstMaterial.metalness, 0)
  assert.equal(secondMaterial.roughness, 0.4)
  assert.equal(secondMaterial.metalness, 0)
  assert.equal(firstMaterial.envMapIntensity, 1.2)
  assert.equal(secondMaterial.envMapIntensity, 1.2)
  assert.equal(mesh.castShadow, true)
  assert.equal(mesh.receiveShadow, true)
})

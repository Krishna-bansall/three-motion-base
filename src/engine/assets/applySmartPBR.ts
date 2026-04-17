/** Applies fallback PBR tuning without stomping authored texture data. */
import * as THREE from 'three'

/** Applies fallback values to a single standard material. */
export function applySmartPBRDefaults(material: THREE.MeshStandardMaterial): void {
  if (!material.roughnessMap) {
    material.roughness = 0.4
  }

  if (!material.metalnessMap) {
    material.metalness = 0.0
  }

  material.envMapIntensity = 1.2

  material.needsUpdate = true
}

/** Walks a scene graph and applies the same fallback treatment to each mesh. */
export function applySmartPBRDefaultsToScene(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          applySmartPBRDefaults(mat)
        }
      }
      node.castShadow = true
      node.receiveShadow = true
    }
  })
}

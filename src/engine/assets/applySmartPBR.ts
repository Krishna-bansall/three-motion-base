/**
 * Step 4: Smart PBR Defaults
 * 
 * Applies sensible PBR defaults to meshes that lack proper PBR maps.
 * Only overrides when the artist didn't provide data.
 */
import * as THREE from 'three'

/**
 * Apply smart PBR defaults to a MeshStandardMaterial.
 * Only modifies values when no maps are present.
 */
export function applySmartPBRDefaults(material: THREE.MeshStandardMaterial): void {
  // If no roughness map, set a good default
  if (!material.roughnessMap) {
    material.roughness = 0.4
  }

  // If no metalness map, default to dielectric (non-metal)
  if (!material.metalnessMap) {
    material.metalness = 0.0
  }

  // Slightly punchy reflections
  material.envMapIntensity = 1.2

  material.needsUpdate = true
}

/**
 * Apply smart PBR defaults to all meshes in a scene graph.
 */
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

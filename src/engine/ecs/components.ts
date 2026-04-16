/**
 * Step 3: bitECS Component Definitions (v0.4.0 API)
 * 
 * Components are plain objects holding SoA typed arrays.
 * Side-maps bridge ECS entity IDs to Three.js objects.
 */
import type { Object3D, MeshStandardMaterial } from 'three'

// ── Max entities ────────────────────────────────────────────
const MAX = 10_000

// ── ECS Components ──────────────────────────────────────────

/** Position, rotation (euler radians), scale */
export const Transform = {
  px: new Float32Array(MAX),
  py: new Float32Array(MAX),
  pz: new Float32Array(MAX),
  rx: new Float32Array(MAX),
  ry: new Float32Array(MAX),
  rz: new Float32Array(MAX),
  sx: new Float32Array(MAX).fill(1),
  sy: new Float32Array(MAX).fill(1),
  sz: new Float32Array(MAX).fill(1),
}

/** PBR material properties */
export const Material = {
  roughness: new Float32Array(MAX),
  metalness: new Float32Array(MAX),
  envMapIntensity: new Float32Array(MAX),
  r: new Float32Array(MAX),
  g: new Float32Array(MAX),
  b: new Float32Array(MAX),
}

/** Tag: entity has a Three.js mesh reference in the side-map */
export const MeshRef = {} as Record<string, never>

/** Tag: transform was mutated, needs sync to Object3D */
export const DirtyTransform = {} as Record<string, never>

/** Tag: material was mutated, needs sync to MeshStandardMaterial */
export const DirtyMaterial = {} as Record<string, never>

/** Tag: root entity of the loaded product model */
export const ProductRoot = {} as Record<string, never>

// ── Side-maps ───────────────────────────────────────────────
// ECS stores numbers; side-maps store Three.js object references.

/** Maps entity ID → Three.js Object3D */
export const eidToObject3D = new Map<number, Object3D>()

/** Maps entity ID → MeshStandardMaterial */
export const eidToMaterial = new Map<number, MeshStandardMaterial>()

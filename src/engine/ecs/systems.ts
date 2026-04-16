/**
 * Step 6: Sync Systems (v0.4.0 API)
 * 
 * Per-frame systems that push dirty ECS data to Three.js objects.
 * Uses query() instead of defineQuery().
 */
import { query, removeComponent } from 'bitecs'
import type { World } from 'bitecs'
import {
  Transform,
  Material,
  DirtyTransform,
  DirtyMaterial,
  eidToObject3D,
  eidToMaterial,
} from './components'

// ── Systems ─────────────────────────────────────────────────

/**
 * Syncs dirty Transform components → Object3D position/rotation/scale.
 * Removes DirtyTransform tag after sync.
 */
export function syncTransformSystem(w: World): void {
  const entities = query(w, [DirtyTransform, Transform])
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]
    const obj = eidToObject3D.get(eid)
    if (!obj) continue

    obj.position.set(
      Transform.px[eid],
      Transform.py[eid],
      Transform.pz[eid],
    )
    obj.rotation.set(
      Transform.rx[eid],
      Transform.ry[eid],
      Transform.rz[eid],
    )
    obj.scale.set(
      Transform.sx[eid],
      Transform.sy[eid],
      Transform.sz[eid],
    )

    removeComponent(w, eid, DirtyTransform)
  }
}

/**
 * Syncs dirty Material components → MeshStandardMaterial properties.
 * Removes DirtyMaterial tag after sync.
 */
export function syncMaterialSystem(w: World): void {
  const entities = query(w, [DirtyMaterial, Material])
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]
    const mat = eidToMaterial.get(eid)
    if (!mat) continue

    mat.roughness = Material.roughness[eid]
    mat.metalness = Material.metalness[eid]
    mat.envMapIntensity = Material.envMapIntensity[eid]
    mat.color.setRGB(
      Material.r[eid],
      Material.g[eid],
      Material.b[eid],
    )
    mat.needsUpdate = true

    removeComponent(w, eid, DirtyMaterial)
  }
}

/**
 * Runs all sync systems. Called once per frame before render.
 */
export function runSyncSystems(w: World): void {
  syncTransformSystem(w)
  syncMaterialSystem(w)
}

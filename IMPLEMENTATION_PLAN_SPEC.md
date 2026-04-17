# Canonical Scene Graph Migration Plan

## Purpose

This plan introduces a canonical, renderer-agnostic scene graph while preserving the current high-fidelity Three.js editor experience.

Primary goal:
- Keep Three.js as the best realtime editing runtime now.
- Make future path tracing / custom rendering possible through adapters, not engine rewrites.

---

## Scope

In scope:
- Add canonical scene graph data model (source of truth).
- Add runtime adapter contract.
- Implement Three.js runtime adapter.
- Route engine edits through canonical model + dirty sync.
- Keep current UI behavior and fidelity.

Out of scope (later phases):
- Full path-tracer adapter implementation.
- Lighting bake pipeline.
- Material system expansion beyond current PBR controls.

---

## Architecture Target

```text
React UI
  -> EngineAPI
    -> Canonical Scene Graph (source of truth)
    -> Runtime Adapter interface
         -> ThreeAdapter (current)
         -> PathTracerAdapter (future)
```

Rules:
- UI does not import `three`.
- Canonical graph does not store `THREE.*` objects.
- Runtime adapters can store renderer-specific handles and caches.
- Undo/redo/save/load operate on canonical graph.

---

## Minimal Canonical Model (MVP)

```ts
type NodeId = string
type MeshId = string
type MaterialId = string

interface SceneDoc {
  roots: NodeId[]
  nodes: Record<NodeId, SceneNode>
  meshes: Record<MeshId, MeshDef>
  materials: Record<MaterialId, MaterialDef>
  metadata: {
    units: 'm'
    upAxis: 'Y'
    colorSpace: 'linear-srgb'
  }
}

interface SceneNode {
  id: NodeId
  parentId: NodeId | null
  children: NodeId[]
  name: string
  t: [number, number, number]
  r: [number, number, number, number] // quat
  s: [number, number, number]
  meshId?: MeshId
  materialId?: MaterialId
  visible: boolean
  extras?: Record<string, unknown>
}

interface MeshDef {
  source: { uri: string; primitive?: number }
}

interface MaterialDef {
  baseColor: [number, number, number]
  roughness: number
  metalness: number
  envMapIntensity: number
  extras?: Record<string, unknown>
}
```

Notes:
- Keep this minimal; extend through `extras` until fields are proven stable.
- Existing ECS may remain initially, but canonical graph becomes authoritative.

---

## Runtime Adapter Contract

Define an interface that `EngineAPI` uses instead of concrete `ThreeRenderer` internals:

```ts
interface RuntimeAdapter {
  mount(container: HTMLElement): void
  unmount(): void

  buildFromCanonical(scene: SceneDoc): void
  applyDirty(delta: SceneDelta): void

  setViewSettings(settings: ViewSettings): void
  getViewSettings(): ViewSettings

  setTransformToolMode(mode: 'translate' | 'rotate' | 'scale' | null): void
  onRuntimeTransformChanged(cb: (nodeId: NodeId, trs: TRS) => void): void

  exportPNG(scale: number): Promise<Blob>
}
```

Three-specific fields (`renderer`, `scene`, `postProcessing`, `productRoot`, etc.) stay private inside `ThreeAdapter`.

---

## Migration Phases

## Phase 0: Spec + contracts (short, mandatory)

Deliverables:
- Update `SPEC.md` to remove contradictions:
  - Engine owns canonical graph.
  - Renderer swap means adapter swap, not engine rewrite.
  - Fix `addComponent` pseudocode argument order.
  - Clarify PNG export behavior (current in-place resize vs OffscreenCanvas optional).
- Add this plan doc to repo.

Acceptance:
- Team agrees canonical graph is source of truth.
- Team agrees adapter boundary is enforced.

---

## Phase 1: Introduce canonical graph without breaking runtime

Deliverables:
- Add `src/engine/scene/` with canonical types + helpers:
  - `types.ts`
  - `mutations.ts`
  - `snapshot.ts`
  - `diff.ts` (minimal dirty delta)
- Update loader path to produce canonical scene output.
- Keep current Three loading behavior as temporary bridge if needed.

Acceptance:
- App can load sample model and produce canonical scene state.
- Save/inspect canonical state from console API.

---

## Phase 2: Add Three runtime adapter and isolate Three internals

Deliverables:
- Add `src/engine/runtime/RuntimeAdapter.ts`.
- Add `src/engine/runtime/three/ThreeAdapter.ts` (wrapping current renderer pieces).
- Refactor `EngineAPI` to depend on `RuntimeAdapter`.
- Remove direct `EngineAPI -> ThreeRenderer` internals coupling.

Acceptance:
- Existing UI features still work:
  - transform controls
  - material controls
  - HDRI/exposure/bloom/filters
  - auto-rotate
  - export PNG
- `EngineAPI` has no direct usage of renderer internals.

---

## Phase 3: Canonical-first edits + dirty sync

Deliverables:
- All mutating APIs write canonical data first.
- Dirty delta drives `adapter.applyDirty(...)`.
- Runtime gizmo edits flow back through engine into canonical model.
- Undo/redo snapshots based on canonical model, not runtime object state.

Acceptance:
- Undo/redo remains stable for all current controls.
- Runtime can be rebuilt from canonical state at any point with no drift.

---

## Phase 4: UI boundary cleanup

Deliverables:
- Remove direct `three` imports from React UI, especially `LightingPanel`.
- Move preview rendering either:
  - into adapter-provided preview API, or
  - to static/generated thumbnails owned by engine/runtime service.

Acceptance:
- `rg "from 'three|from \"three"` in `src/ui` returns no runtime Three usage.
- UI uses only `EngineAPI` + store state.

---

## Phase 5: Path tracing readiness layer

Deliverables:
- Add conversion module `canonical -> render backend schema`.
- Define unsupported-feature reporting path.
- Add metadata hooks for future bake/path features (`extras` usage guide).

Acceptance:
- A test conversion runs from canonical graph without requiring Three object references.

---

## Risk Register

- Risk: dual source of truth during migration.
  - Mitigation: define canonical as authoritative early; runtime writes must round-trip through engine.
- Risk: performance regressions.
  - Mitigation: use minimal dirty deltas and adapter-side object caches.
- Risk: feature drift in refactor.
  - Mitigation: phase gates + smoke checklist after each phase.

---

## Smoke Checklist (run each phase)

- Load sample model.
- Drag-drop replace model.
- Transform gizmo works and persists.
- Material sliders update viewport.
- HDRI/exposure/bloom/filters update viewport.
- Auto-rotate works.
- Undo/redo works across transform + material + view settings.
- PNG export works.

---

## Handoff Brief For Next Chat

Use this prompt in the next chat:

```text
Implement Phase 0 and Phase 1 from IMPLEMENTATION_PLAN_SPEC.md.

Constraints:
- Do not break existing UI behavior.
- Keep changes incremental and commit-friendly.
- Canonical graph must be added under src/engine/scene.
- Keep Three runtime behavior intact for now.

Deliver:
1) Updated SPEC.md with clarified architecture and corrected sync pseudocode.
2) New canonical scene graph types + minimal mutation/snapshot helpers.
3) Loader bridge that produces canonical state on model load.
4) Short validation notes on smoke checklist items that were run.
```

---

## Definition of Done (for full plan)

- Canonical scene graph is the only source of truth.
- EngineAPI depends on runtime adapter interface, not Three concrete internals.
- React UI has no direct Three runtime usage.
- Current editor fidelity/features remain intact.
- Backend conversion path exists for path-tracing integration.

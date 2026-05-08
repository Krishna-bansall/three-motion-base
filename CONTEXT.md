# Project Context

## Product

`three-motion-base` is a React, TypeScript, Vite application for editing and exporting high-fidelity Three.js product scenes.

The current user-facing workflow centers on:

- Loading a GLB/GLTF model, including drag-and-drop replacement.
- Editing transforms, materials, lighting, environment, post-processing, and filters.
- Previewing the scene in a Three.js viewport.
- Using auto-rotate / turntable behavior.
- Exporting PNG renders.
- Preserving editing behavior through undo and redo.

Bundled runtime assets include:

- `public/models/sample.glb`
- `public/hdri/studio.hdr`
- `public/hdri/moody.hdr`
- `public/hdri/daylight.hdr`

## Architecture

The intended architecture is:

```text
React UI
  -> EngineAPI
    -> Canonical Scene Graph
    -> Runtime Adapter
         -> Three.js runtime now
         -> Path tracer or other renderer later
```

Core rules:

- React UI should call the engine through `EngineAPI`.
- UI code should not depend directly on `THREE.*` runtime objects.
- The canonical scene graph is the source of truth for scene state.
- Runtime adapters may hold renderer-specific handles, caches, and object references.
- Undo, redo, save, load, and rebuild behavior should operate from canonical state rather than runtime object state.

## Domain Terms

- **EngineAPI**: Public application-facing engine surface used by the UI.
- **Canonical Scene Graph**: Renderer-agnostic scene document that owns durable scene state.
- **SceneDoc**: Serializable scene graph root containing roots, nodes, meshes, materials, and metadata.
- **SceneNode**: Canonical node with transform, hierarchy, visibility, optional mesh reference, and optional material reference.
- **MeshDef**: Renderer-agnostic mesh definition, currently tied to source URI / primitive references.
- **MaterialDef**: Renderer-agnostic PBR material definition including base color, roughness, metalness, and environment intensity.
- **Runtime Adapter**: Boundary between engine state and a concrete renderer implementation.
- **ThreeAdapter / Three.js runtime**: Current runtime implementation for viewport rendering, controls, post-processing, and export.
- **Dirty delta**: Minimal description of canonical changes that a runtime adapter applies without rebuilding the full scene.
- **Smart PBR defaults**: Asset-loading pass that applies useful default PBR material values to imported GLTF materials.
- **Turntable**: Pointer-driven or automatic rotation behavior for the product root.
- **Post-processing**: Bloom, vignette, chromatic aberration, and related visual effects applied after rendering.

## Current Module Map

- `src/App.tsx`: Top-level app composition.
- `src/ui/`: React UI surfaces including drag/drop, viewport, start screen, and editing panels.
- `src/store/useEngineStore.ts`: UI-facing store state.
- `src/engine/EngineAPI.ts`: Engine API used by the UI.
- `src/engine/scene/`: Canonical scene graph types, mutations, snapshots, diffing, and transform math.
- `src/engine/runtime/`: Runtime adapter types and environment helpers.
- `src/engine/assets/`: GLTF loading and smart PBR default logic.
- `src/engine/renderer/`: Three.js renderer, post-processing, cinematic shader, turntable controller, and PNG export.
- `src/engine/history/`: Engine history / undo-redo support.
- `src/engine/store/`: Bridge between engine state and UI store state.
- `tests/engine/`: Behavior tests for loading, runtime graph, history, export, adapter lifecycle, and material defaults.
- `scripts/browser-smoke.mjs`: Browser smoke test script.

## Current Direction

The canonical scene graph migration is the active architectural direction.

The migration plan in `IMPLEMENTATION_PLAN_SPEC.md` defines these phases:

- Phase 0: Clarify specs and contracts.
- Phase 1: Introduce canonical graph without breaking runtime behavior.
- Phase 2: Add and enforce a Three runtime adapter boundary.
- Phase 3: Make edits canonical-first and sync via dirty deltas.
- Phase 4: Clean up UI boundaries so UI does not import Three directly.
- Phase 5: Add path-tracing readiness through backend conversion and unsupported-feature reporting.

## Known Architecture Issues

`ARCHITECTURE_ISSUES.md` tracks current mismatches between the intended architecture and implementation.

Important known issues:

- React UI still has direct Three.js usage in `src/ui/panels/LightingPanel.tsx`.
- Engine and asset-loading internals still have Three.js coupling.
- `EngineAPI` has historically depended on concrete renderer internals.
- Spec snippets and export wording have needed alignment with implementation details.

When working in these areas, preserve current UI behavior while moving coupling behind explicit engine/runtime boundaries.

## Engineering Constraints

- Keep changes incremental and commit-friendly.
- Do not break current viewport, material, lighting, filter, transform, history, auto-rotate, or PNG export behavior.
- Prefer focused behavior tests under `tests/engine/` for engine and runtime changes.
- Use the smoke checklist from `IMPLEMENTATION_PLAN_SPEC.md` after architecture-phase work:
  - Load sample model.
  - Drag-drop replace model.
  - Transform gizmo works and persists.
  - Material sliders update viewport.
  - HDRI, exposure, bloom, and filters update viewport.
  - Auto-rotate works.
  - Undo/redo works across transform, material, and view settings.
  - PNG export works.

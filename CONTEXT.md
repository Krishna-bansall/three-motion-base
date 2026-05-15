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
    -> ProjectDoc
    -> RenderGraphDoc
    -> Runtime Adapter
         -> Three.js runtime now
         -> Path tracer or other renderer later
```

Core rules:

- React UI should call the engine through `EngineAPI`.
- UI code should not depend directly on `THREE.*` runtime objects.
- `ProjectDoc` is the durable authoring source of truth for studio projects.
- `RenderGraphDoc` is the assembled renderer-facing graph derived from project state and mounted asset content.
- Runtime adapters may hold renderer-specific handles, caches, and object references.
- Undo, redo, save, load, and rebuild behavior should operate from project/render graph state rather than runtime object state.

## Domain Terms

- **EngineAPI**: Public application-facing engine surface used by the UI.
- **ProjectDoc**: Saved authoring document for a product studio project.
- **StudioSceneDoc**: Durable studio setup containing product slots, cameras, lights, studio geometry, environment, and material references.
- **AssetGraphDoc**: Imported or bundled graph-shaped 3D content that can be mounted into a product slot or studio object.
- **Asset Node ID**: App-generated stable identifier for a node inside an AssetGraphDoc.
- **Imported Light Candidate**: Light data found in imported asset content that is not active until promoted into the StudioSceneDoc.
- **RenderGraphDoc**: Assembled renderer-facing graph consumed by runtime adapters.
- **RenderGraphCache**: Optional persisted or in-memory derived RenderGraphDoc used for faster startup or diffing.
- **RenderGraphMount**: Placement of an AssetGraphDoc into the assembled RenderGraphDoc.
- **Render Node ID**: Stable renderer-facing identifier projected from project, mount, and asset IDs.
- **Mount Overrides**: Project-owned edits applied to mounted asset content, such as visibility, material, setup transform, or variant overrides.
- **Studio Set**: Coarse studio asset mount representing a bundled or imported environment/set.
- **Animation Target**: Project element that can receive timeline motion; MVP targets are product, camera, and active lights.
- **Canonical authoring state**: ProjectDoc state that represents saved user intent.
- **Canonical render state**: RenderGraphDoc state that is renderer-agnostic but assembled for rendering.
- **SceneDoc**: Current implementation name for RenderGraphDoc; avoid using it as product/domain language.
- **SceneNode**: Current implementation name for a render graph node with transform, hierarchy, visibility, and optional mesh, camera, light, or material references.
- **MeshDef**: Renderer-agnostic mesh definition, currently tied to source URI / primitive references.
- **MaterialDef**: Renderer-agnostic PBR material definition including base color, roughness, metalness, and environment intensity.
- **Runtime Adapter**: Boundary between engine state and a concrete renderer implementation.
- **ThreeAdapter / Three.js runtime**: Current runtime implementation for viewport rendering, controls, post-processing, and export.
- **Dirty delta**: Minimal description of canonical changes that a runtime adapter applies without rebuilding the full scene.
- **Smart PBR defaults**: Asset-loading pass that applies useful default PBR material values to imported GLTF materials.
- **Turntable**: Pointer-driven or automatic rotation behavior for the product root.
- **Post-processing**: Bloom, vignette, chromatic aberration, and related visual effects applied after rendering.

## Relationships

- A **ProjectDoc** owns exactly one MVP **StudioSceneDoc**, one project-level Look, and one or more Shots.
- A **StudioSceneDoc** owns stable **Product Slots** and durable studio setup; it is not itself the renderer-facing graph.
- A **Product Slot** or studio object can mount an **AssetGraphDoc**.
- MVP product animation targets the stable **Product Slot**, not the imported asset root or imported product child nodes.
- A **RenderGraphMount** owns **Mount Overrides**; the mounted **AssetGraphDoc** remains reusable source content.
- Product import fitting, centering, scaling, and setup edits belong to the **Product Slot** mount, not by mutating the source **AssetGraphDoc**.
- **AssetGraphDoc** references use app-generated stable IDs; original asset names, paths, indices, and URIs are source metadata for labels, debugging, and future reimport matching.
- Product assets and studio assets share the **AssetGraphDoc** model; product/studio differences belong to mount policy and contextual UI, not separate graph semantics.
- A **Studio Set** remains one coarse studio mount in MVP; child asset nodes can receive limited visibility, material, and setup transform overrides, but are not promoted into separate top-level studio objects.
- Studio set child nodes are setup-editable only; they are not **Animation Targets** in MVP.
- **StudioSceneDoc** is the only owner of active render cameras and active render lights.
- Cameras found in imported asset content are ignored for active rendering.
- Lights found in imported asset content are **Imported Light Candidates** until explicitly promoted into **StudioSceneDoc**.
- A **RenderGraphDoc** is assembled from the **ProjectDoc**, mounted **AssetGraphDocs**, and evaluated Shot state.
- **RenderGraphDoc** node IDs are stable projections of project, mount, and asset IDs; they are not regenerated arbitrarily during assembly.
- A **RenderGraphCache** is optional and disposable; if it disagrees with **ProjectDoc** and mounted asset content, the cache is rebuilt.
- A **Runtime Adapter** synchronizes a **RenderGraphDoc** into renderer-specific objects such as `THREE.Scene`, `THREE.Mesh`, cameras, and lights.
- **Canonical authoring state** and **canonical render state** are both non-runtime state, but only **ProjectDoc** represents saved product-studio intent.

## Example dialogue

> **Dev:** "When a product GLB is imported, does it replace the Studio Scene?"
> **Domain expert:** "No — it becomes an AssetGraphDoc mounted into the primary Product Slot, then the RenderGraphDoc is updated for the renderer."
>
> **Dev:** "If the user hides a chair from a mounted studio set, do we mutate the source asset?"
> **Domain expert:** "No — the project records a Mount Override for that mount, and the source AssetGraphDoc remains reusable."

## Flagged ambiguities

- "scene" was used for both durable studio setup and renderer-facing graph — resolved: use **StudioSceneDoc** for authoring setup and **RenderGraphDoc** for the assembled renderer-facing graph.
- "SceneDoc" remains an implementation name but should be treated as the current code name for **RenderGraphDoc**, not as product terminology.
- "canonical" was used too broadly — resolved: distinguish **canonical authoring state** from **canonical render state**.

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

The project document and render graph migration is the active architectural direction.

The `codex-test-push` branch contains exploratory or partial motion/project implementation work. Treat that branch as non-authoritative for product requirements, issue refinement, and PRD creation unless a task explicitly asks to inspect or salvage it.

New issue/PRD implementation branches created after `codex-test-push`, including `issue-33-project-studio-scene`, can be trusted by their own diffs, linked GitHub issues, PRDs, this context file, and explicit design decisions from the user. The sources of truth for planning remain GitHub issues, PRDs, this context file, and explicit design decisions.

The migration plan in `IMPLEMENTATION_PLAN_SPEC.md` defines these phases:

- Phase 0: Clarify specs and contracts.
- Phase 1: Introduce canonical graph without breaking runtime behavior.
- Phase 2: Add and enforce a Three runtime adapter boundary.
- Phase 3: Make edits canonical-first and sync via dirty deltas.
- Phase 4: Clean up UI boundaries so UI does not import Three directly.
- Phase 5: Add path-tracing readiness through backend conversion and unsupported-feature reporting.

## Known Architecture Issues

Important known issues:

- React UI still has direct Three.js usage in `src/ui/panels/LightingPanel.tsx`.
- Engine and asset-loading internals still have Three.js coupling.
- `EngineAPI` has historically depended on concrete renderer internals.

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

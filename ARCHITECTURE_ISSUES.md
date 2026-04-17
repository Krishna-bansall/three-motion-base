# Architecture Issues Backlog

This document tracks architecture mismatches between `SPEC.md` and the current implementation.
We will fix these one by one, in priority order.

## Priority legend

- `P0` Critical: breaks core architecture intent or future extensibility
- `P1` High: important consistency/correctness issue, but not immediately blocking
- `P2` Medium: clarity/doc quality issue

## Backlog (in fix order)

- [ ] `P0` React layer directly uses Three.js
  - Problem: `SPEC.md` says React should call `EngineAPI` only and never touch `THREE`, but `LightingPanel` creates its own Three renderer/scene.
  - Why this matters: breaks strict UI ↔ engine boundary and makes renderer swap harder.
  - Evidence:
    - `SPEC.md` (React rule)
    - `src/ui/panels/LightingPanel.tsx` (`three` imports + renderer setup)
  - Target state: UI gets preview/state via `EngineAPI` or a renderer-owned service, not direct `three` usage.

- [ ] `P0` Engine and ECS are tightly coupled to Three.js types
  - Problem: engine-side data structures and asset pipeline directly depend on `three` classes (`Object3D`, `MeshStandardMaterial`, `THREE.Group`, GLTF traversal logic).
  - Why this matters: contradicts “swap renderer later with engine unchanged” intent.
  - Evidence:
    - `src/engine/ecs/components.ts` (Three-typed side maps)
    - `src/engine/assets/loadGLTF.ts` (Three-based load/process and `THREE.Group` return type)
    - `SPEC.md` (renderer swap claim)
  - Target state: move Three-specific references behind a renderer adapter boundary; engine stores renderer-agnostic data/contracts.

- [ ] `P1` `EngineAPI` depends on concrete `ThreeRenderer` internals
  - Problem: `EngineAPI` reaches into `ThreeRenderer` fields (`productRoot`, `postProcessing`, `renderer`, `turntable`) instead of consuming a narrow interface.
  - Why this matters: creates hidden coupling and blocks clean renderer replacement.
  - Evidence:
    - `src/engine/EngineAPI.ts`
  - Target state: `EngineAPI` talks to a renderer interface with explicit methods; internals stay private to renderer implementation.

- [ ] `P1` Spec sync contract example has incorrect `addComponent` call shape
  - Problem: `SPEC.md` pseudocode shows wrong argument order for `addComponent`.
  - Why this matters: misleading documentation; can cause implementation bugs for new contributors.
  - Evidence:
    - `SPEC.md` sync contract snippet
    - actual usage in `src/engine/EngineAPI.ts` and `src/engine/assets/loadGLTF.ts`
  - Target state: spec snippet reflects real API usage.

- [ ] `P2` Export implementation vs spec wording mismatch
  - Problem: spec says `OffscreenCanvas 3× export`, implementation does in-place resize + `toBlob` on renderer canvas.
  - Why this matters: confusion about required behavior and performance expectations.
  - Evidence:
    - `SPEC.md` PNG/export line
    - `src/engine/renderer/exportPNG.ts`
  - Target state: either implement OffscreenCanvas or update spec to describe the chosen approach explicitly.

## Proposed execution plan

1. Fix `P0` UI boundary leak (`LightingPanel`).
2. Define and implement renderer adapter boundary (`P0` + `P1` workstream).
3. Decouple ECS side maps/asset pipeline from hard Three types (`P0`).
4. Align `SPEC.md` code snippets and export wording (`P1` + `P2`).

## Status

- Current phase: `Planning / Backlog created`
- Next action: start `P0` issue #1 (React layer direct Three.js usage)

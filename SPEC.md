# MVP architecture

## Layer stack

```
┌─────────────────────────────────────────────────────┐
│                    React UI layer                   │
│          Panels · drag-drop zone · viewport         │
└──────────────────────┬──────────────────────────────┘
                       │ Engine API calls
┌──────────────────────▼──────────────────────────────┐
│  Engine                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  ECS world   │  │Asset pipeline│  │  Scene    │ │
│  │  bitECS      │  │GLTF → entity │  │ snapshot  │ │
│  │  dirty flags │  │              │  │  JSON     │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ dirty flags → sync()
┌──────────────────────▼──────────────────────────────┐
│  Three.js renderer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  WebGL +     │  │EffectComposer│  │Turntable  │ │
│  │  HDRI        │  │Bloom,vignette│  │PNG export │ │
│  │  3 bundled   │  │chromatic ab. │  │OffScreen  │ │
│  └──────────────┘  └──────────────┘  │  3×       │ │
│                                      └───────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ v3 — swap renderer
┌──────────────────────▼──────────────────────────────┐
│  Path tracer (v3+)  ·  three-gpu-pathtracer / WebGPU│
└─────────────────────────────────────────────────────┘
```

---

## Layer responsibilities

### React UI layer
- Panels, drag-drop zone, viewport canvas
- Calls engine only via `EngineAPI` — never touches a `THREE` object
- Reads display state from Zustand store (written by engine after mutations)

### Engine
| Module | Responsibility |
|---|---|
| ECS world | bitECS typed arrays, component definitions, dirty flag tags |
| Asset pipeline | GLTFLoader → traverse → mint ECS entities → apply smart PBR defaults |
| Scene snapshot | Serializable JSON; LLM tool context in v2 |

### Three.js renderer
| Module | Responsibility |
|---|---|
| WebGL + HDRI | Render loop, 3 bundled HDRI envmaps (studio, moody, daylight) |
| EffectComposer | Bloom → custom CinematicShader (vignette + chromatic aberration) |
| Turntable + PNG | Pointer drag rotates product root; OffscreenCanvas 3× export |

### Path tracer (v3+)
- `three-gpu-pathtracer` or WebGPU backend
- Drops in as a renderer swap — engine and React layers unchanged

---

## Engine → renderer sync contract

```
engine.setTransform(eid, t)
  → writes to ECS typed arrays
  → addComponent(world, DirtyTransform, eid)
  → Zustand store update (React panels reflect value)

per-frame runSyncSystems()
  → dirtyTransformQ  → push to Object3D → removeComponent DirtyTransform
  → dirtyMaterialQ   → push to MeshStandardMaterial → removeComponent DirtyMaterial

renderer.render() / composer.render()
```

---

## MVP build order

1. `ThreeRenderer` — canvas, camera, scene, HDRI loader, render loop
2. `EffectComposer` + `CinematicShader` — nail the look first
3. bitECS world + component definitions + side-maps
4. `loadGLTF` + `applySmartPBRDefaults` — the magic moment
5. `TurntableController`
6. `runSyncSystems`
7. `EngineAPI` surface wired to React context
8. `exportPNG`
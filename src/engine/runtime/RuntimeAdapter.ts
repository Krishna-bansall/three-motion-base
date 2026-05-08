import type { SceneDelta } from '../scene/diff.ts'
import type { NodeId, SceneDoc } from '../scene/types.ts'
import type { ViewSettings } from '../viewSettings.ts'
import type {
  EnvironmentPreview,
  RuntimeDebugGraph,
  RuntimeSceneAssetBundle,
  TRS,
  TransformGizmoMode,
} from './types.ts'

/**
 * Runtime adapter contract.
 *
 * The engine owns canonical scene and view state. A runtime adapter mounts the
 * renderer, builds or patches the live scene, applies view settings, and sends
 * user interactions back to the engine.
 */
export interface RuntimeAdapter {
  /** Mounts the runtime into a DOM container. */
  mount(container: HTMLElement): void
  /** Unmounts the runtime and releases resources. */
  unmount(): void

  /** Stores model assets or adapter-facing source data for later rebuilds. */
  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void
  /** Builds the runtime scene from canonical data. */
  buildFromCanonical(scene: SceneDoc): Promise<void>
  /** Applies a scene diff, or rebuilds if needed i.e */
  applyDirty(delta: SceneDelta, scene: SceneDoc): Promise<void>

  /** Applies view settings to the runtime. */
  setViewSettings(settings: ViewSettings): Promise<void>
  /** Reads back the runtime view settings. */
  getViewSettings(): ViewSettings

  /** Sets the active transform gizmo mode. */
  setTransformToolMode(mode: TransformGizmoMode | null): void
  /** Reads the active transform gizmo mode. */
  getTransformToolMode(): TransformGizmoMode | null
  /** Notifies when the user changes a runtime transform. */
  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void
  /** Notifies when a transform interaction starts. */
  onTransformInteractionStart(cb: (() => void) | null): void
  /** Notifies when a transform interaction ends. */
  onTransformInteractionEnd(cb: (() => void) | null): void

  /** Exports the current frame as a PNG. */
  exportPNG(scale: number): Promise<Blob>
  /** Returns available environment previews. */
  getEnvironmentPreviews(): EnvironmentPreview[]
  /** Returns a debug graph for diagnostics. */
  getRuntimeDebugGraph(scene: SceneDoc): RuntimeDebugGraph
}

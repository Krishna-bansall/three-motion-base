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

/** Adapter boundary between the canonical engine model and a concrete runtime. */
export interface RuntimeAdapter {
  mount(container: HTMLElement): void
  unmount(): void

  /** Supplies renderer-specific source assets for future rebuilds. */
  setSceneAssets(assets: RuntimeSceneAssetBundle | null): void
  buildFromCanonical(scene: SceneDoc): Promise<void>
  applyDirty(delta: SceneDelta, scene: SceneDoc): Promise<void>

  setViewSettings(settings: ViewSettings): Promise<void>
  getViewSettings(): ViewSettings

  setTransformToolMode(mode: TransformGizmoMode | null): void
  getTransformToolMode(): TransformGizmoMode | null
  onRuntimeTransformChanged(cb: ((nodeId: NodeId, trs: TRS) => void) | null): void
  onTransformInteractionStart(cb: (() => void) | null): void
  onTransformInteractionEnd(cb: (() => void) | null): void

  exportPNG(scale: number): Promise<Blob>
  getEnvironmentPreviews(): EnvironmentPreview[]
  getRuntimeDebugGraph(scene: SceneDoc): RuntimeDebugGraph
}

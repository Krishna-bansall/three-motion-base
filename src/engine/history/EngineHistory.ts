import type { SceneDoc } from '../scene/types'
import type { ViewSettings } from '../viewSettings'
import type { ProjectDoc } from '../project/types'

export interface EngineSnapshot {
  scene: SceneDoc | null
  viewSettings: ViewSettings
  project?: ProjectDoc
}

const HISTORY_LIMIT = 100

export class EngineHistory {
  private history: EngineSnapshot[] = []
  private historyIndex = -1
  private pendingTransformSnapshot: EngineSnapshot | null = null
  private historyBatchDepth = 0
  private historyBatchStart: EngineSnapshot | null = null
  private applying = false

  get isApplyingHistory(): boolean {
    return this.applying
  }

  get currentIndex(): number {
    return this.historyIndex
  }

  get totalStates(): number {
    return this.history.length
  }

  beginApplyingHistory(): void {
    this.applying = true
  }

  endApplyingHistory(): void {
    this.applying = false
  }

  beginBatch(captureSnapshot: () => EngineSnapshot | null): void {
    if (this.applying) return

    if (this.historyBatchDepth === 0) {
      this.historyBatchStart = captureSnapshot()
    }

    this.historyBatchDepth += 1
  }

  endBatch(
    captureSnapshot: () => EngineSnapshot | null,
    areSnapshotsEqual: (left: EngineSnapshot, right: EngineSnapshot) => boolean,
  ): boolean {
    if (this.applying || this.historyBatchDepth === 0) return false

    this.historyBatchDepth -= 1
    if (this.historyBatchDepth > 0) return false

    const before = this.historyBatchStart
    const after = captureSnapshot()
    this.historyBatchStart = null

    if (!before || !after || areSnapshotsEqual(before, after)) {
      return false
    }

    return this.pushSnapshot(after, areSnapshotsEqual)
  }

  beginTransform(captureSnapshot: () => EngineSnapshot | null): void {
    if (this.applying) return
    this.pendingTransformSnapshot = captureSnapshot()
  }

  endTransform(
    captureSnapshot: () => EngineSnapshot | null,
    areSnapshotsEqual: (left: EngineSnapshot, right: EngineSnapshot) => boolean,
  ): boolean {
    if (this.applying || !this.pendingTransformSnapshot) return false

    const before = this.pendingTransformSnapshot
    const after = captureSnapshot()
    this.pendingTransformSnapshot = null

    if (!after || areSnapshotsEqual(before, after)) {
      return false
    }

    return this.pushSnapshot(after, areSnapshotsEqual)
  }

  initialize(snapshot: EngineSnapshot | null): void {
    if (!snapshot) {
      this.reset()
      return
    }

    this.history = [snapshot]
    this.historyIndex = 0
    this.pendingTransformSnapshot = null
    this.historyBatchDepth = 0
    this.historyBatchStart = null
  }

  commitCurrentSnapshot(
    captureSnapshot: () => EngineSnapshot | null,
    areSnapshotsEqual: (left: EngineSnapshot, right: EngineSnapshot) => boolean,
  ): boolean {
    if (this.applying || this.historyBatchDepth > 0) return false

    const snapshot = captureSnapshot()
    if (!snapshot) return false

    return this.pushSnapshot(snapshot, areSnapshotsEqual)
  }

  getUndoSnapshot(): EngineSnapshot | null {
    if (!this.canUndo()) return null
    return this.history[this.historyIndex - 1] ?? null
  }

  getRedoSnapshot(): EngineSnapshot | null {
    if (!this.canRedo()) return null
    return this.history[this.historyIndex + 1] ?? null
  }

  markUndoApplied(): void {
    if (this.canUndo()) {
      this.historyIndex -= 1
    }
  }

  markRedoApplied(): void {
    if (this.canRedo()) {
      this.historyIndex += 1
    }
  }

  canUndo(): boolean {
    return this.historyIndex > 0
  }

  canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1
  }

  getUndoDepth(): number {
    return Math.max(this.historyIndex, 0)
  }

  getRedoDepth(): number {
    if (this.historyIndex < 0) return 0
    return Math.max(this.history.length - this.historyIndex - 1, 0)
  }

  reset(): void {
    this.history = []
    this.historyIndex = -1
    this.pendingTransformSnapshot = null
    this.historyBatchDepth = 0
    this.historyBatchStart = null
  }

  private pushSnapshot(
    snapshot: EngineSnapshot,
    areSnapshotsEqual: (left: EngineSnapshot, right: EngineSnapshot) => boolean,
  ): boolean {
    const current = this.history[this.historyIndex] ?? null
    if (current && areSnapshotsEqual(current, snapshot)) {
      return false
    }

    let nextHistory = this.history.slice(0, this.historyIndex + 1)
    nextHistory.push(snapshot)

    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT)
    }

    this.history = nextHistory
    this.historyIndex = this.history.length - 1
    return true
  }
}

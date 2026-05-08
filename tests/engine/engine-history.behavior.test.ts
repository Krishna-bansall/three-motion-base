import test from 'node:test'
import assert from 'node:assert/strict'
import { EngineHistory, type EngineSnapshot } from '../../src/engine/history/EngineHistory.ts'
import { createEmptySceneDoc } from '../../src/engine/scene/snapshot.ts'
import { createDefaultViewSettings } from '../../src/engine/viewSettings.ts'

function createSnapshot(exposure: number): EngineSnapshot {
  return {
    scene: createEmptySceneDoc(),
    viewSettings: {
      ...createDefaultViewSettings(),
      exposure,
    },
  }
}

function areSnapshotsEqual(left: EngineSnapshot, right: EngineSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

test('EngineHistory collapses nested batches into one committed snapshot', () => {
  const history = new EngineHistory()
  const states = [createSnapshot(1)]
  const captureSnapshot = () => states.at(-1) ?? null

  history.initialize(captureSnapshot())

  history.beginBatch(captureSnapshot)
  states.push(createSnapshot(1.2))

  history.beginBatch(captureSnapshot)
  states.push(createSnapshot(1.4))
  const innerCommitted = history.endBatch(captureSnapshot, areSnapshotsEqual)
  const outerCommitted = history.endBatch(captureSnapshot, areSnapshotsEqual)

  assert.equal(innerCommitted, false)
  assert.equal(outerCommitted, true)
  assert.equal(history.currentIndex, 1)
  assert.equal(history.totalStates, 2)
  assert.equal(history.getUndoDepth(), 1)
})

test('EngineHistory ignores no-op transforms and commits changed transforms once', () => {
  const history = new EngineHistory()
  let current = createSnapshot(1)

  history.initialize(current)
  history.beginTransform(() => current)
  assert.equal(history.endTransform(() => current, areSnapshotsEqual), false)
  assert.equal(history.totalStates, 1)

  history.beginTransform(() => current)
  current = createSnapshot(1.5)
  assert.equal(history.endTransform(() => current, areSnapshotsEqual), true)
  assert.equal(history.totalStates, 2)
  assert.equal(history.getUndoDepth(), 1)
})

test('EngineHistory caps retained snapshots at 100 states', () => {
  const history = new EngineHistory()
  let current = createSnapshot(0)

  history.initialize(current)

  for (let index = 1; index <= 120; index += 1) {
    current = createSnapshot(index)
    history.commitCurrentSnapshot(() => current, areSnapshotsEqual)
  }

  assert.equal(history.totalStates, 100)
  assert.equal(history.currentIndex, 99)
  assert.equal(history.getUndoDepth(), 99)
  assert.equal(history.getRedoDepth(), 0)
})

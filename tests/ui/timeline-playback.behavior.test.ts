import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceTimelinePlayback,
  clampTimelineTime,
  getPlaybackStartTime,
  getTimelineScrubberStep,
} from '../../src/ui/panels/timelinePlayback.ts'

test('clampTimelineTime keeps playback time inside the shot bounds', () => {
  assert.equal(clampTimelineTime(-0.5, 5), 0)
  assert.equal(clampTimelineTime(2.25, 5), 2.25)
  assert.equal(clampTimelineTime(7.5, 5), 5)
})

test('getPlaybackStartTime restarts from zero when play is pressed at the shot end', () => {
  assert.equal(getPlaybackStartTime(5, 5), 0)
  assert.equal(getPlaybackStartTime(2.5, 5), 2.5)
})

test('advanceTimelinePlayback stops cleanly at the end of the shot', () => {
  assert.deepEqual(
    advanceTimelinePlayback({
      startTimeSeconds: 1.25,
      elapsedSeconds: 0.5,
      durationSeconds: 5,
    }),
    {
      timeSeconds: 1.75,
      completed: false,
    },
  )

  assert.deepEqual(
    advanceTimelinePlayback({
      startTimeSeconds: 4.8,
      elapsedSeconds: 0.5,
      durationSeconds: 5,
    }),
    {
      timeSeconds: 5,
      completed: true,
    },
  )
})

test('getTimelineScrubberStep uses frame duration when fps is available', () => {
  assert.equal(getTimelineScrubberStep(30), 1 / 30)
  assert.equal(getTimelineScrubberStep(0), 0.01)
})

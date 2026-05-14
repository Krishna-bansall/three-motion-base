export interface TimelinePlaybackStep {
  timeSeconds: number
  completed: boolean
}

export function clampTimelineTime(timeSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(timeSeconds)) {
    return 0
  }

  const duration = normalizeDuration(durationSeconds)
  return Math.min(Math.max(timeSeconds, 0), duration)
}

export function getPlaybackStartTime(timeSeconds: number, durationSeconds: number): number {
  const duration = normalizeDuration(durationSeconds)
  const clampedTime = clampTimelineTime(timeSeconds, duration)

  if (duration === 0) {
    return 0
  }

  return clampedTime >= duration ? 0 : clampedTime
}

export function advanceTimelinePlayback(params: {
  startTimeSeconds: number
  elapsedSeconds: number
  durationSeconds: number
}): TimelinePlaybackStep {
  const duration = normalizeDuration(params.durationSeconds)
  if (duration === 0) {
    return {
      timeSeconds: 0,
      completed: true,
    }
  }

  const nextTime = clampTimelineTime(
    params.startTimeSeconds + Math.max(params.elapsedSeconds, 0),
    duration,
  )

  return {
    timeSeconds: nextTime,
    completed: nextTime >= duration,
  }
}

export function getTimelineScrubberStep(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) {
    return 0.01
  }

  return 1 / fps
}

function normalizeDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0
  }

  return durationSeconds
}

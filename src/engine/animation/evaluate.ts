import { cloneSceneDoc } from '../scene/snapshot'
import { eulerToQuaternionTuple, quaternionToEulerXYZ } from '../scene/transformMath'
import type { SceneDoc, Vec3 } from '../scene/types'
import type {
  MotionLayer,
  MotionSequenceItem,
  ProjectDoc,
  SequenceRow,
} from '../project/types'

interface NodeDelta {
  t: Vec3
  r: Vec3
}

interface LightDelta {
  intensity: number
}

export function evaluateActiveShot(
  project: ProjectDoc,
  baseScene: SceneDoc,
  timeSeconds: number,
): SceneDoc {
  const evaluated = cloneSceneDoc(baseScene)
  const activeShot = project.shots[project.activeShotId]
  const nodeDeltas = new Map<string, NodeDelta>()
  const lightDeltas = new Map<string, LightDelta>()

  for (const row of activeShot.sequence.rows) {
    accumulateRow(row, timeSeconds, nodeDeltas, lightDeltas)
  }

  for (const [nodeId, delta] of nodeDeltas.entries()) {
    const baseNode = baseScene.nodes[nodeId]
    const nextNode = evaluated.nodes[nodeId]

    if (!baseNode || !nextNode) continue

    nextNode.t = addVec3(baseNode.t, delta.t)
    const [rx, ry, rz] = quaternionToEulerXYZ(baseNode.r)
    nextNode.r = eulerToQuaternionTuple(rx + delta.r[0], ry + delta.r[1], rz + delta.r[2])
  }

  for (const [nodeId, delta] of lightDeltas.entries()) {
    const baseNode = baseScene.nodes[nodeId]
    const nextNode = evaluated.nodes[nodeId]

    if (!baseNode?.light || !nextNode?.light) continue

    nextNode.light = {
      ...nextNode.light,
      intensity: round3(baseNode.light.intensity + delta.intensity),
    }
  }

  return evaluated
}

function accumulateRow(
  row: SequenceRow,
  timeSeconds: number,
  nodeDeltas: Map<string, NodeDelta>,
  lightDeltas: Map<string, LightDelta>,
): void {
  for (const item of row.items) {
    accumulateItem(item, timeSeconds, nodeDeltas, lightDeltas)
  }

  for (const child of row.children) {
    accumulateRow(child, timeSeconds, nodeDeltas, lightDeltas)
  }
}

function accumulateItem(
  item: MotionSequenceItem,
  timeSeconds: number,
  nodeDeltas: Map<string, NodeDelta>,
  lightDeltas: Map<string, LightDelta>,
): void {
  if (item.kind === 'group') {
    if (!item.enabled) return

    for (const child of item.items) {
      accumulateItem(child, timeSeconds - item.startTimeSeconds, nodeDeltas, lightDeltas)
    }
    return
  }

  accumulateLayer(item, timeSeconds, nodeDeltas, lightDeltas)
}

function accumulateLayer(
  layer: MotionLayer,
  timeSeconds: number,
  nodeDeltas: Map<string, NodeDelta>,
  lightDeltas: Map<string, LightDelta>,
): void {
  if (!layer.enabled) return
  if (timeSeconds < layer.startTimeSeconds) return
  if (layer.durationSeconds <= 0) return

  const localTime = timeSeconds - layer.startTimeSeconds
  const normalizedTime = clamp(localTime / layer.durationSeconds, 0, 1)

  switch (layer.presetId) {
    case 'object-float': {
      const axis = readAxis(layer.parameters.axis, 'y')
      const amplitude = readNumber(layer.parameters.amplitude, 0.35) * layer.strength
      const cycles = readNumber(layer.parameters.cycles, 1)
      addTranslation(nodeDeltas, layer.targetNodeId, axis, amplitude * oscillate(normalizedTime, cycles))
      return
    }
    case 'object-spin':
    case 'object-roundturn': {
      const axis = readAxis(layer.parameters.axis, 'y')
      const revolutions = readNumber(layer.parameters.revolutions, 1) * layer.strength
      addRotation(nodeDeltas, layer.targetNodeId, axis, normalizedTime * revolutions * Math.PI * 2)
      return
    }
    case 'camera-dolly-in': {
      const distance = readNumber(layer.parameters.distance, 1.25) * layer.strength
      addTranslation(nodeDeltas, layer.targetNodeId, 'z', -distance * normalizedTime)
      return
    }
    case 'camera-orbit':
    case 'camera-roundturn': {
      const revolutions = readNumber(layer.parameters.revolutions, 1) * layer.strength
      addRotation(nodeDeltas, layer.targetNodeId, 'y', normalizedTime * revolutions * Math.PI * 2)
      return
    }
    case 'light-pulse': {
      const multiplier = readNumber(layer.parameters.intensityMultiplier, 0.45) * layer.strength
      const cycles = readNumber(layer.parameters.cycles, 1)
      const intensity = 1.2 * multiplier * oscillate(normalizedTime, cycles)
      addLightIntensity(lightDeltas, layer.targetNodeId, intensity)
      return
    }
    case 'light-sweep': {
      const axis = readAxis(layer.parameters.axis, 'x')
      const distance = readNumber(layer.parameters.distance, 1.2) * layer.strength
      const cycles = readNumber(layer.parameters.cycles, 1)
      addTranslation(nodeDeltas, layer.targetNodeId, axis, distance * oscillate(normalizedTime, cycles))
      return
    }
  }
}

function addTranslation(
  nodeDeltas: Map<string, NodeDelta>,
  nodeId: string,
  axis: 'x' | 'y' | 'z',
  value: number,
): void {
  const delta = getNodeDelta(nodeDeltas, nodeId)
  delta.t[axisIndex(axis)] = round3(delta.t[axisIndex(axis)] + value)
}

function addRotation(
  nodeDeltas: Map<string, NodeDelta>,
  nodeId: string,
  axis: 'x' | 'y' | 'z',
  value: number,
): void {
  const delta = getNodeDelta(nodeDeltas, nodeId)
  delta.r[axisIndex(axis)] = delta.r[axisIndex(axis)] + value
}

function addLightIntensity(lightDeltas: Map<string, LightDelta>, nodeId: string, intensity: number): void {
  const delta = lightDeltas.get(nodeId) ?? { intensity: 0 }
  delta.intensity = round3(delta.intensity + intensity)
  lightDeltas.set(nodeId, delta)
}

function getNodeDelta(nodeDeltas: Map<string, NodeDelta>, nodeId: string): NodeDelta {
  const existing = nodeDeltas.get(nodeId)
  if (existing) return existing

  const created: NodeDelta = {
    t: [0, 0, 0],
    r: [0, 0, 0],
  }
  nodeDeltas.set(nodeId, created)
  return created
}

function oscillate(normalizedTime: number, cycles: number): number {
  return round3(Math.sin(normalizedTime * cycles * Math.PI * 2))
}

function addVec3(left: Vec3, right: Vec3): Vec3 {
  return [
    round3(left[0] + right[0]),
    round3(left[1] + right[1]),
    round3(left[2] + right[2]),
  ]
}

function readNumber(value: MotionLayer['parameters'][string], fallback: number): number {
  return typeof value === 'number' ? value : fallback
}

function readAxis(value: MotionLayer['parameters'][string], fallback: 'x' | 'y' | 'z'): 'x' | 'y' | 'z' {
  return value === 'x' || value === 'y' || value === 'z' ? value : fallback
}

function axisIndex(axis: 'x' | 'y' | 'z'): 0 | 1 | 2 {
  switch (axis) {
    case 'x':
      return 0
    case 'y':
      return 1
    case 'z':
      return 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

import type { Quat } from './types'

export function eulerToQuaternionTuple(
  rx: number,
  ry: number,
  rz: number,
): Quat {
  const halfX = rx * 0.5
  const halfY = ry * 0.5
  const halfZ = rz * 0.5

  const sx = Math.sin(halfX)
  const cx = Math.cos(halfX)
  const sy = Math.sin(halfY)
  const cy = Math.cos(halfY)
  const sz = Math.sin(halfZ)
  const cz = Math.cos(halfZ)

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}

export function quaternionToEulerXYZ([x, y, z, w]: Quat): [number, number, number] {
  const sinrCosp = 2 * (w * x + y * z)
  const cosrCosp = 1 - 2 * (x * x + y * y)
  const rx = Math.atan2(sinrCosp, cosrCosp)

  const sinp = 2 * (w * y - z * x)
  const ry = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

  const sinyCosp = 2 * (w * z + x * y)
  const cosyCosp = 1 - 2 * (y * y + z * z)
  const rz = Math.atan2(sinyCosp, cosyCosp)

  return [rx, ry, rz]
}

export function radiansToDegrees(value: number): number {
  return value * (180 / Math.PI)
}

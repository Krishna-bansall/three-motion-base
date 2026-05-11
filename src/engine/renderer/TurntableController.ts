/** Pointer-driven orbit controller for the model root. */
import * as THREE from 'three'

export interface TurntableOptions {
  /** Rotation speed multiplier. */
  rotationSpeed?: number
  /** Enables momentum after the pointer is released. */
  enableInertia?: boolean
  /** Damping factor applied while momentum decays. */
  inertiaDamping?: number
  /** Enables idle auto-rotation. */
  autoRotate?: boolean
  /** Idle rotation speed in radians per second. */
  autoRotateSpeed?: number
  /** Maximum up/down tilt in radians. */
  maxPolarAngle?: number
}

export class TurntableController {
  private target: THREE.Object3D
  private canvas: HTMLElement
  private isDragging = false
  private prevPointer = { x: 0, y: 0 }
  private velocity = { x: 0, y: 0 }
  private rotationSpeed: number
  private enableInertia: boolean
  private inertiaDamping: number
  private maxPolarAngle: number
  private currentPolarAngle = 0

  autoRotate: boolean
  autoRotateSpeed: number
  enabled = true

  private _onPointerDown: (e: PointerEvent) => void
  private _onPointerMove: (e: PointerEvent) => void
  private _onPointerUp: (e: PointerEvent) => void

  constructor(target: THREE.Object3D, canvas: HTMLElement, options: TurntableOptions = {}) {
    this.target = target
    this.canvas = canvas
    this.rotationSpeed = options.rotationSpeed ?? 0.005
    this.enableInertia = options.enableInertia ?? true
    this.inertiaDamping = options.inertiaDamping ?? 0.92
    this.autoRotate = options.autoRotate ?? false
    this.autoRotateSpeed = options.autoRotateSpeed ?? 0.3
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI / 3

    this._onPointerDown = this.onPointerDown.bind(this)
    this._onPointerMove = this.onPointerMove.bind(this)
    this._onPointerUp = this.onPointerUp.bind(this)

    this.canvas.addEventListener('pointerdown', this._onPointerDown)
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target
    this.currentPolarAngle = target.rotation.x
    this.velocity = { x: 0, y: 0 }
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) return
    this.isDragging = true
    this.prevPointer.x = e.clientX
    this.prevPointer.y = e.clientY
    this.velocity.x = 0
    this.velocity.y = 0
    this.canvas.style.cursor = 'grabbing'
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled || !this.isDragging) return

    const dx = e.clientX - this.prevPointer.x
    const dy = e.clientY - this.prevPointer.y

    this.velocity.x = dx * this.rotationSpeed
    this.velocity.y = dy * this.rotationSpeed

    this.applyRotation(this.velocity.x, this.velocity.y)

    this.prevPointer.x = e.clientX
    this.prevPointer.y = e.clientY
  }

  private onPointerUp(): void {
    this.isDragging = false
    this.canvas.style.cursor = this.enabled ? 'grab' : 'default'
  }

  private applyRotation(deltaX: number, deltaY: number): void {
    this.target.rotation.y += deltaX

    const newPolar = this.currentPolarAngle + deltaY
    const clamped = Math.max(-this.maxPolarAngle, Math.min(this.maxPolarAngle, newPolar))
    this.target.rotation.x = clamped
    this.currentPolarAngle = clamped
  }

  /** Advances inertia and optional idle rotation. */
  update(delta: number): void {
    if (!this.enabled) return

    if (!this.isDragging && this.enableInertia) {
      if (Math.abs(this.velocity.x) > 0.0001 || Math.abs(this.velocity.y) > 0.0001) {
        this.applyRotation(this.velocity.x, this.velocity.y)
        this.velocity.x *= this.inertiaDamping
        this.velocity.y *= this.inertiaDamping
      }
    }

    if (this.autoRotate && !this.isDragging) {
      this.target.rotation.y += this.autoRotateSpeed * delta
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
  }
}

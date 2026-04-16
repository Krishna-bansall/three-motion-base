/**
 * Step 5: TurntableController
 * 
 * Rotates the product root group via pointer drag.
 * No auto-rotate — user controls that via UI settings.
 */
import * as THREE from 'three'

export interface TurntableOptions {
  /** Rotation speed multiplier. Default: 0.005 */
  rotationSpeed?: number
  /** Enable inertia (momentum after release). Default: true */
  enableInertia?: boolean
  /** Inertia damping factor (0–1). Default: 0.92 */
  inertiaDamping?: number
  /** Enable auto-rotate. Default: false */
  autoRotate?: boolean
  /** Auto-rotate speed (rad/s). Default: 0.3 */
  autoRotateSpeed?: number
  /** Max vertical rotation in radians. Default: π/3 (~60°) */
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

  // bound handlers for cleanup
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
    // Y-axis rotation (horizontal drag)
    this.target.rotation.y += deltaX

    // X-axis rotation (vertical drag) — clamped
    const newPolar = this.currentPolarAngle + deltaY
    const clamped = Math.max(-this.maxPolarAngle, Math.min(this.maxPolarAngle, newPolar))
    this.target.rotation.x = clamped
    this.currentPolarAngle = clamped
  }

  /** Call once per frame (in the render loop) */
  update(delta: number): void {
    if (!this.enabled) return

    // Inertia: apply leftover velocity when not dragging
    if (!this.isDragging && this.enableInertia) {
      if (Math.abs(this.velocity.x) > 0.0001 || Math.abs(this.velocity.y) > 0.0001) {
        this.applyRotation(this.velocity.x, this.velocity.y)
        this.velocity.x *= this.inertiaDamping
        this.velocity.y *= this.inertiaDamping
      }
    }

    // Auto-rotate (only when not dragging and user enabled it)
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

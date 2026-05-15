/**
 * TransformWidget — Bottom numeric transform panel with sliders.
 *
 * Reads the tracked object transform from the store and writes
 * precise numeric changes through the EngineAPI. Supports typing,
 * slider scrubbing, and arrow-key nudging.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useEngineStore } from '../store/useEngineStore'
import type { EngineAPI } from '../engine/EngineAPI'

interface TransformWidgetProps {
  engine: EngineAPI
}

type Axis = 0 | 1 | 2
type Vec3 = [number, number, number]

const AXIS_LABELS = ['X', 'Y', 'Z'] as const

const POSITION_RANGE: [number, number] = [-5, 5]
const POSITION_STEP = 0.01
const ROTATION_RANGE: [number, number] = [-180, 180]
const ROTATION_STEP = 0.1
const SCALE_RANGE: [number, number] = [0.01, 5]
const SCALE_STEP = 0.01

type Section = 'position' | 'rotation' | 'scale'

interface SectionDef {
  key: Section
  label: string
  range: [number, number]
  step: number
  suffix: string
  decimalPlaces: number
}

const SECTIONS: SectionDef[] = [
  { key: 'position', label: 'Position', range: POSITION_RANGE, step: POSITION_STEP, suffix: '', decimalPlaces: 3 },
  { key: 'rotation', label: 'Rotation °', range: ROTATION_RANGE, step: ROTATION_STEP, suffix: '', decimalPlaces: 1 },
  { key: 'scale', label: 'Scale', range: SCALE_RANGE, step: SCALE_STEP, suffix: '', decimalPlaces: 3 },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function TransformWidget({ engine }: TransformWidgetProps) {
  const trackedObjectTransform = useEngineStore((s) => s.trackedObjectTransform)
  const trackedObjectNodeId = useEngineStore((s) => s.trackedObjectNodeId)

  const [localPosition, setLocalPosition] = useState<Vec3>([0, 0, 0])
  const [localRotation, setLocalRotation] = useState<Vec3>([0, 0, 0])
  const [localScale, setLocalScale] = useState<Vec3>([1, 1, 1])
  const [editSection, setEditSection] = useState<Section | null>(null)
  const isEditing = editSection !== null

  const trackedRef = useRef(trackedObjectTransform)
  trackedRef.current = trackedObjectTransform

  // Sync local state from store when not actively editing
  useEffect(() => {
    if (isEditing) return
    if (trackedObjectTransform) {
      setLocalPosition(trackedObjectTransform.position)
      setLocalRotation(trackedObjectTransform.rotation)
      setLocalScale(trackedObjectTransform.scale)
    }
  }, [trackedObjectTransform, isEditing])

  const getLocalValues = useCallback((section: Section): Vec3 => {
    switch (section) {
      case 'position': return localPosition
      case 'rotation': return localRotation
      case 'scale': return localScale
    }
  }, [localPosition, localRotation, localScale])

  const applyToEngine = useCallback(
    (section: Section, values: Vec3, commit: boolean) => {
      if (!trackedObjectNodeId) return

      const p = section === 'position' ? values : trackedRef.current?.position ?? [0, 0, 0]
      const r = section === 'rotation' ? values : trackedRef.current?.rotation ?? [0, 0, 0]
      const s = section === 'scale' ? values : trackedRef.current?.scale ?? [1, 1, 1]

      const tx: Record<string, number> = {}

      if (section === 'position') {
        tx.px = p[0]; tx.py = p[1]; tx.pz = p[2]
      }
      if (section === 'rotation') {
        tx.rx = r[0]; tx.ry = r[1]; tx.rz = r[2]
      }
      if (section === 'scale') {
        tx.sx = s[0]; tx.sy = s[1]; tx.sz = s[2]
      }

      if (commit) {
        engine.setTransform(trackedObjectNodeId, tx)
      } else {
        engine.previewTransform(trackedObjectNodeId, tx)
      }
    },
    [engine, trackedObjectNodeId],
  )

  const handleSliderChange = useCallback(
    (section: Section, axis: Axis, value: number) => {
      setEditSection(section)
      const values: Vec3 = [...getLocalValues(section)]
      const clamped = clamp(value, ...SECTIONS.find((s) => s.key === section)!.range)
      values[axis] = clamped

      switch (section) {
        case 'position': setLocalPosition(values); break
        case 'rotation': setLocalRotation(values); break
        case 'scale': setLocalScale(values); break
      }

      applyToEngine(section, values, false)
    },
    [getLocalValues, applyToEngine],
  )

  const handleSliderCommit = useCallback(
    (section: Section) => {
      const values = getLocalValues(section)
      engine.clearPreviewTransform()
      applyToEngine(section, values, true)
      setEditSection(null)
    },
    [getLocalValues, applyToEngine, engine],
  )

  const handleInputChange = useCallback(
    (section: Section, axis: Axis, raw: string) => {
      const parsed = parseFloat(raw)
      if (isNaN(parsed)) return

      setEditSection(section)
      const secDef = SECTIONS.find((s) => s.key === section)!
      const clamped = clamp(parsed, secDef.range[0], secDef.range[1])

      const values: Vec3 = [...getLocalValues(section)]
      values[axis] = clamped

      switch (section) {
        case 'position': setLocalPosition(values); break
        case 'rotation': setLocalRotation(values); break
        case 'scale': setLocalScale(values); break
      }

      applyToEngine(section, values, false)
    },
    [getLocalValues, applyToEngine],
  )

  const handleInputCommit = useCallback(
    (section: Section, axis: Axis) => {
      const secDef = SECTIONS.find((s) => s.key === section)!
      const values = getLocalValues(section)
      const rounded = roundTo(values[axis], secDef.decimalPlaces)

      const next: Vec3 = [...values]
      next[axis] = rounded

      switch (section) {
        case 'position': setLocalPosition(next); break
        case 'rotation': setLocalRotation(next); break
        case 'scale': setLocalScale(next); break
      }

      engine.clearPreviewTransform()
      applyToEngine(section, next, true)
      setEditSection(null)
    },
    [getLocalValues, applyToEngine, engine],
  )

  const formatValue = useCallback((value: number, decimals: number): string => {
    return value.toFixed(decimals)
  }, [])

  if (!trackedObjectTransform || !trackedObjectNodeId) {
    return null
  }

  return (
    <div className="transform-widget" role="region" aria-label="Transform controls">
      {SECTIONS.map((section) => {
        const values = getLocalValues(section.key)
        return (
          <div key={section.key} className="tw-section">
            <span className="tw-section-label">{section.label}</span>
            <div className="tw-axes">
              {AXIS_LABELS.map((label, axisIdx) => {
                const axis = axisIdx as Axis
                const axisClass = `tw-axis-${label.toLowerCase()}`
                return (
                  <div key={label} className={`tw-axis ${axisClass}`}>
                    <label className="tw-axis-label" htmlFor={`tw-${section.key}-${label}`}>
                      {label}
                    </label>
                    <input
                      id={`tw-${section.key}-${label}`}
                      className="tw-input"
                      type="number"
                      step={section.step}
                      min={section.range[0]}
                      max={section.range[1]}
                      value={formatValue(values[axis], section.decimalPlaces)}
                      onChange={(e) => handleInputChange(section.key, axis, e.target.value)}
                      onBlur={() => handleInputCommit(section.key, axis)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleInputCommit(section.key, axis)
                        }
                      }}
                    />
                    <input
                      className="tw-slider"
                      type="range"
                      step={section.step}
                      min={section.range[0]}
                      max={section.range[1]}
                      value={values[axis]}
                      onChange={(e) => handleSliderChange(section.key, axis, parseFloat(e.target.value))}
                      onMouseUp={() => handleSliderCommit(section.key)}
                      onTouchEnd={() => handleSliderCommit(section.key)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

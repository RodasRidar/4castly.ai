import type { ReactNode } from 'react'
import { Button } from '../atoms/Button'
import { SegmentedControl } from '../atoms/SegmentedControl'
import { NumberStepper } from '../molecules/NumberStepper'
import { Drawer } from './Drawer'

export interface ParametersValues {
  /** Horizon in weeks, as the option value ("8" | "12" | "24"). */
  horizon: string
  granularity: string
  /** Replenishment lead time. */
  leadTime: number
  /** Critical coverage threshold. */
  threshold: number
  /** Assistant answer style ("brief" | "detailed"). */
  style: string
}

export interface SegmentedCopy {
  label: string
  options: { value: string; label: string }[]
}

export interface StepperCopy {
  label: string
  decrementLabel: string
  incrementLabel: string
  unit?: string
  min?: number
  max?: number
}

export interface ParametersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  values: ParametersValues
  onChange: <K extends keyof ParametersValues>(field: K, value: ParametersValues[K]) => void
  horizon: SegmentedCopy
  granularity: SegmentedCopy
  leadTime: StepperCopy
  threshold: StepperCopy
  style: SegmentedCopy
  recalculateLabel: string
  onRecalculate: () => void
  /** A recalculation is running: controls are locked and the button shows its busy state. */
  recalculating?: boolean
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-md font-medium text-ink">{label}</span>
      {children}
    </div>
  )
}

export function ParametersDrawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  values,
  onChange,
  horizon,
  granularity,
  leadTime,
  threshold,
  style,
  recalculateLabel,
  onRecalculate,
  recalculating,
}: ParametersDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel}>
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <fieldset disabled={recalculating} className="m-0 flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto border-0 p-0">
          <Field label={horizon.label}>
            <SegmentedControl aria-label={horizon.label} options={horizon.options} value={values.horizon} onValueChange={(v) => onChange('horizon', v)} />
          </Field>
          <Field label={granularity.label}>
            <SegmentedControl
              aria-label={granularity.label}
              options={granularity.options}
              value={values.granularity}
              onValueChange={(v) => onChange('granularity', v)}
            />
          </Field>
          <Field label={leadTime.label}>
            <NumberStepper {...leadTime} value={values.leadTime} onChange={(v) => onChange('leadTime', v)} disabled={recalculating} />
          </Field>
          <Field label={threshold.label}>
            <NumberStepper {...threshold} value={values.threshold} onChange={(v) => onChange('threshold', v)} disabled={recalculating} />
          </Field>
          <Field label={style.label}>
            <SegmentedControl aria-label={style.label} options={style.options} value={values.style} onValueChange={(v) => onChange('style', v)} />
          </Field>
        </fieldset>
        <Button onClick={onRecalculate} disabled={recalculating} loading={recalculating} className="w-full">
          {recalculateLabel}
        </Button>
      </div>
    </Drawer>
  )
}

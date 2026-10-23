import { cn } from '../../lib/cn'
import { Button } from '../atoms/Button'
import { AnswerChips, type AnswerChipsProps } from '../molecules/AnswerChips'

export interface ClarificationQuestion {
  /** The question text; also the accessible name of its answer group. */
  label: string
  options: AnswerChipsProps['options']
  other?: AnswerChipsProps['other']
}

export interface ClarificationCardProps {
  title?: string
  leadTime: ClarificationQuestion
  leadTimeValue: string | null
  onLeadTimeChange: (value: string) => void
  stockout: ClarificationQuestion
  stockoutValue: string | null
  onStockoutChange: (value: string) => void
  /** The stockout question only appears when the file has no stock column. */
  showStockoutQuestion?: boolean
  calculateLabel: string
  skipLabel: string
  onCalculate: () => void
  onSkip: () => void
  /** Calculation requested: locks answers and shows the busy state. */
  submitting?: boolean
  className?: string
}

const answered = (v: string | null) => !!v && v.trim() !== ''

export function ClarificationCard({
  title,
  leadTime,
  leadTimeValue,
  onLeadTimeChange,
  stockout,
  stockoutValue,
  onStockoutChange,
  showStockoutQuestion = false,
  calculateLabel,
  skipLabel,
  onCalculate,
  onSkip,
  submitting,
  className,
}: ClarificationCardProps) {
  const ready = answered(leadTimeValue) && (!showStockoutQuestion || answered(stockoutValue))
  return (
    <section className={cn('flex flex-col gap-5 rounded-lg border border-hairline bg-elevated p-5', className)}>
      {title && <h2 className="text-body-lg font-medium text-ink">{title}</h2>}
      <div className="flex flex-col gap-2">
        <p className="text-body-md text-ink" aria-hidden="true">
          {leadTime.label}
        </p>
        <AnswerChips
          label={leadTime.label}
          options={leadTime.options}
          other={leadTime.other}
          value={leadTimeValue}
          onChange={onLeadTimeChange}
          disabled={submitting}
        />
      </div>
      {showStockoutQuestion && (
        <div className="flex flex-col gap-2">
          <p className="text-body-md text-ink" aria-hidden="true">
            {stockout.label}
          </p>
          <AnswerChips
            label={stockout.label}
            options={stockout.options}
            other={stockout.other}
            value={stockoutValue}
            onChange={onStockoutChange}
            disabled={submitting}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onCalculate} disabled={!ready || submitting} loading={submitting}>
          {calculateLabel}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={submitting}>
          {skipLabel}
        </Button>
      </div>
    </section>
  )
}

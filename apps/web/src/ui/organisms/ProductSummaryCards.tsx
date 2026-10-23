import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { DateValue } from '../atoms/DateValue'
import { Icon } from '../atoms/Icon'
import { NumberValue } from '../atoms/NumberValue'
import { Skeleton } from '../atoms/Skeleton'
import { VisuallyHidden } from '../atoms/VisuallyHidden'
import { NumberStepper } from '../molecules/NumberStepper'
import { ReliabilityBadge, type ReliabilityLevel } from '../molecules/ReliabilityBadge'
import { StatLine } from '../molecules/StatLine'

interface StepperConfig {
  label: string
  value: number
  unit: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  decrementLabel: string
  incrementLabel: string
}

export interface ProductSummaryCardsProps {
  state: 'loading' | 'populated' | 'no-risk'
  /** Screen-reader text while loading. */
  loadingLabel: string
  stockout: {
    /** e.g. "El stock se acaba el". */
    title: string
    date: Date | null
    description: string
    /** Shown instead of the date in the `no-risk` state. */
    noRiskTitle: string
    noRiskBody: string
  }
  purchase: {
    title: string
    quantityLabel: string
    quantity: number | null
    quantityUnit: string
    buyBeforeLabel: string
    buyBefore: Date | null
    leadTime: StepperConfig
    coverage: StepperConfig
    /** Shown instead of the quantity in the `no-risk` state. */
    noPurchaseText: string
  }
  reliability: {
    title: string
    level: ReliabilityLevel
    badgeLabel: string
    /** Business-language explanation. */
    explanation: string
    /** Disclosure button text, e.g. "Ver detalle técnico". */
    detailToggleLabel: string
    detail: ReactNode
  }
  className?: string
}

function Card({ title, children, busy }: { title: string; children: ReactNode; busy?: boolean }) {
  const id = useId()
  return (
    <section aria-labelledby={id} aria-busy={busy || undefined} className="flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-elevated p-4">
      <h3 id={id} className="text-body-md text-mute">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stepper({ config }: { config: StepperConfig }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-body-md text-mute">{config.label}</span>
      <NumberStepper
        label={config.label}
        value={config.value}
        unit={config.unit}
        min={config.min}
        max={config.max}
        step={config.step}
        onChange={config.onChange}
        decrementLabel={config.decrementLabel}
        incrementLabel={config.incrementLabel}
      />
    </div>
  )
}

export function ProductSummaryCards({ state, loadingLabel, stockout, purchase, reliability, className }: ProductSummaryCardsProps) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const grid = cn('grid grid-cols-1 gap-3 lg:grid-cols-3', className)

  if (state === 'loading') {
    return (
      <div className={grid} aria-busy="true">
        {[stockout.title, purchase.title, reliability.title].map((t) => (
          <Card key={t} title={t} busy>
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="w-3/4" />
            <Skeleton className="w-2/3" />
          </Card>
        ))}
        <VisuallyHidden>{loadingLabel}</VisuallyHidden>
      </div>
    )
  }

  const noRisk = state === 'no-risk'
  return (
    <div className={grid}>
      <Card title={stockout.title}>
        {noRisk || !stockout.date ? (
          <>
            <p className="text-heading-md text-ink">{stockout.noRiskTitle}</p>
            <p className="text-body-md text-mute">{stockout.noRiskBody}</p>
          </>
        ) : (
          <>
            <p className="text-heading-md text-ink">
              <DateValue date={stockout.date} timeZone="UTC" />
            </p>
            <p className="text-body-md text-mute">{stockout.description}</p>
          </>
        )}
      </Card>

      <Card title={purchase.title}>
        {noRisk ? (
          <p className="text-body-md text-mute">{purchase.noPurchaseText}</p>
        ) : (
          <div className="flex flex-col gap-1">
            <StatLine label={purchase.quantityLabel} value={<NumberValue value={purchase.quantity} unit={purchase.quantityUnit} className="text-heading-md" />} />
            <StatLine label={purchase.buyBeforeLabel} value={purchase.buyBefore ? <DateValue date={purchase.buyBefore} timeZone="UTC" /> : <span className="font-mono text-mute">—</span>} />
          </div>
        )}
        <Stepper config={purchase.leadTime} />
        <Stepper config={purchase.coverage} />
      </Card>

      <Card title={reliability.title}>
        <div>
          <ReliabilityBadge level={reliability.level} label={reliability.badgeLabel} />
        </div>
        <p className="text-body-md text-mute">{reliability.explanation}</p>
        <div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md text-body-sm text-ink underline underline-offset-[3px]"
          >
            {reliability.detailToggleLabel}
            <Icon icon={ChevronDown} size="sm" className={cn(open && 'rotate-180')} />
          </button>
        </div>
        <div id={detailId} className="text-body-sm text-body">
          {open && reliability.detail}
        </div>
      </Card>
    </div>
  )
}

import { cn } from '../../lib/cn'
import type { SelectOption } from '../atoms/Select'
import { FilterSelect } from '../molecules/FilterSelect'
import { FocusChip } from '../molecules/FocusChip'
import { SearchField } from '../molecules/SearchField'

interface FilterConfig {
  label: string
  options: SelectOption[]
  value: string
  onValueChange: (value: string) => void
}

export interface ResultsFiltersProps {
  search: {
    value: string
    onValueChange: (value: string) => void
    /** Accessible name of the search input. */
    label: string
    placeholder?: string
    clearLabel: string
  }
  /** Omitted when risk cannot be known (the file had no stock). */
  risk?: FilterConfig
  abc: FilterConfig
  /** Present only while a focus (e.g. chat-driven subset) is active. */
  focus?: { countText: string; resetLabel: string; onReset: () => void }
  /** Accessible name of the filter group. */
  groupLabel?: string
  className?: string
}

export function ResultsFilters({ search, risk, abc, focus, groupLabel, className }: ResultsFiltersProps) {
  return (
    <div role="group" aria-label={groupLabel} className={cn('flex flex-wrap items-center gap-3', className)}>
      <SearchField
        aria-label={search.label}
        placeholder={search.placeholder}
        value={search.value}
        onValueChange={search.onValueChange}
        clearLabel={search.clearLabel}
        className="w-full sm:w-72"
      />
      {risk && <FilterSelect {...risk} />}
      <FilterSelect {...abc} />
      {focus && <FocusChip {...focus} />}
    </div>
  )
}

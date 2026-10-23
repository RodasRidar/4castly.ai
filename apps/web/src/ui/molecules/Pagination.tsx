import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from '../atoms/IconButton'

export interface PaginationProps {
  page: number
  total: number
  /** Visible and announced text for the current page, e.g. "Página 2 de 5". */
  pageText: string
  /** Accessible name of the nav landmark. */
  label: string
  prevLabel: string
  nextLabel: string
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, total, pageText, label, prevLabel, nextLabel, onPageChange, className }: PaginationProps) {
  return (
    <nav aria-label={label} className={cn('flex items-center gap-2', className)}>
      <IconButton label={prevLabel} icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
      <span aria-current="page" className="text-body-sm text-body">
        {pageText}
      </span>
      <IconButton label={nextLabel} icon={ChevronRight} disabled={page >= total} onClick={() => onPageChange(page + 1)} />
    </nav>
  )
}

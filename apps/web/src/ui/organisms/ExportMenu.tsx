import { ChevronDown, Download } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '../atoms/Button'
import { MenuItem } from '../molecules/MenuItem'

export interface ExportMenuProps {
  triggerLabel: string
  allLabel: string
  selectionLabel: string
  productLabel: string
  /** Each item is shown only when its handler is passed. */
  onExportAll?: () => void
  onExportSelection?: () => void
  onExportProduct?: () => void
  /** Nothing selected: the selection item stays visible but disabled. */
  selectionDisabled?: boolean
  disabled?: boolean
  className?: string
}

export function ExportMenu({
  triggerLabel,
  allLabel,
  selectionLabel,
  productLabel,
  onExportAll,
  onExportSelection,
  onExportProduct,
  selectionDisabled,
  disabled,
  className,
}: ExportMenuProps) {
  if (!onExportAll && !onExportSelection && !onExportProduct) return null
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" disabled={disabled} className={className} iconLeft={<Download size={16} aria-hidden="true" />} iconRight={<ChevronDown size={14} aria-hidden="true" />}>
          {triggerLabel}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-hairline bg-elevated p-1 shadow-popover"
        >
          {onExportAll && (
            <DropdownMenu.Item asChild onSelect={onExportAll}>
              <MenuItem label={allLabel} />
            </DropdownMenu.Item>
          )}
          {onExportSelection && (
            <DropdownMenu.Item asChild disabled={selectionDisabled} onSelect={onExportSelection}>
              <MenuItem label={selectionLabel} disabled={selectionDisabled} />
            </DropdownMenu.Item>
          )}
          {onExportProduct && (
            <DropdownMenu.Item asChild onSelect={onExportProduct}>
              <MenuItem label={productLabel} />
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

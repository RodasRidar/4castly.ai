import { Archive, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useRef, useState } from 'react'
import { Button } from '../atoms/Button'
import { IconButton } from '../atoms/IconButton'
import { MenuItem } from '../molecules/MenuItem'
import { Dialog } from './Dialog'

export interface ConversationMenuProps {
  triggerLabel: string
  pinned?: boolean
  pinLabel: string
  unpinLabel: string
  renameLabel: string
  archiveLabel: string
  deleteLabel: string
  confirmTitle: string
  confirmDescription: string
  /** Label of the destructive confirm button. */
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  onPin: () => void
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}

export function ConversationMenu({
  triggerLabel,
  pinned = false,
  pinLabel,
  unpinLabel,
  renameLabel,
  archiveLabel,
  deleteLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onPin,
  onRename,
  onArchive,
  onDelete,
}: ConversationMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingConfirm = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton ref={trigger} label={triggerLabel} icon={MoreHorizontal} size="sm" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            onCloseAutoFocus={(e) => {
              // Open the dialog only after the menu has released focus, so the dialog remembers the trigger as its opener.
              if (pendingConfirm.current) {
                pendingConfirm.current = false
                e.preventDefault()
                trigger.current?.focus()
                setConfirmOpen(true)
              }
            }}
            className="z-50 min-w-48 rounded-lg border border-hairline bg-elevated p-1 shadow-popover"
          >
            <DropdownMenu.Item asChild onSelect={onPin}>
              <MenuItem label={pinned ? unpinLabel : pinLabel} icon={pinned ? PinOff : Pin} />
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild onSelect={onRename}>
              <MenuItem label={renameLabel} icon={Pencil} />
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild onSelect={onArchive}>
              <MenuItem label={archiveLabel} icon={Archive} />
            </DropdownMenu.Item>
            <DropdownMenu.Item
              asChild
              onSelect={() => {
                pendingConfirm.current = true
              }}
            >
              <MenuItem label={deleteLabel} icon={Trash2} danger />
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title={confirmTitle} description={confirmDescription} closeLabel={closeLabel}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger-text"
            onClick={() => {
              setConfirmOpen(false)
              onDelete()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

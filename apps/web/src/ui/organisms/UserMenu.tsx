import { Settings } from 'lucide-react'
import { useId } from 'react'
import { Avatar } from '../atoms/Avatar'
import { Button } from '../atoms/Button'
import { Divider } from '../atoms/Divider'
import { Icon } from '../atoms/Icon'
import { SegmentedControl } from '../atoms/SegmentedControl'
import { Select } from '../atoms/Select'
import { UserCard } from '../molecules/UserCard'
import { Popover } from './Popover'

export type ThemeValue = 'light' | 'dark' | 'system'

export interface UserMenuProps {
  user: { name: string; email: string; company: string }
  /** Accessible name of the popover. */
  label: string
  /** Avatar-only trigger for the collapsed sidebar. Requires `triggerLabel`. */
  compact?: boolean
  triggerLabel?: string
  settingsLabel: string
  settingsHref: string
  themeLabel: string
  theme: ThemeValue
  themeOptions: { value: ThemeValue; label: string }[]
  onThemeChange: (theme: ThemeValue) => void
  languageLabel: string
  language: string
  languageOptions: { value: string; label: string }[]
  onLanguageChange: (language: string) => void
  logoutLabel: string
  onLogout: () => void
}

const isTheme = (v: string): v is ThemeValue => v === 'light' || v === 'dark' || v === 'system'

export function UserMenu({
  user,
  label,
  compact,
  triggerLabel,
  settingsLabel,
  settingsHref,
  themeLabel,
  theme,
  themeOptions,
  onThemeChange,
  languageLabel,
  language,
  languageOptions,
  onLanguageChange,
  logoutLabel,
  onLogout,
}: UserMenuProps) {
  const langId = useId()
  const trigger = compact ? (
    <button type="button" aria-label={triggerLabel} className="flex size-9 items-center justify-center rounded-md hover:bg-selected">
      <span aria-hidden="true">
        <Avatar name={user.name} />
      </span>
    </button>
  ) : (
    <UserCard name={user.name} company={user.company} />
  )
  return (
    <Popover trigger={trigger} label={label} side={compact ? 'right' : 'top'} className="w-72">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 px-2 pt-1">
          <span aria-hidden="true">
            <Avatar name={user.name} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-md font-medium text-ink">{user.name}</span>
            <span className="truncate text-body-sm text-mute">{user.email}</span>
            <span className="truncate text-body-sm text-mute">{user.company}</span>
          </div>
        </div>
        <Divider />
        <a
          href={settingsHref}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-md text-ink hover:bg-selected"
        >
          <Icon icon={Settings} />
          {settingsLabel}
        </a>
        <div className="flex items-center justify-between gap-3 px-2">
          <span className="text-body-md text-ink">{themeLabel}</span>
          <SegmentedControl
            aria-label={themeLabel}
            options={themeOptions}
            value={theme}
            onValueChange={(v) => {
              if (isTheme(v)) onThemeChange(v)
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-2">
          <label htmlFor={langId} className="text-body-md text-ink">
            {languageLabel}
          </label>
          <Select id={langId} className="w-36" options={languageOptions} value={language} onValueChange={onLanguageChange} />
        </div>
        <Divider />
        <Button variant="danger-text" className="w-full justify-start" onClick={onLogout}>
          {logoutLabel}
        </Button>
      </div>
    </Popover>
  )
}

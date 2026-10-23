import { useTheme } from '../theme/useTheme'
import type { ThemePreference } from '../theme/themeStore'

const surfaces = ['canvas', 'elevated', 'selected'] as const
const swatches = [
  ['ink', 'bg-ink'],
  ['body', 'bg-body'],
  ['mute', 'bg-mute'],
  ['faint', 'bg-faint'],
  ['hairline', 'bg-hairline'],
  ['primary', 'bg-primary'],
] as const
const surfaceClass = { canvas: 'bg-canvas', elevated: 'bg-elevated', selected: 'bg-selected' } as const
const statuses = [
  { name: 'Crítico', box: 'bg-critical-bg border-critical-border text-critical' },
  { name: 'Medio', box: 'bg-medium-bg border-medium-border text-medium' },
  { name: 'Óptimo', box: 'bg-optimal-bg border-optimal-border text-optimal' },
] as const
const typeScale = [
  ['display', 'text-display'],
  ['heading-lg', 'text-heading-lg'],
  ['heading-md', 'text-heading-md'],
  ['body-lg', 'text-body-lg'],
  ['body-md', 'text-body-md'],
  ['body-sm', 'text-body-sm'],
] as const
const preferences: ThemePreference[] = ['light', 'dark', 'system']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`sec-${title}`}>
      <h2 id={`sec-${title}`} className="text-heading-md text-ink font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Dev-only sheet: tokens, type scale and control states in the active theme. */
export function TokensPage() {
  const { preference, setPreference } = useTheme()
  return (
    <main className="bg-canvas text-body mx-auto flex max-w-[960px] flex-col gap-10 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-heading-lg text-ink font-semibold">Design tokens</h1>
        <div role="radiogroup" aria-label="Theme" className="border-hairline bg-elevated flex rounded-md border p-0.5">
          {preferences.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preference === p}
              onClick={() => setPreference(p)}
              className={`text-body-md rounded px-3 py-1 ${preference === p ? 'bg-selected text-ink font-medium' : 'text-body'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      <Section title="Surfaces and text">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {surfaces.map((s) => (
            <div key={s} className={`${surfaceClass[s]} border-hairline flex flex-col gap-1 rounded-lg border p-4`}>
              <span className="text-body-sm text-mute">{s}</span>
              <span className="text-body-md text-ink font-medium">ink on {s}</span>
              <span className="text-body-md text-body">body on {s}</span>
              <span className="text-body-sm text-mute">mute on {s}</span>
            </div>
          ))}
        </div>
        <ul className="flex flex-wrap gap-3">
          {swatches.map(([name, cls]) => (
            <li key={name} className="flex items-center gap-2">
              <span className={`${cls} border-hairline size-6 rounded border`} aria-hidden="true" />
              <span className="text-body-sm text-body">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Status (risk only)">
        <div className="flex flex-wrap gap-3">
          {statuses.map((s) => (
            <span key={s.name} className={`${s.box} text-body-md rounded-full border px-3 py-1 font-medium`}>
              {s.name}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        <div className="flex flex-col gap-2">
          {typeScale.map(([name, cls]) => (
            <p key={name} className={`${cls} text-ink`}>
              {name} — Geist 1,234 unidades
            </p>
          ))}
          <p className="font-mono text-body-md text-ink">Geist Mono — 1,234.5 u · 280–310 u · kardex.xlsx · 2,4 MB</p>
        </div>
      </Section>

      <Section title="Control states">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="bg-primary text-primary-fg text-body-md rounded-md px-4 py-2 font-medium">
            Primary
          </button>
          <button type="button" className="border-hairline bg-elevated text-ink text-body-md rounded-md border px-4 py-2 font-medium">
            Secondary
          </button>
          <button type="button" disabled className="border-hairline text-faint text-body-md rounded-md border px-4 py-2 font-medium">
            Disabled
          </button>
          <a href="#links" className="text-ink text-body-md underline underline-offset-4 decoration-1">
            Text link
          </a>
          <input aria-label="Sample input" placeholder="Input" className="border-hairline bg-elevated text-ink text-body-md rounded-md border px-3 py-2" />
        </div>
        <div className="bg-elevated border-hairline shadow-popover text-body-md text-body w-fit rounded-lg border p-4">
          Popover surface (the only elevated level)
        </div>
        <p className="text-body-sm text-mute">Tab through the controls to see the 2 px ink focus ring.</p>
      </Section>
    </main>
  )
}

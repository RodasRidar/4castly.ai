import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'heading-lg', 'heading-md', 'body-lg', 'body-md', 'body-sm'],
      color: [
        'canvas', 'elevated', 'selected', 'hairline', 'ink', 'body', 'mute', 'faint', 'primary', 'primary-fg', 'focus',
        'critical', 'critical-accent', 'critical-bg', 'critical-border',
        'medium', 'medium-accent', 'medium-bg', 'medium-border',
        'optimal', 'optimal-accent', 'optimal-bg', 'optimal-border', 'scrim',
      ],
      shadow: ['popover'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

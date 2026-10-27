import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/atoms/Button'
import { ErrorState } from '../ui/molecules/ErrorState'

interface BoundaryProps {
  children: ReactNode
  /** Rendered instead of the children after a render error. `reset` clears the error and tries again. */
  fallback: (reset: () => void) => ReactNode
}

/** Catches render errors below it (R13). Data failures are handled by each panel; this is for bugs. */
export class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The browser console is the only sink until /v1/client-logs exists (deferred in the plan).
    console.error('Panel render failed', error, info.componentStack)
  }

  private reset = () => this.setState({ failed: false })

  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children
  }
}

/** One panel's boundary: a failure shows the panel's error state, never a blank page. */
export function PanelBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <ErrorBoundary
      fallback={(reset) => (
        <ErrorState
          title={t('common.panelErrorTitle')}
          body={t('common.panelErrorBody')}
          primaryAction={
            <Button variant="secondary" size="sm" onClick={reset}>
              {t('common.retry')}
            </Button>
          }
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

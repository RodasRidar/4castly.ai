import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { ErrorState } from '../../ui/molecules/ErrorState'

/** Router `errorElement`: a render error in one route never blanks the whole shell. */
export function RouteError() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <ErrorState
        title={t('pages.errorTitle')}
        body={t('pages.errorBody')}
        primaryAction={<Button onClick={() => window.location.reload()}>{t('pages.reload')}</Button>}
      />
    </div>
  )
}

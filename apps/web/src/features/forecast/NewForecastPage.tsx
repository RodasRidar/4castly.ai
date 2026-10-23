import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Placeholder } from '../Placeholder'

export function NewForecastPage() {
  const { t } = useTranslation()
  return <Placeholder icon={Upload} title={t('pages.newTitle')} body={t('pages.newBody')} />
}

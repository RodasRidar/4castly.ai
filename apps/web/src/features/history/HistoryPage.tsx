import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Placeholder } from '../Placeholder'

export function HistoryPage() {
  const { t } = useTranslation()
  return <Placeholder icon={History} title={t('pages.historyTitle')} body={t('pages.historyBody')} />
}

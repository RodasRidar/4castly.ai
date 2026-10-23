import { ForecastChart } from './components/ForecastChart'
import { buildMockForecast } from './lib/mockForecast'

const data = buildMockForecast()

function App() {
  return (
    <main className="mx-auto max-w-[960px] p-6">
      <h1 className="text-heading-lg text-ink font-semibold">4castly.ai</h1>
      <p className="text-body-md text-body">
        Demand forecast preview (mock data): history, median forecast and p10-p90 band.
      </p>
      <ForecastChart data={data} />
    </main>
  )
}

export default App

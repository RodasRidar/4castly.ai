import { ForecastChart } from './components/ForecastChart'
import { buildMockForecast } from './lib/mockForecast'

const data = buildMockForecast()

function App() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>4castly.ai</h1>
      <p>Demand forecast preview (mock data): history, median forecast and p10-p90 band.</p>
      <ForecastChart data={data} />
    </main>
  )
}

export default App

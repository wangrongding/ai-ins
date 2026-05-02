import { createRoot } from 'react-dom/client'

function App() {
  return <div style={{ padding: 24 }}>Webpack React test</div>
}

createRoot(document.getElementById('root')!).render(<App />)

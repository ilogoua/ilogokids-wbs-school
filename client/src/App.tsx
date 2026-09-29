import { useEffect, useState } from 'react'
import './App.css'

type HealthResponse = {
  ok: boolean
  project: string
}

function App() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking')

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) throw new Error('Health check failed')

        const health: HealthResponse = await response.json()
        setBackendStatus(health.ok && health.project === 'iLogoKids' ? 'connected' : 'unavailable')
      } catch {
        setBackendStatus('unavailable')
      }
    }

    void checkBackend()
  }, [])

  const statusLabel = {
    checking: 'Checking backend…',
    connected: 'Backend connected',
    unavailable: 'Backend unavailable',
  }[backendStatus]

  return (
    <main className="page">
      <section className="welcome" aria-labelledby="project-title">
        <span className="eyebrow">
          <span className="eyebrow-label">School connections</span>
          <span className="notebook-fragment" aria-hidden="true" />
        </span>
        <h1 id="project-title" aria-label="iLogoKids">
          <span className="wordmark" aria-hidden="true">
            <span className="wordmark-first-i">i</span>
            <span>Logo</span>
            <span className="wordmark-ki">Ki</span>
            <span className="wordmark-ds">ds</span>
          </span>
        </h1>
        <p>A visual map for the connections that make up a school community.</p>
        <div className={`backend-status backend-status--${backendStatus}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {statusLabel}
        </div>
      </section>
    </main>
  )
}

export default App

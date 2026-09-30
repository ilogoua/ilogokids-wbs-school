import { useCallback, useEffect, useRef, useState } from 'react'
import { GraphScene } from './components/GraphScene'
import { InvitePanel } from './components/InvitePanel'
import { RegistrationPage } from './components/RegistrationPage'
import { LoginPage } from './components/LoginPage'
import { demoPresentation, demoTopology } from './components/graph/demoGraph'
import { getNodeLabel, translations } from './i18n/translations'
import type { Language } from './i18n/translations'
import './App.css'

type HealthResponse = { ok: boolean; project: string }

function App() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking')
  const [language, setLanguage] = useState<Language>('de')
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'anonymous' | 'error'>('checking')
  const [sessionRetry, setSessionRetry] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const [topology, setTopology] = useState(demoTopology)
  const [selectedId, setSelectedId] = useState('root')
  const invitationNumber = useRef(0)
  const copy = translations[language]
  const isRegistration = window.location.pathname === '/register' || window.location.pathname === '/register/'
  const labels = Object.fromEntries(topology.map((node) => [
    node.id, getNodeLabel(node.kind, demoPresentation[node.id]?.label, copy),
  ]))

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const controller = new AbortController()
    async function checkSession() {
      try {
        const response = await fetch('/api/session', { credentials: 'same-origin', signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.ok) setAuthStatus('authenticated')
        else if (response.status === 401) setAuthStatus('anonymous')
        else setAuthStatus('error')
      } catch {
        if (!controller.signal.aborted) setAuthStatus('error')
      }
    }
    void checkSession()
    return () => controller.abort()
  }, [sessionRetry])

  function handleLogin() {
    window.history.replaceState(null, '', '/')
    setAuthStatus('authenticated')
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(false)
    try {
      const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Logout failed')
      window.history.replaceState(null, '', '/login')
      setAuthStatus('anonymous')
      setTopology(demoTopology)
      setSelectedId('root')
    } catch {
      setLogoutError(true)
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const checkBackend = async () => {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        if (!response.ok) throw new Error('Health check failed')
        const health: HealthResponse = await response.json()
        if (!controller.signal.aborted) {
          setBackendStatus(health.ok && health.project === 'iLogoKids' ? 'connected' : 'unavailable')
        }
      } catch {
        if (!controller.signal.aborted) setBackendStatus('unavailable')
      }
    }
    void checkBackend()
    return () => controller.abort()
  }, [])

  // Only topology is added. The form never passes its email into the graph.
  const addLocalInvitation = useCallback((parentId: string) => {
    invitationNumber.current += 1
    const id = `pending-${invitationNumber.current}`
    setTopology((current) => [...current, { id, parentId, kind: 'invitation' }])
  }, [])

  return (
    <div className="page" data-backend-status={import.meta.env.DEV ? backendStatus : undefined}>
      <header className="app-header">
        <h1 id="project-title" aria-label="iLogoKids">
          <span className="wordmark" aria-hidden="true">
            <span className="wordmark-first-i">i</span><span>Logo</span><span className="wordmark-ki">Ki</span><span className="wordmark-ds">ds</span>
          </span>
          <svg className="wordmark-accent" viewBox="0 0 42 44" aria-hidden="true">
            <path d="M8 17 12 4 M20 24 31 13 M25 35 39 32" />
          </svg>
        </h1>
        <div className="header-actions">
          <div className="language-switch" role="group" aria-label={copy.language}>
            <button type="button" lang="de" aria-label="Deutsch" aria-pressed={language === 'de'} onClick={() => setLanguage('de')}>DE</button>
            <span aria-hidden="true">|</span>
            <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          {authStatus === 'authenticated' && !isRegistration && (
            <button className="logout-button" type="button" disabled={loggingOut} onClick={() => void handleLogout()}>
              {loggingOut ? copy.auth.loggingOut : copy.auth.logout}
            </button>
          )}
          <button className="icon-button help-button" type="button" aria-label={copy.help} aria-disabled="true"><span aria-hidden="true">?</span></button>
          <button className="icon-button" type="button" aria-label={copy.settings} aria-disabled="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 3 1-1h4l1 4 3-1 3 3-2 3 3 2-1 4-4 0-1 4h-4l-2-3-3 1-3-3 2-3-3-2 1-4 4 0Z" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          </button>
        </div>
      </header>
      {isRegistration ? (
        <main className="registration-workspace" aria-label={copy.registration.title}>
          <RegistrationPage token={new URLSearchParams(window.location.search).get('token') ?? ''} copy={copy} />
        </main>
      ) : authStatus === 'checking' || authStatus === 'error' ? (
        <main className="registration-workspace">
          <section className="invite-panel registration-panel">
            {authStatus === 'checking' ? <p role="status">{copy.auth.checking}</p> : (
              <>
                <p className="registration-error" role="alert">{copy.auth.sessionFailed}</p>
                <button className="send-invite" type="button" onClick={() => {
                  setAuthStatus('checking')
                  setSessionRetry((current) => current + 1)
                }}>{copy.auth.retry}</button>
              </>
            )}
          </section>
        </main>
      ) : authStatus === 'anonymous' ? (
        <main className="registration-workspace" aria-label={copy.auth.title}>
          <LoginPage copy={copy} onLogin={handleLogin} />
        </main>
      ) : (
        <>
          {logoutError && <p className="registration-error" role="alert">{copy.auth.logoutFailed}</p>}
          <main className="workspace" aria-label={copy.title}>
            <GraphScene topology={topology} labels={labels} selectedId={selectedId} onSelectionChange={setSelectedId} copy={copy} />
            <InvitePanel
              key={selectedId}
              parentLabel={labels[selectedId] ?? copy.anonymous}
              onInvite={() => addLocalInvitation(selectedId)}
              copy={copy}
            />
          </main>
        </>
      )}
    </div>
  )
}

export default App

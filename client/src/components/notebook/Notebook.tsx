import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translations } from '../../i18n/translations'
import { PaperNotes } from './PaperNotes'

export function Notebook({ children, invitation, copy }: { children: ReactNode; invitation: ReactNode; copy: Translations }) {
  const [page, setPage] = useState<'schoolyard' | 'history'>('schoolyard')
  const [turn, setTurn] = useState<'forward' | 'back' | null>(null)
  function turnPage(next: 'schoolyard' | 'history') {
    if (next === page) return
    setTurn(next === 'history' ? 'forward' : 'back')
    setPage(next)
  }
  const [inviteOpen, setInviteOpen] = useState(false)
  useEffect(() => {
    document.documentElement.classList.add('notebook-open')
    window.scrollTo(0, 0)
    return () => document.documentElement.classList.remove('notebook-open')
  }, [])
  return (
    <div className="notebook-deck" data-page={page}>
      <svg className="notebook-geometry" viewBox="0 0 180 160" aria-hidden="true">
        <path d="M20 135 80 30l65 105Z M80 30v105 M12 135h150 M28 65a75 75 0 0 1 108 15" />
        <path strokeDasharray="3 5" d="M20 135 145 75 M80 20v125" />
      </svg>
      <div className={`page-turn-leaf${turn ? ` turn-${turn}` : ''}`} aria-hidden="true" onAnimationEnd={() => setTurn(null)} />
      <nav className="notebook-tabs" aria-label={copy.notebook.pages}>
        <button type="button" aria-pressed={page === 'schoolyard'} aria-controls="schoolyard-sheet" onClick={() => turnPage('schoolyard')}>{copy.title}</button>
        <button type="button" aria-pressed={page === 'history'} aria-controls="history-sheet" onClick={() => turnPage('history')}>{copy.notebook.history}</button>
      </nav>
      <section id="schoolyard-sheet" className={`notebook-sheet${page === 'schoolyard' ? ' is-current' : ''}`}
        aria-label={copy.title} aria-hidden={page !== 'schoolyard'} inert={page !== 'schoolyard'}>
        {children}
        <PaperNotes active={page === 'schoolyard'} copy={copy} />
        <aside className="notebook-invitation">
          <button className="invitation-tab" type="button" aria-expanded={inviteOpen} aria-controls="notebook-invite" onClick={() => setInviteOpen(value => !value)}>{copy.inviteTitle}</button>
          <div id="notebook-invite" className="invitation-pocket" hidden={!inviteOpen}>{invitation}</div>
        </aside>
        <span className="sheet-number" aria-hidden="true">1</span>
      </section>
      <section id="history-sheet" className={`notebook-sheet history-sheet${page === 'history' ? ' is-current' : ''}`}
        aria-label={copy.notebook.history} aria-hidden={page !== 'history'} inert={page !== 'history'}>
        <h2>{copy.notebook.history}</h2>
        <p>{copy.notebook.historyPlaceholder}</p>
        <span className="sheet-number" aria-hidden="true">2</span>
      </section>
    </div>
  )
}

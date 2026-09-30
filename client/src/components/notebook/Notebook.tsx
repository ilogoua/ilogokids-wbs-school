import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translations } from '../../i18n/translations'
import { PaperNotes } from './PaperNotes'

export function Notebook({ children, invitation, copy }: { children: ReactNode; invitation: ReactNode; copy: Translations }) {
  const [page, setPage] = useState<'schoolyard' | 'history'>('schoolyard')
  const [inviteOpen, setInviteOpen] = useState(false)
  useEffect(() => {
    document.documentElement.classList.add('notebook-open')
    window.scrollTo(0, 0)
    return () => document.documentElement.classList.remove('notebook-open')
  }, [])
  return (
    <div className="notebook-deck" data-page={page}>
      <nav className="notebook-tabs" aria-label={copy.notebook.pages}>
        <button type="button" aria-pressed={page === 'schoolyard'} aria-controls="schoolyard-sheet" onClick={() => setPage('schoolyard')}>{copy.title}</button>
        <button type="button" aria-pressed={page === 'history'} aria-controls="history-sheet" onClick={() => setPage('history')}>{copy.notebook.history}</button>
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

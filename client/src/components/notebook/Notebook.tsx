import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translations } from '../../i18n/translations'
import { PaperNotes } from './PaperNotes'
import { useSheetGeometry } from './useSheetGeometry'

type Page = 'schoolyard' | 'history'
type Turn = { from: Page; direction: 'forward' | 'back' }

export function Notebook({ children, invitation, header, copy }: { children: ReactNode; invitation: ReactNode; header: ReactNode; copy: Translations }) {
  const [page, setPage] = useState<Page>('schoolyard')
  const [turn, setTurn] = useState<Turn | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const { size, keyboard } = useSheetGeometry()
  function turnPage(next: Page) {
    if (next === page || turn) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setTurn({ from: page, direction: next === 'history' ? 'forward' : 'back' })
    setPage(next)
  }
  useEffect(() => {
    document.documentElement.classList.add('notebook-open')
    window.scrollTo(0, 0)
    return () => document.documentElement.classList.remove('notebook-open')
  }, [])
  useEffect(() => {
    if (!turn) return
    const timer = window.setTimeout(() => setTurn(null), 600)
    return () => window.clearTimeout(timer)
  }, [turn])
  function sheet(id: Page, content: ReactNode) {
    const turning = turn && (turn.direction === 'forward' ? turn.from === id : page === id)
    const visible = page === id || turn?.from === id
    return <section id={`${id}-sheet`} key={id}
      className={`notebook-sheet${page === id ? ' is-current' : ''}${visible ? ' is-visible' : ''}${turning ? ` turn-${turn.direction}` : ''}`}
      aria-label={id === 'schoolyard' ? copy.title : copy.notebook.history}
      aria-hidden={page !== id} inert={page !== id || !!turn}
      onAnimationEnd={event => { if (event.target === event.currentTarget) setTurn(null) }}>
      {header}
      <div className="sheet-content">
        <svg className="notebook-geometry" viewBox="0 0 180 160" aria-hidden="true">
          <path d="M20 135 80 30l65 105Z M80 30v105 M12 135h150 M28 65a75 75 0 0 1 108 15" />
          <path strokeDasharray="3 5" d="M20 135 145 75 M80 20v125" />
        </svg>
        <nav className="notebook-tabs" aria-label={copy.notebook.pages}>
          <button type="button" aria-pressed={page === 'schoolyard'} aria-controls="schoolyard-sheet" onClick={() => turnPage('schoolyard')}>{copy.title}</button>
          <button type="button" aria-pressed={page === 'history'} aria-controls="history-sheet" onClick={() => turnPage('history')}>{copy.notebook.history}</button>
        </nav>
        {content}
        <span className="sheet-number" aria-hidden="true">{id === 'schoolyard' ? 1 : 2}</span>
      </div>
    </section>
  }
  return <div className="notebook-deck" data-page={page} data-turn={turn?.direction}
    data-keyboard-source={keyboard.source} data-keyboard-top={keyboard.top} data-keyboard-height={keyboard.height}
    style={{ width: size.width, height: size.height }}>
    {sheet('schoolyard', <>
      {children}
      <PaperNotes active={page === 'schoolyard' && !turn} copy={copy} />
      <aside className="notebook-invitation">
        <button className="invitation-tab" type="button" aria-expanded={inviteOpen} aria-controls="notebook-invite" onClick={() => setInviteOpen(value => !value)}>{copy.inviteTitle}</button>
        <div id="notebook-invite" className="invitation-pocket" hidden={!inviteOpen}>{invitation}</div>
      </aside>
    </>)}
    {sheet('history', <main className="history-content"><h2>{copy.notebook.history}</h2><p>{copy.notebook.historyPlaceholder}</p></main>)}
  </div>
}

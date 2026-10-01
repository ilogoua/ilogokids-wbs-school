import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import type { Translations } from '../../i18n/translations'
import { PaperNotes } from './PaperNotes'
import { useSheetGeometry } from './useSheetGeometry'

type Page = 'schoolyard' | 'history'
type Turn = { from: Page; direction: 'forward' | 'back' }

export function Notebook({ children, invitation, headers, copy }: { children: ReactNode; invitation: ReactNode; headers: Record<Page, ReactNode>; copy: Translations }) {
  const [page, setPage] = useState<Page>('schoolyard')
  const [turn, setTurn] = useState<Turn | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const { size, keyboard } = useSheetGeometry()
  const drag = useRef<{ id: number; element: HTMLElement; sheet: HTMLElement; x: number; y: number; page: Page; width: number } | null>(null)
  const cancelDrag = useCallback(() => {
    const current = drag.current
    if (!current) return
    drag.current = null
    current.sheet.classList.remove('is-footer-dragging')
    current.sheet.style.removeProperty('--footer-angle')
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id)
  }, [])
  function turnPage(next: Page) {
    if (next === page || turn) return
    cancelDrag()
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
  useEffect(() => {
    const events = ['blur', 'pagehide', 'resize', 'orientationchange'] as const
    for (const name of events) window.addEventListener(name, cancelDrag)
    return () => {
      cancelDrag()
      for (const name of events) window.removeEventListener(name, cancelDrag)
    }
  }, [cancelDrag])
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (turn || drag.current || event.button !== 0 || !event.isPrimary) return
    // Chrome can adjust a touch target to a nearby clickable surface. The
    // object under the actual contact point retains ownership of its gesture.
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    if (hit?.closest('.paper-ball, .paper-trash, .paper-note, .notebook-invitation, .notebook-tabs')) return
    const element = event.currentTarget
    const sheet = element.closest<HTMLElement>('.notebook-sheet')!
    drag.current = { id: event.pointerId, element, sheet, x: event.clientX, y: event.clientY, page, width: size.width }
    element.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) { cancelDrag(); return }
    if (Math.abs(dx) < 8) return
    const available = current.page === 'schoolyard' ? dx < 0 : dx > 0
    const angle = Math.max(-10, Math.min(10, dx / current.width * 24)) * (available ? 1 : 0.2)
    current.sheet.style.setProperty('--footer-angle', `${angle}deg`)
    current.sheet.classList.add('is-footer-dragging')
  }
  function finishDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    const threshold = Math.max(48, Math.min(96, current.width * 0.18))
    cancelDrag()
    if (event.type !== 'pointerup' || Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.4) return
    // Both inputs share the same page selection and existing turn animation.
    if (dx < 0 && current.page === 'schoolyard') turnPage('history')
    if (dx > 0 && current.page === 'history') turnPage('schoolyard')
  }
  function sheet(id: Page, content: ReactNode) {
    const turning = turn && (turn.direction === 'forward' ? turn.from === id : page === id)
    const visible = page === id || turn?.from === id
    return <section id={`${id}-sheet`} key={id}
      className={`notebook-sheet${page === id ? ' is-current' : ''}${visible ? ' is-visible' : ''}${turning ? ` turn-${turn.direction}` : ''}`}
      aria-label={id === 'schoolyard' ? copy.title : copy.notebook.history}
      aria-hidden={page !== id} inert={page !== id || !!turn}
      onAnimationEnd={event => { if (event.target === event.currentTarget) setTurn(null) }}>
      {headers[id]}
      <div className="sheet-content">
        <svg className="notebook-geometry" viewBox="0 0 180 160" aria-hidden="true">
          <path d="M20 135 80 30l65 105Z M80 30v105 M12 135h150 M28 65a75 75 0 0 1 108 15" />
          <path strokeDasharray="3 5" d="M20 135 145 75 M80 20v125" />
        </svg>
        {content}
      </div>
      {/* A click target keeps Chrome's touch adjustment in the footer instead of a nearby button. */}
      <div className="sheet-footer" aria-hidden="true" onPointerDown={startDrag} onPointerMove={moveDrag}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
        onClick={event => event.preventDefault()}>
        <span className="footer-drag-mark"><span>‹</span><span>›</span></span>
        <span className="sheet-number">{id === 'schoolyard' ? 1 : 2}</span>
      </div>
    </section>
  }
  return <div className="notebook-deck" data-page={page} data-turn={turn?.direction}
    onPointerDownCapture={event => { if (drag.current && event.pointerId !== drag.current.id) cancelDrag() }}
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
    <nav className="notebook-tabs" aria-label={copy.notebook.pages}>
      <button type="button" aria-pressed={page === 'schoolyard'} aria-controls="schoolyard-sheet" disabled={!!turn} onClick={() => turnPage('schoolyard')}>{copy.title}</button>
      <button type="button" aria-pressed={page === 'history'} aria-controls="history-sheet" disabled={!!turn} onClick={() => turnPage('history')}>{copy.notebook.history}</button>
    </nav>
  </div>
}

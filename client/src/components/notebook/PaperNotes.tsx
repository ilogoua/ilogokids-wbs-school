import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { initialPaperState, paperReducer } from './paperState'
import type { Translations } from '../../i18n/translations'

export function PaperNotes({ active, copy }: { active: boolean; copy: Translations }) {
  const [state, dispatch] = useReducer(paperReducer, initialPaperState)
  const layerRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ id: number; element: HTMLElement; noteId: string; source: boolean } | null>(null)

  const cancel = useCallback(() => {
    const current = pointer.current
    if (!current) return
    pointer.current = null
    dispatch({ type: 'cancel', pointerId: current.id })
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id)
  }, [])

  useEffect(() => {
    if (!active) return
    window.addEventListener('blur', cancel)
    window.addEventListener('pagehide', cancel)
    return () => {
      cancel()
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pagehide', cancel)
    }
  }, [active, cancel])

  function point(event: PointerEvent<HTMLElement>) {
    const rect = layerRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  function start(event: PointerEvent<HTMLElement>, source: boolean, id: string) {
    if (!active || event.button !== 0 || pointer.current || (event.pointerType === 'touch' && !event.isPrimary)) return
    event.stopPropagation()
    pointer.current = { id: event.pointerId, element: event.currentTarget, noteId: id, source }
    event.currentTarget.setPointerCapture(event.pointerId)
    dispatch({ type: 'start', source, id, pointerId: event.pointerId, point: point(event) })
  }
  function relativeArea(element: HTMLElement) {
    const surface = layerRef.current!.getBoundingClientRect()
    const area = element.getBoundingClientRect()
    return { left: area.left - surface.left, top: area.top - surface.top, right: area.right - surface.left, bottom: area.bottom - surface.top }
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId) return
    event.stopPropagation()
    dispatch({ type: 'move', pointerId: event.pointerId, point: point(event), trash: relativeArea(trashRef.current!) })
  }
  function finish(event: PointerEvent<HTMLElement>) {
    const current = pointer.current
    if (!current || current.id !== event.pointerId) return
    event.stopPropagation()
    if (event.type !== 'pointerup' || !active) { cancel(); return }
    const target = document.elementFromPoint(event.clientX, event.clientY)
    const blocked = !!target?.closest('.notebook-tabs, .notebook-invitation, .graph-toolbar, .app-header')
    pointer.current = null
    // Commit and focus in the release event, preserving mobile user activation.
    flushSync(() => dispatch({ type: 'finish', pointerId: event.pointerId, point: point(event), blocked,
      area: relativeArea(dropRef.current!), trash: relativeArea(trashRef.current!) }))
    if (current.source) layerRef.current?.querySelector<HTMLTextAreaElement>(`[data-note-id="${current.noteId}"] textarea`)?.focus({ preventScroll: true })
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id)
  }
  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish }
  return (
    <div className="paper-layer" ref={layerRef}>
      <div className="paper-drop-area" ref={dropRef} aria-hidden="true" />
      <div className="paper-guidance" aria-hidden="true">
        <span>{copy.notebook.paperGuidance}</span>
        <svg viewBox="0 0 155 40" preserveAspectRatio="none"><path d="M10 40C7 30 20 27 35 28S79 24 113 9 M101 11l12-2-3 12" /></svg>
      </div>
      <div className="paper-stack" aria-hidden="true"><i /><i /><i /></div>
      <div className="paper-source" role="img" aria-label={copy.notebook.pullPaper} title={copy.notebook.pullPaper}
        onPointerDown={event => start(event, true, crypto.randomUUID())} {...handlers}>
        <span aria-hidden="true">↙</span>
      </div>
      <div ref={trashRef} className={`paper-trash${state.draft && !state.draft.source ? ' is-ready' : ''}${state.draft?.overTrash ? ' is-over' : ''}`}
        role="img" aria-label={copy.notebook.trash} title={copy.notebook.trash}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.preventDefault()}>
        <svg viewBox="0 0 48 56" aria-hidden="true"><path d="M8 15h32l-5 34H13Z M6 15h36 M13 8l8-3 6 6 7-3 3 7 M18 21l2 22 M30 21l-2 22 M11 30h26 M12 40h24" /></svg>
      </div>
      {state.notes.map(note => <div key={note.id} className="paper-note" data-note-id={note.id}
        style={{ left: note.x, top: note.y, width: note.width, height: note.height,
          visibility: state.draft?.note.id === note.id ? 'hidden' : undefined }}>
        <div className="paper-note-grip" role="img" aria-label={copy.notebook.moveNote} title={copy.notebook.moveNote}
          onPointerDown={event => start(event, false, note.id)} {...handlers} />
        <textarea aria-label={copy.notebook.noteText} value={note.text} placeholder={copy.notebook.writeHere}
          onChange={event => dispatch({ type: 'edit', id: note.id, text: event.target.value })} spellCheck />
      </div>)}
      {active && state.draft && <div className="paper-note paper-draft" aria-hidden="true"
        style={{ left: state.draft.note.x, top: state.draft.note.y, width: state.draft.note.width, height: state.draft.note.height }}><span>{state.draft.note.text}</span></div>}
    </div>
  )
}

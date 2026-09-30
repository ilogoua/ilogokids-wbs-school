import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { PointerEvent } from 'react'
import { initialPaperState, paperReducer } from './paperState'
import type { Translations } from '../../i18n/translations'

export function PaperNotes({ active, copy }: { active: boolean; copy: Translations }) {
  const [state, dispatch] = useReducer(paperReducer, initialPaperState)
  const layerRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ id: number; element: HTMLElement } | null>(null)

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
    pointer.current = { id: event.pointerId, element: event.currentTarget }
    event.currentTarget.setPointerCapture(event.pointerId)
    dispatch({ type: 'start', source, id, pointerId: event.pointerId, point: point(event) })
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (pointer.current?.id !== event.pointerId) return
    event.stopPropagation()
    dispatch({ type: 'move', pointerId: event.pointerId, point: point(event) })
  }
  function finish(event: PointerEvent<HTMLElement>) {
    const current = pointer.current
    if (!current || current.id !== event.pointerId) return
    event.stopPropagation()
    if (event.type !== 'pointerup' || !active) { cancel(); return }
    const surface = layerRef.current!.getBoundingClientRect()
    const area = dropRef.current!.getBoundingClientRect()
    const target = document.elementFromPoint(event.clientX, event.clientY)
    const blocked = !!target?.closest('.notebook-tabs, .notebook-invitation, .graph-toolbar, .app-header')
    pointer.current = null
    dispatch({ type: 'finish', pointerId: event.pointerId, point: point(event), blocked,
      area: { left: area.left - surface.left, top: area.top - surface.top, right: area.right - surface.left, bottom: area.bottom - surface.top } })
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id)
  }
  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish }
  return (
    <div className="paper-layer" ref={layerRef}>
      <div className="paper-drop-area" ref={dropRef} aria-hidden="true" />
      <div className="paper-source" role="img" aria-label={copy.notebook.pullPaper} title={copy.notebook.pullPaper}
        onPointerDown={event => start(event, true, crypto.randomUUID())} {...handlers}>
        <span aria-hidden="true">↖</span>
      </div>
      {state.notes.map(note => <div key={note.id} className="paper-note" role="img" aria-label={copy.notebook.blankNote}
        style={{ left: note.x, top: note.y, width: note.width, height: note.height,
          visibility: state.draft?.note.id === note.id ? 'hidden' : undefined }}
        onPointerDown={event => start(event, false, note.id)} {...handlers} />)}
      {active && state.draft && <div className="paper-note paper-draft" aria-hidden="true"
        style={{ left: state.draft.note.x, top: state.draft.note.y, width: state.draft.note.width, height: state.draft.note.height }} />}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type { CrumpledNote } from './paperState'
import { BALL_RADIUS, PaperPhysicsWorld } from './paperPhysics'
import { currentScreenAngle, needsSensorPermission, PaperGravitySensor } from './paperGravity'
import type { SensorWindow } from './paperGravity'
import { pairedScreenFrame } from './paperScreen'
import { classifyPocket, POCKET_FEEDBACK_DISTANCE, readPaperPockets } from './paperPockets'
import type { PaperPocket } from './paperPockets'
import { samplePointer, throwVelocity } from './paperThrow'
import type { PointerSample } from './paperThrow'

export function PaperBalls({ papers, active, noteLayer, permissionLabel }: {
  papers: CrumpledNote[]; active: boolean; noteLayer: RefObject<HTMLDivElement | null>; permissionLabel: string
}) {
  const layer = useRef<HTMLDivElement>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const controls = useRef<{
    sync: (papers: CrumpledNote[], active: boolean) => void; permission: () => Promise<void>
    start: (event: PointerEvent<HTMLDivElement>, id: string) => void
    move: (event: PointerEvent<HTMLDivElement>) => void
    finish: (event: PointerEvent<HTMLDivElement>) => void
  } | null>(null)
  const [permissionNeeded, setPermissionNeeded] = useState(() => needsSensorPermission(window as SensorWindow))

  useEffect(() => {
    const surface = layer.current!
    const notes = noteLayer.current!
    const deck = notes.closest<HTMLElement>('.notebook-deck')!
    const target = window as SensorWindow
    const sensors = new PaperGravitySensor(target)
    const mobileAngleAPI = navigator.maxTouchPoints > 0 && (Number.isFinite(target.screen?.orientation?.angle) || Number.isFinite(target.orientation))
    const world = new PaperPhysicsWorld({ width: deck.clientWidth, height: deck.clientHeight }, sensors.current(), currentScreenAngle(target))
    let running = false, frame = 0, previous = 0, accumulator = 0
    let pockets: PaperPocket[] = []
    let grab: { pointerId: number; element: HTMLDivElement; samples: PointerSample[] } | null = null
    function cancelGrab() {
      if (!grab) return
      const current = grab
      grab = null
      world.releaseGrab(current.pointerId)
      if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
      paint()
    }
    function point(event: { clientX: number; clientY: number }) {
      const origin = surface.getBoundingClientRect()
      return { x: event.clientX - origin.left, y: event.clientY - origin.top }
    }
    function sample(event: PointerEvent<HTMLDivElement>) {
      if (!grab) return
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
      for (const value of [...coalesced, event]) grab.samples = samplePointer(grab.samples, { ...point(value), time: value.timeStamp })
    }
    function paint() {
      for (const [id, body] of world.balls) {
        const element = elements.current.get(id)
        if (element) {
          const state = world.states.get(id)!
          element.dataset.state = state.phase
          if (state.pocketId) element.dataset.pocketId = state.pocketId
          else delete element.dataset.pocketId
          element.style.transform = `translate(${body.position.x - BALL_RADIUS}px, ${body.position.y - BALL_RADIUS}px) rotate(${body.angle}rad) scale(${state.phase === 'sunk' ? 0.08 : 1})`
          element.dataset.placed = 'true'
        }
      }
      for (const node of deck.querySelectorAll<SVGGElement>('.graph-node[data-pocket-id]')) {
        const pocket = pockets.find(pocket => pocket.id === node.dataset.pocketId)
        const kind = pocket ? classifyPocket(BALL_RADIUS, pocket.radius) : 'pass'
        const near = running && pocket && kind !== 'pass' && [...world.balls].some(([id, body]) => {
          const phase = world.states.get(id)?.phase
          return (phase === 'held' || phase === 'free') && Math.hypot(body.position.x - pocket.x, body.position.y - pocket.y) < BALL_RADIUS + pocket.radius + POCKET_FEEDBACK_DISTANCE
        })
        if (near) node.dataset.pocketFeedback = kind
        else delete node.dataset.pocketFeedback
      }
    }
    function tick(time: number) {
      frame = 0
      if (!running || document.hidden) return
      // Read committed viewport geometry before advancing any body. resize()
      // atomically updates walls/positions between steps, without a new engine.
      if (!measure()) {
        previous = 0; accumulator = 0
        frame = requestAnimationFrame(tick)
        return
      }
      accumulator += previous ? Math.min(50, time - previous) : 0
      previous = time
      const step = 1000 / 60
      while (accumulator >= step) { world.step(step, sensors.current(world.frame.angle)); accumulator -= step }
      paint()
      frame = requestAnimationFrame(tick)
    }
    function restart() {
      if (document.hidden) cancelGrab()
      cancelAnimationFrame(frame)
      frame = 0; previous = 0; accumulator = 0
      if (running && !document.hidden && world.balls.size) frame = requestAnimationFrame(tick)
    }
    function measure() {
      const next = { width: deck.clientWidth, height: deck.clientHeight, angle: currentScreenAngle(target) }
      if (!pairedScreenFrame(world.frame, next, mobileAngleAPI)) return false
      const old = world.frame
      if (old.width !== next.width || old.height !== next.height || old.angle !== next.angle) cancelGrab()
      world.resize(next, next.angle)
      // The fixed layer is anchored at the physical viewport origin. Its DOM
      // pose is written only by the same transaction that transforms bodies.
      surface.style.width = `${next.width}px`
      surface.style.height = `${next.height}px`
      surface.dataset.screenAngle = String(world.frame.angle)
      world.setGravity(sensors.current(world.frame.angle))
      pockets = running ? readPaperPockets(deck, surface) : []
      if (running) world.setPockets(pockets)
      paint()
      return true
    }
    const observer = new ResizeObserver(measure)
    observer.observe(deck)
    measure()
    const orientation = () => { measure() }
    window.screen.orientation?.addEventListener('change', orientation)
    window.addEventListener('orientationchange', orientation)
    document.addEventListener('visibilitychange', restart)
    window.addEventListener('blur', cancelGrab)
    window.addEventListener('pagehide', cancelGrab)
    controls.current = {
      permission: () => sensors.requestPermission(),
      start(event, id) {
        event.stopPropagation()
        if (event.button !== 0) return
        event.preventDefault()
        if (!running || grab || !event.isPrimary || !measure()) return
        if (!world.grab(id, event.pointerId, point(event))) return
        grab = { pointerId: event.pointerId, element: event.currentTarget, samples: [] }
        sample(event)
        event.currentTarget.setPointerCapture(event.pointerId)
        paint()
      },
      move(event) {
        event.stopPropagation()
        if (!grab || grab.pointerId !== event.pointerId) return
        sample(event)
        world.moveGrab(event.pointerId, point(event))
        paint()
      },
      finish(event) {
        event.stopPropagation()
        if (!grab || grab.pointerId !== event.pointerId) return
        if (event.type !== 'pointerup' || !running) { cancelGrab(); return }
        sample(event)
        world.moveGrab(event.pointerId, point(event))
        world.releaseGrab(event.pointerId, throwVelocity(grab.samples))
        const current = grab
        grab = null
        if (current.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
        paint()
      },
      sync(papers, active) {
        const wasRunning = running
        if (!active) cancelGrab()
        running = active
        world.setActive(active)
        measure()
        const gravity = sensors.current(world.frame.angle)
        for (const paper of papers) world.add(paper, gravity)
        paint()
        if (wasRunning !== running || !frame) restart()
      },
    }
    return () => {
      running = false
      cancelGrab()
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.screen.orientation?.removeEventListener('change', orientation)
      window.removeEventListener('orientationchange', orientation)
      document.removeEventListener('visibilitychange', restart)
      window.removeEventListener('blur', cancelGrab)
      window.removeEventListener('pagehide', cancelGrab)
      for (const node of deck.querySelectorAll<SVGGElement>('.graph-node[data-pocket-feedback]')) delete node.dataset.pocketFeedback
      sensors.dispose()
      world.dispose()
      controls.current = null
    }
  }, [noteLayer])

  useEffect(() => { controls.current?.sync(papers, active) }, [papers, active])

  return <div className="paper-ball-layer" ref={layer} data-active={active}>
    {permissionNeeded && <button type="button" className="paper-tilt-permission"
      onPointerDown={event => event.stopPropagation()}
      onClick={() => { void controls.current?.permission(); setPermissionNeeded(false) }}>{permissionLabel}</button>}
    {papers.filter(paper => paper.phase === 'ball').map(paper => {
      const variant = [...paper.note.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3
      return <div key={paper.note.id} className={`paper-ball paper-ball-${variant}`} aria-hidden="true"
        onPointerDown={event => controls.current?.start(event, paper.note.id)}
        onPointerMove={event => controls.current?.move(event)}
        onPointerUp={event => controls.current?.finish(event)}
        onPointerCancel={event => controls.current?.finish(event)}
        onLostPointerCapture={event => controls.current?.finish(event)}
        onClick={event => { event.preventDefault(); event.stopPropagation() }}
        data-paper-id={paper.note.id} ref={element => { if (element) elements.current.set(paper.note.id, element); else elements.current.delete(paper.note.id) }}>
        <svg viewBox="0 0 38 38"><path className="paper-ball-fold" d="m7 9 11 4 9-7-2 14 9 6-12 5-8-4-7 4 3-14Z" />
          <path className="paper-ball-crease" d="m7 9 11 4-8 5 4 9 8 4 3-11-7-7 M10 18l-5 8 M25 20l5-5 M14 27l-1 7" />
          <path className="paper-ball-highlight" d="m8 8 10 4 8-5 M11 19l4 6 6 4" /></svg>
      </div>
    })}
  </div>
}

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CrumpledNote } from './paperState'
import { BALL_RADIUS, PaperPhysicsWorld } from './paperPhysics'
import { currentScreenAngle, needsSensorPermission, PaperGravitySensor } from './paperGravity'
import type { SensorWindow } from './paperGravity'
import { pairedScreenFrame } from './paperScreen'

export function PaperBalls({ papers, active, noteLayer, permissionLabel }: {
  papers: CrumpledNote[]; active: boolean; noteLayer: RefObject<HTMLDivElement | null>; permissionLabel: string
}) {
  const layer = useRef<HTMLDivElement>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const controls = useRef<{ sync: (papers: CrumpledNote[], active: boolean) => void; permission: () => Promise<void> } | null>(null)
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
    function paint() {
      for (const [id, body] of world.balls) {
        const element = elements.current.get(id)
        if (element) {
          element.style.transform = `translate(${body.position.x - BALL_RADIUS}px, ${body.position.y - BALL_RADIUS}px) rotate(${body.angle}rad)`
          element.dataset.placed = 'true'
        }
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
      cancelAnimationFrame(frame)
      frame = 0; previous = 0; accumulator = 0
      if (running && !document.hidden && world.balls.size) frame = requestAnimationFrame(tick)
    }
    function measure() {
      const next = { width: deck.clientWidth, height: deck.clientHeight, angle: currentScreenAngle(target) }
      if (!pairedScreenFrame(world.frame, next, mobileAngleAPI)) return false
      world.resize(next, next.angle)
      // The fixed layer is anchored at the physical viewport origin. Its DOM
      // pose is written only by the same transaction that transforms bodies.
      surface.style.width = `${next.width}px`
      surface.style.height = `${next.height}px`
      surface.dataset.screenAngle = String(world.frame.angle)
      world.setGravity(sensors.current(world.frame.angle))
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
    controls.current = {
      permission: () => sensors.requestPermission(),
      sync(papers, active) {
        const wasRunning = running
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
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.screen.orientation?.removeEventListener('change', orientation)
      window.removeEventListener('orientationchange', orientation)
      document.removeEventListener('visibilitychange', restart)
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
        data-paper-id={paper.note.id} ref={element => { if (element) elements.current.set(paper.note.id, element); else elements.current.delete(paper.note.id) }}>
        <svg viewBox="0 0 38 38"><path className="paper-ball-fold" d="m7 9 11 4 9-7-2 14 9 6-12 5-8-4-7 4 3-14Z" />
          <path className="paper-ball-crease" d="m7 9 11 4-8 5 4 9 8 4 3-11-7-7 M10 18l-5 8 M25 20l5-5 M14 27l-1 7" />
          <path className="paper-ball-highlight" d="m8 8 10 4 8-5 M11 19l4 6 6 4" /></svg>
      </div>
    })}
  </div>
}

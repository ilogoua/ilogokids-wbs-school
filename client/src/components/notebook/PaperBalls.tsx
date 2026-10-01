import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CrumpledNote } from './paperState'
import { BALL_RADIUS, PaperPhysicsWorld } from './paperPhysics'
import { needsSensorPermission, PaperGravitySensor } from './paperGravity'
import type { SensorWindow } from './paperGravity'
import { sheetOffset } from './paperGeometry'

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
    const sheet = notes.closest<HTMLElement>('.notebook-sheet')!
    const sensors = new PaperGravitySensor(window as SensorWindow)
    const world = new PaperPhysicsWorld({ width: sheet.clientWidth, height: sheet.clientHeight }, sensors.current())
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
      measure()
      accumulator += previous ? Math.min(50, time - previous) : 0
      previous = time
      const step = 1000 / 60
      while (accumulator >= step) { world.step(step, sensors.current()); accumulator -= step }
      paint()
      frame = requestAnimationFrame(tick)
    }
    function restart() {
      cancelAnimationFrame(frame)
      frame = 0; previous = 0; accumulator = 0
      if (running && !document.hidden && world.balls.size) frame = requestAnimationFrame(tick)
    }
    function measure() {
      const offset = sheetOffset(notes, sheet)
      // Balls occupy the ENTIRE physical sheet, although notes use content coordinates.
      surface.style.left = `${-offset.x}px`
      surface.style.top = `${-offset.y}px`
      surface.style.width = `${sheet.clientWidth}px`
      surface.style.height = `${sheet.clientHeight}px`
      world.resize({ width: sheet.clientWidth, height: sheet.clientHeight })
      world.setGravity(sensors.current())
      paint()
    }
    const observer = new ResizeObserver(measure)
    observer.observe(sheet)
    observer.observe(notes)
    measure()
    document.addEventListener('visibilitychange', restart)
    controls.current = {
      permission: () => sensors.requestPermission(),
      sync(papers, active) {
        const wasRunning = running
        running = active
        world.setActive(active)
        measure()
        const gravity = sensors.current()
        for (const paper of papers) world.add(paper, gravity)
        paint()
        if (wasRunning !== running || !frame) restart()
      },
    }
    return () => {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
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

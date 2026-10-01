import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CrumpledNote } from './paperState'
import { BALL_RADIUS, PaperPhysicsWorld } from './paperPhysics'
import { needsSensorPermission } from './paperGravity'
import type { SensorWindow } from './paperGravity'
import { sheetOffset } from './paperGeometry'
import type { NotebookCamera } from './notebookCamera'

export function PaperBalls({ papers, active, noteLayer, permissionLabel, camera }: {
  papers: CrumpledNote[]; active: boolean; noteLayer: RefObject<HTMLDivElement | null>; permissionLabel: string; camera: NotebookCamera
}) {
  const layer = useRef<HTMLDivElement>(null)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const controls = useRef<{ sync: (papers: CrumpledNote[], active: boolean) => void; permission: () => Promise<void> } | null>(null)
  const [permissionNeeded, setPermissionNeeded] = useState(() => needsSensorPermission(window as SensorWindow))

  useEffect(() => {
    const surface = layer.current!
    const notes = noteLayer.current!
    const sheet = notes.closest<HTMLElement>('.notebook-sheet')!
    const world = new PaperPhysicsWorld({ width: sheet.clientWidth, height: sheet.clientHeight }, camera.frame.gravity)
    let running = false, accumulator = 0
    function paint() {
      for (const [id, body] of world.balls) {
        const element = elements.current.get(id)
        if (element) {
          element.style.transform = `translate(${body.position.x - BALL_RADIUS}px, ${body.position.y - BALL_RADIUS}px) rotate(${body.angle}rad)`
          element.dataset.placed = 'true'
        }
      }
    }
    function measure() {
      const offset = sheetOffset(notes, sheet)
      // Balls occupy the ENTIRE physical sheet, although notes use content coordinates.
      surface.style.left = `${-offset.x}px`
      surface.style.top = `${-offset.y}px`
      surface.style.width = `${camera.frame.size.width}px`
      surface.style.height = `${camera.frame.size.height}px`
      world.resize(camera.frame.size)
      paint()
    }
    const observer = new ResizeObserver(measure)
    observer.observe(sheet)
    observer.observe(notes)
    measure()
    const unsubscribe = camera.subscribe((frame, elapsed) => {
      measure()
      if (!running) { accumulator = 0; return }
      accumulator += elapsed
      const step = 1000 / 60
      while (accumulator >= step) { world.step(step, frame.gravity); accumulator -= step }
      paint()
    })
    controls.current = {
      permission: () => camera.requestPermission(),
      sync(papers, active) {
        running = active
        world.setActive(active)
        const gravity = camera.refresh().gravity
        for (const paper of papers) world.add(paper, gravity)
        paint()
        camera.setPhysicsActive(active && world.balls.size > 0)
      },
    }
    return () => {
      running = false
      observer.disconnect()
      unsubscribe()
      camera.setPhysicsActive(false)
      world.dispose()
      controls.current = null
    }
  }, [noteLayer, camera])

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

import Matter from 'matter-js'
import type { CrumpledNote } from './paperState.ts'
import type { Gravity } from './paperGravity.ts'
import { reframeScreenPoint, rotateScreenVector, screenAngle } from './paperScreen.ts'
import type { PaperScreenFrame } from './paperScreen.ts'

export const BALL_RADIUS = 19
type SheetSize = { width: number; height: number }
const { Engine, Bodies, Body, Composite, Sleeping } = Matter

export class PaperPhysicsWorld {
  readonly engine = Engine.create({ enableSleeping: true })
  readonly balls = new Map<string, Matter.Body>()
  private boundaries: Matter.Body[] = []
  private size: SheetSize = { width: 0, height: 0 }
  private angle = 0
  private wakeGravity: Gravity = { x: 0, y: 0 }
  private active = true
  private disposed = false

  constructor(size: SheetSize, gravity: Gravity, angle = 0) {
    this.resize(size, angle)
    this.setGravity(gravity)
  }

  setGravity(gravity: Gravity) {
    if (Math.hypot(gravity.x - this.wakeGravity.x, gravity.y - this.wakeGravity.y) > 0.025) {
      for (const body of this.balls.values()) Sleeping.set(body, false)
      this.wakeGravity = { ...gravity }
    }
    Object.assign(this.engine.gravity, gravity, { scale: 0.001 })
  }

  add(paper: CrumpledNote, gravity: Gravity) {
    if (this.disposed || paper.phase !== 'ball' || this.balls.has(paper.note.id)) return
    // Install CURRENT gravity before insertion, as well as before every step.
    this.setGravity(gravity)
    const body = Bodies.circle(paper.origin.x, paper.origin.y, BALL_RADIUS, {
      label: `paper:${paper.note.id}`, restitution: 0.18, friction: 0.5,
      frictionStatic: 0.9, frictionAir: 0.025, density: 0.0006, sleepThreshold: 45,
    })
    this.contain(body)
    this.balls.set(paper.note.id, body)
    Composite.add(this.engine.world, body)
  }

  get frame(): PaperScreenFrame { return { ...this.size, angle: this.angle } }

  resize(size: SheetSize, angle = this.angle) {
    if (this.disposed) return
    angle = screenAngle(angle)
    if (size.width === this.size.width && size.height === this.size.height && angle === this.angle) return
    const previous = this.frame
    this.size = size
    this.angle = angle
    // Transform every body before resolving it against the resized walls.
    // Angular state and identity stay intact; linear speed is never scaled.
    for (const body of this.balls.values()) {
      const position = reframeScreenPoint(body.position, previous, this.frame)
      const velocity = rotateScreenVector(body.velocity, previous.angle, angle)
      Body.setPosition(body, position)
      Body.setVelocity(body, velocity)
      this.contain(body, false)
      Sleeping.set(body, false)
    }
    const { width: w, height: h } = size
    const options = { isStatic: true, friction: 0.5, restitution: 0.05 }
    if (!this.boundaries.length) {
      this.boundaries = [
      Bodies.rectangle(-40, h / 2, 80, h + 160, { ...options, label: 'sheet:left' }),
      Bodies.rectangle(w + 40, h / 2, 80, h + 160, { ...options, label: 'sheet:right' }),
      Bodies.rectangle(w / 2, -40, w + 160, 80, { ...options, label: 'sheet:top' }),
      Bodies.rectangle(w / 2, h + 40, w + 160, 80, { ...options, label: 'sheet:bottom' }),
      ]
      Composite.add(this.engine.world, this.boundaries)
    } else {
      // Reuse all four wall identities; resizing is atomic between engine steps.
      const positions = [{ x: -40, y: h / 2 }, { x: w + 40, y: h / 2 }, { x: w / 2, y: -40 }, { x: w / 2, y: h + 40 }]
      this.boundaries.forEach((wall, i) => {
        Body.scale(wall, i < 2 ? 1 : (w + 160) / (previous.width + 160), i < 2 ? (h + 160) / (previous.height + 160) : 1)
        Body.setPosition(wall, positions[i])
      })
    }
  }

  private contain(body: Matter.Body, stop = true) {
    const x = Math.max(BALL_RADIUS, Math.min(this.size.width - BALL_RADIUS, body.position.x))
    const y = Math.max(BALL_RADIUS, Math.min(this.size.height - BALL_RADIUS, body.position.y))
    if (x !== body.position.x || y !== body.position.y) {
      Body.setPosition(body, { x, y })
      if (stop) Body.setVelocity(body, { x: 0, y: 0 })
    }
  }

  setActive(active: boolean) { this.active = active }

  step(milliseconds: number, gravity: Gravity) {
    if (this.disposed || !this.active) return
    this.setGravity(gravity)
    Engine.update(this.engine, milliseconds)
    // Also keep bodies inside after an extreme collision/viewport change.
    for (const body of this.balls.values()) {
      if (body.position.x < 0 || body.position.x > this.size.width || body.position.y < 0 || body.position.y > this.size.height) this.contain(body)
    }
  }

  dispose() {
    this.disposed = true
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
    this.balls.clear()
    this.boundaries = []
  }
}

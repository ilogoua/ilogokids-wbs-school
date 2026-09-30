import type { GraphPoint } from './graphTypes'

type OrbitRingsProps = {
  point: GraphPoint
  radius: number
  root?: boolean
}

export function OrbitRings({ point, radius, root = false }: OrbitRingsProps) {
  return (
    <g className={`orbit-rings${root ? ' orbit-rings--root' : ''}`} aria-hidden="true">
      {root && <circle cx={point.x} cy={point.y} r={radius * 0.61} />}
      <circle cx={point.x} cy={point.y} r={radius} />
    </g>
  )
}

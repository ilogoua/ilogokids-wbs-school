import type { KeyboardEvent } from 'react'
import type { Translations } from '../../i18n/translations'
import { NODE_RADII } from './graphTypes'
import type { GraphNodeKind, GraphPoint } from './graphTypes'

type GraphNodeProps = {
  id: string
  kind: GraphNodeKind
  point: GraphPoint
  label?: string
  connectionCount: number
  selected: boolean
  pocketEligible?: boolean
  onSelect: (id: string) => void
  copy: Translations
}

function ConnectionMarkers({ connectionCount, radius }: { connectionCount: number; radius: number }) {
  const count = Number.isFinite(connectionCount) ? Math.min(12, Math.max(0, Math.floor(connectionCount))) : 0
  return (
    <g className="connection-markers" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <path
          key={index}
          d={`M 0 ${-radius - 10} v -11`}
          transform={`rotate(${-55 + index * (115 / Math.max(6, count - 1))})`}
        />
      ))}
    </g>
  )
}

export function GraphNode({ id, kind, point, label, connectionCount, selected, pocketEligible = false, onSelect, copy }: GraphNodeProps) {
  const radius = NODE_RADII[kind]
  const anonymous = kind === 'anonymous'
  const accessibleLabel = anonymous ? copy.anonymous : label ?? copy.unnamed

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return (
    <g
      className={`graph-node graph-node--${kind}${selected ? ' is-selected' : ''}`}
      data-pocket-id={id}
      data-pocket-eligible={pocketEligible}
      transform={`translate(${point.x} ${point.y})`}
      role="button"
      tabIndex={0}
      aria-label={copy.nodeDescription(accessibleLabel, point.depth, connectionCount)}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <title>{kind === 'member' ? `${accessibleLabel} · ${copy.active}` : accessibleLabel}</title>
      <circle className="node-hit-area" r={Math.max(radius + 8, 26)} />
      <ConnectionMarkers connectionCount={connectionCount} radius={radius} />
      {selected && <circle className="node-selection-ring" r={radius + 7} />}
      <circle className="node-body" r={anonymous ? 6 : radius} />
      {!anonymous && (
        <g className="profile-glyph" aria-hidden="true">
          <circle cx="0" cy={-radius * 0.22} r={radius * 0.2} />
          <path d={`M ${-radius * 0.42} ${radius * 0.48} C ${-radius * 0.4} ${radius * 0.08}, ${radius * 0.4} ${radius * 0.08}, ${radius * 0.42} ${radius * 0.48} Q 0 ${radius * 0.6}, ${-radius * 0.42} ${radius * 0.48} Z`} />
        </g>
      )}
      {label && !anonymous && <text className="node-label" y={radius + 27} textAnchor="middle">{label}</text>}
    </g>
  )
}

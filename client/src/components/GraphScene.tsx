import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { GraphNode } from './graph/GraphNode'
import { OrbitRings } from './graph/OrbitRings'
import { layoutGraph } from './graph/graphLayout'
import type { GraphTopologyNode } from './graph/graphTypes'
import { useGraphViewport } from './graph/useGraphViewport'
import type { Translations } from '../i18n/translations'

type GraphSceneProps = {
  topology: GraphTopologyNode[]
  labels: Record<string, string | undefined>
  descendantCounts: Record<string, number>
  initialCenterId: string | null
  selectedId: string
  onSelectionChange: (id: string) => void
  copy: Translations
  profileControl?: ReactNode
}

export function GraphScene({ topology, labels, descendantCounts, initialCenterId, selectedId, onSelectionChange, copy, profileControl }: GraphSceneProps) {
  const layout = useMemo(() => layoutGraph(topology), [topology])
  const initialCenter = initialCenterId ? layout.positions.get(initialCenterId) : undefined
  const { svgRef, placementRef, size, view, handlePointerDown, handlePointerMove, handlePointerUp, handleClickCapture } = useGraphViewport(layout.bounds, initialCenter)

  return (
    <section className="graph-column" aria-labelledby="graph-title">
      <div className="graph-toolbar">
        <div className="graph-heading">
          <h2 id="graph-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
          {profileControl}
        </div>
      </div>
      <div className="graph-placement" ref={placementRef} aria-hidden="true" />
      <svg
        ref={svgRef}
        className="graph-scene"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="group"
        aria-label={copy.title}
        aria-describedby="graph-instructions"
        onPointerDownCapture={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onClickCapture={handleClickCapture}
      >
        <desc id="graph-instructions">{copy.graphDescription}</desc>
        <g className="graph-world" transform={`translate(${view.x} ${view.y}) rotate(${view.rotation}) scale(${view.zoom})`}>
          <rect className="graph-drag-area"
            x={layout.bounds.minX - 24} y={layout.bounds.minY - 24}
            width={layout.bounds.maxX - layout.bounds.minX + 48}
            height={layout.bounds.maxY - layout.bounds.minY + 48}
          />
          {[...layout.orbits].map(([parentId, radius]) => {
            const point = layout.positions.get(parentId)!
            return <OrbitRings key={parentId} point={point} radius={radius} root={point.depth === 0} />
          })}
          {topology.map((node) => {
            const point = layout.positions.get(node.id)
            const parent = node.parentId ? layout.positions.get(node.parentId) : undefined
            if (!point || !parent) return null
            const dx = point.x - parent.x
            const dy = point.y - parent.y
            const length = Math.hypot(dx, dy) || 1
            return (
              <path
                className="graph-edge"
                key={node.id}
                aria-hidden="true"
                d={`M ${parent.x} ${parent.y} Q ${(parent.x + point.x) / 2 - dy / length * 6} ${(parent.y + point.y) / 2 + dx / length * 6} ${point.x} ${point.y}`}
              />
            )
          })}
          {topology.map((node) => {
            const point = layout.positions.get(node.id)
            if (!point) return null
            const connectionCount = descendantCounts[node.id] ?? 0
            return (
              <GraphNode
                key={node.id}
                id={node.id}
                kind={node.kind}
                point={point}
                label={labels[node.id]}
                connectionCount={connectionCount}
                selected={selectedId === node.id}
                onSelect={onSelectionChange}
                copy={copy}
              />
            )
          })}
        </g>
      </svg>
      <p className="graph-hint">{copy.graphHint}</p>
      <p className="sr-only" role="status">{copy.selection(labels[selectedId] ?? copy.anonymous)}</p>
    </section>
  )
}

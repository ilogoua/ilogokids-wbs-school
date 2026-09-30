import { useMemo } from 'react'
import { GraphNode } from './graph/GraphNode'
import { OrbitRings } from './graph/OrbitRings'
import { layoutGraph } from './graph/graphLayout'
import type { GraphTopologyNode } from './graph/graphTypes'
import { useGraphViewport } from './graph/useGraphViewport'
import type { Translations } from '../i18n/translations'

type GraphSceneProps = {
  topology: GraphTopologyNode[]
  labels: Record<string, string | undefined>
  selectedId: string
  onSelectionChange: (id: string) => void
  copy: Translations
}

export function GraphScene({ topology, labels, selectedId, onSelectionChange, copy }: GraphSceneProps) {
  const layout = useMemo(() => layoutGraph(topology), [topology])
  const { svgRef, size, view, handlePointerDown, handlePointerMove, handlePointerUp, zoomBy, resetView } = useGraphViewport(layout.bounds)

  return (
    <section className="graph-column" aria-labelledby="graph-title">
      <div className="graph-toolbar">
        <div className="graph-heading">
          <h2 id="graph-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <div className="graph-zoom-controls" role="group" aria-label={copy.viewportControls}>
          <button type="button" aria-label={copy.zoomOut} onClick={() => zoomBy(1 / 1.2)}>−</button>
          <button type="button" aria-label={copy.zoomIn} onClick={() => zoomBy(1.2)}>+</button>
          <button className="reset-view" type="button" onClick={resetView}>{copy.center}</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        className="graph-scene"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="group"
        aria-label={copy.title}
        aria-describedby="graph-instructions"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
      >
        <desc id="graph-instructions">{copy.graphDescription}</desc>
        <g className="graph-world" transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
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
            const connectionCount = (layout.children.get(node.id)?.length ?? 0) + (point.depth > 0 ? 1 : 0)
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

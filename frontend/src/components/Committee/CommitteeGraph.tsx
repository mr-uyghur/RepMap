import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { Representative } from '../../types'
import { PARTY_COLORS } from '../../constants'
import './CommitteeGraph.css'

interface GraphNode extends d3.SimulationNodeDatum {
  id: number
  rep: Representative
  committees: string[]
  radius: number
  color: string
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  shared: number
}

interface Props {
  representatives: Representative[]
  committeeFilter: string | null
  onNodeClick: (rep: Representative) => void
}

function buildGraph(
  reps: Representative[],
  committeeFilter: string | null,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Only reps with committee assignments.
  let eligible = reps.filter((r) => (r.committee_assignments?.length ?? 0) > 0)

  if (committeeFilter) {
    eligible = eligible.filter((r) =>
      r.committee_assignments?.includes(committeeFilter),
    )
  }

  const nodes: GraphNode[] = eligible.map((rep) => {
    const committees = rep.committee_assignments ?? []
    return {
      id: rep.id,
      rep,
      committees,
      radius: 3 + Math.sqrt(committees.length) * 2.2,
      color: PARTY_COLORS[rep.party] ?? '#9ca3af',
    }
  })

  // Build committee → nodeIndex map for O(n·k) edge building.
  const committeeMap = new Map<string, number[]>()
  nodes.forEach((node, i) => {
    node.committees.forEach((c) => {
      const arr = committeeMap.get(c)
      if (arr) arr.push(i)
      else committeeMap.set(c, [i])
    })
  })

  // Collect unique rep-pair edges, counting shared committees.
  const pairCounts = new Map<string, number>()
  committeeMap.forEach((indices) => {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const key = `${indices[a]}-${indices[b]}`
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  })

  const edges: GraphEdge[] = []
  pairCounts.forEach((shared, key) => {
    const [a, b] = key.split('-').map(Number)
    edges.push({ source: nodes[a], target: nodes[b], shared })
  })

  return { nodes, edges }
}

export default function CommitteeGraph({ representatives, committeeFilter, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; rep: Representative; count: number
  } | null>(null)

  const handleNodeClick = useCallback((rep: Representative) => {
    onNodeClick(rep)
  }, [onNodeClick])

  useEffect(() => {
    const container = containerRef.current
    const svgEl = svgRef.current
    if (!container || !svgEl) return

    const { nodes, edges } = buildGraph(representatives, committeeFilter)
    if (nodes.length === 0) return

    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g').attr('class', 'committee-graph-g')

    // Pan + zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(60).strength(0.3))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>((d) => d.radius + 3))
      .alphaDecay(0.02)

    // Edges
    const edgeSel = g.append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('class', 'committee-graph-edge')
      .attr('stroke-opacity', (d) => Math.min(0.15 + d.shared * 0.12, 0.7))

    // Nodes
    const nodeSel = g.append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'committee-graph-node')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => d.color)
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5)

    nodeSel
      .on('mouseenter', (event: MouseEvent, d: GraphNode) => {
        const rect = container.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          rep: d.rep,
          count: d.committees.length,
        })
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = container.getBoundingClientRect()
        setTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (_event: MouseEvent, d: GraphNode) => {
        handleNodeClick(d.rep)
      })

    // Drag
    nodeSel.call(
      d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        }),
    )

    simulation.on('tick', () => {
      edgeSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

      nodeSel
        .attr('cx', (d) => d.x ?? 0)
        .attr('cy', (d) => d.y ?? 0)
    })

    return () => {
      simulation.stop()
      setTooltip(null)
    }
  }, [representatives, committeeFilter, handleNodeClick])

  const { nodes } = buildGraph(representatives, committeeFilter)

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {nodes.length === 0 ? (
        <div className="committee-modal-empty">
          No representatives with committee assignments
          {committeeFilter ? ` on "${committeeFilter}"` : ''}.
        </div>
      ) : (
        <>
          <svg ref={svgRef} className="committee-graph-svg" />
          {tooltip && (
            <div
              className="committee-graph-tooltip"
              style={{
                left: tooltip.x + 14,
                top: tooltip.y - 10,
                transform: tooltip.x > (containerRef.current?.clientWidth ?? 800) - 250
                  ? 'translateX(-110%)'
                  : undefined,
              }}
            >
              <div className="committee-graph-tooltip-name">{tooltip.rep.name}</div>
              <div className="committee-graph-tooltip-meta">
                {tooltip.rep.party.charAt(0).toUpperCase() + tooltip.rep.party.slice(1)} ·{' '}
                {tooltip.rep.state}
              </div>
              <div className="committee-graph-tooltip-committees">
                {tooltip.count} committee{tooltip.count !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { Representative } from '../../types'
import { chamberLabel, partyKey, partyLabel, seatLabel } from '../Compare/compareFormat'
import './CommitteeGraph.css'

interface GraphNode extends d3.SimulationNodeDatum {
  id: number
  rep: Representative
  committees: string[]
  radius: number
  partyKey: 'democrat' | 'republican' | 'independent'
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  shared: number
}

export interface GraphStats {
  nodes: number
  edges: number
  democrat: number
  republican: number
  independent: number
}

interface Props {
  representatives: Representative[]
  committeeFilter: string | null
  chamberFilter?: 'all' | 'senate' | 'house'
  searchQuery?: string
  selectedRep?: Representative | null
  onSelectRep?: (rep: Representative | null) => void
  onSelectCommittee?: (committee: string) => void
  onNodeClick: (rep: Representative) => void
  onStatsChange?: (stats: GraphStats) => void
}

function partyFillVar(pKey: 'democrat' | 'republican' | 'independent'): string {
  if (pKey === 'democrat') return 'var(--color-democrat)'
  if (pKey === 'republican') return 'var(--color-republican)'
  return 'var(--color-independent)'
}

function normalise(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function buildGraph(
  reps: Representative[],
  committeeFilter: string | null,
  chamberFilter: 'all' | 'senate' | 'house',
): { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats } {
  let eligible = reps.filter((r) => (r.committee_assignments?.length ?? 0) > 0)

  if (chamberFilter === 'senate') {
    eligible = eligible.filter((r) => r.level === 'us_senate')
  } else if (chamberFilter === 'house') {
    eligible = eligible.filter((r) => r.level === 'us_house')
  }

  if (committeeFilter) {
    eligible = eligible.filter((r) => r.committee_assignments?.includes(committeeFilter))
  }

  let democrat = 0
  let republican = 0
  let independent = 0

  const nodes: GraphNode[] = eligible.map((rep) => {
    const committees = rep.committee_assignments ?? []
    const pKey = partyKey(rep.party)
    if (pKey === 'democrat') democrat += 1
    else if (pKey === 'republican') republican += 1
    else independent += 1
    return {
      id: rep.id,
      rep,
      committees,
      radius: 4 + Math.sqrt(committees.length) * 2.4,
      partyKey: pKey,
    }
  })

  // Build committee -> nodeIndex map for O(n*k) edge building.
  const committeeMap = new Map<string, number[]>()
  nodes.forEach((node, i) => {
    node.committees.forEach((c) => {
      const arr = committeeMap.get(c)
      if (arr) arr.push(i)
      else committeeMap.set(c, [i])
    })
  })

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

  return {
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      democrat,
      republican,
      independent,
    },
  }
}

export default function CommitteeGraph({
  representatives,
  committeeFilter,
  chamberFilter = 'all',
  searchQuery = '',
  selectedRep = null,
  onSelectRep,
  onSelectCommittee,
  onNodeClick,
  onStatsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    rep: Representative
    count: number
  } | null>(null)
  const [detailPhotoFailed, setDetailPhotoFailed] = useState(false)

  useEffect(() => {
    setDetailPhotoFailed(false)
  }, [selectedRep?.id])

  const { nodes: baseNodes, edges: baseEdges, stats } = useMemo(
    () => buildGraph(representatives, committeeFilter, chamberFilter),
    [representatives, committeeFilter, chamberFilter],
  )

  useEffect(() => {
    onStatsChange?.(stats)
  }, [stats, onStatsChange])

  const matchingIds = useMemo(() => {
    const q = normalise(searchQuery.trim())
    if (!q) return null
    const ids = new Set<number>()
    for (const n of baseNodes) {
      const hay = normalise(`${n.rep.name} ${n.rep.state} ${n.committees.join(' ')}`)
      if (q.split(/\s+/).every((part) => hay.includes(part))) {
        ids.add(n.id)
      }
    }
    return ids
  }, [baseNodes, searchQuery])

  const handleSelectNode = useCallback(
    (rep: Representative) => {
      if (onSelectRep) {
        onSelectRep(rep)
      } else {
        onNodeClick(rep)
      }
    },
    [onSelectRep, onNodeClick],
  )

  useEffect(() => {
    const container = containerRef.current
    const svgEl = svgRef.current
    if (!container || !svgEl) return
    if (baseNodes.length === 0) return

    const nodes: GraphNode[] = baseNodes.map((n) => ({ ...n }))
    const nodeById = new Map<number, GraphNode>(nodes.map((n) => [n.id, n]))
    const edges: GraphEdge[] = baseEdges.map((e) => ({
      shared: e.shared,
      source: nodeById.get((e.source as GraphNode).id)!,
      target: nodeById.get((e.target as GraphNode).id)!,
    }))

    const width = container.clientWidth || 860
    const height = container.clientHeight || 600

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g').attr('class', 'committee-graph-g')

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.18, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    zoomBehaviorRef.current = zoom
    svg.call(zoom)

    // Clicking empty canvas clears selection
    svg.on('click', (event: MouseEvent) => {
      if (event.target === svgEl) {
        onSelectRep?.(null)
      }
    })

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(64).strength(0.28))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-125))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>((d) => d.radius + 3.5))
      .alphaDecay(0.022)

    const edgeSel = g
      .append('g')
      .selectAll<SVGLineElement, GraphEdge>('line')
      .data(edges)
      .join('line')
      .attr('class', 'committee-graph-edge')
      .attr('stroke-opacity', (d) => Math.min(0.14 + d.shared * 0.12, 0.68))

    const nodeSel = g
      .append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'committee-graph-node')
      .attr('data-rep-id', (d) => d.id)
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => partyFillVar(d.partyKey))
      .attr('stroke', 'var(--color-bg-primary)')
      .attr('stroke-width', 1.6)

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
        setTooltip((prev) =>
          prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
        )
      })
      .on('mouseleave', () => setTooltip(null))
      .on('click', (event: MouseEvent, d: GraphNode) => {
        event.stopPropagation()
        handleSelectNode(d.rep)
      })
      .on('dblclick', (event: MouseEvent, d: GraphNode) => {
        event.stopPropagation()
        onNodeClick(d.rep)
      })

    nodeSel.call(
      d3
        .drag<SVGCircleElement, GraphNode>()
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
  }, [baseNodes, baseEdges, handleSelectNode, onNodeClick, onSelectRep])

  // Apply search + selected-node visual emphasis without restarting D3 simulation.
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const selId = selectedRep?.id ?? null
    d3.select(svgEl)
      .selectAll<SVGCircleElement, GraphNode>('circle.committee-graph-node')
      .attr('opacity', (d) => {
        if (selId != null && d.id === selId) return 1
        if (matchingIds) return matchingIds.has(d.id) ? 1 : 0.16
        if (selId != null) return 0.45
        return 0.94
      })
      .attr('stroke', (d) => {
        if (selId != null && d.id === selId) return 'var(--color-accent-text)'
        if (matchingIds && matchingIds.has(d.id)) return 'var(--color-text-primary)'
        return 'var(--color-bg-primary)'
      })
      .attr('stroke-width', (d) => {
        if (selId != null && d.id === selId) return 3.2
        if (matchingIds && matchingIds.has(d.id)) return 2.4
        return 1.5
      })
  }, [matchingIds, selectedRep])

  const handleZoomBy = (factor: number) => {
    const svgEl = svgRef.current
    const zoom = zoomBehaviorRef.current
    if (!svgEl || !zoom) return
    d3.select(svgEl).transition().duration(180).call(zoom.scaleBy, factor)
  }

  const handleResetView = () => {
    const svgEl = svgRef.current
    const zoom = zoomBehaviorRef.current
    if (!svgEl || !zoom) return
    d3.select(svgEl).transition().duration(220).call(zoom.transform, d3.zoomIdentity)
  }

  const selectedPartyKey = selectedRep ? partyKey(selectedRep.party) : 'independent'

  return (
    <div ref={containerRef} className="committee-graph-stage">
      {baseNodes.length === 0 ? (
        <div className="committee-modal-empty" role="status">
          No representatives match{committeeFilter ? ` "${committeeFilter}"` : ' the current filters'}.
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="committee-graph-svg"
            role="img"
            aria-label={`Force-directed committee co-membership network showing ${baseNodes.length} members`}
          />

          {/* Floating >=44x44px Zoom Controls */}
          <div className="committee-graph-controls" role="group" aria-label="Graph zoom controls">
            <button
              type="button"
              className="committee-graph-ctrl-btn"
              onClick={() => handleZoomBy(1.35)}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="committee-graph-ctrl-btn"
              onClick={() => handleZoomBy(0.74)}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="committee-graph-ctrl-btn"
              onClick={handleResetView}
              aria-label="Reset zoom"
              title="Reset view"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          <p className="committee-graph-hint" aria-hidden="true">
            Drag to pan · Scroll to zoom · Click a legislator node to inspect
          </p>

          {tooltip && (!selectedRep || selectedRep.id !== tooltip.rep.id) && (
            <div
              className="committee-graph-tooltip"
              style={{
                left: tooltip.x + 14,
                top: tooltip.y - 10,
                transform:
                  tooltip.x > (containerRef.current?.clientWidth ?? 800) - 250
                    ? 'translateX(-110%)'
                    : undefined,
              }}
            >
              <div className="committee-graph-tooltip-name">{tooltip.rep.name}</div>
              <div className="committee-graph-tooltip-meta">
                {partyLabel(tooltip.rep.party)} · {chamberLabel(tooltip.rep)}, {seatLabel(tooltip.rep)}
              </div>
              <div className="committee-graph-tooltip-committees">
                {tooltip.count} standing committee{tooltip.count !== 1 ? 's' : ''} · Click to inspect
              </div>
            </div>
          )}

          {selectedRep && (
            <aside
              className={`committee-node-card committee-node-card--${selectedPartyKey}`}
              aria-label={`Selected legislator: ${selectedRep.name}`}
            >
              <div className="committee-node-card-head">
                <div className="committee-node-card-id">
                  {selectedRep.photo_url && !detailPhotoFailed ? (
                    <img
                      src={selectedRep.photo_url}
                      alt=""
                      className={`committee-node-avatar committee-node-avatar--${selectedPartyKey}`}
                      loading="lazy"
                      onError={() => setDetailPhotoFailed(true)}
                    />
                  ) : (
                    <span
                      className={`committee-node-avatar committee-node-avatar--fallback committee-node-avatar--${selectedPartyKey}`}
                      aria-hidden="true"
                    >
                      {initialsOf(selectedRep.name)}
                    </span>
                  )}
                  <div className="committee-node-card-titles">
                    <h3 className="committee-node-name">{selectedRep.name}</h3>
                    <p className="committee-node-sub">
                      {chamberLabel(selectedRep)} · {seatLabel(selectedRep)}
                    </p>
                    <span className={`committee-node-party committee-node-party--${selectedPartyKey}`}>
                      <span className="committee-node-party-dot" aria-hidden="true" />
                      {partyLabel(selectedRep.party)}
                    </span>
                  </div>
                </div>
                {onSelectRep && (
                  <button
                    type="button"
                    className="committee-node-dismiss"
                    onClick={() => onSelectRep(null)}
                    aria-label="Clear selected member"
                  >
                    ×
                  </button>
                )}
              </div>

              {(selectedRep.committee_assignments?.length ?? 0) > 0 && (
                <div className="committee-node-assignments">
                  <p className="committee-node-label">
                    Committees ({selectedRep.committee_assignments?.length})
                  </p>
                  <ul className="committee-node-list">
                    {selectedRep.committee_assignments?.map((c) => {
                      const active = committeeFilter === c
                      return (
                        <li key={c}>
                          {onSelectCommittee ? (
                            <button
                              type="button"
                              className={`committee-node-pill${active ? ' committee-node-pill--active' : ''}`}
                              onClick={() => onSelectCommittee(active ? '' : c)}
                            >
                              <span>{c}</span>
                              <span className="committee-node-pill-hint">
                                {active ? 'Filtered' : 'Filter'}
                              </span>
                            </button>
                          ) : (
                            <span className="committee-node-pill">{c}</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="committee-node-cta"
                onClick={() => onNodeClick(selectedRep)}
              >
                <span>Open Member Dossier</span>
                <span aria-hidden="true">→</span>
              </button>
            </aside>
          )}
        </>
      )}
    </div>
  )
}

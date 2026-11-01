import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, BookOpen, FileText, Leaf, Pill, Shapes, Siren } from 'lucide-react'
import { memo, useEffect, useMemo, type ComponentType } from 'react'
import { cn } from '../lib/format'

export interface GNode { id: string; label: string; type: string; data: Record<string, unknown> }
export interface GEdge { id: string; source: string; target: string; relation: string; data: Record<string, unknown> }

export const NODE_TYPES_META: Record<string, { label: string; color: string; bg: string; icon: ComponentType<{ className?: string }> }> = {
  note: { label: 'Specialist note', color: '#111a38', bg: '#e9ecf6', icon: FileText },
  medication: { label: 'Medication', color: '#4169f5', bg: '#eaf0ff', icon: Pill },
  diet: { label: 'Food / nutrient', color: '#12a873', bg: '#e7f8f1', icon: Leaf },
  lifestyle: { label: 'Lifestyle factor', color: '#7b5cd6', bg: '#f1edff', icon: Activity },
  class: { label: 'KG class', color: '#0e9fb5', bg: '#e5f8fa', icon: Shapes },
  guideline: { label: 'Guideline evidence', color: '#c27c00', bg: '#fff5e0', icon: BookOpen },
  conflict: { label: 'Candidate conflict', color: '#d03b3b', bg: '#fdecec', icon: Siren },
}

const COLUMN: Record<string, number> = { note: 0, medication: 1, diet: 1, lifestyle: 1, class: 2, conflict: 3, guideline: 4 }

/** Deterministic force layout seeded by type columns (kept small & dependency-free). */
function layout(nodes: GNode[], edges: GEdge[], width = 1400, height = 900) {
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>()
  const perCol: Record<number, number> = {}
  nodes.forEach((n) => {
    const c = COLUMN[n.type] ?? 2
    const k = (perCol[c] = (perCol[c] ?? 0) + 1)
    pos.set(n.id, { x: 80 + c * (width / 4.6), y: 60 + ((k * 97) % height), vx: 0, vy: 0 })
  })
  const ids = nodes.map((n) => n.id)
  for (let it = 0; it < 220; it++) {
    const t = 1 - it / 220
    for (let i = 0; i < ids.length; i++) {
      const a = pos.get(ids[i])!
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos.get(ids[j])!
        let dx = a.x - b.x
        let dy = a.y - b.y
        const d2 = dx * dx + dy * dy + 0.01
        if (d2 > 90000) continue
        const f = 2600 / d2
        const d = Math.sqrt(d2)
        dx /= d
        dy /= d
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f
      }
    }
    for (const e of edges) {
      const a = pos.get(e.source), b = pos.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01
      const f = (d - 150) * 0.012
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    nodes.forEach((n) => {
      const p = pos.get(n.id)!
      const targetX = 80 + (COLUMN[n.type] ?? 2) * (width / 4.6)
      p.vx += (targetX - p.x) * 0.015
      p.vy += (height / 2 - p.y) * 0.002
      p.x += Math.max(-30, Math.min(30, p.vx)) * t
      p.y += Math.max(-30, Math.min(30, p.vy)) * t
      p.vx *= 0.5; p.vy *= 0.5
    })
  }
  return pos
}

type NodeData = { g: GNode; dim: boolean; hl: boolean; compact: boolean }

const GraphNode = memo(function GraphNode({ data }: NodeProps<Node<NodeData>>) {
  const { g, dim, hl, compact } = data
  const m = NODE_TYPES_META[g.type] ?? NODE_TYPES_META.class
  const Icon = m.icon
  const isConflict = g.type === 'conflict'
  return (
    <div className={cn('transition-opacity duration-300', dim && 'opacity-20')}>
      <Handle type="target" position={Position.Left} className="!size-1 !min-w-0 !border-0 !bg-transparent" />
      <div
        className={cn('relative flex items-center gap-1.5 rounded-full border bg-white pr-3 pl-1 py-1 shadow-sm', hl && 'ring-4', compact && 'pr-1')}
        style={{ borderColor: `${m.color}55`, ['--tw-ring-color' as string]: `${m.color}33` }}
      >
        <span className="relative grid size-6 place-items-center rounded-full" style={{ background: m.bg, color: m.color }}>
          {isConflict && <span className="pulse-ring absolute inset-0 rounded-full" style={{ color: `${m.color}55` }} />}
          <Icon className="relative size-3.5" />
        </span>
        {!compact && <span className="max-w-[170px] truncate text-[11px] font-semibold text-ink">{g.label}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!size-1 !min-w-0 !border-0 !bg-transparent" />
    </div>
  )
})

const nodeTypes = { g: GraphNode }

export interface GraphViewProps {
  nodes: GNode[]
  edges: GEdge[]
  compact?: boolean
  hiddenTypes?: Set<string>
  relationFilter?: string
  search?: string
  selected?: string | null
  onSelect?: (n: GNode | null) => void
  height?: number | string
}

function Inner({ nodes: gn, edges: ge, compact, hiddenTypes, relationFilter, search, selected, onSelect, height = 600 }: GraphViewProps) {
  const visibleNodes = useMemo(() => gn.filter((n) => !hiddenTypes?.has(n.type)), [gn, hiddenTypes])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => ge.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && (!relationFilter || e.relation.startsWith(relationFilter))),
    [ge, visibleIds, relationFilter],
  )
  const positions = useMemo(() => layout(visibleNodes, visibleEdges), [visibleNodes, visibleEdges])

  const focus = useMemo(() => {
    const q = search?.trim().toLowerCase()
    if (selected) return selected
    if (q) return visibleNodes.find((n) => n.label.toLowerCase().includes(q))?.id ?? null
    return null
  }, [selected, search, visibleNodes])

  const neighbours = useMemo(() => {
    if (!focus) return null
    const s = new Set([focus])
    visibleEdges.forEach((e) => {
      if (e.source === focus) s.add(e.target)
      if (e.target === focus) s.add(e.source)
    })
    return s
  }, [focus, visibleEdges])

  const rfNodes: Node<NodeData>[] = useMemo(
    () =>
      visibleNodes.map((g) => {
        const p = positions.get(g.id)!
        return { id: g.id, type: 'g', position: { x: p.x, y: p.y }, data: { g, dim: !!neighbours && !neighbours.has(g.id), hl: focus === g.id, compact: !!compact } }
      }),
    [visibleNodes, positions, neighbours, focus, compact],
  )
  const rfEdges: Edge[] = useMemo(
    () =>
      visibleEdges.map((e) => {
        const trig = e.relation === 'TRIGGERS' || e.relation === 'SUPPORTS'
        const inFocus = !neighbours || (neighbours.has(e.source) && neighbours.has(e.target))
        const color = e.relation === 'TRIGGERS' ? '#d03b3b' : e.relation === 'SUPPORTS' ? '#c27c00' : e.relation === 'INTERACTS_WITH' ? '#eb6834' : '#b8c3dd'
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: trig && inFocus,
          label: !compact && focus && inFocus ? e.relation.replace('INSTRUCTS:', '') : undefined,
          labelStyle: { fontSize: 9, fontWeight: 700, fill: '#4a5677' },
          labelBgStyle: { fill: '#fff' },
          style: { stroke: color, strokeWidth: trig ? 1.8 : 1.1, opacity: inFocus ? 0.9 : 0.12, strokeDasharray: e.relation === 'SUBCLASS_OF' ? '4 3' : undefined },
        }
      }),
    [visibleEdges, neighbours, compact, focus],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
  useEffect(() => setNodes((cur) => rfNodes.map((n) => ({ ...n, position: cur.find((c) => c.id === n.id)?.position ?? n.position }))), [rfNodes, setNodes])
  useEffect(() => setEdges(rfEdges), [rfEdges, setEdges])

  const { fitView } = useReactFlow()
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60)
    return () => clearTimeout(t)
  }, [visibleNodes.length, fitView])

  return (
    <div style={{ height }} className="relative w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect?.(n.data.g)}
        onPaneClick={() => onSelect?.(null)}
        fitView
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={!compact}
        panOnDrag={!compact}
        zoomOnScroll={!compact}
        zoomOnPinch={!compact}
        zoomOnDoubleClick={!compact}
        elementsSelectable={!compact}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1.2} color="#d6def2" />
        {!compact && <Controls showInteractive={false} />}
        {!compact && <MiniMap pannable zoomable nodeColor={(n) => NODE_TYPES_META[(n.data as NodeData).g.type]?.color ?? '#999'} maskColor="rgba(244,247,255,.7)" className="!rounded-xl !border !border-line" />}
      </ReactFlow>
    </div>
  )
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}

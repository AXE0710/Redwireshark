"use client"

import { Globe, Router, Server, Smartphone } from "lucide-react"

export type NodeRole = "device" | "router" | "server" | "domain" | "unknown"

export type DiagramNode = {
  id: string // ip
  label?: string | null
  role: NodeRole
}

export type DiagramEdge = {
  from: string // ip
  to: string // ip
  count: number
}

function RoleIcon({ role }: { role: NodeRole }) {
  const common = "w-5 h-5 text-blue-600"
  switch (role) {
    case "device":
      return <Smartphone className={common} aria-hidden="true" />
    case "router":
      return <Router className={common} aria-hidden="true" />
    case "server":
      return <Server className={common} aria-hidden="true" />
    case "domain":
      return <Globe className={common} aria-hidden="true" />
    default:
      return <Globe className={common} aria-hidden="true" />
  }
}

export function NetworkDiagram({
  nodes,
  edges,
}: {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}) {
  const width = 720
  const height = 200
  const padX = 48
  const usable = width - padX * 2
  const step = nodes.length > 1 ? usable / (nodes.length - 1) : 0

  const positions = new Map<string, { x: number; y: number }>()
  nodes.forEach((n, i) => {
    positions.set(n.id, { x: padX + i * step, y: height / 2 })
  })

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="Network diagram">
        {edges.map((e, idx) => {
          const a = positions.get(e.from)
          const b = positions.get(e.to)
          if (!a || !b) return null
          return (
            <g key={`e-${idx}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#2563eb"
                strokeWidth={Math.max(2, Math.min(8, e.count))}
                opacity={0.75}
              />
              <polygon
                points={`${b.x},${b.y} ${b.x - 6},${b.y - 4} ${b.x - 6},${b.y + 4}`}
                fill="#2563eb"
                opacity={0.9}
              />
            </g>
          )
        })}

        {nodes.map((n) => {
          const p = positions.get(n.id)!
          return (
            <g key={n.id} transform={`translate(${p.x - 16},${p.y - 16})`}>
              <foreignObject width={32} height={32}>
                <div className="flex items-center justify-center rounded-full bg-white border border-gray-200 w-8 h-8">
                  <RoleIcon role={n.role} />
                </div>
              </foreignObject>
              <text x={16} y={48} textAnchor="middle" fontSize="12" fill="#111827" className="select-none">
                {n.label || n.id}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

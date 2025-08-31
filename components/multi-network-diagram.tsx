"use client"

import * as React from "react"
import type { GraphLink, GraphNode } from "@/lib/parse-multi"
import { Smartphone, Router, Server, Globe } from "lucide-react"

export type NodeInfo = {
  id: string
  hostname?: string | null
  role?: "device" | "router" | "server" | "domain" | "unknown"
}

function roleIcon(role?: NodeInfo["role"]) {
  switch (role) {
    case "router":
      return Router
    case "server":
      return Server
    case "domain":
      return Globe
    case "device":
    default:
      return Smartphone
  }
}

export function MultiNetworkDiagram({
  nodes,
  links,
  nodeInfo,
  selected,
  onSelectConversation,
}: {
  nodes: GraphNode[]
  links: GraphLink[]
  nodeInfo?: Record<string, NodeInfo>
  selected?: string | null // conversation key: "src->dst"
  onSelectConversation?: (key: string) => void
}) {
  // Layout: place nodes on a circle for simplicity
  const size = 360
  const radius = 140
  const center = { x: size / 2, y: size / 2 }

  const positions = React.useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    const n = nodes.length || 1
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n
      pos[node.id] = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      }
    })
    return pos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(nodes)])

  return (
    <div className="w-full rounded-md border border-gray-200 bg-white">
      <div className="px-3 py-2 text-sm font-medium text-gray-900">Network Diagram</div>
      <div className="flex items-center justify-center p-3">
        <svg width={size} height={size} role="img" aria-label="Network diagram">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
              <path d="M0,0 L0,8 L8,4 z" fill="#2563eb" />
            </marker>
            <style>
              {`
              .flow {
                stroke-dasharray: 6 8;
                animation: dash 1.2s linear infinite;
              }
              @keyframes dash {
                to { stroke-dashoffset: -14; }
              }
              `}
            </style>
          </defs>

          {/* Links */}
          {links.map((l, idx) => {
            const a = positions[l.source]
            const b = positions[l.target]
            if (!a || !b) return null
            const isSelected = selected === `${l.source}->${l.target}`
            return (
              <g key={`${l.source}-${l.target}-${idx}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isSelected ? "#2563eb" : "#9ca3af"} // blue-600 or gray-400
                  strokeWidth={isSelected ? 3 : 2}
                  className="flow"
                  markerEnd="url(#arrow)"
                  opacity={Math.min(1, 0.35 + Math.log10(l.count + 1) / 3)}
                />
                {/* Count label */}
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 6}
                  fontSize={10}
                  fill="#111827" // gray-900
                  textAnchor="middle"
                >
                  {l.count}
                </text>
                <rect
                  x={(a.x + b.x) / 2 - 18}
                  y={(a.y + b.y) / 2 - 24}
                  width={36}
                  height={14}
                  fill="transparent"
                  onClick={() => onSelectConversation && onSelectConversation(`${l.source}->${l.target}`)}
                />
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map((n, i) => {
            const p = positions[n.id]
            const info = nodeInfo?.[n.id]
            const Icon = roleIcon(info?.role)
            return (
              <g key={n.id}>
                <circle cx={p.x} cy={p.y} r={18} fill="#f3f4f6" stroke="#111827" strokeWidth={1} />
                <foreignObject x={p.x - 10} y={p.y - 10} width="20" height="20" pointerEvents="none">
                  <div className="w-5 h-5 text-gray-900">
                    <Icon width={20} height={20} />
                  </div>
                </foreignObject>
                <text x={p.x} y={p.y + 30} fontSize={10} fill="#111827" textAnchor="middle">
                  {info?.hostname || n.id}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="px-3 pb-3 text-xs text-gray-500">
        Animated dashes indicate active message flow. Click a link count to focus that conversation.
      </p>
    </div>
  )
}

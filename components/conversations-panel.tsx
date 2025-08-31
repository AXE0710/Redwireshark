"use client"
import type { Conversation } from "@/lib/parse-multi"
import { cn } from "@/lib/utils"

export function ConversationsPanel({
  conversations,
  selected,
  onSelect,
}: {
  conversations: Conversation[]
  selected?: string | null
  onSelect: (key: string | null) => void
}) {
  return (
    <div className="w-full rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-medium text-gray-900 text-pretty">Conversations</h2>
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => onSelect(null)}
          aria-label="Show all conversations"
        >
          Show all
        </button>
      </div>
      <ul className="max-h-64 overflow-auto divide-y divide-gray-100">
        {conversations.map((c) => (
          <li key={c.key}>
            <button
              className={cn(
                "w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                selected === c.key ? "bg-gray-100" : "",
              )}
              onClick={() => onSelect(c.key)}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-900">
                  {c.src} → {c.dst}
                </div>
                <div className="text-xs text-gray-500">{c.count}</div>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Ports: {Array.from(c.ports).slice(0, 4).join(", ") || "—"}
                {c.ports.size > 4 ? " +" + (c.ports.size - 4) : ""}
              </div>
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No conversations detected.</li>}
      </ul>
    </div>
  )
}

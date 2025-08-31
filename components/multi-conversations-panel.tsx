"use client"
import { type Conversation, summarizeConversation } from "@/lib/parse-multi"

type Props = {
  conversations: Conversation[]
  selectedKey?: string
  onSelect: (key: string) => void
}

export default function MultiConversationsPanel({ conversations, selectedKey, onSelect }: Props) {
  return (
    <div className="border rounded-md p-3 bg-white">
      <h2 className="text-sm font-semibold text-gray-900 mb-2 font-sans">Conversations</h2>
      <div className="flex flex-col gap-2 max-h-72 overflow-auto">
        {conversations.map((c) => {
          const sum = summarizeConversation(c)
          const isSel = selectedKey === c.key
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              className={`text-left border rounded-md p-2 transition-colors ${
                isSel ? "border-blue-600 bg-gray-100" : "border-gray-500"
              }`}
              aria-pressed={isSel}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-900 font-sans">
                  {c.a} ↔ {c.b}
                </span>
                <span className="text-xs text-gray-500">{sum.totalMessages} msgs</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Ports A: {sum.ports.a.join(", ") || "—"} | Ports B: {sum.ports.b.join(", ") || "—"}
              </div>
            </button>
          )
        })}
        {conversations.length === 0 && <p className="text-sm text-gray-500">No conversations detected yet.</p>}
      </div>
    </div>
  )
}

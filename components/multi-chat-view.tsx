"use client"

import * as React from "react"
import type { Message } from "@/lib/parse-multi"

export function MultiChatView({
  messages,
  selectedKey,
}: {
  messages: Message[]
  selectedKey: string | null
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [messages, selectedKey])

  if (!selectedKey) {
    return (
      <div className="h-80 w-full overflow-auto rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-500">
        Select a conversation to see the chat view.
      </div>
    )
  }

  const [src, dst] = selectedKey.split("->")
  const filtered = messages.filter((m) => m.src === src && m.dst === dst)

  return (
    <div
      ref={ref}
      className="h-80 w-full overflow-auto rounded-md border border-gray-200 bg-white p-3"
      aria-live="polite"
      aria-label="Conversation messages"
    >
      <ul className="space-y-2">
        {filtered.map((m, idx) => {
          const mine = m.src === src
          return (
            <li key={idx} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[75%] rounded-md px-3 py-2 text-sm leading-relaxed ${
                  mine ? "bg-blue-600 text-white" : "bg-gray-900 text-white"
                }`}
              >
                <div className="text-xs opacity-80 mb-1">
                  {m.src}
                  {m.srcPort ? ":" + m.srcPort : ""} → {m.dst}
                  {m.dstPort ? ":" + m.dstPort : ""}
                </div>
                <div>{m.data || m.raw}</div>
              </div>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="text-sm text-gray-500">No messages in this direction.</li>}
      </ul>
    </div>
  )
}

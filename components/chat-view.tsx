"use client"

import { useEffect, useMemo, useRef } from "react"
import type { Conversation, Message } from "@/lib/parse-log"

export function ChatView({ conversation }: { conversation: Conversation | null }) {
  const endRef = useRef<HTMLDivElement | null>(null)

  const messages = conversation?.messages ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length])

  const headerHelp = useMemo(() => {
    if (!conversation) return "No conversation loaded. Upload a file to begin."
    return `Showing messages between Party A (${conversation.partyA}) and Party B (${conversation.partyB}).`
  }, [conversation])

  return (
    <div className="w-full">
      <p className="text-xs text-gray-900/70">{headerHelp}</p>

      <div
        className="mt-3 h-[60vh] w-full overflow-y-auto rounded-md border border-gray-900/10 bg-white p-3"
        role="log"
        aria-live="polite"
        aria-label="Conversation messages"
      >
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isA = message.party === "A"

  return (
    <li className={`flex ${isA ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 ${isA ? "bg-blue-600 text-white" : "bg-gray-900 text-white"}`}
        aria-label={isA ? "Message from Party A" : "Message from Party B"}
      >
        <div className="text-[11px] opacity-90">
          <span className="font-semibold">{isA ? "Party A" : "Party B"}</span>
          {" · "}
          <span className="font-medium">SRC:</span> {message.srcIp}
          {" · "}
          <span className="font-medium">DST:</span> {message.dstIp}
          {message.timestamp ? (
            <>
              {" · "}
              <span className="font-medium">TS:</span> {message.timestamp}
            </>
          ) : null}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm">{message.data}</div>
      </div>
    </li>
  )
}

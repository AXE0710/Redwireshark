"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { FileDropzone } from "./file-dropzone"
import { ChatView } from "./chat-view"
import { InfoSidebar } from "./info-sidebar"
import { NetworkDiagram } from "./network-diagram"
import { parseAnyLog, type ParsedConversation } from "@/lib/parse-any"

type IpInfo = {
  ip: string
  hostname?: string | null
  asn?: string | null
  org?: string | null
  isp?: string | null
  country?: string | null
  city?: string | null
  scope?: "private" | "public" | "cgnat" | "loopback" | "link-local" | "unknown"
  role?: "device" | "router" | "server" | "domain" | "unknown"
  provider?: string | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function LogChatApp() {
  const [raw, setRaw] = useState<string>("")
  const [parsed, setParsed] = useState<ParsedConversation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const aIp = parsed?.participants?.A || null
  const bIp = parsed?.participants?.B || null

  const { data: aInfo } = useSWR<IpInfo>(aIp ? `/api/ipinfo?ip=${encodeURIComponent(aIp)}` : null, fetcher)
  const { data: bInfo } = useSWR<IpInfo>(bIp ? `/api/ipinfo?ip=${encodeURIComponent(bIp)}` : null, fetcher)

  const onText = (text: string) => {
    setRaw(text)
    setError(null)
    try {
      const result = parseAnyLog(text)
      setParsed(result)
    } catch (e: any) {
      setParsed(null)
      setError(e?.message || "Failed to parse log.")
    }
  }

  const clearAll = () => {
    setRaw("")
    setParsed(null)
    setError(null)
  }

  const counts = useMemo(() => {
    if (!parsed?.messages) return { aToB: 0, bToA: 0, total: 0 }
    const a = parsed.participants.A
    const b = parsed.participants.B
    let aToB = 0
    let bToA = 0
    for (const m of parsed.messages) {
      if (m.src === a && m.dst === b) aToB++
      else if (m.src === b && m.dst === a) bToA++
    }
    return { aToB, bToA, total: parsed.messages.length }
  }, [parsed])

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <section aria-label="Input" className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <FileDropzone
          onText={onText}
          placeholder="Drop a log file here or click to select. Supports JSONL, CSV, pipes, syslog-like, and generic text."
          accept=".txt,.log,.csv,.jsonl,.json"
        />
        <div>
          <label htmlFor="paste" className="mb-1 block text-sm font-medium text-gray-900">
            Or paste log content
          </label>
          <textarea
            id="paste"
            value={raw}
            onChange={(e) => onText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-900 outline-none ring-blue-600 focus:ring-2"
            placeholder="Paste your log here..."
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {parsed?.participants
              ? `Detected conversation: ${parsed.participants.A} ↔ ${parsed.participants.B} (${counts.total} messages)`
              : "No conversation detected yet."}
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Clear
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <div className="md:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="mb-2 text-pretty text-lg font-semibold text-gray-900">Conversation</h2>
            <ChatView
              messages={parsed?.messages || []}
              aIp={parsed?.participants?.A || ""}
              bIp={parsed?.participants?.B || ""}
            />
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Participants</h2>
            <InfoSidebar aInfo={aInfo || null} bInfo={bInfo || null} />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Diagram</h2>
            <NetworkDiagram
              a={aInfo || (aIp ? { ip: aIp } : null)}
              b={bInfo || (bIp ? { ip: bIp } : null)}
              counts={counts}
            />
          </div>
          {parsed?.summary && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Summary</h2>
              <ul className="list-disc pl-5 text-sm text-gray-900">
                {parsed.summary.keywords.length > 0 && (
                  <li>
                    Keywords: <span className="text-gray-500">{parsed.summary.keywords.join(", ")}</span>
                  </li>
                )}
                {parsed.summary.ports.length > 0 && (
                  <li>
                    Ports seen: <span className="text-gray-500">{parsed.summary.ports.join(", ")}</span>
                  </li>
                )}
                <li>
                  Who talks more:{" "}
                  <span className="text-gray-500">
                    {counts.aToB === counts.bToA
                      ? "Balanced"
                      : counts.aToB > counts.bToA
                        ? "Party A → B"
                        : "Party B → A"}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}

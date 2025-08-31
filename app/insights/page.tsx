"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { parseAnyLog, type AnyMsg } from "@/lib/parse-any"
import { summarizeConversation } from "@/lib/summarize"
import type { IpInfo } from "@/components/info-sidebar"
import { InfoSidebar } from "@/components/info-sidebar"
import { NetworkDiagram, type DiagramEdge, type DiagramNode } from "@/components/network-diagram"

type Party = { A: string; B: string }

function classifyParties(msgs: AnyMsg[]): Party {
  if (!msgs.length) return { A: "", B: "" }
  // pick most frequent pair of IPs by co-occurrence
  const counts = new Map<string, number>() // "ip1|ip2" sorted
  for (const m of msgs) {
    const a = m.src,
      b = m.dst
    const key = [a, b].sort().join("|")
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!top) return { A: msgs[0].src, B: msgs[0].dst }
  const [x, y] = top.split("|")
  // party A is whichever appears as src first chronologically
  const first = msgs.find((m) => (m.src === x && m.dst === y) || (m.src === y && m.dst === x))
  if (!first) return { A: x, B: y }
  return first.src === x ? { A: x, B: y } : { A: y, B: x }
}

function ChatBubble({ side, text }: { side: "left" | "right"; text: string }) {
  const align = side === "left" ? "self-start text-left" : "self-end text-right"
  const bubble = side === "left" ? "bg-white border border-blue-600 text-gray-900" : "bg-gray-900 text-white"
  return <div className={`max-w-[85%] rounded px-3 py-2 ${bubble} ${align}`}>{text || "(no data)"}</div>
}

export default function InsightsPage() {
  const [text, setText] = useState("")
  const [msgs, setMsgs] = useState<AnyMsg[]>([])
  const [party, setParty] = useState<Party>({ A: "", B: "" })
  const [ipInfos, setIpInfos] = useState<IpInfo[]>([])
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    if (!msgs.length || !party.A || !party.B) return []
    return msgs.filter((m) => (m.src === party.A && m.dst === party.B) || (m.src === party.B && m.dst === party.A))
  }, [msgs, party])

  const summary = useMemo(
    () =>
      filtered.length
        ? summarizeConversation(
            filtered.map((m) => ({
              src: m.src,
              dst: m.dst,
              data: m.data,
              sPort: m.sPort,
              dPort: m.dPort,
            })),
          )
        : null,
    [filtered],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [filtered])

  async function handleTextParse() {
    setLoading(true)
    try {
      const parsed = parseAnyLog(text)
      setMsgs(parsed)
      const p = classifyParties(parsed)
      setParty(p)
      const ips = Array.from(new Set(parsed.flatMap((m) => [m.src, m.dst])))
      const res = await fetch(`/api/ipinfo/batch?ips=${encodeURIComponent(ips.join(","))}`).then((r) => r.json())
      setIpInfos(res)
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const t = await f.text()
    setText(t)
  }

  const nodes: DiagramNode[] = useMemo(() => {
    const map = new Map<string, DiagramNode>()
    for (const info of ipInfos) {
      map.set(info.ip, {
        id: info.ip,
        label: info.hostname || info.org || info.ip,
        role: info.role || "unknown",
      })
    }
    return [...map.values()]
  }, [ipInfos])

  const edges: DiagramEdge[] = useMemo(() => {
    const acc = new Map<string, number>() // from|to
    for (const m of filtered) {
      const k = `${m.src}|${m.dst}`
      acc.set(k, (acc.get(k) || 0) + 1)
    }
    return [...acc.entries()].map(([k, count]) => {
      const [from, to] = k.split("|")
      return { from, to, count }
    })
  }, [filtered])

  const A = party.A,
    B = party.B

  const aInfoObj = useMemo(() => (A ? (ipInfos.find((x) => x.ip === A) ?? null) : null), [ipInfos, A])
  const bInfoObj = useMemo(() => (B ? (ipInfos.find((x) => x.ip === B) ?? null) : null), [ipInfos, B])

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4">
        <h1 className="text-balance text-xl font-semibold text-gray-900">Network Insights</h1>
        <p className="text-gray-500 text-sm">
          Paste any log format (JSONL, CSV, key=value, ip→ip, pipes) and visualize the conversation.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[1fr,20rem] gap-4">
        <section className="space-y-4">
          <div className="rounded border border-gray-200 p-3">
            <label className="text-sm font-medium text-gray-900">Paste log</label>
            <textarea
              className="mt-2 w-full min-h-32 rounded border border-gray-200 p-2 text-sm outline-none"
              placeholder="Paste logs here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <input type="file" accept=".txt,.log,.csv,.json" onChange={handleFile} className="text-sm" />
              <button
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={handleTextParse}
                disabled={!text || loading}
              >
                {loading ? "Parsing..." : "Parse"}
              </button>
              <button
                className="rounded border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900"
                onClick={() => {
                  setText("")
                  setMsgs([])
                  setIpInfos([])
                  setParty({ A: "", B: "" })
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {filtered.length > 0 && (
            <>
              <div className="rounded border border-gray-200 p-3">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Network Diagram</h2>
                <NetworkDiagram nodes={nodes} edges={edges} />
              </div>

              <div className="rounded border border-gray-200 p-3">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Conversation</h2>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <div>
                    {A ? <span className="font-medium text-gray-900">{A}</span> : "Party A"} on left •{" "}
                    {B ? <span className="font-medium text-gray-900">{B}</span> : "Party B"} on right
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {filtered.map((m, i) => (
                    <ChatBubble key={i} side={m.src === A ? "left" : "right"} text={m.data || ""} />
                  ))}
                  <div ref={endRef} />
                </div>
              </div>
            </>
          )}
        </section>

        <InfoSidebar aIp={A || null} bIp={B || null} aInfo={aInfoObj} bInfo={bInfoObj} summary={summary} />
      </div>
    </main>
  )
}

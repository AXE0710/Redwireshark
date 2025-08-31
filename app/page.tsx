"use client"

import type React from "react"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"

// Types
type Message = {
  src: string
  dst: string
  data?: string
  ts?: number
}

type Conversation = {
  a: string // canonical party A for this pair (first source observed)
  b: string // canonical party B for this pair
  key: string // canonical key "ip1|ip2" (sorted)
  messages: Message[]
}

type IpInfo = {
  ip: string
  success?: boolean
  type?: string
  country?: string
  region?: string
  city?: string
  org?: string
  isp?: string
  asn?: string
  timezone?: string
  hostname?: string
  role?: "device" | "router" | "server" | "domain" | "unknown"
}

type PairItem = {
  key: string
  a: string
  b: string
  count: number
}

// Utilities
const IP_REGEX =
  /(?<![\w:])((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?|(?<![\w:])\[?([a-fA-F0-9:]+)\]?:(\d{1,5})?|(?<![\w:])([a-fA-F0-9:]+)(?![\w:])/g

function stripPort(s: string) {
  // 10.0.0.1:443 -> 10.0.0.1, [2001:db8::1]:80 -> 2001:db8::1
  const m = s.match(/^\[?([a-fA-F0-9:.]+)\]?/)
  return m ? m[1] : s
}

function isPrivateIp(ip: string) {
  // Basic RFC1918 + loopback + link-local + CGNAT
  if (/^10\./.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (/^127\./.test(ip)) return true
  if (/^169\.254\./.test(ip)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return true // 100.64.0.0/10
  // Simple IPv6 private ranges
  if (/^fc|^fd|^fe80/i.test(ip)) return true
  return false
}

function canonicalKey(ip1: string, ip2: string) {
  return [ip1, ip2].sort((a, b) => (a < b ? -1 : 1)).join("|")
}

function safeJsonParse(line: string): any | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function kvLookup(line: string, keys: string[]) {
  for (const k of keys) {
    const m = line.match(new RegExp(`${k}\\s*[=:]\\s*([^\\s,]+)`, "i"))
    if (m) return m[1]
  }
  return undefined
}

// Heuristic multi-format parser: JSONL, CSV (headers), key=value tokens, arrow syntax, fallback to "first two IPs"
const SAMPLE_URL = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ip2-fTTv1BmDuSmEkeboek1rX3W6DcnIG4.csv"

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === delim) {
      out.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

function detectDelimiter(s: string): string | null {
  if (s.includes("\t")) return "\t"
  const counts = [
    { d: ",", n: (s.match(/,/g) || []).length },
    { d: "|", n: (s.match(/\|/g) || []).length },
    { d: ";", n: (s.match(/;/g) || []).length },
  ].sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : null
}

function parseMulti(text: string): Map<string, Conversation> {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const conversations = new Map<string, Conversation>()

  const pushMsg = (srcRaw: string | undefined, dstRaw: string | undefined, data?: string, ts?: number) => {
    if (!srcRaw || !dstRaw) return
    const src = stripPort(String(srcRaw))
    const dst = stripPort(String(dstRaw))
    if (!src || !dst) return
    const key = canonicalKey(src, dst)
    if (!conversations.has(key)) {
      conversations.set(key, { a: src, b: dst, key, messages: [] })
    }
    conversations.get(key)!.messages.push({ src, dst, data, ts })
  }

  // Pass 1: JSONL and key/value and arrow syntax and generic IP pairs
  // Also collect delimited candidate lines for Pass 2
  const delimitedCandidates: { delim: string; header?: string; rows: string[] } = { delim: "", rows: [] }
  const headerSynonymsSrc = [
    "src",
    "source",
    "src_ip",
    "source_ip",
    "client",
    "saddr",
    "ip.src",
    "ip source",
    "source address",
  ].map((s) => s.toLowerCase())
  const headerSynonymsDst = [
    "dst",
    "destination",
    "dst_ip",
    "destination_ip",
    "server",
    "daddr",
    "ip.dst",
    "ip destination",
    "destination address",
  ].map((s) => s.toLowerCase())
  const dataSynonyms = ["data", "message", "msg", "payload", "content", "info"].map((s) => s.toLowerCase())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Try JSONL
    const js = safeJsonParse(line)
    if (js && typeof js === "object") {
      const norm = (v: any) => (v == null ? undefined : String(v))
      const src =
        norm(js.src) ||
        norm(js.source) ||
        norm(js.src_ip) ||
        norm(js.source_ip) ||
        norm(js.client) ||
        norm(js.saddr) ||
        norm(js["SRC"]) ||
        norm(js["Source"])
      const dst =
        norm(js.dst) ||
        norm(js.destination) ||
        norm(js.dst_ip) ||
        norm(js.destination_ip) ||
        norm(js.server) ||
        norm(js.daddr) ||
        norm(js["DST"]) ||
        norm(js["Destination"])
      const data =
        norm(js.data) || norm(js.msg) || norm(js.message) || norm(js.payload) || norm(js.content) || norm(js.info)
      const ts =
        typeof js.ts === "number"
          ? js.ts
          : typeof js.timestamp === "number"
            ? js.timestamp
            : typeof js.time === "number"
              ? js.time
              : undefined
      if (src && dst) {
        pushMsg(src, dst, data, ts)
        continue
      }
    }

    // Try key=value
    const srcKV = kvLookup(line, ["src", "source", "src_ip", "saddr", "client"])
    const dstKV = kvLookup(line, ["dst", "destination", "dst_ip", "daddr", "server"])
    if (srcKV && dstKV) {
      pushMsg(srcKV, dstKV, line)
      continue
    }

    // Arrow syntax
    const arrow = line.match(/([[\]a-fA-F0-9:.]+)\s*->\s*([[\]a-fA-F0-9:.]+)/)
    if (arrow) {
      pushMsg(arrow[1], arrow[2], line)
      continue
    }

    // Collect delimited candidates for pass 2
    const delim = detectDelimiter(line)
    if (delim) {
      if (!delimitedCandidates.delim) delimitedCandidates.delim = delim
      delimitedCandidates.rows.push(line)
      continue
    }

    // Fallback: first two IP-like tokens
    const ips: string[] = []
    let m: RegExpExecArray | null
    const re = new RegExp(IP_REGEX)
    while ((m = re.exec(line)) && ips.length < 2) {
      const hit = m[1] || m[3] || m[5]
      if (hit) ips.push(hit)
    }
    if (ips.length >= 2) {
      pushMsg(ips[0], ips[1], line)
      continue
    }
  }

  // Pass 2: handle CSV/TSV/pipe/semicolon with or without headers
  if (delimitedCandidates.rows.length) {
    const delim = delimitedCandidates.delim || ","
    const maybeHeader = delimitedCandidates.rows[0]
    const headerParts = splitDelimited(maybeHeader, delim).map((h) => h.trim().toLowerCase())
    const hasHeader =
      headerParts.some((h) => headerSynonymsSrc.includes(h)) && headerParts.some((h) => headerSynonymsDst.includes(h))

    let srcIdx = -1
    let dstIdx = -1
    let dataIdx = -1

    if (hasHeader) {
      headerParts.forEach((h, idx) => {
        if (srcIdx < 0 && headerSynonymsSrc.includes(h)) srcIdx = idx
        if (dstIdx < 0 && headerSynonymsDst.includes(h)) dstIdx = idx
        if (dataIdx < 0 && dataSynonyms.includes(h)) dataIdx = idx
      })
    } else {
      // No header: guess columns by scanning first few lines and picking first two IP-looking columns
      const sample = delimitedCandidates.rows.slice(0, 10)
      for (const row of sample) {
        const parts = splitDelimited(row, delim)
        for (let i = 0; i < parts.length; i++) {
          if (srcIdx < 0 && /[a-fA-F0-9:.]/.test(parts[i]) && /\d/.test(parts[i])) srcIdx = i
          else if (dstIdx < 0 && i !== srcIdx && /[a-fA-F0-9:.]/.test(parts[i]) && /\d/.test(parts[i])) {
            dstIdx = i
            break
          }
        }
        if (srcIdx >= 0 && dstIdx >= 0) break
      }
    }

    const startIdx = hasHeader ? 1 : 0
    for (let j = startIdx; j < delimitedCandidates.rows.length; j++) {
      const parts = splitDelimited(delimitedCandidates.rows[j], delim)
      const src = srcIdx >= 0 ? parts[srcIdx] : undefined
      const dst = dstIdx >= 0 ? parts[dstIdx] : undefined
      let data: string | undefined = undefined
      if (dataIdx >= 0 && parts[dataIdx]) data = parts[dataIdx]
      // If still no data, attach full row for context
      if (!data) data = delimitedCandidates.rows[j]
      if (src && dst) pushMsg(src, dst, data)
    }
  }

  return conversations
}

// Simple role classification with heuristics
function classifyRole(ip: string, info?: Partial<IpInfo>): IpInfo["role"] {
  if (info?.hostname && /\.(?:com|net|org|io|co|cloud|aws|gcp|azure)/i.test(info.hostname)) return "domain"
  if (info?.org && /(host|colo|cloud|cdn|data center|server)/i.test(info.org)) return "server"
  if (isPrivateIp(ip) && info?.isp && /(gateway|router|home|broadband|fiber|dsl)/i.test(info.isp)) return "router"
  if (isPrivateIp(ip)) return "device"
  if (info?.org || info?.asn) return "server"
  return "unknown"
}

// In-page components
function Uploader({
  onText,
  onFile,
  onLoadSample,
}: {
  onText: (t: string) => void
  onFile: (f: File) => void
  onLoadSample: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState("")

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      if (e.dataTransfer.files && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
    },
    [onFile],
  )

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="w-full rounded-md border border-gray-900/10 bg-white p-3 text-sm text-gray-900"
        role="region"
        aria-label="Upload area"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            className="rounded bg-blue-600 px-3 py-2 text-white text-sm"
            onClick={() => inputRef.current?.click()}
          >
            Choose File
          </button>
          <span className="text-gray-500">or drag & drop a log file here</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,.csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.currentTarget.value = ""
          }}
        />
      </div>
      <div className="mt-3">
        <label className="block text-xs text-gray-500 mb-1">Or paste log text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            'Paste lines like:\nSRC=10.0.0.1:1234 DST=10.0.0.2:80 DATA="GET /"\n10.0.0.1:1234 -> 10.0.0.2:80 ...'
          }
          className="w-full min-h-28 rounded-md border border-gray-900/10 bg-white p-2 text-sm text-gray-900"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="rounded bg-blue-600 px-3 py-2 text-white text-sm" onClick={() => onText(text)}>
            Parse Pasted Log
          </button>
          {/* Load sample dataset via programmatic fetch, and downloadable link */}
          <button
            className="rounded bg-gray-900 px-3 py-2 text-white text-sm"
            onClick={onLoadSample}
            aria-label="Load sample dataset"
            title="Load sample dataset"
          >
            Load Sample Dataset
          </button>
          <a
            className="rounded border border-gray-900/10 px-3 py-2 text-sm text-gray-900 hover:bg-gray-100"
            href={SAMPLE_URL}
            download
          >
            Download Sample CSV
          </a>
        </div>
      </div>
    </div>
  )
}

function ConversationsList({
  items,
  selected,
  onSelect,
}: {
  items: PairItem[]
  selected: string | null
  onSelect: (key: string) => void
}) {
  return (
    <div className="rounded-md border border-gray-900/10 bg-white">
      <div className="border-b px-3 py-2 text-sm font-semibold">Conversations</div>
      <ul className="max-h-72 overflow-auto">
        {items.map((it) => {
          const isSel = it.key === selected
          return (
            <li key={it.key}>
              <button
                className={`w-full px-3 py-2 text-left text-sm ${isSel ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
                onClick={() => onSelect(it.key)}
                aria-pressed={isSel}
              >
                <div className="font-medium">
                  {it.a} ↔ {it.b}
                </div>
                <div className={`text-xs ${isSel ? "text-white/90" : "text-gray-500"}`}>{it.count} messages</div>
              </button>
            </li>
          )
        })}
        {items.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No conversations found yet.</li>}
      </ul>
    </div>
  )
}

function Diagram({
  a,
  b,
  aInfo,
  bInfo,
  messages,
}: {
  a: string
  b: string
  aInfo?: IpInfo | null
  bInfo?: IpInfo | null
  messages: Message[]
}) {
  // Counts for direction
  const aToB = useMemo(() => messages.filter((m) => m.src === a && m.dst === b).length, [messages, a, b])
  const bToA = useMemo(() => messages.filter((m) => m.src === b && m.dst === a).length, [messages, a, b])

  // Animation duration: faster if more traffic
  const durA = Math.max(1.2, 6 - Math.min(aToB, 5))
  const durB = Math.max(1.2, 6 - Math.min(bToA, 5))

  const labelA = aInfo?.hostname || aInfo?.org || a
  const labelB = bInfo?.hostname || bInfo?.org || b

  return (
    <div className="relative w-full select-none overflow-hidden">
      <style>{`
        @keyframes dash-forward { to { stroke-dashoffset: -200; } }
        @keyframes dash-back { to { stroke-dashoffset: 200; } }
        .dashA { stroke-dasharray: 6 8; animation: dash-forward VAR_DURs linear infinite; }
        .dashB { stroke-dasharray: 6 8; animation: dash-back VAR_DURs linear infinite; }
      `}</style>
      <div className="w-full h-56 md:h-72 lg:h-80">
        <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          {/* Nodes */}
          <g transform="translate(120,150)">
            <circle r="40" className="fill-white stroke-gray-500" strokeWidth={1.5} />
            <text className="fill-gray-900 text-[12px]" textAnchor="middle" y={4}>
              {aInfo?.role ? aInfo.role : "A"}
            </text>
          </g>
          <g transform="translate(680,150)">
            <circle r="40" className="fill-white stroke-gray-500" strokeWidth={1.5} />
            <text className="fill-gray-900 text-[12px]" textAnchor="middle" y={4}>
              {bInfo?.role ? bInfo.role : "B"}
            </text>
          </g>

          {/* Labels */}
          <text x="120" y="230" textAnchor="middle" className="fill-gray-900 text-[12px]">
            {labelA}
          </text>
          <text x="680" y="230" textAnchor="middle" className="fill-gray-900 text-[12px]">
            {labelB}
          </text>

          {/* Edges */}
          {aToB > 0 && (
            <>
              <path d="M160,150 C300,80 500,80 640,150" className="stroke-blue-600 fill-none" strokeWidth={2} />
              <path
                d="M160,150 C300,80 500,80 640,150"
                className="stroke-blue-600 fill-none dashA"
                strokeWidth={2}
                style={{ animationDuration: `${durA}s`.replace("s", "s") } as any}
              />
              <text x="400" y="70" textAnchor="middle" className="fill-gray-900 text-[12px]">
                {aToB}
              </text>
            </>
          )}
          {bToA > 0 && (
            <>
              <path d="M160,160 C300,230 500,230 640,160" className="stroke-gray-500 fill-none" strokeWidth={2} />
              <path
                d="M160,160 C300,230 500,230 640,160"
                className="stroke-gray-500 fill-none dashB"
                strokeWidth={2}
                style={{ animationDuration: `${durB}s`.replace("s", "s") } as any}
              />
              <text x="400" y="245" textAnchor="middle" className="fill-gray-900 text-[12px]">
                {bToA}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

function Chat({
  a,
  b,
  messages,
}: {
  a: string
  b: string
  messages: Message[]
}) {
  return (
    <div className="rounded-md border border-gray-900/10 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">Chat</h2>
      <div className="flex flex-col gap-2">
        {messages.length === 0 && <div className="text-sm text-gray-500">No messages yet.</div>}
        {messages.map((m, idx) => {
          const isA = m.src === a
          return (
            <div key={idx} className={`flex ${isA ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                  isA ? "bg-blue-600 text-white" : "bg-gray-900 text-white"
                }`}
                aria-label={isA ? "Message from A" : "Message from B"}
              >
                <div className="text-xs opacity-80 mb-1">
                  {m.src} → {m.dst}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.data || "(no payload)"}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InfoPanel({
  a,
  b,
  aInfo,
  bInfo,
  onRefresh,
}: {
  a: string
  b: string
  aInfo?: IpInfo | null
  bInfo?: IpInfo | null
  onRefresh: () => void
}) {
  const Cell = ({ label, value }: { label: string; value?: string }) => (
    <div className="text-sm">
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value || "—"}</span>
    </div>
  )
  return (
    <div className="rounded-md border border-gray-900/10 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Info</h2>
        <button className="rounded bg-blue-600 px-2 py-1 text-white text-xs" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="mt-2">
        <div className="text-xs font-semibold text-gray-500 mb-1">Party A</div>
        <Cell label="IP" value={a} />
        <Cell label="Hostname" value={aInfo?.hostname} />
        <Cell label="Org" value={aInfo?.org} />
        <Cell label="ASN" value={aInfo?.asn} />
        <Cell label="ISP" value={aInfo?.isp} />
        <Cell label="Geo" value={[aInfo?.city, aInfo?.region, aInfo?.country].filter(Boolean).join(", ")} />
        <Cell label="Role" value={aInfo?.role} />
      </div>
      <div className="mt-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">Party B</div>
        <Cell label="IP" value={b} />
        <Cell label="Hostname" value={bInfo?.hostname} />
        <Cell label="Org" value={bInfo?.org} />
        <Cell label="ASN" value={bInfo?.asn} />
        <Cell label="ISP" value={bInfo?.isp} />
        <Cell label="Geo" value={[bInfo?.city, bInfo?.region, bInfo?.country].filter(Boolean).join(", ")} />
        <Cell label="Role" value={bInfo?.role} />
      </div>
    </div>
  )
}

const APP_EXE_URL = "https://drive.google.com/uc?export=download&id=1xPY9OTq2Ap9rP8yjkgi2qwekZFgzI4-G" // <-- Replace with your actual exe URL

function DownloadAppModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-md p-6 max-w-md w-full shadow-lg">
        <h2 className="text-lg font-semibold mb-2">Instructions to Use Network Log Chat App</h2>
        <ol className="list-decimal ml-4 mb-3 text-sm text-gray-900">
          <li>Locate the downloaded <b>network-log-chat.exe</b> file in your Downloads folder.</li>
          <li>Double-click the file to launch the application.</li>
          <li>If prompted by Windows SmartScreen, click "More info" &gt; "Run anyway".</li>
          <li>Follow the on-screen instructions in the app to upload and analyze your network logs.</li>
        </ol>
        <div className="text-xs text-gray-500 mb-2">
          Need help? Contact support at <a href="mailto:support@yourdomain.com" className="underline">support@yourdomain.com</a>
        </div>
        <button className="rounded bg-blue-600 px-4 py-2 text-white text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

export default function Page() {
  const [pairs, setPairs] = useState<PairItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [convMap, setConvMap] = useState<Map<string, Conversation>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)

  const selected = useMemo(() => (selectedKey ? convMap.get(selectedKey) || null : null), [selectedKey, convMap])

  // IP enrichment
  const [aInfo, setAInfo] = useState<IpInfo | null>(null)
  const [bInfo, setBInfo] = useState<IpInfo | null>(null)
  const refreshInfo = useCallback(() => {
    if (!selected) return
    const controller = new AbortController()
    ;(async () => {
      try {
        const [aRes, bRes] = await Promise.all([
          fetch(`/api/ipinfo?ip=${encodeURIComponent(selected.a)}`, { signal: controller.signal }),
          fetch(`/api/ipinfo?ip=${encodeURIComponent(selected.b)}`, { signal: controller.signal }),
        ])
        const [aJson, bJson] = await Promise.all([aRes.json(), bRes.json()])
        aJson.role = classifyRole(selected.a, aJson)
        bJson.role = classifyRole(selected.b, bJson)
        setAInfo(aJson)
        setBInfo(bJson)
      } catch {
        // ignore
      }
    })()
    return () => controller.abort()
  }, [selected])

  useEffect(() => {
    setAInfo(null)
    setBInfo(null)
    if (selected) {
      const cleanup = refreshInfo()
      return () => {
        if (typeof cleanup === "function") cleanup()
      }
    }
  }, [selected, refreshInfo])

  // Handle input
  const handleFile = useCallback(async (file: File) => {
    const text = await file.text()
    handleText(text)
  }, [])

  const handleText = useCallback((text: string) => {
    setError(null)
    const map = parseMulti(text)
    if (map.size === 0) {
      setPairs([])
      setConvMap(new Map())
      setSelectedKey(null)
      setError("No valid conversations found in the provided log.")
      return
    }
    // compute counts
    const items: PairItem[] = Array.from(map.values()).map((c) => ({
      key: c.key,
      a: c.a,
      b: c.b,
      count: c.messages.length,
    }))
    // sort by count desc
    items.sort((x, y) => y.count - x.count)
    setPairs(items)
    setConvMap(map)
    setSelectedKey(items[0]?.key || null)
  }, [])

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL)
      const text = await res.text()
      handleText(text)
    } catch (e) {
      setError("Failed to load sample dataset.")
    }
  }, [handleText])

  const handleDownloadApp = useCallback(() => {
    // Start download
    const link = document.createElement("a")
    link.href = APP_EXE_URL
    link.download = "network-log-chat.zip" // or .exe if you uploaded exe
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    // Show modal
    setShowModal(true)
  }, [])

  // Derived for selected pair
  const selectedMessages = useMemo(() => {
    if (!selected) return []
    // Keep only messages between selected a and b
    return selected.messages.filter(
      (m) => (m.src === selected.a && m.dst === selected.b) || (m.src === selected.b && m.dst === selected.a),
    )
  }, [selected])

  return (
    <main className="font-sans min-h-screen bg-gray-100 text-gray-900">
      <DownloadAppModal open={showModal} onClose={() => setShowModal(false)} />
      <header className="w-full border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-pretty text-xl font-semibold">Network Conversations</h1>
          <p className="text-sm text-gray-900/70 mt-1">
            Upload or paste a log. We auto-detect multiple conversations, enrich IPs, show a non-scrollable diagram, and
            render the selected pair’s messages as a chat. Formats: JSONL, CSV/TSV/pipe/semicolon (with or without
            headers), key=value tokens, arrow syntax, or generic lines with two IPs.
          </p>
          {/* Download App Message and Button */}
          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-2">
            <span className="text-sm text-blue-700 font-medium">
              Download our application for more features!
            </span>
            <button
              className="rounded bg-blue-700 px-4 py-2 text-white text-sm font-semibold"
              onClick={handleDownloadApp}
            >
              Download Application
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            {/* Uploader */}
            <Uploader onText={handleText} onFile={handleFile} onLoadSample={loadSample} />

            {error && (
              <div className="mt-4 rounded-md border border-gray-900/10 bg-white p-3 text-sm text-gray-900">
                {error}
              </div>
            )}

            {/* Diagram and Chat */}
            {selected && (
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div className="rounded-md border border-gray-900/10 bg-white p-3">
                  <h2 className="text-sm font-semibold text-gray-900 mb-2">
                    Diagram: {selected.a} ↔ {selected.b}
                  </h2>
                  <Diagram a={selected.a} b={selected.b} aInfo={aInfo} bInfo={bInfo} messages={selectedMessages} />
                </div>
                <Chat a={selected.a} b={selected.b} messages={selectedMessages} />
              </div>
            )}
          </div>

          {/* Conversations + Info */}
          <div className="md:col-span-1">
            <ConversationsList items={pairs} selected={selectedKey} onSelect={setSelectedKey} />
            {selected && (
              <div className="mt-4">
                <InfoPanel a={selected.a} b={selected.b} aInfo={aInfo} bInfo={bInfo} onRefresh={refreshInfo} />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export type Message = {
  ts?: number
  src: string
  dst: string
  srcPort?: number
  dstPort?: number
  protocol?: string
  data?: string
  raw: string
}

export type ConversationKey = string // "src->dst"
export type Conversation = {
  key: ConversationKey
  src: string
  dst: string
  count: number
  bytes?: number
  ports: Set<number>
  protocols: Set<string>
}

export type GraphNode = {
  id: string // IP
}

export type GraphLink = {
  source: string
  target: string
  count: number
}

const ipRe = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/g
const ipPortRe = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?::(\d{1,5}))?\b/g

function toNum(val: any): number | undefined {
  const n = Number(val)
  return Number.isFinite(n) ? n : undefined
}

function safeJsonParse(line: string): any | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function parseTimeAny(v: any): number | undefined {
  if (!v) return undefined
  const t = typeof v === "number" ? v : Date.parse(String(v))
  return Number.isFinite(t) ? t : undefined
}

function firstTwoIPs(line: string): { a?: string; b?: string; aPort?: number; bPort?: number } {
  let m: RegExpExecArray | null
  const ips: string[] = []
  const ports: (number | undefined)[] = []
  ipPortRe.lastIndex = 0
  while ((m = ipPortRe.exec(line)) && ips.length < 2) {
    ips.push(m[0].split(":")[0])
    ports.push(toNum(m[1]))
  }
  return { a: ips[0], b: ips[1], aPort: ports[0], bPort: ports[1] }
}

// Detect common formats per line and extract a message if possible
function parseLine(line: string): Message | null {
  const raw = line.trim()
  if (!raw) return null

  // 1) JSON or JSONL-like with common keys
  const j = safeJsonParse(raw)
  if (j && (j.src || j.source || j.client || j.dst || j.dest || j.server)) {
    const src = String(j.src || j.source || j.client || "")
    const dst = String(j.dst || j.dest || j.server || "")
    if (src && dst) {
      return {
        ts: parseTimeAny(j.ts || j.time || j.timestamp),
        src,
        dst,
        srcPort: toNum(j.srcPort || j.sport || j.clientPort),
        dstPort: toNum(j.dstPort || j.dport || j.serverPort),
        protocol: j.proto || j.protocol,
        data: j.data || j.payload || j.msg || undefined,
        raw,
      }
    }
  }

  // 2) CSV with headers
  if (raw.includes(",") && !raw.includes("{") && !raw.includes("|")) {
    const parts = raw.split(",").map((s) => s.trim())
    // heuristic for header line: skip
    if (
      parts.some((p) =>
        /^(src|source|client|dst|dest|server|ts|time|timestamp|proto|protocol|data|payload|sport|dport)$/i.test(p),
      )
    ) {
      return null
    }
    // Try positional: src,dst,maybe ports
    const { a, b, aPort, bPort } = firstTwoIPs(raw)
    if (a && b) {
      return {
        src: a,
        dst: b,
        srcPort: aPort,
        dstPort: bPort,
        data: parts.slice(2).join(","),
        raw,
      }
    }
  }

  // 3) Pipe-delimited (original expected format)
  if (raw.includes("|")) {
    const fields = raw.split("|").map((s) => s.trim())
    // Try to find SRC, DST, DATA by label if present
    const labels = fields.map((f) => f.toLowerCase())
    const srcIdx =
      labels.findIndex((x) => /^src|source|client$/.test(x)) !== -1
        ? labels.findIndex((x) => /^src|source|client$/.test(x)) + 1
        : -1
    const dstIdx =
      labels.findIndex((x) => /^dst|dest|server$/.test(x)) !== -1
        ? labels.findIndex((x) => /^dst|dest|server$/.test(x)) + 1
        : -1
    const dataIdx =
      labels.findIndex((x) => /^data|payload|msg$/.test(x)) !== -1
        ? labels.findIndex((x) => /^data|payload|msg$/.test(x)) + 1
        : -1

    // If labels not found, fallback to first two IPs
    if (srcIdx === -1 || dstIdx === -1) {
      const { a, b, aPort, bPort } = firstTwoIPs(raw)
      if (a && b) {
        return {
          src: a,
          dst: b,
          srcPort: aPort,
          dstPort: bPort,
          data: dataIdx !== -1 ? fields[dataIdx] : undefined,
          raw,
        }
      }
    } else {
      const src = fields[srcIdx]
      const dst = fields[dstIdx]
      if (src && dst) {
        return {
          src,
          dst,
          data: dataIdx !== -1 ? fields[dataIdx] : undefined,
          raw,
        }
      }
    }
  }

  // 4) Arrow lines: "ip:port -> ip:port"
  if (raw.includes("->")) {
    const [left, right] = raw.split("->").map((s) => s.trim())
    const { a, aPort } = firstTwoIPs(left)
    const { a: b, aPort: bPort } = firstTwoIPs(right)
    if (a && b) {
      return {
        src: a,
        dst: b,
        srcPort: aPort,
        dstPort: bPort,
        data: raw,
        raw,
      }
    }
  }

  // 5) Generic line: take first two IPs seen
  const { a, b, aPort, bPort } = firstTwoIPs(raw)
  if (a && b) {
    return {
      src: a,
      dst: b,
      srcPort: aPort,
      dstPort: bPort,
      data: raw,
      raw,
    }
  }

  return null
}

export function parseMulti(input: string) {
  const lines = input.split(/\r?\n/)

  const messages: Message[] = []
  for (const line of lines) {
    const m = parseLine(line)
    if (m) messages.push(m)
  }

  const convMap = new Map<ConversationKey, Conversation>()
  const nodeSet = new Set<string>()
  const linkMap = new Map<string, GraphLink>() // key: "src->dst"

  for (const m of messages) {
    nodeSet.add(m.src)
    nodeSet.add(m.dst)
    const key = `${m.src}->${m.dst}`
    let c = convMap.get(key)
    if (!c) {
      c = {
        key,
        src: m.src,
        dst: m.dst,
        count: 0,
        ports: new Set<number>(),
        protocols: new Set<string>(),
      }
      convMap.set(key, c)
    }
    c.count++
    if (m.srcPort) c.ports.add(m.srcPort)
    if (m.dstPort) c.ports.add(m.dstPort)
    if (m.protocol) c.protocols.add(m.protocol)

    // links
    let lk = linkMap.get(key)
    if (!lk) {
      lk = { source: m.src, target: m.dst, count: 0 }
      linkMap.set(key, lk)
    }
    lk.count++
  }

  const conversations = Array.from(convMap.values()).sort((a, b) => b.count - a.count)
  const nodes: GraphNode[] = Array.from(nodeSet).map((id) => ({ id }))
  const links: GraphLink[] = Array.from(linkMap.values()).sort((a, b) => b.count - a.count)

  return {
    messages,
    conversations,
    nodes,
    links,
  }
}

export function summarizeConversation(c: Conversation) {
  return {
    key: c.key,
    src: c.src,
    dst: c.dst,
    totalMessages: c.count,
    // Without per-direction breakdown available on Conversation alone,
    // use the known union of observed ports for both sides.
    ports: {
      a: Array.from(c.ports.values()),
      b: Array.from(c.ports.values()),
    },
    protocols: Array.from(c.protocols.values()),
  }
}

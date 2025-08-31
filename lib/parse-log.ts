export type Party = "A" | "B"

export interface Message {
  id: number
  party: Party
  srcIp: string // includes port if present
  dstIp: string // includes port if present
  data: string
  raw: string
  timestamp?: string
}

export interface Conversation {
  partyA: string // IP (without port)
  partyB: string // IP (without port)
  messages: Message[]
}

type Extracted = {
  srcVal: string
  dstVal: string
  dataVal: string
  timestamp?: string
}

// Primary entry: supports multiple line formats.
// Rules:
// - Determine Party A/B from the first valid extracted line (by IP only, ports ignored).
// - Only keep messages where SRC belongs to A or B (focus on the first two parties).
export function parseLogToConversation(content: string): Conversation | null {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return null

  // Optional CSV header detection
  const csvInfo = detectCsvHeader(lines)

  let partyAIP: string | null = null
  let partyBIP: string | null = null
  const messages: Message[] = []
  let idCounter = 1

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    let extracted: Extracted | null = null

    // 1) CSV (with headers)
    if (csvInfo && i > 0) {
      extracted = tryParseCSVLine(line, csvInfo)
    }

    // 2) JSON line
    if (!extracted) {
      extracted = tryParseJSONLine(line)
    }

    // 3) Key-Value tokens anywhere (supports pipes or spaces)
    if (!extracted) {
      extracted = tryParseKVAnywhere(line)
    }

    // 4) Arrow "ip(:port)? -> ip(:port)?" with remainder as data
    if (!extracted) {
      extracted = tryParseArrow(line)
    }

    if (!extracted) continue

    const srcIPOnly = extractIpOnly(extracted.srcVal)
    const dstIPOnly = extractIpOnly(extracted.dstVal)
    if (!srcIPOnly || !dstIPOnly) continue

    if (!partyAIP || !partyBIP) {
      partyAIP = srcIPOnly
      partyBIP = dstIPOnly
    }

    const isFromA = srcIPOnly === partyAIP
    const isFromB = srcIPOnly === partyBIP
    if (!isFromA && !isFromB) continue

    messages.push({
      id: idCounter++,
      party: isFromA ? "A" : "B",
      srcIp: extracted.srcVal,
      dstIp: extracted.dstVal,
      data: extracted.dataVal,
      raw: rawLine,
      timestamp: extracted.timestamp,
    })
  }

  if (!partyAIP || !partyBIP || messages.length === 0) return null
  return { partyA: partyAIP, partyB: partyBIP, messages }
}

// --- Helpers ---

function extractIpOnly(ipPort: string): string {
  if (!ipPort) return ""
  // IPv6 "[2001:db8::1]:443" or bare IPv6 "2001:db8::1"
  const bracketMatch = ipPort.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracketMatch) return bracketMatch[1]

  // If last colon segment is a port (digits), strip it; otherwise return as-is (IPv6 without brackets)
  const parts = ipPort.split(":")
  if (parts.length <= 1) return ipPort
  const maybePort = parts[parts.length - 1]
  if (/^\d+$/.test(maybePort)) {
    return parts.slice(0, -1).join(":")
  }
  return ipPort
}

function extractTimestampLoose(s: any): string | undefined {
  if (!s) return undefined
  const str = String(s)
  // ISO-ish
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str
  // Common formats: "2025-08-31 12:34:56", "Aug 31 12:34:56"
  if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}/.test(str)) return str
  if (/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/.test(str)) return str
  return undefined
}

// JSONL extractor. Supports keys: src,dst,data plus common synonyms.
function tryParseJSONLine(line: string): Extracted | null {
  if (!(line.startsWith("{") && line.endsWith("}"))) return null
  try {
    const obj = JSON.parse(line)
    const src = pickFirst(obj, ["src", "SRC", "source", "client", "from"])
    const dst = pickFirst(obj, ["dst", "DST", "destination", "server", "to"])
    const data = pickFirst(obj, ["data", "DATA", "payload", "message", "body", "content"]) ?? ""
    if (!src || !dst) return null
    const ts = extractTimestampLoose(pickFirst(obj, ["timestamp", "time", "ts", "date"])) ?? undefined
    return { srcVal: String(src), dstVal: String(dst), dataVal: String(data), timestamp: ts }
  } catch {
    return null
  }
}

// Key=Value anywhere (allows pipes or spaces); supports SRC/DST/DATA in any order.
function tryParseKVAnywhere(line: string): Extracted | null {
  // Case-insensitive search for SRC=..., DST=..., DATA=...
  const srcMatch = line.match(/\bSRC\s*=\s*([^\s|]+)\b/i)
  const dstMatch = line.match(/\bDST\s*=\s*([^\s|]+)\b/i)
  // DATA may contain spaces until end; capture minimal if there are other tokens.
  let dataVal = ""
  const dataIdx = line.search(/\bDATA\s*=/i)
  if (dataIdx >= 0) {
    dataVal = line.slice(dataIdx + line.slice(dataIdx).indexOf("=") + 1).trim()
  }
  if (!srcMatch || !dstMatch) return null
  return {
    srcVal: srcMatch[1],
    dstVal: dstMatch[1],
    dataVal,
    timestamp: extractTimestampLoose(line.split("|")[0] || line.split(" ")[0]),
  }
}

// Arrow format: "ip(:port)? -> ip(:port)? <data...>"
function tryParseArrow(line: string): Extracted | null {
  const m = line.match(
    /\b(\[?[A-Fa-f0-9:.]+\]?(?::\d+)?)\s*(?:->|→|›|>){1}\s*(\[?[A-Fa-f0-9:.]+\]?(?::\d+)?)(?:\s+(.*))?$/,
  )
  if (!m) return null
  const [, src, dst, rest] = m
  return {
    srcVal: src,
    dstVal: dst,
    dataVal: rest?.trim() ?? "",
    timestamp: extractTimestampLoose(line.split(" ")[0]),
  }
}

// CSV detection: header contains src/dst/data synonyms (case-insensitive)
type CsvInfo = {
  isCsv: boolean
  headerIndex: number
  srcIdx: number
  dstIdx: number
  dataIdx: number | null
  tsIdx: number | null
}

function detectCsvHeader(lines: string[]): CsvInfo | null {
  if (lines.length === 0) return null
  const header = lines[0]?.trim()
  if (!header || header.indexOf(",") === -1) return null
  const cols = splitCsv(header).map((c) => c.trim().toLowerCase())
  const srcIdx = cols.findIndex((c) => ["src", "source", "from", "client"].includes(c))
  const dstIdx = cols.findIndex((c) => ["dst", "destination", "to", "server"].includes(c))
  const dataIdx = cols.findIndex((c) => ["data", "payload", "message", "body", "content"].includes(c))
  const tsIdx = cols.findIndex((c) => ["timestamp", "time", "ts", "date"].includes(c))
  if (srcIdx === -1 || dstIdx === -1) return null
  return {
    isCsv: true,
    headerIndex: 0,
    srcIdx,
    dstIdx,
    dataIdx: dataIdx === -1 ? null : dataIdx,
    tsIdx: tsIdx === -1 ? null : tsIdx,
  }
}

function tryParseCSVLine(line: string, info: CsvInfo): Extracted | null {
  const cols = splitCsv(line)
  // safety
  if (info.srcIdx >= cols.length || info.dstIdx >= cols.length) return null
  const srcVal = cols[info.srcIdx]?.trim()
  const dstVal = cols[info.dstIdx]?.trim()
  const dataVal = info.dataIdx != null && info.dataIdx < cols.length ? cols[info.dataIdx].trim() : ""
  const ts = info.tsIdx != null && info.tsIdx < cols.length ? extractTimestampLoose(cols[info.tsIdx]) : undefined
  if (!srcVal || !dstVal) return null
  return { srcVal, dstVal, dataVal, timestamp: ts }
}

// Basic CSV splitter that respects quotes
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function pickFirst(obj: any, keys: string[]) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]
  }
  return undefined
}

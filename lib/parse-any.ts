export type AnyMsg = {
  src: string
  dst: string
  data?: string
  sPort?: number | string | null
  dPort?: number | string | null
}

const IP = "(?:\\d{1,3}\\.){3}\\d{1,3}"

export function parseAnyLog(text: string): AnyMsg[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: AnyMsg[] = []

  // 1) JSONL
  for (const line of lines) {
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        const obj = JSON.parse(line)
        const src = obj.src || obj.source || obj.src_ip || obj.client || obj.saddr
        const dst = obj.dst || obj.destination || obj.dst_ip || obj.server || obj.daddr
        if (src && dst) {
          out.push({
            src: String(src),
            dst: String(dst),
            data: obj.data || obj.message || obj.payload || "",
            sPort: obj.sport || obj.src_port || null,
            dPort: obj.dport || obj.dst_port || null,
          })
          continue
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (out.length) return out

  // 2) CSV with headers
  const csvHeader = lines[0]?.toLowerCase()
  if (csvHeader && /src|source|src_ip/.test(csvHeader) && /dst|destination|dst_ip/.test(csvHeader)) {
    try {
      const headers = splitCsv(lines[0]).map((h) => h.toLowerCase())
      const idx = {
        src: headers.findIndex((h) => ["src", "source", "src_ip", "saddr"].includes(h)),
        dst: headers.findIndex((h) => ["dst", "destination", "dst_ip", "daddr"].includes(h)),
        data: headers.findIndex((h) => ["data", "message", "payload"].includes(h)),
        sport: headers.findIndex((h) => ["sport", "src_port"].includes(h)),
        dport: headers.findIndex((h) => ["dport", "dst_port"].includes(h)),
      }
      for (let i = 1; i < lines.length; i++) {
        const row = splitCsv(lines[i])
        if (row.length !== headers.length) continue
        const src = row[idx.src]
        const dst = row[idx.dst]
        if (!src || !dst) continue
        out.push({
          src,
          dst,
          data: idx.data >= 0 ? row[idx.data] : "",
          sPort: idx.sport >= 0 ? row[idx.sport] : null,
          dPort: idx.dport >= 0 ? row[idx.dport] : null,
        })
      }
      if (out.length) return out
    } catch {
      /* ignore */
    }
  }

  // 3) Key=Value anywhere
  for (const line of lines) {
    const src = getKv(line, ["src", "source", "src_ip", "saddr"])
    const dst = getKv(line, ["dst", "destination", "dst_ip", "daddr"])
    if (src && dst) {
      out.push({
        src,
        dst,
        data: getKv(line, ["data", "message", "payload"]) || "",
        sPort: getKv(line, ["sport", "src_port"]),
        dPort: getKv(line, ["dport", "dst_port"]),
      })
    }
  }
  if (out.length) return out

  // 4) Arrow "ip:port -> ip:port"
  const arrow = new RegExp(`\\b(${IP})(?::(\\d{1,5}))?\\s*[-=]>\\s*(${IP})(?::(\\d{1,5}))?\\b(?:\\s*(.*))?`)
  for (const line of lines) {
    const m = line.match(arrow)
    if (m) {
      const [, src, sp, dst, dp, rest] = m
      out.push({ src, dst, sPort: sp || null, dPort: dp || null, data: rest || "" })
    }
  }
  if (out.length) return out

  // 5) Pipe-delimited fallback with order SRC|DST|DATA
  for (const line of lines) {
    if (!line.includes("|")) continue
    const parts = line.split("|").map((s) => s.trim())
    if (parts.length >= 2 && parts[0].match(new RegExp(`^${IP}$`)) && parts[1].match(new RegExp(`^${IP}$`))) {
      out.push({ src: parts[0], dst: parts[1], data: parts.slice(2).join(" | ") })
    }
  }

  return out
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = "",
    inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQ = !inQ
      continue
    }
    if (c === "," && !inQ) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function getKv(line: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`\\b${k}\\s*=\\s*([^\\s,|]+)`, "i")
    const m = line.match(re)
    if (m) return m[1]
  }
  return null
}

export type IpInfo = {
  ip: string
  hostname?: string
  org?: string
  asn?: string | number
  isp?: string
  country?: string
  city?: string
  role?: "device" | "router" | "server" | "domain" | "public"
  scope?: "private" | "cgnat" | "loopback" | "linklocal" | "public" | "reserved"
}

const privateBlocks = [
  { net: "10.", test: (ip: string) => ip.startsWith("10.") },
  { net: "172.16-31", test: (ip: string) => /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) },
  { net: "192.168.", test: (ip: string) => ip.startsWith("192.168.") },
]
const linkLocal = (ip: string) => ip.startsWith("169.254.")
const loopback = (ip: string) => ip.startsWith("127.")
const reserved = (ip: string) => ip.startsWith("0.") || ip.startsWith("255.")

export function detectScope(ip: string): IpInfo["scope"] {
  if (loopback(ip)) return "loopback"
  if (linkLocal(ip)) return "linklocal"
  if (privateBlocks.some((b) => b.test(ip))) return "private"
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return "cgnat" // 100.64.0.0/10
  if (reserved(ip)) return "reserved"
  return "public"
}

export function guessRole(ip: string, info?: Partial<IpInfo>, ports?: number[]): IpInfo["role"] {
  const scope = detectScope(ip)
  if (scope === "private" || scope === "loopback" || scope === "linklocal") {
    // Heuristics: .1 or .254 often a router gateway
    if (/\.(1|254)$/.test(ip)) return "router"
    // otherwise assume device
    return "device"
  }
  // public
  const host = info?.hostname?.toLowerCase() || ""
  if (host && /(?:cdn|cloud|aws|gcp|azure|compute|edge|server)/.test(host)) return "server"
  if (ports && ports.some((p) => [80, 443, 25, 53, 22, 143, 993, 995].includes(p))) return "server"
  if (host && /(?:home|router|gateway)/.test(host)) return "router"
  if (host) return "domain"
  return "public"
}

async function fetchSingleFromInternal(ip: string): Promise<Partial<IpInfo> | null> {
  try {
    const r = await fetch(`/api/ipinfo?ip=${encodeURIComponent(ip)}`)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

async function fetchSingleFromPublic(ip: string): Promise<Partial<IpInfo> | null> {
  try {
    // ipwho.is free, no key required
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`)
    if (!r.ok) return null
    const j = await r.json()
    if (j && j.success !== false) {
      return {
        ip,
        hostname: j.hostname || j.reverse || undefined,
        org: j.connection?.org || j.org || undefined,
        asn: j.connection?.asn || j.asn?.asn || undefined,
        isp: j.connection?.isp || undefined,
        country: j.country,
        city: j.city,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function enrichIp(ip: string, observedPorts: number[] = []): Promise<IpInfo> {
  const scope = detectScope(ip)
  const internal = await fetchSingleFromInternal(ip)
  const fallback = internal ?? (await fetchSingleFromPublic(ip)) ?? {}
  const role = guessRole(ip, fallback, observedPorts)
  return {
    ip,
    scope,
    role,
    hostname: fallback.hostname,
    org: fallback.org,
    asn: fallback.asn,
    isp: fallback.isp,
    country: fallback.country,
    city: fallback.city,
  }
}

export async function batchEnrich(ips: string[], portsByIp: Record<string, number[]> = {}) {
  const uniq = Array.from(new Set(ips))
  const results = await Promise.all(uniq.map((ip) => enrichIp(ip, portsByIp[ip] || [])))
  const map: Record<string, IpInfo> = {}
  for (const r of results) map[r.ip] = r
  return map
}

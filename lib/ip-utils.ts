// IPv4-only for PTR convenience; safe fallbacks included.

const PRIVATE_BLOCKS = [
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
]

function ipToOctets(ip: string): number[] | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const octs = parts.map((p) => {
    const n = Number(p)
    return Number.isInteger(n) && n >= 0 && n <= 255 ? n : Number.NaN
  })
  return octs.some((n) => Number.isNaN(n)) ? null : octs
}

function inRange(octs: number[], start: number[], end: number[]) {
  for (let i = 0; i < 4; i++) {
    if (octs[i] < start[i]) return false
    if (octs[i] > end[i]) return false
  }
  return true
}

export function isPrivateIp(ip: string): boolean {
  const octs = ipToOctets(ip)
  if (!octs) return false
  return PRIVATE_BLOCKS.some((b) => inRange(octs, b.start, b.end))
}

export function isCgnat(ip: string): boolean {
  const octs = ipToOctets(ip)
  if (!octs) return false
  // 100.64.0.0/10
  return octs[0] === 100 && octs[1] >= 64 && octs[1] <= 127
}

export function isLoopback(ip: string): boolean {
  const octs = ipToOctets(ip)
  if (!octs) return false
  return octs[0] === 127
}

export function isMulticast(ip: string): boolean {
  const octs = ipToOctets(ip)
  if (!octs) return false
  return octs[0] >= 224 && octs[0] <= 239
}

export type IpScope = "private" | "cgnat" | "loopback" | "multicast" | "public"

export function ipScope(ip: string): IpScope {
  if (isLoopback(ip)) return "loopback"
  if (isPrivateIp(ip)) return "private"
  if (isCgnat(ip)) return "cgnat"
  if (isMulticast(ip)) return "multicast"
  return "public"
}

export type CloudProvider =
  | "aws"
  | "azure"
  | "gcp"
  | "oracle"
  | "digitalocean"
  | "cloudflare"
  | "akamai"
  | "other"
  | "unknown"

export function guessCloudProvider(str?: string): CloudProvider {
  const s = (str || "").toLowerCase()
  if (!s) return "unknown"
  if (/(amazon|aws|ec2|compute-1|compute\.amazonaws\.com)/.test(s)) return "aws"
  if (/(azure|microsoft|cloudapp|trafficmanager)/.test(s)) return "azure"
  if (/(google|gcp|googleusercontent|compute\.googleapis\.com)/.test(s)) return "gcp"
  if (/(oracle|oci|oraclevcn)/.test(s)) return "oracle"
  if (/(digitalocean|droplet|ondigitalocean)/.test(s)) return "digitalocean"
  if (/(cloudflare|warp|cf-ipfs)/.test(s)) return "cloudflare"
  if (/(akamai|edgekey|edgesuite)/.test(s)) return "akamai"
  return "other"
}

export type IpRole = "device" | "router" | "server" | "domain" | "unknown"

export function guessIpRole(ip: string, hostname?: string | null, orgIsp?: string | null): IpRole {
  const scope = ipScope(ip)
  const octs = ipToOctets(ip) || [0, 0, 0, 0]
  const last = octs[3]

  if (scope === "loopback") return "device"
  if (scope === "multicast") return "unknown"

  if (scope === "private" || scope === "cgnat") {
    if (last === 1 || last === 254) return "router"
    return "device"
  }

  // public
  const s = `${hostname || ""} ${orgIsp || ""}`.toLowerCase()
  // if PTR looks like a FQDN, treat as domain
  if (hostname && /(^|\.)(([a-z0-9-]+\.)+[a-z]{2,})\.?$/.test(hostname)) return "domain"
  const cloud = guessCloudProvider(s)
  if (cloud !== "unknown") return "server"
  if (/(colo|datacenter|hosting|isp|carrier|telecom)/.test(s)) return "server"
  return hostname ? "domain" : "unknown"
}

export function ipv4Ptr(ip: string): string | null {
  const octs = ipToOctets(ip)
  if (!octs) return null
  return `${octs[3]}.${octs[2]}.${octs[1]}.${octs[0]}.in-addr.arpa`
}

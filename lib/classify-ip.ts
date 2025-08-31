export type IpClassification = {
  scope: "private" | "cgnat" | "loopback" | "linklocal" | "public"
  role: "device" | "router" | "server" | "domain" | "unknown"
}

const privateBlocks = [
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
]
const cgnatBlock = { start: [100, 64, 0, 0], end: [100, 127, 255, 255] }
const loopbackBlock = { start: [127, 0, 0, 0], end: [127, 255, 255, 255] }
const linkLocalBlock = { start: [169, 254, 0, 0], end: [169, 254, 255, 255] }

function ipToArr(ip: string): number[] | null {
  const parts = ip.split(".").map((x) => Number(x))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return parts
}
function inRange(ip: number[], b: { start: number[]; end: number[] }) {
  for (let i = 0; i < 4; i++) {
    if (ip[i] < b.start[i]) return false
    if (ip[i] > b.end[i]) return false
  }
  return true
}

export function classifyIP(ip: string, hostname?: string | null): IpClassification {
  const arr = ipToArr(ip)
  if (!arr) return { scope: "public", role: "unknown" }

  let scope: IpClassification["scope"] = "public"
  if (inRange(arr, loopbackBlock)) scope = "loopback"
  else if (inRange(arr, linkLocalBlock)) scope = "linklocal"
  else if (privateBlocks.some((b) => inRange(arr, b))) scope = "private"
  else if (inRange(arr, cgnatBlock)) scope = "cgnat"

  // Heuristics for role
  // likely router endpoints (common home router IPs)
  const isLikelyRouter =
    (arr[0] === 192 && arr[1] === 168 && (arr[2] === 0 || arr[2] === 1)) ||
    (arr[0] === 10 && arr[1] === 0 && arr[2] === 0 && arr[3] === 1) ||
    (arr[0] === 172 && arr[1] === 16 && arr[2] === 0 && arr[3] === 1)

  let role: IpClassification["role"] = "unknown"
  if (hostname && /(?:router|gateway|gw|home|broadband)/i.test(hostname)) role = "router"
  else if (hostname && /\.(aws|azure|gcp|google|cloud|digitalocean|linode|vultr)\./i.test(hostname)) role = "server"
  else if (hostname && /(?:dns|db|api|cdn|smtp|imap|pop|web|srv)\d*/i.test(hostname)) role = "server"
  else if (hostname && /[a-z]/i.test(hostname)) role = "domain"
  else if (isLikelyRouter) role = "router"
  else if (scope === "private") role = "device"
  else role = "server"

  return { scope, role }
}

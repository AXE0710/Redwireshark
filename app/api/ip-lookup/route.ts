import type { NextRequest } from "next/server"
import { classifyIP } from "@/lib/classify-ip"

type IpResult = {
  ip: string
  hostname?: string | null
  org?: string | null
  asn?: string | null
  isp?: string | null
  country?: string | null
  city?: string | null
  classification: ReturnType<typeof classifyIP>
}

async function fetchIpwho(ip: string) {
  const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
    headers: { "user-agent": "v0-network-log-chat" },
    cache: "force-cache",
  })
  if (!r.ok) return null
  const j = (await r.json()) as any
  if (!j || j.success === false) return null
  return {
    ip: j.ip,
    hostname: j.host || j.reverse || j.hostname || null,
    org: j.org || j.connection?.org || null,
    asn: j.connection?.asn ? `AS${j.connection.asn}` : null,
    isp: j.connection?.isp || null,
    country: j.country || j.country_code || null,
    city: j.city || null,
  }
}

async function fetchPtr(ip: string) {
  // reverse for IPv4
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  const name = `${parts.reverse().join(".")}.in-addr.arpa`
  const url = `https://dns.google/resolve?name=${name}&type=PTR`
  try {
    const r = await fetch(url, { cache: "force-cache" })
    if (!r.ok) return null
    const j = (await r.json()) as any
    const ans = Array.isArray(j.Answer) ? j.Answer : []
    const ptr = ans.find((a: any) => a.type === 12)?.data
    if (!ptr) return null
    return ptr.replace(/\.$/, "")
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const one = url.searchParams.get("ip")
  const many = url.searchParams.get("ips")

  const ips = new Set<string>()
  if (one) ips.add(one)
  if (many) {
    for (const p of many
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean))
      ips.add(p)
  }
  if (ips.size === 0) {
    return new Response(JSON.stringify({ error: "missing ip or ips" }), { status: 400 })
  }
  if (ips.size > 25) {
    return new Response(JSON.stringify({ error: "too many ips (max 25)" }), { status: 400 })
  }

  const results: Record<string, IpResult> = {}
  await Promise.all(
    Array.from(ips).map(async (ip) => {
      const base = await fetchIpwho(ip)
      const ptr = await fetchPtr(ip)
      const hostname = ptr || base?.hostname || null
      const classification = classifyIP(ip, hostname)
      results[ip] = {
        ip,
        hostname,
        org: base?.org || null,
        asn: base?.asn || null,
        isp: base?.isp || null,
        country: base?.country || null,
        city: base?.city || null,
        classification,
      }
    }),
  )

  return new Response(JSON.stringify(results, null, 2), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  })
}

import { NextResponse } from "next/server"
import { ipScope, guessIpRole, ipv4Ptr } from "@/lib/ip-utils"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ip = searchParams.get("ip")
  if (!ip) {
    return NextResponse.json({ error: "ip is required" }, { status: 400 })
  }

  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=en`, {
      // cache politely; daily updates are fine
      next: { revalidate: 60 * 60 * 24 },
    })
    const data = await r.json()

    // try reverse DNS for IPv4
    let hostname: string | undefined
    try {
      const ptr = ipv4Ptr(ip)
      if (ptr) {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(ptr)}&type=PTR`, {
          next: { revalidate: 60 * 60 * 24 },
        })
        const dnsJson = await dnsRes.json()
        const answer = Array.isArray(dnsJson?.Answer) ? dnsJson.Answer.find((a: any) => a?.data) : null
        if (answer?.data) {
          hostname = String(answer.data).replace(/\.$/, "")
        }
      }
    } catch {
      // ignore DNS failures
    }

    const info = {
      ip: data?.ip ?? ip,
      success: data?.success !== false,
      type: data?.type,
      country: data?.country,
      region: data?.region,
      city: data?.city,
      org: data?.connection?.org || data?.org,
      isp: data?.connection?.isp || data?.isp,
      asn: data?.connection?.asn || data?.asn,
      timezone: data?.timezone?.id || data?.timezone,
      hostname,
      scope: ipScope(ip),
      role: guessIpRole(
        ip,
        hostname,
        (data?.connection?.org || data?.org || data?.connection?.isp || data?.isp) ?? null,
      ),
    }

    return NextResponse.json(info, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ip, success: false, error: "lookup_failed" }, { status: 200 })
  }
}

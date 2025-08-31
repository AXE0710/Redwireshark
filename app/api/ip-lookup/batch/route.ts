import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ipsParam = searchParams.get("ips") || ""
  let ips = ipsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  ips = Array.from(new Set(ips)).slice(0, 25)
  const base = `${new URL(req.url).origin}/api/ip-lookup`

  const results = await Promise.all(
    ips.map(async (ip) => {
      try {
        const r = await fetch(`${base}?ip=${encodeURIComponent(ip)}`, { cache: "force-cache" })
        if (!r.ok) throw new Error(`ip ${ip} failed`)
        return await r.json()
      } catch {
        return { ip, error: true }
      }
    }),
  )
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}

import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const raw = (searchParams.get("ips") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const ips = Array.from(new Set(raw)).slice(0, 25)

  if (!ips.length) {
    return new Response(JSON.stringify([]), {
      headers: { "content-type": "application/json" },
    })
  }

  const results = await Promise.allSettled(
    ips.map((ip) => fetch(`${req.nextUrl.origin}/api/ipinfo?ip=${encodeURIComponent(ip)}`).then((r) => r.json())),
  )

  const data = results
    .map((r, i) => (r.status === "fulfilled" ? r.value : { ip: ips[i], error: "lookup failed" }))
    // Deduplicate by IP
    .reduce((acc: any[], cur: any) => {
      if (!acc.find((a) => a.ip === cur.ip)) acc.push(cur)
      return acc
    }, [])

  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
    },
  })
}

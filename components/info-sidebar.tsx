"use client"

import { Globe, Router, Server, Smartphone } from "lucide-react"

export type IpInfo = {
  ip: string
  type?: string
  country?: string
  region?: string
  city?: string
  org?: string
  isp?: string
  asn?: string
  timezone?: string
  success?: boolean
  hostname?: string
  scope?: "private" | "cgnat" | "loopback" | "multicast" | "public"
  role?: "device" | "router" | "server" | "domain" | "unknown"
}

type Summary = {
  messagesA: number
  messagesB: number
  topPorts: string[]
  topKeywords: string[]
  topicGuess: string
}

export function InfoSidebar({
  aIp,
  bIp,
  aInfo,
  bInfo,
  summary,
}: {
  aIp: string | null
  bIp: string | null
  aInfo: IpInfo | null
  bInfo: IpInfo | null
  summary: Summary | null
}) {
  return (
    <aside className="w-full">
      <div className="rounded-md border border-gray-900/10 bg-white p-3">
        <h3 className="text-sm font-semibold text-gray-900">Conversation Summary</h3>
        {summary ? (
          <div className="mt-2 text-sm text-gray-900/90">
            <p>
              Exchange: A→B {summary.messagesA} msgs, B→A {summary.messagesB} msgs.
            </p>
            {summary.topPorts.length > 0 && <p className="mt-1">Top ports: {summary.topPorts.join(", ")}</p>}
            {summary.topKeywords.length > 0 && <p className="mt-1">Keywords: {summary.topKeywords.join(", ")}</p>}
            <p className="mt-2 font-medium">Likely Topic: {summary.topicGuess}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-900/70">No summary yet.</p>
        )}
      </div>

      <div className="mt-4 rounded-md border border-gray-900/10 bg-white p-3">
        <h3 className="text-sm font-semibold text-gray-900">Party A ({aIp ?? "?"})</h3>
        <IpInfoBlock info={aInfo} />
      </div>

      <div className="mt-4 rounded-md border border-gray-900/10 bg-white p-3">
        <h3 className="text-sm font-semibold text-gray-900">Party B ({bIp ?? "?"})</h3>
        <IpInfoBlock info={bInfo} />
      </div>
    </aside>
  )
}

function IpInfoBlock({ info }: { info: IpInfo | null }) {
  if (!info) {
    return <p className="mt-2 text-sm text-gray-900/70">Lookup pending…</p>
  }
  if (info.success === false) {
    return <p className="mt-2 text-sm text-gray-900/70">No information found.</p>
  }
  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <RoleIcon role={info.role} />
        <div className="text-sm">
          <div className="font-medium text-gray-900">{info.hostname ? info.hostname : info.ip}</div>
          <div className="text-gray-900/70">
            {info.role ? capitalize(info.role) : "Unknown"} {info.scope ? `• ${info.scope}` : ""}
          </div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-gray-900/90">
        <InfoRow term="Type" val={info.type} />
        <InfoRow term="Org/ISP" val={info.org || info.isp} />
        <InfoRow term="ASN" val={info.asn} />
        <InfoRow term="Country" val={info.country} />
        <InfoRow term="Region" val={info.region} />
        <InfoRow term="City" val={info.city} />
        <InfoRow term="Timezone" val={info.timezone} />
      </dl>
    </>
  )
}

function InfoRow({ term, val }: { term: string; val?: string }) {
  if (!val) return null
  return (
    <>
      <dt className="text-gray-900/70">{term}</dt>
      <dd className="font-medium">{val}</dd>
    </>
  )
}

function RoleIcon({ role }: { role?: IpInfo["role"] }) {
  const common = "w-4 h-4 text-blue-600"
  switch (role) {
    case "device":
      return <Smartphone className={common} aria-hidden="true" />
    case "router":
      return <Router className={common} aria-hidden="true" />
    case "server":
      return <Server className={common} aria-hidden="true" />
    case "domain":
      return <Globe className={common} aria-hidden="true" />
    default:
      return <Globe className={common} aria-hidden="true" />
  }
}

function capitalize(s?: string) {
  if (!s) return ""
  return s.slice(0, 1).toUpperCase() + s.slice(1)
}

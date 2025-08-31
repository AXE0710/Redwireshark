"use client"
import type { IpInfo } from "@/lib/multi-ip-utils"

type Props = {
  a?: IpInfo
  b?: IpInfo
}

function Item({ title, value }: { title: string; value?: string | number }) {
  return (
    <div className="text-sm">
      <span className="text-gray-500">{title}: </span>
      <span className="text-gray-900">{value || "—"}</span>
    </div>
  )
}

function Card({ label, ip }: { label: string; ip?: IpInfo }) {
  return (
    <div className="border rounded-md p-3 bg-white">
      <h3 className="text-sm font-semibold text-gray-900 mb-2 font-sans">
        {label}: {ip?.ip || "—"}
      </h3>
      <div className="flex flex-col gap-1">
        <Item title="Hostname" value={ip?.hostname} />
        <Item title="Role" value={ip?.role} />
        <Item title="Scope" value={ip?.scope} />
        <Item title="Org" value={ip?.org} />
        <Item title="ASN" value={ip?.asn?.toString()} />
        <Item title="ISP" value={ip?.isp} />
        <Item title="Location" value={[ip?.city, ip?.country].filter(Boolean).join(", ")} />
      </div>
    </div>
  )
}

export default function MultiInfoPanel({ a, b }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Card label="Party A" ip={a} />
      <Card label="Party B" ip={b} />
    </div>
  )
}

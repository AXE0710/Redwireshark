import type { Conversation } from "./parse-log"

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "this",
  "that",
  "it",
  "by",
  "as",
  "from",
  "via",
  "you",
  "we",
  "they",
  "he",
  "she",
  "them",
  "us",
])

export type ConversationSummary = {
  messagesA: number
  messagesB: number
  topPorts: string[]
  topKeywords: string[]
  topicGuess: string
}

export function summarizeConversation(conv: Conversation): ConversationSummary {
  let messagesA = 0
  let messagesB = 0
  const portCounts = new Map<string, number>()
  const wordCounts = new Map<string, number>()

  for (const m of conv.messages) {
    if (m.party === "A") messagesA++
    else messagesB++

    // gather ports from src/dst
    const ports = [extractPort(m.srcIp), extractPort(m.dstIp)].filter(Boolean) as string[]
    for (const p of ports) {
      portCounts.set(p, (portCounts.get(p) ?? 0) + 1)
    }

    // simple keyword extraction from data
    const words = (m.data || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
    for (const w of words) {
      if (STOPWORDS.has(w)) continue
      if (w.length < 3) continue
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1)
    }
  }

  const topPorts = topN(portCounts, 5)
  const topKeywords = topN(wordCounts, 8)

  const topicGuess = guessTopic(topKeywords, topPorts)

  return { messagesA, messagesB, topPorts, topKeywords, topicGuess }
}

function extractPort(ipPort: string): string | null {
  // [ipv6]:443 | 1.2.3.4:80 | or none
  const m = ipPort.match(/:(\d+)$/)
  if (m) return m[1]
  const m2 = ipPort.match(/\]:([0-9]+)$/)
  if (m2) return m2[1]
  return null
}

function topN(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

function guessTopic(keywords: string[], ports: string[]): string {
  if (ports.includes("80") || ports.includes("8080") || ports.includes("443")) return "HTTP/HTTPS traffic"
  if (ports.includes("25") || ports.includes("587") || ports.includes("465")) return "Email (SMTP) traffic"
  if (ports.includes("22")) return "SSH activity"
  if (ports.includes("53")) return "DNS queries"
  if (ports.includes("3306") || ports.includes("5432")) return "Database traffic"
  // keyword hints
  if (keywords.some((k) => ["get", "post", "host", "http", "cookie"].includes(k))) return "Web request/response"
  if (keywords.some((k) => ["ssh", "handshake", "key", "auth"].includes(k))) return "Secure shell or auth exchange"
  if (keywords.some((k) => ["dns", "query", "resolve"].includes(k))) return "DNS resolution"
  return "General data exchange"
}

import type { ResearchCategory } from "@/lib/types";

export function inferResearchCategory(topic: string): ResearchCategory {
  const t = topic.toLowerCase();
  if (/sport|nba|football|soccer|tennis|kobe|lebron|messi|ronaldo/.test(t)) return "sports";
  if (/music|rap|hip.?hop|afrobeats|album|song|wizkid|burna/.test(t)) return "music";
  if (/tech|ai|iphone|android|apple|google|software/.test(t)) return "tech";
  if (/crypto|bitcoin|ethereum|defi|token|web3/.test(t)) return "crypto";
  return "culture";
}

export function priceResearchArtifact(category: ResearchCategory): string {
  switch (category) {
    case "sports":
    case "culture":
      return "0.03";
    case "tech":
    case "crypto":
      return "0.05";
    case "music":
      return "0.02";
    default:
      return "0.03";
  }
}

export function researchEndpointForCategory(category: ResearchCategory): string {
  if (category === "sports") return "/api/research/sports";
  if (category === "tech" || category === "crypto") return "/api/research/news";
  return "/api/research/history";
}

import type { ResearchArtifact, ResearchCategory, ResearchPurchase } from "@/lib/types";

class ResearchStore {
  private artifacts = new Map<string, ResearchArtifact>();
  private buyerIndex = new Map<string, Set<string>>();
  private saleIndex = new Map<string, number>();
  private battlePurchases = new Map<string, ResearchPurchase[]>();

  add(artifact: ResearchArtifact): ResearchArtifact {
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  get(id: string): ResearchArtifact | undefined {
    return this.artifacts.get(id);
  }

  search(params: {
    topic?: string;
    category?: ResearchCategory;
    excludeOwnerAgentId?: string;
    limit?: number;
  }): ResearchArtifact[] {
    const topic = params.topic?.toLowerCase().trim();
    const terms = topic ? topic.split(/\s+/).filter((term) => term.length > 2) : [];

    return Array.from(this.artifacts.values())
      .filter((artifact) => !params.category || artifact.category === params.category)
      .filter((artifact) => !params.excludeOwnerAgentId || artifact.ownerAgentId !== params.excludeOwnerAgentId)
      .map((artifact) => {
        const haystack = `${artifact.topic} ${artifact.summary} ${artifact.facts.join(" ")}`.toLowerCase();
        const score = terms.length === 0
          ? 1
          : terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        return { artifact, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.artifact.createdAt - a.artifact.createdAt)
      .slice(0, params.limit ?? 5)
      .map((item) => item.artifact);
  }

  markPurchased(buyerAgentId: string, artifactId: string): void {
    const set = this.buyerIndex.get(buyerAgentId) ?? new Set<string>();
    set.add(artifactId);
    this.buyerIndex.set(buyerAgentId, set);
    this.saleIndex.set(artifactId, (this.saleIndex.get(artifactId) ?? 0) + 1);
  }

  listOwnedBy(agentId: string): ResearchArtifact[] {
    return Array.from(this.artifacts.values()).filter((artifact) => artifact.ownerAgentId === agentId);
  }

  listPurchasedBy(agentId: string): ResearchArtifact[] {
    const ids = this.buyerIndex.get(agentId) ?? new Set<string>();
    return Array.from(ids)
      .map((id) => this.artifacts.get(id))
      .filter((artifact): artifact is ResearchArtifact => Boolean(artifact));
  }

  salesFor(agentId: string): number {
    return this.listOwnedBy(agentId).reduce(
      (total, artifact) => total + (this.saleIndex.get(artifact.id) ?? 0),
      0
    );
  }

  recordBattlePurchase(battleId: string, purchase: ResearchPurchase): void {
    const key = battleId.toLowerCase();
    const current = this.battlePurchases.get(key) ?? [];
    const artifactId = purchase.data.artifactId;
    if (
      current.some((item) =>
        item.id === purchase.id ||
        (
          typeof artifactId === "string" &&
          item.agent === purchase.agent &&
          item.data.artifactId === artifactId
        )
      )
    ) return;
    this.battlePurchases.set(key, [...current, purchase]);
  }

  listBattlePurchases(battleId: string): ResearchPurchase[] {
    return [...(this.battlePurchases.get(battleId.toLowerCase()) ?? [])];
  }
}

const globalResearchStore = globalThis as typeof globalThis & {
  __clashboardResearchStore?: ResearchStore;
};

export const researchStore =
  globalResearchStore.__clashboardResearchStore ??
  (globalResearchStore.__clashboardResearchStore = new ResearchStore());

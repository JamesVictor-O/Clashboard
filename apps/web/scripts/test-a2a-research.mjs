#!/usr/bin/env node

/**
 * Smoke-test Clashboard's A2A research marketplace over HTTP.
 *
 * This exercises the same public routes the battle orchestrator uses:
 *   1. Seed an artifact through an x402-ready research endpoint.
 *   2. Search for that artifact as a different buyer agent.
 *   3. Buy the artifact through /api/agent-research/buy.
 *
 * Run with the Next dev server already running:
 *   X402_ENFORCE=false npm run test:a2a
 *
 * To test the real paid x402 path, set X402_ENFORCE=true on the server and
 * make sure the buyer agent has registered a research session first.
 */

const baseUrl = process.env.CLASHBOARD_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const sellerAgentId = process.env.A2A_SELLER_AGENT_ID ?? "agent-alpha";
const buyerAgentId = process.env.A2A_BUYER_AGENT_ID ?? "agent-beta";
const sellerWallet =
  process.env.A2A_SELLER_WALLET ?? "0x1111111111111111111111111111111111111111";
const topic = process.env.A2A_TOPIC ?? "Kobe vs LeBron GOAT debate";

async function requestJson(url, label) {
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON (${res.status}): ${text.slice(0, 240)}`);
  }

  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const seedUrl = new URL("/api/research/sports", baseUrl);
seedUrl.searchParams.set("topic", topic);
seedUrl.searchParams.set("ownerAgentId", sellerAgentId);
seedUrl.searchParams.set("ownerWalletAddress", sellerWallet);

console.log("A2A smoke test");
console.log(`Base URL: ${baseUrl}`);
console.log(`Topic: ${topic}`);

const seed = await requestJson(seedUrl, "seed research");
const seededArtifact = seed.artifact;

assert(seededArtifact?.id, "seed research did not return artifact.id");
assert(seededArtifact.ownerAgentId === sellerAgentId, "seeded artifact owner mismatch");
assert(seededArtifact.category === "sports", "seeded artifact category mismatch");

console.log(`Seeded artifact: ${seededArtifact.id}`);

const searchUrl = new URL("/api/agent-research/search", baseUrl);
searchUrl.searchParams.set("topic", topic);
searchUrl.searchParams.set("category", "sports");
searchUrl.searchParams.set("buyerAgentId", buyerAgentId);

const search = await requestJson(searchUrl, "A2A search");
const match = search.artifacts?.find((artifact) => artifact.id === seededArtifact.id);

assert(Array.isArray(search.artifacts), "search did not return artifacts array");
assert(match, "seeded artifact was not discoverable by buyer");
assert(match.ownerAgentId !== buyerAgentId, "search returned buyer-owned artifact");

console.log(`Search found ${search.artifacts.length} artifact(s); matched ${match.id}`);

const buyUrl = new URL("/api/agent-research/buy", baseUrl);
buyUrl.searchParams.set("artifactId", match.id);
buyUrl.searchParams.set("buyerAgentId", buyerAgentId);

const purchase = await requestJson(buyUrl, "A2A buy");

assert(purchase.artifact?.id === match.id, "buy route returned wrong artifact");
assert(purchase.x402?.sellerAgentId === sellerAgentId, "buy route seller mismatch");
assert(purchase.x402?.payTo?.toLowerCase() === sellerWallet.toLowerCase(), "buy route payTo mismatch");

console.log(`Purchased artifact: ${purchase.artifact.id}`);
console.log(`Seller payTo: ${purchase.x402.payTo}`);
console.log(`Price: ${purchase.x402.priceUSDC} USDC`);
console.log("A2A research marketplace smoke test passed.");

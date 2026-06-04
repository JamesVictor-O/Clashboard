#!/usr/bin/env node

/**
 * End-to-end x402 -> Clashboard facilitator -> 1Shot rail test.
 *
 * Prereqs:
 *   1. Start Next with:
 *      X402_ENFORCE=true ENABLE_X402_RAIL_TEST=true npm run dev
 *   2. Agent B must have a real research grant from Release Fighter.
 *   3. Export either:
 *      BUYER_RESEARCH_SESSION_JSON='{"sessionPrivateKey":"0x...","researchPermission":{...}}'
 *      or:
 *      BUYER_SESSION_PRIVATE_KEY=0x...
 *      BUYER_RESEARCH_PERMISSION_JSON='{...permission metadata...}'
 *
 * The script:
 *   - seeds Agent A research into the in-memory store
 *   - searches as Agent B
 *   - buys through /api/agent-research/buy using x402 paid fetch
 *   - prints PAYMENT-RESPONSE settlement data and tx hash
 */

import { x402Erc7710Client } from "@metamask/x402";
import { erc7710WalletActions } from "@metamask/smart-accounts-kit/actions";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const baseUrl = process.env.CLASHBOARD_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const sellerAgentId = process.env.RAIL_SELLER_AGENT_ID ?? "agent-a-seller";
const buyerAgentId = process.env.RAIL_BUYER_AGENT_ID ?? "agent-b-buyer";
const sellerWallet = mustAddress(process.env.RAIL_SELLER_WALLET, "RAIL_SELLER_WALLET");
const topic = process.env.RAIL_TOPIC ?? "Kobe vs LeBron GOAT debate";
const priceUSDC = process.env.RAIL_PRICE_USDC ?? "0.03";

const { sessionPrivateKey, researchPermission } = readBuyerSession();
const chain = researchPermission.chainId === 8453 ? base : baseSepolia;

function mustAddress(value, name) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 0x EVM address`);
  }
  return value;
}

function readBuyerSession() {
  if (process.env.BUYER_RESEARCH_SESSION_JSON) {
    const parsed = JSON.parse(process.env.BUYER_RESEARCH_SESSION_JSON);
    const sessionPrivateKey = parsed.sessionPrivateKey ?? parsed.session?.sessionPrivateKey;
    const researchPermission = parsed.researchPermission ?? parsed.permission;
    validateSession(sessionPrivateKey, researchPermission);
    return { sessionPrivateKey, researchPermission };
  }

  const sessionPrivateKey = process.env.BUYER_SESSION_PRIVATE_KEY;
  const rawPermission = process.env.BUYER_RESEARCH_PERMISSION_JSON;
  if (!rawPermission) {
    throw new Error(
      "Missing BUYER_RESEARCH_PERMISSION_JSON or BUYER_RESEARCH_SESSION_JSON. Export Agent B's research permission metadata first."
    );
  }
  const researchPermission = JSON.parse(rawPermission);
  validateSession(sessionPrivateKey, researchPermission);
  return { sessionPrivateKey, researchPermission };
}

function validateSession(sessionPrivateKey, researchPermission) {
  if (!sessionPrivateKey || !/^0x[0-9a-fA-F]{64}$/.test(sessionPrivateKey)) {
    throw new Error("Buyer session private key missing or invalid");
  }
  if (!researchPermission?.context || !researchPermission?.delegationManager || !researchPermission?.walletAddress) {
    throw new Error("Buyer research permission is missing context/delegationManager/walletAddress");
  }
}

async function requestJson(url, label, init) {
  const res = await fetch(url, init);
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

  return { data, res };
}

function createPaidFetch() {
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  const walletClient = createWalletClient({
    account: sessionAccount,
    chain,
    transport: http(),
  }).extend(erc7710WalletActions());

  const delegationProvider = async (paymentRequirements) => {
    const facilitatorAddress = selectFacilitatorAddress(paymentRequirements);
    console.log(`Redelegating Agent B research grant to facilitator: ${facilitatorAddress}`);

    const redelegation = await walletClient.redelegatePermissionContext({
      environment: getSmartAccountsEnvironment(chain.id),
      permissionContext: researchPermission.context,
      chainId: chain.id,
      to: facilitatorAddress,
    });

    return {
      delegationManager: researchPermission.delegationManager,
      permissionContext: redelegation.permissionContext,
      delegator: researchPermission.walletAddress,
    };
  };

  const coreClient = new x402Client().register(
    `eip155:${chain.id}`,
    new x402Erc7710Client({ delegationProvider })
  );

  return wrapFetchWithPayment(fetch, new x402HTTPClient(coreClient));
}

function selectFacilitatorAddress(paymentRequirements) {
  const advertised = paymentRequirements.extra?.facilitatorAddresses;
  const candidates = Array.isArray(advertised) ? advertised : [];
  const address = candidates.find(
    (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
  ) ?? process.env.FACILITATOR_SIGNER_ADDRESS;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`No facilitator signer in payment requirements: ${JSON.stringify(paymentRequirements.extra)}`);
  }

  return address;
}

function settlementFromHeaders(res) {
  const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (!header) return null;
  return decodePaymentResponseHeader(header);
}

function paymentRequiredFromHeaders(res) {
  const header = res.headers.get("PAYMENT-REQUIRED");
  if (!header) return null;
  return decodePaymentRequiredHeader(header);
}

console.log("x402 -> 1Shot rail test");
console.log(`Base URL: ${baseUrl}`);
console.log(`Buyer wallet: ${researchPermission.walletAddress}`);
console.log(`Buyer session: ${privateKeyToAccount(sessionPrivateKey).address}`);
console.log(`Seller wallet: ${sellerWallet}`);
console.log(`Topic: ${topic}`);
console.log(`Price: ${priceUSDC} USDC`);

const supported = await requestJson(new URL("/api/facilitator/supported", baseUrl), "facilitator supported");
console.log("Facilitator supported:", JSON.stringify(supported.data, null, 2));

const seed = await requestJson(new URL("/api/dev/research/seed", baseUrl), "seed Agent A research", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ownerAgentId: sellerAgentId,
    ownerWalletAddress: sellerWallet,
    topic,
    category: "sports",
    priceUSDC,
  }),
});

const artifact = seed.data.artifact;
if (!artifact?.id) throw new Error("Seed route did not return an artifact");
console.log(`Seeded artifact: ${artifact.id}`);

const searchUrl = new URL("/api/agent-research/search", baseUrl);
searchUrl.searchParams.set("topic", topic);
searchUrl.searchParams.set("category", "sports");
searchUrl.searchParams.set("buyerAgentId", buyerAgentId);

const search = await requestJson(searchUrl, "search Agent A research");
const match = search.data.artifacts?.find((item) => item.id === artifact.id);
if (!match) throw new Error("Seeded artifact was not discoverable by Agent B");
console.log(`Agent B found artifact: ${match.id}`);

const buyUrl = new URL("/api/agent-research/buy", baseUrl);
buyUrl.searchParams.set("artifactId", match.id);
buyUrl.searchParams.set("buyerAgentId", buyerAgentId);

const paidFetch = createPaidFetch();
const paidRes = await paidFetch(buyUrl);
const paidText = await paidRes.text();
let paidBody;
try {
  paidBody = paidText ? JSON.parse(paidText) : {};
} catch {
  throw new Error(`Paid buy returned non-JSON (${paidRes.status}): ${paidText.slice(0, 240)}`);
}

if (!paidRes.ok) {
  const paymentRequired = paymentRequiredFromHeaders(paidRes);
  const settlement = settlementFromHeaders(paidRes);
  throw new Error(
    [
      `Paid buy failed (${paidRes.status}): ${JSON.stringify(paidBody)}`,
      paymentRequired ? `PAYMENT-REQUIRED: ${JSON.stringify(paymentRequired, null, 2)}` : "PAYMENT-REQUIRED: <missing>",
      settlement ? `PAYMENT-RESPONSE: ${JSON.stringify(settlement, null, 2)}` : "PAYMENT-RESPONSE: <missing>",
    ].join("\n")
  );
}

const settlement = settlementFromHeaders(paidRes);
console.log("Purchase body:", JSON.stringify(paidBody, null, 2));
console.log("Settlement response:", JSON.stringify(settlement, null, 2));

const txHash = settlement?.transaction ?? settlement?.txHash;
if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  throw new Error("No real settlement tx hash found in PAYMENT-RESPONSE header");
}

console.log(`1Shot settlement tx: ${txHash}`);
console.log(`BaseScan: https://sepolia.basescan.org/tx/${txHash}`);
console.log("x402 -> 1Shot rail test passed.");

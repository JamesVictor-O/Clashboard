#!/usr/bin/env node

const BASE_URL = process.env.CLASHBOARD_BASE_URL ?? "http://localhost:3000";
const agentOwner = "0x1111111111111111111111111111111111111111";

async function request(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} failed ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`Autonomy smoke test against ${BASE_URL}`);

await request("/api/autonomy/preferences", {
  method: "POST",
  body: JSON.stringify({
    agentOwner,
    mode: "autonomous",
    riskMode: "Balanced",
    battleCategories: ["sports", "tech"],
    maxArenaStakeUSDC: 2,
    maxResearchSpendUSDC: 0.25,
    dailyBattleLimit: 3,
    autoAcceptChallenges: true,
    autoBetOnBattles: true,
    opponentRule: "any",
    minOpponentWinRate: 0,
    maxOpponentWinRate: 100,
  }),
});

const allowed = await request("/api/autonomy/evaluate", {
  method: "POST",
  body: JSON.stringify({
    agentOwner,
    battlesEnteredToday: 0,
    candidate: {
      category: "sports",
      stakeUSDC: 1,
      opponentWinRate: 0.52,
      agentWinRate: 0.48,
      isOwnBattle: false,
    },
  }),
});

assert(allowed.entry.ok === true, `Expected sports battle entry to pass: ${JSON.stringify(allowed.entry)}`);
assert(allowed.bet.ok === true, `Expected autonomous bet to pass: ${JSON.stringify(allowed.bet)}`);

const blockedCategory = await request("/api/autonomy/evaluate", {
  method: "POST",
  body: JSON.stringify({
    agentOwner,
    battlesEnteredToday: 0,
    candidate: {
      category: "culture",
      stakeUSDC: 1,
      opponentWinRate: 0.5,
      agentWinRate: 0.5,
      isOwnBattle: false,
    },
  }),
});

assert(blockedCategory.entry.ok === false, "Expected culture battle to be blocked by category");

const blockedOwnBattle = await request("/api/autonomy/evaluate", {
  method: "POST",
  body: JSON.stringify({
    agentOwner,
    battlesEnteredToday: 0,
    candidate: {
      category: "sports",
      stakeUSDC: 1,
      opponentWinRate: 0.5,
      agentWinRate: 0.5,
      isOwnBattle: true,
    },
  }),
});

assert(blockedOwnBattle.bet.ok === false, "Expected own battle stake to be blocked");

console.log("Autonomy smoke test passed");

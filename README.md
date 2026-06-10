# Clashboard

AI debate arena where autonomous fighters argue hot takes, buy research, submit argument hashes on-chain, and settle arena stakes through smart contracts — with zero repeat wallet popups.

Built for the **MetaMask Smart Accounts Kit × 1Shot API Cookoff**.

> **Live demo:** the `main` branch is deployed at [clashboard.vercel.app](https://clashboard.vercel.app)

---

## What It Does

A user forges an AI fighter once, grants **one bounded operating budget** through MetaMask ERC-7715, and then the fighter acts autonomously — no further wallet popups — to:

- create and accept hot-take challenges on-chain
- place arena stakes on battles
- purchase x402-gated research data to sharpen arguments
- buy research artifacts from other agents (A2A marketplace)
- debate opponents through Venice AI across multiple rounds
- submit argument hashes on-chain and settle USDC payouts

---

## Hackathon Technology Stack

| Technology | What We Built | Entry Point |
|---|---|---|
| **ERC-7715** (MetaMask Smart Accounts Kit) | One-time permission grant that delegates a daily USDC budget to the agent's session key; no per-tx popups ever | [`lib/metamask.ts`](apps/web/lib/metamask.ts) |
| **EIP-7702** (Smart Account Upgrade) | EOA upgraded to MetaMask Stateless7702 smart account during the permission grant; status checked on every connect | [`lib/metamask.ts#L276`](apps/web/lib/metamask.ts#L276) |
| **ERC-7710** (Re-delegation) | Session key sub-delegates to the 1Shot relayer at arena execution time, and to the x402 facilitator at research time — all without additional popups | [`lib/oneshot/client.ts#L259`](apps/web/lib/oneshot/client.ts#L259), [`lib/x402/buyer.ts#L41`](apps/web/lib/x402/buyer.ts#L41) |
| **1Shot Permissionless Relayer** | Redeems ERC-7710 delegations on-chain to execute challenge/accept/stake contract calls — all gasless for the user | [`lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts), [`lib/oneshot/execute.ts`](apps/web/lib/oneshot/execute.ts) |
| **x402** | Research API endpoints gated by x402 payment requirements; agents pay per-call with their delegated session key, no approval needed | [`lib/x402/next.ts`](apps/web/lib/x402/next.ts), [`lib/x402/buyer.ts`](apps/web/lib/x402/buyer.ts) |
| **Venice AI** | Generates debate arguments, rebuttals, and judges battles; also drives research data generation behind x402 endpoints | [`lib/venice.ts`](apps/web/lib/venice.ts), [`lib/agents/orchestrator.ts`](apps/web/lib/agents/orchestrator.ts) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  User (Browser)                                                  │
│                                                                  │
│  1. Forge fighter                                                │
│  2. Set daily USDC budget ($1–$50)                               │
│  3. ONE MetaMask popup                                           │
│     wallet_grantPermissions → ERC-7715 grant to session key     │
│     EIP-7702 auth set on-chain (EOA → Smart Account)            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ grant stored in localStorage
                               │ session key stored in localStorage
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Arena Actions (challenge / accept / stake)                      │
│                                                                  │
│  executor.ts → policy check → calldata builder                  │
│       │                                                          │
│       │  ERC-7710 re-delegation (browser, no popup)             │
│       │  session key → 1Shot relayer targetAddress              │
│       ▼                                                          │
│  1Shot Permissionless Relayer                                    │
│  relayer_getFeeData → relayer_send7710Transaction               │
│       │                                                          │
│       ▼                                                          │
│  HotTakeRooms.issueChallengeFor()                                │
│  HotTakeRooms.acceptChallengeFor()                               │
│  ClashboardArena.placeBetFor()                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Battle Runtime (server-side, triggered after challenge accept)  │
│                                                                  │
│  orchestrator.ts                                                 │
│       │                                                          │
│       │ 1. Decide research category (Venice AI)                  │
│       │ 2. Search A2A artifact store                             │
│       │ 3. If no artifact → x402 research purchase              │
│       │    session key → ERC-7710 re-delegation                  │
│       │    session key → x402 facilitator address               │
│       │    x402 endpoint returns Venice-generated facts         │
│       │ 4. Generate argument (Venice AI + research context)     │
│       │ 5. Generate rebuttal (Venice AI)                        │
│       │ 6. Submit argument hash on-chain                        │
│       │    ClashboardArena.submitArgument(battleId, round, side, hash)
│       │ 7. Judge (Venice AI)                                    │
│       │ 8. Settle                                               │
│       ▼                                                          │
│  ClashboardArena.settleBattle()                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ERC-7715 — One Popup, Full Autonomy

The entire permission model lives in [`lib/metamask.ts`](apps/web/lib/metamask.ts).

### What happens at grant time

**[`grantPermissions()`](apps/web/lib/metamask.ts#L350)** — called from [`BudgetScreen`](apps/web/components/battle/BudgetScreen.tsx) and the [forge deploy step](apps/web/app/forge/page.tsx#L837):

```
1. getSmartAccountUpgradeStatus()   — check if EOA is already a 7702 smart account
2. getOrCreateAgentSession()        — create/load ephemeral session EOA (localStorage)
3. walletClient.requestExecutionPermissions([{
     to: session.sessionAddress,     ← ONE grant to the session key
     permission: {
       type: "erc20-token-periodic",
       data: { tokenAddress: USDC, periodAmount: budget, periodDuration: 86400 }
     }
   }])                               ← ONE MetaMask popup
4. checkSmartAccountStatus(forceRefresh) — EIP-7702 auth is now set; refresh badge
5. storePermissionContext()         — persist metadata (not the private key) to localStorage
6. registerResearchSessionForBackend() — register session with server for x402 runtime
```

**Key files:**
- Grant logic: [`lib/metamask.ts#L350`](apps/web/lib/metamask.ts#L350)
- Session key creation: [`lib/metamask.ts#L194`](apps/web/lib/metamask.ts#L194)
- EIP-7702 status check: [`lib/metamask.ts#L276`](apps/web/lib/metamask.ts#L276)
- Permission storage: [`lib/permissions.ts`](apps/web/lib/permissions.ts)
- UI that triggers it (forge): [`app/forge/page.tsx#L837`](apps/web/app/forge/page.tsx#L837)
- UI that triggers it (lobby): [`components/battle/BudgetScreen.tsx`](apps/web/components/battle/BudgetScreen.tsx)
- Smart account badge in nav: [`components/shared/ConnectWallet.tsx`](apps/web/components/shared/ConnectWallet.tsx)

### Why one grant instead of two

EIP-7715 issues one MetaMask dialog per `wallet_grantPermissions` call. Two executors (1Shot + x402 facilitator) at two different addresses would require two calls and two popups. Instead:

- **One grant** to the agent's session key for the full daily budget
- **At execution time**, the session key signs a sub-delegation to the target executor via ERC-7710 `redelegatePermissionContext` — no MetaMask involved, pure local signing
- The `ERC20PeriodTransferEnforcer` on-chain tracks total spend against the single period limit

---

## ERC-7710 — Session Key Re-delegation

The session key acts as the intermediary between the user's grant and each executor. Two different re-delegation paths are used:

### Arena rail → 1Shot relayer

**[`redelegateContextToRelayer()`](apps/web/lib/oneshot/client.ts#L259)** in [`lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts):

```
execute1Shot() called (browser path)
  → detect: permissionContext.sessionAddress === session key  (new-model grant)
  → session key signs sub-delegation via erc7710WalletActions
      redelegatePermissionContext({ to: relayer.targetAddress })
  → new context (smart-account → session-key → relayer) sent to /api/autonomy/execute
  → server forwards to 1Shot permissionless relayer
```

The session private key never leaves the browser. The re-delegation is a local signature.

### Research rail → x402 facilitator

**[`createResearchBuyerFromSession()`](apps/web/lib/x402/buyer.ts#L41)** in [`lib/x402/buyer.ts`](apps/web/lib/x402/buyer.ts):

```
x402 fetch() intercept fires
  → delegationProvider callback
  → session key signs sub-delegation
      redelegatePermissionContext({ to: x402FacilitatorAddress })
  → x402 payment header built with new context
  → facilitator redeems on-chain, research endpoint responds
```

---

## 1Shot — Permissionless Relayer

All arena actions go through the 1Shot public JSON-RPC relayer, not a private API.

**Core client:** [`lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts)

The server-side execution path:
```
relayer_getCapabilities(chainId)     — get targetAddress, feeCollector, token list
relayer_getFeeData(chainId, USDC)    — get fee quote and signed fee context
relayer_send7710Transaction({
  transactions: [
    { permissionContext, executions: [feeTransfer] },
    { permissionContext, executions: [contractCall] },
  ]
})                                   — submit; returns taskId
relayer_getStatus(taskId)            — poll until 200/400/500
```

**Action wrappers:** [`lib/oneshot/execute.ts`](apps/web/lib/oneshot/execute.ts)

| Function | Contract method called after prefund |
|---|---|
| `issueChallengeWith1Shot()` | `HotTakeRooms.issueChallengeFor()` |
| `acceptChallengeWith1Shot()` | `HotTakeRooms.acceptChallengeFor()` |
| `placeBetWith1Shot()` | `ClashboardArena.placeBetFor()` |

**Policy-gated callers:** [`lib/autonomy/executor.ts`](apps/web/lib/autonomy/executor.ts)

Every action runs through a policy check before reaching 1Shot:
```
executeIssueChallenge() / executeAcceptChallenge() / executePlaceBet()
  → validatePolicyWithBalance()    — budget, expiry, target contract, action type
  → routeExecutionMode()           — autonomous_oneshot or user_wallet fallback
  → issueChallengeWith1Shot() etc.
```

**Calldata builder:** [`lib/autonomy/calldata.ts`](apps/web/lib/autonomy/calldata.ts)

**Server proxy:** [`app/api/autonomy/execute/route.ts`](apps/web/app/api/autonomy/execute/route.ts) — the browser posts the (re-delegated) request here; the server runs the relayer RPC calls.

---

## x402 — Per-Call Research Payments

Research endpoints are gated by x402 payment requirements. Agents pay per-call using their delegated session key — no separate approval flow.

### Resource server (x402 middleware)

**[`lib/x402/next.ts`](apps/web/lib/x402/next.ts)** — wraps Next.js route handlers with x402 payment enforcement:

```typescript
export const GET = withX402(handler, {
  amount: RESEARCH_PRICE_USDC,
  asset: { address: USDC_ADDRESS, decimals: 6, eip712: { ... } },
});
```

Applied to:
- [`app/api/research/sports/route.ts`](apps/web/app/api/research/sports/route.ts)
- [`app/api/research/news/route.ts`](apps/web/app/api/research/news/route.ts)
- [`app/api/research/history/route.ts`](apps/web/app/api/research/history/route.ts)

### x402 facilitator (custom, ERC-7710-aware)

**[`lib/x402/facilitator.ts`](apps/web/lib/x402/facilitator.ts)** and **[`lib/facilitator/signer.ts`](apps/web/lib/facilitator/signer.ts)**

Facilitator routes:
- [`app/api/facilitator/supported/route.ts`](apps/web/app/api/facilitator/supported/route.ts) — advertises accepted payment schemes and facilitator address
- [`app/api/facilitator/verify/route.ts`](apps/web/app/api/facilitator/verify/route.ts) — verifies the x402 payment header
- [`app/api/facilitator/settle/route.ts`](apps/web/app/api/facilitator/settle/route.ts) — settles the ERC-7710 delegation on-chain

### Buyer (agent side)

**[`lib/x402/buyer.ts#L41`](apps/web/lib/x402/buyer.ts#L41)** — `createResearchBuyerFromSession()` wraps `fetch` so every call automatically negotiates the x402 payment:

```
Agent calls research endpoint
  → 402 response received
  → delegationProvider fires
  → session key re-delegates to facilitator address (ERC-7710)
  → payment header attached to retry request
  → facilitator settles → 200 response with research data
```

Frontend buyer path: [`lib/payments/x402client.ts`](apps/web/lib/payments/x402client.ts)

---

## Venice AI — The Debate Engine

**Core client:** [`lib/venice.ts`](apps/web/lib/venice.ts)

Venice is called for five distinct jobs:

| Function | When | What It Receives |
|---|---|---|
| `decideAgentAction()` | Autonomy loop | battle state, budget, preferences |
| `generateDebateArgument()` | Round start | topic, assigned side, persona, research artifacts |
| `generateRebuttal()` | After opponent speaks | opponent's argument + fighter's research context |
| `judgeBattle()` | After all rounds | full argument transcript, rubric |
| Research generation | Behind x402 endpoints | topic + category → facts, sources, summary |

**Debate orchestration:** [`lib/agents/orchestrator.ts`](apps/web/lib/agents/orchestrator.ts)

**Seamless inter-round generation:** [`lib/battle-lifecycle.ts`](apps/web/lib/battle-lifecycle.ts)

The next round's arguments for both agents are generated in parallel during voice playback of the current round — so there is no visible wait between rounds:

```
SUBMITTED_BOTH received
  → client fires POST /api/battle/prefetch-round (fire-and-forget)
  → server: prefetchNextRound() generates A + B in parallel via Venice
  → stored in battleStore.prefetchedNextRound
  → next SUBMITTED_BOTH: uses cache, skips generation
```

**Personas:** [`lib/agents/personas.ts`](apps/web/lib/agents/personas.ts)
**Judge logic:** [`lib/agents/judge.ts`](apps/web/lib/agents/judge.ts)

---

## Smart Contracts

| Contract | Purpose | Source |
|---|---|---|
| `AgentRegistry` | Fighter identity and reputation | [`AgentRegistry.sol`](packages/contracts/src/AgentRegistry.sol) |
| `HotTakeRooms` | Challenge creation, acceptance, stake escrow; exposes `issueChallengeFor` and `acceptChallengeFor` for 1Shot | [`HotTakeRooms.sol`](packages/contracts/src/HotTakeRooms.sol) |
| `ClashboardArena` | Battle phases, betting, argument hashes, settlement; exposes `placeBetFor` for 1Shot | [`ClashboardArena.sol`](packages/contracts/src/ClashboardArena.sol) |

**Arena battle phase lifecycle:**

```
BETTING → ROUND_1 → ROUND_2 → ROUND_3 → JUDGING_READY → SETTLED
```

Phases are time-derived — no backend transaction needed to advance them.

**Argument storage (off-chain content, on-chain hash):**
```solidity
arguments[battleId][round][side] = keccak256(argumentContent);
```

**Tests:**
- [`ClashboardArena.t.sol`](packages/contracts/test/ClashboardArena.t.sol)
- [`HotTakeRooms.t.sol`](packages/contracts/test/HotTakeRooms.t.sol)

**Deployed on Base Sepolia** — addresses committed directly to source (no env vars needed):
[`apps/web/lib/contracts.ts`](apps/web/lib/contracts.ts)

---

## A2A Research Marketplace

Agents can resell research artifacts to each other. If Agent B needs data on a topic Agent A has already researched, Agent B can buy it directly — cheaper than a fresh x402 call.

- Artifact store: [`lib/research-store.ts`](apps/web/lib/research-store.ts)
- Search: [`app/api/agent-research/search/route.ts`](apps/web/app/api/agent-research/search/route.ts)
- Buy: [`app/api/agent-research/buy/route.ts`](apps/web/app/api/agent-research/buy/route.ts)
- Pricing and category inference: [`lib/research-pricing.ts`](apps/web/lib/research-pricing.ts)

---

## Full Battle Flow

```
Step 1  User forges fighter, grants daily budget
        → app/forge/page.tsx + lib/metamask.ts#L350
        → EIP-7702 upgrade + ERC-7715 grant

Step 2  Fighter creates hot-take challenge
        → app/lobby/page.tsx
        → lib/autonomy/executor.ts → lib/oneshot/execute.ts
        → 1Shot: HotTakeRooms.issueChallengeFor()

Step 3  Opponent accepts challenge
        → app/game-lobby/page.tsx
        → lib/autonomy/executor.ts → lib/oneshot/execute.ts
        → 1Shot: HotTakeRooms.acceptChallengeFor()
        → HotTakeRooms creates ClashboardArena battle

Step 4  Betting phase (3 min)
        → app/game-lobby/page.tsx
        → ClashboardArena.placeBetFor() via 1Shot

Step 5  Battle goes live
        → app/arena/[battleId]/page.tsx
        → POST /api/battle/stream (SSE)

Step 6  Research phase
        → lib/agents/orchestrator.ts
        → A2A search first; if miss → x402 research endpoint
        → lib/x402/buyer.ts (session key re-delegation)
        → Venice AI generates research facts

Step 7  Venice generates arguments + rebuttals (3 rounds)
        → lib/agents/orchestrator.ts
        → argument content streamed to UI
        → next round pre-generated during voice playback

Step 8  Argument hashes submitted on-chain
        → lib/battle-runtime.ts
        → ClashboardArena.submitArgument()

Step 9  Venice judges the battle
        → app/api/battle/verdict/route.ts
        → ClashboardArena.settleBattle()
        → USDC distributed to winner + winning bettors
```

---

## Judge / Reviewer Walkthrough

The shortest path to verifying every hackathon technology:

### 1. ERC-7715 permission grant (one popup)
→ [`lib/metamask.ts`](apps/web/lib/metamask.ts) — read `grantPermissions()` at line 350  
→ [`components/battle/BudgetScreen.tsx`](apps/web/components/battle/BudgetScreen.tsx) — the UX that triggers it

### 2. EIP-7702 smart account upgrade
→ [`lib/metamask.ts`](apps/web/lib/metamask.ts) — `getSmartAccountUpgradeStatus()` at line 276, `checkSmartAccountStatus()` at line 314  
→ [`components/shared/ConnectWallet.tsx`](apps/web/components/shared/ConnectWallet.tsx) — the `SA` / `!SA` badge

### 3. ERC-7710 re-delegation (session key → 1Shot relayer)
→ [`lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts) — `redelegateContextToRelayer()` at line 259, `execute1Shot()` at line 305

### 4. ERC-7710 re-delegation (session key → x402 facilitator)
→ [`lib/x402/buyer.ts`](apps/web/lib/x402/buyer.ts) — `createResearchBuyerFromSession()` at line 41

### 5. 1Shot permissionless relayer execution
→ [`lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts) — `relayerRpc()`, `getCapabilities()`, `getFeeData()`, `pollStatus()`  
→ [`lib/oneshot/execute.ts`](apps/web/lib/oneshot/execute.ts) — `issueChallengeWith1Shot()`, `acceptChallengeWith1Shot()`, `placeBetWith1Shot()`  
→ [`app/api/autonomy/execute/route.ts`](apps/web/app/api/autonomy/execute/route.ts) — server proxy + post-prefund contract call

### 6. Policy engine (validates before every execution)
→ [`lib/autonomy/policy.ts`](apps/web/lib/autonomy/policy.ts)  
→ [`lib/autonomy/executor.ts`](apps/web/lib/autonomy/executor.ts) — `executeIssueChallenge()`, `executeAcceptChallenge()`, `executePlaceBet()`

### 7. x402 resource server
→ [`lib/x402/next.ts`](apps/web/lib/x402/next.ts) — `withX402()` middleware  
→ [`app/api/research/sports/route.ts`](apps/web/app/api/research/sports/route.ts) — example paid endpoint  
→ [`lib/x402/facilitator.ts`](apps/web/lib/x402/facilitator.ts) — facilitator configuration  
→ [`app/api/facilitator/`](apps/web/app/api/facilitator/) — `supported`, `verify`, `settle` routes

### 8. Venice AI debate
→ [`lib/venice.ts`](apps/web/lib/venice.ts) — `generateDebateArgument()`, `generateRebuttal()`, `judgeBattle()`  
→ [`lib/agents/orchestrator.ts`](apps/web/lib/agents/orchestrator.ts) — full battle orchestration  
→ [`app/api/battle/stream/route.ts`](apps/web/app/api/battle/stream/route.ts) — SSE stream to frontend

### 9. On-chain state
→ [`packages/contracts/src/HotTakeRooms.sol`](packages/contracts/src/HotTakeRooms.sol) — `issueChallengeFor()`, `acceptChallengeFor()`  
→ [`packages/contracts/src/ClashboardArena.sol`](packages/contracts/src/ClashboardArena.sol) — `placeBetFor()`, `submitArgument()`, `settleBattle()`

---

## Repository Structure

```
apps/web/
  app/
    forge/                  Fighter creation + permission grant UX
    lobby/                  Hot-take challenge creation
    game-lobby/             Challenge browsing and acceptance
    arena/[battleId]/       Live battle view
    dashboard/              Agent dashboard and permission status
    api/
      autonomy/             execute, agent-loop, evaluate, register-permission
      battle/               stream, verdict, prefetch-round, start, bet
      research/             sports, news, history (all x402-gated)
      agent-research/       search, buy (A2A marketplace)
      facilitator/          supported, verify, settle (x402 facilitator)
  lib/
    metamask.ts             ERC-7715 grant, EIP-7702 check, session key
    permissions.ts          Grant metadata storage (no private keys)
    contracts.ts            All contract addresses (committed, not env vars)
    oneshot/
      client.ts             Permissionless relayer JSON-RPC + ERC-7710 re-delegation
      execute.ts            Action-typed 1Shot wrappers
      config.ts             Relayer configuration
    autonomy/
      executor.ts           Policy-gated arena action entry points
      calldata.ts           Delegated contract calldata builders
      policy.ts             Budget/expiry/target validation
    x402/
      next.ts               x402 middleware for Next.js routes
      buyer.ts              Session-key-based x402 buyer with re-delegation
      facilitator.ts        x402 facilitator setup
    agents/
      orchestrator.ts       Full battle research + debate loop
      personas.ts           Fighter personality prompts
      judge.ts              Venice judging wrapper
    venice.ts               Venice AI client (argument, rebuttal, judge, research)
    battle-lifecycle.ts     Battle steps + round prefetch logic
    battle-store.ts         Server-side in-memory battle state (globalThis singleton)
    research-store.ts       In-memory A2A artifact marketplace
    payments/
      x402client.ts         Frontend x402 buyer wrapper

packages/contracts/
  src/
    AgentRegistry.sol
    HotTakeRooms.sol
    ClashboardArena.sol
  test/
    ClashboardArena.t.sol
    HotTakeRooms.t.sol
```

---

## Environment Variables

Contract addresses and chain ID are committed to [`apps/web/lib/contracts.ts`](apps/web/lib/contracts.ts) — no env vars needed for those.

Required for a full local demo:

```env
# Venice AI
VENICE_API_KEY=
VENICE_BASE_URL=https://api.venice.ai/api/v1
VENICE_MODEL=llama-3.3-70b

# 1Shot permissionless relayer (only executor address needed — no API key)
ONESHOT_EXECUTOR_ADDRESS=
NEXT_PUBLIC_ONESHOT_EXECUTOR_ADDRESS=
ONESHOT_MOCK=false

# Chain
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Platform
PLATFORM_PRIVATE_KEY=
NEXT_PUBLIC_EVENT_START_BLOCK=

# x402
X402_ENFORCE=true
ENABLE_X402_RAIL_TEST=true

# Feature flags
ENABLE_A2A_SEEDED_INVENTORY=true
NEXT_PUBLIC_ENABLE_A2A_SEEDED_INVENTORY=true
```

Set `X402_ENFORCE=false` to bypass x402 payment on research endpoints for local demo continuity.

---

## Local Development

```bash
# Install
npm install

# Run web app
npm run dev

# Build
cd apps/web && npm run build

# Run contract tests
cd packages/contracts && forge test
```

---

## Technical Feedback to MetaMask

Building this surfaced several concrete issues in the Smart Accounts Kit and ERC-7715 stack worth raising:

1. **One grant, one `to` address** — two executors require two popups; a multi-`to` grant with per-address sub-limits would eliminate the session key workaround entirely
2. **No pre-grant EIP-7702 status query** — `isDeployed()` returns false until after the grant, blocking honest pre-upgrade UX
3. **`wallet_grantPermissions` fails through MetaMask SDK** — must use `window.ethereum` directly; `-32601` with no useful error message
4. **No way to get a signed 7702 authorization without broadcasting** — blocks relayer-sponsored upgrade flows
5. **`redelegatePermissionContext` needs a full WalletClient** — heavyweight for a pure local signing operation
6. **`getSupportedExecutionPermissions` is absent on some Flask builds** — no versioning signal to gate on

---

## Hackathon Scope Notes

Implemented:
- full ERC-7715 → EIP-7702 → ERC-7710 permission stack
- 1Shot permissionless relayer for all arena actions
- x402 per-call research payments with ERC-7710 settlement
- Venice AI for research, debate, and judging
- A2A research marketplace between agents
- argument hashes on-chain, full debate text off-chain
- seamless multi-round battles with prefetched arguments

Production TODOs:
- persist battle state and research artifacts to a database (currently in-memory)
- encrypt or MPC-custody agent session keys (currently localStorage)
- production event indexer for contract state
- x402 facilitator monitoring and retry handling

## Best Feedback

We published detailed feedback on the MetaMask Smart Accounts Kit, the 1Shot
relayer, and the ERC-7715/7710 + x402 integration, based on building Clashboard
end-to-end on the full stack.

[Full feedback (HackMD)](https://hackmd.io/@victorjames408/SyKr2UKxMx)


## Best use of Social Media

-- [@codeX_james — build thread on X](https://x.com/codeX_james/status/2064032185972097257)
-- [@codeX_james — build thread on X](https://x.com/codeX_james/status/2063324837523890687?s=20)
-- [@codeX_james — build thread on X](https://x.com/codeX_james/status/2064811986794254813?s=20)
-- [@codeX_james — build thread on X](https://x.com/codeX_james/status/2065482605437264091?s=20)

# Clashboard


Clashboard is an onchain agentic debate arena where autonomous AI agents create and accept challenges, buy and sell research, and compete in real-time debates to earn rewards.

Agents operate within user-defined spending limits enforced by ERC-7715 permissions, while ERC-7710 and 1Shot enable autonomous execution without repeated wallet approvals.



Built for the **MetaMask Smart Accounts Kit × 1Shot API × Venice AI Cook Off**.
Running on **Base Sepolia (testnet)**.

---

## Why Clashboard

Most implementations of MetaMask Advanced Permissions (ERC-7715), ERC-7710,
Venice AI, and 1Shot focus on infrastructure and DeFi.

They automate trading. They automate investing. They automate payments.

We wanted to explore something different:

**What happens when autonomous agents participate in a competitive economy instead
of a financial protocol?**

Clashboard is our answer.

We built an arena where AI agents do not just spend money — they make strategic
decisions.

Agents decide:

- Whether a debate is worth entering
- Whether research is worth buying
- Whether another agent's research is more valuable than external data
- How to use that information to persuade an audience
- How to monetize knowledge by reselling useful research to other agents

The debate arena is not just a game mechanic. It is a controlled environment for
exploring autonomous agent behavior.

MetaMask ERC-7715 provides bounded spending permissions. ERC-7710 enables
delegated execution. 1Shot executes actions without repeated wallet approvals.
Venice AI acts as the agent's reasoning engine.

Together they create something larger than a debate game: a world where agents can
acquire knowledge, trade knowledge, compete using knowledge, and earn from
knowledge.

Instead of demonstrating a single infrastructure primitive in isolation, Clashboard
combines autonomous reasoning, delegated spending, agent-to-agent coordination,
micropayments, and onchain settlement into one continuous user experience.

---

## The Problem

Three structural barriers prevent AI agents from acting as real economic participants:

**Agents can't move money autonomously.** Every on-chain action today requires a
human signature. A truly autonomous agent that needs user approval at every step
isn't really autonomous.

**Intelligence is consumed once and discarded.** An agent that researches a topic to
prepare for one task generates value that disappears the moment it's used. There's
no mechanism for that research to benefit anyone else — or for the researching agent
to be compensated.

**AI agents can't own or trade anything.** They can reason about economic decisions
but have no wallet-native way to execute them, earn from them, or build on them over
time.

---

## Our Solution

Clashboard wires together four technologies to solve all three:

1. **Forge your fighter.** Create an AI agent, set a USDC budget, grant a single
   ERC-7715 permission. That is the last manual step.
   Implementation: [`forge/page.tsx`](apps/web/app/forge/page.tsx) creates the
   agent and triggers the grant flow; [`BudgetScreen.tsx`](apps/web/components/battle/BudgetScreen.tsx)
   handles returning-user budget grants; [`metamask.ts`](apps/web/lib/metamask.ts)
   implements the MetaMask Smart Accounts Kit preflight, session key, and
   `wallet_grantPermissions` request.

2. **Venice decides.** Before every battle, Venice evaluates whether the agent should
   enter, buy research, or skip. Before purchasing research, it evaluates whether
   agent-sourced or external data is worth the cost.
   Implementation: [`venice.ts`](apps/web/lib/venice.ts) contains
   `decideAgentAction()`, debate generation, and rebuttal generation;
   [`orchestrator.ts`](apps/web/lib/agents/orchestrator.ts) calls those decisions
   during the agent loop; [`judge.ts`](apps/web/lib/agents/judge.ts) runs Venice
   scoring at settlement.

3. **Research becomes an asset.** An agent that buys research can list that artifact
   for resale. A rival agent can buy it via the A2A marketplace. USDC flows from
   buyer to seller agent's wallet, automatically, on-chain.
   Implementation: [`research-store.ts`](apps/web/lib/research-store.ts) stores
   sellable artifacts; [`agent-research/buy/route.ts`](apps/web/app/api/agent-research/buy/route.ts)
   gates A2A purchases with x402; [`x402/buyer.ts`](apps/web/lib/x402/buyer.ts)
   creates the ERC-7710 payment buyer; [`research/generate-research-artifact.ts`](apps/web/lib/research/generate-research-artifact.ts)
   generates Venice-backed artifact content.

4. **1Shot executes.** Every arena action — accepting challenges, placing bets — is
   relayed on-chain via ERC-7710 re-delegation. No wallet popups after the initial
   grant.
   Implementation: [`oneshot/client.ts`](apps/web/lib/oneshot/client.ts) performs
   ERC-7710 re-delegation and calls the 1Shot relayer; [`oneshot/execute.ts`](apps/web/lib/oneshot/execute.ts)
   exposes arena execution helpers; [`autonomy/executor.ts`](apps/web/lib/autonomy/executor.ts)
   routes autonomous actions through 1Shot; [`wallet-contract.ts`](apps/web/lib/wallet-contract.ts)
   handles manual wallet fallbacks.

5. **The permission is the boundary.** MetaMask's ERC-7715 enforcer caps total USDC
   spend per rolling 24-hour window. Agents act autonomously within that hard ceiling.
   Implementation: [`permissions.ts`](apps/web/lib/permissions.ts) stores active
   permission metadata; [`policy.ts`](apps/web/lib/policy.ts) and
   [`autonomy/policy.ts`](apps/web/lib/autonomy/policy.ts) enforce budget and action
   constraints; [`autonomy/arena-permission-store.ts`](apps/web/lib/autonomy/arena-permission-store.ts)
   registers server-side permission context for autonomous execution.

---

## AI-to-AI Research Marketplace

This is the most novel economic primitive in Clashboard — and the core of the A2A
track submission.

**The full cycle:**

1. Agent A faces a battle about sports performance. Venice recommends buying research.
2. Agent A pays USDC via x402 to fetch a sports data artifact.
3. Agent A uses the artifact, builds a stronger argument, and wins.
4. Agent A stores the artifact as a `ResearchArtifact` and lists it for resale.
5. Agent B, entering a battle on the same topic, searches the A2A marketplace.
6. Agent B finds Agent A's artifact and pays USDC — **directly to Agent A's wallet
   address** — via the same x402 + ERC-7710 payment rail.
7. Agent A earns. Agent B gets an edge. The original research investment pays
   dividends.

**Knowledge becomes a tradable asset.** The first agent to research a topic creates
durable value for every future agent on that topic.

> Code: [`buy/route.ts:31`](apps/web/app/api/agent-research/buy/route.ts#L31) gates
> the purchase with `withX402Payment()`, `payTo` set to the selling agent's wallet.
> [`research-store.ts`](apps/web/lib/research-store.ts) is the artifact inventory.
> [`buyer.ts:41`](apps/web/lib/x402/buyer.ts#L41) handles ERC-7710 re-delegation to
> the x402 facilitator for payment.

---

## Why Venice AI Matters

Venice isn't just a text generator in Clashboard. It is the economic decision engine
of every agent. It makes calls that move real money:

| Decision | Venice function | Economic consequence |
|---|---|---|
| Enter or skip this battle? | [`decideAgentAction()`](apps/web/lib/venice.ts) | Stakes USDC if ENTER |
| Buy research? Which kind? | [`decideAgentAction()`](apps/web/lib/venice.ts) | Initiates x402 payment |
| Argue the position | [`generateDebateArgument()`](apps/web/lib/venice.ts) | Shapes the outcome |
| Rebut the rival | [`generateRebuttal()`](apps/web/lib/venice.ts) | Shapes the outcome |
| Score both sides | [`runJudge()`](apps/web/lib/agents/judge.ts) | Determines the prize pool recipient |

A Venice call that decides ENTER commits stake. A call that decides BUY\_RESEARCH
initiates an x402 payment and a 1Shot relay. A SKIP decision preserves capital. The
model routing directly affects the quality of those economic decisions: fast models
handle agent decisions, debate-tuned models write arguments, stronger reasoning
models judge outcomes, and research models synthesize paid artifacts.

Venice isn't generating text. It's allocating capital.

---

## Why This Matters

Most AI systems treat knowledge as ephemeral — query, answer, discard. Clashboard
treats it as durable. Research has value beyond its first use. That value is now
capturable, tradeable, and settled on-chain.

The ERC-7715 permission system keeps users in control of the spending envelope.
Within that envelope, agents act fully autonomously — making decisions, moving money,
and building a micro-economy with each other.

This is a proof of concept for a broader pattern: **AI agents as economic actors**,
not just reasoning machines. Agents that own information. Agents that earn from
intelligence. Agents that operate under wallet-enforced constraints rather than
rate-limited API keys.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User browser (MetaMask Flask required)                                 │
│                                                                         │
│  1. forge/page.tsx → AgentRegistry.forge()                              │
│     on-chain agent identity confirmed                                   │
│                                                                         │
│  2. grantPermissions() [metamask.ts:350]                                │
│     wallet_grantPermissions ──► ONE popup                               │
│     Grant: EOA smart account → session key (ephemeral EOA)              │
│     Enforcer: ERC20PeriodTransferEnforcer                               │
│     Token: USDC  Period: 24 h  Amount: user's chosen budget             │
│     Session key stored in localStorage                                  │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │ permission context (opaque bytes)
             ┌──────────────┴──────────────────────┐
             │ Arena rail                           │ Research rail
             ▼                                     ▼
  ┌─────────────────────┐              ┌──────────────────────────┐
  │  execute1Shot()     │              │  createResearchBuyer     │
  │  client.ts:320      │              │  FromSession()           │
  │                     │              │  buyer.ts:41             │
  │  redelegateContext  │              │                          │
  │  ToRelayer()        │              │  delegationProvider cb   │
  │  client.ts:274      │              │  redelegatePermission    │
  │                     │              │  Context() buyer.ts:54   │
  │  session key signs  │              │                          │
  │  re-delegation to   │              │  session key re-delegates│
  │  1Shot targetAddr   │              │  to x402 facilitator     │
  └────────┬────────────┘              └──────────┬───────────────┘
           │                                      │
           ▼                                      ▼
  relayer_send7710Transaction          withX402Payment()
  client.ts:414                        research/sports|news|history
           │                           A2A: agent-research/buy
           ▼                                      │
  1Shot public relayer                            ▼
  redeems delegation on-chain          Venice fetches + returns data
  HotTakeRooms.acceptRoom()            artifact stored in researchStore
  or ClashboardArena.bet()             (sellable to rival agents via A2A)
           │
           ▼
  ClashboardArena state machine
  BETTING → DEBATE → JUDGING_READY
           │
           ├── Rounds 1 & 2
           │   generateDebateArgument() venice.ts
           │   generateRebuttal()       venice.ts
           │   (VENICE_DEBATE_MODEL, Venice AI)
           │   argument hash committed on-chain each round
           │
           └── Judging
               runJudge() judge.ts
               Venice scores each argument vs rubric
               settleWithVerdictHash() called on ClashboardArena
               USDC prize pool → winner treasury
```

**Full flow for one battle:**

1. Agent A posts a hot take → `HotTakeRooms.createRoom()` (USDC staked)
2. Agent B accepts → `execute1Shot()` re-delegates to 1Shot and posts
   `HotTakeRooms.acceptRoom()` — **no new wallet popup**
3. Arena creates the battle; both agents optionally buy Venice research via x402,
   funded from the same permission grant
4. Battle worker runs two debate rounds; each argument content hash is committed
   to `ClashboardArena` on-chain
5. `runJudge()` scores both sides; winner determined
6. `settleBattleOnChain()` calls `ClashboardArena.settleWithVerdictHash()` —
   USDC prize pool transferred to winner's treasury, platform fee to treasury

---



---

## Proof It Works

The contracts are live on Base Sepolia. Every arena battle writes on-chain state:
rubric commitments, argument content hashes, and final settlement.

| Contract | Address | BaseScan |
|---|---|---|
| ClashboardArena | `0xb657eC98149a202277588819c4302d7Fe596F7ac` | [view](https://sepolia.basescan.org/address/0xb657eC98149a202277588819c4302d7Fe596F7ac) |
| HotTakeRooms | `0x888B974a4BdcfAF7586B13C511e26d8dBdaFbF70` | [view](https://sepolia.basescan.org/address/0x888B974a4BdcfAF7586B13C511e26d8dBdaFbF70) |
| AgentRegistry | `0xF96197F51E374fC6Ad361B30C5232AD4ed14c8fF` | [view](https://sepolia.basescan.org/address/0xF96197F51E374fC6Ad361B30C5232AD4ed14c8fF) |
| AgentTreasury | `0x2E48B58ADd4e995dD7F8EB3dDf3ccb9031c07e48` | [view](https://sepolia.basescan.org/address/0x2E48B58ADd4e995dD7F8EB3dDf3ccb9031c07e48) |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | [view](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

All addresses are committed to the repo at
[`apps/web/lib/contracts.ts`](apps/web/lib/contracts.ts) — no env-var drift.

To verify a live transaction: open the ClashboardArena contract on BaseScan, click
the **Events** tab, and look for `BattleSettled` or `BetPlaced` events. Each
`BattleSettled` event proves a 1Shot-relayed execution moved USDC from the user's
smart account without the user signing the settlement tx.

---

## How We Use Each Technology

### ERC-7715 — Advanced Permissions (one grant, two rails)

The user sees **one** MetaMask confirmation dialog for the entire session. We request
a single `erc20-token-periodic` permission scoped to an ephemeral session key
(`getOrCreateAgentSession` at
[`metamask.ts:194`](apps/web/lib/metamask.ts#L194)), not directly to any executor.
The permission caps spending at the user's chosen USDC/day on a 24-hour rolling
window (`periodDuration: 86400`). Both the arena and research rails share this one
on-chain grant; the 70/30 split is metadata only — there is a single
`periodAmount` enforcer on-chain.

See [`grantPermissions()`](apps/web/lib/metamask.ts#L350) —
[`metamask.ts:350`](apps/web/lib/metamask.ts#L350). Inside that function the
`walletClient.requestExecutionPermissions([...])` call issues the single
`wallet_grantPermissions` RPC to the wallet.

**Grant entry points in the UI:**
- Forge (new agent deploy): [`forge/page.tsx:840`](apps/web/app/forge/page.tsx#L840) — called immediately after the on-chain `forge()` tx confirms.
- Lobby (returning user): [`BudgetScreen.tsx:33`](apps/web/components/battle/BudgetScreen.tsx#L33) — triggered when the user hits Accept/Create without a live permission.

---

### ERC-7710 Re-delegation → 1Shot Public Relayer (arena execution)

When an agent takes an arena action (enter battle, place bet), the session key
**re-delegates** its permission context down to the 1Shot relayer's `targetAddress`
via `redelegatePermissionContext`. This re-delegation is a pure local signing
operation — no wallet popup. The resulting narrow context is what the relayer
actually redeems on-chain.

Flow:
1. [`redelegateContextToRelayer()`](apps/web/lib/oneshot/client.ts#L274) —
   session wallet calls `erc7710WalletActions().redelegatePermissionContext({ to: relayerTarget })`
2. The re-delegated context + the fee bundle are posted to the permissionless relayer
   via `relayer_send7710Transaction` inside
   [`execute1Shot()`](apps/web/lib/oneshot/client.ts#L320)
3. [`pollStatus()`](apps/web/lib/oneshot/client.ts#L248) polls
   `relayer_getStatus` until the tx confirms or fails

The relayer client also calls
[`relayer_getCapabilities`](apps/web/lib/oneshot/client.ts#L226) and
[`relayer_getFeeData`](apps/web/lib/oneshot/client.ts#L240) to discover the
`targetAddress` and build the on-chain fee payment call.

Full client: [`apps/web/lib/oneshot/client.ts`](apps/web/lib/oneshot/client.ts)
Config: [`apps/web/lib/oneshot/config.ts`](apps/web/lib/oneshot/config.ts) — fields: `relayerUrl`, `executorAddress`, `mockEnabled`. No API key required; this is the permissionless JSON-RPC relayer.

---

### ERC-7710 Re-delegation → x402 Facilitator (research rail)

Before making an x402-gated research request, the session key re-delegates to the
x402 facilitator address advertised by the endpoint's
`WWW-Authenticate: x402` header (or `FACILITATOR_SIGNER_ADDRESS` as fallback).
This re-delegation happens inside the `delegationProvider` callback that
`@metamask/x402` calls automatically before each payment.

See [`createResearchBuyerFromSession()`](apps/web/lib/x402/buyer.ts#L41) and the
`redelegatePermissionContext` call at
[`buyer.ts:54`](apps/web/lib/x402/buyer.ts#L54). The `@metamask/x402`
`x402Erc7710Client` wraps this provider and negotiates the payment handshake
([`buyer.ts:25`](apps/web/lib/x402/buyer.ts#L25)).

**Current status:** The delegation provider is fully wired. Whether `X402_ENFORCE`
is flipped on in a given deployment controls whether the server-side middleware
actually requires payment or passes through. For a live demo, set `X402_ENFORCE=true`.

---

### x402 Research Economy

Three research data routes are gated behind `withX402Payment()`:

| Endpoint | Source |
|---|---|
| `GET /api/research/sports` | [`research/sports/route.ts:29`](apps/web/app/api/research/sports/route.ts#L29) |
| `GET /api/research/news` | [`research/news/route.ts:30`](apps/web/app/api/research/news/route.ts#L30) |
| `GET /api/research/history` | [`research/history/route.ts:30`](apps/web/app/api/research/history/route.ts#L30) |

Each endpoint prices the artifact via
[`priceResearchArtifact()`](apps/web/lib/research-pricing.ts) and sets `payTo` to
the platform data wallet.

**Agent-to-agent resale (A2A marketplace):** After an agent buys research, it can
list the artifact for resale. A rival agent can purchase it via
`POST /api/agent-research/buy`
([`buy/route.ts:31`](apps/web/app/api/agent-research/buy/route.ts#L31)), which uses
the same `withX402Payment()` wrapper but sets `payTo` to the
**original selling agent's wallet address** — USDC flows directly from buyer to
seller agent, on-chain, via the 1Shot relayer.

Artifact content is generated at purchase time by Venice AI (topic-specific facts,
not static templates) via
[`generate-research-artifact.ts`](apps/web/lib/research/generate-research-artifact.ts).
Sources are labelled `"Venice-generated synthesis"`. Artifact inventory:
[`apps/web/lib/research-store.ts`](apps/web/lib/research-store.ts) (in-memory —
see Known Limitations).

---

### Venice AI — Three Distinct Roles

Venice is called through an OpenAI-compatible client at
[`apps/web/lib/venice.ts`](apps/web/lib/venice.ts). The base fallback model is
`deepseek-v4-flash`, and each role can be routed independently via env var.

| Role | Function | Model env var | Source |
|---|---|---|---|
| Debate arguments | [`generateDebateArgument()`](apps/web/lib/venice.ts) | `VENICE_DEBATE_MODEL` | `apps/web/lib/venice.ts` |
| Rebuttals | [`generateRebuttal()`](apps/web/lib/venice.ts) | `VENICE_DEBATE_MODEL` | `apps/web/lib/venice.ts` |
| Judge / scorer | [`runJudge()`](apps/web/lib/agents/judge.ts) | `VENICE_JUDGE_MODEL` | `apps/web/lib/agents/judge.ts` |
| Autonomous decision | [`decideAgentAction()`](apps/web/lib/venice.ts) | `VENICE_DECISION_MODEL` | `apps/web/lib/venice.ts` |

`decideAgentAction()` is the autonomous decision engine: given a challenge and the
agent's on-chain reputation, Venice decides whether to ENTER, SKIP, or RESEARCH
before committing stake. The result drives the agent autonomy loop in
[`apps/web/lib/agents/orchestrator.ts`](apps/web/lib/agents/orchestrator.ts).

---

### Smart Contracts

Source: [`packages/contracts/src/`](packages/contracts/src/)

| Contract | One-line purpose | Deployed (Base Sepolia) |
|---|---|---|
| [`ClashboardArena.sol`](packages/contracts/src/ClashboardArena.sol) | Battle lifecycle, betting pool, rubric commitment, settlement, USDC payout | `0xb657eC98149a202277588819c4302d7Fe596F7ac` |
| [`HotTakeRooms.sol`](packages/contracts/src/HotTakeRooms.sol) | Challenger posts a hot take + stake; rival accepts; forwards to Arena | `0x888B974a4BdcfAF7586B13C511e26d8dBdaFbF70` |
| [`AgentRegistry.sol`](packages/contracts/src/AgentRegistry.sol) | On-chain agent identity (name, metadata hash, win/loss reputation) | `0xF96197F51E374fC6Ad361B30C5232AD4ed14c8fF` |
| [`AgentTreasury.sol`](packages/contracts/src/AgentTreasury.sol) | Per-agent USDC balance; only Arena/HotTakeRooms can authorise spends | `0x2E48B58ADd4e995dD7F8EB3dDf3ccb9031c07e48` |

`HotTakeRooms` holds the `authorizeExecutor` registry — the 1Shot relayer's address
must be whitelisted here before it can redeem delegations on behalf of agents
([`HotTakeRooms.sol:159`](packages/contracts/src/HotTakeRooms.sol#L159)).

---

## How to Run Locally

### Prerequisites

- Node ≥ 18, npm ≥ 10
- **MetaMask Flask** (developer build, not production MetaMask) —
  required because `wallet_grantPermissions` (ERC-7715) is a Flask-only RPC.
  Install at https://metamask.io/flask
- Base Sepolia test USDC — faucet at https://faucet.circle.com (select Base Sepolia)

### Setup

```bash
# 1. Install
npm install          # installs all workspaces via npm workspaces + turbo

# 2. Configure
cp apps/web/.env.local.example apps/web/.env.local
# edit .env.local — minimum required vars listed below

# 3. Run
npm run dev          # turbo → next dev on apps/web
```

Open http://localhost:3000. The Forge page is the entry point for new agents.

### Required env vars

```bash
# Venice AI — get a key at venice.ai
VENICE_API_KEY=
VENICE_BASE_URL=https://api.venice.ai/api/v1
VENICE_MODEL=deepseek-v4-flash
VENICE_DECISION_MODEL=deepseek-v4-flash
VENICE_DEBATE_MODEL=gemma-4-uncensored
VENICE_JUDGE_MODEL=deepseek-v4-pro
VENICE_JUDGE_RETRY_MODEL=deepseek-v4-flash
VENICE_RESEARCH_MODEL=gemini-3-5-flash

# 1Shot — the relayer's on-chain wallet address
ONESHOT_EXECUTOR_ADDRESS=
NEXT_PUBLIC_ONESHOT_EXECUTOR_ADDRESS=

# Platform signing key — used to call settleWithVerdictHash on ClashboardArena
PLATFORM_PRIVATE_KEY=

# Base Sepolia RPC (defaults to public endpoint)
BASE_SEPOLIA_RPC=https://sepolia.base.org

# x402 facilitator signer address
FACILITATOR_SIGNER_ADDRESS=

# Set true to require real x402 payment on research routes
X402_ENFORCE=false
```

Contract addresses are **not** env vars — they live in
[`apps/web/lib/contracts.ts`](apps/web/lib/contracts.ts).

### Test scripts

```bash
npm run test:venice --prefix apps/web      # Venice connectivity
npm run test:x402-rail --prefix apps/web   # x402 + 1Shot end-to-end rail
npm run test:a2a --prefix apps/web         # A2A research marketplace
npm run test:autonomy --prefix apps/web    # Agent autonomy preferences
```

---

## Project Structure

```
Clashboard/
├── apps/web/
│   ├── app/
│   │   ├── forge/                    # Agent creation + grantPermissions entry point
│   │   ├── lobby/                    # Active challenges; BudgetScreen grant entry
│   │   ├── arena/[battleId]/         # Live battle UI
│   │   ├── dashboard/                # Agent stats, permission status
│   │   └── api/
│   │       ├── battle/               # start · worker · stream · verdict · [battleId]
│   │       ├── research/             # sports · news · history  (all x402-gated)
│   │       ├── agent-research/       # search · buy  (A2A marketplace, x402-gated)
│   │       ├── facilitator/          # x402 facilitator endpoints
│   │       └── autonomy/             # agent-loop · execute  (server-side 1Shot)
│   ├── lib/
│   │   ├── metamask.ts               # ERC-7715 grant, EIP-7702 check, session key
│   │   ├── contracts.ts              # Deployed addresses (no env vars needed)
│   │   ├── venice.ts                 # Venice AI client + all debate/judge/decision fns
│   │   ├── battle-runtime.ts         # On-chain state sync, rubric commitment
│   │   ├── battle-lifecycle.ts       # Battle state machine, round runner
│   │   ├── battle-store.ts           # In-memory battle state (Map)
│   │   ├── research-store.ts         # In-memory artifact inventory (Map)
│   │   ├── oneshot/
│   │   │   ├── client.ts             # 1Shot relayer client + ERC-7710 re-delegation
│   │   │   └── config.ts             # relayerUrl · executorAddress · mockEnabled
│   │   ├── x402/
│   │   │   ├── buyer.ts              # createResearchBuyerFromSession, re-delegation
│   │   │   ├── facilitator.ts        # Our x402 facilitator implementation
│   │   │   └── next.ts               # withX402Payment() middleware
│   │   └── agents/
│   │       ├── orchestrator.ts       # Autonomous agent loop, decideAgentAction caller
│   │       └── judge.ts              # runJudge() — Venice scoring
│   └── components/
│       ├── battle/BudgetScreen.tsx   # Permission grant UI (lobby path)
│       └── shared/ConnectWallet.tsx  # Wallet status, EIP-7702 badge
└── packages/
    └── contracts/src/
        ├── ClashboardArena.sol       # Battle lifecycle + USDC settlement
        ├── HotTakeRooms.sol          # Challenge creation/acceptance + executor registry
        ├── AgentRegistry.sol         # Agent identity + reputation
        └── AgentTreasury.sol         # Per-agent USDC balance
```

---

## Track Mapping

| Track | How Clashboard qualifies | Key code |
|---|---|---|
| **x402 + ERC-7710** | Three research endpoints gated by `withX402Payment()`; payment settled via ERC-7710 re-delegation from session key to x402 facilitator | [`buyer.ts:41`](apps/web/lib/x402/buyer.ts#L41) · [`sports/route.ts:29`](apps/web/app/api/research/sports/route.ts#L29) |
| **Best Autonomous Agent** | Agent uses Venice to decide ENTER / SKIP / RESEARCH before committing USDC — decision is on-chain-bounded but fully autonomous | [`decideAgentAction()`](apps/web/lib/venice.ts) · [`orchestrator.ts`](apps/web/lib/agents/orchestrator.ts) |
| **A2A Coordination** | Agents buy and resell research artifacts via x402; USDC flows directly from buying agent to selling agent's wallet address | [`buy/route.ts:31`](apps/web/app/api/agent-research/buy/route.ts#L31) · [`research-store.ts`](apps/web/lib/research-store.ts) |
| **Venice AI** | Role-specific model routing: decision, debate, research, and judging each use the Venice model best suited to that job | [`venice.ts`](apps/web/lib/venice.ts) · [`judge.ts`](apps/web/lib/agents/judge.ts) |
| **1Shot Relayer** | Arena actions executed via 1Shot permissionless JSON-RPC (`relayer_send7710Transaction`) after session-key ERC-7710 re-delegation. **Current status: testnet only.** EIP-7702 upgrade is checked at grant time inside [`grantPermissions()`](apps/web/lib/metamask.ts#L350) but is set by MetaMask Flask's grant flow, not routed through a separate 1Shot upgrade tx. Full 7702-through-1Shot is the planned next step. | [`execute1Shot()`](apps/web/lib/oneshot/client.ts#L320) · [`redelegateContextToRelayer()`](apps/web/lib/oneshot/client.ts#L274) |
| **Best Feedback** | Detailed builder feedback on MetaMask Smart Accounts Kit, 1Shot relayer ergonomics, ERC-7715 permission constraints, ERC-7710 re-delegation, and x402 integration pain points from building Clashboard end to end. | [Full feedback](https://hackmd.io/@victorjames408/SyKr2UKxMx) · [Developer Feedback](#developer-feedback) |
| **Best Use of Social Media** | Build thread documenting the ERC-7715 single-grant pattern, x402 research economy, and live battle demos as the app was built. | [@codeX_james on X](https://x.com/codeX_james/status/2064032185972097257) |

---

## Known Limitations & Honest Roadmap

**Testnet only.** All contracts are on Base Sepolia. No mainnet deployment exists.

**EIP-7702 upgrade not routed through 1Shot.** The EOA-to-smart-account upgrade
happens inside MetaMask Flask's `wallet_grantPermissions` flow — Flask sets the
EIP-7702 authorization when it processes the permission request. We call
`getSmartAccountUpgradeStatus()` inside
[`grantPermissions()`](apps/web/lib/metamask.ts#L350) to record the status, but we
do not explicitly send a 7702 upgrade tx through the 1Shot relayer. That is the
natural next step.

**Session key in localStorage.** The ephemeral session private key is stored in
`localStorage` ([`metamask.ts:194`](apps/web/lib/metamask.ts#L194)). Hackathon
shortcut. Production would use a hardware-backed enclave or TEE.

**In-memory stores.** `battleStore` and `researchStore` are `Map`-backed singletons
([`battle-store.ts`](apps/web/lib/battle-store.ts),
[`research-store.ts`](apps/web/lib/research-store.ts)). State is lost on server
restart. Production would use a database.

**Research artifacts are Venice-generated synthesis.** The x402 payment rail,
ERC-7710 re-delegation, and A2A resale mechanism are real. The content inside each
`ResearchArtifact` — `summary`, `facts`, and `sources` — is generated at purchase
time by Venice AI (`gemini-3-5-flash` via `VENICE_RESEARCH_MODEL`) using the agent's
debate topic as input. Sources are honestly labelled `"Venice-generated synthesis"`.
After purchase, the artifact stored in the A2A marketplace contains topic-specific
facts generated at that moment, not static template text. Wiring to a live sports
or news API would replace the Venice call in
[`generate-research-artifact.ts`](apps/web/lib/research/generate-research-artifact.ts)
without changing the payment or resale flow.

**Budget split is informational.** The 70/30 arena/research split is stored as
metadata labels only (inside [`grantPermissions()`](apps/web/lib/metamask.ts#L350)).
On-chain there is a single `periodAmount` enforcer. A session key could skew the
split within the total cap.

**Prompt injection bounded, not eliminated.** The autonomous agent's decision is
bounded by the on-chain `periodAmount` cap — it cannot spend more than the user
granted. However, an adversarial hot take could influence `decideAgentAction()` within
that cap. The on-chain enforcer is the hard floor; the decision layer is soft.

---

## Developer Feedback

We published detailed feedback on the MetaMask Smart Accounts Kit, the 1Shot
relayer, and the ERC-7715/7710 + x402 integration, based on building Clashboard
end-to-end on the full stack.

📄 **Full feedback (HackMD):** https://hackmd.io/@victorjames408/SyKr2UKxMx

Topics covered, in order of impact:

1. **Transfer-only permission constraint** — `erc20-token-periodic` silently restricts
   agents to raw token transfers, which pushes builders toward custodial server-wallet
   patterns to call contract functions. Arbitrary calldata support (or a clearly
   documented contract-call enforcer) would remove this forcing function.

2. **Single-grant / multi-delegate spending under one shared cap** — the
   session-key intermediary pattern we use (one `wallet_grantPermissions` grant →
   two `redelegatePermissionContext` paths) works but is non-obvious. First-party
   support for multi-executor grants in one dialog would simplify multi-path
   agent architectures.

3. **EIP-7702 upgrade status is invisible before the grant** — builders cannot
   verify whether an EOA is already a smart account without calling `isDeployed()`,
   which requires Smart Accounts Kit wiring. A proposed read-only RPC
   (e.g. `wallet_getSmartAccountStatus`) would let any dapp surface this
   before attempting a grant.

4. **1Shot relayer-target requirement needs one prominent doc line** — the
   `relayer_getCapabilities` → `targetAddress` handshake is the correct way to
   discover the address to re-delegate to, but it is not prominent in the current
   docs. A single callout in the "send your first 7710 tx" guide would prevent
   hours of debugging.

5. **End-to-end relayer example** — the current docs scatter the
   getCapabilities → getFeeData → send7710Transaction → getStatus flow across
   multiple pages. A single runnable example would replace most of the cross-page
   guesswork.

A condensed version of points 2–4 is in the
[Technical Note](#technical-note-to-the-metamask-team) section below, drawn
directly from our implementation.

---

## Technical Note to the MetaMask Team

The single-grant / re-delegation pattern (one `wallet_grantPermissions` popup →
two `redelegatePermissionContext` paths) works well. A few observations from
building it:

1. **`getSupportedExecutionPermissions` is absent on some Flask builds.** We handle
   this gracefully inside [`grantPermissions()`](apps/web/lib/metamask.ts#L350) with
   a best-effort try/catch, but a documented minimum Flask version for this method
   would let us surface a clear error rather than silently swallow the miss.

2. **`erc7710WalletActions()` type gap.** The `redelegatePermissionContext` method
   exists at runtime but is not on the TypeScript surface exposed by
   `@metamask/smart-accounts-kit`. We cast through `unknown` in two places —
   [`redelegateContextToRelayer()`](apps/web/lib/oneshot/client.ts#L274) in the
   1Shot client and [`createResearchBuyerFromSession()`](apps/web/lib/x402/buyer.ts#L41)
   in the x402 buyer. Exporting the type directly would remove the cast.

3. **One dialog per `wallet_grantPermissions` call.** The single-session-key pattern
   is the correct workaround for now, but first-party support for multi-executor
   grants in one dialog would simplify architectures like ours considerably.

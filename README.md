<div align="center">

#  CLASHBOARD

### *Where Hot Takes Go To War*

**Build your AI agent. Set its limits. Watch it fight. Earn when it wins.**

<br/>

![Clashboard Banner](https://img.shields.io/badge/status-building-FFB800?style=for-the-badge&labelColor=0A0A0F)
![Chain](https://img.shields.io/badge/chain-Celo%20EVM-35D07F?style=for-the-badge&labelColor=0A0A0F)
![Venice AI](https://img.shields.io/badge/AI-Venice%20AI-8B5CF6?style=for-the-badge&labelColor=0A0A0F)
![License](https://img.shields.io/badge/license-MIT-1A3FBE?style=for-the-badge&labelColor=0A0A0F)

<br/>

> *Built during the **MetaMask Smart Accounts Kit × 1Shot API Cookoff***
>


</div>

---

## Table of Contents

- [What Is Clashboard](#what-is-clashboard)
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How The Game Works](#how-the-game-works)
- [Build Your Agent](#build-your-agent)
- [The Agent Wallet — ERC-7715 & ERC-7710](#the-agent-wallet--erc-7715--erc-7710)
- [Architecture](#architecture)
- [Technology Deep Dive](#technology-deep-dive)
  - [Venice AI — The Brain](#venice-ai--the-brain)
  - [x402 + ERC-7710 — The Research Economy](#x402--erc-7710--the-research-economy)
  - [1Shot Permissionless Relayer — The Payment Rail](#1shot-permissionless-relayer--the-payment-rail)
  - [A2A Coordination — The Nervous System](#a2a-coordination--the-nervous-system)
  - [MetaMask ERC-7715 — The Trust Layer](#metamask-erc-7715--the-trust-layer)
- [Smart Contract](#smart-contract)
- [Tournament Economy](#tournament-economy)
- [Monorepo Structure](#monorepo-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)
- [Team](#team)

---

## What Is Clashboard

Clashboard is a **live AI debate-and-betting platform** where users build, customise, and enter their own AI agents into rapid-fire battles on the internet's most heated debates.

> *Kobe vs LeBron. Messi vs Ronaldo. Wizkid vs Burna Boy. iPhone vs Android.*

You don't watch passively. You **build a fighter.**

You give your agent a personality, upload your best arguments and stats, set its research budget, and release it into the arena. It fights autonomously — buying real data, constructing fact-backed arguments, and roasting opponents in real time — while you and the crowd bet on who wins.

An impartial **Venice AI judge** scores each battle on factual accuracy, argument quality, and wit. Winners are paid instantly on-chain via 1Shot. Every result is verifiable. Nobody can cheat.

The entire payment stack — your agent buying research data, entry fees, and winner payouts — runs through **x402 micropayments** and **ERC-7710 smart account delegations**, making Clashboard the first consumer product where owning an AI agent is genuinely fun, financially rewarding, and provably fair.

---

## The Problem

The internet runs on hot takes. Every day, billions of people argue passionately about sports, music, tech, and culture — but these debates go nowhere. They end in frustration, not resolution. There is no neutral arena where beliefs can be stress-tested with real stakes.

Meanwhile, three deeper problems remain unsolved:

**1. Debates are unresolvable**
Twitter arguments about Messi vs Ronaldo go forever because there is no neutral data-driven judge and no consequence for being wrong. Opinions shout past each other in perpetuity.

**2. Prediction markets are too abstract**
Existing prediction markets bet on future events users cannot influence. The experience is passive. You pick a side, then wait. There is no ownership, no creation, no identity attached to the outcome.

**3. AI agent wallets have no consumer use case**
ERC-7710 smart account delegation and autonomous agent wallets are powerful primitives sitting unused outside developer circles. Nobody has built a consumer product that makes owning and operating an on-chain AI agent genuinely fun.

**4. "Just ask ChatGPT" kills the experience**
Every AI debate product faces the same objection: *why not just ask an LLM directly?* Because ChatGPT gives you one answer. Clashboard gives you a **fight** — with your money on the line, your agent's reputation at stake, and a crowd watching in real time. Same difference as reading a match report vs watching the game.

---

## The Solution

Clashboard solves all four problems simultaneously by combining two ideas into one product:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLASHBOARD                              │
│                                                             │
│   Consumer Layer: Live AI debate battles with real stakes   │
│   ↕                                                         │
│   Economic Layer: Autonomous AI agent knowledge economy     │
└─────────────────────────────────────────────────────────────┘
```

On the surface, it's a spectator sport — fast, funny, high-stakes debate battles anyone can watch and bet on.

Underneath, it's a **knowledge marketplace** where AI agents earn on-chain reputation by winning battles. That reputation is their price tag when businesses hire them for real research tasks. The game is the proof of work.

The result is the first product where:
- Your **beliefs** become a deployable AI fighter
- Your **agent** operates autonomously with its own wallet
- **Every payment** — research, entry fees, payouts — is on-chain and verifiable
- **Grandmother can play** — no crypto jargon, no wallet complexity, just pick a fighter and watch

---

## How The Game Works

### The Battle Lifecycle

Every Clashboard battle follows a strict five-phase lifecycle completing in under 4 minutes:

```
Phase 1: BETTING OPENS (30 sec)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Topic revealed. Two agents assigned opposing sides.
Live odds displayed. Users pick a side and stake.

Phase 2: RESEARCH (20 sec)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Each agent pays x402 data endpoints for facts.
Purchases shown live: "Bought: FIFA records — $0.09 · Tx: 0x4f2a..."
Better data = stronger arguments. Shown in real time.

Phase 3: DEBATE — 3 ROUNDS (90 sec)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Venice AI streams each argument token by token.
Round 1: Opening argument
Round 2: Rebuttal (agent reads opponent's argument, fires back)
Round 3: Closing shot — the mic drop moment

Phase 4: JUDGE SCORES (15 sec)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Third Venice instance reads full transcript.
Scores: Accuracy (40%) · Argument Quality (35%) · Wit (25%)
Verdict committed to chain. Best line extracted.

Phase 5: PAYOUT (<2 sec)
━━━━━━━━━━━━━━━━━━━━━━━━
1Shot redeems ERC-7710 delegations.
All winners paid in parallel. Tx hash shown.
"Settled in 1.1s · View on Celo →"
```

### The Three Competition Formats

| Format | Stakes | How It Works |
|--------|--------|--------------|
| **Hot Take Rooms** | $2–$10 per side | Post a take. Stake on it. Wait for a challenger. Both stakes locked in contract — nobody can pull out. Winner takes all. |
| **Open Battles** | Growing prize pool | Arena matches available agents. Crowd bets on both sides. Odds update live as bets come in. |
| **Weekly Tournaments** | $1 entry per agent | 16-agent bracket. Topic announced Sunday. Results Monday–Friday. Winner takes 60% of entry pool. Each round generates its own betting market. |

### What It Feels Like

```
You log in. You see: "WIZKID vs BURNA BOY — Greatest of All Time"
Pool: $340. 847 bettors. 2:14 until betting closes.

You check the agents:
  The Historian  [Arguing: Wizkid]  Win rate: 61%  ●●●●○
  The Analyst    [Arguing: Burna]   Win rate: 67%  ●●●●●

You back The Historian with $2.

Battle starts. Research phase:
  "The Historian bought: Spotify streaming records 2024 — $0.09"
  "The Historian bought: Grammy nominations database — $0.08"
  "The Analyst bought: Billboard chart history — $0.12"

Round 1 — The Historian argues:
  "Wizkid's 'Essence' became the first Afrobeats song to crack
   the US Billboard Hot 100 top 10. That is not a Burna feat.
   That is a Wizkid fact."

Round 1 — The Analyst fires back:
  "Burna Boy won the Grammy. Not nominated — won. Wizkid has
   never held that trophy. You don't measure greatness with
   streaming numbers. You measure it with peer recognition."

[Crowd: 🔥😤👀🤯]

...3 rounds later...

VERDICT: The Analyst wins.
Accuracy: 8.8 · Argument Quality: 8.4 · Wit: 7.6
Best line: "You don't measure greatness with streaming numbers."

You lost. You study The Analyst's research purchases.
You adjust your agent's knowledge upload tonight.
Tomorrow: rematch.
```

---

## Build Your Agent

Your agent is **your beliefs, made autonomous**. Every configuration choice shapes how it argues.

### What You Customise

| Field | Options | What It Does |
|-------|---------|--------------|
| **Name** | Free text | Your agent's public identity. Make it memorable. |
| **Base personality** | Historian · Analyst · Roaster · Contrarian · Professor · Custom | Determines the arguing style and what kind of data it prioritises |
| **Custom instructions** | Free text (private) | Your secret weapon. e.g. *"Always bring up Kobe's 81-point game early. Never concede the scoring title argument."* Never shown to opponents. |
| **Knowledge upload** | Free text blob (private) | Your private facts database. Injected as context before every battle. Your agent knows what YOU know. |
| **Debate specialties** | Sports · Music · Tech · Culture · Africa · Politics · Film | Agent buys better data in selected categories. Specialism is an edge. |
| **Fighting style** | Aggressive · Methodical · Showman | Shapes how Venice AI structures arguments — attack first, counter-punch, or play to the crowd. |
| **Research budget** | $0.10 – $2.00 per battle | Max x402 spend per battle. Higher budget = more data = sharper arguments. Comes from your agent's wallet. |

### The Six Agent Personalities

```
🔮 THE HISTORIAN     — Records, legacy, historical precedent
   "My specialty is irrefutable facts from the past."

📊 THE ANALYST       — Stats, metrics, data density
   "Every claim backed by a number. Emotion is irrelevant."

🎤 THE ROASTER       — Wit-first, crowd-pleasing burns
   "I'll make them laugh while I destroy their argument."

🔥 THE CONTRARIAN    — Unpopular angles, overlooked data
   "I'll take the side you think will lose. Watch."

📚 THE PROFESSOR     — Deep knowledge, methodical reasoning
   "Thorough. Precise. Devastating."

✍️  CUSTOM           — Your own system prompt entirely
   "You tell me exactly how to fight."
```

### Why Customisation Is The Retention Mechanic

Two agents with identical base personalities argue **completely differently** because of custom instructions and knowledge uploads. When your agent loses, you know exactly why — and you can fix it.

That feedback loop — **build → deploy → analyse loss → improve → redeploy** — is the same loop that makes fantasy football and Pokémon training addictive for years.

---

## The Agent Wallet — ERC-7715 & ERC-7710

Every agent has its own **ERC-7710 smart account** deployed on Celo. This is what makes Clashboard genuinely new.

### The Permission Flow

```
You (human)
    │
    ▼
Set permission limits via MetaMask ERC-7715:
  ┌────────────────────────────────────────┐
  │  Max entry fee per battle:   $1.00     │
  │  Max research spend:         $0.50     │
  │  Max battles per day:        5         │
  │  Allowed categories:         Sports    │
  │  Permission expires:         7 days    │
  └────────────────────────────────────────┘
    │
    ▼  "Approve and release"
    │
    ▼
Your agent operates autonomously within these limits:

  ┌─────────────────────────────────────────────────────────┐
  │  Sees open battle in Sports → entry fee $0.80 ✓        │
  │  Pays entry fee via 1Shot (ERC-7710 redemption)         │
  │  Buys 4 data sources via x402 → $0.38 total ✓           │
  │  Argues 3 rounds powered by Venice AI                   │
  │  Wins → prize credited to agent smart account           │
  │  You get notification: "+$2.40 earned"                  │
  └─────────────────────────────────────────────────────────┘
```

### What The Agent Does Without You

| Action | How | Your Involvement |
|--------|-----|-----------------|
| Enter battles | Scans open battles in your categories, pays entry fee via 1Shot | Notification only |
| Buy research | Calls x402 data endpoints, pays from delegation | See receipts after |
| Collect winnings | Prize flows into ERC-7710 smart account via 1Shot | Balance goes up |
| Auto-withdraw | Optional rule: send earnings when balance > $X | Set once, done |

### Why This Matters

> **The ERC-7715 permission screen is the most exciting moment in the app — not a crypto detail buried in settings.**

You are not signing a transaction. You are **unleashing your fighter**. The moment you set your agent's limits and tap approve, you hand it a leash and let it go. It disappears into the arena. It comes back with winnings — or not.

No product has ever let a normal person deploy an AI agent with its own wallet, set spending limits on it, and earn money while it operates autonomously. That's Clashboard.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
│  Next.js 14 · Three.js 3D Arena · MetaMask SDK · SSE Client   │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼─────────────────────────────────────────┐
│                     NEXT.JS SERVER                              │
│                                                                 │
│  /api/battle/start    → commit rubric hash to Celo              │
│  /api/battle/stream   → SSE: Venice AI dual-agent streaming     │
│  /api/battle/verdict  → judge scoring + 1Shot payout           │
│  /api/battle/bet      → accept bet via ERC-7710 delegation      │
│  /api/data/sports     → x402-gated sports stats endpoint        │
│  /api/data/news       → x402-gated news sentiment endpoint      │
│  /api/data/records    → x402-gated historical records endpoint  │
└───┬───────────┬───────────────┬──────────────┬──────────────────┘
    │           │               │              │
    ▼           ▼               ▼              ▼
┌───────┐ ┌─────────┐ ┌──────────────┐ ┌──────────────┐
│Venice │ │ 1Shot   │ │   x402       │ │    Celo      │
│  AI   │ │Relayer  │ │ Middleware   │ │  Blockchain  │
│       │ │         │ │              │ │              │
│3 inst.│ │Redeems  │ │HTTP 402 →    │ │BattleCommit  │
│stream │ │ERC-7710 │ │pay → retry   │ │AgentRecord   │
│tokens │ │gasless  │ │per data call │ │Prize pool    │
└───────┘ └─────────┘ └──────────────┘ └──────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | Full-stack framework |
| 3D Arena | Three.js | Agent characters, stage, animations |
| Animations | Framer Motion | UI transitions, score bars, payouts |
| Wallet | MetaMask SDK | ERC-7715 permission grants |
| AI | Venice AI (OpenAI-compatible) | All agent reasoning + judge |
| Agent coordination | A2A Protocol | Orchestrator ↔ agents ↔ data sub-agents |
| Data payments | x402-next + x402-axios | HTTP 402 paywall on data endpoints |
| Payment relay | 1Shot Permissionless Relayer | Gasless ERC-7710 delegation redemption |
| Chain | Celo (EVM L2) | Prize pool, commit-reveal, reputation |
| Chain client | viem | Celo contract reads/writes |
| Validation | zod | Runtime type safety on all API inputs |
| Smart contracts | Solidity 0.8.20 + Foundry | BattleCommit, ClashboardArena |

---

## Technology Deep Dive

### Venice AI — The Brain

Venice AI powers **every word every agent speaks** and every judge score. It is OpenAI API-compatible, privacy-first, and runs on-demand with no surveillance logging of user data.

**Three Venice instances per battle:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DEBATER A     │     │   DEBATER B     │     │    JUDGE        │
│                 │     │                 │     │                 │
│ System prompt:  │     │ System prompt:  │     │ System prompt:  │
│ Historian       │     │ Analyst         │     │ Strict scoring  │
│                 │     │                 │     │ rubric          │
│ Context:        │     │ Context:        │     │                 │
│ Topic + side +  │     │ Topic + side +  │     │ Input:          │
│ purchased facts │     │ facts + round 1 │     │ Full transcript │
│                 │     │ opponent arg    │     │ both agents     │
│ Output:         │     │                 │     │                 │
│ Streamed tokens │     │ Output:         │     │ Output:         │
│ → SSE → browser │     │ Streamed tokens │     │ JSON scores     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Venice setup (one file):**

```typescript
// lib/venice.ts
import OpenAI from 'openai'

export const venice = new OpenAI({
  baseURL: 'https://api.venice.ai/api/v1',
  apiKey: process.env.VENICE_API_KEY,
})

export const VENICE_MODEL = 'llama-3.3-70b'
```

**Why Venice specifically:**
- Satisfies the **Venice AI track prize** — judges are explicitly looking for this
- **Privacy-first** — user betting patterns and agent strategies are not logged to surveillance AI
- **Permissionless access via staking** — fits the Web3 ethos of the product
- **OpenAI-compatible** — zero learning curve, same SDK

**The judge scoring system:**

```
Factual Accuracy  (40%) — Are facts verifiable? Was purchased data used correctly?
Argument Quality  (35%) — Does the rebuttal address the opponent's actual point?
Wit and Impact    (25%) — Is the argument memorable? Does the closing line land?

Final score = (accuracy × 0.40) + (quality × 0.35) + (wit × 0.25)

Judge output (JSON only, no preamble):
{
  "winner": "A",
  "scores": {
    "A": { "accuracy": 9.0, "wit": 7.8, "rebuttal": 8.5, "final": 8.5 },
    "B": { "accuracy": 7.2, "wit": 8.1, "rebuttal": 6.8, "final": 7.3 }
  },
  "bestLine": "You don't measure greatness with streaming numbers.",
  "reasoning": "Agent A's World Cup argument in round 3 was factually decisive and unanswered."
}
```

---

### x402 + ERC-7710 — The Research Economy

x402 is an HTTP payment protocol. When an agent calls a data endpoint without payment, the server returns `402 Payment Required` with payment details. The agent's x402 client pays automatically and retries. The entire flow is invisible — users just see the purchase card appear in the UI.

**The x402 flow:**

```
Agent A needs sports stats
        │
        ▼
GET /api/data/sports?query=wizkid+grammy+history
        │
        ▼
HTTP 402 Payment Required
{
  "maxAmountRequired": "90000",  // $0.09 USDC
  "payTo": "0xDATA_AGENT_WALLET",
  "network": "celo"
}
        │
        ▼
x402 client fires payment:
  → 1Shot redeems ERC-7710 delegation
  → $0.09 USDC transferred on-chain
  → Tx: 0x4f2a... (shown in UI as purchase card)
        │
        ▼
GET /api/data/sports?query=...
X-Payment: { txHash: "0x4f2a...", amount: "90000" }
        │
        ▼
HTTP 200 OK
{
  "facts": [
    "Wizkid's 'Essence' peaked at #9 on Billboard Hot 100",
    "Wizkid won BET Hip Hop Award for Best International Flow 2021",
    "Wizkid has 8.2M monthly Spotify listeners in Nigeria"
  ]
}
        │
        ▼
Facts injected into Venice AI prompt → sharper argument
```

**Building an x402 data endpoint (one wrapper):**

```typescript
// app/api/data/sports/route.ts
import { withPaymentRequired } from 'x402-next'

export const GET = withPaymentRequired(
  async (req) => {
    const query = new URL(req.url).searchParams.get('query')
    const facts  = await fetchSportsFacts(query) // your data source
    return Response.json({ facts })
  },
  {
    amount: '90000',      // $0.09 USDC
    currency: 'USDC',
    network: 'celo',
    description: 'Sports facts data query'
  }
)
```

**Why this makes ERC-7710 visible and fun:**

The ERC-7710 delegation is not buried in a settings page. Every time an agent buys a data source, that delegation is redeemed on-chain. The purchase card appears in the UI:

```
┌─────────────────────────────────────────────────────┐
│ The Historian bought                                │
│ Grammy nominations database          $0.08   0x2e1b │
└─────────────────────────────────────────────────────┘
```

Users watching the battle see their agent spending *its own money* to get smarter in real time. That's ERC-7710 made into entertainment.

---

### 1Shot Permissionless Relayer — The Payment Rail

1Shot is how every payment in Clashboard gets submitted on-chain — with no gas management, no paymaster setup, no pre-funded infrastructure.

**Two payment flows, both essential:**

```
FLOW 1 — Agent buys research data (x402)
─────────────────────────────────────────
x402 client → 1Shot.redeem(permissionContext, $0.09 to data wallet)
                → Celo tx submitted gaslessly
                → Tx hash returned → shown in UI

FLOW 2 — Winners paid after verdict
────────────────────────────────────
Judge declares winner → for each winning bettor:
  1Shot.redeem(permissionContext, winnings to bettor wallet)
All parallel. All gasless. All within 2 seconds.
Tx hash per winner → shown on result screen as "Settled in 1.1s"
```

**1Shot integration:**

```typescript
// lib/payments/oneshot.ts
export async function payVia1Shot({
  amount,
  recipient,
  permissionContext
}: OneShotPayment): Promise<string> {
  const res = await fetch('https://relay.1shot.io/v1/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissionContext,
      calls: [{ to: recipient, value: amount, data: '0x' }]
    })
  })
  const { txHash } = await res.json()
  return txHash
}
```

**Why 1Shot beats building a paymaster:**

| Problem | With paymaster | With 1Shot |
|---------|---------------|------------|
| Setup | Configure contracts, fund escrow | Zero — call the endpoint |
| Gas management | You handle it | 1Shot handles it |
| Traffic spikes | Upgrade your tier | Automatic |
| Code complexity | Paymaster contract + integration | One API call |
| Track prize | Partial | ✅ Full |

---

### A2A Coordination — The Nervous System

Every battle involves four agents communicating via A2A protocol:

```
                    ORCHESTRATOR
                    (manages round lifecycle)
                   /              \
                  ▼                ▼
           DEBATER A          DEBATER B
           (Historian)        (Analyst)
          /    |    \         /    |    \
         ▼     ▼     ▼       ▼     ▼     ▼
      Sports News Records  Sports News Records
      Agent  Agent Agent   Agent  Agent Agent
      (x402) (x402) (x402) (x402) (x402) (x402)
```

**A2A message sequence per round:**

```
Orchestrator → Debater A: { task: "argue", topic, side, facts, round: 1 }
Debater A    → Sports Agent: { task: "query", q: "wizkid grammy history" }
Sports Agent → Debater A: { facts: [...] }
Debater A    → Orchestrator: { argument: "Wizkid's Essence peaked at..." }

Orchestrator → Debater B: { task: "argue", topic, side, facts, opponentArg: "...", round: 2 }
Debater B    → News Agent: { task: "query", q: "burna boy world tour 2024" }
...
Orchestrator → Judge: { task: "score", transcriptA: [...], transcriptB: [...] }
Judge        → Orchestrator: { winner: "A", scores: {...}, bestLine: "..." }
```

This is real A2A coordination — not simulated. The agents genuinely communicate, pass context, and adapt their arguments based on opponent output.

---

### MetaMask ERC-7715 — The Trust Layer

ERC-7715 is how users grant Clashboard permission to act on their behalf — once, at session start, with hard limits they set themselves.

```typescript
// lib/metamask.ts
export async function grantArenaPermissions(budgetUSDC: number) {
  const permissions = await window.ethereum.request({
    method: 'wallet_grantPermissions',
    params: [{
      permissions: [{
        type: 'native-token-transfer',
        data: {
          allowance: parseUnits(budgetUSDC.toString(), 6) // USDC decimals
        },
        policies: [{
          type: 'time-based-intervals',
          data: {
            validAfter:  Math.floor(Date.now() / 1000),
            validUntil:  Math.floor(Date.now() / 1000) + 86400 // 24 hours
          }
        }]
      }]
    }]
  })
  return permissions.permissionsContext
}
```

After this one call:
- User places 5 bets → **zero wallet popups**
- Agent buys 12 data sources → **zero wallet popups**
- 8 winners paid out → **zero wallet popups**

The entire session runs on a single permission grant. Crypto becomes invisible. The game stays front and centre.

---

## Smart Contract

`ClashboardArena.sol` is the **referee that nobody can bribe**. It holds money, verifies fairness, pays winners, and records results. It does only what requires trustlessness — everything else lives in the Next.js server.

### What The Contract Does

| Function | Job | Why On-Chain |
|----------|-----|--------------|
| `depositBet()` | Holds user stakes | If off-chain, trust Clashboard to pay back |
| `commitRubric()` | Hash judge criteria before battle | Proves scoring wasn't changed mid-battle |
| `settleBattle()` | Verifies hash, distributes 70/25/5 split | Tamper-proof payout |
| `createRoom()` | Locks challenger's stake in escrow | Neither party can back out |
| `acceptRoom()` | Locks opponent's matching stake | Both sides committed |
| `recordResult()` | On-chain win/loss + reputation score | Cannot be faked |

### Prize Pool Distribution

```
Total battle pool
        │
        ├── 70% → Winning agent's ERC-7710 smart account
        ├── 25% → Winning bettors (pro-rata by stake)
        └──  5% → Platform treasury
```

### The Commit-Reveal Scheme

```
BEFORE BATTLE:
  server hashes judge rubric:
  rubricHash = keccak256(judgeSystemPrompt + battleId + timestamp)
  contract.commitRubric(battleId, rubricHash) ← on Celo

AFTER BATTLE:
  contract.settleBattle(battleId, winner, rubricPreimage, judgeScore)
  contract verifies: keccak256(rubricPreimage) === rubricHash ✓

RESULT: Impossible to change the judge's scoring criteria after
        seeing how the battle went. Every verdict is verifiable
        on Celo by anyone, forever.
```

---

## Tournament Economy

### Revenue Model

| Stream | Rate | Example |
|--------|------|---------|
| Platform fee on battle pools | 5% | $340 pool → $17 |
| B2B marketplace commission | 15% | Agent earns $1/query → $0.15 to platform |
| Data agent marketplace listing | 10% of query fees | Open to any data provider |
| Sponsored arenas | Fixed brand fee | "iPhone vs Android — $500 prize pool" |

### Agent Reputation — The B2B Bridge

Every battle updates an agent's on-chain record:

```
The Dark Horse — on-chain record
─────────────────────────────────
Battles: 47  |  Wins: 31  |  Win rate: 66%
Avg judge score: 8.4/10
Best category: Sports (74% win rate)
Worst category: Politics (41% win rate)
Reputation score: 8.4  → Hire rate: $0.28/query
```

**Businesses hire top-ranked agents for real research tasks.** The game is the job interview. Winning debates publicly, with verifiable on-chain results, is how an AI agent builds credentials no resume can fake.

---

## Monorepo Structure

```
clashboard/
│
├── apps/
│   └── web/                          # Next.js 14 frontend
│       ├── app/
│       │   ├── page.tsx              # Lobby — live battles
│       │   ├── arena/[battleId]/     # Live 3D battle screen
│       │   ├── build/                # Agent builder
│       │   ├── agent/[address]/      # Agent profile + reputation
│       │   ├── lobby/                # Hot Take Rooms
│       │   └── api/
│       │       ├── battle/
│       │       │   ├── start/        # Create battle, commit to chain
│       │       │   ├── stream/       # SSE — Venice AI streaming
│       │       │   ├── verdict/      # Judge + 1Shot payouts
│       │       │   └── bet/          # Accept bet via ERC-7710
│       │       └── data/
│       │           ├── sports/       # x402-gated sports stats
│       │           ├── news/         # x402-gated news sentiment
│       │           └── records/      # x402-gated historical records
│       ├── components/
│       │   ├── arena/
│       │   │   ├── ArenaScene.tsx    # Three.js canvas — full 3D stage
│       │   │   ├── AgentCharacter.tsx # 3D agent mesh + animations
│       │   │   ├── SpeechBubble.tsx  # HTML overlay, typewriter stream
│       │   │   └── CrowdReactions.tsx # Emoji burst system
│       │   ├── battle/
│       │   │   ├── BattleCard.tsx    # Lobby battle card
│       │   │   ├── BudgetScreen.tsx  # ERC-7715 permission UI
│       │   │   ├── BettingPanel.tsx  # Pick side, stake, lock
│       │   │   ├── ResearchFeed.tsx  # Live x402 purchase cards
│       │   │   ├── ScoreBar.tsx      # Animated judge score bars
│       │   │   └── VerdictScreen.tsx # Judge reveal + payout
│       │   └── agent/
│       │       ├── AgentBuilder.tsx  # Full customisation form
│       │       ├── AgentCard.tsx     # Display card
│       │       └── AgentWallet.tsx   # Smart account UI
│       └── lib/
│           ├── venice.ts             # Venice AI client
│           ├── agents/
│           │   ├── personas.ts       # 6 agent system prompts
│           │   ├── judge.ts          # Judge agent + scoring
│           │   └── orchestrator.ts   # A2A battle coordination
│           ├── payments/
│           │   ├── oneshot.ts        # 1Shot relayer integration
│           │   └── x402client.ts     # x402 axios client for agents
│           ├── chain.ts              # viem Celo client + ABI
│           ├── battle-store.ts       # In-memory battle state
│           └── types.ts              # All TypeScript interfaces
│
└── packages/
    └── contracts/                    # Foundry smart contracts
        ├── src/
        │   └── ClashboardArena.sol   # Main contract
        ├── test/
        │   └── ClashboardArena.t.sol # Foundry tests
        └── script/
            └── Deploy.s.sol          # Deployment script
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- [Foundry](https://getfoundry.sh/) (for contracts)
- MetaMask Flask (for ERC-7715 — required for testing)

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/clashboard.git
cd clashboard

# Install dependencies
pnpm install

# Install Foundry contract dependencies
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
cd ../..
```

### Development

```bash
# Copy environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Fill in your keys (see Environment Variables section)

# Run the web app
pnpm dev

# Compile contracts
pnpm contracts:compile

# Run contract tests
pnpm contracts:test
```

### Deploy Contracts

```bash
# Deploy to Celo Alfajores testnet
pnpm contracts:deploy:testnet

# Deploy to Celo mainnet
pnpm contracts:deploy:mainnet
```

---

## Environment Variables

```bash
# apps/web/.env.local

# Venice AI — get from venice.ai
VENICE_API_KEY=

# 1Shot Permissionless Relayer — get from 1shot.io
ONESHOTAPI_KEY=

# MetaMask — get from developer.metamask.io
NEXT_PUBLIC_METAMASK_APP_ID=

# Celo RPC endpoints
CELO_ALFAJORES_RPC=https://alfajores-forno.celo-testnet.org
CELO_MAINNET_RPC=https://forno.celo.org

# Deployed contract address (after running deploy script)
NEXT_PUBLIC_ARENA_CONTRACT=

# USDC on Celo (native USDC)
NEXT_PUBLIC_USDC_ADDRESS=0xcebA9300f2b948710d2653dD7B07f33A8B32118C

# Chain ID: 44787 = Alfajores testnet, 42220 = Celo mainnet
NEXT_PUBLIC_CHAIN_ID=44787

# Your platform treasury wallet address
PLATFORM_TREASURY_ADDRESS=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Hackathon Track Coverage

### ⚡ Best x402 + ERC-7710

Every data purchase during the research phase goes through x402. Six endpoints — sports stats, news sentiment, historical records — each behind a `402 Payment Required` paywall. The agent x402 client auto-handles pay-and-retry using the user's ERC-7710 delegation redeemed via 1Shot. Every purchase is visible in the UI with a live Celo transaction hash.

**Demo moment:** Watch 6 x402 purchase cards appear during one research phase, each with a Celo explorer link proving the on-chain payment.

### 🧠 Best Use of Venice AI

Venice powers all three AI roles in every battle: Debater A, Debater B, and the Judge — all running simultaneously, all streaming. The Judge returns structured JSON scores. Debater arguments stream token by token into the 3D speech bubbles. Venice's reasoning IS the product — not a backend detail.

**Demo moment:** Split-screen Venice streams racing simultaneously inside the Three.js arena. Two AI minds arguing in real time, scored by a third.

### 🚀 Best Use of 1Shot Permissionless Relayer

Every single payment — data purchases during research, bet placements, winner payouts — goes through 1Shot. No paymaster setup. No gas management. No wallet popups after the initial ERC-7715 grant. Parallel winner payouts complete in under 2 seconds.

**Demo moment:** Verdict screen shows "Settled in 1.1s" with a live Celo tx hash. That number is the 1Shot value proposition in two characters.

### 🤝 Best A2A Coordination

The orchestrator agent coordinates the entire battle lifecycle via A2A protocol — dispatching tasks to both debater agents, routing opponent arguments for round 2 rebuttals, and forwarding full transcripts to the judge. Data sub-agents receive structured A2A task requests and return typed payloads. Real multi-agent coordination, visible in the judge dev panel.

**Demo moment:** Toggle the dev panel during the demo video to show the live A2A message log — 8+ agent-to-agent messages in 90 seconds.

---

## Roadmap

```
Phase 1 — Hackathon MVP (Weeks 1–4)
  ✅ Core battle loop (3 rounds, Venice AI, judge)
  ✅ MetaMask ERC-7715 session permission
  ✅ x402 data endpoints (sports, news, records)
  ✅ 1Shot payouts + ERC-7710 redemption
  ✅ A2A orchestration
  ✅ Three.js 3D arena
  ✅ ClashboardArena.sol deployed to Celo Alfajores

Phase 2 — Post-Hackathon (Month 2–3)
  ⬜ Agent builder full UI
  ⬜ Hot Take Rooms (1v1 escrow)
  ⬜ Weekly tournaments (16-agent bracket)
  ⬜ Agent profile pages + on-chain reputation
  ⬜ Shareable roast card (social virality loop)
  ⬜ Mobile-responsive arena

Phase 3 — Scale (Month 4–6)
  ⬜ B2B marketplace (hire agents via API)
  ⬜ Sponsored arenas (brand partnerships)
  ⬜ Community topic voting
  ⬜ Agent vs agent asynchronous battles
  ⬜ Multi-language support (Yoruba, Pidgin, Swahili)
  ⬜ Celo mainnet launch
```

---

## Why Clashboard Wins

**1. ERC-7710 is not a detail — it is the product.**
Every other submission will use MetaMask permissions as plumbing. Clashboard makes the agent wallet the emotional centrepiece. Setting your agent's spending limits and releasing it is the most exciting screen in the app.

**2. The demo is unforgettable.**
Two AI agents roasting each other with verified Afrobeats stats in real time while people have money on the line. Nobody else is building that. Judges will laugh, lean forward, and remember Clashboard.

**3. All four tracks are earned, not bolted on.**
Remove any one technology and the product breaks. x402 — no research data. 1Shot — no gasless payments. Venice AI — no arguments. A2A — no coordination. Structural integrity judges can feel.

**4. The grandmother test is the market test.**
*"Pick an agent. Put $1 on it. Watch it fight. Collect if it wins."* No wallet jargon. No gas. No chain. The crypto is the backend. The product is a spectator sport.

**5. This is a real product, not a hackathon demo.**
The agent builder, reputation system, and B2B marketplace make Clashboard a fundable company. The hackathon is the launch event, not the end point.

---

## Team

Built with 🔥 for the MetaMask Smart Accounts Kit × 1Shot API Hackathon.

---

<div align="center">

**CLASHBOARD**

*Where hot takes go to war.*

`AI agents fight. You bet on yours. The best debaters get hired.`

<br/>

![Built on Celo](https://img.shields.io/badge/Built%20on-Celo-35D07F?style=flat-square&labelColor=0A0A0F)
![Powered by Venice](https://img.shields.io/badge/Powered%20by-Venice%20AI-8B5CF6?style=flat-square&labelColor=0A0A0F)
![1Shot](https://img.shields.io/badge/Payments-1Shot-FFB800?style=flat-square&labelColor=0A0A0F)
![x402](https://img.shields.io/badge/Data-x402-1A3FBE?style=flat-square&labelColor=0A0A0F)

</div>
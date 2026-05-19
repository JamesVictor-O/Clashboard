# Clashboard

Clashboard is an AI debate-and-betting arena where users build custom AI agents that fight live battles on internet hot takes — Kobe vs LeBron, Wizkid vs Burna Boy, iPhone vs Android. Users bet on their agent winning, an AI judge scores the debate across Accuracy, Wit, and Rebuttal, and money moves instantly on-chain via Celo USDC.

![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?style=flat-square&logo=solidity)
![Celo](https://img.shields.io/badge/Celo-Alfajores-FCFF52?style=flat-square)
![Turborepo](https://img.shields.io/badge/Turborepo-2.0-EF4444?style=flat-square)

---

## Monorepo Structure

```
clashboard/
├── apps/
│   └── web/                    # Next.js 14 frontend (App Router)
│       ├── app/
│       │   ├── page.tsx                    # Lobby — live battles
│       │   ├── arena/[battleId]/page.tsx   # Live battle screen
│       │   ├── build/page.tsx              # Agent builder
│       │   ├── agent/[address]/page.tsx    # Agent profile
│       │   ├── lobby/page.tsx              # Hot Take Rooms
│       │   └── api/
│       │       ├── battle/start/           # Create battle + commit rubric
│       │       ├── battle/stream/          # SSE: Venice AI debate stream
│       │       ├── battle/verdict/         # Judge + on-chain settlement
│       │       ├── battle/bet/             # Accept bet via ERC-7710
│       │       ├── data/sports/            # x402-gated sports stats
│       │       ├── data/news/              # x402-gated news sentiment
│       │       ├── data/records/           # x402-gated historical records
│       │       └── agent/                  # Agent CRUD
│       ├── components/
│       │   ├── arena/          # Three.js scene, characters, speech bubbles
│       │   ├── battle/         # Betting panel, verdict, score bars
│       │   ├── agent/          # Builder, card, wallet
│       │   └── shared/         # ConnectWallet, TxLink
│       └── lib/
│           ├── venice.ts       # Venice AI client
│           ├── agents/         # Personas, judge, orchestrator
│           ├── payments/       # 1Shot relayer, x402 client
│           ├── chain.ts        # viem + contract helpers
│           ├── battle-store.ts # In-memory battle state
│           └── metamask.ts     # MetaMask SDK + ERC-7715
└── packages/
    └── contracts/              # Foundry smart contracts
        ├── src/ClashboardArena.sol
        ├── test/ClashboardArena.t.sol
        └── script/Deploy.s.sol
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- [Foundry](https://getfoundry.sh/) (`curl -L https://foundry.paradigm.xyz | bash`)
- MetaMask wallet with Celo Alfajores testnet

### Install

```bash
npm install
```

### Development

```bash
# Start Next.js dev server
npm run dev

# Or just the web app
cd apps/web && npm run dev
```

### Contracts

```bash
cd packages/contracts

# Install OpenZeppelin
forge install OpenZeppelin/openzeppelin-contracts --no-commit

# Run tests
forge test -vvv

# Deploy to Alfajores testnet
cp .env.example .env
# Fill in PRIVATE_KEY, TREASURY_ADDRESS
forge script script/Deploy.s.sol --rpc-url alfajores --broadcast --verify
```

---

## Environment Variables

Copy `apps/web/.env.local.example` to `apps/web/.env.local` and fill in:

| Variable | Description |
|---|---|
| `VENICE_API_KEY` | Venice AI API key — [venice.ai](https://venice.ai) |
| `ONESHOTAPI_KEY` | 1Shot relayer API key for meta-transactions |
| `NEXT_PUBLIC_METAMASK_APP_ID` | MetaMask SDK app ID |
| `CELO_ALFAJORES_RPC` | Celo Alfajores RPC (default: forno) |
| `CELO_MAINNET_RPC` | Celo mainnet RPC (default: forno) |
| `NEXT_PUBLIC_ARENA_CONTRACT` | Deployed ClashboardArena address |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC token address on Celo |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID (44787 = Alfajores, 42220 = mainnet) |
| `PLATFORM_TREASURY_ADDRESS` | Platform fee recipient address |
| `NEXT_PUBLIC_APP_URL` | App URL (http://localhost:3000 in dev) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| 3D Arena | Three.js + @react-three/fiber |
| Animations | Framer Motion |
| AI | Venice AI (OpenAI-compatible, privacy-preserving) |
| Wallet | MetaMask SDK + ERC-7715 session permissions |
| Payments | x402 protocol (HTTP micropayments), 1Shot relayer |
| Chain | Celo (USDC, fast finality, low fees) |
| Contracts | Solidity 0.8.20, Foundry, OpenZeppelin |
| Monorepo | Turborepo |

---

## How It Works

1. **Build** — Users create an AI agent with a personality (Historian, Analyst, Roaster, etc.), custom instructions, and specialties.

2. **Bet** — Users approve an arena budget via ERC-7715 session permissions (one approval, no per-tx pop-ups). They pick a side and stake USDC.

3. **Research** — Both agents autonomously purchase data from x402-gated endpoints (sports stats, news sentiment, historical records) to build their arguments.

4. **Battle** — Agents debate in 3 rounds, streamed live via Venice AI SSE. The 3D arena shows agents arguing with animations.

5. **Verdict** — An AI judge scores Accuracy (40%), Wit (30%), and Rebuttal (30%). The rubric hash was committed on-chain before the battle — no post-hoc manipulation.

6. **Payout** — The winner's agent gets 70% of the pool. Winning bettors split 25% pro-rata. Platform takes 5%. Money moves instantly via 1Shot relayer.

---

## Prize Track Alignment

| Track | How Clashboard qualifies |
|---|---|
| **Venice AI** | All agent debate and judging runs through Venice AI (privacy-preserving, OpenAI-compatible) |
| **x402** | Research phase uses x402 micropayments — agents autonomously pay for data endpoints |
| **MetaMask / ERC-7715** | Arena budget uses `wallet_grantPermissions` for session-scoped spending |
| **1Shot** | Instant payouts to winning bettors via 1Shot meta-transaction relayer |
| **Celo** | All USDC flows on Celo (fast, cheap, mobile-friendly) |
| **Foundry** | Full contract test suite with Foundry |

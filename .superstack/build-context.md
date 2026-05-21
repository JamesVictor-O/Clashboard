# Clashboard Build Context

## Stack
- **Framework**: Next.js 14 App Router, TypeScript
- **Styling**: Tailwind CSS + custom design system (`globals.css`, `tailwind.config.ts`)
- **Animation**: Framer Motion 11
- **3D**: React Three Fiber v8 (pinned — v9 requires React 19, we're on React 18)
- **Blockchain**: Celo + USDC, MetaMask SDK, ERC-7715 permissions
- **AI**: Venice AI (OpenAI-compatible) for debate generation
- **Payments**: x402-next middleware

## Routes
| Path | Description |
|------|-------------|
| `/` | Landing page (immersive dark fantasy) |
| `/forge` | Agent Forge wizard — 7-step one-time creation ritual |
| `/dashboard` | Agent command centre (stats, battles, permissions/ERC-7715) |
| `/arena` | Spectator betting index — live battles + odds + bet modal |
| `/arena/[battleId]` | Individual live battle view (3D arena, real-time debate) |
| `/lobby` | Hot take room browser (create/join battles) |
| `/build` | Legacy agent builder (superseded by /forge) |

## Key Architecture Decisions
- **One agent per wallet**: Enforced via `localStorage` key `clashboard_agent_{address}`
- `/forge` redirects to `/dashboard` if agent already exists for connected wallet
- ERC-7715 permission flow lives in `/dashboard` → Permissions tab
- Arena spectator page (`/arena`) is fully public — no wallet required to view, wallet required to bet
- All 3D components use `dynamic(() => import(...), { ssr: false })` to avoid SSR issues
- Design system: `font-display` = Syne, `font-body` = DM Sans, accent colors per persona

## Personas & Accents
| Persona | Accent |
|---------|--------|
| Historian | #C9A227 |
| Analyst | #FFB800 |
| Roaster | #BE1A1A |
| Contrarian | #7C3AED |
| Professor | #059669 |

## build_status
```json
{
  "milestones": [
    "M1: /forge — 7-step agent creation wizard",
    "M2: /dashboard — command centre with Overview/Battles/Permissions tabs",
    "M3: /arena — spectator betting index with live battle cards + bet modal"
  ],
  "mvp_complete": true,
  "tests_passing": true,
  "devnet_deployed": false
}
```

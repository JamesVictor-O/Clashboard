import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { OnChainAgentRecord } from "@/lib/types";

// ─── Chain Definitions ────────────────────────────────────────────────────────

export const celoAlfajores: Chain = {
  id: 44787,
  name: "Celo Alfajores",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.CELO_ALFAJORES_RPC ??
          "https://alfajores-forno.celo-testnet.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Celoscan",
      url: "https://alfajores.celoscan.io",
    },
  },
  testnet: true,
};

export const celoMainnet: Chain = {
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.CELO_MAINNET_RPC ?? "https://forno.celo.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Celoscan",
      url: "https://celoscan.io",
    },
  },
};

// ─── Contract ABI ─────────────────────────────────────────────────────────────

export const ARENA_ABI = parseAbi([
  // Battle management
  "function createBattle(bytes32 battleId, address agentA, address agentB, uint256 bettingDuration) external",
  "function commitRubric(bytes32 battleId, bytes32 rubricHash) external",
  "function settleBattle(bytes32 battleId, uint8 winnerSide, bytes32 rubricPreimage, uint256 judgeScore) external",
  "function depositBet(bytes32 battleId, uint8 side, uint256 amount) external",

  // Rooms
  "function createRoom(bytes32 roomId, uint256 stake) external",
  "function acceptRoom(bytes32 roomId, bytes32 battleId) external",

  // Views
  "function getAgentRecord(address agent) external view returns (uint256 wins, uint256 losses, uint256 total, uint256 avgScore)",
  "function getBattlePool(bytes32 battleId) external view returns (uint256 poolA, uint256 poolB, uint256 total)",
  "function battles(bytes32) external view returns (uint8 state, bytes32 rubricHash, address agentA, address agentB, address winner, uint256 poolA, uint256 poolB, uint256 bettingDeadline)",

  // Events
  "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB)",
  "event BattleSettled(bytes32 indexed battleId, address winner, uint256 poolTotal)",
  "event BetPlaced(bytes32 indexed battleId, address bettor, uint8 side, uint256 amount)",
]);

// ─── Clients ──────────────────────────────────────────────────────────────────

function getActiveChain(): Chain {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787");
  return chainId === 42220 ? celoMainnet : celoAlfajores;
}

let _publicClient: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(),
    });
  }
  return _publicClient;
}

function getWalletClient(): WalletClient {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PLATFORM_PRIVATE_KEY is not set");
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: getActiveChain(),
    transport: http(),
  });
}

function getPlatformAccount() {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) throw new Error("PLATFORM_PRIVATE_KEY is not set");
  return privateKeyToAccount(privateKey as `0x${string}`);
}

function getContractAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_ARENA_CONTRACT;
  if (!addr) throw new Error("NEXT_PUBLIC_ARENA_CONTRACT is not set");
  return addr as `0x${string}`;
}

// ─── Write Helpers ────────────────────────────────────────────────────────────

export async function createBattleOnChain(params: {
  battleId: `0x${string}`;
  agentA: `0x${string}`;
  agentB: `0x${string}`;
  bettingDuration: bigint;
  rubricHash: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "createBattle",
    args: [
      params.battleId,
      params.agentA,
      params.agentB,
      params.bettingDuration,
    ],
    chain,
    account: getPlatformAccount(),
  });

  return hash;
}

export async function settleBattleOnChain(params: {
  battleId: `0x${string}`;
  winnerSide: 1 | 2;
  rubricPreimage: string;
  judgeScore: bigint;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "settleBattle",
    args: [
      params.battleId,
      params.winnerSide,
      params.rubricPreimage as `0x${string}`,
      params.judgeScore,
    ],
    chain,
    account: getPlatformAccount(),
  });

  return hash;
}

// ─── Read Helpers ─────────────────────────────────────────────────────────────

export async function getAgentRecord(
  agentAddress: `0x${string}`
): Promise<OnChainAgentRecord> {
  const client = getPublicClient();
  const contract = getContractAddress();

  const [wins, losses, totalBattles, avgScore] = await client.readContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "getAgentRecord",
    args: [agentAddress],
  }) as [bigint, bigint, bigint, bigint];

  return { wins, losses, totalBattles, avgScore };
}

export async function getBattlePool(battleId: `0x${string}`): Promise<{
  poolA: bigint;
  poolB: bigint;
  total: bigint;
}> {
  const client = getPublicClient();
  const contract = getContractAddress();

  const [poolA, poolB, total] = await client.readContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "getBattlePool",
    args: [battleId],
  }) as [bigint, bigint, bigint];

  return { poolA, poolB, total };
}

// ─── Explorer URL ─────────────────────────────────────────────────────────────

export function getTxExplorerUrl(txHash: string): string {
  const chain = getActiveChain();
  const base = chain.blockExplorers?.default.url ?? "https://alfajores.celoscan.io";
  return `${base}/tx/${txHash}`;
}

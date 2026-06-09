import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { OnChainAgentRecord } from "@/lib/types";

// ─── Chain Definitions ────────────────────────────────────────────────────────

export const baseSepolia: Chain = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
};

export const baseMainnet: Chain = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.BASE_MAINNET_RPC ?? "https://mainnet.base.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://basescan.org",
    },
  },
};

// ─── Contract ABIs ────────────────────────────────────────────────────────────

export const ARENA_ABI = parseAbi([
  // Battle lifecycle (scheduler only)
  "function createBattle(bytes32 battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDuration, uint256 roundDuration, uint256 maxResearch, bytes32 topicHash, string topic, bytes32 categoryHash) external",
  "function createBattle(bytes32 battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDuration, uint256 roundDuration, uint8 totalRounds, uint256 maxResearch, bytes32 topicHash, string topic, bytes32 categoryHash) external",
  "function commitRubric(bytes32 battleId, bytes32 rubricHash) external",
  "function closeBetting(bytes32 battleId) external",
  "function startDebate(bytes32 battleId) external",
  "function submitArgument(bytes32 battleId, uint8 side, bytes32 contentHash) external",
  "function advanceRound(bytes32 battleId) external",
  "function expirePreparation(bytes32 battleId) external",
  "function settleBattle(bytes32 battleId, uint8 winnerSide, bytes32 rubricPreimage, uint256 judgeScore) external",
  "function cancelBattle(bytes32 battleId) external",

  // Spectator betting (public)
  "function placeBet(bytes32 battleId, uint8 side, uint256 amount) external",
  "function placeBetFor(address bettor, bytes32 battleId, uint8 side, uint256 amount) external",

  // Views
  "function getBattlePhase(bytes32 battleId) external view returns (uint8 phase)",
  "function getPhaseTimeRemaining(bytes32 battleId) external view returns (uint256)",
  "function getTotalPool(bytes32 battleId) external view returns (uint256)",
  "function getUserBet(bytes32 battleId, address bettor) external view returns (uint8 side, uint256 amount)",
  "function getBettorCount(bytes32 battleId) external view returns (uint256 sideA, uint256 sideB)",
  "function getCurrentRound(bytes32 battleId) external view returns (uint8)",
  "function getArgument(bytes32 battleId, uint8 round, uint8 side) external view returns (bytes32 contentHash, bool submitted)",
  "function getArgumentStatus(bytes32 battleId, uint8 round, uint8 side) external view returns (bytes32 contentHash, bool submitted, bool missed)",
  "function battles(bytes32) external view returns (uint8 state, address agentA, address agentB, address winner, uint256 entryFee, uint256 fighterPoolA, uint256 fighterPoolB, uint256 spectatorPoolA, uint256 spectatorPoolB, uint256 bettingDeadline, uint256 roundDuration, uint8 totalRounds, uint8 phase, uint8 currentRound, uint256 debateStartedAt, uint256 currentRoundStartedAt, uint256 currentRoundDeadline, uint256 prepareDeadline, bytes32 rubricHash, uint256 maxResearch, bytes32 topicHash, string topic, bytes32 categoryHash, bool rubricCommitted)",

  // Events
  "event BattleCreated(bytes32 indexed battleId, address agentA, address agentB, uint256 entryFee, uint256 bettingDeadline, bytes32 topicHash, string topic)",
  "event BetPlaced(bytes32 indexed battleId, address indexed bettor, uint8 side, uint256 amount)",
  "event RubricCommitted(bytes32 indexed battleId, bytes32 rubricHash)",
  "event BettingClosed(bytes32 indexed battleId, uint256 prepareDeadline)",
  "event DebateStarted(bytes32 indexed battleId, uint8 round, uint256 roundDeadline)",
  "event ArgumentSubmitted(bytes32 indexed battleId, uint8 round, uint8 side, bytes32 contentHash)",
  "event ArgumentMissed(bytes32 indexed battleId, uint8 round, uint8 side)",
  "event RoundAdvanced(bytes32 indexed battleId, uint8 round, uint256 roundDeadline)",
  "event JudgingReady(bytes32 indexed battleId)",
  "event BattleExpired(bytes32 indexed battleId)",
  "event BattleSettled(bytes32 indexed battleId, address indexed winner, uint256 totalPool)",
  "event BattleCancelled(bytes32 indexed battleId)",
]);

export const REGISTRY_ABI = parseAbi([
  "function forge(string name, bytes32 metaHash) external",
  "function agentExists_(address owner) external view returns (bool)",
  "function getAgent(address owner) external view returns ((address owner, address agentAddress, string name, bytes32 metadataHash, uint256 forgedAt, bool exists) agent, (uint256 wins, uint256 losses, uint256 totalBattles, uint256 scoreSum, uint256 earningsTotal) reputation)",
  "function totalAgents() external view returns (uint256)",
]);

export const TREASURY_ABI = parseAbi([
  "function deposit(address _agentOwner, uint256 _amount) external",
  "function withdraw(uint256 _amount) external",
  "function getBalance(address _agentOwner) external view returns (uint256)",
]);

export const HOTTAKEROOMS_ABI = parseAbi([
  "function issueChallenge(bytes32 roomId, bytes32 topicHash, string topicPreview, bytes32 categoryHash, uint256 stake) external",
  "function issueChallengeFor(address agentOwner, bytes32 roomId, bytes32 topicHash, string topicPreview, bytes32 categoryHash, uint256 stake) external",
  "function acceptChallenge(bytes32 roomId, bytes32 battleId, uint256 bettingDuration, uint256 roundDuration, uint256 maxResearch) external",
  "function acceptChallengeFor(address agentOwner, bytes32 roomId, bytes32 battleId, uint256 bettingDuration, uint256 roundDuration, uint256 maxResearch) external",
  "function cancelChallenge(bytes32 roomId) external",
  "function authorizeExecutor(address executor, bool allowed) external",
  "function authorizedExecutors(address agentOwner, address executor) external view returns (bool)",
  "function getRoom(bytes32 roomId) external view returns ((uint8 state, address creator, address challenger, uint256 stake, bytes32 topicHash, string topicPreview, bytes32 battleId, uint256 createdAt, uint256 expiresAt, bytes32 categoryHash))",
  "event RoomCreated(bytes32 indexed roomId, address indexed creator, uint256 stake, string topicPreview, uint256 expiresAt)",
  "event RoomAccepted(bytes32 indexed roomId, address indexed challenger, bytes32 battleId)",
]);

type BattleTuple = readonly [
  number,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  number,
  number,
  bigint,
  bigint,
  bigint,
  bigint,
  `0x${string}`,
  bigint,
  `0x${string}`,
  string,
  `0x${string}`,
  boolean
];

export interface ArenaBattleSnapshot {
  state: number;
  phase: number;
  currentRound: number;
  rubricHash: `0x${string}`;
  rubricCommitted: boolean;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

function getActiveChain(): Chain {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
  return chainId === 8453 ? baseMainnet : baseSepolia;
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

function getRegistryAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT;
  if (!addr) throw new Error("NEXT_PUBLIC_REGISTRY_CONTRACT is not set");
  return addr as `0x${string}`;
}

function getHotTakeRoomsAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT;
  if (!addr) throw new Error("NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT is not set");
  return addr as `0x${string}`;
}

export function getTreasuryAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_TREASURY_CONTRACT;
  if (!addr) throw new Error("NEXT_PUBLIC_TREASURY_CONTRACT is not set");
  return addr as `0x${string}`;
}

// ─── Hash helpers ─────────────────────────────────────────────────────────────

/**
 * Derive the on-chain rubric commitment from a rubric JSON string.
 *
 * Flow:
 *   preimage = keccak256(abi.encode(rubricJson))   ← bytes32 stored off-chain
 *   hash     = keccak256(abi.encode(preimage))     ← committed on-chain via commitRubric
 *
 * On settlement the preimage is passed to the contract, which re-derives the
 * hash and verifies it matches the committed value.
 */
export function buildRubricCommitment(rubricJson: string): {
  preimage: `0x${string}`;
  hash: `0x${string}`;
} {
  const preimage = keccak256(
    encodeAbiParameters(parseAbiParameters("string"), [rubricJson])
  ) as `0x${string}`;

  const hash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32"), [preimage])
  ) as `0x${string}`;

  return { preimage, hash };
}

/**
 * Derive a deterministic bytes32 content hash from an argument text string.
 * Used as the on-chain IPFS content-hash placeholder until real IPFS upload is wired.
 */
export function argContentHash(text: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string"), [text])
  ) as `0x${string}`;
}

// ─── Write Helpers ────────────────────────────────────────────────────────────

export async function createBattleOnChain(params: {
  battleId: `0x${string}`;
  agentA: `0x${string}`;
  agentB: `0x${string}`;
  entryFee: bigint;
  bettingDuration: bigint;
  roundDuration: bigint;
  maxResearch: bigint;
  topicHash: `0x${string}`;
  topic: string;
  categoryHash: `0x${string}`;
  totalRounds?: 2 | 3;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  if (params.totalRounds && params.totalRounds !== 2) {
    const hash = await wallet.writeContract({
      address: contract,
      abi: ARENA_ABI,
      functionName: "createBattle",
      args: [
        params.battleId,
        params.agentA,
        params.agentB,
        params.entryFee,
        params.bettingDuration,
        params.roundDuration,
        params.totalRounds,
        params.maxResearch,
        params.topicHash,
        params.topic,
        params.categoryHash,
      ],
      chain,
      account: getPlatformAccount(),
    });

    return hash;
  }

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "createBattle",
    args: [
      params.battleId,
      params.agentA,
      params.agentB,
      params.entryFee,
      params.bettingDuration,
      params.roundDuration,
      params.maxResearch,
      params.topicHash,
      params.topic,
      params.categoryHash,
    ],
    chain,
    account: getPlatformAccount(),
  });

  return hash;
}

export async function commitRubricOnChain(params: {
  battleId: `0x${string}`;
  rubricHash: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "commitRubric",
    args: [params.battleId, params.rubricHash],
    chain,
    account: getPlatformAccount(),
  });

  return hash;
}

export async function closeBettingOnChain(params: {
  battleId: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "closeBetting",
    args: [params.battleId],
    chain,
    account: getPlatformAccount(),
  });
}

export async function startDebateOnChain(params: {
  battleId: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "startDebate",
    args: [params.battleId],
    chain,
    account: getPlatformAccount(),
  });
}

export async function submitArgumentOnChain(params: {
  battleId: `0x${string}`;
  side: 1 | 2;
  contentHash: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "submitArgument",
    args: [params.battleId, params.side, params.contentHash],
    chain,
    account: getPlatformAccount(),
  });

  return hash;
}

export async function advanceRoundOnChain(params: {
  battleId: `0x${string}`;
}): Promise<string> {
  const wallet = getWalletClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "advanceRound",
    args: [params.battleId],
    chain,
    account: getPlatformAccount(),
  });
}

export async function settleBattleOnChain(params: {
  battleId: `0x${string}`;
  winnerSide: 1 | 2;
  rubricPreimage: `0x${string}`;
  judgeScore: bigint;
}): Promise<string> {
  const wallet = getWalletClient();
  const client = getPublicClient();
  const contract = getContractAddress();
  const chain = getActiveChain();

  const hash = await wallet.writeContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "settleBattle",
    args: [
      params.battleId,
      params.winnerSide,
      params.rubricPreimage,
      params.judgeScore,
    ],
    chain,
    account: getPlatformAccount(),
  });

  // Wait for the settlement tx to be mined. The contract distributes USDC to
  // winners atomically inside settleBattle — if this tx reverts, no payout
  // happens and we must NOT mark the battle as settled off-chain.
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status === "reverted") {
    throw new Error(`settleBattle tx reverted on-chain: ${hash}`);
  }

  return hash;
}

export async function issueChallengeForOnChain(params: {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  topicHash: `0x${string}`;
  topicPreview: string;
  categoryHash: `0x${string}`;
  stakeWei: bigint;
}): Promise<string> {
  const wallet = getWalletClient();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: getHotTakeRoomsAddress(),
    abi: HOTTAKEROOMS_ABI,
    functionName: "issueChallengeFor",
    args: [
      params.agentOwner,
      params.roomId,
      params.topicHash,
      params.topicPreview,
      params.categoryHash,
      params.stakeWei,
    ],
    chain,
    account: getPlatformAccount(),
  });
}

export async function acceptChallengeForOnChain(params: {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  battleId: `0x${string}`;
  bettingDuration: bigint;
  roundDuration: bigint;
  maxResearch: bigint;
}): Promise<string> {
  const wallet = getWalletClient();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: getHotTakeRoomsAddress(),
    abi: HOTTAKEROOMS_ABI,
    functionName: "acceptChallengeFor",
    args: [
      params.agentOwner,
      params.roomId,
      params.battleId,
      params.bettingDuration,
      params.roundDuration,
      params.maxResearch,
    ],
    chain,
    account: getPlatformAccount(),
  });
}

export async function placeBetForOnChain(params: {
  bettor: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountWei: bigint;
}): Promise<string> {
  const wallet = getWalletClient();
  const chain = getActiveChain();

  return wallet.writeContract({
    address: getContractAddress(),
    abi: ARENA_ABI,
    functionName: "placeBetFor",
    args: [params.bettor, params.battleId, params.side, params.amountWei],
    chain,
    account: getPlatformAccount(),
  });
}

// ─── Read Helpers ─────────────────────────────────────────────────────────────

export async function getAgentRecord(
  agentAddress: `0x${string}`
): Promise<OnChainAgentRecord> {
  const client = getPublicClient();
  const contract = getRegistryAddress();

  const [, repTuple] = (await client.readContract({
    address: contract,
    abi: REGISTRY_ABI,
    functionName: "getAgent",
    args: [agentAddress],
  }) as unknown) as [unknown, { wins: bigint; losses: bigint; totalBattles: bigint; scoreSum: bigint }];

  return {
    wins: repTuple.wins,
    losses: repTuple.losses,
    totalBattles: repTuple.totalBattles,
    avgScore: repTuple.scoreSum,
  };
}

export async function getBattlePhase(battleId: `0x${string}`): Promise<number> {
  const client = getPublicClient();
  const contract = getContractAddress();

  return await client.readContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "getBattlePhase",
    args: [battleId],
  }) as number;
}

export async function getArenaBattleSnapshot(battleId: `0x${string}`): Promise<ArenaBattleSnapshot> {
  const client = getPublicClient();
  const contract = getContractAddress();

  const tuple = await client.readContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "battles",
    args: [battleId],
  }) as unknown as BattleTuple;

  return {
    state: Number(tuple[0]),
    phase: Number(tuple[12]),
    currentRound: Number(tuple[13]),
    rubricHash: tuple[18],
    rubricCommitted: tuple[23],
  };
}

export async function isArgumentSubmittedOnChain(params: {
  battleId: `0x${string}`;
  round: number;
  side: 1 | 2;
}): Promise<boolean> {
  const client = getPublicClient();
  const contract = getContractAddress();

  const [, submitted] = await client.readContract({
    address: contract,
    abi: ARENA_ABI,
    functionName: "getArgument",
    args: [params.battleId, params.round, params.side],
  }) as readonly [`0x${string}`, boolean];

  return submitted;
}

// ─── Explorer URL ─────────────────────────────────────────────────────────────

export function getTxExplorerUrl(txHash: string): string {
  const chain = getActiveChain();
  const base = chain.blockExplorers?.default.url ?? "https://sepolia.basescan.org";
  return `${base}/tx/${txHash}`;
}

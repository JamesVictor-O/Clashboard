import { parseAbiItem } from "viem";
import { blockRanges, getEventScanStartBlock, mapWithConcurrency } from "@/lib/event-scan";

export interface Room {
  id: string;
  topic: string;
  creatorName: string;
  creatorAddress: string;
  challengerAddress?: string;
  battleId?: `0x${string}`;
  winnerAddress?: string;
  winnerName?: string;
  winnerEarnedUSDC?: number;
  stake: number;
  state: "WAITING" | "LOCKED" | "SETTLED";
  createdAt: number;
  category: string;
  bettors: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as `0x${string}`;

export function inferChallengeCategory(topic: string): string {
  if (/sport|football|soccer|basketball|nba|nfl|kobe|lebron|messi|ronaldo/i.test(topic)) {
    return "Sports";
  }
  if (/music|rap|hip.?hop|wizkid|burna|singer|song/i.test(topic)) {
    return "Music";
  }
  if (/crypto|bitcoin|eth|web3|defi/i.test(topic)) {
    return "Crypto";
  }
  if (/tech|iphone|android|ai|apple|google/i.test(topic)) {
    return "Tech";
  }
  return "Culture";
}

export async function fetchRooms(): Promise<Room[]> {
  const { getPublicClient, HOTTAKEROOMS_ABI: roomsAbi, ARENA_ABI: arenaAbi } = await import("@/lib/chain");
  const client = getPublicClient();
  const roomsAddress = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;
  const arenaAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT as `0x${string}`;

  const latestBlock = await client.getBlockNumber();
  const ranges = blockRanges(getEventScanStartBlock(latestBlock), latestBlock);
  const event = parseAbiItem(
    "event RoomCreated(bytes32 indexed roomId, address indexed creator, uint256 stake, string topicPreview, uint256 expiresAt)"
  );

  const chunks = await mapWithConcurrency(ranges, 4, async ({ fromBlock, toBlock }) => {
    try {
      return await client.getLogs({ address: roomsAddress, event, fromBlock, toBlock });
    } catch {
      return [];
    }
  });
  const allLogs = chunks.flat();

  const topLogs = [...allLogs].reverse().slice(0, 30);
  const roomResults = await Promise.allSettled(
    topLogs.map(async (log) => {
      const roomId = log.args.roomId as `0x${string}`;
      const creator = log.args.creator as `0x${string}`;
      const stakeWei = log.args.stake as bigint;
      const topicPreview = (log.args.topicPreview as string) ?? "";

      const roomData = (await client.readContract({
        address: roomsAddress,
        abi: roomsAbi,
        functionName: "getRoom",
        args: [roomId],
      })) as unknown as {
        state: number;
        creator: `0x${string}`;
        challenger: `0x${string}`;
        stake: bigint;
        topicPreview: string;
        battleId: `0x${string}`;
        createdAt: bigint;
        expiresAt: bigint;
      };

      // 0=OPEN, 1=LOCKED, 2=SETTLED, 3=CANCELLED
      if (roomData.state === 3) return null;

      const battleId = roomData.battleId && roomData.battleId !== ZERO_BYTES32
        ? roomData.battleId
        : undefined;
      let state: Room["state"] =
        roomData.state === 2 ? "SETTLED" : roomData.state === 1 ? "LOCKED" : "WAITING";
      let winnerAddress: string | undefined;
      let winnerEarnedUSDC: number | undefined;

      if (battleId && arenaAddress) {
        try {
          const battle = (await client.readContract({
            address: arenaAddress,
            abi: arenaAbi,
            functionName: "battles",
            args: [battleId],
          })) as unknown as {
            state: number;
            agentA: `0x${string}`;
            agentB: `0x${string}`;
            winner: `0x${string}`;
            fighterPoolA: bigint;
            fighterPoolB: bigint;
          };
          if (battle.agentA === ZERO_ADDRESS) return null;
          if (battle.state === 1 && battle.winner !== ZERO_ADDRESS) {
            state = "SETTLED";
            winnerAddress = battle.winner;
            const fighterPool = battle.fighterPoolA + battle.fighterPoolB;
            winnerEarnedUSDC = Number((fighterPool * 7000n) / 10000n) / 1e6;
          }
        } catch {}
      }

      return {
        id: roomId,
        topic: topicPreview,
        creatorName: `${creator.slice(0, 6)}…${creator.slice(-4)}`,
        creatorAddress: creator,
        challengerAddress:
          roomData.challenger && roomData.challenger !== ZERO_ADDRESS ? roomData.challenger : undefined,
        battleId,
        winnerAddress,
        winnerName: winnerAddress ? `${winnerAddress.slice(0, 6)}…${winnerAddress.slice(-4)}` : undefined,
        winnerEarnedUSDC,
        stake: Number(stakeWei) / 1e6,
        state,
        createdAt: Number(roomData.createdAt) * 1000,
        category: inferChallengeCategory(topicPreview),
        bettors: 0,
      } as Room;
    })
  );

  return roomResults.flatMap((r) => (r.status === "fulfilled" && r.value !== null ? [r.value] : []));
}

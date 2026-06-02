import { parseAbiItem } from "viem";

export interface Room {
  id: string;
  topic: string;
  creatorName: string;
  creatorAddress: string;
  stake: number;
  state: "WAITING" | "LOCKED" | "SETTLED";
  createdAt: number;
  category: string;
  bettors: number;
}

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
  const { getPublicClient, HOTTAKEROOMS_ABI: roomsAbi } = await import("@/lib/chain");
  const client = getPublicClient();
  const roomsAddress = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;

  const latestBlock = await client.getBlockNumber();
  // Public RPC caps getLogs at 2 000 blocks per request. Scan sequentially so
  // the lobby works on public endpoints without tripping rate limits.
  const TARGET_RANGE = 50000n;
  const CHUNK = 2000n;
  const startBlock = latestBlock > TARGET_RANGE ? latestBlock - TARGET_RANGE : 0n;
  const event = parseAbiItem(
    "event RoomCreated(bytes32 indexed roomId, address indexed creator, uint256 stake, string topicPreview, uint256 expiresAt)"
  );

  const allLogs = [];
  for (let from = startBlock; from < latestBlock; from += CHUNK) {
    const to = from + CHUNK - 1n < latestBlock ? from + CHUNK - 1n : latestBlock;
    try {
      const chunk = await client.getLogs({ address: roomsAddress, event, fromBlock: from, toBlock: to });
      allLogs.push(...chunk);
    } catch {
      // Skip flaky chunks and keep rendering whatever the RPC returned.
    }
  }

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
      })) as unknown as { state: number; createdAt: bigint; expiresAt: bigint };

      // 0=OPEN, 1=LOCKED, 2=SETTLED, 3=CANCELLED
      if (roomData.state === 2 || roomData.state === 3) return null;

      return {
        id: roomId,
        topic: topicPreview,
        creatorName: `${creator.slice(0, 6)}…${creator.slice(-4)}`,
        creatorAddress: creator,
        stake: Number(stakeWei) / 1e6,
        state: roomData.state === 1 ? "LOCKED" : "WAITING",
        createdAt: Number(roomData.createdAt) * 1000,
        category: inferChallengeCategory(topicPreview),
        bettors: 0,
      } as Room;
    })
  );

  return roomResults.flatMap((r) => (r.status === "fulfilled" && r.value !== null ? [r.value] : []));
}

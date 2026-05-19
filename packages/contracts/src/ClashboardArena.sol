// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClashboardArena
/// @notice On-chain settlement layer for AI debate battles.
///         Handles battle lifecycle, parimutuel betting, and instant payouts.
contract ClashboardArena is Ownable, ReentrancyGuard {
    IERC20 public immutable USDC;
    address public platformTreasury;

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum BattleState { OPEN, LIVE, SETTLED }
    enum RoomState   { WAITING, LOCKED, SETTLED }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Battle {
        BattleState state;
        bytes32     rubricHash;
        address     agentA;
        address     agentB;
        address     winner;
        uint256     poolA;
        uint256     poolB;
        uint256     bettingDeadline;
    }

    struct Bet {
        uint8   side;
        uint256 amount;
    }

    struct Room {
        RoomState state;
        address   creatorAgent;
        address   challengerAgent;
        uint256   stake;
        bytes32   battleId;
    }

    struct AgentRecord {
        uint256 wins;
        uint256 losses;
        uint256 totalBattles;
        uint256 scoreSum;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Battle)                      public battles;
    mapping(bytes32 => mapping(address => Bet))     public bets;
    mapping(bytes32 => address[])                   internal bettorsA;
    mapping(bytes32 => address[])                   internal bettorsB;
    mapping(bytes32 => Room)                        public rooms;
    mapping(address => AgentRecord)                 public agentRecords;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BattleCreated(bytes32 indexed battleId, address agentA, address agentB);
    event BetPlaced(bytes32 indexed battleId, address bettor, uint8 side, uint256 amount);
    event RubricCommitted(bytes32 indexed battleId, bytes32 rubricHash);
    event BattleSettled(bytes32 indexed battleId, address winner, uint256 poolTotal);
    event RoomCreated(bytes32 indexed roomId, address creator, uint256 stake);
    event RoomAccepted(bytes32 indexed roomId, address challenger, bytes32 battleId);
    event AgentRecordUpdated(address indexed agent, uint256 wins, uint256 losses, uint256 avgScore);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _treasury) Ownable(msg.sender) {
        USDC             = IERC20(_usdc);
        platformTreasury = _treasury;
    }

    // ─── Battle Management ────────────────────────────────────────────────────

    /// @notice Create a new battle. Only callable by platform (owner).
    function createBattle(
        bytes32 battleId,
        address agentA,
        address agentB,
        uint256 bettingDuration
    ) external onlyOwner {
        require(battles[battleId].agentA == address(0), "Battle exists");
        battles[battleId] = Battle({
            state:           BattleState.OPEN,
            rubricHash:      bytes32(0),
            agentA:          agentA,
            agentB:          agentB,
            winner:          address(0),
            poolA:           0,
            poolB:           0,
            bettingDeadline: block.timestamp + bettingDuration
        });
        emit BattleCreated(battleId, agentA, agentB);
    }

    /// @notice Place a bet on a battle. Transfers USDC from bettor.
    function depositBet(bytes32 battleId, uint8 side, uint256 amount) external nonReentrant {
        Battle storage b = battles[battleId];
        require(b.state == BattleState.OPEN,          "Betting closed");
        require(block.timestamp < b.bettingDeadline,  "Deadline passed");
        require(side == 1 || side == 2,               "Invalid side");
        require(bets[battleId][msg.sender].amount == 0, "Already bet");
        require(amount > 0,                           "Zero amount");

        USDC.transferFrom(msg.sender, address(this), amount);
        bets[battleId][msg.sender] = Bet(side, amount);

        if (side == 1) { b.poolA += amount; bettorsA[battleId].push(msg.sender); }
        else           { b.poolB += amount; bettorsB[battleId].push(msg.sender); }

        emit BetPlaced(battleId, msg.sender, side, amount);
    }

    /// @notice Commit the judge rubric hash and transition battle to LIVE.
    ///         The preimage is revealed at settlement to prevent post-hoc manipulation.
    function commitRubric(bytes32 battleId, bytes32 rubricHash) external onlyOwner {
        Battle storage b = battles[battleId];
        require(b.state == BattleState.OPEN, "Wrong state");
        b.rubricHash = rubricHash;
        b.state      = BattleState.LIVE;
        emit RubricCommitted(battleId, rubricHash);
    }

    /// @notice Settle a battle. Verifies rubric preimage, distributes payouts.
    ///         Split: 70% winner agent, 25% winning bettors (pro-rata), 5% platform.
    function settleBattle(
        bytes32 battleId,
        uint8   winnerSide,
        bytes32 rubricPreimage,
        uint256 judgeScore
    ) external onlyOwner nonReentrant {
        Battle storage b = battles[battleId];
        require(b.state == BattleState.LIVE, "Not live");
        require(
            keccak256(abi.encode(rubricPreimage)) == b.rubricHash,
            "Rubric mismatch"
        );

        b.state  = BattleState.SETTLED;
        b.winner = winnerSide == 1 ? b.agentA : b.agentB;

        uint256 total    = b.poolA + b.poolB;
        uint256 platform = total * 5  / 100;
        uint256 agentCut = total * 70 / 100;
        uint256 bettors  = total - platform - agentCut;

        USDC.transfer(platformTreasury, platform);
        USDC.transfer(b.winner, agentCut);

        address[] storage winners = winnerSide == 1
            ? bettorsA[battleId]
            : bettorsB[battleId];
        uint256 winPool = winnerSide == 1 ? b.poolA : b.poolB;

        if (winPool > 0) {
            for (uint i = 0; i < winners.length; i++) {
                uint256 share = bets[battleId][winners[i]].amount * bettors / winPool;
                if (share > 0) USDC.transfer(winners[i], share);
            }
        }

        _recordResult(b.agentA, winnerSide == 1, judgeScore);
        _recordResult(b.agentB, winnerSide == 2, judgeScore);

        emit BattleSettled(battleId, b.winner, total);
    }

    // ─── Hot Take Rooms ───────────────────────────────────────────────────────

    /// @notice Create a 1v1 challenge room with a stake.
    function createRoom(bytes32 roomId, uint256 stake) external nonReentrant {
        require(rooms[roomId].stake == 0, "Room exists");
        require(stake > 0,               "Zero stake");

        USDC.transferFrom(msg.sender, address(this), stake);
        rooms[roomId] = Room({
            state:           RoomState.WAITING,
            creatorAgent:    msg.sender,
            challengerAgent: address(0),
            stake:           stake,
            battleId:        bytes32(0)
        });
        emit RoomCreated(roomId, msg.sender, stake);
    }

    /// @notice Accept a challenge room. Locks both stakes.
    function acceptRoom(bytes32 roomId, bytes32 battleId) external nonReentrant {
        Room storage r = rooms[roomId];
        require(r.state == RoomState.WAITING,    "Not open");
        require(msg.sender != r.creatorAgent,    "No self-challenge");

        USDC.transferFrom(msg.sender, address(this), r.stake);
        r.challengerAgent = msg.sender;
        r.state           = RoomState.LOCKED;
        r.battleId        = battleId;

        emit RoomAccepted(roomId, msg.sender, battleId);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _recordResult(address agent, bool won, uint256 score) internal {
        AgentRecord storage rec = agentRecords[agent];
        rec.totalBattles++;
        rec.scoreSum += score;
        if (won) rec.wins++;
        else     rec.losses++;
        uint256 avg = rec.scoreSum / rec.totalBattles;
        emit AgentRecordUpdated(agent, rec.wins, rec.losses, avg);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAgentRecord(address agent)
        external
        view
        returns (uint256 wins, uint256 losses, uint256 total, uint256 avgScore)
    {
        AgentRecord memory r = agentRecords[agent];
        return (
            r.wins,
            r.losses,
            r.totalBattles,
            r.totalBattles > 0 ? r.scoreSum / r.totalBattles : 0
        );
    }

    function getBattlePool(bytes32 battleId)
        external
        view
        returns (uint256 poolA, uint256 poolB, uint256 total)
    {
        Battle memory b = battles[battleId];
        return (b.poolA, b.poolB, b.poolA + b.poolB);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function updateTreasury(address newTreasury) external onlyOwner {
        platformTreasury = newTreasury;
    }
}

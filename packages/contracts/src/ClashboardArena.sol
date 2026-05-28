// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AgentRegistry.sol";
import "./AgentTreasury.sol";

/**
 * @title ClashboardArena
 * @notice Core battle engine. Time drives all phase transitions — no keeper needed.
 *
 * Timeline (all derived from block.timestamp):
 *
 *   [creation]──── bettingDeadline ────[round 1]──[round 2]──[round 3]──[settle]
 *        ↑                ↑                  ↑         ↑         ↑          ↑
 *    createBattle     placeBet()        submitArg  submitArg  submitArg  settleBattle
 *                                       (side 1&2)
 *
 *   Phase = BETTING  : block.timestamp < bettingDeadline
 *   Phase = ROUND n  : bettingDeadline + (n-1)*roundDuration <= t < bettingDeadline + n*roundDuration
 *   Phase = COMPLETE : block.timestamp >= bettingDeadline + totalRounds*roundDuration
 *
 * Backend only needs to:
 *   1. commitRubric()     — lock judge criteria (while BETTING)
 *   2. submitArgument()   — Venice AI generates arg → IPFS → hash on-chain (per round)
 *   3. settleBattle()     — Venice AI judges all args → picks winner (after COMPLETE)
 *
 * Reward distribution:
 *   Fighter pool  : 70% winner | 5% platform | 25% → spectator prize pot
 *   Spectator pool: winning bettors split pro-rata; platform takes 5%
 */
contract ClashboardArena is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    IERC20          public immutable USDC;
    AgentRegistry   public immutable registry;
    AgentTreasury   public immutable treasury;
    address         public           platformTreasury;
    address         public           hotTakeRooms;

    enum BattleState { OPEN, SETTLED, CANCELLED }

    struct Battle {
        BattleState state;
        address     agentA;
        address     agentB;
        address     winner;
        uint256     entryFee;
        uint256     fighterPoolA;
        uint256     fighterPoolB;
        uint256     spectatorPoolA;
        uint256     spectatorPoolB;
        uint256     bettingDeadline;  // betting closes here; round 1 starts here
        uint256     roundDuration;    // seconds per round
        uint8       totalRounds;      // always 3
        bytes32     rubricHash;
        uint256     maxResearch;
        bytes32     topicHash;
        string      topic;
        bytes32     categoryHash;
        bool        rubricCommitted;
    }

    struct Bet {
        uint8   side;   // 1 = agentA, 2 = agentB
        uint256 amount;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Battle)                                          public  battles;
    mapping(bytes32 => mapping(address => Bet))                         public  bets;
    mapping(bytes32 => address[])                                       private _bettorsA;
    mapping(bytes32 => address[])                                       private _bettorsB;

    // battleId → round (1-3) → side (1=A, 2=B) → IPFS argument content hash
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bytes32))) public arguments;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bool)))    public argSubmitted;

    address public scheduler;

    uint256 public constant PLATFORM_FEE_BPS   = 500;   // 5%
    uint256 public constant WINNER_FIGHTER_BPS  = 7000;  // 70%
    uint256 public constant BPS_DENOMINATOR     = 10000;
    uint256 public constant MIN_BETTING_WINDOW  = 120;   // 2 minutes
    uint256 public constant MIN_ROUND_DURATION  = 30;    // 30 seconds
    uint256 public constant MAX_TOPIC_LENGTH     = 280;   // bytes; enough for a hot take
    uint8   public constant TOTAL_ROUNDS        = 3;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BattleCreated(
        bytes32 indexed battleId,
        address agentA,
        address agentB,
        uint256 entryFee,
        uint256 bettingDeadline,
        bytes32 topicHash,
        string topic
    );
    event BetPlaced(bytes32 indexed battleId, address indexed bettor, uint8 side, uint256 amount);
    event RubricCommitted(bytes32 indexed battleId, bytes32 rubricHash);
    event ArgumentSubmitted(bytes32 indexed battleId, uint8 round, uint8 side, bytes32 contentHash);
    event BattleSettled(bytes32 indexed battleId, address indexed winner, uint256 totalPool);
    event BattleCancelled(bytes32 indexed battleId);
    event SchedulerUpdated(address indexed newScheduler);
    event HotTakeRoomsUpdated(address indexed addr);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyScheduler() {
        require(msg.sender == scheduler || msg.sender == owner(), "Not scheduler");
        _;
    }

    modifier battleExists(bytes32 _battleId) {
        require(battles[_battleId].agentA != address(0), "Battle not found");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _registry,
        address _treasury,
        address _platformTreasury,
        address _scheduler
    ) Ownable(msg.sender) {
        USDC             = IERC20(_usdc);
        registry         = AgentRegistry(_registry);
        treasury         = AgentTreasury(_treasury);
        platformTreasury = _platformTreasury;
        scheduler        = _scheduler;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function updateScheduler(address _scheduler) external onlyOwner {
        scheduler = _scheduler;
        emit SchedulerUpdated(_scheduler);
    }

    function updatePlatformTreasury(address _treasury) external onlyOwner {
        platformTreasury = _treasury;
    }

    function setHotTakeRooms(address _rooms) external onlyOwner {
        hotTakeRooms = _rooms;
        emit HotTakeRoomsUpdated(_rooms);
    }

    // ─── Battle creation ──────────────────────────────────────────────────────

    /**
     * @notice Create a battle via the scheduler (direct match / autonomous path).
     *         Entry fees pulled directly from each agent owner's wallet via the
     *         ERC-7715 spending permission they granted to this contract.
     *         Pass entryFee = 0 for fee-free battles.
     */
    function createBattle(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) external onlyScheduler {
        _validateAndCreate(
            _battleId, _agentA, _agentB, _entryFee,
            _bettingDuration, _roundDuration, _maxResearch, _topicHash, _topic, _categoryHash
        );
        if (_entryFee > 0) {
            USDC.safeTransferFrom(_agentA, address(this), _entryFee);
            USDC.safeTransferFrom(_agentB, address(this), _entryFee);
        }
    }

    /**
     * @notice Create a battle funded by HotTakeRooms escrow.
     *         USDC already transferred to this contract — no treasury deduction.
     */
    function createBattleFromRoom(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) external nonReentrant {
        require(msg.sender == hotTakeRooms, "Only HotTakeRooms");
        _validateAndCreate(
            _battleId, _agentA, _agentB, _entryFee,
            _bettingDuration, _roundDuration, _maxResearch, _topicHash, _topic, _categoryHash
        );
    }

    function _validateAndCreate(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) internal {
        require(battles[_battleId].agentA == address(0), "Battle ID already exists");
        require(_agentA != _agentB,                      "Cannot battle yourself");
        require(registry.agentExists_(_agentA),          "Agent A not registered");
        require(registry.agentExists_(_agentB),          "Agent B not registered");
        require(_bettingDuration >= MIN_BETTING_WINDOW,  "Betting window too short");
        require(_roundDuration   >= MIN_ROUND_DURATION,  "Round duration too short");
        require(bytes(_topic).length > 0,                 "Topic required");
        require(bytes(_topic).length <= MAX_TOPIC_LENGTH, "Topic too long");
        require(keccak256(abi.encode(_topic)) == _topicHash, "Topic hash mismatch");

        uint256 deadline = block.timestamp + _bettingDuration;

        battles[_battleId] = Battle({
            state:          BattleState.OPEN,
            agentA:         _agentA,
            agentB:         _agentB,
            winner:         address(0),
            entryFee:       _entryFee,
            fighterPoolA:   _entryFee,
            fighterPoolB:   _entryFee,
            spectatorPoolA: 0,
            spectatorPoolB: 0,
            bettingDeadline: deadline,
            roundDuration:  _roundDuration,
            totalRounds:    TOTAL_ROUNDS,
            rubricHash:     bytes32(0),
            maxResearch:    _maxResearch,
            topicHash:      _topicHash,
            topic:          _topic,
            categoryHash:   _categoryHash,
            rubricCommitted: false
        });

        emit BattleCreated(_battleId, _agentA, _agentB, _entryFee, deadline, _topicHash, _topic);
    }

    // ─── Autonomous entry ─────────────────────────────────────────────────────

    /**
     * @notice Autonomous agent joins an existing open battle.
     *         Pulls entry fee from the agent owner's wallet via their
     *         pre-granted ERC-7715 spending permission.
     */
    function autonomousEntry(
        bytes32 _battleId,
        address _agentOwner
    ) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN,         "Battle not open");
        require(block.timestamp < battle.bettingDeadline, "Betting window closed");

        (bool eligible, string memory reason) =
            registry.isAutonomousEligible(_agentOwner, battle.entryFee);
        require(eligible, reason);

        registry.recordAutonomousEntry(_agentOwner);
        if (battle.entryFee > 0) {
            USDC.safeTransferFrom(_agentOwner, address(this), battle.entryFee);
        }
    }

    // ─── Betting ──────────────────────────────────────────────────────────────

    /**
     * @notice Place a bet. Open to anyone during the betting window.
     */
    function placeBet(
        bytes32 _battleId,
        uint8   _side,
        uint256 _amount
    ) external nonReentrant battleExists(_battleId) {
        Battle storage battle = battles[_battleId];

        require(battle.state == BattleState.OPEN,         "Battle not open");
        require(block.timestamp < battle.bettingDeadline,  "Betting window closed");
        require(_side == 1 || _side == 2,                  "Invalid side");
        require(bets[_battleId][msg.sender].amount == 0,   "Already bet");
        require(_amount > 0,                               "Zero amount");

        USDC.safeTransferFrom(msg.sender, address(this), _amount);
        bets[_battleId][msg.sender] = Bet(_side, _amount);

        if (_side == 1) {
            battle.spectatorPoolA += _amount;
            _bettorsA[_battleId].push(msg.sender);
        } else {
            battle.spectatorPoolB += _amount;
            _bettorsB[_battleId].push(msg.sender);
        }

        emit BetPlaced(_battleId, msg.sender, _side, _amount);
    }

    /**
     * @notice Agent places a bet from its treasury. Scheduler calls on behalf of autonomous agents.
     */
    function agentPlaceBet(
        bytes32 _battleId,
        address _agentOwner,
        uint8   _side,
        uint256 _amount
    ) external onlyScheduler nonReentrant battleExists(_battleId) {
        Battle storage battle = battles[_battleId];

        require(battle.state == BattleState.OPEN,                         "Battle not open");
        require(block.timestamp < battle.bettingDeadline,                  "Betting window closed");
        require(_side == 1 || _side == 2,                                  "Invalid side");
        require(bets[_battleId][_agentOwner].amount == 0,                  "Already bet");
        require(_amount > 0,                                               "Zero amount");
        require(battle.agentA != _agentOwner && battle.agentB != _agentOwner,
                "Fighter cannot bet on own battle");

        treasury.authorizedSpend(
            _agentOwner, _amount, address(this),
            AgentTreasury.SpendPurpose.BET, _battleId, 0
        );
        bets[_battleId][_agentOwner] = Bet(_side, _amount);

        if (_side == 1) {
            battle.spectatorPoolA += _amount;
            _bettorsA[_battleId].push(_agentOwner);
        } else {
            battle.spectatorPoolB += _amount;
            _bettorsB[_battleId].push(_agentOwner);
        }

        emit BetPlaced(_battleId, _agentOwner, _side, _amount);
    }

    // ─── Rubric commitment ────────────────────────────────────────────────────

    /**
     * @notice Lock the judge's scoring rubric. Call any time during the betting window.
     *         The preimage is revealed at settlement — preventing post-creation manipulation.
     */
    function commitRubric(
        bytes32 _battleId,
        bytes32 _rubricHash
    ) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(!battle.rubricCommitted,           "Rubric already committed");

        battle.rubricHash      = _rubricHash;
        battle.rubricCommitted = true;

        emit RubricCommitted(_battleId, _rubricHash);
    }

    // ─── Argument submission ──────────────────────────────────────────────────

    /**
     * @notice Submit an agent's argument for the current round.
     *         The round is derived from block.timestamp — no manual startBattle or
     *         advanceRound calls needed. The backend just calls this when Venice AI
     *         produces an argument and the correct round window is active.
     *
     * @param _side        1 = agentA, 2 = agentB
     * @param _contentHash IPFS CID of the argument text
     */
    function submitArgument(
        bytes32 _battleId,
        uint8   _side,
        bytes32 _contentHash
    ) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN,          "Battle not open");
        require(block.timestamp >= battle.bettingDeadline, "Betting window still open");
        require(_side == 1 || _side == 2,                  "Invalid side");

        uint8 round = _currentRound(battle);
        require(round >= 1 && round <= battle.totalRounds, "No active round");
        require(!argSubmitted[_battleId][round][_side],    "Argument already submitted");

        arguments[_battleId][round][_side]  = _contentHash;
        argSubmitted[_battleId][round][_side] = true;

        emit ArgumentSubmitted(_battleId, round, _side, _contentHash);
    }

    // ─── Settlement ───────────────────────────────────────────────────────────

    /**
     * @notice Settle after all rounds complete. Verifies rubric, distributes payouts.
     *         Callable only after bettingDeadline + totalRounds * roundDuration has passed.
     *
     * @param _winnerSide     1 = agentA won, 2 = agentB won
     * @param _rubricPreimage keccak256(judgeSystemPrompt) — verified against committed hash
     * @param _judgeScore     Score × 100 (e.g. 875 = 8.75/10)
     */
    function settleBattle(
        bytes32 _battleId,
        uint8   _winnerSide,
        bytes32 _rubricPreimage,
        uint256 _judgeScore
    ) external onlyScheduler nonReentrant battleExists(_battleId) {
        Battle storage battle = battles[_battleId];

        require(battle.state == BattleState.OPEN,    "Battle not open");
        require(_winnerSide == 1 || _winnerSide == 2, "Invalid winner side");
        require(
            block.timestamp >= battle.bettingDeadline + uint256(battle.totalRounds) * battle.roundDuration,
            "Rounds not complete yet"
        );
        require(
            keccak256(abi.encode(_rubricPreimage)) == battle.rubricHash,
            "Rubric preimage mismatch"
        );

        battle.state  = BattleState.SETTLED;
        battle.winner = _winnerSide == 1 ? battle.agentA : battle.agentB;

        // ── Fighter pool ───────────────────────────────────────────────────
        uint256 fighterPool     = battle.fighterPoolA + battle.fighterPoolB;
        uint256 fighterPlatform = (fighterPool * PLATFORM_FEE_BPS)  / BPS_DENOMINATOR;
        uint256 fighterWinner   = (fighterPool * WINNER_FIGHTER_BPS) / BPS_DENOMINATOR;
        uint256 fighterToSpect  = fighterPool - fighterPlatform - fighterWinner;

        USDC.safeTransfer(platformTreasury, fighterPlatform);
        // Winnings go directly to the winner's wallet — no treasury hop needed.
        USDC.safeTransfer(battle.winner, fighterWinner);

        // ── Spectator pool ─────────────────────────────────────────────────
        uint256 totalSpectPool = battle.spectatorPoolA + battle.spectatorPoolB + fighterToSpect;
        uint256 spectPlatform  = (totalSpectPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 spectPrize     = totalSpectPool - spectPlatform;

        if (spectPlatform > 0) {
            USDC.safeTransfer(platformTreasury, spectPlatform);
        }

        uint256        winningSpectPool;
        address[] storage winningBettors;

        if (_winnerSide == 1) {
            winningSpectPool = battle.spectatorPoolA;
            winningBettors   = _bettorsA[_battleId];
        } else {
            winningSpectPool = battle.spectatorPoolB;
            winningBettors   = _bettorsB[_battleId];
        }

        if (winningSpectPool > 0 && winningBettors.length > 0) {
            for (uint256 i = 0; i < winningBettors.length; i++) {
                address bettor = winningBettors[i];
                uint256 stake  = bets[_battleId][bettor].amount;
                if (stake == 0) continue;
                _payBettor(bettor, (stake * spectPrize) / winningSpectPool);
            }
        } else if (winningSpectPool == 0 && spectPrize > 0) {
            USDC.safeTransfer(platformTreasury, spectPrize);
        }

        registry.updateReputation(battle.agentA, _winnerSide == 1, _judgeScore, fighterWinner);
        registry.updateReputation(battle.agentB, _winnerSide == 2, _judgeScore, 0);

        emit BattleSettled(_battleId, battle.winner, fighterPool + totalSpectPool);
    }

    /**
     * @notice Cancel a battle and refund all participants.
     */
    function cancelBattle(bytes32 _battleId)
        external onlyScheduler nonReentrant battleExists(_battleId)
    {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Cannot cancel settled battle");

        battle.state = BattleState.CANCELLED;

        // Return entry fees directly to each agent's wallet.
        USDC.safeTransfer(battle.agentA, battle.fighterPoolA);
        USDC.safeTransfer(battle.agentB, battle.fighterPoolB);

        _refundBettors(_battleId, _bettorsA[_battleId]);
        _refundBettors(_battleId, _bettorsB[_battleId]);

        emit BattleCancelled(_battleId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBattle(bytes32 _battleId)
        external view returns (Battle memory)
    {
        return battles[_battleId];
    }

    /**
     * @notice Current phase of a battle based on block.timestamp.
     * @return phase  0 = betting open, 1-3 = round number, 4 = all rounds complete
     */
    function getBattlePhase(bytes32 _battleId) external view battleExists(_battleId) returns (uint8 phase) {
        Battle memory battle = battles[_battleId];
        if (battle.state != BattleState.OPEN)             return 255; // settled or cancelled
        if (block.timestamp < battle.bettingDeadline)     return 0;   // betting window
        uint8 round = _currentRound(battle);
        if (round > battle.totalRounds)                   return 4;   // all rounds done
        return round;
    }

    /**
     * @notice How many seconds remain in the current phase (betting or active round).
     *         Returns 0 if the phase has already passed.
     */
    function getPhaseTimeRemaining(bytes32 _battleId) external view battleExists(_battleId) returns (uint256) {
        Battle memory battle = battles[_battleId];
        if (battle.state != BattleState.OPEN) return 0;

        if (block.timestamp < battle.bettingDeadline) {
            return battle.bettingDeadline - block.timestamp;
        }

        uint256 roundEnd = battle.bettingDeadline +
            uint256(_currentRound(battle)) * battle.roundDuration;

        if (block.timestamp >= roundEnd) return 0;
        return roundEnd - block.timestamp;
    }

    function getTotalPool(bytes32 _battleId) external view returns (uint256) {
        Battle memory b = battles[_battleId];
        return b.fighterPoolA + b.fighterPoolB + b.spectatorPoolA + b.spectatorPoolB;
    }

    function getUserBet(bytes32 _battleId, address _bettor)
        external view returns (uint8 side, uint256 amount)
    {
        Bet memory b = bets[_battleId][_bettor];
        return (b.side, b.amount);
    }

    function getBettorCount(bytes32 _battleId)
        external view returns (uint256 sideA, uint256 sideB)
    {
        return (_bettorsA[_battleId].length, _bettorsB[_battleId].length);
    }

    function getArgument(bytes32 _battleId, uint8 _round, uint8 _side)
        external view returns (bytes32 contentHash, bool submitted)
    {
        return (
            arguments[_battleId][_round][_side],
            argSubmitted[_battleId][_round][_side]
        );
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Derive the active round number from block.timestamp.
     *      Returns 1-3 during the argument phase, or >totalRounds when complete.
     *      Assumes block.timestamp >= bettingDeadline (caller must check).
     */
    function _currentRound(Battle memory battle) internal view returns (uint8) {
        uint256 elapsed = block.timestamp - battle.bettingDeadline;
        uint8 round = uint8(elapsed / battle.roundDuration) + 1;
        return round;
    }

    function _payBettor(address _bettor, uint256 _amount) internal {
        if (_amount == 0) return;
        USDC.safeTransfer(_bettor, _amount);
    }

    function _refundBettors(bytes32 _battleId, address[] storage _bettors) internal {
        for (uint256 i = 0; i < _bettors.length; i++) {
            address bettor = _bettors[i];
            uint256 amount = bets[_battleId][bettor].amount;
            if (amount > 0) {
                bets[_battleId][bettor].amount = 0;
                _payBettor(bettor, amount);
            }
        }
    }
}

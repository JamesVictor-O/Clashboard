// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AgentRegistry.sol";

/**
 * @title ClashboardArena
 * @notice Core battle engine. A scheduler drives debate phases after betting closes.
 *
 * Timeline:
 *
 *   [creation]──── bettingDeadline ── closeBetting ── startDebate ── rounds ── judge ── settle
 *
 *   BattlePhase mapping:
 *   0 = BETTING       : spectators can bet until bettingDeadline
 *   1 = PREPARING     : agents research/generate off-chain arguments
 *   2 = ROUND_1       : active argument round
 *   3 = ROUND_2       : active argument round
 *   4 = ROUND_3       : optional final argument round
 *   5 = JUDGING_READY : backend can ask Venice to judge
 *   6 = SETTLED       : winner recorded and payouts distributed
 *   7 = CANCELLED     : battle refunded/cancelled
 *   8 = EXPIRED       : preparation timed out and battle was refunded
 *
 * Backend only needs to:
 *   1. commitRubric()     — lock judge criteria
 *   2. closeBetting()     — move into preparation after bettingDeadline
 *   3. startDebate()      — start round 1 once research/arguments are ready
 *   4. submitArgument()   — Venice AI generates arg → IPFS → hash on-chain
 *   5. advanceRound()     — move to the next round or judging
 *   6. settleBattle()     — Venice AI judges all args → picks winner
 *
 * Reward distribution:
 *   Fighter pool  : 70% winner | 5% platform | 25% → spectator prize pot
 *   Spectator pool: winning bettors split pro-rata; platform takes 5%
 */
contract ClashboardArena is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    IERC20 public immutable USDC;
    AgentRegistry public immutable registry;
    address public platformTreasury;
    address public hotTakeRooms;

    enum BattleState {
        OPEN,
        SETTLED,
        CANCELLED
    }
    enum BattlePhase {
        BETTING,
        PREPARING,
        ROUND_1,
        ROUND_2,
        ROUND_3,
        JUDGING_READY,
        SETTLED,
        CANCELLED,
        EXPIRED
    }

    struct Battle {
        BattleState state;
        address agentA;
        address agentB;
        address winner;
        uint256 entryFee;
        uint256 fighterPoolA;
        uint256 fighterPoolB;
        uint256 spectatorPoolA;
        uint256 spectatorPoolB;
        uint256 bettingDeadline; // betting closes here; debate does not auto-start
        uint256 roundDuration; // seconds per round
        uint8 totalRounds; // 2 for hackathon default, 3 optional
        BattlePhase phase;
        uint8 currentRound;
        uint256 debateStartedAt;
        uint256 currentRoundStartedAt;
        uint256 currentRoundDeadline;
        uint256 prepareDeadline;
        bytes32 rubricHash;
        uint256 maxResearch;
        bytes32 topicHash;
        string topic;
        bytes32 categoryHash;
        bool rubricCommitted;
    }

    struct Bet {
        uint8 side; // 1 = agentA, 2 = agentB
        uint256 amount;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Battle) public battles;
    mapping(bytes32 => mapping(address => Bet)) public bets;
    mapping(bytes32 => address[]) private _bettorsA;
    mapping(bytes32 => address[]) private _bettorsB;

    // battleId → round (1-3) → side (1=A, 2=B) → IPFS argument content hash
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bytes32))) public arguments;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bool))) public argSubmitted;
    mapping(bytes32 => mapping(uint8 => mapping(uint8 => bool))) public argMissed;

    address public scheduler;
    uint256 public accountedBalance;

    uint256 public constant PLATFORM_FEE_BPS = 500; // 5%
    uint256 public constant WINNER_FIGHTER_BPS = 7000; // 70%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_BETTING_WINDOW = 120; // 2 minutes
    uint256 public constant MIN_ROUND_DURATION = 30; // 30 seconds
    uint256 public constant MAX_TOPIC_LENGTH = 280; // bytes; enough for a hot take
    uint256 public constant MAX_BETTORS_PER_SIDE = 50; // settlement loops are bounded
    uint256 public constant MAX_PREPARE_DURATION = 30 minutes;
    uint8 public constant HACKATHON_TOTAL_ROUNDS = 2;

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
    event BettingClosed(bytes32 indexed battleId, uint256 prepareDeadline);
    event DebateStarted(bytes32 indexed battleId, uint8 round, uint256 roundDeadline);
    event ArgumentSubmitted(bytes32 indexed battleId, uint8 round, uint8 side, bytes32 contentHash);
    event ArgumentMissed(bytes32 indexed battleId, uint8 round, uint8 side);
    event RoundAdvanced(bytes32 indexed battleId, uint8 round, uint256 roundDeadline);
    event JudgingReady(bytes32 indexed battleId);
    event BattleExpired(bytes32 indexed battleId);
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

    constructor(address _usdc, address _registry, address _treasury, address _platformTreasury, address _scheduler)
        Ownable(msg.sender)
    {
        USDC = IERC20(_usdc);
        registry = AgentRegistry(_registry);
        // _treasury is kept in the constructor for deployment compatibility only.
        // ClashboardArena no longer depends on AgentTreasury for battle entries,
        // delegated bets, refunds, or payouts.
        _treasury;
        platformTreasury = _platformTreasury;
        scheduler = _scheduler;
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
        _createBattleWithRounds(
            _battleId,
            _agentA,
            _agentB,
            _entryFee,
            _bettingDuration,
            _roundDuration,
            HACKATHON_TOTAL_ROUNDS,
            _maxResearch,
            _topicHash,
            _topic,
            _categoryHash
        );
    }

    function createBattle(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint8 _totalRounds,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) external onlyScheduler {
        _createBattleWithRounds(
            _battleId,
            _agentA,
            _agentB,
            _entryFee,
            _bettingDuration,
            _roundDuration,
            _totalRounds,
            _maxResearch,
            _topicHash,
            _topic,
            _categoryHash
        );
    }

    function _createBattleWithRounds(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint8 _totalRounds,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) internal {
        _validateAndCreate(
            _battleId,
            _agentA,
            _agentB,
            _entryFee,
            _bettingDuration,
            _roundDuration,
            _totalRounds,
            _maxResearch,
            _topicHash,
            _topic,
            _categoryHash
        );
        if (_entryFee > 0) {
            USDC.safeTransferFrom(_agentA, address(this), _entryFee);
            USDC.safeTransferFrom(_agentB, address(this), _entryFee);
            _recordAccountedUSDC(_entryFee * 2);
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
            _battleId,
            _agentA,
            _agentB,
            _entryFee,
            _bettingDuration,
            _roundDuration,
            HACKATHON_TOTAL_ROUNDS,
            _maxResearch,
            _topicHash,
            _topic,
            _categoryHash
        );
        _consumePrefundedUSDC(_entryFee * 2);
    }

    function createBattleFromRoom(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint8 _totalRounds,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) external nonReentrant {
        require(msg.sender == hotTakeRooms, "Only HotTakeRooms");
        _validateAndCreate(
            _battleId,
            _agentA,
            _agentB,
            _entryFee,
            _bettingDuration,
            _roundDuration,
            _totalRounds,
            _maxResearch,
            _topicHash,
            _topic,
            _categoryHash
        );
        _consumePrefundedUSDC(_entryFee * 2);
    }

    function _validateAndCreate(
        bytes32 _battleId,
        address _agentA,
        address _agentB,
        uint256 _entryFee,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint8 _totalRounds,
        uint256 _maxResearch,
        bytes32 _topicHash,
        string calldata _topic,
        bytes32 _categoryHash
    ) internal {
        require(battles[_battleId].agentA == address(0), "Battle ID already exists");
        require(_agentA != _agentB, "Cannot battle yourself");
        require(registry.agentExists_(_agentA), "Agent A not registered");
        require(registry.agentExists_(_agentB), "Agent B not registered");
        require(_bettingDuration >= MIN_BETTING_WINDOW, "Betting window too short");
        require(_roundDuration >= MIN_ROUND_DURATION, "Round duration too short");
        require(_totalRounds == 2 || _totalRounds == 3, "Invalid rounds");
        require(bytes(_topic).length > 0, "Topic required");
        require(bytes(_topic).length <= MAX_TOPIC_LENGTH, "Topic too long");
        require(keccak256(abi.encode(_topic)) == _topicHash, "Topic hash mismatch");

        uint256 deadline = block.timestamp + _bettingDuration;

        battles[_battleId] = Battle({
            state: BattleState.OPEN,
            agentA: _agentA,
            agentB: _agentB,
            winner: address(0),
            entryFee: _entryFee,
            fighterPoolA: _entryFee,
            fighterPoolB: _entryFee,
            spectatorPoolA: 0,
            spectatorPoolB: 0,
            bettingDeadline: deadline,
            roundDuration: _roundDuration,
            totalRounds: _totalRounds,
            phase: BattlePhase.BETTING,
            currentRound: 0,
            debateStartedAt: 0,
            currentRoundStartedAt: 0,
            currentRoundDeadline: 0,
            prepareDeadline: 0,
            rubricHash: bytes32(0),
            maxResearch: _maxResearch,
            topicHash: _topicHash,
            topic: _topic,
            categoryHash: _categoryHash,
            rubricCommitted: false
        });

        emit BattleCreated(_battleId, _agentA, _agentB, _entryFee, deadline, _topicHash, _topic);
    }

    // ─── Autonomous entry ─────────────────────────────────────────────────────

    /**
     * @notice Autonomous agent joins an existing open battle.
     *         Pulls entry fee from the agent owner's wallet via their
     *         pre-granted ERC-7715 spending permission.
     *
     * @dev Budget/category/daily-limit checks are enforced off-chain in the
     *      TypeScript policy engine (lib/autonomy/policy.ts) before 1Shot is
     *      called. The contract only verifies the agent is registered.
     */
    function autonomousEntry(bytes32 _battleId, address _agentOwner) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(_isBettingOpen(battle), "Betting window closed");
        require(registry.agentExists_(_agentOwner), "Agent not registered");

        if (battle.entryFee > 0) _consumePrefundedUSDC(battle.entryFee);
    }

    // ─── Betting ──────────────────────────────────────────────────────────────

    /**
     * @notice Place a bet. Open to anyone during the betting window.
     */
    function placeBet(bytes32 _battleId, uint8 _side, uint256 _amount) external nonReentrant battleExists(_battleId) {
        _placeBet(_battleId, msg.sender, _side, _amount, false, false);
    }

    /**
     * @notice Place a delegated bet for a bettor. Intended for 1Shot bundles:
     *         call 1: USDC.transfer(ClashboardArena, amount)
     *         call 2: ClashboardArena.placeBetFor(bettor, battleId, side, amount)
     */
    function placeBetFor(address _bettor, bytes32 _battleId, uint8 _side, uint256 _amount)
        external
        onlyScheduler
        nonReentrant
        battleExists(_battleId)
    {
        _placeBet(_battleId, _bettor, _side, _amount, true, true);
    }

    /**
     * @notice Deprecated. Use placeBetFor() with ERC-7715/1Shot prefund bundles.
     */
    function agentPlaceBet(bytes32 _battleId, address _agentOwner, uint8 _side, uint256 _amount)
        external
        onlyScheduler
        nonReentrant
        battleExists(_battleId)
    {
        _placeBet(_battleId, _agentOwner, _side, _amount, true, true);
    }

    function _placeBet(
        bytes32 _battleId,
        address _bettor,
        uint8 _side,
        uint256 _amount,
        bool _rejectFighter,
        bool _prefunded
    ) internal {
        Battle storage battle = battles[_battleId];

        require(battle.state == BattleState.OPEN, "Battle not open");
        require(_isBettingOpen(battle), "Betting window closed");
        require(_side == 1 || _side == 2, "Invalid side");
        require(bets[_battleId][_bettor].amount == 0, "Already bet");
        require(_amount > 0, "Zero amount");
        if (_rejectFighter) {
            require(battle.agentA != _bettor && battle.agentB != _bettor, "Fighter cannot bet on own battle");
        }

        if (_prefunded) {
            _consumePrefundedUSDC(_amount);
        } else {
            USDC.safeTransferFrom(_bettor, address(this), _amount);
            _recordAccountedUSDC(_amount);
        }
        bets[_battleId][_bettor] = Bet(_side, _amount);

        if (_side == 1) {
            require(_bettorsA[_battleId].length < MAX_BETTORS_PER_SIDE, "Side A full");
            battle.spectatorPoolA += _amount;
            _bettorsA[_battleId].push(_bettor);
        } else {
            require(_bettorsB[_battleId].length < MAX_BETTORS_PER_SIDE, "Side B full");
            battle.spectatorPoolB += _amount;
            _bettorsB[_battleId].push(_bettor);
        }

        emit BetPlaced(_battleId, _bettor, _side, _amount);
    }

    // ─── Rubric commitment ────────────────────────────────────────────────────

    /**
     * @notice Lock the judge's scoring rubric. Call any time during the betting window.
     *         The preimage is revealed at settlement — preventing post-creation manipulation.
     */
    function commitRubric(bytes32 _battleId, bytes32 _rubricHash) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(!battle.rubricCommitted, "Rubric already committed");

        battle.rubricHash = _rubricHash;
        battle.rubricCommitted = true;

        emit RubricCommitted(_battleId, _rubricHash);
    }

    // ─── Phase orchestration ─────────────────────────────────────────────────

    function closeBetting(bytes32 _battleId) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(battle.phase == BattlePhase.BETTING, "Not betting");
        require(block.timestamp >= battle.bettingDeadline, "Betting still open");

        battle.phase = BattlePhase.PREPARING;
        battle.prepareDeadline = block.timestamp + MAX_PREPARE_DURATION;

        emit BettingClosed(_battleId, battle.prepareDeadline);
    }

    function startDebate(bytes32 _battleId) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(battle.phase == BattlePhase.PREPARING, "Not preparing");
        require(battle.rubricCommitted, "Rubric not committed");

        battle.phase = BattlePhase.ROUND_1;
        battle.currentRound = 1;
        battle.debateStartedAt = block.timestamp;
        battle.currentRoundStartedAt = block.timestamp;
        battle.currentRoundDeadline = block.timestamp + battle.roundDuration;

        emit DebateStarted(_battleId, 1, battle.currentRoundDeadline);
        emit RoundAdvanced(_battleId, 1, battle.currentRoundDeadline);
    }

    function advanceRound(bytes32 _battleId) external onlyScheduler battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(_isRoundPhase(battle.phase), "No active round");
        require(battle.currentRound >= 1 && battle.currentRound <= battle.totalRounds, "Invalid round");

        uint8 round = battle.currentRound;
        bool sideAReady = argSubmitted[_battleId][round][1];
        bool sideBReady = argSubmitted[_battleId][round][2];
        require((sideAReady && sideBReady) || block.timestamp > battle.currentRoundDeadline, "Round still active");

        if (!sideAReady) _markArgumentMissed(_battleId, round, 1);
        if (!sideBReady) _markArgumentMissed(_battleId, round, 2);

        if (round >= battle.totalRounds) {
            battle.phase = BattlePhase.JUDGING_READY;
            battle.currentRoundStartedAt = 0;
            battle.currentRoundDeadline = 0;
            emit JudgingReady(_battleId);
            return;
        }

        uint8 nextRound = round + 1;
        battle.currentRound = nextRound;
        battle.phase = _roundPhase(nextRound);
        battle.currentRoundStartedAt = block.timestamp;
        battle.currentRoundDeadline = block.timestamp + battle.roundDuration;

        emit RoundAdvanced(_battleId, nextRound, battle.currentRoundDeadline);
    }

    function expirePreparation(bytes32 _battleId) external onlyScheduler nonReentrant battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(battle.phase == BattlePhase.PREPARING, "Not preparing");
        require(battle.prepareDeadline > 0 && block.timestamp > battle.prepareDeadline, "Preparation active");

        _refundOpenBattle(_battleId, battle, BattlePhase.EXPIRED);
        emit BattleExpired(_battleId);
    }

    // ─── Argument submission ──────────────────────────────────────────────────

    /**
     * @notice Submit an agent's argument for the current round.
     *         The round is stored by the scheduler-driven phase machine, so x402
     *         research and Venice generation cannot be skipped by wall-clock drift.
     *
     * @param _side        1 = agentA, 2 = agentB
     * @param _contentHash IPFS CID of the argument text
     */
    function submitArgument(bytes32 _battleId, uint8 _side, bytes32 _contentHash)
        external
        onlyScheduler
        battleExists(_battleId)
    {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Battle not open");
        require(_side == 1 || _side == 2, "Invalid side");

        require(_isRoundPhase(battle.phase), "No active round");
        uint8 round = battle.currentRound;
        require(round <= battle.totalRounds, "No active round");
        require(!argSubmitted[_battleId][round][_side], "Argument already submitted");

        arguments[_battleId][round][_side] = _contentHash;
        argSubmitted[_battleId][round][_side] = true;

        emit ArgumentSubmitted(_battleId, round, _side, _contentHash);
    }

    // ─── Settlement ───────────────────────────────────────────────────────────

    /**
     * @notice Settle after all rounds complete. Verifies rubric, distributes payouts.
     *         Callable only after the scheduler has advanced every configured round.
     *
     * @param _winnerSide     1 = agentA won, 2 = agentB won
     * @param _rubricPreimage keccak256(judgeSystemPrompt) — verified against committed hash
     * @param _judgeScore     Score × 100 (e.g. 875 = 8.75/10)
     */
    function settleBattle(bytes32 _battleId, uint8 _winnerSide, bytes32 _rubricPreimage, uint256 _judgeScore)
        external
        onlyScheduler
        nonReentrant
        battleExists(_battleId)
    {
        Battle storage battle = battles[_battleId];

        require(battle.state == BattleState.OPEN, "Battle not open");
        require(_winnerSide == 1 || _winnerSide == 2, "Invalid winner side");
        require(battle.phase == BattlePhase.JUDGING_READY, "Judging not ready");
        require(keccak256(abi.encode(_rubricPreimage)) == battle.rubricHash, "Rubric preimage mismatch");
        require(_requiredArgumentsSubmitted(_battleId, battle), "Arguments incomplete");

        battle.state = BattleState.SETTLED;
        battle.phase = BattlePhase.SETTLED;
        battle.winner = _winnerSide == 1 ? battle.agentA : battle.agentB;

        // ── Fighter pool ───────────────────────────────────────────────────
        uint256 fighterPool = battle.fighterPoolA + battle.fighterPoolB;
        uint256 fighterPlatform = (fighterPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 fighterWinner = (fighterPool * WINNER_FIGHTER_BPS) / BPS_DENOMINATOR;
        uint256 fighterToSpect = fighterPool - fighterPlatform - fighterWinner;

        _sendAccountedUSDC(platformTreasury, fighterPlatform);
        // Winnings go directly to the winner's wallet — no treasury hop needed.
        _sendAccountedUSDC(battle.winner, fighterWinner);

        // ── Spectator pool ─────────────────────────────────────────────────
        uint256 totalSpectPool = battle.spectatorPoolA + battle.spectatorPoolB + fighterToSpect;
        uint256 spectPlatform = (totalSpectPool * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 spectPrize = totalSpectPool - spectPlatform;

        if (spectPlatform > 0) {
            _sendAccountedUSDC(platformTreasury, spectPlatform);
        }

        uint256 winningSpectPool;
        address[] storage winningBettors;

        if (_winnerSide == 1) {
            winningSpectPool = battle.spectatorPoolA;
            winningBettors = _bettorsA[_battleId];
        } else {
            winningSpectPool = battle.spectatorPoolB;
            winningBettors = _bettorsB[_battleId];
        }

        if (winningSpectPool > 0 && winningBettors.length > 0) {
            for (uint256 i = 0; i < winningBettors.length; i++) {
                address bettor = winningBettors[i];
                uint256 stake = bets[_battleId][bettor].amount;
                if (stake == 0) continue;
                _payBettor(bettor, (stake * spectPrize) / winningSpectPool);
            }
        } else if (winningSpectPool == 0 && spectPrize > 0) {
            _sendAccountedUSDC(platformTreasury, spectPrize);
        }

        registry.updateReputation(battle.agentA, _winnerSide == 1, _judgeScore, fighterWinner);
        registry.updateReputation(battle.agentB, _winnerSide == 2, _judgeScore, 0);

        emit BattleSettled(_battleId, battle.winner, fighterPool + totalSpectPool);
    }

    /**
     * @notice Cancel a battle and refund all participants.
     */
    function cancelBattle(bytes32 _battleId) external onlyScheduler nonReentrant battleExists(_battleId) {
        Battle storage battle = battles[_battleId];
        require(battle.state == BattleState.OPEN, "Cannot cancel settled battle");

        _refundOpenBattle(_battleId, battle, BattlePhase.CANCELLED);

        emit BattleCancelled(_battleId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBattle(bytes32 _battleId) external view returns (Battle memory) {
        return battles[_battleId];
    }

    /**
     * @notice Current phase of a scheduler-driven battle.
     * @return phase BattlePhase enum encoded as uint8 for ABI/frontend compatibility:
     *         0 BETTING, 1 PREPARING, 2 ROUND_1, 3 ROUND_2, 4 ROUND_3,
     *         5 JUDGING_READY, 6 SETTLED, 7 CANCELLED, 8 EXPIRED.
     */
    function getBattlePhase(bytes32 _battleId) public view battleExists(_battleId) returns (BattlePhase phase) {
        Battle memory battle = battles[_battleId];
        if (battle.state == BattleState.SETTLED) return BattlePhase.SETTLED;
        if (battle.state == BattleState.CANCELLED) return battle.phase;
        return battle.phase;
    }

    /**
     * @notice How many seconds remain in the current phase (betting or active round).
     *         Returns 0 if the phase has already passed.
     */
    function getPhaseTimeRemaining(bytes32 _battleId) external view battleExists(_battleId) returns (uint256) {
        Battle memory battle = battles[_battleId];
        if (battle.state != BattleState.OPEN) return 0;

        BattlePhase phase = getBattlePhase(_battleId);

        if (phase == BattlePhase.BETTING && block.timestamp < battle.bettingDeadline) {
            return battle.bettingDeadline - block.timestamp;
        }

        if (phase == BattlePhase.PREPARING && block.timestamp < battle.prepareDeadline) {
            return battle.prepareDeadline - block.timestamp;
        }

        if (_isRoundPhase(phase) && block.timestamp < battle.currentRoundDeadline) {
            return battle.currentRoundDeadline - block.timestamp;
        }
        return 0;
    }

    function isBettingOpen(bytes32 _battleId) external view battleExists(_battleId) returns (bool) {
        return _isBettingOpen(battles[_battleId]);
    }

    function isJudgingReady(bytes32 _battleId) public view battleExists(_battleId) returns (bool) {
        Battle memory battle = battles[_battleId];
        return battle.state == BattleState.OPEN && battle.phase == BattlePhase.JUDGING_READY;
    }

    function getCurrentRound(bytes32 _battleId) external view battleExists(_battleId) returns (uint8) {
        return battles[_battleId].currentRound;
    }

    function getTotalPool(bytes32 _battleId) external view returns (uint256) {
        Battle memory b = battles[_battleId];
        return b.fighterPoolA + b.fighterPoolB + b.spectatorPoolA + b.spectatorPoolB;
    }

    function getUserBet(bytes32 _battleId, address _bettor) external view returns (uint8 side, uint256 amount) {
        Bet memory b = bets[_battleId][_bettor];
        return (b.side, b.amount);
    }

    function getBettorCount(bytes32 _battleId) external view returns (uint256 sideA, uint256 sideB) {
        return (_bettorsA[_battleId].length, _bettorsB[_battleId].length);
    }

    function getArgument(bytes32 _battleId, uint8 _round, uint8 _side)
        external
        view
        returns (bytes32 contentHash, bool submitted)
    {
        require(_round >= 1 && _round <= 3, "Invalid round");
        require(_side == 1 || _side == 2, "Invalid side");
        return (arguments[_battleId][_round][_side], argSubmitted[_battleId][_round][_side]);
    }

    function getArgumentStatus(bytes32 _battleId, uint8 _round, uint8 _side)
        external
        view
        returns (bytes32 contentHash, bool submitted, bool missed)
    {
        require(_round >= 1 && _round <= 3, "Invalid round");
        require(_side == 1 || _side == 2, "Invalid side");
        return (
            arguments[_battleId][_round][_side],
            argSubmitted[_battleId][_round][_side],
            argMissed[_battleId][_round][_side]
        );
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _isBettingOpen(Battle memory battle) internal view returns (bool) {
        return battle.state == BattleState.OPEN && battle.phase == BattlePhase.BETTING
            && block.timestamp < battle.bettingDeadline;
    }

    function _isRoundPhase(BattlePhase _phase) internal pure returns (bool) {
        return _phase == BattlePhase.ROUND_1 || _phase == BattlePhase.ROUND_2 || _phase == BattlePhase.ROUND_3;
    }

    function _phaseRound(BattlePhase _phase) internal pure returns (uint8) {
        if (_phase == BattlePhase.ROUND_1) return 1;
        if (_phase == BattlePhase.ROUND_2) return 2;
        if (_phase == BattlePhase.ROUND_3) return 3;
        return 0;
    }

    function _roundPhase(uint8 _round) internal pure returns (BattlePhase) {
        if (_round == 1) return BattlePhase.ROUND_1;
        if (_round == 2) return BattlePhase.ROUND_2;
        if (_round == 3) return BattlePhase.ROUND_3;
        revert("Invalid round");
    }

    function _markArgumentMissed(bytes32 _battleId, uint8 _round, uint8 _side) internal {
        argSubmitted[_battleId][_round][_side] = true;
        argMissed[_battleId][_round][_side] = true;
        emit ArgumentMissed(_battleId, _round, _side);
    }

    function _requiredArgumentsSubmitted(bytes32 _battleId, Battle memory battle) internal view returns (bool) {
        for (uint8 round = 1; round <= battle.totalRounds; round++) {
            if (!argSubmitted[_battleId][round][1]) return false;
            if (!argSubmitted[_battleId][round][2]) return false;
        }
        return true;
    }

    function _refundOpenBattle(bytes32 _battleId, Battle storage battle, BattlePhase _phase) internal {
        battle.state = BattleState.CANCELLED;
        battle.phase = _phase;

        // Return entry fees directly to each agent's wallet.
        _sendAccountedUSDC(battle.agentA, battle.fighterPoolA);
        _sendAccountedUSDC(battle.agentB, battle.fighterPoolB);

        _refundBettors(_battleId, _bettorsA[_battleId]);
        _refundBettors(_battleId, _bettorsB[_battleId]);
    }

    function _payBettor(address _bettor, uint256 _amount) internal {
        if (_amount == 0) return;
        _sendAccountedUSDC(_bettor, _amount);
    }

    function _consumePrefundedUSDC(uint256 _amount) internal {
        if (_amount == 0) return;
        uint256 available = USDC.balanceOf(address(this)) - accountedBalance;
        require(available >= _amount, "Missing prefund");
        accountedBalance += _amount;
    }

    function _recordAccountedUSDC(uint256 _amount) internal {
        accountedBalance += _amount;
    }

    function _sendAccountedUSDC(address _to, uint256 _amount) internal {
        if (_amount == 0) return;
        require(accountedBalance >= _amount, "Accounted underflow");
        accountedBalance -= _amount;
        USDC.safeTransfer(_to, _amount);
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

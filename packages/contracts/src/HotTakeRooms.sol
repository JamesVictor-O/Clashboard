// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AgentRegistry.sol";
import "./AgentTreasury.sol";
import "./ClashboardArena.sol";

/**
 * @title HotTakeRooms
 * @notice 1v1 challenge escrow. Issue a hot take, lock a stake,
 *         wait for a challenger. Once accepted, battle is created in Arena.
 *
 * @dev Two execution paths coexist:
 *
 *      DIRECT (user signs tx):
 *        issueChallenge(...)   — msg.sender must have agent; USDC from msg.sender's wallet
 *        acceptChallenge(...)  — msg.sender must have agent; USDC from msg.sender's wallet
 *
 *      DELEGATED (autonomous / 1Shot, no wallet popup):
 *        issueChallengeFor(agentOwner, ...)  — caller must be authorized executor;
 *        acceptChallengeFor(agentOwner, ...) —   USDC prefunded by the 1Shot bundle
 *
 *      ERC-7715 wallet-level spending model:
 *        The delegated path does NOT require a pre-funded AgentTreasury.
 *        Instead, the 1Shot bundle includes a USDC.transfer call executed from the
 *        user's smart account (via ERC-7710 delegation), followed by the challenge
 *        call. This mirrors exactly how placeBet works autonomously:
 *
 *          bundle call 1: USDC.transfer(hotTakeRooms, stake)  ← from smart account
 *          bundle call 2: issueChallengeFor(agentOwner, ...)  ← consumes prefunded stake
 *
 *        The ERC-7715 erc20-token-periodic caveat enforces the daily USDC spend cap.
 *        Funds move only inside the delegated execution bundle. No AgentTreasury needed.
 *
 *      Authorization hierarchy (checked in isAuthorizedExecutor):
 *        1. delegationManager — the ERC-7710 DelegationManager address, set by owner.
 *           Trusted globally for all agents. 1Shot redeems via this contract.
 *        2. authorizedExecutors[agentOwner][executor] — per-agent whitelist.
 *           Agents can authorize additional executors (e.g. scheduler key).
 *
 *      PRODUCTION NOTE: For mainnet, require a cryptographic proof that the
 *      executor holds a valid ERC-7715 delegation from agentOwner, rather than
 *      relying on a global trust list. This mapping approach is acceptable for
 *      hackathon/demo where the DelegationManager is a known controlled address.
 */
contract HotTakeRooms is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    IERC20          public immutable USDC;
    AgentRegistry   public immutable registry;
    AgentTreasury   public immutable treasury;
    ClashboardArena public           arena;

    enum RoomState { OPEN, LOCKED, SETTLED, CANCELLED }

    struct Room {
        RoomState state;
        address   creator;          // agent owner who issued the challenge
        address   challenger;       // agent owner who accepted
        uint256   stake;            // per-side USDC stake
        bytes32   topicHash;        // keccak256(topic string)
        string    topicPreview;     // hot take text for display
        bytes32   battleId;         // set when room is locked and battle created
        uint256   createdAt;
        uint256   expiresAt;        // room auto-cancels if not accepted by this time
        bytes32   categoryHash;     // topic category
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(bytes32 => Room) public rooms;
    uint256 public totalRooms;
    uint256 public escrowedBalance;

    /**
     * @notice ERC-7710 DelegationManager — globally trusted executor.
     * When 1Shot redeems a delegation, the DelegationManager is msg.sender
     * for the inner call to issueChallengeFor / acceptChallengeFor.
     */
    address public delegationManager;

    /**
     * @notice Per-agent executor whitelist.
     * authorizedExecutors[agentOwner][executor] = true
     * Allows individual agents to authorize specific addresses (e.g. scheduler)
     * in addition to the global DelegationManager.
     */
    mapping(address => mapping(address => bool)) public authorizedExecutors;

    // Max time a room can stay open without being accepted (48 hours)
    uint256 public constant MAX_ROOM_DURATION = 48 hours;

    // Min stake per side
    uint256 public constant MIN_STAKE = 250000; // $0.25 USDC
    uint256 public constant MAX_TOPIC_LENGTH = 280;

    // ─── Events ───────────────────────────────────────────────────────────────

    event RoomCreated(
        bytes32 indexed roomId,
        address indexed creator,
        uint256 stake,
        string  topicPreview,
        uint256 expiresAt
    );
    event RoomAccepted(
        bytes32 indexed roomId,
        address indexed challenger,
        bytes32 battleId
    );
    event RoomCancelled(bytes32 indexed roomId, address indexed by);
    event RoomExpired(bytes32 indexed roomId);
    event ArenaUpdated(address indexed newArena);
    event DelegationManagerUpdated(address indexed dm);
    event ExecutorAuthorized(address indexed agentOwner, address indexed executor, bool allowed);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _registry,
        address _treasury,
        address _arena
    ) Ownable(msg.sender) {
        USDC     = IERC20(_usdc);
        registry = AgentRegistry(_registry);
        treasury = AgentTreasury(_treasury);
        arena    = ClashboardArena(_arena);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function updateArena(address _arena) external onlyOwner {
        arena = ClashboardArena(_arena);
        emit ArenaUpdated(_arena);
    }

    /**
     * @notice Set the ERC-7710 DelegationManager address.
     * This address is trusted globally to act as executor for any agent.
     * Only set this to an audited, controlled DelegationManager contract.
     */
    function setDelegationManager(address _dm) external onlyOwner {
        delegationManager = _dm;
        emit DelegationManagerUpdated(_dm);
    }

    /**
     * @notice Authorize or revoke an executor for the caller's agent.
     * Callable by any agent owner to whitelist a specific executor address
     * (e.g. a scheduler key or a 1Shot relay) for their own agent only.
     */
    function authorizeExecutor(address _executor, bool _allowed) external {
        authorizedExecutors[msg.sender][_executor] = _allowed;
        emit ExecutorAuthorized(msg.sender, _executor, _allowed);
    }

    /**
     * @notice Check whether `executor` is authorized to act for `agentOwner`.
     * Returns true if:
     *   - executor is the configured DelegationManager (global trust), OR
     *   - agentOwner has explicitly whitelisted executor via authorizeExecutor()
     */
    function isAuthorizedExecutor(
        address _agentOwner,
        address _executor
    ) public view returns (bool) {
        if (_executor == delegationManager && _executor != address(0)) return true;
        return authorizedExecutors[_agentOwner][_executor];
    }

    // ─── Internal challenge logic ─────────────────────────────────────────────

    /**
     * @dev Shared validation and room creation. Does NOT handle USDC transfer —
     * callers are responsible for moving funds before or after calling this.
     */
    function _validateAndCreateRoom(
        address _agentOwner,
        bytes32 _roomId,
        bytes32 _topicHash,
        string  calldata _topicPreview,
        bytes32 _categoryHash,
        uint256 _stake
    ) internal {
        require(rooms[_roomId].creator == address(0), "Room ID already exists");
        require(registry.agentExists_(_agentOwner),   "Must have an agent to issue challenge");
        require(_stake >= MIN_STAKE,                  "Stake below minimum");
        require(bytes(_topicPreview).length > 0,      "Topic required");
        require(bytes(_topicPreview).length <= MAX_TOPIC_LENGTH, "Topic too long");
        require(
            keccak256(abi.encode(_topicPreview)) == _topicHash,
            "Topic hash mismatch"
        );

        totalRooms++;
        uint256 expiry = block.timestamp + MAX_ROOM_DURATION;

        rooms[_roomId] = Room({
            state:        RoomState.OPEN,
            creator:      _agentOwner,
            challenger:   address(0),
            stake:        _stake,
            topicHash:    _topicHash,
            topicPreview: _topicPreview,
            battleId:     bytes32(0),
            createdAt:    block.timestamp,
            expiresAt:    expiry,
            categoryHash: _categoryHash
        });

        emit RoomCreated(_roomId, _agentOwner, _stake, _topicPreview, expiry);
    }

    /**
     * @dev Shared accept logic. Does NOT handle USDC transfer.
     */
    function _validateAndAcceptRoom(
        address _agentOwner,
        bytes32 _roomId,
        bytes32 _battleId,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch
    ) internal {
        Room storage room = rooms[_roomId];

        require(room.state == RoomState.OPEN,     "Room not open");
        require(block.timestamp < room.expiresAt, "Room has expired");
        require(_agentOwner != room.creator,      "Cannot challenge yourself");
        require(registry.agentExists_(_agentOwner), "Must have an agent to accept");

        room.challenger = _agentOwner;
        room.battleId   = _battleId;
        room.state      = RoomState.LOCKED;

        // Transfer both stakes to Arena — these become the fighter pool directly.
        _sendEscrowedUSDC(address(arena), room.stake * 2);

        arena.createBattleFromRoom(
            _battleId,
            room.creator,
            _agentOwner,
            room.stake,
            _bettingDuration,
            _roundDuration,
            _maxResearch,
            room.topicHash,
            room.topicPreview,
            room.categoryHash
        );

        emit RoomAccepted(_roomId, _agentOwner, _battleId);
    }

    function _consumePrefundedUSDC(uint256 _amount) internal {
        uint256 available = USDC.balanceOf(address(this)) - escrowedBalance;
        require(available >= _amount, "Missing prefund");
        escrowedBalance += _amount;
    }

    function _recordEscrowedUSDC(uint256 _amount) internal {
        escrowedBalance += _amount;
    }

    function _sendEscrowedUSDC(address _to, uint256 _amount) internal {
        require(escrowedBalance >= _amount, "Escrow underflow");
        escrowedBalance -= _amount;
        USDC.safeTransfer(_to, _amount);
    }

    // ─── Issue challenge — direct path ────────────────────────────────────────

    /**
     * @notice Post a hot take challenge. Stakes your position with USDC.
     * @dev DIRECT path — msg.sender must own a registered agent.
     *      USDC is pulled from msg.sender's wallet (approve required beforehand).
     */
    function issueChallenge(
        bytes32 _roomId,
        bytes32 _topicHash,
        string  calldata _topicPreview,
        bytes32 _categoryHash,
        uint256 _stake
    ) external nonReentrant {
        _validateAndCreateRoom(msg.sender, _roomId, _topicHash, _topicPreview, _categoryHash, _stake);
        // Pull stake from the user's wallet (requires prior USDC.approve)
        USDC.safeTransferFrom(msg.sender, address(this), _stake);
        _recordEscrowedUSDC(_stake);
    }

    // ─── Issue challenge — delegated path ─────────────────────────────────────

    /**
     * @notice Post a challenge on behalf of `agentOwner` via delegation.
     * @dev DELEGATED path — msg.sender must be an authorized executor
     *      (DelegationManager or whitelisted address).
     *
     *      USDC comes directly from agentOwner's wallet — no AgentTreasury required.
     *
     *      Before calling this, the 1Shot bundle must include:
     *        call N-1: USDC.transfer(address(this), _stake)  ← executed from smart account
     *        call N:   issueChallengeFor(agentOwner, ...)    ← this function
     *
     *      The ERC-7715 erc20-token-periodic caveat caps total daily USDC flow.
     *      This function consumes the prefunded amount instead of calling approve/transferFrom.
     */
    function issueChallengeFor(
        address _agentOwner,
        bytes32 _roomId,
        bytes32 _topicHash,
        string  calldata _topicPreview,
        bytes32 _categoryHash,
        uint256 _stake
    ) external nonReentrant {
        require(
            isAuthorizedExecutor(_agentOwner, msg.sender),
            "Not authorized executor"
        );
        _validateAndCreateRoom(_agentOwner, _roomId, _topicHash, _topicPreview, _categoryHash, _stake);
        _consumePrefundedUSDC(_stake);
    }

    // ─── Issue challenge — treasury path (legacy scheduler) ──────────────────

    /**
     * @notice Issue a challenge from agent treasury (scheduler / autonomous mode).
     * @dev Legacy path for the platform scheduler. Prefer issueChallengeFor for
     *      user-delegated execution. Retained for backwards compatibility.
     */
    function issueChallengeFromTreasury(
        bytes32 _roomId,
        address _agentOwner,
        bytes32 _topicHash,
        string  calldata _topicPreview,
        bytes32 _categoryHash,
        uint256 _stake
    ) external nonReentrant {
        require(msg.sender == address(arena) || msg.sender == owner(), "Not authorised");
        _validateAndCreateRoom(_agentOwner, _roomId, _topicHash, _topicPreview, _categoryHash, _stake);
        treasury.authorizedSpend(
            _agentOwner, _stake, address(this),
            AgentTreasury.SpendPurpose.OTHER, bytes32(0), 0
        );
        _recordEscrowedUSDC(_stake);
    }

    // ─── Accept challenge — direct path ───────────────────────────────────────

    /**
     * @notice Accept an open challenge. Locks your stake, creates the battle.
     * @dev DIRECT path — msg.sender must own a registered agent.
     *      USDC is pulled from msg.sender's wallet.
     */
    function acceptChallenge(
        bytes32 _roomId,
        bytes32 _battleId,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch
    ) external nonReentrant {
        // Pull challenger's matching stake from their wallet first
        USDC.safeTransferFrom(msg.sender, address(this), rooms[_roomId].stake);
        _recordEscrowedUSDC(rooms[_roomId].stake);
        _validateAndAcceptRoom(msg.sender, _roomId, _battleId, _bettingDuration, _roundDuration, _maxResearch);
    }

    // ─── Accept challenge — delegated path ────────────────────────────────────

    /**
     * @notice Accept a challenge on behalf of `agentOwner` via delegation.
     * @dev DELEGATED path — msg.sender must be an authorized executor.
     *
     *      USDC comes directly from agentOwner's wallet — no AgentTreasury required.
     *
     *      Before calling this, the 1Shot bundle must include:
     *        call N-1: USDC.transfer(address(this), room.stake) ← from smart account
     *        call N:   acceptChallengeFor(agentOwner, ...)      ← this function
     *
     *      room.stake is readable off-chain before bundle construction via getRoom(roomId).
     */
    function acceptChallengeFor(
        address _agentOwner,
        bytes32 _roomId,
        bytes32 _battleId,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch
    ) external nonReentrant {
        require(
            isAuthorizedExecutor(_agentOwner, msg.sender),
            "Not authorized executor"
        );
        uint256 stake = rooms[_roomId].stake;
        _consumePrefundedUSDC(stake);
        _validateAndAcceptRoom(_agentOwner, _roomId, _battleId, _bettingDuration, _roundDuration, _maxResearch);
    }

    // ─── Cancel challenge ─────────────────────────────────────────────────────

    /**
     * @notice Cancel an OPEN challenge. Refunds creator's stake.
     *         Can only cancel before anyone accepts.
     */
    function cancelChallenge(bytes32 _roomId) external nonReentrant {
        Room storage room = rooms[_roomId];

        require(room.state == RoomState.OPEN,  "Room not open - cannot cancel");
        require(
            msg.sender == room.creator || msg.sender == owner(),
            "Only creator can cancel"
        );

        room.state = RoomState.CANCELLED;
        _sendEscrowedUSDC(room.creator, room.stake);

        emit RoomCancelled(_roomId, msg.sender);
    }

    /**
     * @notice Expire a room that has timed out without being accepted.
     *         Anyone can call this — refunds creator and cleans up.
     */
    function expireRoom(bytes32 _roomId) external nonReentrant {
        Room storage room = rooms[_roomId];

        require(room.state == RoomState.OPEN,          "Room not open");
        require(block.timestamp >= room.expiresAt,     "Room has not expired yet");

        room.state = RoomState.CANCELLED;
        _sendEscrowedUSDC(room.creator, room.stake);

        emit RoomExpired(_roomId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getRoom(bytes32 _roomId) external view returns (Room memory) {
        return rooms[_roomId];
    }
}

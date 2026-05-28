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
 * @dev Separation of concerns:
 *      HotTakeRooms handles the pre-battle setup and stake locking.
 *      ClashboardArena handles the actual battle and payout.
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

    // ─── Issue challenge ──────────────────────────────────────────────────────

    /**
     * @notice Post a hot take challenge. Stakes your position with USDC.
     *         Anyone with an agent can accept.
     * @param _roomId        Unique room identifier (generated server-side)
     * @param _topicHash     keccak256(full topic string)
     * @param _topicPreview  Hot take text stored on-chain for display
     * @param _categoryHash  Topic category hash
     * @param _stake         USDC per side (in wei, min $0.25)
     */
    function issueChallenge(
        bytes32 _roomId,
        bytes32 _topicHash,
        string  calldata _topicPreview,
        bytes32 _categoryHash,
        uint256 _stake
    ) external nonReentrant {
        require(rooms[_roomId].creator == address(0), "Room ID already exists");
        require(registry.agentExists_(msg.sender),    "Must have an agent to issue challenge");
        require(_stake >= MIN_STAKE,                  "Stake below minimum");
        require(bytes(_topicPreview).length > 0,      "Topic required");
        require(bytes(_topicPreview).length <= MAX_TOPIC_LENGTH, "Topic too long");
        require(
            keccak256(abi.encode(_topicPreview)) == _topicHash,
            "Topic hash mismatch"
        );

        // Lock challenger's stake from their wallet (not treasury — this is personal stake)
        USDC.safeTransferFrom(msg.sender, address(this), _stake);

        totalRooms++;
        uint256 expiry = block.timestamp + MAX_ROOM_DURATION;

        rooms[_roomId] = Room({
            state:        RoomState.OPEN,
            creator:      msg.sender,
            challenger:   address(0),
            stake:        _stake,
            topicHash:    _topicHash,
            topicPreview: _topicPreview,
            battleId:     bytes32(0),
            createdAt:    block.timestamp,
            expiresAt:    expiry,
            categoryHash: _categoryHash
        });

        emit RoomCreated(_roomId, msg.sender, _stake, _topicPreview, expiry);
    }

    /**
     * @notice Issue a challenge from agent treasury (autonomous mode).
     *         Scheduler calls this when agent autonomously creates a challenge.
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
        require(rooms[_roomId].creator == address(0), "Room ID already exists");
        require(registry.agentExists_(_agentOwner),   "Agent not registered");
        require(_stake >= MIN_STAKE,                  "Stake below minimum");
        require(bytes(_topicPreview).length > 0,      "Topic required");
        require(bytes(_topicPreview).length <= MAX_TOPIC_LENGTH, "Topic too long");
        require(
            keccak256(abi.encode(_topicPreview)) == _topicHash,
            "Topic hash mismatch"
        );

        // Deduct from agent treasury
        treasury.authorizedSpend(
            _agentOwner, _stake, address(this),
            AgentTreasury.SpendPurpose.OTHER, bytes32(0), 0
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

    // ─── Accept challenge ─────────────────────────────────────────────────────

    /**
     * @notice Accept an open challenge. Locks your stake, creates the battle.
     * @param _roomId       Room to accept
     * @param _battleId     New battle ID to create in Arena
     * @param _bettingDuration Seconds for spectator betting window
     * @param _maxResearch  Max research budget per agent for this battle
     */
    function acceptChallenge(
        bytes32 _roomId,
        bytes32 _battleId,
        uint256 _bettingDuration,
        uint256 _roundDuration,
        uint256 _maxResearch
    ) external nonReentrant {
        Room storage room = rooms[_roomId];

        require(room.state == RoomState.OPEN,          "Room not open");
        require(block.timestamp < room.expiresAt,      "Room has expired");
        require(msg.sender != room.creator,            "Cannot challenge yourself");
        require(registry.agentExists_(msg.sender),     "Must have an agent to accept");

        // Lock challenger's matching stake from their wallet
        USDC.safeTransferFrom(msg.sender, address(this), room.stake);

        room.challenger = msg.sender;
        room.battleId   = _battleId;
        room.state      = RoomState.LOCKED;

        // Transfer both stakes to Arena — these become the fighter pool directly.
        // Arena.createBattleFromRoom does NOT pull from AgentTreasury; it trusts
        // that these funds have already arrived via this transfer.
        USDC.safeTransfer(address(arena), room.stake * 2);

        arena.createBattleFromRoom(
            _battleId,
            room.creator,
            msg.sender,
            room.stake,
            _bettingDuration,
            _roundDuration,
            _maxResearch,
            room.topicHash,
            room.topicPreview,
            room.categoryHash
        );

        emit RoomAccepted(_roomId, msg.sender, _battleId);
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
        USDC.safeTransfer(room.creator, room.stake);

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
        USDC.safeTransfer(room.creator, room.stake);

        emit RoomExpired(_roomId);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getRoom(bytes32 _roomId) external view returns (Room memory) {
        return rooms[_roomId];
    }

}

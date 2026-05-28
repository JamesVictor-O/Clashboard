// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentRegistry
 * @notice One agent per wallet. Identity, reputation, and autonomous permission limits.
 * @dev Called by ClashboardArena to update reputation after every battle.
 */
contract AgentRegistry is Ownable, ReentrancyGuard {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Agent {
        address owner;           // wallet that forged this agent
        address agentAddress;    // same as owner for now; ERC-7710 smart account later
        string  name;            // public display name
        bytes32 metadataHash;    // IPFS hash of full config (persona, instructions, etc.)
        uint256 forgedAt;        // timestamp of creation
        bool    exists;
    }

    struct Reputation {
        uint256 wins;
        uint256 losses;
        uint256 totalBattles;
        uint256 scoreSum;        // sum of judge scores × 100 for precision
        uint256 earningsTotal;   // lifetime USDC earnings in wei
    }

    struct AutonomousLimits {
        bool    autonomousMode;          // master on/off switch
        uint256 maxEntryFeePerBattle;    // max USDC per battle entry
        uint256 maxResearchBudget;       // max USDC on data per battle
        uint256 maxBattlesPerDay;        // daily cap
        uint256 battlesEnteredToday;     // resets daily
        uint256 dayResetTimestamp;       // tracks when battlesEnteredToday was last reset
        uint256 permissionExpiry;        // unix timestamp — limits expire here
        bytes32 allowedCategoriesHash;   // keccak256 of allowed topic categories
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    // owner address → Agent
    mapping(address => Agent)            public agents;
    // owner address → Reputation
    mapping(address => Reputation)       public reputations;
    // owner address → AutonomousLimits
    mapping(address => AutonomousLimits) public autonomousLimits;
    // agent name → taken (prevent duplicate names)
    mapping(bytes32 => bool)             private _nameTaken;

    // Addresses authorised to call updateReputation and autonomousEntry checks
    mapping(address => bool) public authorisedContracts;

    uint256 public totalAgents;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentForged(address indexed owner, string name, bytes32 metadataHash, uint256 timestamp);
    event MetadataUpdated(address indexed owner, bytes32 newMetadataHash);
    event AutonomousLimitsSet(address indexed owner, bool autonomousMode, uint256 expiry);
    event ReputationUpdated(address indexed owner, uint256 wins, uint256 losses, uint256 avgScore);
    event AuthorisedContractSet(address indexed contractAddress, bool status);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorised() {
        require(authorisedContracts[msg.sender] || msg.sender == owner(), "Not authorised");
        _;
    }

    modifier agentExists(address _owner) {
        require(agents[_owner].exists, "Agent does not exist");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setAuthorisedContract(address _contract, bool _status) external onlyOwner {
        authorisedContracts[_contract] = _status;
        emit AuthorisedContractSet(_contract, _status);
    }

    // ─── Forge ────────────────────────────────────────────────────────────────

    /**
     * @notice Create your agent. One per wallet. Permanent on-chain identity.
     * @param _name Public display name — must be unique
     * @param _metadataHash IPFS hash of full agent config (persona, instructions, etc.)
     */
    function forge(string calldata _name, bytes32 _metadataHash) external nonReentrant {
        require(!agents[msg.sender].exists,          "Agent already forged for this wallet");
        require(bytes(_name).length >= 2,            "Name too short");
        require(bytes(_name).length <= 28,           "Name too long");

        bytes32 nameKey = keccak256(bytes(_name));
        require(!_nameTaken[nameKey],                "Name already taken");

        _nameTaken[nameKey] = true;
        totalAgents++;

        agents[msg.sender] = Agent({
            owner:        msg.sender,
            agentAddress: msg.sender,
            name:         _name,
            metadataHash: _metadataHash,
            forgedAt:     block.timestamp,
            exists:       true
        });

        emit AgentForged(msg.sender, _name, _metadataHash, block.timestamp);
    }

    /**
     * @notice Update agent metadata (persona changes, knowledge updates).
     *         Battle record and name cannot be changed.
     */
    function updateMetadata(bytes32 _newMetadataHash) external agentExists(msg.sender) {
        agents[msg.sender].metadataHash = _newMetadataHash;
        emit MetadataUpdated(msg.sender, _newMetadataHash);
    }

    // ─── Autonomous limits ────────────────────────────────────────────────────

    /**
     * @notice Set what your agent is allowed to do autonomously.
     *         This is the on-chain enforcement of the user's permission grant.
     */
    function setAutonomousLimits(
        bool    _autonomousMode,
        uint256 _maxEntryFee,
        uint256 _maxResearchBudget,
        uint256 _maxBattlesPerDay,
        uint256 _permissionExpiry,
        bytes32 _allowedCategoriesHash
    ) external agentExists(msg.sender) {
        require(_permissionExpiry > block.timestamp, "Expiry must be in the future");
        require(_maxBattlesPerDay > 0 && _maxBattlesPerDay <= 20, "Invalid daily limit");

        AutonomousLimits storage limits = autonomousLimits[msg.sender];
        limits.autonomousMode          = _autonomousMode;
        limits.maxEntryFeePerBattle    = _maxEntryFee;
        limits.maxResearchBudget       = _maxResearchBudget;
        limits.maxBattlesPerDay        = _maxBattlesPerDay;
        limits.permissionExpiry        = _permissionExpiry;
        limits.allowedCategoriesHash   = _allowedCategoriesHash;

        emit AutonomousLimitsSet(msg.sender, _autonomousMode, _permissionExpiry);
    }

    /**
     * @notice Check if agent can autonomously enter a battle.
     *         Called by Arena before processing autonomous entry.
     */
    function isAutonomousEligible(
        address _owner,
        uint256 _entryFee
    ) external view returns (bool eligible, string memory reason) {
        if (!agents[_owner].exists)
            return (false, "Agent does not exist");

        AutonomousLimits storage limits = autonomousLimits[_owner];

        if (!limits.autonomousMode)
            return (false, "Autonomous mode is off");

        if (block.timestamp >= limits.permissionExpiry)
            return (false, "Permission expired");

        if (_entryFee > limits.maxEntryFeePerBattle)
            return (false, "Entry fee exceeds limit");

        // Compute effective daily count without mutating — actual reset happens in recordAutonomousEntry
        uint256 effectiveCount = (block.timestamp >= limits.dayResetTimestamp + 1 days)
            ? 0
            : limits.battlesEnteredToday;

        if (effectiveCount >= limits.maxBattlesPerDay)
            return (false, "Daily battle limit reached");

        return (true, "");
    }

    /**
     * @notice Increment daily battle count. Called by Arena on autonomous entry.
     */
    function recordAutonomousEntry(address _owner) external onlyAuthorised {
        _resetDailyCountIfNeeded(_owner);
        autonomousLimits[_owner].battlesEnteredToday++;
    }

    // ─── Reputation ───────────────────────────────────────────────────────────

    /**
     * @notice Update agent reputation after a battle settles.
     *         Only callable by authorised Arena contract.
     * @param _owner     Agent owner address
     * @param _won       True if agent won
     * @param _score     Judge score × 100 (e.g. 850 = 8.50)
     * @param _earnings  USDC earnings from this battle (wei)
     */
    function updateReputation(
        address _owner,
        bool    _won,
        uint256 _score,
        uint256 _earnings
    ) external onlyAuthorised agentExists(_owner) {
        Reputation storage rep = reputations[_owner];
        rep.totalBattles++;
        rep.scoreSum    += _score;
        rep.earningsTotal += _earnings;

        if (_won) rep.wins++;
        else      rep.losses++;

        uint256 avg = rep.totalBattles > 0 ? rep.scoreSum / rep.totalBattles : 0;
        emit ReputationUpdated(_owner, rep.wins, rep.losses, avg);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAgent(address _owner)
        external view
        returns (Agent memory agent, Reputation memory rep)
    {
        return (agents[_owner], reputations[_owner]);
    }

    function getAvgScore(address _owner) external view returns (uint256) {
        Reputation memory rep = reputations[_owner];
        if (rep.totalBattles == 0) return 0;
        return rep.scoreSum / rep.totalBattles;
    }

    function agentExists_(address _owner) external view returns (bool) {
        return agents[_owner].exists;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _resetDailyCountIfNeeded(address _owner) internal {
        AutonomousLimits storage limits = autonomousLimits[_owner];
        // If more than 24 hours since last reset, reset the counter
        if (block.timestamp >= limits.dayResetTimestamp + 1 days) {
            limits.battlesEnteredToday = 0;
            limits.dayResetTimestamp   = block.timestamp;
        }
    }
}

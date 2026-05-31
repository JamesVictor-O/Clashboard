// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentRegistry
 * @notice On-chain identity and reputation ledger for Clashboard AI fighters.
 *
 * Responsibility boundary:
 *   AgentRegistry    → identity, ownership, metadata, reputation, earnings
 *   MetaMask ERC-7715 → spending permissions (budgets, expiry, token caps)
 *   Policy engine (TS) → game rules (max battles/day, categories, risk mode)
 *   1Shot / ERC-7710  → delegated execution
 *
 * What was removed:
 *   AutonomousLimits struct and all related storage/functions were deleted.
 *   They duplicated MetaMask ERC-7715 semantics inside Solidity, creating two
 *   competing permission systems. Budget limits, expiry, and category filters
 *   now live exclusively in lib/autonomy/policy.ts, enforced before any 1Shot
 *   call is made. Contracts only gate on agentExists_() — everything else is
 *   handled off-chain.
 */
contract AgentRegistry is Ownable, ReentrancyGuard {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Agent {
        address owner;        // wallet that forged this agent
        address agentAddress; // same as owner for now; ERC-7710 smart account later
        string  name;         // public display name
        bytes32 metadataHash; // content hash of full config (persona, beliefs…)
        uint256 forgedAt;     // block.timestamp of creation
        bool    exists;
    }

    struct Reputation {
        uint256 wins;
        uint256 losses;
        uint256 totalBattles;
        uint256 scoreSum;      // sum of judge scores × 100 for precision
        uint256 earningsTotal; // lifetime USDC earnings (6-decimal)
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    mapping(address => Agent)      public agents;
    mapping(address => Reputation) public reputations;
    mapping(bytes32 => bool)       private _nameTaken;
    mapping(address => bool)       public authorisedContracts;

    uint256 public totalAgents;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentForged(address indexed owner, string name, bytes32 metadataHash, uint256 timestamp);
    event MetadataUpdated(address indexed owner, bytes32 newMetadataHash);
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
     * @notice Mint your on-chain fighter. One per wallet. Name is permanent.
     * @param _name         Public display name — unique, 2–28 chars
     * @param _metadataHash Content hash of full agent config (persona, beliefs…)
     */
    function forge(string calldata _name, bytes32 _metadataHash) external nonReentrant {
        require(!agents[msg.sender].exists,   "Agent already forged for this wallet");
        require(bytes(_name).length >= 2,     "Name too short");
        require(bytes(_name).length <= 28,    "Name too long");

        bytes32 nameKey = keccak256(bytes(_name));
        require(!_nameTaken[nameKey],         "Name already taken");

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
     *         Name and battle record are immutable.
     */
    function updateMetadata(bytes32 _newMetadataHash) external agentExists(msg.sender) {
        agents[msg.sender].metadataHash = _newMetadataHash;
        emit MetadataUpdated(msg.sender, _newMetadataHash);
    }

    // ─── Reputation ───────────────────────────────────────────────────────────

    /**
     * @notice Record battle outcome. Only callable by an authorised Arena contract.
     * @param _owner    Agent owner address
     * @param _won      True if agent won
     * @param _score    Judge score × 100 (e.g. 850 = 8.50/10)
     * @param _earnings USDC earned this battle (6-decimal)
     */
    function updateReputation(
        address _owner,
        bool    _won,
        uint256 _score,
        uint256 _earnings
    ) external onlyAuthorised agentExists(_owner) {
        Reputation storage rep = reputations[_owner];
        rep.totalBattles++;
        rep.scoreSum      += _score;
        rep.earningsTotal += _earnings;

        if (_won) rep.wins++;
        else      rep.losses++;

        emit ReputationUpdated(_owner, rep.wins, rep.losses, rep.scoreSum / rep.totalBattles);
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
}

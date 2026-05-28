// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentTreasury
 * @notice On-chain wallet for each agent. Holds USDC for battle entries,
 *         research purchases, and spectator bets. Receives earnings autonomously.
 * @dev Only authorised contracts (Arena, HotTakeRooms) can call authorizedSpend.
 */
contract AgentTreasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    IERC20 public immutable USDC;

    enum SpendPurpose { ENTRY, RESEARCH, BET, OTHER }

    // ─── Storage ──────────────────────────────────────────────────────────────

    // agent owner → USDC balance held in treasury
    mapping(address => uint256) private _balances;

    // battleId → agent owner → research already spent this battle
    mapping(bytes32 => mapping(address => uint256)) public researchSpent;

    // authorised contracts that can call authorizedSpend
    mapping(address => bool) public authorisedContracts;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Deposited(address indexed agent, uint256 amount);
    event Withdrawn(address indexed agent, uint256 amount);
    event AuthorisedSpend(address indexed agent, uint256 amount, address recipient, SpendPurpose purpose);
    event EarningsReceived(address indexed agent, uint256 amount);
    event AuthorisedContractSet(address indexed contractAddress, bool status);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorised() {
        require(authorisedContracts[msg.sender] || msg.sender == owner(), "Not authorised");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc) Ownable(msg.sender) {
        USDC = IERC20(_usdc);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setAuthorisedContract(address _contract, bool _status) external onlyOwner {
        authorisedContracts[_contract] = _status;
        emit AuthorisedContractSet(_contract, _status);
    }

    // ─── Deposit / Withdraw ───────────────────────────────────────────────────

    /**
     * @notice Fund your agent's treasury. Called by agent owner.
     * @param _agentOwner The agent owner address to fund
     * @param _amount     USDC amount in wei (6 decimals)
     */
    function deposit(address _agentOwner, uint256 _amount) external nonReentrant {
        require(_amount > 0, "Zero amount");
        USDC.safeTransferFrom(msg.sender, address(this), _amount);
        _balances[_agentOwner] += _amount;
        emit Deposited(_agentOwner, _amount);
    }

    /**
     * @notice Withdraw earnings to your wallet. Only agent owner can call.
     * @param _amount USDC amount to withdraw
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(_balances[msg.sender] >= _amount, "Insufficient balance");
        _balances[msg.sender] -= _amount;
        USDC.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    // ─── Authorised spend ─────────────────────────────────────────────────────

    /**
     * @notice Spend from an agent's treasury. Only Arena/HotTakeRooms can call.
     * @param _agentOwner Agent owner whose treasury to spend from
     * @param _amount     USDC amount
     * @param _recipient  Address to send funds to
     * @param _purpose    Spend category for tracking
     * @param _battleId   Battle this spend is associated with (bytes32(0) if N/A)
     * @param _maxResearch Max research budget for this battle (0 if not a research spend)
     */
    function authorizedSpend(
        address      _agentOwner,
        uint256      _amount,
        address      _recipient,
        SpendPurpose _purpose,
        bytes32      _battleId,
        uint256      _maxResearch
    ) external onlyAuthorised nonReentrant {
        require(_amount > 0,                          "Zero amount");
        require(_balances[_agentOwner] >= _amount,    "Insufficient agent balance");

        // Research budget cap — enforced per battle per agent
        if (_purpose == SpendPurpose.RESEARCH && _battleId != bytes32(0)) {
            uint256 alreadySpent = researchSpent[_battleId][_agentOwner];
            require(alreadySpent + _amount <= _maxResearch, "Research budget exceeded");
            researchSpent[_battleId][_agentOwner] += _amount;
        }

        _balances[_agentOwner] -= _amount;
        USDC.safeTransfer(_recipient, _amount);

        emit AuthorisedSpend(_agentOwner, _amount, _recipient, _purpose);
    }

    /**
     * @notice Receive earnings into agent treasury. Called by Arena after wins.
     * @param _agentOwner Agent owner to credit
     * @param _amount     USDC amount
     */
    function receiveEarnings(
        address _agentOwner,
        uint256 _amount
    ) external onlyAuthorised nonReentrant {
        require(_amount > 0, "Zero amount");
        // Funds already held in treasury contract — just credit the balance
        _balances[_agentOwner] += _amount;
        emit EarningsReceived(_agentOwner, _amount);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getBalance(address _agentOwner) external view returns (uint256) {
        return _balances[_agentOwner];
    }

    function getResearchSpent(bytes32 _battleId, address _agentOwner)
        external view returns (uint256)
    {
        return researchSpent[_battleId][_agentOwner];
    }
}

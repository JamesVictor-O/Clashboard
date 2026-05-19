// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ClashboardArena.sol";

/// @dev Minimal ERC20 mock for testing
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    string public name     = "USD Coin";
    string public symbol   = "USDC";
    uint8  public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount,           "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        return true;
    }
}

contract ClashboardArenaTest is Test {
    ClashboardArena public arena;
    MockUSDC        public usdc;

    address public owner    = address(this);
    address public treasury = makeAddr("treasury");
    address public agentA   = makeAddr("agentA");
    address public agentB   = makeAddr("agentB");
    address public bettor1  = makeAddr("bettor1");
    address public bettor2  = makeAddr("bettor2");

    bytes32 public constant BATTLE_ID = keccak256("battle-001");
    bytes32 public constant ROOM_ID   = keccak256("room-001");

    // Rubric preimage and hash
    string  public rubricPreimage = "rubric-preimage-001";
    bytes32 public rubricHash;

    uint256 public constant BET_AMOUNT  = 10e6;  // 10 USDC
    uint256 public constant STAKE       = 5e6;   // 5 USDC
    uint256 public constant JUDGE_SCORE = 85;

    function setUp() public {
        usdc  = new MockUSDC();
        arena = new ClashboardArena(address(usdc), treasury);

        rubricHash = keccak256(abi.encode(rubricPreimage));

        // Fund bettors and agents
        usdc.mint(bettor1, 100e6);
        usdc.mint(bettor2, 100e6);
        usdc.mint(agentA,  100e6);
        usdc.mint(agentB,  100e6);

        // Approve arena
        vm.prank(bettor1); usdc.approve(address(arena), type(uint256).max);
        vm.prank(bettor2); usdc.approve(address(arena), type(uint256).max);
        vm.prank(agentA);  usdc.approve(address(arena), type(uint256).max);
        vm.prank(agentB);  usdc.approve(address(arena), type(uint256).max);
    }

    // ─── Battle Creation ──────────────────────────────────────────────────────

    function testCreateBattle() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        (
            ClashboardArena.BattleState state,
            bytes32 rHash,
            address a,
            address b,
            address winner,
            uint256 poolA,
            uint256 poolB,
            uint256 deadline
        ) = arena.battles(BATTLE_ID);

        assertEq(uint8(state), uint8(ClashboardArena.BattleState.OPEN));
        assertEq(rHash,   bytes32(0));
        assertEq(a,       agentA);
        assertEq(b,       agentB);
        assertEq(winner,  address(0));
        assertEq(poolA,   0);
        assertEq(poolB,   0);
        assertGt(deadline, block.timestamp);
    }

    function testCreateBattle_revertsIfExists() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
        vm.expectRevert("Battle exists");
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
    }

    function testCreateBattle_onlyOwner() public {
        vm.prank(bettor1);
        vm.expectRevert();
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
    }

    // ─── Betting ──────────────────────────────────────────────────────────────

    function testDepositBet() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        uint256 before = usdc.balanceOf(bettor1);
        vm.prank(bettor1);
        arena.depositBet(BATTLE_ID, 1, BET_AMOUNT);

        assertEq(usdc.balanceOf(bettor1), before - BET_AMOUNT);
        assertEq(usdc.balanceOf(address(arena)), BET_AMOUNT);

        (uint8 side, uint256 amount) = arena.bets(BATTLE_ID, bettor1);
        assertEq(side,   1);
        assertEq(amount, BET_AMOUNT);

        (uint256 poolA, uint256 poolB,) = arena.getBattlePool(BATTLE_ID);
        assertEq(poolA, BET_AMOUNT);
        assertEq(poolB, 0);
    }

    function testCannotBetTwice() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        vm.prank(bettor1);
        arena.depositBet(BATTLE_ID, 1, BET_AMOUNT);

        vm.prank(bettor1);
        vm.expectRevert("Already bet");
        arena.depositBet(BATTLE_ID, 2, BET_AMOUNT);
    }

    function testCannotBetAfterDeadline() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
        vm.warp(block.timestamp + 301);

        vm.prank(bettor1);
        vm.expectRevert("Deadline passed");
        arena.depositBet(BATTLE_ID, 1, BET_AMOUNT);
    }

    function testCannotBetInvalidSide() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        vm.prank(bettor1);
        vm.expectRevert("Invalid side");
        arena.depositBet(BATTLE_ID, 3, BET_AMOUNT);
    }

    // ─── Rubric Commit ────────────────────────────────────────────────────────

    function testCommitRubric() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
        arena.commitRubric(BATTLE_ID, rubricHash);

        (ClashboardArena.BattleState state, bytes32 rHash,,,,,, ) = arena.battles(BATTLE_ID);
        assertEq(uint8(state), uint8(ClashboardArena.BattleState.LIVE));
        assertEq(rHash, rubricHash);
    }

    function testCommitRubric_wrongState() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
        arena.commitRubric(BATTLE_ID, rubricHash);

        vm.expectRevert("Wrong state");
        arena.commitRubric(BATTLE_ID, rubricHash);
    }

    // ─── Settlement ───────────────────────────────────────────────────────────

    function _setupLiveBattle() internal {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        vm.prank(bettor1);
        arena.depositBet(BATTLE_ID, 1, BET_AMOUNT); // bets on A

        vm.prank(bettor2);
        arena.depositBet(BATTLE_ID, 2, BET_AMOUNT); // bets on B

        arena.commitRubric(BATTLE_ID, rubricHash);
    }

    function testSettleBattle_correctPayout() public {
        _setupLiveBattle();

        uint256 total    = BET_AMOUNT * 2;          // 20 USDC
        uint256 platform = total * 5  / 100;        // 1 USDC
        uint256 agentCut = total * 70 / 100;        // 14 USDC
        uint256 bettors  = total - platform - agentCut; // 5 USDC

        uint256 agentABefore   = usdc.balanceOf(agentA);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 bettor1Before  = usdc.balanceOf(bettor1);

        // Agent A wins
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, JUDGE_SCORE);

        // Agent A gets 70%
        assertEq(usdc.balanceOf(agentA), agentABefore + agentCut);
        // Treasury gets 5%
        assertEq(usdc.balanceOf(treasury), treasuryBefore + platform);
        // Bettor1 (bet on A) gets their share of 25%
        // Only bettor on winning side, so gets all 5 USDC
        assertEq(usdc.balanceOf(bettor1), bettor1Before + bettors);
    }

    function testSettleBattle_rubricMismatch() public {
        _setupLiveBattle();

        vm.expectRevert("Rubric mismatch");
        arena.settleBattle(BATTLE_ID, 1, "wrong-preimage", JUDGE_SCORE);
    }

    function testSettleBattle_notLive() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        vm.expectRevert("Not live");
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, JUDGE_SCORE);
    }

    function testSettleBattle_cannotSettleTwice() public {
        _setupLiveBattle();
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, JUDGE_SCORE);

        vm.expectRevert("Not live");
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, JUDGE_SCORE);
    }

    // ─── Hot Take Rooms ───────────────────────────────────────────────────────

    function testHotTakeRoom_fullFlow() public {
        bytes32 battleId = keccak256("room-battle");

        // Creator opens room
        vm.prank(agentA);
        arena.createRoom(ROOM_ID, STAKE);

        (
            ClashboardArena.RoomState state,
            address creator,
            address challenger,
            uint256 stake,
        ) = arena.rooms(ROOM_ID);

        assertEq(uint8(state), uint8(ClashboardArena.RoomState.WAITING));
        assertEq(creator,    agentA);
        assertEq(challenger, address(0));
        assertEq(stake,      STAKE);
        assertEq(usdc.balanceOf(address(arena)), STAKE);

        // Challenger accepts
        vm.prank(agentB);
        arena.acceptRoom(ROOM_ID, battleId);

        (state, creator, challenger, stake,) = arena.rooms(ROOM_ID);
        assertEq(uint8(state), uint8(ClashboardArena.RoomState.LOCKED));
        assertEq(challenger, agentB);
        assertEq(usdc.balanceOf(address(arena)), STAKE * 2);
    }

    function testHotTakeRoom_noSelfChallenge() public {
        vm.prank(agentA);
        arena.createRoom(ROOM_ID, STAKE);

        vm.prank(agentA);
        vm.expectRevert("No self-challenge");
        arena.acceptRoom(ROOM_ID, keccak256("battle"));
    }

    function testHotTakeRoom_cannotAcceptTwice() public {
        vm.prank(agentA);
        arena.createRoom(ROOM_ID, STAKE);

        vm.prank(agentB);
        arena.acceptRoom(ROOM_ID, keccak256("battle"));

        vm.prank(bettor1);
        vm.expectRevert("Not open");
        arena.acceptRoom(ROOM_ID, keccak256("battle"));
    }

    // ─── Agent Records ────────────────────────────────────────────────────────

    function testAgentRecord_updatesOnSettle() public {
        _setupLiveBattle();
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, JUDGE_SCORE);

        (uint256 wins, uint256 losses, uint256 total, uint256 avg) =
            arena.getAgentRecord(agentA);

        assertEq(wins,   1);
        assertEq(losses, 0);
        assertEq(total,  1);
        assertEq(avg,    JUDGE_SCORE);

        (wins, losses, total, avg) = arena.getAgentRecord(agentB);
        assertEq(wins,   0);
        assertEq(losses, 1);
        assertEq(total,  1);
        assertEq(avg,    JUDGE_SCORE);
    }

    function testAgentRecord_multipleSettlements() public {
        // Battle 1 — A wins
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);
        vm.prank(bettor1); arena.depositBet(BATTLE_ID, 1, BET_AMOUNT);
        arena.commitRubric(BATTLE_ID, rubricHash);
        arena.settleBattle(BATTLE_ID, 1, rubricPreimage, 80);

        // Battle 2 — B wins
        bytes32 battle2 = keccak256("battle-002");
        string memory preimage2 = "rubric-preimage-002";
        bytes32 hash2 = keccak256(abi.encode(preimage2));

        arena.createBattle(battle2, agentA, agentB, 300);
        vm.prank(bettor1); arena.depositBet(battle2, 2, BET_AMOUNT);
        arena.commitRubric(battle2, hash2);
        arena.settleBattle(battle2, 2, preimage2, 90);

        (uint256 wins, uint256 losses, uint256 total, uint256 avg) =
            arena.getAgentRecord(agentA);

        assertEq(wins,   1);
        assertEq(losses, 1);
        assertEq(total,  2);
        assertEq(avg,    85); // (80 + 90) / 2
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function testGetBattlePool() public {
        arena.createBattle(BATTLE_ID, agentA, agentB, 300);

        vm.prank(bettor1); arena.depositBet(BATTLE_ID, 1, 10e6);
        vm.prank(bettor2); arena.depositBet(BATTLE_ID, 2, 6e6);

        (uint256 poolA, uint256 poolB, uint256 total) =
            arena.getBattlePool(BATTLE_ID);

        assertEq(poolA, 10e6);
        assertEq(poolB, 6e6);
        assertEq(total, 16e6);
    }

    function testUpdateTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        arena.updateTreasury(newTreasury);
        assertEq(arena.platformTreasury(), newTreasury);
    }

    function testUpdateTreasury_onlyOwner() public {
        vm.prank(bettor1);
        vm.expectRevert();
        arena.updateTreasury(bettor1);
    }
}

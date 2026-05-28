// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentTreasury.sol";
import "../src/ClashboardArena.sol";
import "../src/HotTakeRooms.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─── Mock USDC ────────────────────────────────────────────────────────────────
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 1e6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ─── Test suite ───────────────────────────────────────────────────────────────
contract ClashboardTest is Test {

    MockUSDC        usdc;
    AgentRegistry   registry;
    AgentTreasury   treasury;
    ClashboardArena arena;
    HotTakeRooms    rooms;

    address owner     = address(this);
    address scheduler = makeAddr("scheduler");
    address platform  = makeAddr("platform");

    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave  = makeAddr("dave");

    uint256 constant ENTRY_FEE      = 2 * 1e6;   // $2 USDC
    uint256 constant BET_AMOUNT     = 5 * 1e6;   // $5 USDC
    uint256 constant STAKE          = 2 * 1e6;   // $2 USDC
    uint256 constant RESEARCH_CAP   = 500_000;   // $0.50 USDC
    uint256 constant BETTING_WINDOW = 120;        // 2 min minimum
    uint256 constant ROUND_DURATION = 60;         // 60 seconds per round

    // Total battle duration after betting closes = 3 * 60 = 180 seconds
    uint256 constant BATTLE_DURATION = BETTING_WINDOW + TOTAL_ROUND_TIME;
    uint256 constant TOTAL_ROUND_TIME = 3 * ROUND_DURATION;

    bytes32 constant BATTLE_ID = keccak256("battle-001");
    bytes32 constant ROOM_ID   = keccak256("room-001");
    string  constant TOPIC     = "Messi is the GOAT over Ronaldo";

    bytes32 constant RUBRIC_PREIMAGE = "judge system prompt v1";
    bytes32          RUBRIC_HASH;

    function setUp() public {
        RUBRIC_HASH = keccak256(abi.encode(RUBRIC_PREIMAGE));

        usdc     = new MockUSDC();
        registry = new AgentRegistry();
        treasury = new AgentTreasury(address(usdc));
        arena    = new ClashboardArena(
            address(usdc), address(registry), address(treasury), platform, scheduler
        );
        rooms    = new HotTakeRooms(
            address(usdc), address(registry), address(treasury), address(arena)
        );

        registry.setAuthorisedContract(address(arena), true);
        treasury.setAuthorisedContract(address(arena), true);
        treasury.setAuthorisedContract(address(rooms), true);
        arena.setHotTakeRooms(address(rooms));

        usdc.mint(alice, 100 * 1e6);
        usdc.mint(bob,   100 * 1e6);
        usdc.mint(carol, 100 * 1e6);
        usdc.mint(dave,  100 * 1e6);

        vm.prank(alice); registry.forge("AliceBot", keccak256("alice-meta"));
        vm.prank(bob);   registry.forge("BobBot",   keccak256("bob-meta"));
        vm.prank(carol); registry.forge("CarolBot", keccak256("carol-meta"));

        // Alice and bob grant the arena direct spending permission (ERC-7715 model).
        vm.prank(alice);
        usdc.approve(address(arena), 50 * 1e6);

        vm.prank(bob);
        usdc.approve(address(arena), 50 * 1e6);

        // Carol pre-funds treasury for autonomous bet tests.
        vm.startPrank(carol);
        usdc.approve(address(treasury), 20 * 1e6);
        treasury.deposit(carol, 20 * 1e6);
        vm.stopPrank();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _createBattle() internal {
        vm.prank(scheduler);
        arena.createBattle(
            BATTLE_ID, alice, bob, ENTRY_FEE,
            BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP,
            _topicHash(TOPIC), TOPIC, keccak256("sports")
        );
    }

    function _topicHash(string memory topic) internal pure returns (bytes32) {
        return keccak256(abi.encode(topic));
    }

    function _commitRubric() internal {
        vm.prank(scheduler);
        arena.commitRubric(BATTLE_ID, RUBRIC_HASH);
    }

    /// Warp past the entire battle (betting + all 3 rounds).
    function _warpPastAllRounds() internal {
        vm.warp(block.timestamp + BATTLE_DURATION + 1);
    }

    // ─── AgentRegistry ────────────────────────────────────────────────────────

    function testForge_success() public {
        assertTrue(registry.agentExists_(alice));
        (AgentRegistry.Agent memory agent,) = registry.getAgent(alice);
        assertEq(agent.name, "AliceBot");
        assertEq(agent.owner, alice);
    }

    function testForge_onePerWallet() public {
        vm.prank(alice);
        vm.expectRevert("Agent already forged for this wallet");
        registry.forge("AliceBot2", keccak256("meta2"));
    }

    function testForge_uniqueName() public {
        vm.prank(dave);
        vm.expectRevert("Name already taken");
        registry.forge("AliceBot", keccak256("dave-meta"));
    }

    function testForge_nameLengthValidation() public {
        vm.prank(dave);
        vm.expectRevert("Name too short");
        registry.forge("X", keccak256("meta"));
    }

    function testSetAutonomousLimits() public {
        vm.prank(alice);
        registry.setAutonomousLimits(
            true, 2 * 1e6, 500_000, 5,
            block.timestamp + 7 days,
            keccak256("sports,music")
        );
        (bool eligible,) = registry.isAutonomousEligible(alice, 1 * 1e6);
        assertTrue(eligible);
    }

    function testAutonomousLimits_expiry() public {
        vm.prank(alice);
        registry.setAutonomousLimits(
            true, 2 * 1e6, 500_000, 5,
            block.timestamp + 1 hours,
            keccak256("sports")
        );
        vm.warp(block.timestamp + 2 hours);
        (bool eligible, string memory reason) = registry.isAutonomousEligible(alice, 1 * 1e6);
        assertFalse(eligible);
        assertEq(reason, "Permission expired");
    }

    function testAutonomousLimits_feeTooHigh() public {
        vm.prank(alice);
        registry.setAutonomousLimits(
            true, 1 * 1e6, 500_000, 5,
            block.timestamp + 7 days,
            keccak256("sports")
        );
        (bool eligible, string memory reason) = registry.isAutonomousEligible(alice, 2 * 1e6);
        assertFalse(eligible);
        assertEq(reason, "Entry fee exceeds limit");
    }

    function testAutonomousLimits_isView() public view {
        registry.isAutonomousEligible(alice, 1 * 1e6);
    }

    // ─── AgentTreasury ────────────────────────────────────────────────────────

    function testDeposit_and_balance() public {
        vm.startPrank(alice);
        usdc.approve(address(treasury), 20 * 1e6);
        treasury.deposit(alice, 20 * 1e6);
        vm.stopPrank();
        assertEq(treasury.getBalance(alice), 20 * 1e6);
    }

    function testWithdraw() public {
        vm.startPrank(alice);
        usdc.approve(address(treasury), 20 * 1e6);
        treasury.deposit(alice, 20 * 1e6);
        uint256 balanceBefore = usdc.balanceOf(alice);
        treasury.withdraw(10 * 1e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), balanceBefore + 10 * 1e6);
        assertEq(treasury.getBalance(alice), 10 * 1e6);
    }

    function testWithdraw_insufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert("Insufficient balance");
        treasury.withdraw(1 * 1e6);
    }

    function testResearchBudgetCap() public {
        // Give alice a treasury balance for the research spend test.
        vm.startPrank(alice);
        usdc.approve(address(treasury), 10 * 1e6);
        treasury.deposit(alice, 10 * 1e6);
        vm.stopPrank();

        vm.startPrank(address(arena));
        treasury.authorizedSpend(
            alice, 400_000, address(0xDADA),
            AgentTreasury.SpendPurpose.RESEARCH, BATTLE_ID, RESEARCH_CAP
        );
        vm.expectRevert("Research budget exceeded");
        treasury.authorizedSpend(
            alice, 200_000, address(0xDADA),
            AgentTreasury.SpendPurpose.RESEARCH, BATTLE_ID, RESEARCH_CAP
        );
        vm.stopPrank();
    }

    // ─── ClashboardArena — create & betting ──────────────────────────────────

    function testCreateBattle_success() public {
        _createBattle();
        ClashboardArena.Battle memory b = arena.getBattle(BATTLE_ID);
        assertEq(b.agentA, alice);
        assertEq(b.agentB, bob);
        assertEq(b.topicHash, _topicHash(TOPIC));
        assertEq(b.topic, TOPIC);
        assertEq(uint8(b.state), uint8(ClashboardArena.BattleState.OPEN));
        assertEq(b.fighterPoolA, ENTRY_FEE);
        assertEq(b.fighterPoolB, ENTRY_FEE);
        assertEq(b.totalRounds, 3);
        assertEq(b.roundDuration, ROUND_DURATION);
        // Phase 0 = betting window active
        assertEq(arena.getBattlePhase(BATTLE_ID), 0);
    }

    function testCreateBattle_deductsEntryFees() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        _createBattle();
        assertEq(usdc.balanceOf(alice), aliceBefore - ENTRY_FEE);
        assertEq(usdc.balanceOf(bob),   bobBefore   - ENTRY_FEE);
    }

    function testCreateBattle_bettingWindowEnforced() public {
        vm.prank(scheduler);
        vm.expectRevert("Betting window too short");
        arena.createBattle(
            BATTLE_ID, alice, bob, ENTRY_FEE, 60, ROUND_DURATION, RESEARCH_CAP,
            _topicHash(TOPIC), TOPIC, keccak256("sports")
        );
    }

    function testPhase_advancesAutomatically() public {
        _createBattle();
        // Read actual stored values — use absolute warp targets to avoid Foundry
        // inline block.timestamp / constant evaluation quirks.
        ClashboardArena.Battle memory b = arena.getBattle(BATTLE_ID);
        uint256 dl  = b.bettingDeadline;  // 121 (1 + 120)
        uint256 rd  = b.roundDuration;    // 60

        assertEq(arena.getBattlePhase(BATTLE_ID), 0);           // betting open

        vm.warp(dl + 1);
        assertEq(arena.getBattlePhase(BATTLE_ID), 1);           // round 1

        vm.warp(dl + rd + 1);
        assertEq(arena.getBattlePhase(BATTLE_ID), 2);           // round 2

        vm.warp(dl + 2 * rd + 1);
        assertEq(arena.getBattlePhase(BATTLE_ID), 3);           // round 3

        vm.warp(dl + 3 * rd + 1);
        assertEq(arena.getBattlePhase(BATTLE_ID), 4);           // all rounds complete
    }

    function testPhaseTimeRemaining() public {
        _createBattle();
        uint256 remaining = arena.getPhaseTimeRemaining(BATTLE_ID);
        assertApproxEqAbs(remaining, BETTING_WINDOW, 2);
    }

    function testPlaceBet_humanBettor() public {
        _createBattle();
        vm.startPrank(dave);
        usdc.approve(address(arena), BET_AMOUNT);
        arena.placeBet(BATTLE_ID, 1, BET_AMOUNT);
        vm.stopPrank();
        (, uint256 betAmount) = arena.getUserBet(BATTLE_ID, dave);
        assertEq(betAmount, BET_AMOUNT);
        ClashboardArena.Battle memory b = arena.getBattle(BATTLE_ID);
        assertEq(b.spectatorPoolA, BET_AMOUNT);
    }

    function testPlaceBet_agentBettor() public {
        _createBattle();
        vm.prank(scheduler);
        arena.agentPlaceBet(BATTLE_ID, carol, 2, 3 * 1e6);
        (, uint256 betAmount) = arena.getUserBet(BATTLE_ID, carol);
        assertEq(betAmount, 3 * 1e6);
    }

    function testPlaceBet_fighterCannotBet() public {
        _createBattle();
        vm.prank(scheduler);
        vm.expectRevert("Fighter cannot bet on own battle");
        arena.agentPlaceBet(BATTLE_ID, alice, 2, 1 * 1e6);
    }

    function testPlaceBet_afterBettingWindowClosed() public {
        _createBattle();
        vm.warp(block.timestamp + BETTING_WINDOW + 1);
        vm.startPrank(dave);
        usdc.approve(address(arena), BET_AMOUNT);
        vm.expectRevert("Betting window closed");
        arena.placeBet(BATTLE_ID, 1, BET_AMOUNT);
        vm.stopPrank();
    }

    // ─── ClashboardArena — rubric ─────────────────────────────────────────────

    function testCommitRubric_success() public {
        _createBattle();
        _commitRubric();
        ClashboardArena.Battle memory b = arena.getBattle(BATTLE_ID);
        assertTrue(b.rubricCommitted);
        assertEq(b.rubricHash, RUBRIC_HASH);
        // State is still OPEN — no manual start needed
        assertEq(uint8(b.state), uint8(ClashboardArena.BattleState.OPEN));
    }

    function testCommitRubric_duplicate() public {
        _createBattle();
        _commitRubric();
        vm.prank(scheduler);
        vm.expectRevert("Rubric already committed");
        arena.commitRubric(BATTLE_ID, RUBRIC_HASH);
    }

    // ─── ClashboardArena — argument submission ────────────────────────────────

    function testSubmitArgument_round1() public {
        _createBattle();
        _commitRubric();
        // Warp to round 1
        vm.warp(block.timestamp + BETTING_WINDOW + 1);
        assertEq(arena.getBattlePhase(BATTLE_ID), 1);

        bytes32 hashA = keccak256("alice opening argument");
        bytes32 hashB = keccak256("bob opening argument");

        vm.startPrank(scheduler);
        arena.submitArgument(BATTLE_ID, 1, hashA);
        arena.submitArgument(BATTLE_ID, 2, hashB);
        vm.stopPrank();

        (bytes32 storedA, bool submittedA) = arena.getArgument(BATTLE_ID, 1, 1);
        (bytes32 storedB, bool submittedB) = arena.getArgument(BATTLE_ID, 1, 2);
        assertEq(storedA, hashA);
        assertEq(storedB, hashB);
        assertTrue(submittedA);
        assertTrue(submittedB);
    }

    function testSubmitArgument_eachRound() public {
        _createBattle();
        _commitRubric();

        uint256 ts = block.timestamp + BETTING_WINDOW + 1;

        for (uint8 r = 1; r <= 3; r++) {
            vm.warp(ts);
            assertEq(arena.getBattlePhase(BATTLE_ID), r);
            vm.startPrank(scheduler);
            arena.submitArgument(BATTLE_ID, 1, keccak256(abi.encode("alice", r)));
            arena.submitArgument(BATTLE_ID, 2, keccak256(abi.encode("bob",   r)));
            vm.stopPrank();
            ts += ROUND_DURATION;
        }

        // All 3 rounds submitted — verify
        for (uint8 r = 1; r <= 3; r++) {
            (, bool sA) = arena.getArgument(BATTLE_ID, r, 1);
            (, bool sB) = arena.getArgument(BATTLE_ID, r, 2);
            assertTrue(sA);
            assertTrue(sB);
        }
    }

    function testSubmitArgument_wrongPhase_bettingStillOpen() public {
        _createBattle();
        vm.prank(scheduler);
        vm.expectRevert("Betting window still open");
        arena.submitArgument(BATTLE_ID, 1, keccak256("arg"));
    }

    function testSubmitArgument_wrongPhase_allRoundsComplete() public {
        _createBattle();
        _commitRubric();
        _warpPastAllRounds();
        vm.prank(scheduler);
        vm.expectRevert("No active round");
        arena.submitArgument(BATTLE_ID, 1, keccak256("late arg"));
    }

    function testSubmitArgument_duplicate() public {
        _createBattle();
        _commitRubric();
        vm.warp(block.timestamp + BETTING_WINDOW + 1);
        vm.startPrank(scheduler);
        arena.submitArgument(BATTLE_ID, 1, keccak256("first"));
        vm.expectRevert("Argument already submitted");
        arena.submitArgument(BATTLE_ID, 1, keccak256("second"));
        vm.stopPrank();
    }

    // ─── ClashboardArena — settlement ────────────────────────────────────────

    function testSettleBattle_correctPayouts() public {
        _createBattle();

        // Dave ($20 on Alice, side A) and Carol agent ($10 on Bob, side B)
        vm.startPrank(dave);
        usdc.approve(address(arena), 20 * 1e6);
        arena.placeBet(BATTLE_ID, 1, 20 * 1e6);
        vm.stopPrank();
        vm.prank(scheduler);
        arena.agentPlaceBet(BATTLE_ID, carol, 2, 10 * 1e6);

        _commitRubric();

        uint256 platformBefore = usdc.balanceOf(platform);
        uint256 aliceBefore    = usdc.balanceOf(alice);
        uint256 daveBefore     = usdc.balanceOf(dave);

        _warpPastAllRounds();

        vm.prank(scheduler);
        arena.settleBattle(BATTLE_ID, 1, RUBRIC_PREIMAGE, 875);

        // Alice (winner) gets 70% of $4 fighter pool = $2.80, paid to her wallet directly.
        uint256 fighterWinner = (4 * 1e6 * 7000) / 10000;
        assertApproxEqAbs(usdc.balanceOf(alice), aliceBefore + fighterWinner, 1000);

        // Platform receives fees
        assertTrue(usdc.balanceOf(platform) > platformBefore);

        // Dave (winning bettor) gets pro-rata share
        assertTrue(usdc.balanceOf(dave) > daveBefore);

        ClashboardArena.Battle memory b = arena.getBattle(BATTLE_ID);
        assertEq(uint8(b.state), uint8(ClashboardArena.BattleState.SETTLED));
        assertEq(b.winner, alice);
    }

    function testSettleBattle_beforeRoundsComplete() public {
        _createBattle();
        _commitRubric();
        // Only warp past betting, not past all rounds
        vm.warp(block.timestamp + BETTING_WINDOW + 1);
        vm.prank(scheduler);
        vm.expectRevert("Rounds not complete yet");
        arena.settleBattle(BATTLE_ID, 1, RUBRIC_PREIMAGE, 875);
    }

    function testSettleBattle_rubricMismatch() public {
        _createBattle();
        _commitRubric();
        _warpPastAllRounds();
        vm.prank(scheduler);
        vm.expectRevert("Rubric preimage mismatch");
        arena.settleBattle(BATTLE_ID, 1, keccak256("wrong rubric"), 800);
    }

    function testSettleBattle_noWinningBettors() public {
        _createBattle();
        // Carol bets on losing side (B), alice wins
        vm.prank(scheduler);
        arena.agentPlaceBet(BATTLE_ID, carol, 2, 3 * 1e6);

        uint256 platformBefore = usdc.balanceOf(platform);
        _commitRubric();
        _warpPastAllRounds();
        vm.prank(scheduler);
        arena.settleBattle(BATTLE_ID, 1, RUBRIC_PREIMAGE, 900);
        assertTrue(usdc.balanceOf(platform) > platformBefore);
    }

    function testSettleBattle_winnerReceivesDirectly() public {
        _createBattle();
        _commitRubric();
        uint256 aliceBefore = usdc.balanceOf(alice);
        _warpPastAllRounds();
        vm.prank(scheduler);
        arena.settleBattle(BATTLE_ID, 1, RUBRIC_PREIMAGE, 900);
        // Winner's share (70% of fighter pool) lands directly in alice's wallet.
        assertTrue(usdc.balanceOf(alice) > aliceBefore);
    }

    function testCancelBattle_refundsAll() public {
        _createBattle();
        vm.startPrank(dave);
        usdc.approve(address(arena), BET_AMOUNT);
        arena.placeBet(BATTLE_ID, 1, BET_AMOUNT);
        vm.stopPrank();

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 daveBefore  = usdc.balanceOf(dave);

        vm.prank(scheduler);
        arena.cancelBattle(BATTLE_ID);

        assertEq(usdc.balanceOf(alice), aliceBefore + ENTRY_FEE);
        assertEq(usdc.balanceOf(bob),   bobBefore   + ENTRY_FEE);
        assertEq(usdc.balanceOf(dave),  daveBefore  + BET_AMOUNT);
    }

    function testCancelBattle_walletIntegrity() public {
        _createBattle();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        vm.prank(scheduler);
        arena.cancelBattle(BATTLE_ID);
        // Both entry fees returned directly to wallets — treasury untouched.
        assertEq(usdc.balanceOf(alice), aliceBefore + ENTRY_FEE);
        assertEq(usdc.balanceOf(bob),   bobBefore   + ENTRY_FEE);
        assertEq(usdc.balanceOf(address(treasury)), 20 * 1e6); // only carol's deposit
    }

    // ─── ClashboardArena — HotTakeRooms path ─────────────────────────────────

    function testCreateBattleFromRoom_success() public {
        bytes32 roomBattleId = keccak256("room-battle-001");
        deal(address(usdc), address(rooms), STAKE * 2);
        vm.startPrank(address(rooms));
        usdc.transfer(address(arena), STAKE * 2);
        arena.createBattleFromRoom(
            roomBattleId, alice, bob, STAKE,
            BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP,
            _topicHash(TOPIC), TOPIC, keccak256("sports")
        );
        vm.stopPrank();

        ClashboardArena.Battle memory b = arena.getBattle(roomBattleId);
        assertEq(b.agentA, alice);
        assertEq(b.agentB, bob);
        assertEq(b.fighterPoolA, STAKE);
        assertEq(b.fighterPoolB, STAKE);
        assertEq(uint8(b.state), uint8(ClashboardArena.BattleState.OPEN));
        assertEq(b.roundDuration, ROUND_DURATION);
        assertEq(b.topicHash, _topicHash(TOPIC));
        assertEq(b.topic, TOPIC);
    }

    function testCreateBattleFromRoom_onlyHotTakeRooms() public {
        vm.prank(scheduler);
        vm.expectRevert("Only HotTakeRooms");
        arena.createBattleFromRoom(
            keccak256("x"), alice, bob, STAKE,
            BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP,
            _topicHash(TOPIC), TOPIC, keccak256("sports")
        );
    }

    function testCreateBattleFromRoom_doesNotTouchTreasury() public {
        bytes32 roomBattleId = keccak256("room-battle-002");
        uint256 aliceTreasBefore = treasury.getBalance(alice);
        uint256 bobTreasBefore   = treasury.getBalance(bob);

        deal(address(usdc), address(rooms), STAKE * 2);
        vm.startPrank(address(rooms));
        usdc.transfer(address(arena), STAKE * 2);
        arena.createBattleFromRoom(
            roomBattleId, alice, bob, STAKE,
            BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP,
            _topicHash(TOPIC), TOPIC, keccak256("sports")
        );
        vm.stopPrank();

        assertEq(treasury.getBalance(alice), aliceTreasBefore);
        assertEq(treasury.getBalance(bob),   bobTreasBefore);
    }

    // ─── HotTakeRooms ────────────────────────────────────────────────────────

    function testIssueChallenge() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(
            ROOM_ID,
            _topicHash("Messi is the GOAT over Ronaldo"),
            "Messi is the GOAT over Ronaldo",
            keccak256("sports"),
            STAKE
        );
        vm.stopPrank();

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.creator, alice);
        assertEq(room.stake, STAKE);
        assertEq(uint8(room.state), uint8(HotTakeRooms.RoomState.OPEN));
    }

    function testIssueChallenge_noAgent() public {
        vm.startPrank(dave);
        usdc.approve(address(rooms), STAKE);
        vm.expectRevert("Must have an agent to issue challenge");
        rooms.issueChallenge(
            ROOM_ID, _topicHash("Topic preview"), "Topic preview", keccak256("sports"), STAKE
        );
        vm.stopPrank();
    }

    function testAcceptChallenge_createsBattle() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(
            ROOM_ID, _topicHash("Messi is the GOAT"), "Messi is the GOAT",
            keccak256("sports"), STAKE
        );
        vm.stopPrank();

        bytes32 battleId = keccak256("hot-take-battle-001");
        vm.startPrank(bob);
        usdc.approve(address(rooms), STAKE);
        rooms.acceptChallenge(ROOM_ID, battleId, BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP);
        vm.stopPrank();

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(uint8(room.state), uint8(HotTakeRooms.RoomState.LOCKED));
        assertEq(room.challenger, bob);
        assertEq(room.battleId, battleId);

        ClashboardArena.Battle memory b = arena.getBattle(battleId);
        assertEq(b.agentA, alice);
        assertEq(b.agentB, bob);
        assertEq(b.fighterPoolA, STAKE);
        assertEq(b.fighterPoolB, STAKE);
        assertEq(b.roundDuration, ROUND_DURATION);
        assertEq(uint8(b.state), uint8(ClashboardArena.BattleState.OPEN));
        assertEq(b.topicHash, _topicHash("Messi is the GOAT"));
        assertEq(b.topic, "Messi is the GOAT");
        // Phase 0 = betting window active immediately
        assertEq(arena.getBattlePhase(battleId), 0);
    }

    function testAcceptChallenge_noDoubleFundingTreasury() public {
        uint256 aliceBefore = treasury.getBalance(alice);
        uint256 bobBefore   = treasury.getBalance(bob);

        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, _topicHash("Preview"), "Preview", keccak256("cat"), STAKE);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(rooms), STAKE);
        rooms.acceptChallenge(ROOM_ID, keccak256("btl"), BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP);
        vm.stopPrank();

        assertEq(treasury.getBalance(alice), aliceBefore);
        assertEq(treasury.getBalance(bob),   bobBefore);
    }

    function testAcceptChallenge_cannotAcceptSelf() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, _topicHash("p"), "p", keccak256("c"), STAKE);
        usdc.approve(address(rooms), STAKE);
        vm.expectRevert("Cannot challenge yourself");
        rooms.acceptChallenge(ROOM_ID, keccak256("x"), BETTING_WINDOW, ROUND_DURATION, RESEARCH_CAP);
        vm.stopPrank();
    }

    function testCancelChallenge_refunds() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, _topicHash("Preview"), "Preview", keccak256("sports"), STAKE);
        uint256 balanceBefore = usdc.balanceOf(alice);
        rooms.cancelChallenge(ROOM_ID);
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), balanceBefore + STAKE);
    }

    function testExpireRoom() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, _topicHash("Preview"), "Preview", keccak256("sports"), STAKE);
        vm.stopPrank();

        uint256 balanceBefore = usdc.balanceOf(alice);
        vm.warp(block.timestamp + 49 hours);
        rooms.expireRoom(ROOM_ID);
        assertEq(usdc.balanceOf(alice), balanceBefore + STAKE);
    }

    // ─── Reputation ───────────────────────────────────────────────────────────

    function testReputation_updatedOnSettle() public {
        _createBattle();
        _commitRubric();
        _warpPastAllRounds();
        vm.prank(scheduler);
        arena.settleBattle(BATTLE_ID, 1, RUBRIC_PREIMAGE, 900);

        (, AgentRegistry.Reputation memory rep) = registry.getAgent(alice);
        assertEq(rep.wins, 1);
        assertEq(rep.losses, 0);
        assertEq(rep.totalBattles, 1);

        (, AgentRegistry.Reputation memory repBob) = registry.getAgent(bob);
        assertEq(repBob.losses, 1);
    }
}

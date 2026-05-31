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
    constructor() ERC20("USD Coin", "USDC") { _mint(msg.sender, 1_000_000 * 1e6); }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ─── HotTakeRooms test suite ──────────────────────────────────────────────────
contract HotTakeRoomsTest is Test {

    MockUSDC        usdc;
    AgentRegistry   registry;
    AgentTreasury   treasury;
    ClashboardArena arena;
    HotTakeRooms    rooms;

    address owner     = address(this);
    address scheduler = makeAddr("scheduler");
    address platform  = makeAddr("platform");

    address alice   = makeAddr("alice");   // issues challenges
    address bob     = makeAddr("bob");     // accepts challenges
    address carol   = makeAddr("carol");   // unauthorized third party
    address dm      = makeAddr("dm");      // mock DelegationManager (1Shot executor)
    address agentDM = makeAddr("agentDM"); // agent-specific authorized executor

    uint256 constant STAKE          = 1 * 1e6;  // $1 USDC
    uint256 constant TREASURY_FUND  = 10 * 1e6; // $10 USDC pre-funded in treasury
    uint256 constant BETTING_WINDOW = 120;
    uint256 constant ROUND_DURATION = 60;

    bytes32 constant ROOM_ID   = keccak256("room-001");
    bytes32 constant ROOM_ID_2 = keccak256("room-002");
    bytes32 constant BATTLE_ID = keccak256("battle-001");
    string  constant TOPIC     = "Messi is the GOAT over Ronaldo";
    bytes32 TOPIC_HASH;
    bytes32 CATEGORY_HASH;

    function setUp() public {
        TOPIC_HASH    = keccak256(abi.encode(TOPIC));
        CATEGORY_HASH = keccak256(abi.encode("Sports"));

        usdc     = new MockUSDC();
        registry = new AgentRegistry();
        treasury = new AgentTreasury(address(usdc));
        arena    = new ClashboardArena(
            address(usdc), address(registry), address(treasury),
            platform, scheduler
        );
        rooms = new HotTakeRooms(
            address(usdc), address(registry), address(treasury), address(arena)
        );

        // Wire authorizations
        treasury.setAuthorisedContract(address(rooms), true);
        treasury.setAuthorisedContract(address(arena), true);
        arena.setHotTakeRooms(address(rooms));

        // Set mock DelegationManager
        rooms.setDelegationManager(dm);

        // Register agents for alice and bob
        vm.prank(alice);  registry.forge("Alice Agent",  keccak256("alice-meta"));
        vm.prank(bob);    registry.forge("Bob Agent",    keccak256("bob-meta"));

        // Fund wallets with USDC — funds stay in wallets, no treasury deposit required
        usdc.mint(alice, 100 * 1e6);
        usdc.mint(bob,   100 * 1e6);
        usdc.mint(carol, 100 * 1e6);
        // No AgentTreasury deposit needed for autonomous path.
        // The 1Shot bundle includes USDC.approve(rooms, stake) from the smart account,
        // so issueChallengeFor / acceptChallengeFor call transferFrom(agentOwner, ...).
    }

    // ─── Direct path: issueChallenge ─────────────────────────────────────────

    function test_issueChallenge_direct() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.creator, alice);
        assertEq(uint(room.state), uint(HotTakeRooms.RoomState.OPEN));
        assertEq(room.stake, STAKE);
        assertEq(usdc.balanceOf(address(rooms)), STAKE);
    }

    function test_issueChallenge_direct_noAgent_reverts() public {
        vm.startPrank(carol);
        usdc.approve(address(rooms), STAKE);
        vm.expectRevert("Must have an agent to issue challenge");
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();
    }

    function test_issueChallenge_direct_belowMin_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), 100);
        vm.expectRevert("Stake below minimum");
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, 100);
        vm.stopPrank();
    }

    // ─── Delegated path: issueChallengeFor ───────────────────────────────────

    function test_issueChallengeFor_delegationManager() public {
        // Simulates the 1Shot bundle:
        //   call 1: alice's smart account calls USDC.approve(rooms, STAKE)
        //   call 2: DelegationManager calls issueChallengeFor(alice, ...)
        vm.prank(alice);
        usdc.approve(address(rooms), STAKE);

        uint256 aliceBalBefore = usdc.balanceOf(alice);

        vm.prank(dm);
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.creator, alice, "creator should be alice (agentOwner), not dm");
        assertEq(uint(room.state), uint(HotTakeRooms.RoomState.OPEN));
        // USDC came from alice's wallet, NOT from AgentTreasury, NOT from dm
        assertEq(usdc.balanceOf(dm), 0, "executor wallet untouched");
        assertEq(usdc.balanceOf(alice), aliceBalBefore - STAKE, "stake pulled from alice wallet");
        assertEq(usdc.balanceOf(address(rooms)), STAKE, "stake landed in rooms");
    }

    function test_issueChallengeFor_noApproval_reverts() public {
        // If the bundle is missing the USDC.approve call, transferFrom must revert
        vm.prank(dm);
        vm.expectRevert(); // SafeERC20: ERC20 operation did not succeed (or allowance error)
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
    }

    function test_issueChallengeFor_insufficientWalletBalance_reverts() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        registry.forge("Broke Agent", keccak256("broke-meta"));
        usdc.mint(broke, STAKE - 1); // one wei short of the required stake
        vm.prank(broke);
        usdc.approve(address(rooms), STAKE);

        vm.prank(dm);
        vm.expectRevert(); // safeTransferFrom reverts — insufficient USDC balance
        rooms.issueChallengeFor(broke, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
    }

    function test_issueChallengeFor_agentAuthorizedExecutor() public {
        vm.prank(alice);
        rooms.authorizeExecutor(agentDM, true);

        // Bundle: approve then call
        vm.prank(alice);
        usdc.approve(address(rooms), STAKE);

        vm.prank(agentDM);
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.creator, alice);
    }

    function test_issueChallengeFor_unauthorizedExecutor_reverts() public {
        vm.prank(carol);
        vm.expectRevert("Not authorized executor");
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
    }

    function test_issueChallengeFor_agentOwnerNoAgent_reverts() public {
        vm.prank(carol);
        rooms.authorizeExecutor(dm, true);
        vm.prank(carol);
        usdc.approve(address(rooms), STAKE);

        vm.prank(dm);
        vm.expectRevert("Must have an agent to issue challenge");
        rooms.issueChallengeFor(carol, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
    }

    function test_issueChallengeFor_revokedExecutor_reverts() public {
        vm.startPrank(alice);
        rooms.authorizeExecutor(agentDM, true);
        rooms.authorizeExecutor(agentDM, false);
        usdc.approve(address(rooms), STAKE);
        vm.stopPrank();

        vm.prank(agentDM);
        vm.expectRevert("Not authorized executor");
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
    }

    // ─── Direct path: acceptChallenge ────────────────────────────────────────

    function test_acceptChallenge_direct() public {
        // Alice issues
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        // Bob accepts
        vm.startPrank(bob);
        usdc.approve(address(rooms), STAKE);
        rooms.acceptChallenge(ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);
        vm.stopPrank();

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.challenger, bob);
        assertEq(uint(room.state), uint(HotTakeRooms.RoomState.LOCKED));
        assertEq(room.battleId, BATTLE_ID);
        // Both stakes forwarded to arena
        assertEq(usdc.balanceOf(address(rooms)), 0);
        assertEq(usdc.balanceOf(address(arena)), STAKE * 2);
    }

    function test_acceptChallenge_direct_noAgent_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        vm.startPrank(carol);
        usdc.approve(address(rooms), STAKE);
        vm.expectRevert("Must have an agent to accept");
        rooms.acceptChallenge(ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);
        vm.stopPrank();
    }

    function test_acceptChallenge_direct_selfChallenge_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE * 2);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.expectRevert("Cannot challenge yourself");
        rooms.acceptChallenge(ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);
        vm.stopPrank();
    }

    // ─── Delegated path: acceptChallengeFor ──────────────────────────────────

    function test_acceptChallengeFor_delegationManager() public {
        // Alice issues directly
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        // Simulate 1Shot bundle for bob's accept:
        //   call 1: bob's smart account calls USDC.approve(rooms, STAKE)
        //   call 2: DelegationManager calls acceptChallengeFor(bob, ...)
        uint256 bobBalBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        usdc.approve(address(rooms), STAKE);

        vm.prank(dm);
        rooms.acceptChallengeFor(bob, ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.challenger, bob, "challenger should be bob (agentOwner), not dm");
        assertEq(uint(room.state), uint(HotTakeRooms.RoomState.LOCKED));
        assertEq(usdc.balanceOf(dm), 0, "executor wallet untouched");
        assertEq(usdc.balanceOf(bob), bobBalBefore - STAKE, "stake pulled from bob wallet, not treasury");
        assertEq(usdc.balanceOf(address(arena)), STAKE * 2, "both stakes in arena");
    }

    function test_acceptChallengeFor_noApproval_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        // Missing USDC.approve in bundle — must revert
        vm.prank(dm);
        vm.expectRevert();
        rooms.acceptChallengeFor(bob, ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);
    }

    function test_acceptChallengeFor_fullDelegatedFlow() public {
        // Both sides fully autonomous via DelegationManager — wallet-level spending
        // Issue side: alice approves + dm calls issueChallengeFor
        vm.prank(alice);
        usdc.approve(address(rooms), STAKE);
        vm.prank(dm);
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);

        // Accept side: bob approves + dm calls acceptChallengeFor
        vm.prank(bob);
        usdc.approve(address(rooms), STAKE);
        vm.prank(dm);
        rooms.acceptChallengeFor(bob, ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);

        HotTakeRooms.Room memory room = rooms.getRoom(ROOM_ID);
        assertEq(room.creator, alice);
        assertEq(room.challenger, bob);
        assertEq(uint(room.state), uint(HotTakeRooms.RoomState.LOCKED));
        // Funds came from wallets — dm has nothing
        assertEq(usdc.balanceOf(dm), 0, "executor wallet untouched");
        assertEq(usdc.balanceOf(address(arena)), STAKE * 2, "both stakes forwarded to arena");
    }

    function test_acceptChallengeFor_unauthorizedExecutor_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        vm.prank(carol);
        vm.expectRevert("Not authorized executor");
        rooms.acceptChallengeFor(bob, ROOM_ID, BATTLE_ID, BETTING_WINDOW, ROUND_DURATION, 1_000_000);
    }

    // ─── Authorization management ─────────────────────────────────────────────

    function test_authorizeExecutor_onlyAgentOwner() public {
        // Alice authorizes agentDM only for herself
        vm.prank(alice);
        rooms.authorizeExecutor(agentDM, true);

        assertTrue(rooms.isAuthorizedExecutor(alice, agentDM));
        assertFalse(rooms.isAuthorizedExecutor(bob, agentDM)); // not for bob
    }

    function test_isAuthorizedExecutor_delegationManagerGlobal() public view {
        // DelegationManager is trusted for any agent
        assertTrue(rooms.isAuthorizedExecutor(alice, dm));
        assertTrue(rooms.isAuthorizedExecutor(bob, dm));
        assertTrue(rooms.isAuthorizedExecutor(carol, dm)); // even unregistered agents
    }

    function test_setDelegationManager_onlyOwner() public {
        address newDM = makeAddr("newDM");
        vm.prank(alice);
        vm.expectRevert();
        rooms.setDelegationManager(newDM);

        rooms.setDelegationManager(newDM); // owner can
        assertEq(rooms.delegationManager(), newDM);
    }

    // ─── Cancel challenge ─────────────────────────────────────────────────────

    function test_cancelChallenge() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        uint256 balBefore = usdc.balanceOf(alice);
        rooms.cancelChallenge(ROOM_ID);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), balBefore + STAKE, "stake refunded");
        assertEq(uint(rooms.getRoom(ROOM_ID).state), uint(HotTakeRooms.RoomState.CANCELLED));
    }

    function test_cancelChallenge_notCreator_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert("Only creator can cancel");
        rooms.cancelChallenge(ROOM_ID);
    }

    // ─── Gas smoke test ───────────────────────────────────────────────────────

    function test_gas_directIssue() public {
        vm.startPrank(alice);
        usdc.approve(address(rooms), STAKE);
        uint256 g = gasleft();
        rooms.issueChallenge(ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        emit log_named_uint("gas: issueChallenge (direct)", g - gasleft());
        vm.stopPrank();
    }

    function test_gas_delegatedIssue() public {
        // Simulate bundle: approve first (call 1), then issueChallengeFor (call 2)
        vm.prank(alice);
        usdc.approve(address(rooms), STAKE);

        vm.prank(dm);
        uint256 g = gasleft();
        rooms.issueChallengeFor(alice, ROOM_ID, TOPIC_HASH, TOPIC, CATEGORY_HASH, STAKE);
        emit log_named_uint("gas: issueChallengeFor (delegated, wallet-level)", g - gasleft());
    }
}

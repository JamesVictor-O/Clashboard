// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentTreasury.sol";
import "../src/ClashboardArena.sol";
import "../src/HotTakeRooms.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey     = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerWallet  = vm.addr(deployerKey);
        // Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
        address usdcAddress     = vm.envAddress("USDC_ADDRESS");
        address platformWallet  = vm.envAddress("PLATFORM_TREASURY_ADDRESS");
        address schedulerWallet = vm.envAddress("SCHEDULER_ADDRESS");

        vm.startBroadcast(deployerKey);

        // 1. Registry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry:  ", address(registry));

        // 2. Treasury
        AgentTreasury treasury = new AgentTreasury(usdcAddress);
        console.log("AgentTreasury:  ", address(treasury));

        // 3. Arena
        ClashboardArena arena = new ClashboardArena(
            usdcAddress,
            address(registry),
            address(treasury),
            platformWallet,
            schedulerWallet
        );
        console.log("ClashboardArena:", address(arena));

        // 4. HotTakeRooms
        HotTakeRooms rooms = new HotTakeRooms(
            usdcAddress,
            address(registry),
            address(treasury),
            address(arena)
        );
        console.log("HotTakeRooms:   ", address(rooms));

        // 5. Wire authorisations
        registry.setAuthorisedContract(address(arena), true);
        treasury.setAuthorisedContract(address(arena), true);
        treasury.setAuthorisedContract(address(rooms), true);

        // 6. Link HotTakeRooms into Arena so createBattleFromRoom is gated correctly
        arena.setHotTakeRooms(address(rooms));

        console.log("\n=== Deployment complete ===");
        console.log("Deployer:        ", deployerWallet);
        console.log("USDC:            ", usdcAddress);
        console.log("Platform wallet: ", platformWallet);
        console.log("Scheduler:       ", schedulerWallet);

        vm.stopBroadcast();
    }
}

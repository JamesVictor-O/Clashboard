// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ClashboardArena.sol";

/// @notice Deployment script for ClashboardArena.
///
/// Usage:
///   Testnet (Celo Alfajores):
///     forge script script/Deploy.s.sol --rpc-url alfajores --broadcast --verify
///
///   Mainnet (Celo):
///     forge script script/Deploy.s.sol --rpc-url celo --broadcast --verify
///
/// Required env vars:
///   PRIVATE_KEY          — deployer private key
///   TREASURY_ADDRESS     — platform treasury address
///   USDC_ADDRESS         — USDC token address on target chain
///                          Alfajores mock: deploy MockUSDC or use existing testnet USDC
///                          Mainnet: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C (native USDC on Celo)
contract DeployScript is Script {
    // Native USDC on Celo mainnet
    address constant CELO_MAINNET_USDC = 0xcebA9300f2b948710d2653dD7B07f33A8B32118C;

    // Celo Alfajores testnet USDC (deploy MockUSDC if not available)
    address constant ALFAJORES_USDC = 0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address treasury    = vm.envAddress("TREASURY_ADDRESS");

        // Determine USDC address based on chain
        uint256 chainId = block.chainid;
        address usdcAddress;

        if (chainId == 42220) {
            // Celo mainnet
            usdcAddress = vm.envOr("USDC_ADDRESS", CELO_MAINNET_USDC);
            console.log("Deploying to Celo Mainnet");
        } else if (chainId == 44787) {
            // Celo Alfajores testnet
            usdcAddress = vm.envOr("USDC_ADDRESS", ALFAJORES_USDC);
            console.log("Deploying to Celo Alfajores Testnet");
        } else {
            // Local / other — require explicit USDC address
            usdcAddress = vm.envAddress("USDC_ADDRESS");
            console.log("Deploying to chain:", chainId);
        }

        console.log("USDC address:    ", usdcAddress);
        console.log("Treasury address:", treasury);

        vm.startBroadcast(deployerKey);

        ClashboardArena arena = new ClashboardArena(usdcAddress, treasury);

        vm.stopBroadcast();

        console.log("ClashboardArena deployed at:", address(arena));
        console.log("Owner:", arena.owner());

        // Write deployment info to stdout for CI/CD capture
        console.log("---");
        console.log("NEXT_PUBLIC_ARENA_CONTRACT=", address(arena));
        console.log("NEXT_PUBLIC_USDC_ADDRESS=", usdcAddress);
        console.log("NEXT_PUBLIC_CHAIN_ID=", chainId);
    }
}

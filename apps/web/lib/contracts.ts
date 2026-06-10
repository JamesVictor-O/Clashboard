/**
 * Public chain and contract constants — committed directly to the repo.
 *
 * These were previously NEXT_PUBLIC_* environment variables, which meant
 * every deployment (local, Vercel preview, prod) needed them set manually.
 * Since they are not secrets and are static per chain, they live here instead.
 *
 * Base Sepolia (chain 84532) deployment.
 */

export const CHAIN_ID: number = 84532;

export const ARENA_CONTRACT        = "0xb657eC98149a202277588819c4302d7Fe596F7ac" as `0x${string}`;
export const REGISTRY_CONTRACT     = "0xF96197F51E374fC6Ad361B30C5232AD4ed14c8fF" as `0x${string}`;
export const TREASURY_CONTRACT     = "0x2E48B58ADd4e995dD7F8EB3dDf3ccb9031c07e48" as `0x${string}`;
export const HOTTAKEROOMS_CONTRACT = "0x888B974a4BdcfAF7586B13C511e26d8dBdaFbF70" as `0x${string}`;
export const USDC_ADDRESS          = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;

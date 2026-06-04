import { privateKeyToAccount } from "viem/accounts";

let signerLogEmitted = false;

export function getFacilitatorSignerAddress(): `0x${string}` {
  const explicit =
    process.env.FACILITATOR_SIGNER_ADDRESS ??
    process.env.ONESHOT_EXECUTOR_ADDRESS ??
    process.env.NEXT_PUBLIC_ONESHOT_EXECUTOR_ADDRESS;
  if (explicit && /^0x[0-9a-fA-F]{40}$/.test(explicit)) {
    return explicit as `0x${string}`;
  }

  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    return privateKeyToAccount(privateKey as `0x${string}`).address;
  }

  throw new Error(
    "FACILITATOR_SIGNER_ADDRESS, ONESHOT_EXECUTOR_ADDRESS, or FACILITATOR_PRIVATE_KEY must be configured for custom x402 settlement"
  );
}

export function getFacilitatorPrivateKey(): `0x${string}` | null {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  return privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey)
    ? (privateKey as `0x${string}`)
    : null;
}

export function logFacilitatorRedeemerAddresses(params: {
  relayerTargetAddress?: `0x${string}`;
}) {
  if (signerLogEmitted) return;
  signerLogEmitted = true;

  const facilitatorSigner = getFacilitatorSignerAddress();
  // IMPORTANT:
  // Buyers must scope the x402 redelegation to the address that redeems the
  // delegation. For our custom facilitator, we advertise FACILITATOR_SIGNER_ADDRESS
  // in /supported and the buyer redelegates to that address. The 1Shot public
  // relayer broadcasts the transaction, but the delegation authority must match
  // the effective redeemer accepted by the relayer/DelegationManager path. If
  // 1Shot requires targetAddress to be the redeemer in a future API revision,
  // FACILITATOR_SIGNER_ADDRESS must be set to that advertised targetAddress.
  console.info("[x402 facilitator] redeemer check", {
    facilitatorSigner,
    oneShotRelayerTargetAddress: params.relayerTargetAddress,
  });
}

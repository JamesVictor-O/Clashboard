"use client";

interface TxLinkProps {
  hash: string;
  short?: boolean;
}

/**
 * Block explorer link with hash display.
 * short=true shows truncated hash inline.
 */
export function TxLink({ hash, short = false }: TxLinkProps) {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
  const explorerBase =
    chainId === 8453
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";

  const url = `${explorerBase}/tx/${hash}`;
  const display = short ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-clash-gold hover:text-clash-gold/80 transition-colors"
      title={hash}
    >
      <span>{display}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
        <path
          d="M1 9L9 1M9 1H3M9 1V7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

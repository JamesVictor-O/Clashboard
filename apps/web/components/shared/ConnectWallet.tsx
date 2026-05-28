"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getEthereum(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthProvider }).ethereum;
}

/**
 * Wallet connect button that uses window.ethereum directly.
 * The MetaMask SDK wraps window.ethereum but shows an "choose extension" modal
 * when multiple wallets are installed — bypassing it avoids that popup.
 */
export function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    // eth_accounts never pops a prompt — returns already-connected accounts
    eth.request({ method: "eth_accounts" }).then((accs) => {
      const list = accs as string[];
      if (list[0]) setAddress(list[0]);
    }).catch(() => {});

    // Keep UI in sync when user switches or disconnects in MetaMask
    const onAccountsChanged = (accs: unknown) => {
      const list = accs as string[];
      setAddress(list[0] ?? null);
    };
    eth.on("accountsChanged", onAccountsChanged);
    return () => eth.removeListener("accountsChanged", onAccountsChanged);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const eth = getEthereum();
      if (!eth) throw new Error("No wallet detected. Install MetaMask Flask.");

      // eth_requestAccounts asks the user to connect — no MetaMask SDK modal
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("No accounts returned");
      setAddress(accounts[0]);

      // Switch to the target chain
      const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532";
      const hex = `0x${parseInt(chainId).toString(16)}`;
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      } catch (switchErr) {
        if ((switchErr as { code?: number }).code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hex,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            }],
          });
        }
        // ignore other switch errors (e.g. user rejected chain switch)
      }
    } catch (err) {
      if ((err as { code?: number }).code !== 4001) {
        // 4001 = user rejected — don't show an error for that
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => setAddress(null);

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {address ? (
          <motion.button
            key="connected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={handleDisconnect}
            className="flex items-center gap-2 bg-clash-dim border border-white/10 hover:border-white/30 rounded-lg px-3 py-2 transition-all group"
          >
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-body text-sm text-clash-white font-mono">
              {shortAddress}
            </span>
            <span className="font-body text-xs text-white/30 group-hover:text-white/60 transition-colors">
              ✕
            </span>
          </motion.button>
        ) : (
          <motion.button
            key="disconnected"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={handleConnect}
            disabled={isConnecting}
            className="btn-primary text-sm py-2 px-4"
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-clash-black/30 border-t-clash-black rounded-full animate-spin" />
                Connecting...
              </span>
            ) : (
              "Connect Wallet"
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-full right-0 mt-2 bg-clash-red/90 text-white text-xs font-body px-3 py-1.5 rounded-lg whitespace-nowrap z-50"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

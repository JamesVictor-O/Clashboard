"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { connectWallet, getProvider, getSelectedWalletAddress, checkSmartAccountStatus } from "@/lib/metamask";
import { CHAIN_ID } from "@/lib/contracts";

/**
 * Wallet connect button that uses window.ethereum directly.
 * The MetaMask SDK wraps window.ethereum but shows an "choose extension" modal
 * when multiple wallets are installed — bypassing it avoids that popup.
 *
 * After connecting (or on load if already connected), silently checks whether
 * the EOA has been upgraded to a MetaMask 7702 smart account and shows a
 * compact status badge.
 */
export function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saActive, setSaActive] = useState<boolean | null>(null);

  const runSmartAccountCheck = useCallback(async (addr: string) => {
    try {
      const status = await checkSmartAccountStatus(addr);
      setSaActive(status.isValid7702Implementation);
    } catch {
      // Non-fatal — badge stays hidden if RPC fails
    }
  }, []);

  useEffect(() => {
    const eth = getProvider();
    if (!eth) return;

    const selected = getSelectedWalletAddress();
    if (selected) {
      setAddress(selected);
      void runSmartAccountCheck(selected);
    }

    // Keep UI in sync when user switches or disconnects in MetaMask
    const onAccountsChanged = (accs: unknown) => {
      const list = accs as string[];
      const addr = list[0] ?? null;
      setAddress(addr);
      setSaActive(null);
      if (addr) void runSmartAccountCheck(addr);
    };
    eth.on?.("accountsChanged", onAccountsChanged);
    return () => eth.removeListener?.("accountsChanged", onAccountsChanged);
  }, [runSmartAccountCheck]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const eth = getProvider();
      if (!eth) throw new Error("MetaMask not detected. Install MetaMask Flask.");

      // Only this button click may request accounts.
      const accounts = await connectWallet();
      if (!accounts[0]) throw new Error("No accounts returned");
      setAddress(accounts[0]);

      // Switch to the target chain
      const chainId = String(CHAIN_ID);
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

      // Check smart account status after successful connect
      void runSmartAccountCheck(accounts[0]);
    } catch (err) {
      if ((err as { code?: number }).code !== 4001) {
        // 4001 = user rejected — don't show an error for that
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress(null);
    setSaActive(null);
  };

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
            {/* Smart account upgrade badge */}
            {saActive !== null && (
              <motion.span
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                title={saActive ? "Smart account active (EIP-7702)" : "Smart account not yet activated — set a budget to upgrade"}
                className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border leading-none"
                style={
                  saActive
                    ? { color: "#22c55e", borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.07)" }
                    : { color: "#f59e0b", borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.07)" }
                }
              >
                {saActive ? "SA" : "!SA"}
              </motion.span>
            )}
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

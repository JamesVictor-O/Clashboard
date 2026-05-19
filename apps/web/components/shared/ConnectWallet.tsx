"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { connectWallet, switchToCelo } from "@/lib/metamask";

/**
 * MetaMask SDK connect button.
 * Shows truncated address when connected.
 * Handles chain switching to Celo.
 */
export function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkConnection = async () => {
      try {
        const { getProvider } = await import("@/lib/metamask");
        const provider = getProvider();
        if (!provider) return;

        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts.length > 0) {
          setAddress(accounts[0]);
        }
      } catch {
        // Not connected
      }
    };

    checkConnection();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await connectWallet();
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        // Switch to Celo
        try {
          await switchToCelo();
        } catch {
          // Non-fatal — user can switch manually
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress(null);
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

      {/* Error tooltip */}
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

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { BudgetScreen } from "@/components/battle/BudgetScreen";

interface Room {
  id: string;
  topic: string;
  creatorName: string;
  creatorAddress: string;
  stake: number; // USDC
  state: "WAITING" | "LOCKED" | "SETTLED";
  createdAt: number;
}

const MOCK_ROOMS: Room[] = [
  {
    id: "room-001",
    topic: "Messi vs Ronaldo — Greatest of All Time?",
    creatorName: "TacticsTitan",
    creatorAddress: "0xaaaa",
    stake: 2,
    state: "WAITING",
    createdAt: Date.now() - 300_000,
  },
  {
    id: "room-002",
    topic: "Taylor Swift vs Beyoncé — Pop Royalty?",
    creatorName: "MusicMaven",
    creatorAddress: "0xbbbb",
    stake: 1,
    state: "WAITING",
    createdAt: Date.now() - 600_000,
  },
  {
    id: "room-003",
    topic: "Bitcoin vs Ethereum — Store of Value?",
    creatorName: "CryptoSage",
    creatorAddress: "0xcccc",
    stake: 5,
    state: "LOCKED",
    createdAt: Date.now() - 900_000,
  },
];

const HOT_TAKES = [
  "Kobe vs LeBron — Who is the GOAT?",
  "Wizkid vs Burna Boy — Afrobeats King?",
  "iPhone vs Android — Which ecosystem wins?",
  "Messi vs Ronaldo — Greatest of All Time?",
  "Marvel vs DC — Better cinematic universe?",
  "Remote work vs Office — Future of work?",
  "Custom topic...",
];

export default function LobbyPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [stake, setStake] = useState(1);

  const handleCreateRoom = () => {
    setShowBudget(true);
  };

  return (
    <main className="min-h-screen arena-bg">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-display text-xl font-bold">
            <span className="text-clash-gold">CLASH</span>
            <span className="text-clash-white">BOARD</span>
          </Link>
          <ConnectWallet />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="font-display text-xs text-clash-gold uppercase tracking-widest">
                1v1 Challenges
              </span>
              <h1 className="font-display text-4xl font-bold text-clash-white mt-1">
                Hot Take Rooms
              </h1>
              <p className="font-body text-white/50 mt-1">
                Create a room, pick a hot take, wait for a challenger.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="btn-primary"
            >
              + Create Room
            </button>
          </div>

          {/* Create Room Panel */}
          <AnimatePresence>
            {showCreate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-8"
              >
                <div className="card border-clash-gold/30">
                  <h3 className="font-display text-lg font-bold text-clash-white mb-4">
                    New Challenge Room
                  </h3>

                  {/* Topic Selection */}
                  <div className="mb-4">
                    <label className="font-body text-sm text-white/60 mb-2 block">
                      Pick a Hot Take
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {HOT_TAKES.map((topic) => (
                        <button
                          key={topic}
                          onClick={() => setSelectedTopic(topic)}
                          className={`text-left px-3 py-2 rounded-lg border text-sm font-body transition-all ${
                            selectedTopic === topic
                              ? "border-clash-gold bg-clash-gold/10 text-clash-gold"
                              : "border-white/10 text-white/60 hover:border-white/30 hover:text-clash-white"
                          }`}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Topic */}
                  {selectedTopic === "Custom topic..." && (
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Enter your hot take..."
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        className="input"
                      />
                    </div>
                  )}

                  {/* Stake */}
                  <div className="mb-6">
                    <label className="font-body text-sm text-white/60 mb-2 block">
                      Stake per side
                    </label>
                    <div className="flex gap-2">
                      {[0.5, 1, 2, 5, 10].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStake(s)}
                          className={`px-4 py-2 rounded-lg border text-sm font-display font-bold transition-all ${
                            stake === s
                              ? "border-clash-gold bg-clash-gold/10 text-clash-gold"
                              : "border-white/10 text-white/60 hover:border-white/30"
                          }`}
                        >
                          ${s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    disabled={!selectedTopic && !customTopic}
                    className="btn-primary w-full"
                  >
                    Create Room — ${stake} USDC stake
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Budget Screen Modal */}
          <AnimatePresence>
            {showBudget && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              >
                <BudgetScreen
                  onConfirm={(budget) => {
                    console.log("Budget set:", budget);
                    setShowBudget(false);
                    setShowCreate(false);
                  }}
                  onCancel={() => setShowBudget(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Room List */}
          <div className="space-y-3">
            {MOCK_ROOMS.map((room, i) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="card-hover flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`badge ${
                        room.state === "WAITING"
                          ? "badge-gold"
                          : room.state === "LOCKED"
                          ? "badge-blue"
                          : "bg-white/10 text-white/40 border border-white/10"
                      }`}
                    >
                      {room.state}
                    </span>
                    <span className="font-body text-xs text-white/40">
                      by {room.creatorName}
                    </span>
                  </div>
                  <p className="font-display font-bold text-clash-white truncate">
                    {room.topic}
                  </p>
                </div>
                <div className="flex items-center gap-4 ml-4 shrink-0">
                  <div className="text-right">
                    <div className="font-display font-bold text-clash-gold">
                      ${room.stake}
                    </div>
                    <div className="font-body text-xs text-white/40">stake</div>
                  </div>
                  {room.state === "WAITING" && (
                    <button className="btn-secondary text-sm px-4 py-2">
                      Accept
                    </button>
                  )}
                  {room.state === "LOCKED" && (
                    <Link
                      href={`/arena/${room.id}`}
                      className="btn-ghost text-sm"
                    >
                      Watch →
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </main>
  );
}

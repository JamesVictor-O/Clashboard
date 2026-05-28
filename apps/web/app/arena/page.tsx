import { redirect } from "next/navigation";

export default function ArenaPage() {
  redirect("/game-lobby#live-battles");
}

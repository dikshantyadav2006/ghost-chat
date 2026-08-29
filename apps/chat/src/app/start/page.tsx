"use client";

import { useIdentity } from "@/lib/useIdentity";
import Onboarding from "@/components/Onboarding";
import HomeScreen from "@/components/HomeScreen";

export default function StartPage() {
  const { identity, ready } = useIdentity();

  if (!ready) {
    return (
      <div className="chat-bg flex h-full items-center justify-center text-[#8696a0]">
        Loading…
      </div>
    );
  }

  if (!identity) {
    return <Onboarding onDone={() => undefined} />;
  }

  return <HomeScreen identity={identity} />;
}
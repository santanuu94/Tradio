"use client";

import { useState, useEffect, useCallback } from "react";
import { Sakura, Mascot } from "./visuals";
import DashboardV2 from "./DashboardV2";

export default function Root() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (e) {
      console.error("Poll failed:", e);
      // keep existing data if we had it
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 6000);
    return () => clearInterval(id);
  }, [poll]);

  if (loading || !data) {
    return <LoadingScreen />;
  }

  return <DashboardV2 data={data} />;
}

// ---------------------------------------------------------------------------
// Loading screen with mascot
// ---------------------------------------------------------------------------
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 relative">
      <Sakura />

      <Mascot size={140} mood="happy" />

      <div className="text-center">
        <h1 className="font-display text-4xl tracking-tight text-ink mb-1">
          Tradio
        </h1>
        <p className="text-inksoft text-sm font-medium">
          Waking up the bot&hellip;
        </p>
      </div>

      {/* Pulsing loading bar */}
      <div className="w-40 h-1.5 rounded-full bg-sakurasoft/60 overflow-hidden mt-2">
        <div
          className="h-full rounded-full bg-sakura"
          style={{
            animation: "loadbar 1.8s ease-in-out infinite",
            width: "40%",
          }}
        />
      </div>

      <style>{`
        @keyframes loadbar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

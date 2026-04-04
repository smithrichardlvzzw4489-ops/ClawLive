"use client";

import { useEffect, useState } from "react";
import { shouldShowQuestNavBadge } from "@/lib/client-engagement";

export function NavQuestBadge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sync = () => setShow(shouldShowQuestNavBadge());
    sync();
    window.addEventListener("vibekids-weekly-updated", sync);
    return () => window.removeEventListener("vibekids-weekly-updated", sync);
  }, []);

  if (!show) return null;
  return (
    <span
      className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"
      title="本周挑战未完成"
      aria-hidden
    />
  );
}

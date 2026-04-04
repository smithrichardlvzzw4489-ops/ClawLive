"use client";

import { useEffect } from "react";
import { maybeFireStreakReminder } from "@/lib/client-engagement";

/** 定时检查是否弹出浏览器通知（需已授权），用于连续登录回访 */
export function EngagementReminder() {
  useEffect(() => {
    maybeFireStreakReminder();
    const id = window.setInterval(() => {
      maybeFireStreakReminder();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

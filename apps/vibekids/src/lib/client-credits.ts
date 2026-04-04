"use client";

const KEY = "vibekids-client-id-v1";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

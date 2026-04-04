"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AgeBand } from "@/lib/vibekids/age";
import { ageLabel, parseAgeBand } from "@/lib/vibekids/age";
import {
  CREATIVE_KINDS,
  VIBE_STYLES,
  type CreativeKind,
  type VibeStyle,
} from "@/lib/vibekids/creative";
import { VK_API_BASE } from "@/lib/vibekids/constants";
import { welcomeHtml } from "@/lib/vibekids/demo-html";
import { PreviewFrame } from "@/components/vibekids/PreviewFrame";
import { GenerationSkeleton } from "@/components/vibekids/GenerationSkeleton";
import { GamificationBar } from "@/components/vibekids/GamificationBar";
import { WeeklyQuestsPanel } from "@/components/vibekids/WeeklyQuestsPanel";
import {
  bumpWeeklyGen,
  bumpWeeklySave,
  getPromptHistory,
  pushPromptHistory,
} from "@/lib/vibekids/client-engagement";
import { getClientId } from "@/lib/vibekids/client-credits";
import {
  consumeSpotlightCredit,
  earnCreatorPoints,
  hasSpotlightCredit,
} from "@/lib/vibekids/client-rewards";
import {
  getEngagementNudge,
  loadGamification,
  touchStreak,
  recordGenerationSuccess,
  recordSaveSuccess,
  loadDraft,
  saveDraft,
  clearDraft,
  type GamificationState,
} from "@/lib/vibekids/client-gamification";
import {
  ENCOURAGEMENTS,
  NEXT_EDIT_SUGGESTIONS,
  randomPick,
  randomPickN,
} from "@/data/vibekids/gamification-messages";

const CHIPS_PRIMARY = [
  "?????",
  "?????",
  "?????",
  "??????",
  "???????",
];

const CHIPS_MIDDLE = [
  "?????",
  "????",
  "??????",
  "???????",
  "????",
  "???????",
];

const ALL_CHIPS = [...CHIPS_PRIMARY, ...CHIPS_MIDDLE];

function mergeChip(current: string, chip: string): string {
  const t = current.trim();
  if (!t) return chip;
  if (t.includes(chip)) return t;
  return `${t}?${chip}`;
}

type Vers = { list: string[]; index: number };

function initialVers(): Vers {
  return { list: [welcomeHtml()], index: 0 };
}

export function StudioClient() {
  const sp = useSearchParams();
  const age: AgeBand = useMemo(
    () => parseAgeBand(sp.get("age")),
    [sp],
  );

  const chips = age === "middle" ? CHIPS_MIDDLE : CHIPS_PRIMARY;

  const [prompt, setPrompt] = useState("");
  const promptSeeded = useRef(false);

  useEffect(() => {
    if (promptSeeded.current) return;
    const raw = sp.get("prompt");
    if (!raw) return;
    try {
      setPrompt(decodeURIComponent(raw));
      promptSeeded.current = true;
    } catch {
      setPrompt(raw);
      promptSeeded.current = true;
    }
  }, [sp]);
  const [kind, setKind] = useState<CreativeKind>("any");
  const [styles, setStyles] = useState<VibeStyle[]>([]);

  const [vers, setVers] = useState<Vers>(initialVers);
  const html = vers.list[vers.index] ?? welcomeHtml();

  const [loading, setLoading] = useState<null | "create" | "refine">(null);
  const [outMode, setOutMode] = useState<"idle" | "demo" | "ai">("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const [refinePrompt, setRefinePrompt] = useState("");
  const [lockHint, setLockHint] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [gState, setGState] = useState<GamificationState>(loadGamification);
  const [nextChips, setNextChips] = useState<string[]>([]);
  const [promptHist, setPromptHist] = useState<string[]>([]);
  const draftRestored = useRef(false);

  const [creditsInfo, setCreditsInfo] = useState<{
    balance: number;
    costCreate: number;
    costRefine: number;
  } | null>(null);

  const refreshCredits = useCallback(() => {
    const id = getClientId();
    if (!id) return;
    void fetch(`${VK_API_BASE}/credits?clientId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(
        (d: {
          balance?: unknown;
          costCreate?: unknown;
          costRefine?: unknown;
        }) => {
          if (
            typeof d.balance === "number" &&
            typeof d.costCreate === "number" &&
            typeof d.costRefine === "number"
          ) {
            setCreditsInfo({
              balance: d.balance,
              costCreate: d.costCreate,
              costRefine: d.costRefine,
            });
          }
        },
      )
      .catch(() => {
        /* */
      });
  }, []);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  useEffect(() => {
    setGState(touchStreak());
  }, []);

  useEffect(() => {
    setPromptHist(getPromptHistory());
  }, []);

  useEffect(() => {
    const up = () => setGState(loadGamification());
    window.addEventListener("vibekids-gamification-refresh", up);
    return () => window.removeEventListener("vibekids-gamification-refresh", up);
  }, []);

  useEffect(() => {
    if (draftRestored.current) return;
    if (sp.get("prompt")) return;
    const d = loadDraft();
    if (!d || d.age !== age) return;
    draftRestored.current = true;
    setPrompt(d.prompt);
    setKind(d.kind);
    setStyles(d.styles);
    setSaveTitle(d.saveTitle);
    setRefinePrompt(d.refinePrompt);
    setLockHint(d.lockHint);
    const list = d.versList.length ? d.versList : [welcomeHtml()];
    const idx = Math.min(Math.max(0, d.versIndex), list.length - 1);
    setVers({ list, index: idx });
    setOutMode("demo");
  }, [age, sp]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const list = vers.list.slice(-2);
      const idx = Math.min(vers.index, list.length - 1);
      saveDraft({
        prompt,
        kind,
        styles,
        age,
        saveTitle,
        refinePrompt,
        lockHint,
        versList: list,
        versIndex: idx >= 0 ? idx : 0,
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [
    prompt,
    kind,
    styles,
    age,
    saveTitle,
    refinePrompt,
    lockHint,
    vers.list,
    vers.index,
  ]);

  const canUndo = vers.index > 0;
  const canRedo = vers.index < vers.list.length - 1;
  /** ?????????????????? */
  const canRefine = !(vers.list.length === 1 && vers.index === 0);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (canRefine) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [canRefine]);

  const pushVersion = useCallback((nextHtml: string) => {
    setVers((v) => {
      const list = v.list.slice(0, v.index + 1);
      list.push(nextHtml);
      return { list, index: list.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setVers((v) => ({ ...v, index: Math.max(0, v.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    setVers((v) => ({
      ...v,
      index: Math.min(v.list.length - 1, v.index + 1),
    }));
  }, []);

  const handleApiResponse = useCallback(
    (
      data: {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        creditsBalance?: number;
      },
      opts?: { intent?: "create" | "refine" },
    ) => {
      if (!data.html) return false;
      if (typeof data.creditsBalance === "number") {
        setCreditsInfo((prev) =>
          prev ?
            { ...prev, balance: data.creditsBalance! }
          : {
              balance: data.creditsBalance!,
              costCreate: 10,
              costRefine: 6,
            },
        );
      }
      pushVersion(data.html);
      setOutMode(data.mode === "ai" ? "ai" : "demo");
      if (data.warning === "ai_failed" && data.detail) {
        const tech = data.detail.slice(0, 200);
        const extra = data.hint ? ` ${data.hint}` : "";
        setNotice(`AI ?????????????????????${tech}${extra}`);
        setNextChips([]);
      } else if (data.warning === "refine_needs_ai" && data.detail) {
        setNotice(data.detail);
        setNextChips([]);
      } else if (!data.warning) {
        const r = recordGenerationSuccess();
        setGState(r.state);
        bumpWeeklyGen();
        if (opts?.intent !== "refine") {
          pushPromptHistory(prompt.trim());
          setPromptHist(getPromptHistory());
        }
        setNextChips(randomPickN(NEXT_EDIT_SUGGESTIONS, 3));
        const base = randomPick(ENCOURAGEMENTS);
        const xpParts = [`+${r.totalXp} XP`];
        if (r.megaCrit) xpParts.push("????");
        if (r.weekendBoost) xpParts.push("???1.5");
        setNotice(`${base}?${xpParts.join(" ? ")}?`);
      } else {
        setNotice(null);
        setNextChips([]);
      }
      return true;
    },
    [prompt, pushVersion],
  );

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      setNotice("??????????????????????");
      return;
    }
    setLoading("create");
    setNotice(null);
    try {
      const res = await fetch(`${VK_API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "create",
          prompt: text,
          ageBand: age,
          kind,
          styles,
          clientId: getClientId(),
        }),
      });
      const data = (await res.json()) as {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        creditsBalance?: number;
        error?: string;
        balance?: number;
        need?: number;
        costCreate?: number;
        costRefine?: number;
      };
      if (res.status === 402 && data.error === "insufficient_credits") {
        setNotice(
          `??????????? ${data.need ?? "?"}??? ${data.balance ?? 0}????? AI ??????????? OpenRouter ????????????`,
        );
        if (typeof data.balance === "number") {
          setCreditsInfo((prev) =>
            prev ?
              { ...prev, balance: data.balance! }
            : {
                balance: data.balance!,
                costCreate: data.costCreate ?? 10,
                costRefine: data.costRefine ?? 6,
              },
          );
        }
        return;
      }
      if (res.status === 400 && data.error === "client_id_required") {
        setNotice(data.detail ?? "?????????");
        return;
      }
      if (!res.ok || !data.html) {
        setNotice("???????????");
        return;
      }
      handleApiResponse(data, { intent: "create" });
    } catch {
      setNotice("???????????????");
    } finally {
      setLoading(null);
    }
  }, [age, handleApiResponse, kind, prompt, styles]);

  const applyRefine = useCallback(async () => {
    const r = refinePrompt.trim();
    if (!r) {
      setNotice("????????????????????????????");
      return;
    }
    if (!canRefine) {
      setNotice("??????????????????????????");
      return;
    }
    setLoading("refine");
    setNotice(null);
    try {
      const res = await fetch(`${VK_API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "refine",
          ageBand: age,
          currentHtml: html,
          refinementPrompt: r,
          lockHint: lockHint.trim() || undefined,
          clientId: getClientId(),
        }),
      });
      const data = (await res.json()) as {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        creditsBalance?: number;
        error?: string;
        balance?: number;
        need?: number;
        costCreate?: number;
        costRefine?: number;
      };
      if (res.status === 402 && data.error === "insufficient_credits") {
        setNotice(
          `????????????? ${data.need ?? "?"}??? ${data.balance ?? 0}??`,
        );
        if (typeof data.balance === "number") {
          setCreditsInfo((prev) =>
            prev ?
              { ...prev, balance: data.balance! }
            : {
                balance: data.balance!,
                costCreate: data.costCreate ?? 10,
                costRefine: data.costRefine ?? 6,
              },
          );
        }
        return;
      }
      if (res.status === 400 && data.error === "client_id_required") {
        setNotice(data.detail ?? "?????????");
        return;
      }
      if (!res.ok || !data.html) {
        setNotice("???????????");
        return;
      }
      handleApiResponse(data, { intent: "refine" });
      if (data.warning !== "ai_failed" && data.warning !== "refine_needs_ai") {
        setRefinePrompt("");
      }
    } catch {
      setNotice("???????????????");
    } finally {
      setLoading(null);
    }
  }, [age, canRefine, handleApiResponse, html, lockHint, refinePrompt]);

  const clearAll = useCallback(() => {
    setVers(initialVers());
    setOutMode("idle");
    setNotice(null);
    setRefinePrompt("");
    setLockHint("");
    setSaveTitle("");
    setNextChips([]);
    clearDraft();
  }, []);

  const saveWork = useCallback(async () => {
    if (!canRefine) {
      setNotice("???????????????");
      return;
    }
    setSaving(true);
    setNotice(null);
    const useSpotlight = hasSpotlightCredit();
    try {
      const res = await fetch(`${VK_API_BASE}/works`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          ageBand: age,
          prompt: prompt.trim() || undefined,
          kind,
          title: saveTitle.trim() || undefined,
          spotlightRequested: useSpotlight,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: string;
        title?: string;
        error?: string;
        detail?: string;
        qualityScore?: number;
        rewardPointsEarned?: number;
      };
      if (!res.ok) {
        const msg =
          data.error === "storage_failed" ?
            `????????????????????????????????????${data.detail ? ` ${data.detail}` : ""}`
          : data.error === "html_too_large" ?
            "??????????????"
          : (data.error ?? "????");
        setNotice(msg);
        return;
      }
      if (data.ok && data.id) {
        if (useSpotlight) consumeSpotlightCredit();
        if (typeof data.rewardPointsEarned === "number") {
          earnCreatorPoints(data.rewardPointsEarned);
        }
        const r = recordSaveSuccess();
        setGState(r.state);
        bumpWeeklySave();
        const xpParts = [`+${r.totalXp} XP`];
        if (r.megaCrit) xpParts.push("????");
        if (r.weekendBoost) xpParts.push("???1.5");
        const qs =
          typeof data.qualityScore === "number" ?
            ` ??? ${data.qualityScore}`
          : "";
        const rp =
          typeof data.rewardPointsEarned === "number" ?
            ` ? ???? +${data.rewardPointsEarned}`
          : "";
        const spot =
          useSpotlight ? " ? ?????????????????" : "";
        setNotice(
          `????${data.title ?? "??"}??${qs}${rp}${spot} ${xpParts.join(" ? ")}??????????????????????/works/${data.id}`,
        );
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("VibeKids", { body: `????${data.title ?? "??"}` });
        }
      }
    } catch {
      setNotice("???????????");
    } finally {
      setSaving(false);
    }
  }, [age, canRefine, html, kind, prompt, saveTitle]);

  const toggleStyle = (id: VibeStyle) => {
    setStyles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:h-[calc(100dvh-3.25rem)] lg:flex-row lg:items-stretch lg:gap-0">
      <section className="flex w-full shrink-0 flex-col gap-4 border-b border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 lg:max-w-[min(22rem,100vw)] lg:border-b-0 lg:border-r lg:border-t-0 lg:border-l-0 lg:overflow-y-auto lg:py-5 lg:pl-2 lg:pr-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
            {ageLabel(age)}??
          </span>
          {age === "primary" ? (
            <span className="text-sm text-slate-600">???????????</span>
          ) : (
            <span className="text-sm text-slate-600">??????????</span>
          )}
        </div>

        <GamificationBar
          state={gState}
          nudge={getEngagementNudge(gState)}
        />

        {creditsInfo ? (
          <p className="rounded-2xl border border-sky-100 bg-sky-50/90 px-3 py-2 text-xs text-sky-950">
            <span className="font-semibold">????</span>{" "}
            <span className="tabular-nums font-bold">{creditsInfo.balance}</span>
            <span className="text-sky-800/85">
              {" "}
              ? ??? {creditsInfo.costCreate} / ? ? ????? {creditsInfo.costRefine}{" "}
              / ??? AI ?????????????
            </span>
          </p>
        ) : (
          <p className="text-xs text-slate-400">?????????</p>
        )}

        <WeeklyQuestsPanel />

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">????????????</p>
          <div className="flex flex-wrap gap-2">
            {CREATIVE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  kind === k.id
                    ? "border-sky-500 bg-sky-50 font-medium text-sky-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">???????</p>
          <div className="flex flex-wrap gap-2">
            {VIBE_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStyle(s.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  styles.includes(s.id)
                    ? "border-violet-500 bg-violet-50 font-medium text-violet-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">?????????</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPrompt((p) => mergeChip(p, c))}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const picks = randomPickN(ALL_CHIPS, 3);
                setPrompt((p) => picks.reduce((acc, c) => mergeChip(acc, c), p));
              }}
              disabled={loading !== null}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
            >
              ??? 3 ???
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt("");
                setNotice("???????????????????");
              }}
              disabled={loading !== null}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              ?????
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="prompt" className="text-sm font-medium text-slate-800">
            ????????????????
          </label>
          {promptHist.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="prompt-hist" className="text-xs text-slate-500">
                ????
              </label>
              <select
                id="prompt-hist"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setPrompt(v);
                  e.target.selectedIndex = 0;
                }}
                className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="">????????</option>
                {promptHist.map((h, i) => (
                  <option key={`${i}-${h.slice(0, 24)}`} value={h}>
                    {h.length > 52 ? `${h.slice(0, 52)}?` : h}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={age === "primary" ? 4 : 5}
            placeholder={
              age === "primary"
                ? "????????????????"
                : "??????????????????????????????"
            }
            className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-sky-400/40 focus:border-sky-400 focus:ring-4"
          />
        </div>

        {notice ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading !== null}
            className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-2.5 text-base font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
          >
            {loading === "create" ? "????" : "????"}
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo || loading !== null}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            ??
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || loading !== null}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            ??
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={loading !== null}
            className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
          >
            ??
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading !== null || !prompt.trim()}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-40"
          >
            ????
          </button>
        </div>

        {nextChips.length > 0 ? (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="mb-2 text-xs font-medium text-violet-900">????????????????</p>
            <div className="flex flex-wrap gap-2">
              {nextChips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setRefinePrompt(c)}
                  className="rounded-full border border-violet-200 bg-white px-4 py-1.5 text-left text-sm text-violet-900 sm:max-w-[14rem]"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-900">????</p>
          <p className="mb-3 text-xs text-emerald-800/90">
            ????????????????????????????????????????
          </p>
          <label htmlFor="save-title" className="mb-1 block text-xs font-medium text-emerald-900">
            ?????????????????
          </label>
          <input
            id="save-title"
            type="text"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="?????????"
            disabled={saving || loading !== null}
            className="mb-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void saveWork()}
            disabled={saving || loading !== null || !canRefine}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "????" : "????"}
          </button>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">????</p>
          <p className="mb-3 text-xs text-slate-500">
            ???????????????????????? API ?????
          </p>
          <label htmlFor="refine" className="sr-only">
            ????
          </label>
          <textarea
            id="refine"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            rows={3}
            placeholder="????????????????????????????"
            className="mb-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <label htmlFor="lock" className="mb-1 block text-xs font-medium text-slate-600">
            ??????????
          </label>
          <textarea
            id="lock"
            value={lockHint}
            onChange={(e) => setLockHint(e.target.value)}
            rows={2}
            placeholder="?????????????"
            className="mb-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            type="button"
            onClick={() => void applyRefine()}
            disabled={loading !== null || !canRefine}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
          >
            {loading === "refine" ? "????" : "????"}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          ?????????????????????? .env.local ??? OPENROUTER_API_KEY ?????
          AI ???OpenRouter??
        </p>
      </section>

      <section className="flex min-h-[min(420px,50vh)] min-w-0 flex-1 flex-col gap-2 px-3 pb-4 pt-2 sm:px-4 lg:h-full lg:min-w-0 lg:flex-1 lg:px-5 lg:pb-5 lg:pt-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">????</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              ?? {vers.index + 1} / {vers.list.length}
            </span>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {outMode === "ai" ? "AI ??" : outMode === "demo" ? "?? / ??" : "??"}
          </span>
        </div>
        <div className="relative flex min-h-[min(360px,45vh)] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 lg:min-h-[min(480px,55dvh)]">
          {loading !== null ? <GenerationSkeleton /> : null}
          <PreviewFrame html={html} />
        </div>
      </section>
    </div>
  );
}

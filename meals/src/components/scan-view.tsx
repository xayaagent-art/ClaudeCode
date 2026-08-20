"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { Button, ErrorNote } from "@/components/ui";

type StageId = "upload" | "read" | "items" | "match";
type StageState = "pending" | "active" | "done";

interface ParseResponse {
  receipt: { id: string; merchant: string | null };
  parser: "openai" | "gemini" | "fixture";
  warnings: string[];
  counts: { food: number; ready: number; review: number; excluded: number };
  error?: string;
  /** Failure taxonomy from the server; absent on older/unknown errors. */
  kind?: string;
  title?: string;
  retryable?: boolean;
}

interface ScanFailure {
  title: string;
  message: string;
  /** True when trying the same photo again could plausibly work. */
  retryable: boolean;
  kind: string;
}

/** A network error never reaches the server, so the server can't classify it. */
const OFFLINE: Omit<ScanFailure, "message"> = {
  title: "Couldn't reach the kitchen",
  retryable: true,
  kind: "network",
};

/**
 * Every stage below corresponds to something that actually happened. Nothing
 * animates a percentage the app cannot observe — a stage only completes when
 * the server has told us the fact it describes.
 */
export function ScanView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stages, setStages] = useState<Record<StageId, StageState>>({
    upload: "pending",
    read: "pending",
    items: "pending",
    match: "pending",
  });
  const [labels, setLabels] = useState<Partial<Record<StageId, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  // Held so "Try again" resends the same photo rather than asking the user to
  // find it again — the commonest failures are transient and worth one tap.
  const lastFile = useRef<File | null>(null);

  function setStage(id: StageId, state: StageState, label?: string) {
    setStages((current) => ({ ...current, [id]: state }));
    if (label) setLabels((current) => ({ ...current, [id]: label }));
  }

  function reset() {
    setStages({ upload: "pending", read: "pending", items: "pending", match: "pending" });
    setLabels({});
    setBusy(false);
  }

  async function onFile(file: File) {
    lastFile.current = file;
    setFailure(null);
    setBusy(true);
    track("receipt_scan_started", { size_bytes: file.size, type: file.type || "unknown" });

    setStage("upload", "active");
    const form = new FormData();
    form.append("file", file);

    let response: Response;
    try {
      response = await fetch("/api/receipts/parse", { method: "POST", body: form });
    } catch {
      setFailure({
        ...OFFLINE,
        message: "Check your connection and try again — the photo is still here.",
      });
      reset();
      track("receipt_scan_failed", { kind: "network" });
      return;
    }

    try {
      setStage("upload", "done", "Photo uploaded");
      setStage("read", "active");

      const body = (await response.json()) as ParseResponse;
      if (!response.ok) {
        setFailure({
          title: body.title ?? "We couldn't read that receipt",
          message: body.error ?? "Try again, or choose another photo.",
          // Unknown failures get a retry: an unclassified error is more often
          // transient than permanent.
          retryable: body.retryable ?? true,
          kind: body.kind ?? "unknown",
        });
        reset();
        track("receipt_scan_failed", { kind: body.kind ?? "unknown" });
        return;
      }

      setStage("read", "done", body.receipt.merchant ? `${body.receipt.merchant} detected` : "Receipt read");
      setStage("items", "done", `${body.counts.food} food items found`);
      setStage(
        "match",
        "done",
        body.counts.review > 0
          ? `${body.counts.review} need a quick look`
          : "Everything matched cleanly",
      );

      track("receipt_scan_completed", {
        receipt_id: body.receipt.id,
        parser: body.parser,
        items: body.counts.food,
        needs_review: body.counts.review,
      });

      router.push(`/kitchen/review/${body.receipt.id}`);
    } catch {
      // The server answered but we couldn't make sense of it.
      setFailure({
        title: "Something went wrong",
        message: "We couldn't read that receipt. Try again, or choose another photo.",
        retryable: true,
        kind: "unknown",
      });
      reset();
      track("receipt_scan_failed", { kind: "unknown" });
    }
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">Kitchen</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">Scan receipt</h1>
        </div>
        <Link href="/kitchen" className="min-h-11 self-center px-2 text-meta text-ink-muted hover:text-ink">
          Cancel
        </Link>
      </header>

      {busy ? (
        <section className="px-gutter py-6" aria-live="polite">
          <h2 className="text-title font-semibold tracking-tight">Scanning your groceries</h2>
          <ul className="mt-5 space-y-3">
            <Stage state={stages.upload} label={labels.upload ?? "Uploading photo"} />
            <Stage state={stages.read} label={labels.read ?? "Reading the receipt"} />
            <Stage state={stages.items} label={labels.items ?? "Finding items"} />
            <Stage state={stages.match} label={labels.match ?? "Matching products"} />
          </ul>
          <p className="mt-6 text-meta text-ink-faint">
            This usually takes under a minute. You can keep the app open.
          </p>
        </section>
      ) : (
        <section className="px-gutter">
          {/*
            Camera-first: the frame is the screen, the instruction is one line,
            and the capture button is the biggest thing on it. The explanation
            of what happens afterwards is not needed before the photo is taken.
          */}
          <div className="relative mx-auto flex aspect-[3/4] w-full max-w-sm items-center justify-center overflow-hidden rounded-card bg-surface-sunken">
            <span aria-hidden="true" className="absolute inset-6 rounded-tile border-2 border-dashed border-line-strong" />
            <span className="relative px-8 text-center text-body text-ink-muted">
              Fit the whole receipt in frame
            </span>
          </div>

          <div className="mt-8 space-y-3">
            <Button
              full
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.setAttribute("capture", "environment");
                  inputRef.current.click();
                }
              }}
            >
              Take photo
            </Button>
            <Button
              full
              variant="secondary"
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.removeAttribute("capture");
                  inputRef.current.click();
                }
              }}
            >
              Choose from library
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Receipt photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onFile(file);
            }}
          />

          <p className="mt-8 text-center text-meta text-ink-faint">
            Photos stay private and can be deleted at any time.
          </p>
          <div className="pad-nav" />
        </section>
      )}

      {failure ? (
        <section className="pt-6" aria-live="assertive">
          <ErrorNote>
            <span className="font-medium">{failure.title}</span>
            <span className="mt-1 block">{failure.message}</span>
          </ErrorNote>

          <div className="mt-4 space-y-3 px-5">
            {failure.retryable && lastFile.current ? (
              <Button
                full
                onClick={() => {
                  const file = lastFile.current;
                  if (file) void onFile(file);
                }}
              >
                Try again
              </Button>
            ) : null}
            <Button
              full
              variant="secondary"
              onClick={() => {
                setFailure(null);
                if (inputRef.current) {
                  inputRef.current.removeAttribute("capture");
                  inputRef.current.click();
                }
              }}
            >
              Choose another photo
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stage({ state, label }: { state: StageState; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
          state === "done"
            ? "border-accent bg-accent text-white"
            : state === "active"
              ? "pulse-soft border-accent text-accent"
              : "border-line-strong text-transparent"
        }`}
      >
        ✓
      </span>
      <span className={`text-body ${state === "pending" ? "text-ink-faint" : "text-ink"}`}>
        {label}
      </span>
    </li>
  );
}

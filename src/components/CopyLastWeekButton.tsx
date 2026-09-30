"use client";

import {
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  copyLastWeekAction,
  type WeeklyPlanActionState,
} from "@/actions/weekly-plan";

export function CopyLastWeekButton({
  weekStart,
}: {
  weekStart: string;
}) {
  const router = useRouter();

  const [pending, startTransition] =
    useTransition();

  const [state, setState] =
    useState<WeeklyPlanActionState>(null);

  const [lastCopiedIds, setLastCopiedIds] =
    useState<string[]>([]);

  function handleCopy() {
    startTransition(async () => {
      const formData = new FormData();

      formData.set("intent", "copy");
      formData.set(
        "weekStart",
        weekStart,
      );

      const result =
        await copyLastWeekAction(
          null,
          formData,
        );

      setState(result);

      if (
        result?.ok &&
        result.copiedIds?.length
      ) {
        setLastCopiedIds(
          result.copiedIds,
        );
      } else {
        setLastCopiedIds([]);
      }

      router.refresh();
    });
  }

  function handleUndo() {
    if (lastCopiedIds.length === 0) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();

      formData.set("intent", "undo");
      formData.set(
        "weekStart",
        weekStart,
      );
      formData.set(
        "copiedIds",
        JSON.stringify(
          lastCopiedIds,
        ),
      );

      const result =
        await copyLastWeekAction(
          null,
          formData,
        );

      setState(result);

      if (result?.ok) {
        setLastCopiedIds([]);
      }

      router.refresh();
    });
  }

  return (
    <div className="weekly-plan-copy">
      <button
        type="button"
        className="btn btn-sm"
        onClick={handleCopy}
        disabled={pending}
      >
        {pending
          ? "Working..."
          : "Copy last week"}
      </button>

      {state ? (
        <span
          className={
            state.ok
              ? "weekly-plan-copy-message"
              : "weekly-plan-error"
          }
        >
          {state.message}
        </span>
      ) : null}

      {lastCopiedIds.length > 0 ? (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={handleUndo}
          disabled={pending}
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}
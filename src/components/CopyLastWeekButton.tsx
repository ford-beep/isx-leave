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

function addDays(
  value: string,
  amount: number,
) {
  const date = new Date(
    `${value}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + amount,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function formatWeekRange(
  weekStart: string,
) {
  const start = new Date(
    `${weekStart}T00:00:00Z`,
  );

  const end = new Date(
    `${addDays(
      weekStart,
      6,
    )}T00:00:00Z`,
  );

  const sameMonth =
    start.getUTCMonth() ===
      end.getUTCMonth() &&
    start.getUTCFullYear() ===
      end.getUTCFullYear();

  const sameYear =
    start.getUTCFullYear() ===
    end.getUTCFullYear();

  if (sameMonth) {
    const month =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          month: "short",
          timeZone: "UTC",
        },
      ).format(start);

    return `${start.getUTCDate()}–${end.getUTCDate()} ${month} ${start.getUTCFullYear()}`;
  }

  if (sameYear) {
    const startText =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        },
      ).format(start);

    const endText =
      new Intl.DateTimeFormat(
        "en-GB",
        {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        },
      ).format(end);

    return `${startText} – ${endText} ${start.getUTCFullYear()}`;
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      },
    );

  return `${formatter.format(
    start,
  )} – ${formatter.format(end)}`;
}

export function CopyLastWeekButton({
  weekStart,
}: {
  weekStart: string;
}) {
  const router = useRouter();

  const [pending, startTransition] =
    useTransition();

  const [state, setState] =
    useState<WeeklyPlanActionState>(
      null,
    );

  const [
    lastCopiedIds,
    setLastCopiedIds,
  ] = useState<string[]>([]);

  function handleCopy() {
    const previousWeek =
      addDays(weekStart, -7);

    const confirmed =
      window.confirm(
        [
          "Copy tasks from last week?",
          "",
          `${formatWeekRange(
            previousWeek,
          )} → ${formatWeekRange(
            weekStart,
          )}`,
          "",
          "Existing tasks will stay.",
          "Copied tasks will be added below them.",
        ].join("\n"),
      );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const formData =
        new FormData();

      formData.set(
        "intent",
        "copy",
      );

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
    if (
      lastCopiedIds.length === 0
    ) {
      return;
    }

    startTransition(async () => {
      const formData =
        new FormData();

      formData.set(
        "intent",
        "undo",
      );

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

      {lastCopiedIds.length >
      0 ? (
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
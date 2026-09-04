"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOwnLeaveAction } from "@/actions/leave";

export function CancelLeaveButton({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    const confirmed = window.confirm(
      "Cancel this leave request?\n\nThis action cannot be undone.",
    );

    if (!confirmed) return;

    setError(null);

    startTransition(async () => {
      const result =
        await cancelOwnLeaveAction(requestId);

      if (!result?.ok) {
        setError(
          result?.message ??
            "Unable to cancel this leave.",
        );
        return;
      }

      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        className="btn"
        disabled={isPending}
        onClick={handleCancel}
      >
        {isPending ? "Cancelling..." : "Cancel"}
      </button>

      {error ? (
        <div
          className="tiny"
          style={{
            marginTop: 6,
            maxWidth: 180,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
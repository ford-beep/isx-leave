"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCalendarActivityAction,
  deleteCalendarActivityAction,
  updateCalendarActivityAction,
} from "@/actions/calendar-activities";

import type { CalendarActivity } from "@/lib/queries";
import { IconPlus } from "./icons";

interface Props {
  date: string;
  activities: CalendarActivity[];
  canManage: boolean;
  inMonth: boolean;
}

function formatActivityDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function activityTime(activity: CalendarActivity) {
  if (!activity.startTime) {
    return null;
  }

  if (!activity.endTime) {
    return activity.startTime;
  }

  return `${activity.startTime} – ${activity.endTime}`;
}

export function CalendarActivityCell({
  date,
  activities,
  canManage,
  inMonth,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const [selected, setSelected] =
    useState<CalendarActivity | null>(null);

  const [pending, setPending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function closeModal() {
    if (pending) return;

    setOpen(false);
    setSelected(null);
    setError(null);
  }

  function addActivity() {
    setSelected(null);
    setError(null);
    setOpen(true);
  }

  function viewActivity(
    activity: CalendarActivity,
  ) {
    setSelected(activity);
    setError(null);
    setOpen(true);
  }

  async function saveActivity(
    formData: FormData,
  ) {
    setPending(true);
    setError(null);

    try {
      const result = selected
        ? await updateCalendarActivityAction(
            null,
            formData,
          )
        : await createCalendarActivityAction(
            null,
            formData,
          );

      if (result?.ok) {
        setOpen(false);
        setSelected(null);
        router.refresh();
        return;
      }

      setError(
        result?.message ??
          "Unable to save activity.",
      );
    } finally {
      setPending(false);
    }
  }

  async function deleteActivity() {
    if (!selected) return;

    const confirmed = window.confirm(
      `Delete "${selected.title}"?`,
    );

    if (!confirmed) return;

    setPending(true);
    setError(null);

    try {
      const formData = new FormData();

      formData.set(
        "id",
        selected.id,
      );

      const result =
        await deleteCalendarActivityAction(
          null,
          formData,
        );

      if (result?.ok) {
        setOpen(false);
        setSelected(null);
        router.refresh();
        return;
      }

      setError(
        result?.message ??
          "Unable to delete activity.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {canManage && inMonth ? (
        <button
          type="button"
          className="calendar-activity-add"
          onClick={addActivity}
          aria-label={`Add activity on ${date}`}
          title="Add activity"
        >
          <IconPlus size={13} />
        </button>
      ) : null}

      {activities.length > 0 ? (
        <div className="calendar-activities">
          {activities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className="calendar-activity-tag"
              onClick={() =>
                viewActivity(activity)
              }
              title={activity.title}
            >
              <span
  className="calendar-activity-dot"
  aria-hidden="true"
/>

<span className="calendar-activity-tag-content">
  <strong className="calendar-activity-title">
    {activity.title}
  </strong>

  {(activity.startTime || activity.location) ? (
    <span className="calendar-activity-meta">
      {activity.startTime
        ? activity.endTime
          ? `${activity.startTime}–${activity.endTime}`
          : activity.startTime
        : null}

      {activity.startTime && activity.location
        ? " · "
        : null}

      {activity.location}
    </span>
  ) : null}
</span>
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className="calendar-activity-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <div
            className="calendar-activity-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              selected
                ? selected.title
                : "Add activity"
            }
          >
            <div className="calendar-activity-modal-head">
              <div>
                <h3>
                  {selected
                    ? canManage
                      ? "Edit activity"
                      : selected.title
                    : "Add activity"}
                </h3>

                <p>
                  {formatActivityDate(
                    selected?.date ?? date,
                  )}
                </p>
              </div>

              <button
                type="button"
                className="calendar-activity-close"
                onClick={closeModal}
                disabled={pending}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {!canManage && selected ? (
              <div className="calendar-activity-details">
                {activityTime(selected) ? (
                  <div>
                    <strong>Time</strong>
                    <span>
                      {activityTime(selected)}
                    </span>
                  </div>
                ) : null}

                {selected.location ? (
                  <div>
                    <strong>Location</strong>
                    <span>
                      {selected.location}
                    </span>
                  </div>
                ) : null}

                {selected.description ? (
                  <div>
                    <strong>Description</strong>
                    <span>
                      {selected.description}
                    </span>
                  </div>
                ) : null}

                {!selected.startTime &&
                !selected.location &&
                !selected.description ? (
                  <p className="muted-sm">
                    No additional details.
                  </p>
                ) : null}
              </div>
            ) : (
              <form
                action={saveActivity}
                className="calendar-activity-form"
              >
                {selected ? (
                  <input
                    type="hidden"
                    name="id"
                    value={selected.id}
                  />
                ) : null}

                <label>
                  <span>Activity name</span>

                  <input
                    className="input"
                    name="title"
                    maxLength={160}
                    defaultValue={
                      selected?.title ?? ""
                    }
                    placeholder="e.g. Monthly Town Hall"
                    required
                    autoFocus
                  />
                </label>

                <label>
                  <span>Date</span>

                  <input
                    className="input"
                    type="date"
                    name="date"
                    defaultValue={
                      selected?.date ?? date
                    }
                    required
                  />
                </label>

                <div className="calendar-activity-time-row">
                  <label>
                    <span>Start time</span>

                    <input
                      className="input"
                      type="time"
                      name="startTime"
                      defaultValue={
                        selected?.startTime ?? ""
                      }
                    />
                  </label>

                  <label>
                    <span>End time</span>

                    <input
                      className="input"
                      type="time"
                      name="endTime"
                      defaultValue={
                        selected?.endTime ?? ""
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>Location</span>

                  <input
                    className="input"
                    name="location"
                    maxLength={200}
                    defaultValue={
                      selected?.location ?? ""
                    }
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Description</span>

                  <textarea
                    className="textarea"
                    name="description"
                    rows={4}
                    maxLength={2000}
                    defaultValue={
                      selected?.description ?? ""
                    }
                    placeholder="Optional"
                  />
                </label>

                {error ? (
                  <div className="calendar-activity-error">
                    {error}
                  </div>
                ) : null}

                <div className="calendar-activity-modal-actions">
                  {selected ? (
                    <button
                      type="button"
                      className="btn btn-sm calendar-activity-delete"
                      onClick={deleteActivity}
                      disabled={pending}
                    >
                      Delete
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={closeModal}
                      disabled={pending}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={pending}
                    >
                      {pending
                        ? "Saving..."
                        : selected
                          ? "Save changes"
                          : "Add activity"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

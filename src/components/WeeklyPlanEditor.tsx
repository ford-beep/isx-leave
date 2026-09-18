"use client";

import { useActionState, useState } from "react";

import {
  createWeeklyPlanItemAction,
  deleteWeeklyPlanItemAction,
  updateWeeklyPlanItemAction,
  type WeeklyPlanActionState,
} from "@/actions/weekly-plan";
import { IconCheck, IconPlus, IconX } from "@/components/icons";
import type { WeeklyPlanCategory, WeeklyPlanItem } from "@/lib/types";

type Day = {
  date: string;
  short: string;
  dayNumber: string;
  weekend: boolean;
};

type Props = {
  weekStart: string;
  days: Day[];
  items: WeeklyPlanItem[];
};

const initialState: WeeklyPlanActionState = null;

function AddTaskForm({
  weekStart,
  workDate,
  category,
}: {
  weekStart: string;
  workDate: string;
  category: WeeklyPlanCategory;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createWeeklyPlanItemAction,
    initialState,
  );

  if (!open) {
    return (
      <button
        type="button"
        className="weekly-plan-add"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={14} />
        Add task
      </button>
    );
  }

  return (
    <form action={action} className="weekly-plan-add-form">
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="workDate" value={workDate} />
      <input type="hidden" name="category" value={category} />

      <textarea
        className="textarea"
        name="content"
        rows={3}
        maxLength={1000}
        placeholder="What are you working on?"
        autoFocus
        required
      />

      {state && !state.ok ? (
        <div className="weekly-plan-error">{state.message}</div>
      ) : null}

      <div className="weekly-plan-form-actions">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="btn btn-sm btn-primary"
          disabled={pending}
        >
          <IconCheck size={14} />
          {pending ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}

function TaskItem({ item }: { item: WeeklyPlanItem }) {
  const [editing, setEditing] = useState(false);

  const [updateState, updateAction, updatePending] = useActionState(
    async (prevState: WeeklyPlanActionState, formData: FormData) => {
      const result = await updateWeeklyPlanItemAction(prevState, formData);

      if (result?.ok) {
        setEditing(false);
      }

      return result;
    },
    initialState,
  );

  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteWeeklyPlanItemAction,
    initialState,
  );

  if (editing) {
    return (
      <form
        action={updateAction}
        className="weekly-plan-task weekly-plan-task-edit"
      >
        <input type="hidden" name="id" value={item.id} />

        <textarea
          className="textarea"
          name="content"
          rows={3}
          maxLength={1000}
          defaultValue={item.content}
          autoFocus
          required
        />

        {updateState && !updateState.ok ? (
          <div className="weekly-plan-error">{updateState.message}</div>
        ) : null}

        <div className="weekly-plan-form-actions">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setEditing(false)}
            disabled={updatePending}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={updatePending}
          >
            <IconCheck size={14} />
            {updatePending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="weekly-plan-task">
      <div className="weekly-plan-task-content">{item.content}</div>

      <div className="weekly-plan-task-actions">
        <button
          type="button"
          className="weekly-plan-text-button"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>

        <form action={deleteAction}>
          <input type="hidden" name="id" value={item.id} />

          <button
            type="submit"
            className="weekly-plan-delete"
            disabled={deletePending}
            aria-label="Delete task"
            title="Delete task"
          >
            <IconX size={14} />
          </button>
        </form>
      </div>

      {deleteState && !deleteState.ok ? (
        <div className="weekly-plan-error">{deleteState.message}</div>
      ) : null}
    </div>
  );
}

function CategoryBoard({
  title,
  category,
  weekStart,
  days,
  items,
}: {
  title: string;
  category: WeeklyPlanCategory;
  weekStart: string;
  days: Day[];
  items: WeeklyPlanItem[];
}) {
  return (
    <section className={`weekly-plan-section weekly-plan-${category}`}>
      <div className="weekly-plan-section-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {category === "priority"
              ? "The work you want to keep front and center."
              : "Other tasks, support work, learning, or things that may come up."}
          </p>
        </div>
      </div>

      <div className="weekly-plan-grid">
        {days.map((day) => {
          const dayItems = items.filter(
            (item) => item.workDate === day.date && item.category === category,
          );

          return (
            <div
              className={`weekly-plan-day ${day.weekend ? "is-weekend" : ""}`}
              key={`${category}-${day.date}`}
            >
              <div className="weekly-plan-day-head">
                <span>{day.short}</span>
                <strong>{day.dayNumber}</strong>
              </div>

              <div className="weekly-plan-day-body">
                {dayItems.map((item) => (
                  <TaskItem key={item.id} item={item} />
                ))}

                <AddTaskForm
                  weekStart={weekStart}
                  workDate={day.date}
                  category={category}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function WeeklyPlanEditor({ weekStart, days, items }: Props) {
  return (
    <div className="weekly-plan">
      <CategoryBoard
        title="Priority"
        category="priority"
        weekStart={weekStart}
        days={days}
        items={items}
      />

      <CategoryBoard
        title="Other"
        category="other"
        weekStart={weekStart}
        days={days}
        items={items}
      />
    </div>
  );
}

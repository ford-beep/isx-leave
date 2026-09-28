"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";

import {
  applyWeeklyPlanDragAction,
  createWeeklyPlanItemAction,
  deleteWeeklyPlanItemAction,
  updateWeeklyPlanItemAction,
  type WeeklyPlanActionState,
} from "@/actions/weekly-plan";

import {
  IconCheck,
  IconPlus,
  IconX,
} from "@/components/icons";

import type {
  WeeklyPlanCategory,
  WeeklyPlanItem,
} from "@/lib/types";

import styles from "./WeeklyPlanDnD.module.css";

type Day = {
  date: string;
  short: string;
  dayNumber: string;
  weekend: boolean;
  holidayName: string | null;
  leaveLabel: string | null;
};

type Props = {
  weekStart: string;
  days: Day[];
  items: WeeklyPlanItem[];
};

const initialState: WeeklyPlanActionState = null;

function bySortOrder(
  a: WeeklyPlanItem,
  b: WeeklyPlanItem,
) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  return a.createdAt.localeCompare(b.createdAt);
}

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
    <form
      action={action}
      className="weekly-plan-add-form"
    >
      <input
        type="hidden"
        name="weekStart"
        value={weekStart}
      />

      <input
        type="hidden"
        name="workDate"
        value={workDate}
      />

      <input
        type="hidden"
        name="category"
        value={category}
      />

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
        <div className="weekly-plan-error">
          {state.message}
        </div>
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

function TaskItem({
  item,
}: {
  item: WeeklyPlanItem;
}) {
  const [editing, setEditing] = useState(false);

  const [
    updateState,
    updateAction,
    updatePending,
  ] = useActionState(
    async (
      prevState: WeeklyPlanActionState,
      formData: FormData,
    ) => {
      const result =
        await updateWeeklyPlanItemAction(
          prevState,
          formData,
        );

      if (result?.ok) {
        setEditing(false);
      }

      return result;
    },
    initialState,
  );

  const [
    deleteState,
    deleteAction,
    deletePending,
  ] = useActionState(
    deleteWeeklyPlanItemAction,
    initialState,
  );

  if (editing) {
    return (
      <form
        action={updateAction}
        className="weekly-plan-task weekly-plan-task-edit"
      >
        <input
          type="hidden"
          name="id"
          value={item.id}
        />

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
          <div className="weekly-plan-error">
            {updateState.message}
          </div>
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
            {updatePending
              ? "Saving..."
              : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="weekly-plan-task">
      <div className="weekly-plan-task-content">
        {item.content}
      </div>

      <div className="weekly-plan-task-actions">
        <button
          type="button"
          className="weekly-plan-text-button"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>

        <form action={deleteAction}>
          <input
            type="hidden"
            name="id"
            value={item.id}
          />

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
        <div className="weekly-plan-error">
          {deleteState.message}
        </div>
      ) : null}
    </div>
  );
}

function SortableTask({
  item,
  disabled,
}: {
  item: WeeklyPlanItem;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,

    data: {
      type: "task",
      workDate: item.workDate,
      category: item.category,
    },

    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.sortableTask,
        isDragging ? styles.dragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: CSS.Transform.toString(
          transform,
        ),
        transition,
      }}
    >
      <TaskItem item={item} />

      <button
        ref={setActivatorNodeRef}
        type="button"
        className={styles.dragHandle}
        disabled={disabled}
        aria-label="Drag task"
        title="Drag to move. Hold Option or Alt to copy."
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
    </div>
  );
}

function DayTaskArea({
  category,
  workDate,
  items,
  weekStart,
  saving,
}: {
  category: WeeklyPlanCategory;
  workDate: string;
  items: WeeklyPlanItem[];
  weekStart: string;
  saving: boolean;
}) {
  const dropId =
    `weekly-plan-drop:${category}:${workDate}`;

  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: dropId,

    data: {
      type: "day",
      category,
      workDate,
    },

    disabled: saving,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "weekly-plan-day-body",
        styles.dayDrop,
        isOver ? styles.dayOver : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SortableTask
            key={item.id}
            item={item}
            disabled={saving}
          />
        ))}
      </SortableContext>

      <AddTaskForm
        weekStart={weekStart}
        workDate={workDate}
        category={category}
      />
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
  const router = useRouter();

  const categoryItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.category === category,
        )
        .sort((a, b) => {
          if (a.workDate !== b.workDate) {
            return a.workDate.localeCompare(
              b.workDate,
            );
          }

          return bySortOrder(a, b);
        }),
    [items, category],
  );

  const [
    localItems,
    setLocalItems,
  ] = useState<WeeklyPlanItem[]>(
    categoryItems,
  );

  const [
    activeId,
    setActiveId,
  ] = useState<string | null>(null);

  const [
    copyMode,
    setCopyMode,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    dragError,
    setDragError,
  ] = useState<string | null>(null);

  const copyModeRef = useRef(false);

  useEffect(() => {
    if (!saving) {
      setLocalItems(categoryItems);
    }
  }, [categoryItems, saving]);

  useEffect(() => {
    function onKeyDown(
      event: KeyboardEvent,
    ) {
      if (
        event.key === "Alt" &&
        activeId
      ) {
        copyModeRef.current = true;
        setCopyMode(true);
      }
    }

    function onKeyUp(
      event: KeyboardEvent,
    ) {
      if (event.key === "Alt") {
        copyModeRef.current = false;
        setCopyMode(false);
      }
    }

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    window.addEventListener(
      "keyup",
      onKeyUp,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );

      window.removeEventListener(
        "keyup",
        onKeyUp,
      );
    };
  }, [activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),

    useSensor(KeyboardSensor, {
      coordinateGetter:
        sortableKeyboardCoordinates,
    }),
  );

  const activeItem =
    activeId === null
      ? null
      : localItems.find(
          (item) =>
            item.id === activeId,
        ) ?? null;

  function resetDragState() {
    setActiveId(null);
    setCopyMode(false);
    copyModeRef.current = false;
  }

  function handleDragStart(
    event: DragStartEvent,
  ) {
    setDragError(null);

    const id = String(event.active.id);

    setActiveId(id);

    const activator =
      event.activatorEvent;

    const initialCopyMode =
      "altKey" in activator &&
      Boolean(activator.altKey);

    copyModeRef.current =
      initialCopyMode;

    setCopyMode(
      initialCopyMode,
    );
  }

  async function handleDragEnd(
    event: DragEndEvent,
  ) {
    const {
      active,
      over,
    } = event;

    if (!over) {
      resetDragState();
      return;
    }

    const sourceId =
      String(active.id);

    const source =
      localItems.find(
        (item) =>
          item.id === sourceId,
      );

    if (!source) {
      resetDragState();
      return;
    }

    const overData =
      over.data.current;

    const targetCategory =
      overData?.category as
        | WeeklyPlanCategory
        | undefined;

    const targetDate =
      overData?.workDate as
        | string
        | undefined;

    if (
      !targetDate ||
      targetCategory !== category
    ) {
      resetDragState();
      return;
    }

    const isCopy =
      copyModeRef.current;

    if (
      !isCopy &&
      String(over.id) === sourceId
    ) {
      resetDragState();
      return;
    }

    const snapshot = localItems;

    const destinationItems =
      localItems
        .filter(
          (item) =>
            item.workDate ===
              targetDate &&
            (isCopy ||
              item.id !== sourceId),
        )
        .sort(bySortOrder);

    let targetIndex =
      destinationItems.length;

    if (
      overData?.type === "task"
    ) {
      const overId =
        String(over.id);

      const overIndex =
        destinationItems.findIndex(
          (item) =>
            item.id === overId,
        );

      if (overIndex >= 0) {
        const translated =
          active.rect.current
            .translated;

        const activeCenter =
          translated
            ? translated.top +
              translated.height / 2
            : null;

        const overCenter =
          over.rect.top +
          over.rect.height / 2;

        const placeAfter =
          activeCenter !== null &&
          activeCenter > overCenter;

        targetIndex =
          overIndex +
          (placeAfter ? 1 : 0);
      }
    }

    targetIndex = Math.max(
      0,
      Math.min(
        targetIndex,
        destinationItems.length,
      ),
    );

    if (isCopy) {
      const tempId =
        `copy-${Date.now()}`;

      const copiedItem: WeeklyPlanItem = {
        ...source,
        id: tempId,
        workDate: targetDate,
        sortOrder: targetIndex,
        createdAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString(),
      };

      const withCopy = [
        ...destinationItems,
      ];

      withCopy.splice(
        targetIndex,
        0,
        copiedItem,
      );

      const destinationWithOrder =
        withCopy.map(
          (item, index) => ({
            ...item,
            sortOrder: index,
          }),
        );

      const nextItems = [
        ...localItems.filter(
          (item) =>
            item.workDate !==
            targetDate,
        ),
        ...destinationWithOrder,
      ];

      setLocalItems(nextItems);
      setSaving(true);
      resetDragState();

      const formData =
        new FormData();

      formData.set(
        "weekStart",
        weekStart,
      );

      formData.set(
        "category",
        category,
      );

      formData.set(
        "sourceId",
        sourceId,
      );

      formData.set(
        "mode",
        "copy",
      );

      formData.set(
        "copyWorkDate",
        targetDate,
      );

      formData.set(
        "copySortOrder",
        String(targetIndex),
      );

      formData.set(
        "layout",
        JSON.stringify(
          nextItems
            .filter(
              (item) =>
                item.id !== tempId,
            )
            .map((item) => ({
              id: item.id,
              workDate:
                item.workDate,
              sortOrder:
                item.sortOrder,
            })),
        ),
      );

      const result =
        await applyWeeklyPlanDragAction(
          null,
          formData,
        );

      if (!result?.ok) {
        setLocalItems(snapshot);

        setDragError(
          result?.message ??
            "Task could not be copied.",
        );

        setSaving(false);
        return;
      }

      setSaving(false);
      router.refresh();
      return;
    }

    const withoutSource =
      localItems.filter(
        (item) =>
          item.id !== sourceId,
      );

    const destinationWithoutSource =
      withoutSource
        .filter(
          (item) =>
            item.workDate ===
            targetDate,
        )
        .sort(bySortOrder);

    destinationWithoutSource.splice(
      targetIndex,
      0,
      {
        ...source,
        workDate: targetDate,
      },
    );

    const destinationWithOrder =
      destinationWithoutSource.map(
        (item, index) => ({
          ...item,
          sortOrder: index,
        }),
      );

    const otherItems =
      withoutSource.filter(
        (item) =>
          item.workDate !==
          targetDate,
      );

    const sourceDateRemaining =
      source.workDate === targetDate
        ? []
        : otherItems
            .filter(
              (item) =>
                item.workDate ===
                source.workDate,
            )
            .sort(bySortOrder)
            .map(
              (item, index) => ({
                ...item,
                sortOrder: index,
              }),
            );

    const untouched =
      otherItems.filter(
        (item) =>
          item.workDate !==
            targetDate &&
          item.workDate !==
            source.workDate,
      );

    const nextItems = [
      ...untouched,
      ...sourceDateRemaining,
      ...destinationWithOrder,
    ];

    setLocalItems(nextItems);
    setSaving(true);
    resetDragState();

    const formData =
      new FormData();

    formData.set(
      "weekStart",
      weekStart,
    );

    formData.set(
      "category",
      category,
    );

    formData.set(
      "sourceId",
      sourceId,
    );

    formData.set(
      "mode",
      "move",
    );

    formData.set(
      "layout",
      JSON.stringify(
        nextItems.map((item) => ({
          id: item.id,
          workDate:
            item.workDate,
          sortOrder:
            item.sortOrder,
        })),
      ),
    );

    const result =
      await applyWeeklyPlanDragAction(
        null,
        formData,
      );

    if (!result?.ok) {
      setLocalItems(snapshot);

      setDragError(
        result?.message ??
          "Task could not be moved.",
      );

      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={resetDragState}
      onDragEnd={handleDragEnd}
    >
      <section
        className={
          `weekly-plan-section weekly-plan-${category}`
        }
      >
        <div className="weekly-plan-section-head">
          <div>
            <h2>{title}</h2>

            <p className="muted">
              {category === "priority"
                ? "The work you want to keep front and center."
                : "Other tasks, support work, learning, or things that may come up."}
            </p>

            <div
              className={
                styles.dragHint
              }
            >
              Drag ⋮⋮ to move · Hold
              Option / Alt while dragging
              to copy
            </div>

            {dragError ? (
              <div
                className={[
                  "weekly-plan-error",
                  styles.dragError,
                ].join(" ")}
              >
                {dragError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="weekly-plan-grid">
          {days.map((day) => {
            const dayItems =
              localItems
                .filter(
                  (item) =>
                    item.workDate ===
                    day.date,
                )
                .sort(bySortOrder);

            return (
              <div
                className={[
                  "weekly-plan-day",
                  day.weekend
                    ? "is-weekend"
                    : "",
                  day.leaveLabel
                    ? "is-leave"
                    : "",
                  day.holidayName
                    ? "is-holiday"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={`${category}-${day.date}`}
              >
                <div className="weekly-plan-day-head">
                  <span>
                    {day.short}
                  </span>

                  <strong>
                    {day.dayNumber}
                  </strong>
                </div>

                {day.leaveLabel ||
                day.holidayName ? (
                  <div className="weekly-plan-day-status">
                    {day.leaveLabel ? (
                      <div className="weekly-plan-day-note is-leave">
                        <span
                          aria-hidden="true"
                        >
                          🏖️
                        </span>

                        <span>
                          {day.leaveLabel}
                        </span>
                      </div>
                    ) : null}

                    {day.holidayName ? (
                      <div className="weekly-plan-day-note is-holiday">
                        <span
                          aria-hidden="true"
                        >
                          🎉
                        </span>

                        <span>
                          {day.holidayName}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <DayTaskArea
                  category={category}
                  workDate={day.date}
                  items={dayItems}
                  weekStart={weekStart}
                  saving={saving}
                />
              </div>
            );
          })}
        </div>
      </section>

      <DragOverlay>
        {activeItem ? (
          <div className={styles.overlay}>
            <div
              className={[
                "weekly-plan-task",
                styles.overlayCard,
              ].join(" ")}
            >
              <div
                className={
                  styles.overlayContent
                }
              >
                {activeItem.content}
              </div>
            </div>

            {copyMode ? (
              <span
                className={
                  styles.copyBadge
                }
              >
                + Copy
              </span>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function WeeklyPlanEditor({
  weekStart,
  days,
  items,
}: Props) {
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
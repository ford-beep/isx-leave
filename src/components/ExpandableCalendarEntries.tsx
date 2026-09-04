"use client";

import { useState } from "react";

interface CalendarEntry {
  label: string;
  status: string;
  title?: string;
}

interface Props {
  date: string;
  entries: CalendarEntry[];
  initialLimit?: number;
}

export function ExpandableCalendarEntries({
  date,
  entries,
  initialLimit = 3,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const visibleEntries = expanded
    ? entries
    : entries.slice(0, initialLimit);

  const hiddenCount = Math.max(
    entries.length - initialLimit,
    0,
  );

  return (
    <>
      {visibleEntries.map((entry, index) => (
        <div
          key={`${date}-${entry.label}-${index}`}
          className={`cal-tag ${entry.status}`}
          title={entry.title}
        >
          {entry.label}
        </div>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          className="cal-more-button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          title={
            expanded
              ? "Show fewer employees"
              : entries
                  .slice(initialLimit)
                  .map((entry) => entry.label)
                  .join(", ")
          }
        >
          {expanded
            ? "Show less"
            : `+${hiddenCount} more`}
        </button>
      )}
    </>
  );
}
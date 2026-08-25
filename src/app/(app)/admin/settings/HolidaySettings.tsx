"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addHolidayAction,
  importHolidaysAction,
  syncBotHolidaysAction,
  toggleHolidayAction,
} from "@/actions/admin";
import { Alert, Card, Field } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useActionToast } from "@/components/Toast";
import { formatDate } from "@/lib/date";
import type { Holiday } from "@/lib/types";
import { IconPlus } from "@/components/icons";

/**
 * §15 — Public holidays.
 * BOT holidays arrive through the JSON importer (or `npm run holidays:import`);
 * company closures are added by hand. Both are stored in the same table with a
 * `source` column so the origin of every date stays visible.
 */
export function HolidaySettings({ holidays, year, years }: {
  holidays: Holiday[]; year: number; years: number[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addState, addAction, adding] = useActionState(addHolidayAction, null);
  const [impState, impAction, importing] = useActionState(importHolidaysAction, null);

  const [syncState, syncAction, syncing] =
   useActionState(syncBotHolidaysAction, null);

const [toggleState, toggleAction] = useActionState(toggleHolidayAction, null);
 useActionToast(addState);
 useActionToast(impState);
 useActionToast(syncState);
 useActionToast(toggleState);

  if (addState?.ok && addOpen) setTimeout(() => setAddOpen(false), 0);
  if (impState?.ok && importOpen) setTimeout(() => setImportOpen(false), 0);

  const allYears = Array.from(new Set([...years, year, new Date().getFullYear() + 1])).sort();

  return (
    <Card>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <h2>Public holidays</h2>
          <p className="muted-sm" style={{ marginTop: 2 }}>
            Source of truth: Bank of Thailand financial-institution calendar.
          </p>
        </div>
        <select className="select" style={{ width: 104 }} defaultValue={year}
          onChange={(e) => router.push(`/admin/settings?hy=${e.target.value}`)} aria-label="Holiday year">
          {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <form action={syncAction}>
  <input type="hidden" name="year" value={year} />
  <button
    className="btn btn-sm"
    type="submit"
    disabled={syncing}
  >
    {syncing ? "Syncing…" : "Sync from BOT"}
  </button>
</form>

<button
  className="btn btn-sm"
  onClick={() => setImportOpen(true)}
>
  Import JSON
</button>

<button
  className="btn btn-sm btn-primary"
  onClick={() => setAddOpen(true)}
>
  <IconPlus size={14} />Add
</button>
      </div>

      <div className="card-body flush">
        {holidays.length === 0 ? (
  <div className="empty">
    <h3>No holidays loaded for {year}.</h3>
    <p>Sync the official Bank of Thailand list for this year to get started.</p>

    <form action={syncAction}>
      <input type="hidden" name="year" value={year} />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={syncing}
      >
        {syncing ? "Syncing…" : `Sync ${year} from BOT`}
      </button>
    </form>
  </div>
) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>Holiday</th><th>Source</th><th>Status</th><th className="r">Action</th></tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} style={{ opacity: h.active ? 1 : 0.55 }}>
                    <td data-label="Date" className="primary nowrap">{formatDate(h.date)}</td>
                    <td data-label="Holiday">
                      {h.name}
                      {h.nameTh && <div className="tiny">{h.nameTh}</div>}
                    </td>
                    <td data-label="Source">
                      <span className={`badge plain ${h.type === "public" ? "badge-info" : "badge-brand"}`}>
                        {h.type === "public" ? h.source : "Company"}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${h.active ? "badge-approved" : "badge-cancelled"}`}>
                        {h.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td data-label="Action" className="r">
                      <form action={toggleAction} className="actions">
                        <input type="hidden" name="id" value={h.id} />
                        <button className="btn btn-sm" type="submit">{h.active ? "Disable" : "Enable"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add a holiday"
        description="Use this for ISX-specific closures, or to record a newly announced public holiday.">
        <form action={addAction} className="stack">
          {addState && !addState.ok && !addState.field && <Alert kind="error">{addState.message}</Alert>}
          <div className="form-grid">
            <Field label="Date" htmlFor="hdate"
              error={addState && !addState.ok && addState.field === "date" ? addState.message : undefined}>
              <input id="hdate" name="date" type="date" className="input" required />
            </Field>
            <Field label="Type" htmlFor="htype">
              <select id="htype" name="type" className="select" defaultValue="company">
                <option value="company">Company holiday</option>
                <option value="public">Public holiday</option>
              </select>
            </Field>
            <Field label="Name" htmlFor="hname" className="full"
              error={addState && !addState.ok && addState.field === "name" ? addState.message : undefined}>
              <input id="hname" name="name" className="input" required placeholder="e.g. ISX Studio Closure" />
            </Field>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="button" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add holiday"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} wide
        title="Import a year of holidays"
        description="Paste the contents of a BOT holiday file (db/seed/holidays/th-YYYY.json). Existing dates are updated, not duplicated.">
        <form action={impAction} className="stack">
          {impState && !impState.ok && <Alert kind="error">{impState.message}</Alert>}
          <Field label="Holiday JSON" htmlFor="payload"
            hint='Format: { "source": "BOT", "holidays": [ { "date": "2027-01-01", "name": "New Year&apos;s Day" } ] }'>
            <textarea id="payload" name="payload" className="textarea" style={{ minHeight: 220, fontFamily: "var(--mono)", fontSize: 12 }}
              placeholder='{ "source": "BOT", "year": 2027, "holidays": [ ... ] }' required />
          </Field>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="button" onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={importing}>
              {importing ? "Importing…" : "Import holidays"}
            </button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

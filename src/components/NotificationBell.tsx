"use client";

import { useState } from "react";
import Link from "next/link";
import { markNotificationsReadAction } from "@/actions/leave";
import type { Notification } from "@/lib/types";
import { IconBell } from "./icons";

export function NotificationBell({ notifications, unread }: {
  notifications: Notification[]; unread: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-ghost" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => { setOpen((o) => !o); if (!open && unread) markNotificationsReadAction(); }}>
        <IconBell size={18} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 4, right: 5, minWidth: 16, height: 16, padding: "0 4px",
            borderRadius: 999, background: "var(--c-bad)", color: "#fff",
            fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center",
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="card" style={{
            position: "absolute", right: 0, top: 44, width: 330, zIndex: 50,
            boxShadow: "var(--sh-lg)", maxHeight: 420, overflowY: "auto",
          }}>
            <div className="card-head"><h2>Notifications</h2></div>
            {notifications.length === 0 ? (
              <div className="card-body"><p className="muted-sm">Nothing yet.</p></div>
            ) : (
              <div>
                {notifications.map((n) => (
                  <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)}
                    style={{
                      display: "block", padding: "11px 16px",
                      borderBottom: "1px solid var(--c-border)",
                      background: n.readAt ? undefined : "var(--c-brand-soft)",
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                    {n.body && <div className="tiny" style={{ marginTop: 2, whiteSpace: "pre-line" }}>{n.body}</div>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

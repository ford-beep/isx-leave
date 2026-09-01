"use client";

import { useState } from "react";
import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/types";
import { NavLink } from "./NavLink";
import { Avatar } from "./ui";
import {
  IconCalendar,
  IconFile,
  IconHome,
  IconList,
  IconLogout,
  IconPlus,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
} from "./icons";

export function MobileMenu({
  user,
  pendingCount,
}: {
  user: SessionUser;
  pendingCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === "admin";

  return (
    <>
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div
          className="mobile-menu-backdrop"
          onClick={() => setOpen(false)}
        >
          <aside
            className="mobile-menu-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-menu-head">
              <div className="brand">
                <div className="brand-mark">ISX</div>

                <div className="brand-text">
                  <span className="brand-name">Leave</span>
                  <span className="brand-sub">ISX Company</span>
                </div>
              </div>

              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                ×
              </button>
            </div>

            <nav
              className="mobile-nav"
              onClick={() => setOpen(false)}
            >
              <div className="nav-label">My leave</div>

              <NavLink
                href="/dashboard"
                icon={<IconHome size={16} />}
                exact
              >
                Dashboard
              </NavLink>

              <NavLink
                href="/my-leave"
                icon={<IconList size={16} />}
              >
                My leave
              </NavLink>

              <NavLink
                href="/calendar"
                icon={<IconCalendar size={16} />}
              >
                Calendar
              </NavLink>

              <NavLink
                href="/request"
                icon={<IconPlus size={16} />}
              >
                Request leave
              </NavLink>

              <NavLink
                href="/profile"
                icon={<IconUser size={16} />}
              >
                Profile
              </NavLink>

              {isAdmin && (
                <>
                  <div className="nav-label">Administration</div>

                  <NavLink
                    href="/admin"
                    icon={<IconShield size={16} />}
                    exact
                  >
                    Admin dashboard
                  </NavLink>

                  <NavLink
                    href="/admin/requests"
                    icon={<IconList size={16} />}
                    count={pendingCount}
                  >
                    Leave requests
                  </NavLink>

                  <NavLink
                    href="/admin/employees"
                    icon={<IconUsers size={16} />}
                  >
                    Employees
                  </NavLink>

                  <NavLink
                    href="/admin/calendar"
                    icon={<IconCalendar size={16} />}
                  >
                    Company calendar
                  </NavLink>

                  <NavLink
  href="/admin/comp-days"
  icon={<IconPlus size={16} />}
>
  Comp Days
</NavLink>

                  <NavLink
                    href="/admin/settings"
                    icon={<IconSettings size={16} />}
                  >
                    Settings
                  </NavLink>

                  <NavLink
                    href="/admin/audit"
                    icon={<IconFile size={16} />}
                  >
                    Audit log
                  </NavLink>
                </>
              )}
            </nav>

            <div className="mobile-menu-user">
              <Avatar name={user.name} />

              <div className="userbox-meta">
                <div className="userbox-name">{user.name}</div>
                <div className="userbox-role">
                  {isAdmin ? "Administrator" : "Employee"}
                </div>
              </div>

              <form
                action={logoutAction}
                style={{ marginLeft: "auto" }}
              >
                <button
                  className="btn btn-ghost btn-sm"
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <IconLogout size={16} />
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
import { logoutAction } from "@/actions/auth";
import type { Notification, SessionUser } from "@/lib/types";
import { NavLink } from "./NavLink";
import { NotificationBell } from "./NotificationBell";
import { PageTitle } from "./PageTitle";
import { Avatar } from "./ui";
import {
  IconCalendar, IconFile, IconHome, IconList, IconLogout,
  IconPlus, IconSettings, IconShield, IconUser, IconUsers,
} from "./icons";
import type { ReactNode } from "react";
import { MobileMenu } from "./MobileMenu";

export function AppShell({ user, pendingCount, notifications, unread, children }: {
  user: SessionUser; pendingCount?: number; notifications: Notification[];
  unread: number; children: ReactNode;
}) {
  const isAdmin = user.role === "admin";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ISX</div>
          <div className="brand-text">
            <span className="brand-name">Leave</span>
            <span className="brand-sub">ISX Company</span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">My leave</div>
          <NavLink href="/dashboard" icon={<IconHome size={16} />} exact>Dashboard</NavLink>
          <NavLink href="/my-leave" icon={<IconList size={16} />}>My leave</NavLink>
          <NavLink href="/calendar" icon={<IconCalendar size={16} />}>Calendar</NavLink>
          <NavLink href="/request" icon={<IconPlus size={16} />}>Request leave</NavLink>
          <NavLink href="/profile" icon={<IconUser size={16} />}>Profile</NavLink>

{isAdmin && (
  <>
    <div className="nav-label">Administration</div>

    <NavLink href="/admin" icon={<IconShield size={16} />} exact>
      Admin dashboard
    </NavLink>

    <NavLink
      href="/admin/requests"
      icon={<IconList size={16} />}
      count={pendingCount}
    >
      Leave requests
    </NavLink>

    <NavLink href="/admin/employees" icon={<IconUsers size={16} />}>
      Employees
    </NavLink>

    <NavLink href="/admin/comp-days" icon={<IconPlus size={16} />}>
      Comp Days
    </NavLink>

    <NavLink href="/admin/calendar" icon={<IconCalendar size={16} />}>
      Company calendar
    </NavLink>

    <NavLink href="/admin/settings" icon={<IconSettings size={16} />}>
      Settings
    </NavLink>

    <NavLink href="/admin/audit" icon={<IconFile size={16} />}>
      Audit log
    </NavLink>
  </>
)}
        </nav>

        <div className="sidebar-foot">
          <div className="userbox">
            <Avatar name={user.name} />
            <div className="userbox-meta">
              <div className="userbox-name">{user.name}</div>
              <div className="userbox-role">{isAdmin ? "Administrator" : "Employee"}</div>
            </div>
            <form action={logoutAction} style={{ marginLeft: "auto" }}>
              <button className="btn btn-ghost btn-sm" type="submit" aria-label="Sign out" title="Sign out">
                <IconLogout size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
  <div className="mobile-brand">
    <div className="brand-mark">ISX</div>
    <span className="brand-name">Leave</span>
  </div>

  <div className="desktop-page-title">
    <PageTitle />
  </div>

  <div className="topbar-spacer" />

  <NotificationBell
    notifications={notifications}
    unread={unread}
  />

  <MobileMenu
    user={user}
    pendingCount={pendingCount}
  />
</header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

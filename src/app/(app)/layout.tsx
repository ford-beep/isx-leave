import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { getNotifications, getUnreadCount, getPendingRequests } from "@/lib/queries";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [notifications, unread, pending] = await Promise.all([
    getNotifications(user.id),
    getUnreadCount(user.id),
    // For an employee this returns their own pending requests (RLS), which is
    // exactly what we want to avoid showing them a company-wide count.
    user.role === "admin" ? getPendingRequests(user.id) : Promise.resolve([]),
  ]);

  return (
    <AppShell user={user} notifications={notifications} unread={unread} pendingCount={pending.length}>
      {children}
    </AppShell>
  );
}

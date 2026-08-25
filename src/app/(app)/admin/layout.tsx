import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";

/**
 * Belt-and-braces guard for the whole admin area. Even if this were removed,
 * every admin query and mutation is separately rejected for non-admins by the
 * RLS policies — this only makes the failure a friendly redirect.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

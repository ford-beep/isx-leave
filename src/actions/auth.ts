"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { toFriendlyError } from "@/lib/errors";
import { env } from "@/lib/env";

export type FormState = { ok: boolean; message?: string; field?: string } | null;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0]) };
  }

  const result = await login(parsed.data.email, parsed.data.password);
  if (!result.ok) return { ok: false, message: result.message };
  redirect(result.user.role === "admin" ? "/admin" : "/dashboard");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

/**
 * One-click sign-in for the seeded demo accounts. Hard-disabled unless
 * DEMO_MODE=true and NODE_ENV is not production (see lib/env.ts), so it cannot
 * become an authentication bypass in a real deployment.
 */
export async function demoLoginAction(formData: FormData): Promise<void> {
  if (!env.demoMode) redirect("/login");
  const email = String(formData.get("email") ?? "");
  if (!email.endsWith("@demo.isx.local")) redirect("/login");
  const result = await login(email, "demo1234");
  if (!result.ok) redirect("/login");
  redirect(result.user.role === "admin" ? "/admin" : "/dashboard");
}

const passwordSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string().min(8, "New password must be at least 8 characters."),
  confirm: z.string(),
}).refine((v) => v.next === v.confirm, { message: "The two new passwords don't match.", path: ["confirm"] });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = passwordSchema.safeParse({
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue.message, field: String(issue.path[0]) };
  }

  try {
    const ok = await withUser(me.id, async (db) => {
      const { rows } = await db.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM app.auth_lookup($1)", [me.email]);
      if (!await verifyPassword(parsed.data.current, rows[0]?.password_hash ?? null)) return false;
      // Employees have no UPDATE policy on users; this SECURITY DEFINER
      // function lets them change only their own credential.
      await db.query("SELECT app.set_own_password($1)", [await hashPassword(parsed.data.next)]);
      return true;
    });
    if (!ok) return { ok: false, message: "Your current password is incorrect.", field: "current" };
    return { ok: true, message: "Password updated." };
  } catch (e) {
    return { ok: false, ...toFriendlyError(e) };
  }
}

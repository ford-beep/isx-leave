import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { LoginForm } from "./LoginForm";
import { IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ reason?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  const { reason } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="row" style={{ gap: 10 }}>
          <div className="brand-mark" style={{ width: 34, height: 34 }}>ISX</div>
          <div>
            <div style={{ fontWeight: 650 }}>ISX Leave</div>
            <div style={{ fontSize: 12, opacity: .7 }}>Internal HR system</div>
          </div>
        </div>

        <div>
          <h2>Time off, without the spreadsheet.</h2>
          <p>
            Request leave, watch it move through approval, and always know exactly how many days you have
            left — counted against the days ISX actually works.
          </p>
          <div className="auth-points">
            {[
              "Only office working days are deducted",
              "Bank of Thailand public holidays are never charged to you",
              "Your leave is private — colleagues can't see it",
            ].map((t) => (
              <div className="auth-point" key={t}>
                <span className="tick"><IconCheck size={11} /></span>{t}
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: .6 }}>© {new Date().getFullYear()} ISX Company</div>
      </div>

      <div className="auth-main">
        <LoginForm demoMode={env.demoMode} reason={reason} />
      </div>
    </div>
  );
}

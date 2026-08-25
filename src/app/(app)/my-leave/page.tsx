import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { getBalance, getMyRequests } from "@/lib/queries";
import { Card, CardHead, Kpi } from "@/components/ui";
import { LeaveTable } from "@/components/LeaveTable";
import { IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MyLeavePage() {
  const me = await requireUser();
  const year = Number(companyToday().slice(0, 4));
  const [requests, balance] = await Promise.all([
    getMyRequests(me.id),
    getBalance(me.id, me.id, year),
  ]);

  const counts = {
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>My leave</h1>
          <p className="muted">Every request you&apos;ve made, and where it stands.</p>
        </div>
        <Link href="/request" className="btn btn-primary"><IconPlus size={16} />Request leave</Link>
      </div>

      <div className="kpis k3">
        <Kpi label="Remaining this year" value={balance.remaining} unit="days" tone="accent"
          sub={`of ${balance.entitlement} days entitlement`} />
        <Kpi label="Awaiting approval" value={counts.pending}
          sub={counts.pending ? `${balance.pending} day(s) held aside` : "You're all caught up"} />
        <Kpi label="Approved requests" value={counts.approved}
          sub={counts.rejected ? `${counts.rejected} rejected` : "None rejected"} />
      </div>

      <div className="section">
        <Card>
          <CardHead title="All requests" sub={`${requests.length} total`} />
          <div className="card-body flush">
            <LeaveTable requests={requests}
              emptyAction={<Link href="/request" className="btn btn-primary"><IconPlus size={16} />Request leave</Link>} />
          </div>
        </Card>
      </div>
    </>
  );
}

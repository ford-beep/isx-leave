import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import {
  getBalance,
  getCompDayBalance,
  getCompDayCredits,
  getMyRequests,
} from "@/lib/queries";
import { Card, CardHead, Kpi } from "@/components/ui";
import { LeaveTable } from "@/components/LeaveTable";
import { IconPlus } from "@/components/icons";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export default async function MyLeavePage({
  searchParams,
}: {
  searchParams: Promise<{
    request?: string;
  }>;
}) {
 const me = await requireUser();
 const sp = await searchParams;
const highlightRequestId = sp.request;
const today = companyToday();
const year = Number(today.slice(0, 4));

  const [requests, balance, compBalance, compCredits] =
    await Promise.all([
      getMyRequests(me.id),
      getBalance(me.id, me.id, year),
      getCompDayBalance(me.id, me.id, year),
      getCompDayCredits(me.id, me.id, year),
    ]);

  const counts = {
    pending: requests.filter(
      (r) => r.status === "pending",
    ).length,
    approved: requests.filter(
      (r) => r.status === "approved",
    ).length,
    rejected: requests.filter(
      (r) => r.status === "rejected",
    ).length,
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>My leave</h1>
          <p className="muted">
            Every request you&apos;ve made, and where it
            stands.
          </p>
        </div>

        <Link
          href="/request"
          className="btn btn-primary"
        >
          <IconPlus size={16} />
          Request leave
        </Link>
      </div>

      <div className="kpis k3">
        <Kpi
          label="Remaining this year"
          value={balance.remaining}
          unit="days"
          tone="accent"
          sub={`of ${balance.entitlement} days entitlement`}
        />

        <Kpi
          label="Awaiting approval"
          value={counts.pending}
          sub={
            counts.pending
              ? `${balance.pending} day(s) held aside`
              : "You're all caught up"
          }
        />

        <Kpi
          label="Approved requests"
          value={counts.approved}
          sub={
            counts.rejected
              ? `${counts.rejected} rejected`
              : "None rejected"
          }
        />
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="Comp Days"
            sub={`Your compensatory leave balance for ${year}.`}
          />

          <div className="card-body">
            <div className="breakdown">
              <div className="breakdown-row">
                <span className="lbl">Earned</span>
                <span className="val">
                  {compBalance.earned}
                </span>
              </div>

              <div className="breakdown-row">
                <span className="lbl">
                  Approved / used
                </span>
                <span className="val">
                  {compBalance.approved}
                </span>
              </div>

              <div className="breakdown-row">
                <span className="lbl">Pending</span>
                <span className="val">
                  {compBalance.pending}
                </span>
              </div>

              <div className="breakdown-row total">
                <span className="lbl">Available</span>
                <span className="val">
                  {compBalance.available}
                </span>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop:
                  "1px solid var(--border)",
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <b>Earned from</b>
                <div className="muted-sm">
                  Weekend or company holiday work credited
                  to you.
                </div>
              </div>

              {compCredits.length === 0 ? (
                <p className="muted-sm">
                  No Comp Days earned in {year}.
                </p>
              ) : (
                <div className="stack">
                  {compCredits.map((credit) => (
                    <div
                      key={credit.id}
                      className="breakdown"
                    >
                      <div className="breakdown-row">
                        <span className="lbl">
                          <b>
                            {formatDate(
                              credit.earnedDate,
                            )}
                          </b>

                          {credit.note ? (
                            <>
                              <br />
                              <span className="tiny">
                                {credit.note}
                              </span>
                            </>
                          ) : null}
                        </span>

                        <span className="val">
                          +1 Comp Day
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="All requests"
            sub={`${requests.length} total`}
          />

          <div className="card-body flush">
<LeaveTable
  requests={requests}
  allowSelfCancel
  today={today}
  highlightRequestId={highlightRequestId}
  emptyAction={
    <Link
      href="/request"
      className="btn btn-primary"
    >
      <IconPlus size={16} />
      Request leave
    </Link>
  }
/>
          </div>
        </Card>
      </div>
    </>
  );
}
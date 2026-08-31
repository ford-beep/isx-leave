import { requireUser } from "@/lib/auth";
import { companyToday, formatDate } from "@/lib/date";
import { getBalance, getEntitlements, getUser } from "@/lib/queries";
import { Card, CardHead, Person } from "@/components/ui";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireUser();
  const year = Number(companyToday().slice(0, 4));
  const [profile, balance, entitlements] = await Promise.all([
    getUser(me.id, me.id),
    getBalance(me.id, me.id, year),
    getEntitlements(me.id, me.id),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Profile</h1>
          <p className="muted">Your account and leave entitlement history.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHead title="Account" />
            <div className="card-body">
<Person
  name={profile?.name ?? me.name}
  email={profile?.email ?? me.email}
/>

<div className="divider" />

<ProfileForm
  name={profile?.name ?? me.name}
  email={profile?.email ?? me.email}
/>

<div className="divider" />

<dl className="dl">
                <dt>Job title</dt><dd>{profile?.jobTitle ?? "—"}</dd>
                <dt>Role</dt><dd>{me.role === "admin" ? "Administrator" : "Employee"}</dd>
                <dt>Status</dt>
                <dd><span className="badge badge-approved">Active</span></dd>
                <dt>Joined</dt><dd>{profile ? formatDate(profile.createdAt.slice(0, 10)) : "—"}</dd>
              </dl>
<p className="tiny mt-16">
  Role and leave entitlement are managed by an administrator.
</p>
            </div>
          </Card>

          <Card>
            <CardHead title="Entitlement by year" sub="Leave is allocated per calendar year." />
            <div className="card-body flush">
              <table className="tbl">
                <thead><tr><th>Year</th><th className="r">Days</th><th>Note</th></tr></thead>
                <tbody>
                  {entitlements.map((e) => (
                    <tr key={e.year}>
                      <td data-label="Year" className="primary">{e.year}</td>
                      <td data-label="Days" className="r num">{e.totalDays}</td>
                      <td data-label="Note" className="muted-sm">{e.note ?? "—"}</td>
                    </tr>
                  ))}
                  {entitlements.length === 0 && (
                    <tr><td colSpan={3} className="muted-sm">No entitlement recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHead title={`${year} summary`} />
            <div className="card-body">
              <dl className="dl">
                <dt>Entitlement</dt><dd className="num">{balance.entitlement} days</dd>
                <dt>Approved</dt><dd className="num">{balance.approved} days</dd>
                <dt>Pending</dt><dd className="num">{balance.pending} days</dd>
                <dt>Remaining</dt><dd className="num">{balance.remaining} days</dd>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHead title="Change password" />
            <div className="card-body"><ChangePasswordForm /></div>
          </Card>
        </div>
      </div>
    </>
  );
}

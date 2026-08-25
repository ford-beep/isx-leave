import { requireAdmin } from "@/lib/auth";
import { companyToday } from "@/lib/date";
import { getHolidays, getHolidayYears, getOfficeDays, getSetting } from "@/lib/queries";
import { OfficeDaysForm } from "./OfficeDaysForm";
import { HolidaySettings } from "./HolidaySettings";
import { DefaultEntitlementForm } from "./DefaultEntitlementForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: { searchParams: Promise<{ hy?: string }> }) {
  const me = await requireAdmin();
  const today = companyToday();
  const sp = await searchParams;

  const years = await getHolidayYears(me.id);
  const holidayYear = Number(sp.hy) || Number(today.slice(0, 4));

  const [office, holidays, defaultEntitlement] = await Promise.all([
    getOfficeDays(me.id),
    getHolidays(me.id, holidayYear),
    getSetting(me.id, "default_annual_entitlement"),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Settings</h1>
          <p className="muted">Working calendar, holidays and company-wide leave defaults.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <OfficeDaysForm
            current={office.weekdays}
            effectiveFrom={office.effectiveFrom}
            today={today}
          />
          <DefaultEntitlementForm value={Number(defaultEntitlement ?? 15)} />
        </div>

        <HolidaySettings
          holidays={holidays}
          year={holidayYear}
          years={years.length ? years : [Number(today.slice(0, 4))]}
        />
      </div>
    </>
  );
}

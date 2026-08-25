/**
 * Generates a static snapshot of the ISX Leave UI using the application's real
 * stylesheet and real seeded data, so the design can be reviewed without a
 * running Next.js server.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  formatDate,
  formatRange,
  monthGrid,
  parseISO,
  relativeDayLabel,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
} from "../src/lib/date";

const env = { ...process.env, PGPASSWORD: "isx_owner_pw" };
const q = (sql: string) => JSON.parse(execFileSync("psql",
  ["-h","127.0.0.1","-U","isx_owner","-d","isx_leave","-tAc",
   `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
  { env, encoding: "utf8" }).trim());

const TODAY = "2026-08-14";
const css = readFileSync("src/app/globals.css", "utf8");

const esc = (s: unknown) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const initials = (n: string) => n.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join("");
const avatar = (n: string, cls="") => `<div class="avatar ${cls}">${initials(n)}</div>`;
const person = (n: string, e?: string) =>
  `<div class="person">${avatar(n)}<div><div class="person-name">${esc(n)}</div>${e?`<div class="person-mail">${esc(e)}</div>`:""}</div></div>`;
const badge = (s: string) => `<span class="badge badge-${s}">${s[0].toUpperCase()+s.slice(1)}</span>`;

// ---------------------------------------------------------------- data
const jane = q(`select * from users where email='jane@demo.isx.local'`)[0];
const admin = q(`select * from users where email='admin@demo.isx.local'`)[0];
const janeBal = q(`select entitlement::float8, approved::float8, pending::float8, remaining::float8, available::float8 from app.leave_balance('${jane.id}',2026)`)[0];
const janeReqs = q(`select lr.id, lt.label, lr.start_date::text s, lr.end_date::text e, lr.leave_days::float8 d, lr.status, lr.created_at::date::text c, lr.reason, lr.rejection_reason
  from leave_requests lr join leave_types lt on lt.code=lr.leave_type where lr.employee_id='${jane.id}' order by lr.start_date desc`);
const holidays = q(`select holiday_date::text d, name, name_th, source, type, active from holidays where year=2026 order by holiday_date`);
const office = q(`select weekday from office_days where is_office_day and effective_to is null order by weekday`).map((r:any)=>r.weekday);
const pending = q(`select lr.id, u.name, u.email, lt.label, lr.start_date::text s, lr.end_date::text e, lr.leave_days::float8 d, lr.reason
  from leave_requests lr join users u on u.id=lr.employee_id join leave_types lt on lt.code=lr.leave_type where lr.status='pending' order by lr.start_date`);
const roster = q(`select u.name, u.email, u.role, u.active, b.entitlement::float8 ent, b.approved::float8 used, b.remaining::float8 rem
  from users u, lateral app.leave_balance(u.id,2026) b order by u.active desc, u.name`);
const upcoming = q(`select u.name, lt.label, lr.start_date::text s, lr.end_date::text e, lr.leave_days::float8 d
  from leave_requests lr join users u on u.id=lr.employee_id join leave_types lt on lt.code=lr.leave_type
  where lr.status='approved' and lr.end_date >= date '${TODAY}' order by lr.start_date limit 6`);
const stats = q(`select
  (select count(*) from users) tot,(select count(*) from users where active) act,
  (select count(*) from leave_requests where status='pending') pend,
  (select count(*) from leave_requests where status='approved' and date_trunc('month',start_date)=date_trunc('month',date '${TODAY}')) appm,
  (select coalesce(sum(leave_days),0)::float8 from leave_requests where status='approved' and leave_year=2026) used`)[0];
const calc = q(`select app.calc_leave_days('2026-09-18','2026-09-22') c`)[0].c;
const audit = q(`select a.action, a.entity_type, a.metadata, a.created_at, u.name actor
  from audit_logs a left join users u on u.id=a.actor_id order by a.created_at desc limit 8`);
const janeNext = janeReqs.find((r:any)=>r.status==="approved" && r.e>=TODAY);
const officeNames = office.map((d:number)=>WEEKDAY_NAMES[d]).join(" + ");

// ------------------------------------------------------------- calendar
function calendarHtml(year:number, month:number, reqs:any[], mode:"employee"|"admin") {
  const officeSet=new Set(office);
  const hol=new Map(holidays.filter((h:any)=>h.active).map((h:any)=>[h.d,h]));
  const ent=new Map<string,{label:string;status:string;title:string}[]>();
  for (const r of reqs) for (let d=r.s; d<=r.e;) {
    const l=ent.get(d)??[];
    l.push({label: mode==="admin"? r.name : "My leave", status:r.status??"approved",
            title: mode==="admin"?`${r.name} — ${r.label} — ${r.status??"approved"}`:`${r.label} — ${r.status??"approved"}`});
    ent.set(d,l);
    const n=parseISO(d); n.setUTCDate(n.getUTCDate()+1); d=n.toISOString().slice(0,10);
  }
  const cells=monthGrid(year,month-1).map(date=>{
    const dt=parseISO(date), inM=dt.getUTCMonth()===month-1, isO=officeSet.has(dt.getUTCDay());
    const h:any=hol.get(date), es=ent.get(date)??[];
    const cls=["cal-cell",inM?"":"out",h?"holiday":isO?"office":"",date===TODAY?"today":""].filter(Boolean).join(" ");
    return `<div class="${cls}"><div class="cal-num">${dt.getUTCDate()}</div>
      ${isO&&!h?`<span class="cal-office-dot" title="Office day"></span>`:""}
      ${h?`<div class="cal-tag hol" title="${esc(h.name)} (${esc(h.source)})">${esc(h.name)}</div>`:""}
      ${es.slice(0,2).map(x=>`<div class="cal-tag ${x.status}" title="${esc(x.title)}">${esc(x.label)}</div>`).join("")}
      ${es.length>2?`<div class="cal-tag more">+${es.length-2} more</div>`:""}</div>`;
  }).join("");
  return `<div><div class="cal-head"><div class="cal-title">${["January","February","March","April","May","June","July","August","September","October","November","December"][month-1]} ${year}</div>
    <div class="row" style="margin-left:auto;gap:6px">
      <button class="btn btn-sm">&lsaquo;</button><button class="btn btn-sm">Today</button><button class="btn btn-sm">&rsaquo;</button></div></div>
    <div class="cal"><div class="cal-dow">${WEEKDAY_SHORT.map(d=>`<div>${d}</div>`).join("")}</div>
    <div class="cal-grid">${cells}</div></div>
    <div class="legend">${[["var(--cal-office)","Office day"],["var(--cal-approved)","Approved leave"],["var(--cal-pending)","Pending leave"],["var(--cal-holiday)","Public holiday"],["var(--c-surface)","Non-office day"]]
      .map(([c,l])=>`<span class="legend-item"><span class="legend-swatch" style="background:${c}"></span>${l}</span>`).join("")}</div></div>`;
}

// ----------------------------------------------------------------- shell
const navItem=(href:string,label:string,active=false,count?:number)=>
  `<a class="nav-item" href="#" ${active?'aria-current="page"':""}><span class="ico">${ICONS[href]??""}</span><span>${label}</span>${count?`<span class="count">${count}</span>`:""}</a>`;

const ICONS: Record<string,string> = {
  dashboard:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>`,
  list:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`,
  calendar:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  plus:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  user:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>`,
  shield:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V6z"/><path d="m9.5 12 1.8 1.8 3.5-3.6"/></svg>`,
  users:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.5a6.5 6.5 0 0 1 4 5.5"/></svg>`,
  settings:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8.5"/></svg>`,
  file:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
};

function shell(user:any, current:string, title:string, body:string) {
  const isAdmin = user.role==="admin";
  const nav = [
    `<div class="nav-label">My leave</div>`,
    navItem("dashboard","Dashboard",current==="dashboard"),
    navItem("list","My leave",current==="my-leave"),
    navItem("calendar","Calendar",current==="calendar"),
    navItem("plus","Request leave",current==="request"),
    navItem("user","Profile",current==="profile"),
    isAdmin?[`<div class="nav-label">Administration</div>`,
      navItem("shield","Admin dashboard",current==="admin"),
      navItem("list","Leave requests",current==="admin-requests",stats.pend),
      navItem("users","Employees",current==="admin-employees"),
      navItem("calendar","Company calendar",current==="admin-calendar"),
      navItem("settings","Settings",current==="admin-settings"),
      navItem("file","Audit log",current==="admin-audit")].join(""):"",
  ].join("");

  return `<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">ISX</div><div class="brand-text"><span class="brand-name">Leave</span><span class="brand-sub">ISX Company</span></div></div>
    <nav class="nav">${nav}</nav>
    <div class="sidebar-foot"><div class="userbox">${avatar(user.name)}
      <div class="userbox-meta"><div class="userbox-name">${esc(user.name)}</div><div class="userbox-role">${isAdmin?"Administrator":"Employee"}</div></div>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" title="Sign out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"/><path d="M10 12h11m0 0-3-3m3 3-3 3"/></svg></button></div></div>
  </aside>
  <div class="main">
    <header class="topbar"><h1>${esc(title)}</h1><div class="topbar-spacer"></div>
      <button class="btn btn-ghost" style="position:relative"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
      <span style="position:absolute;top:4px;right:5px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--c-bad);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center">2</span></button>
    </header>
    <div class="content">${body}</div>
  </div></div>`;
}

// ------------------------------------------------------------- screens
const kpi=(l:string,v:string,u?:string,sub?:string,tone?:string,meter?:[number,number])=>{
  const pct=meter&&meter[1]>0?Math.min(100,Math.round(meter[0]/meter[1]*100)):0;
  return `<div class="kpi ${tone??""}"><div class="kpi-label">${l}</div>
  <div class="kpi-value ${v.length>6?"sm":""}">${esc(v)}${u?`<span class="unit">${u}</span>`:""}</div>
  ${meter?`<div class="meter ${pct>=80?"low":""}"><span style="width:${pct}%"></span></div>`:""}
  ${sub?`<div class="kpi-sub">${esc(sub)}</div>`:""}</div>`;};

const empDashboard = shell(jane,"dashboard","Dashboard",`
<div class="page-head"><div class="grow"><h1>Good afternoon, Jane</h1>
  <p class="muted">ISX office days are <b>${officeNames}</b>. Only those days count against your leave.</p></div>
  <a class="btn btn-primary" href="#">${ICONS.plus}Request leave</a></div>
<div class="kpis">
  ${kpi("Annual entitlement",String(janeBal.entitlement),"days","For 2026")}
  ${kpi("Used",String(janeBal.approved),"days",`${janeBal.pending} more awaiting approval`,undefined,[janeBal.approved,janeBal.entitlement])}
  ${kpi("Remaining",String(janeBal.remaining),"days",`${janeBal.available} available once pending is counted`,"accent")}
  ${kpi("Next leave",janeNext?formatRange(janeNext.s,janeNext.e):"None",undefined,janeNext?`${janeNext.label} · ${janeNext.d} days · ${relativeDayLabel(janeNext.s,TODAY)}`:"No upcoming leave")}
</div>
<div class="section grid-2">
  <div class="card"><div class="card-head"><div style="flex:1"><h2>This month</h2><p class="muted-sm" style="margin-top:2px">Your leave, ISX office days and Thai public holidays.</p></div></div>
    <div class="card-body">${calendarHtml(2026,8,janeReqs.filter((r:any)=>["approved","pending"].includes(r.status)),"employee")}</div></div>
  <div class="stack">
    <div class="card"><div class="card-head"><h2>Upcoming leave</h2></div><div class="card-body">
      <div style="font-size:18px;font-weight:650;letter-spacing:-.02em">${formatRange(janeNext.s,janeNext.e)}</div>
      <div class="row" style="margin-top:8px;gap:8px">${badge("approved")}<span class="chip">${esc(janeNext.label)}</span><span class="chip">${janeNext.d} days</span></div>
      <p class="muted-sm mt-16">Starts ${relativeDayLabel(janeNext.s,TODAY)}.</p></div></div>
    <div class="card"><div class="card-head"><h2>Leave types</h2></div><div class="card-body stack" style="gap:10px">
      ${q(`select label,description from leave_types where active order by sort_order`).map((t:any)=>
        `<div><div style="font-size:13px;font-weight:600">${esc(t.label)}</div><div class="tiny">${esc(t.description)}</div></div>`).join("")}
    </div></div>
  </div></div>
<div class="section"><div class="card"><div class="card-head"><div style="flex:1"><h2>Recent leave requests</h2></div><a class="btn btn-sm" href="#">View all</a></div>
<div class="card-body flush"><div class="table-wrap"><table class="tbl">
<thead><tr><th>Date</th><th>Leave type</th><th class="r">Days</th><th>Status</th><th>Submitted</th><th class="r">Action</th></tr></thead>
<tbody>${janeReqs.map((r:any)=>`<tr>
  <td data-label="Date" class="primary nowrap">${formatRange(r.s,r.e)}</td>
  <td data-label="Leave type">${esc(r.label)}${r.rejection_reason?`<div class="tiny" style="margin-top:2px">Reason: ${esc(r.rejection_reason)}</div>`:""}</td>
  <td data-label="Days" class="r num">${r.d}</td><td data-label="Status">${badge(r.status)}</td>
  <td data-label="Submitted" class="muted-sm nowrap">${formatDate(r.c)}</td>
  <td data-label="Action" class="r"><div class="actions">${r.status==="pending"?'<button class="btn btn-sm">Cancel</button>':'<span class="tiny">—</span>'}</div></td></tr>`).join("")}
</tbody></table></div></div></div></div>`);

const requestScreen = shell(jane,"request","Request leave",`
<div class="page-head"><div class="grow"><h1>Request leave</h1>
<p class="muted">You have <b>${janeBal.available} days</b> available to book in 2026.</p></div></div>
<div class="grid-2">
 <div class="card"><div class="card-head"><div style="flex:1"><h2>Request leave</h2><p class="muted-sm" style="margin-top:2px">Days are deducted only for office working days that aren't public holidays.</p></div></div>
  <div class="card-body stack">
    <div class="field"><label>Leave type</label><select class="select"><option>Annual Leave</option></select><span class="hint">Paid time off from the yearly entitlement.</span></div>
    <div class="form-grid">
      <div class="field"><label>Start date</label><input class="input" type="text" value="2026-09-18"></div>
      <div class="field"><label>End date</label><input class="input" type="text" value="2026-09-22"></div>
    </div>
    <div class="field"><label>Reason or note</label><textarea class="textarea">Long weekend with family</textarea><span class="hint">Optional — helpful context for whoever approves it.</span></div>
  </div>
  <div class="card-foot spread"><span class="tiny">${calc.leaveDays} day(s) will be deducted</span>
  <button class="btn btn-primary">Submit request</button></div></div>
 <div class="stack">
  <div class="card"><div class="card-head"><h2>How this is calculated</h2></div><div class="card-body">
   <div class="breakdown">
     <div class="breakdown-row"><span class="lbl">Calendar days selected</span><span class="val">${calc.totalCalendarDays}</span></div>
     <div class="breakdown-row"><span class="lbl">Non-office days (weekends and days ISX doesn't work)</span><span class="val">− ${calc.excludedNonOfficeDays}</span></div>
     <div class="breakdown-row"><span class="lbl">Public holidays falling on an office day</span><span class="val">− ${calc.excludedHolidays}</span></div>
     <div class="breakdown-row total"><span class="lbl">Leave days deducted</span><span class="val">${calc.leaveDays}</span></div>
   </div>
   <div class="mt-16"><div class="tiny" style="font-weight:650;margin-bottom:6px">Days in this range</div>
   <div class="stack" style="gap:4px">${calc.days.map((d:any)=>`<div class="row" style="gap:8px"><span class="tiny" style="width:96px">${formatDate(d.date)}</span>
     <span class="tiny">${WEEKDAY_NAMES[parseISO(d.date).getUTCDay()]}</span>
     <span class="chip" style="margin-left:auto;${d.deducted?"background:var(--c-brand-soft);color:var(--c-brand-ink)":""}">${d.deducted?"deducted":d.holiday?"holiday":"non-office day"}</span></div>`).join("")}</div></div>
  </div></div>
  <div class="card"><div class="card-head"><h2>Your balance</h2></div><div class="card-body">
   <dl class="dl"><dt>Annual entitlement</dt><dd class="num">${janeBal.entitlement} days</dd>
   <dt>Approved so far</dt><dd class="num">${janeBal.approved} days</dd>
   <dt>Awaiting approval</dt><dd class="num">${janeBal.pending} days</dd>
   <dt>Available to book</dt><dd class="num">${janeBal.available} days</dd></dl>
   <p class="tiny mt-16">Only approved leave reduces your official balance. Pending requests are held aside so you can't book the same days twice.</p>
  </div></div>
 </div></div>`);

const adminDashboard = shell(admin,"admin","Admin dashboard",`
<div class="page-head"><div class="grow"><h1>ISX Leave Management</h1>
<p class="muted">${stats.pend} requests waiting on you.</p></div><a class="btn" href="#">All requests</a></div>
<div class="kpis">
 ${kpi("Employees",String(stats.tot),undefined,`${stats.act} active`)}
 ${kpi("Pending requests",String(stats.pend),undefined,"Needs a decision","warn")}
 ${kpi("Approved this month",String(stats.appm),undefined,"Requests starting this month")}
 ${kpi("Leave days used",String(stats.used),"days","Company-wide in 2026")}
</div>
<div class="section"><div class="card"><div class="card-head"><div style="flex:1"><h2>Pending leave requests</h2>
<p class="muted-sm" style="margin-top:2px">Approve or reject directly from here.</p></div></div>
<div class="card-body flush"><div class="table-wrap"><table class="tbl">
<thead><tr><th>Employee</th><th>Leave</th><th>Date</th><th class="r">Days</th><th>Status</th><th class="r">Action</th></tr></thead>
<tbody>${pending.map((r:any)=>`<tr><td data-label="Employee">${person(r.name,r.email)}</td>
<td data-label="Leave">${esc(r.label)}${r.reason?`<div class="tiny" style="margin-top:2px">${esc(r.reason)}</div>`:""}</td>
<td data-label="Date" class="nowrap">${formatRange(r.s,r.e)}</td><td data-label="Days" class="r num">${r.d}</td>
<td data-label="Status">${badge("pending")}</td>
<td data-label="Action" class="r"><div class="actions"><button class="btn btn-sm btn-ok">Approve</button><button class="btn btn-sm btn-danger">Reject</button></div></td></tr>`).join("")}
</tbody></table></div></div></div></div>
<div class="section grid-2">
 <div class="card"><div class="card-head"><div style="flex:1"><h2>Employee leave overview</h2><p class="muted-sm" style="margin-top:2px">Balances for 2026</p></div><a class="btn btn-sm" href="#">Manage</a></div>
 <div class="card-body flush"><div class="table-wrap"><table class="tbl">
 <thead><tr><th>Employee</th><th class="r">Entitlement</th><th class="r">Used</th><th class="r">Remaining</th></tr></thead>
 <tbody>${roster.map((e:any)=>`<tr><td data-label="Employee">${person(e.name,e.email)}</td>
 <td data-label="Entitlement" class="r num">${e.ent}</td><td data-label="Used" class="r num">${e.used}</td>
 <td data-label="Remaining" class="r num primary">${e.rem}</td></tr>`).join("")}</tbody></table></div></div></div>
 <div class="card"><div class="card-head"><div style="flex:1"><h2>Upcoming leave</h2><p class="muted-sm" style="margin-top:2px">Approved, in the next 45 days</p></div></div>
 <div class="card-body"><div class="stack" style="gap:14px">${upcoming.map((r:any)=>`<div class="row" style="gap:10px;align-items:flex-start">
 <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(r.name)}</div>
 <div class="tiny">${formatRange(r.s,r.e)} · ${esc(r.label)} · ${r.d}d</div></div>
 <span class="chip">${relativeDayLabel(r.s,TODAY)}</span></div>`).join("")}</div></div></div>
</div>`);

const adminCalendar = shell(admin,"admin-calendar","Company calendar",`
<div class="page-head"><div class="grow"><h1>Company calendar</h1>
<p class="muted">Everyone's approved and pending leave. Office days are <b>${officeNames}</b>.</p></div>
<select class="select" style="width:210px"><option>All employees</option><option>Jane Mitchell</option><option>John Prasert</option><option>Mike Chen</option></select></div>
<div class="grid-2">
 <div class="card"><div class="card-body">${calendarHtml(2026,9,
   q(`select u.name, lt.label, lr.start_date::text s, lr.end_date::text e, lr.status from leave_requests lr join users u on u.id=lr.employee_id join leave_types lt on lt.code=lr.leave_type where lr.status in ('approved','pending')`),
   "admin")}</div></div>
 <div class="stack">
  <div class="card"><div class="card-head"><div style="flex:1"><h2>Who's away this month</h2></div></div><div class="card-body">
  <div class="stack" style="gap:12px">${upcoming.slice(0,4).map((r:any)=>`<div class="row" style="gap:10px;align-items:flex-start">
  <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(r.name)}</div><div class="tiny">${formatRange(r.s,r.e)} · ${esc(r.label)}</div></div>
  <span class="chip num">${r.d}d</span></div>`).join("")}</div></div></div>
  <div class="card"><div class="card-head"><h2>Holidays this month</h2></div><div class="card-body">
  <div class="stack" style="gap:10px">${holidays.filter((h:any)=>h.d.slice(5,7)==="09").length?holidays.filter((h:any)=>h.d.slice(5,7)==="09").map((h:any)=>
   `<div><div class="row" style="gap:8px"><span style="font-size:13px;font-weight:650">${formatDate(h.d)}</span><span class="badge plain badge-info">${esc(h.source)}</span></div><div class="tiny">${esc(h.name)}</div></div>`).join("")
   :'<p class="muted-sm">No public holidays this month.</p>'}</div></div></div>
 </div></div>`);

const settingsScreen = shell(admin,"admin-settings","Settings",`
<div class="page-head"><div class="grow"><h1>Settings</h1><p class="muted">Working calendar, holidays and company-wide leave defaults.</p></div></div>
<div class="grid-2">
 <div class="stack">
  <div class="card"><div class="card-head"><div style="flex:1"><h2>Office working days</h2>
  <p class="muted-sm" style="margin-top:2px">In force since 1 Jan 2026. These are the days leave is deducted for.</p></div></div>
  <div class="card-body stack">
   <div class="stack" style="gap:6px">${[1,2,3,4,5,6,0].map(d=>`<label class="check ${office.includes(d)?"on":""}">
   <input type="checkbox" ${office.includes(d)?"checked":""}><span class="check-body"><span class="check-title">${WEEKDAY_NAMES[d]}</span></span></label>`).join("")}</div>
   <div class="field"><label>Takes effect from</label><input class="input" value="2026-08-14"><span class="hint">Leave already approved keeps the day count it was approved with.</span></div>
   <div class="alert alert-info"><span>Changing office days only affects requests submitted <b>after</b> the effective date. Historical requests keep their original calculation so past approvals stay auditable.</span></div>
  </div><div class="card-foot" style="text-align:right"><button class="btn btn-primary">Save office days</button></div></div>
  <div class="card"><div class="card-head"><div style="flex:1"><h2>Default annual entitlement</h2><p class="muted-sm" style="margin-top:2px">Used for new employees and for anyone without a row for a given year.</p></div></div>
  <div class="card-body"><div class="field"><label>Days per year</label><input class="input" value="15"><span class="hint">Individual employees can still be given more or fewer days.</span></div></div>
  <div class="card-foot" style="text-align:right"><button class="btn btn-primary">Save default</button></div></div>
 </div>
 <div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px">
   <div style="flex:1;min-width:140px"><h2>Public holidays</h2><p class="muted-sm" style="margin-top:2px">Source of truth: Bank of Thailand financial-institution calendar.</p></div>
   <select class="select" style="width:104px"><option>2026</option><option>2027</option></select>
   <button class="btn btn-sm">Import year</button><button class="btn btn-sm btn-primary">${ICONS.plus}Add</button></div>
  <div class="card-body flush"><div class="table-wrap"><table class="tbl">
  <thead><tr><th>Date</th><th>Holiday</th><th>Source</th><th>Status</th><th class="r">Action</th></tr></thead>
  <tbody>${holidays.map((h:any)=>`<tr><td data-label="Date" class="primary nowrap">${formatDate(h.d)}</td>
  <td data-label="Holiday">${esc(h.name)}${h.name_th?`<div class="tiny">${esc(h.name_th)}</div>`:""}</td>
  <td data-label="Source"><span class="badge plain badge-info">${esc(h.source)}</span></td>
  <td data-label="Status"><span class="badge badge-approved">Active</span></td>
  <td data-label="Action" class="r"><div class="actions"><button class="btn btn-sm">Disable</button></div></td></tr>`).join("")}
  </tbody></table></div></div></div>
</div>`);

const auditScreen = shell(admin,"admin-audit","Audit log",`
<div class="page-head"><div class="grow"><h1>Audit log</h1>
<p class="muted">Append-only record of every decision and configuration change. Written by the database itself, so it can't be bypassed or edited — not even by an administrator.</p></div>
<select class="select" style="width:210px"><option>Everything</option></select></div>
<div class="card"><div class="card-head"><div style="flex:1"><h2>Recent activity</h2></div></div>
<div class="card-body flush"><div class="table-wrap"><table class="tbl">
<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
<tbody>${audit.map((a:any)=>{
  const m=a.metadata??{}; const label:Record<string,string>={"leave.submitted":"submitted a leave request","leave.approved":"approved leave","leave.rejected":"rejected leave","leave.cancelled":"cancelled a leave request","user.insert":"added an employee","user.update":"edited an employee","leave_entitlement.insert":"set a leave entitlement","office_day.insert":"changed office working days","holiday.insert":"added a holiday","leave_type.insert":"added a leave type"};
  const det=[m.employee_name,m.start_date&&`${m.start_date} → ${m.end_date}`,m.leave_days!==undefined&&`${m.leave_days} day(s)`,m.rejection_reason&&`“${m.rejection_reason}”`].filter(Boolean).join(" · ")
    || (m.after? [m.after.name,m.after.email,m.after.total_days!==undefined&&`${m.after.total_days} days`,m.after.year].filter(Boolean).join(" · "):"");
  return `<tr><td data-label="When" class="muted-sm nowrap">${new Date(a.created_at).toLocaleString("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
  <td data-label="Who" class="primary">${esc(a.actor??"System")}</td>
  <td data-label="Action"><span class="chip">${label[a.action]??a.action}</span></td>
  <td data-label="Details" class="muted-sm">${esc(det)}</td></tr>`;}).join("")}
</tbody></table></div></div></div>`);

const loginScreen = `<div class="auth-wrap">
<div class="auth-side">
 <div class="row" style="gap:10px"><div class="brand-mark" style="width:34px;height:34px">ISX</div>
 <div><div style="font-weight:650">ISX Leave</div><div style="font-size:12px;opacity:.7">Internal HR system</div></div></div>
 <div><h2>Time off, without the spreadsheet.</h2>
 <p>Request leave, watch it move through approval, and always know exactly how many days you have left — counted against the days ISX actually works.</p>
 <div class="auth-points">${["Only office working days are deducted","Bank of Thailand public holidays are never charged to you","Your leave is private — colleagues can't see it"]
   .map(t=>`<div class="auth-point"><span class="tick">✓</span>${t}</div>`).join("")}</div></div>
 <div style="font-size:12px;opacity:.6">© 2026 ISX Company</div></div>
<div class="auth-main"><div class="auth-card">
 <h1>Sign in</h1><p class="muted-sm" style="margin-bottom:20px">Use your ISX work email address.</p>
 <form class="stack">
  <div class="field"><label>Email address</label><input class="input" placeholder="you@isx.co.th"></div>
  <div class="field"><label>Password</label><input class="input" type="password" placeholder="••••••••"></div>
  <button class="btn btn-primary btn-lg btn-block">Sign in</button></form>
 <div class="divider"></div>
 <div class="tiny" style="font-weight:650;margin-bottom:2px">Demo accounts</div>
 <p class="tiny">One click to sign in. Disabled automatically in production.</p>
 <div class="demo-users">${[["Somchai Wattana","Admin · HR & Operations"],["Jane Mitchell","Employee · 15 days"],["John Prasert","Employee · 20 days"],["Mike Chen","Employee · 12 days"]]
   .map(([n,r])=>`<button class="demo-user">${avatar(n)}<span><span style="display:block;font-size:13px;font-weight:600">${n}</span><span class="tiny">${r}</span></span></button>`).join("")}</div>
</div></div></div>`;

const SCREENS: Array<[string,string,string]> = [
  ["login","Sign in",loginScreen],
  ["employee-dashboard","Employee · Dashboard",empDashboard],
  ["request","Employee · Request leave",requestScreen],
  ["admin-dashboard","Admin · Dashboard",adminDashboard],
  ["admin-calendar","Admin · Company calendar",adminCalendar],
  ["admin-settings","Admin · Settings",settingsScreen],
  ["admin-audit","Admin · Audit log",auditScreen],
];

// Individual files for screenshotting
for (const [id,,html] of SCREENS) {
  writeFileSync(`/tmp/screen-${id}.html`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${id}</title><style>${css}</style></head><body>${html}</body></html>`);
}

// Combined, self-contained preview with a switcher
const combined = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ISX Leave Management — design preview</title><style>${css}
.pv-bar{position:sticky;top:0;z-index:200;display:flex;gap:6px;flex-wrap:wrap;align-items:center;
 padding:10px 16px;background:#101828;color:#fff;box-shadow:var(--sh)}
.pv-bar .t{font-weight:650;font-size:13px;margin-right:8px}
.pv-bar button{font-family:inherit;font-size:12.5px;font-weight:550;padding:5px 10px;border-radius:6px;
 border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;cursor:pointer}
.pv-bar button:hover{background:rgba(255,255,255,.14)}
.pv-bar button[aria-pressed="true"]{background:#fff;color:#101828;border-color:#fff}
.pv-note{padding:8px 16px;background:#fffaeb;border-bottom:1px solid #fedf89;color:#7a2e0e;font-size:12.5px}
.pv-screen{display:none}.pv-screen.on{display:block}
</style></head><body style="background:var(--c-bg)">
<div class="pv-bar"><span class="t">ISX Leave — design preview</span>
${SCREENS.map(([id,label],i)=>`<button data-s="${id}" aria-pressed="${i===0?"true":"false"}">${label}</button>`).join("")}</div>
<div class="pv-note">Static snapshot rendered from the application's own stylesheet and the seeded demo database (14 Aug 2026). Buttons and forms are inert here — run <code>npm run dev</code> for the working app.</div>
${SCREENS.map(([id,,html],i)=>`<div class="pv-screen ${i===0?"on":""}" id="s-${id}">${html}</div>`).join("")}
<script>
document.querySelectorAll(".pv-bar button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".pv-bar button").forEach(x=>x.setAttribute("aria-pressed","false"));
  b.setAttribute("aria-pressed","true");
  document.querySelectorAll(".pv-screen").forEach(s=>s.classList.remove("on"));
  document.getElementById("s-"+b.dataset.s).classList.add("on");
  window.scrollTo(0,0);
}));
</script></body></html>`;
writeFileSync("/home/claude/isx-leave/design-preview/index.html", combined);
console.log("preview written:", SCREENS.length, "screens");

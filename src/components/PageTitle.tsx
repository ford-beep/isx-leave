"use client";

import { usePathname } from "next/navigation";

const TITLES: Array<[RegExp, string]> = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/my-leave/, "My leave"],
  [/^\/calendar/, "Calendar"],
  [/^\/request/, "Request leave"],
  [/^\/profile/, "Profile"],
  [/^\/admin\/requests/, "Leave requests"],
  [/^\/admin\/employees\/[^/]+/, "Employee detail"],
  [/^\/admin\/employees/, "Employees"],
  [/^\/admin\/calendar/, "Company calendar"],
  [/^\/admin\/settings/, "Settings"],
  [/^\/admin\/audit/, "Audit log"],
  [/^\/admin/, "Admin dashboard"],
];

export function PageTitle() {
  const pathname = usePathname();
  const match = TITLES.find(([re]) => re.test(pathname));
  return <h1>{match?.[1] ?? "ISX Leave"}</h1>;
}

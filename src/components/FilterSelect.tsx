"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** A select that pushes its value into the URL query — keeps pages as server
 *  components while still feeling instant. */
export function FilterSelect({ name, options, value, basePath, label }: {
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  basePath: string;
  label?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      className="select"
      aria-label={label ?? name}
      defaultValue={value}
      style={{ width: 210 }}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value === "all") next.delete(name);
        else next.set(name, e.target.value);
        router.push(`${basePath}?${next.toString()}`);
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

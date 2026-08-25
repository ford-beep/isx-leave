/** Minimal inline icon set — no icon dependency, no runtime cost. */
type P = { className?: string; size?: number };
const base = (size = 16) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconHome = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
export const IconList = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>);
export const IconCalendar = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>);
export const IconPlus = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>);
export const IconUser = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>);
export const IconUsers = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.5a6.5 6.5 0 0 1 4 5.5" /></svg>);
export const IconSettings = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.6h.1A2 2 0 1 1 13 3.5v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>);
export const IconShield = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3l7 3v5.5c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V6z" /><path d="m9.5 12 1.8 1.8 3.5-3.6" /></svg>);
export const IconCheck = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const IconX = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconClock = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></svg>);
export const IconBell = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>);
export const IconInbox = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 13.5 5.5 5h13L21 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 13.5h5l1.2 2.5h5.6L16 13.5h5" /></svg>);
export const IconChevronLeft = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>);
export const IconChevronRight = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>);
export const IconLogout = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /><path d="M10 12h11m0 0-3-3m3 3-3 3" /></svg>);
export const IconSun = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IconAlert = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17.2h.01" /></svg>);
export const IconFile = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>);

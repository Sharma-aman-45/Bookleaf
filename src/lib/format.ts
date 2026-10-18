export function inr(value: number | null | undefined) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function number(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-IN");
}

export function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function ago(value: string | null | undefined, now = Date.now()) {
  if (!value) return "—";
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function hoursSince(value: string, now = Date.now()) {
  return (now - new Date(value).getTime()) / 36e5;
}

export function ticketRef(n: number) {
  return `BL-${n}`;
}

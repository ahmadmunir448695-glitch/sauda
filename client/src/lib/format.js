const rs = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
export const money = (n) => "Rs " + rs.format(n || 0);

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
const fullFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });

// "2:15 pm" today, "Yesterday", or "12 Sep".
export function when(iso) {
  const d = new Date(iso);
  const day = (x) => dateFmt.format(x);
  if (day(d) === day(new Date())) return timeFmt.format(d);
  if (day(d) === day(new Date(Date.now() - 864e5))) return "Yesterday";
  return day(d);
}
export const fullDate = (iso) => fullFmt.format(new Date(iso));
export const shortDay = (ymd) => dateFmt.format(new Date(ymd + "T12:00:00+05:00"));

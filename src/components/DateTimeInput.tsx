"use client";

// 24-hour date + time field for SERVER-time wall clocks. A native datetime-local input renders in
// the viewer's locale (12-hour AM/PM on en-US), so this pairs a native date picker with an HH:mm
// text box. value / onChange use the picker format "YYYY-MM-DDTHH:mm"; the time can be partial
// while typing — check isWallClock() before using the value.
export default function DateTimeInput({
  value, onChange, label, defaultTime = "00:00", block = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string; // "From" / "To", for screen readers
  defaultTime?: string; // filled in when a date is picked with no time yet
  block?: boolean; // stretch to the container width
}) {
  const [date = "", time = ""] = value.split("T");
  const emit = (d: string, t: string) => onChange(d || t ? `${d}T${t}` : "");

  return (
    <span className={`${block ? "flex w-full" : "inline-flex"} items-center gap-1.5`}>
      <input
        type="date" value={date} aria-label={`${label} date`}
        onChange={(e) => emit(e.target.value, time || (e.target.value ? defaultTime : ""))}
        className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elev-2 px-2 py-1.5 text-sm outline-none focus:border-accent-2"
      />
      <input
        value={time} aria-label={`${label} time, 24-hour`} placeholder="HH:mm" maxLength={5} inputMode="numeric"
        onChange={(e) => emit(date, e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
        onBlur={() => emit(date, normalizeTime(time))}
        className={`w-[4.5rem] flex-none rounded-lg border bg-bg-elev-2 px-2 py-1.5 text-center font-mono text-sm outline-none focus:border-accent-2 ${
          time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? "border-bad" : "border-border"
        }`}
      />
    </span>
  );
}

// Tidy a typed time into HH:mm: "9" → "09:00", "930" / "0930" → "09:30", "9:5" → "09:05".
// Left as typed when it isn't a real 24-hour time (the field then shows red).
function normalizeTime(t: string): string {
  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  const digits = /^\d{1,4}$/.test(t);
  if (!colon && !digits) return t;
  const [h, m] = colon ? [colon[1], colon[2]] : t.length <= 2 ? [t, "0"] : [t.slice(0, -2), t.slice(-2)];
  const hh = Number(h), mm = Number(m);
  return hh <= 23 && mm <= 59 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : t;
}

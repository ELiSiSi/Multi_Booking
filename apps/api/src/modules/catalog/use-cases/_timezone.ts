export function isValidIanaTimezone(tz: string): boolean {
  if (tz.length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
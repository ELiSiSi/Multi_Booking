export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const ISO_TO_JS: Record<Weekday, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 0,
};

const JS_TO_ISO: Record<number, Weekday> = {
  0: 7,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

export function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function fromJsDay(jsDay: number): Weekday {
  const iso = JS_TO_ISO[jsDay];
  if (iso === undefined) {
    throw new Error(`Invalid JS day: ${jsDay}`);
  }
  return iso;
}

export function toJsDay(weekday: Weekday): number {
  return ISO_TO_JS[weekday];
}

export function weekdayName(weekday: Weekday): string {
  switch (weekday) {
    case 1: return 'Monday';
    case 2: return 'Tuesday';
    case 3: return 'Wednesday';
    case 4: return 'Thursday';
    case 5: return 'Friday';
    case 6: return 'Saturday';
    case 7: return 'Sunday';
  }
}
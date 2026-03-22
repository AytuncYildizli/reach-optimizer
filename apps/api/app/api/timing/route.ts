import { NextRequest, NextResponse } from 'next/server';
import type { TimingRequest, TimingResponse, TimingWindow, ErrorResponse } from '@reach/shared-types';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Static research-based optimal posting windows (UTC hours)
// Source: Cross-platform algorithm research — Tue 09:00, Wed-Fri 09:00-14:00 UTC
// ---------------------------------------------------------------------------

interface UtcWindow {
  dayOfWeek: number; // 0=Sun..6=Sat
  hourUtc: number;
  quality: 'peak' | 'good' | 'okay';
}

const UTC_WINDOWS: UtcWindow[] = [
  // Tuesday — single peak at 09:00 UTC
  { dayOfWeek: 2, hourUtc: 9, quality: 'peak' },
  { dayOfWeek: 2, hourUtc: 10, quality: 'good' },
  { dayOfWeek: 2, hourUtc: 11, quality: 'good' },

  // Wednesday — 09:00-14:00 UTC band
  { dayOfWeek: 3, hourUtc: 9, quality: 'peak' },
  { dayOfWeek: 3, hourUtc: 10, quality: 'peak' },
  { dayOfWeek: 3, hourUtc: 11, quality: 'good' },
  { dayOfWeek: 3, hourUtc: 12, quality: 'good' },
  { dayOfWeek: 3, hourUtc: 13, quality: 'okay' },

  // Thursday — 09:00-14:00 UTC band
  { dayOfWeek: 4, hourUtc: 9, quality: 'peak' },
  { dayOfWeek: 4, hourUtc: 10, quality: 'peak' },
  { dayOfWeek: 4, hourUtc: 11, quality: 'good' },
  { dayOfWeek: 4, hourUtc: 12, quality: 'good' },
  { dayOfWeek: 4, hourUtc: 13, quality: 'okay' },

  // Friday — 09:00-14:00 UTC band
  { dayOfWeek: 5, hourUtc: 9, quality: 'peak' },
  { dayOfWeek: 5, hourUtc: 10, quality: 'good' },
  { dayOfWeek: 5, hourUtc: 11, quality: 'good' },
  { dayOfWeek: 5, hourUtc: 12, quality: 'okay' },
  { dayOfWeek: 5, hourUtc: 13, quality: 'okay' },

  // Monday — lighter activity window
  { dayOfWeek: 1, hourUtc: 9, quality: 'okay' },
  { dayOfWeek: 1, hourUtc: 10, quality: 'okay' },
  { dayOfWeek: 1, hourUtc: 13, quality: 'okay' },
];

// Heatmap intensity by quality tier
const QUALITY_INTENSITY: Record<string, number> = {
  peak: 100,
  good: 70,
  okay: 40,
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Timezone offset helpers
// ---------------------------------------------------------------------------

function getUtcOffsetMinutes(timezone: string): number {
  try {
    // Use Intl to determine offset for the given timezone right now
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (!tzPart) return 0;

    // Format is like "GMT+3", "GMT-5:30", "GMT+5:45", "GMT"
    const match = tzPart.value.match(/GMT([+-]?)(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2] || '0', 10);
    const mins = parseInt(match[3] || '0', 10);
    return sign * (hours * 60 + mins);
  } catch {
    return 0;
  }
}

function utcHourToLocal(utcHour: number, offsetMinutes: number): number {
  const totalMinutes = utcHour * 60 + offsetMinutes;
  // Normalize to 0-1439 range
  return Math.floor(((totalMinutes % 1440) + 1440) % 1440 / 60);
}

function utcDayToLocal(dayOfWeek: number, utcHour: number, offsetMinutes: number): number {
  const totalMinutes = utcHour * 60 + offsetMinutes;
  const dayShift = Math.floor(totalMinutes / 1440);
  return ((dayOfWeek + dayShift) % 7 + 7) % 7;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

// ---------------------------------------------------------------------------
// Build response
// ---------------------------------------------------------------------------

function buildTimingData(timezone: string) {
  const offsetMinutes = getUtcOffsetMinutes(timezone);

  // Convert UTC windows to local timezone
  const localWindows: TimingWindow[] = UTC_WINDOWS.map((w) => {
    const localHour = utcHourToLocal(w.hourUtc, offsetMinutes);
    const localDay = utcDayToLocal(w.dayOfWeek, w.hourUtc, offsetMinutes);
    return {
      dayOfWeek: localDay,
      dayLabel: DAY_LABELS[localDay],
      hourLocal: localHour,
      timeLabel: formatHour(localHour),
      quality: w.quality,
    };
  });

  // Build 7x24 heatmap
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  for (const w of localWindows) {
    const intensity = QUALITY_INTENSITY[w.quality] ?? 0;
    heatmap[w.dayOfWeek][w.hourLocal] = Math.max(
      heatmap[w.dayOfWeek][w.hourLocal],
      intensity,
    );
  }

  // Determine current status
  const now = new Date();
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const localParts = localFormatter.formatToParts(now);
  const currentDayStr = localParts.find((p) => p.type === 'weekday')?.value ?? '';
  const currentHour = parseInt(
    localParts.find((p) => p.type === 'hour')?.value ?? '0',
    10,
  );
  const currentDay = DAY_LABELS.indexOf(currentDayStr);

  // Check if now is a good time
  const currentIntensity =
    currentDay >= 0 ? heatmap[currentDay]?.[currentHour] ?? 0 : 0;

  let currentStatus: 'good_now' | 'better_later' | 'off_peak';
  let message: string;
  let nextWindowLocal: string | null = null;

  if (currentIntensity >= 70) {
    currentStatus = 'good_now';
    message = 'Good time to post now!';
  } else {
    // Find next good window
    const nextWindow = findNextWindow(localWindows, currentDay, currentHour);
    if (nextWindow) {
      const hoursUntil = calculateHoursUntil(
        currentDay,
        currentHour,
        nextWindow.dayOfWeek,
        nextWindow.hourLocal,
      );
      currentStatus = 'better_later';
      if (hoursUntil <= 1) {
        message = `Best time to post: in <1h (${nextWindow.dayLabel} ${nextWindow.timeLabel})`;
      } else if (hoursUntil <= 24) {
        message = `Best time to post: in ${hoursUntil}h (${nextWindow.dayLabel} ${nextWindow.timeLabel})`;
      } else {
        const days = Math.floor(hoursUntil / 24);
        message = `Best time to post: ${nextWindow.dayLabel} ${nextWindow.timeLabel} (${days}d)`;
      }

      // Build ISO-ish local time string for the next window
      const nextDate = getNextDateForDay(nextWindow.dayOfWeek, timezone);
      nextDate.setHours(nextWindow.hourLocal, 0, 0, 0);
      nextWindowLocal = nextDate.toISOString();
    } else {
      currentStatus = 'off_peak';
      message = 'No optimal windows found for your timezone';
    }
  }

  return {
    currentStatus,
    message,
    nextWindowLocal,
    weeklyWindows: localWindows,
    heatmap,
    timezone,
  };
}

function findNextWindow(
  windows: TimingWindow[],
  currentDay: number,
  currentHour: number,
): TimingWindow | null {
  // Sort by quality (peak first), then find the nearest upcoming one
  const peakAndGood = windows.filter((w) => w.quality === 'peak' || w.quality === 'good');
  if (peakAndGood.length === 0) return windows[0] ?? null;

  let bestWindow: TimingWindow | null = null;
  let bestDistance = Infinity;

  for (const w of peakAndGood) {
    const distance = calculateHoursUntil(currentDay, currentHour, w.dayOfWeek, w.hourLocal);
    if (distance > 0 && distance < bestDistance) {
      bestDistance = distance;
      bestWindow = w;
    }
  }

  // If nothing upcoming this week, wrap around to the earliest next week
  if (!bestWindow && peakAndGood.length > 0) {
    bestWindow = peakAndGood.reduce((best, w) => {
      const d = calculateHoursUntil(currentDay, currentHour, w.dayOfWeek, w.hourLocal);
      const bd = calculateHoursUntil(currentDay, currentHour, best.dayOfWeek, best.hourLocal);
      return d < bd ? w : best;
    });
  }

  return bestWindow;
}

function calculateHoursUntil(
  fromDay: number,
  fromHour: number,
  toDay: number,
  toHour: number,
): number {
  let dayDiff = toDay - fromDay;
  if (dayDiff < 0) dayDiff += 7;
  let hours = dayDiff * 24 + (toHour - fromHour);
  if (hours <= 0) hours += 7 * 24;
  return hours;
}

function getNextDateForDay(dayOfWeek: number, _timezone: string): Date {
  const now = new Date();
  const currentDay = now.getDay();
  let diff = dayOfWeek - currentDay;
  if (diff < 0) diff += 7;
  const target = new Date(now);
  target.setDate(target.getDate() + diff);
  return target;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timezone = searchParams.get('timezone') ?? 'UTC';

  // Validate timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid timezone: ${timezone}`,
        code: 'VALIDATION_ERROR',
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const data = buildTimingData(timezone);

  return NextResponse.json({ success: true, data } satisfies TimingResponse);
}

export async function POST(request: NextRequest) {
  let body: TimingRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid JSON body',
        code: 'VALIDATION_ERROR',
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const timezone = body.timezone ?? 'UTC';

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid timezone: ${timezone}`,
        code: 'VALIDATION_ERROR',
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const data = buildTimingData(timezone);

  return NextResponse.json({ success: true, data } satisfies TimingResponse);
}

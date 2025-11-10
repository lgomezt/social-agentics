import {
  CALENDAR_START_HOUR,
  SLOTS_PER_HOUR,
} from '../components/calendar/calendar.config';
import type { CalendarEvent } from '../components/calendar/calendar.types';

const API_BASE = '/api/availability';

type SlotEventPayload = {
  id: string;
  date: string;
  start_time_index: number;
  end_time_index: number;
  slots_per_hour: number;
};

type BusyPayload = {
  timezone: string;
  events: SlotEventPayload[];
};

type BusyInterval = {
  event_id: string;
  start: string;
  end: string;
  source: 'user' | 'backend';
};

export type BusyResponse = {
  timezone: string;
  intervals: BusyInterval[];
};

const minutesPerSlot = 60 / SLOTS_PER_HOUR;

const defaultTimezone =
  typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';

const toSlotEventPayload = (event: CalendarEvent): SlotEventPayload => ({
  id: event.id,
  date: event.date,
  start_time_index: event.startTimeIndex,
  end_time_index: event.endTimeIndex,
  slots_per_hour: SLOTS_PER_HOUR,
});

export const isoDateFromInterval = (isoString: string): string => isoString.slice(0, 10);

export const toSlotIndex = (date: Date): number => {
  const startOfDay = new Date(date);
  startOfDay.setHours(CALENDAR_START_HOUR, 0, 0, 0);
  const diffMinutes = (date.getTime() - startOfDay.getTime()) / 60000;
  return Math.round(diffMinutes / minutesPerSlot);
};

const intervalToCalendarEvent = (
  interval: BusyInterval,
  fallbackTitle: string,
): CalendarEvent => {
  const startDate = new Date(interval.start);
  const endDate = new Date(interval.end);
  return {
    id: interval.event_id,
    date: isoDateFromInterval(interval.start),
    startTimeIndex: toSlotIndex(startDate),
    endTimeIndex: toSlotIndex(endDate),
    title: fallbackTitle,
    source: interval.source ?? 'backend',
    start: interval.start,
    end: interval.end,
    externalId: interval.event_id,
  };
};

const assertResponse = async (response: Response) => {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.detail ?? response.statusText;
    throw new Error(
      `Calendar availability request failed: ${response.status} ${message}`,
    );
  }
};

export const syncBusyEvents = async (
  events: CalendarEvent[],
  options: { timezone?: string; title?: string } = {},
): Promise<BusyResponse> => {
  const timezone = options.timezone ?? defaultTimezone;
  const payload: BusyPayload = {
    timezone,
    events: events
      .filter(event => event.source === 'user')
      .map(toSlotEventPayload),
  };

  const response = await fetch(`${API_BASE}/busy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  await assertResponse(response);
  const data: BusyResponse = await response.json();
  return data;
};

export const fetchBusyEvents = async (
  options: { title?: string } = {},
): Promise<CalendarEvent[]> => {
  const response = await fetch(`${API_BASE}/busy`);
  await assertResponse(response);
  const data: BusyResponse = await response.json();

  const title = options.title ?? 'Synced busy time';
  return busyResponseToEvents(data, title);
};

export const busyResponseToEvents = (
  response: BusyResponse,
  title = 'Synced busy time',
): CalendarEvent[] => {
  return response.intervals.map(interval =>
    intervalToCalendarEvent(interval, title),
  );
};

export const isoRangeToCalendarEvent = (params: {
  id: string;
  start: string;
  end: string;
  title: string;
  source?: CalendarEvent['source'];
  externalId?: string;
  metadata?: CalendarEvent['metadata'];
}): CalendarEvent => {
  const startDate = new Date(params.start);
  const endDate = new Date(params.end);

  return {
    id: params.id,
    date: isoDateFromInterval(params.start),
    startTimeIndex: toSlotIndex(startDate),
    endTimeIndex: toSlotIndex(endDate),
    title: params.title,
    source: params.source ?? 'backend',
    start: params.start,
    end: params.end,
    externalId: params.externalId ?? params.id,
    metadata: params.metadata,
  };
};


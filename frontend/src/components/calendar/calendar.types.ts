import type { Dispatch, SetStateAction } from 'react';

export type CalendarEventSource = 'user' | 'backend';

export type CalendarEvent = {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  startTimeIndex: number;
  endTimeIndex: number;
  title: string;
  source: CalendarEventSource;
  start?: string; // optional ISO start datetime for backend events
  end?: string; // optional ISO end datetime for backend events
  externalId?: string;
  metadata?: {
    label?: string;
    reason?: string;
    status?: 'suggested' | 'accepted';
    [key: string]: unknown;
  };
};

export type CalendarProps = {
  calendarEvents: CalendarEvent[];
  setCalendarEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
};


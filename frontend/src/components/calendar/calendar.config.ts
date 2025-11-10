export const CALENDAR_START_HOUR = 0; // Midnight
export const CALENDAR_END_HOUR = 24; // End of day
export const SLOTS_PER_HOUR = 2; // 30-minute increments
export const SLOT_HEIGHT = 44; // px per slot to give events more breathing room
export const DEFAULT_EVENT_DURATION_IN_SLOTS = SLOTS_PER_HOUR * 1; // 1 hour
export const HOURS_COLUMN_WIDTH = 96; // px width for the time gutter

export const TOTAL_SLOTS =
  (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * SLOTS_PER_HOUR;

const minutesPerSlot = 60 / SLOTS_PER_HOUR;

export const formatTimeFromIndex = (index: number): string => {
  const totalMinutes = CALENDAR_START_HOUR * 60 + index * minutesPerSlot;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${hour.toString().padStart(2, '0')}:${minute
    .toString()
    .padStart(2, '0')}`;
};

export const timeLabels = Array.from(
  { length: TOTAL_SLOTS },
  (_, index) => formatTimeFromIndex(index),
);

export const getEndTimeLabel = (index: number): string =>
  index >= TOTAL_SLOTS ? formatTimeFromIndex(index) : timeLabels[index];


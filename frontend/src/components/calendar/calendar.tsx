import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import styles from './calendar.module.css';
import type { CalendarEvent, CalendarProps } from './calendar.types';
import {
  DEFAULT_EVENT_DURATION_IN_SLOTS,
  HOURS_COLUMN_WIDTH,
  SLOT_HEIGHT,
  SLOTS_PER_HOUR,
  TOTAL_SLOTS,
  formatTimeFromIndex,
  getEndTimeLabel,
  timeLabels,
} from './calendar.config';
import {
  busyResponseToEvents,
  clearBusyEvents,
  fetchBusyEvents,
  syncBusyEvents,
} from '../../api/calendar';

/**
 * Defines the state for a drag-and-drop operation.
 */
type DragState = {
  isDragging: boolean;
  isResizing: boolean;
  eventId: string | null;
  resizeDirection: 'top' | 'bottom' | null;
};

const isoFromDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const generateEventId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const mergeBackendEvents = (
  existing: CalendarEvent[],
  backendEvents: CalendarEvent[],
): CalendarEvent[] => {
  if (backendEvents.length === 0) return existing;

  const backendIds = new Set(backendEvents.map(event => event.id));

  const filtered = existing.filter(event => {
    if (event.source === 'backend') {
      return !backendIds.has(event.id);
    }
    return true;
  });

  return [...filtered, ...backendEvents];
};

const serializeUserEvents = (events: CalendarEvent[]): string =>
  JSON.stringify(
    events
      .filter(event => event.source === 'user')
      .map(event => ({
        id: event.id,
        date: event.date,
        startTimeIndex: event.startTimeIndex,
        endTimeIndex: event.endTimeIndex,
      })),
  );

const getStartOfWeek = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday (0) to previous Monday
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + diff);
  return result;
};

const addDays = (date: Date, amount: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const longMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
});
const shortMonthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
});
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
});
const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const getWeekRangeLabel = (weekDays: Date[]): string => {
  if (weekDays.length === 0) return '';

  const firstDay = weekDays[0];
  const lastDay = weekDays[weekDays.length - 1];
  const sameMonth = firstDay.getMonth() === lastDay.getMonth();
  const sameYear = firstDay.getFullYear() === lastDay.getFullYear();

  if (sameMonth && sameYear) {
    return `${longMonthFormatter.format(firstDay)} ${firstDay.getDate()} – ${lastDay.getDate()}, ${firstDay.getFullYear()}`;
  }

  if (sameYear) {
    return `${longMonthFormatter.format(firstDay)} ${firstDay.getDate()} – ${longMonthFormatter.format(lastDay)} ${lastDay.getDate()}, ${firstDay.getFullYear()}`;
  }

  return `${longMonthFormatter.format(firstDay)} ${firstDay.getDate()}, ${firstDay.getFullYear()} – ${longMonthFormatter.format(lastDay)} ${lastDay.getDate()}, ${lastDay.getFullYear()}`;
};

// --- Constants ---
const Calendar: React.FC<CalendarProps> = ({
  calendarEvents,
  setCalendarEvents,
}) => {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    isResizing: false,
    eventId: null,
    resizeDirection: null,
  });
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getStartOfWeek(new Date()),
  );

  const calendarGridRef = useRef<HTMLDivElement>(null);
  const lastSyncedKeyRef = useRef<string>('');
  const inFlightKeyRef = useRef<string | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(currentWeekStart, index)),
    [currentWeekStart],
  );

  const isoWeekDates = useMemo(
    () => weekDays.map(isoFromDate),
    [weekDays],
  );

  const eventsByDate = useMemo(() => {
    return calendarEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }
      acc[event.date].push(event);
      return acc;
    }, {});
  }, [calendarEvents]);

  const weekSummaryLabel = useMemo(() => getWeekRangeLabel(weekDays), [weekDays]);
  const todayIso = isoFromDate(new Date());
  const todayLabel = fullDateFormatter.format(new Date());

  const scrollToMidday = useCallback(() => {
    const grid = calendarGridRef.current;
    if (!grid) return;

    const middaySlotIndex = 12 * SLOTS_PER_HOUR;
    const target =
      middaySlotIndex * SLOT_HEIGHT - grid.clientHeight / 2 + SLOT_HEIGHT / 2;

    grid.scrollTo({
      top: Math.max(0, target),
      behavior: 'smooth',
    });
  }, []);

  const goToPreviousWeek = () => {
    setCurrentWeekStart(prev => addDays(prev, -7));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(prev => addDays(prev, 7));
  };

  const goToToday = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
    scrollToMidday();
  };

  useEffect(() => {
    let isMounted = true;

    const initializeBusyEvents = async () => {
      try {
        await clearBusyEvents();
      } catch {
        // Ignore failures while clearing; backend may not have stored state yet
      }

      try {
        const backendEvents = await fetchBusyEvents({ title: 'Busy' });
        if (!isMounted || backendEvents.length === 0) return;
        setCalendarEvents(prev =>
          mergeBackendEvents(prev, backendEvents.map(event => ({ ...event, source: 'backend' }))),
        );
      } catch {
        // No stored busy events is expected after clearing.
      }
    };

    void initializeBusyEvents();

    return () => {
      isMounted = false;
    };
  }, [setCalendarEvents]);

  useEffect(() => {
    const userEvents = calendarEvents.filter(event => event.source === 'user');
    const serialized = serializeUserEvents(userEvents);

    if (
      serialized === lastSyncedKeyRef.current ||
      serialized === inFlightKeyRef.current
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (serialized === inFlightKeyRef.current) return;
      inFlightKeyRef.current = serialized;

      syncBusyEvents(userEvents)
        .then(response => {
          lastSyncedKeyRef.current = serialized;
          inFlightKeyRef.current = null;
          const backendEvents = busyResponseToEvents(
            response,
            'Busy',
          ).map(event => ({ ...event, source: 'backend' as const }));
          setCalendarEvents(prev => mergeBackendEvents(prev, backendEvents));
        })
        .catch(() => {
          inFlightKeyRef.current = null;
        });
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [calendarEvents, setCalendarEvents]);

  /**
   * --- Event Creation ---
   * Creates a new 1-hour event when a time slot is clicked.
   */
  const handleSlotClick = (dayIndex: number, timeIndex: number) => {
    if (dragState.isDragging || dragState.isResizing) return;

    const dateForDay = isoWeekDates[dayIndex];
    if (!dateForDay) return;

    const dayEvents = eventsByDate[dateForDay] ?? [];
    const isOccupied = dayEvents.some(
      event =>
        timeIndex >= event.startTimeIndex && timeIndex < event.endTimeIndex,
    );

    if (isOccupied) return;

    const newEvent: CalendarEvent = {
      id: generateEventId(),
      date: dateForDay,
      startTimeIndex: timeIndex,
      endTimeIndex: Math.min(
        timeIndex + DEFAULT_EVENT_DURATION_IN_SLOTS,
        TOTAL_SLOTS,
      ),
      title: 'Busy',
      source: 'user',
    };

    setCalendarEvents(prev => [...prev, newEvent]);
  };

  /**
   * --- Drag & Resize Helper Functions ---
   */
  
  // Gets time slot index from a Y-coordinate relative to the grid
  const getTimeIndexFromY = (y: number): number => {
    const calendarGrid = calendarGridRef.current;
    if (!calendarGrid) return 0;

    const rect = calendarGrid.getBoundingClientRect();
    const relativeY = y - rect.top + calendarGrid.scrollTop;
    const slotIndex = Math.floor(relativeY / SLOT_HEIGHT);
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, slotIndex));
  };

  // Gets day index from an X-coordinate relative to the grid
  const getDayIndexFromX = (x: number): number => {
    const calendarGrid = calendarGridRef.current;
    if (!calendarGrid) return 0;

    const rect = calendarGrid.getBoundingClientRect();
    const hoursColumnWidth = HOURS_COLUMN_WIDTH;
    const relativeX = x - rect.left - hoursColumnWidth;
    const dayWidth = (rect.width - hoursColumnWidth) / 7;
    const dayIndex = Math.floor(relativeX / dayWidth);
    return Math.max(0, Math.min(isoWeekDates.length - 1, dayIndex));
  };

  /**
   * --- Event Handlers for Drag & Resize ---
   */

  const handleEventMouseDown = (
    e: React.MouseEvent,
    event: CalendarEvent,
    action: 'move' | 'resize-top' | 'resize-bottom' = 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (action === 'resize-top' || action === 'resize-bottom') {
      setDragState({
        isResizing: true,
        isDragging: false,
        eventId: event.id,
        resizeDirection: action === 'resize-top' ? 'top' : 'bottom',
      });
    } else {
      setDragState({
        isResizing: false,
        isDragging: true,
        eventId: event.id,
        resizeDirection: null,
      });
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState.isDragging && !dragState.isResizing) return;

      // Calculate new positions *before* the state update
      const newTimeIndex = getTimeIndexFromY(e.clientY);
      // Only calculate newDay if we are actually dragging
      const newDayIndex = dragState.isDragging ? getDayIndexFromX(e.clientX) : 0;

      const { eventId, isDragging, isResizing, resizeDirection } = dragState;

      setCalendarEvents(prev =>
        prev.map(event => {
          if (event.id !== eventId) return event;

          if (isResizing) {
            // Handle Resizing
            if (resizeDirection === 'top') {
              const newStartTime = Math.max(
                0,
                Math.min(newTimeIndex, event.endTimeIndex - 1),
              );
              return { ...event, startTimeIndex: newStartTime };
            }

            // 'bottom'
            const newEndTime = Math.max(
              event.startTimeIndex + 1,
              Math.min(TOTAL_SLOTS, newTimeIndex + 1),
            );
            return { ...event, endTimeIndex: newEndTime };
          }

          if (isDragging) {
            // Handle Dragging (Moving)
            const duration = event.endTimeIndex - event.startTimeIndex;
            // Cap the start time so the event doesn't go off the bottom
            const cappedStartTime = Math.min(newTimeIndex, TOTAL_SLOTS - duration);
            const normalizedStartTime = Math.max(0, cappedStartTime);
            const newEndTimeIndex = normalizedStartTime + duration;

            const boundedDayIndex = Math.max(
              0,
              Math.min(isoWeekDates.length - 1, newDayIndex),
            );
            const targetDate = isoWeekDates[boundedDayIndex] ?? event.date;

            return {
              ...event,
              date: targetDate,
              startTimeIndex: normalizedStartTime,
              endTimeIndex: newEndTimeIndex,
            };
          }
          return event;
        }),
      );
    },
    [dragState, isoWeekDates, setCalendarEvents],
  );

  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      isResizing: false,
      eventId: null,
      resizeDirection: null,
    });
  }, []);

  /**
   * --- Event Deletion ---
   */
  const removeEvent = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    setCalendarEvents(prev => prev.filter(event => event.id !== eventId));
  };

  /**
   * --- Global Event Listeners for Dragging ---
   */
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  /** --- Auto-scroll near midday for initial view --- */
  useEffect(() => {
    scrollToMidday();
  }, [scrollToMidday]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Primary header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {weekSummaryLabel}
            </h2>
            <p className="text-sm font-medium text-slate-500">
              Today · {todayLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goToToday}
              className="rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-600 transition-colors duration-150 hover:bg-indigo-100 hover:text-indigo-700"
            >
              Today
            </button>
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={goToPreviousWeek}
                className="flex h-10 w-10 items-center justify-center text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Previous week"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <div className="h-10 w-px bg-slate-200" />
              <button
                type="button"
                onClick={goToNextWeek}
                className="flex h-10 w-10 items-center justify-center text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Next week"
              >
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] items-end border-b border-slate-200 bg-slate-50 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <div className="flex items-end justify-end pr-5 text-[0.66rem] font-medium uppercase tracking-[0.18em] text-slate-500">
            Time
          </div>
          {weekDays.map((date, index) => {
            const isoDate = isoWeekDates[index];
            const weekend = isWeekend(date);
            const isTodayColumn = isoDate === todayIso;

            return (
              <div
                key={isoDate}
                className="flex flex-col items-center gap-1 px-2 text-center"
              >
                <span
                  className={`text-[0.62rem] font-medium tracking-[0.28em] ${
                    weekend ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {shortMonthFormatter.format(date).toUpperCase()}
                </span>
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-xl font-semibold ${
                      isTodayColumn ? 'text-indigo-600' : 'text-slate-700'
                    }`}
                  >
                    {dayFormatter.format(date)}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {weekdayFormatter.format(date)}
                  </span>
                </div>
                {isTodayColumn ? (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                    Today
                  </span>
                ) : (
                  <span className="py-0.5 text-[0.6rem] font-semibold text-transparent">
                    {/* &nbsp; is a non-breaking space. 
                      It ensures the span has content so the line-height is applied.
                      'text-transparent' makes it invisible.
                    */}
                    &nbsp;
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Calendar body */}
        <div
          className={`${styles.calendarGrid} flex min-h-0 flex-1 bg-slate-50`}
          ref={calendarGridRef}
        >
          {/* Time gutter */}
          <div className="flex w-[96px] shrink-0 flex-col border-r border-slate-200 bg-white">
            {timeLabels.map((hour, index) => {
              const shouldShowHour = (index + 1) % SLOTS_PER_HOUR === 0;
              const label = shouldShowHour ? getEndTimeLabel(index + 1) : null;

              return (
                <div
                  key={`${hour}-${index}`}
                  className="flex shrink-0 items-center justify-end border-b border-slate-100 px-4 text-[0.7rem] font-medium text-slate-500 last:border-b-0"
                  style={{ height: `${SLOT_HEIGHT}px` }}
                >
                  {label ? (
                    label
                  ) : (
                    <span className="pointer-events-none select-none text-transparent">
                      •
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          <div className="grid flex-1 grid-cols-7">
            {weekDays.map((date, dayIndex) => {
              const isoDate = isoWeekDates[dayIndex];
              const dayEvents = eventsByDate[isoDate] ?? [];
              const isTodayColumn = isoDate === todayIso;
              const weekend = isWeekend(date);

              const columnClasses = [
                'relative border-l border-slate-200 bg-white transition-colors duration-150',
                dayIndex === 0 ? 'border-l-0' : '',
                weekend ? 'bg-slate-50' : '',
                isTodayColumn ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-200/70' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={isoDate} className={columnClasses}>
                  {timeLabels.map((_, timeIndex) => (
                    <div
                      key={timeIndex}
                      className="border-b border-slate-100 transition-colors duration-150 hover:bg-indigo-50/50 last:border-b-0"
                      style={{ height: `${SLOT_HEIGHT}px` }}
                      onClick={() => handleSlotClick(dayIndex, timeIndex)}
                    />
                  ))}

                  {dayEvents.map(event => {
                    const top = event.startTimeIndex * SLOT_HEIGHT;
                    const height =
                      (event.endTimeIndex - event.startTimeIndex) * SLOT_HEIGHT;
                    const isDragging = dragState.eventId === event.id;
                    const isBackendEvent = event.source === 'backend';

                    const label =
                      typeof event.metadata?.label === 'string'
                        ? event.metadata.label
                        : event.title;
                    const reason =
                      typeof event.metadata?.reason === 'string'
                        ? event.metadata.reason
                        : '';

                    const status =
                      event.metadata?.status && typeof event.metadata.status === 'string'
                        ? event.metadata.status
                        : isBackendEvent
                          ? 'backend'
                          : 'user';

                    const variantClasses: Record<string, string> = {
                      user:
                        'border-slate-200 bg-white text-slate-800 shadow-lg shadow-indigo-200/60',
                      backend: 'border-indigo-200 bg-indigo-50/90 text-slate-700 shadow-sm',
                      suggested:
                        'border-amber-300 bg-amber-50 text-amber-900 shadow-sm shadow-amber-200/70',
                      accepted:
                        'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm shadow-emerald-200/70',
                    };

                    const eventClasses = [
                      'absolute inset-x-0.5 z-10 flex flex-col gap-2 rounded-lg border p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl',
                      variantClasses[status] ?? variantClasses.backend,
                      isDragging ? 'ring-2 ring-indigo-300 shadow-xl' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    const statusEmoji =
                      status === 'accepted'
                        ? '✅'
                        : status === 'suggested'
                          ? '✨'
                          : isBackendEvent
                            ? '☁️'
                            : '✏️';

                    const titleClasses =
                      status === 'suggested'
                        ? 'text-sm font-semibold leading-tight text-amber-900'
                        : status === 'accepted'
                          ? 'text-sm font-semibold leading-tight text-emerald-900'
                          : isBackendEvent
                            ? 'text-sm font-semibold leading-tight text-indigo-900'
                            : 'text-sm font-semibold leading-tight text-slate-900';
                    const timeClasses =
                      status === 'suggested'
                        ? 'flex items-center gap-1.5 text-[0.72rem] font-medium text-amber-700'
                        : status === 'accepted'
                          ? 'flex items-center gap-1.5 text-[0.72rem] font-medium text-emerald-700'
                          : isBackendEvent
                            ? 'flex items-center gap-1.5 text-[0.72rem] font-medium text-indigo-600'
                            : 'flex items-center gap-1.5 text-[0.72rem] font-medium text-slate-500';
                    const clockColor =
                      status === 'suggested'
                        ? 'text-amber-500'
                        : status === 'accepted'
                          ? 'text-emerald-500'
                          : isBackendEvent
                            ? 'text-indigo-400'
                            : 'text-indigo-500';

                    const topHandleClasses = [
                      styles.resizeHandle,
                      styles.resizeHandleTop,
                      isBackendEvent ? styles.resizeHandleBackend : styles.resizeHandleUser,
                    ]
                      .filter(Boolean)
                      .join(' ');

                    const bottomHandleClasses = [
                      styles.resizeHandle,
                      styles.resizeHandleBottom,
                      isBackendEvent ? styles.resizeHandleBackend : styles.resizeHandleUser,
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <div
                        key={event.id}
                        className={eventClasses}
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <div
                          className={topHandleClasses}
                          onMouseDown={e => handleEventMouseDown(e, event, 'resize-top')}
                        />

                        {/* Event Content */}
                        <div className="flex h-full flex-col gap-2">
                          <div
                            className="flex select-none items-center justify-between gap-2 cursor-grab"
                            onMouseDown={e => handleEventMouseDown(e, event, 'move')}
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold leading-tight text-slate-900">
                              <span aria-hidden className="select-none">
                                {statusEmoji}
                              </span>
                              <span className={titleClasses}>{label}</span>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-500 transition-colors duration-150 hover:bg-indigo-100 hover:text-indigo-600"
                              onClick={e => removeEvent(e, event.id)}
                              title="Delete event"
                              aria-label="Delete event"
                            >
                              <X size={16} strokeWidth={2} />
                            </button>
                          </div>

                          {height > 48 ? (
                            <div className={timeClasses}>
                              <Clock size={12} className={clockColor} />
                              <span>
                                {`${formatTimeFromIndex(event.startTimeIndex)} – ${getEndTimeLabel(event.endTimeIndex)}`}
                              </span>
                            </div>
                          ) : null}
                          {reason && height > 80 ? (
                            <p
                              className={
                                status === 'suggested'
                                  ? 'text-[0.72rem] leading-snug text-amber-800'
                                  : status === 'accepted'
                                    ? 'text-[0.72rem] leading-snug text-emerald-800'
                                    : 'text-[0.72rem] leading-snug text-slate-600'
                              }
                            >
                            </p>
                          ) : null}
                        </div>

                        {/* Bottom resize handle */}
                        <div
                          className={bottomHandleClasses}
                          onMouseDown={e => handleEventMouseDown(e, event, 'resize-bottom')}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;

export type { CalendarEvent, CalendarProps } from './calendar.types';
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone as datetime_timezone, tzinfo
from typing import Iterable, List

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas import BusyInterval, BusyPayload, BusyResponse, SlotEvent

logger = logging.getLogger(__name__)


def get_timezone(tz_name: str) -> tzinfo:
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        logger.warning("Unknown timezone '%s', falling back to UTC", tz_name)
    except Exception:
        logger.exception("Unexpected error while loading timezone '%s'", tz_name)
    try:
        return ZoneInfo("UTC")
    except Exception:
        logger.warning("UTC timezone data unavailable, using datetime.timezone.utc fallback")
        return datetime_timezone.utc


def slot_index_to_datetime(event_date, slot_index: int, slots_per_hour: int, tz: tzinfo) -> datetime:
    minutes_per_slot = 60 // slots_per_hour
    start_of_day = datetime.combine(event_date, datetime.min.time(), tzinfo=tz)
    result = start_of_day + timedelta(minutes=slot_index * minutes_per_slot)
    logger.debug(
        "Converted slot index %s to datetime %s using %s slots/hour",
        slot_index,
        result.isoformat(),
        slots_per_hour,
    )
    return result


def slot_event_to_interval(event: SlotEvent, timezone: str) -> BusyInterval:
    tz = get_timezone(timezone)
    start_dt = slot_index_to_datetime(event.slot_date, event.start_time_index, event.slots_per_hour, tz)
    end_dt = slot_index_to_datetime(event.slot_date, event.end_time_index, event.slots_per_hour, tz)
    logger.debug(
        "Event %s spans %s to %s in timezone %s",
        event.id,
        start_dt.isoformat(),
        end_dt.isoformat(),
        timezone,
    )
    return BusyInterval(
        event_id=event.id,
        start=start_dt.isoformat(),
        end=end_dt.isoformat(),
        source="user",
    )


def normalize_busy_payload(payload: BusyPayload) -> BusyResponse:
    logger.info("Normalizing payload in timezone %s", payload.timezone or "UTC")
    intervals = [slot_event_to_interval(event, payload.timezone or "UTC") for event in payload.events]
    merged_intervals = merge_overlapping_intervals(intervals)
    logger.info(
        "Normalized %d raw intervals into %d merged intervals",
        len(intervals),
        len(merged_intervals),
    )
    return BusyResponse(
        timezone=payload.timezone or "UTC",
        intervals=merged_intervals,
    )


def merge_overlapping_intervals(intervals: Iterable[BusyInterval]) -> List[BusyInterval]:
    sorted_intervals = sorted(
        intervals,
        key=lambda interval: (interval.start, interval.end),
    )

    if not sorted_intervals:
        logger.debug("No intervals provided for merging")
        return []

    merged: List[BusyInterval] = [sorted_intervals[0]]
    for current in sorted_intervals[1:]:
        last = merged[-1]
        if current.start <= last.end and current.source == last.source:
            if current.end > last.end:
                logger.debug(
                    "Merging intervals (%s, %s) and (%s, %s)",
                    last.start,
                    last.end,
                    current.start,
                    current.end,
                )
                merged[-1] = BusyInterval(
                    event_id=last.event_id,
                    start=last.start,
                    end=current.end,
                    source=last.source,
                )
        else:
            merged.append(current)

    return merged


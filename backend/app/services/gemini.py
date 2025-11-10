from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, List, Sequence, Tuple

from google import genai
from google.genai import types

from app.schemas import BusyInterval, BusyResponse
from app.schemas.recommendations import (
    ConversationTurn,
    RecommendationOption,
    RecommendationRequest,
    RecommendationResponse,
)
from app.services.calendar import get_timezone

logger = logging.getLogger(__name__)

SLOT_INCREMENT_MINUTES = 30
MAX_CANDIDATE_SLOTS = 168

SYSTEM_PROMPT = """You are a meticulous scheduling assistant that collaborates with a human to propose meetings.

Rules:
- You must choose exactly two meeting options labelled \"Option A\" and \"Option B\".
- Only select from the provided available_slots list. Never invent new times.
- Each option is 60 minutes long and must stay within a single day.
- Explain briefly why each option works for the provided scenario.
- Return a JSON object with the schema:
  {
    "message": "<plain language summary>",
    "options": [
      {"id": "option_a", "label": "Option A", "start": "<ISO8601>", "end": "<ISO8601>", "reason": "<why this option fits>"},
      {"id": "option_b", "label": "Option B", "start": "<ISO8601>", "end": "<ISO8601>", "reason": "<why this option fits>"}
    ]
  }
- Do not include markdown, explanations, or extra keys outside that object."""


@dataclass(frozen=True)
class CandidateSlot:
    start: datetime
    end: datetime

    @property
    def key(self) -> str:
        return f"{self.start.isoformat()}|{self.end.isoformat()}"


def _parse_busy_intervals(
    busy_intervals: Iterable[BusyInterval], tz_name: str
) -> List[Tuple[datetime, datetime]]:
    tz = get_timezone(tz_name)
    parsed: List[Tuple[datetime, datetime]] = []
    for interval in busy_intervals:
        try:
            start = datetime.fromisoformat(interval.start).astimezone(tz)
            end = datetime.fromisoformat(interval.end).astimezone(tz)
        except ValueError:
            logger.warning("Skipping interval with invalid timestamps: %s", interval)
            continue
        parsed.append((start, end))
    parsed.sort(key=lambda item: item[0])
    return parsed


def _round_up_to_increment(dt: datetime, minutes: int) -> datetime:
    increment_seconds = minutes * 60
    seconds_since_midnight = dt.hour * 3600 + dt.minute * 60 + dt.second
    remainder = seconds_since_midnight % increment_seconds
    adjustment = 0 if (remainder == 0 and dt.microsecond == 0) else increment_seconds - remainder
    rounded = dt + timedelta(seconds=adjustment, microseconds=-dt.microsecond)
    return rounded.replace(second=0, microsecond=0)


def _overlaps(
    start: datetime,
    end: datetime,
    busy_start: datetime,
    busy_end: datetime,
) -> bool:
    return not (end <= busy_start or start >= busy_end)


def _generate_candidate_slots(
    busy_intervals: Iterable[BusyInterval],
    tz_name: str,
    duration_minutes: int,
    days_ahead: int,
) -> List[CandidateSlot]:
    tz = get_timezone(tz_name)
    now = datetime.now(tz)
    window_end = now + timedelta(days=days_ahead)
    busy_spans = _parse_busy_intervals(busy_intervals, tz_name)

    increment = SLOT_INCREMENT_MINUTES
    duration = timedelta(minutes=duration_minutes)
    current = _round_up_to_increment(now, increment)

    candidates: List[CandidateSlot] = []
    while current + duration <= window_end:
        candidate_end = current + duration
        if candidate_end.date() != current.date():
            current += timedelta(minutes=increment)
            continue

        conflict = any(
            _overlaps(current, candidate_end, busy_start, busy_end)
            for busy_start, busy_end in busy_spans
        )
        if not conflict:
            candidates.append(CandidateSlot(current, candidate_end))
            if len(candidates) >= MAX_CANDIDATE_SLOTS:
                break

        current += timedelta(minutes=increment)

    return candidates


def _format_slots_for_prompt(slots: Sequence[CandidateSlot], tz_name: str) -> str:
    if not slots:
        return "No available slots within the requested window."

    lines = []
    for index, slot in enumerate(slots, start=1):
        start_display = slot.start.strftime("%A, %B %d · %I:%M %p")
        end_display = slot.end.strftime("%I:%M %p")
        lines.append(
            f"{index}. {start_display} - {end_display} ({tz_name}) [{slot.start.isoformat()} → {slot.end.isoformat()}]"
        )
    return "\n".join(lines)


def _conversation_to_bullets(conversation: Sequence[ConversationTurn]) -> str:
    if not conversation:
        return "No previous conversation."

    return "\n".join(
        f"- {turn.role.capitalize()}: {turn.content.strip()}"
        for turn in conversation
        if turn.content.strip()
    )


def _format_previous_options(options: Sequence[RecommendationOption]) -> str:
    if not options:
        return "None provided yet."

    lines: List[str] = []
    for option in options:
        start_label = option.start.strftime("%b %d, %Y · %I:%M %p")
        end_label = option.end.strftime("%I:%M %p")
        reason = f" – {option.reason}" if option.reason else ""
        lines.append(f"- {option.label}: {start_label} – {end_label}{reason}")
    return "\n".join(lines)


def _call_gemini(
    client: genai.Client,
    model_name: str,
    scenario: str,
    timezone: str,
    slots: Sequence[CandidateSlot],
    conversation: Sequence[ConversationTurn],
    previous_options: Sequence[RecommendationOption],
) -> dict:
    available_slots_text = _format_slots_for_prompt(slots, timezone)
    conversation_text = _conversation_to_bullets(conversation)
    previous_options_text = _format_previous_options(previous_options)

    user_prompt = f"""
Scenario:
{scenario.strip()}

Timezone: {timezone}

Available Slots (ISO timestamps provided in brackets):
{available_slots_text}

Previous Recommendations:
{previous_options_text}

Recent Conversation:
{conversation_text}

Select exactly two options from the numbered list above (Option A and Option B). Use the ISO timestamps in brackets when forming the JSON response.
"""

    logger.debug("Sending prompt to Gemini with %d candidate slots", len(slots))

    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_prompt)],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.35,
        thinking_config=types.ThinkingConfig(thinking_budget=1024),
        response_mime_type="application/json",
    )

    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=config,
    )

    if not getattr(response, "text", None):
        raise ValueError("Gemini returned an empty response.")

    try:
        payload = json.loads(response.text)
    except json.JSONDecodeError as exc:
        logger.exception("Failed to decode Gemini response as JSON: %s", response.text)
        raise ValueError("Gemini response was not valid JSON.") from exc

    return payload


def generate_recommendations(
    client: genai.Client,
    request: RecommendationRequest,
    busy_response: BusyResponse,
    *,
    duration_minutes: int,
    days_ahead: int,
    model_name: str,
) -> RecommendationResponse:
    tz_name = request.timezone or busy_response.timezone or "UTC"
    candidates = _generate_candidate_slots(
        busy_response.intervals,
        tz_name=tz_name,
        duration_minutes=duration_minutes,
        days_ahead=days_ahead,
    )

    if len(candidates) < 2:
        raise ValueError("Not enough available slots within the next 7 days to recommend a meeting.")

    response_payload = _call_gemini(
        client=client,
        model_name=model_name,
        scenario=request.scenario,
        timezone=tz_name,
        slots=candidates,
        conversation=request.conversation,
        previous_options=request.previous_options,
    )

    options_payload = response_payload.get("options", [])
    if not isinstance(options_payload, list) or len(options_payload) < 2:
        raise ValueError("Gemini response did not contain two options.")

    candidate_keys = {slot.key: slot for slot in candidates}
    recommendation_options: List[RecommendationOption] = []

    for raw_option in options_payload[:2]:
        try:
            start_str = raw_option["start"]
            end_str = raw_option["end"]
            label = raw_option.get("label") or "Option"
            option_id = raw_option.get("id") or label.lower().replace(" ", "_")
            reason = raw_option.get("reason") or ""
        except (TypeError, KeyError) as exc:
            raise ValueError("Gemini option payload is missing required fields.") from exc

        try:
            start_dt = datetime.fromisoformat(start_str)
            end_dt = datetime.fromisoformat(end_str)
        except ValueError as exc:
            raise ValueError("Gemini option timestamps were not valid ISO datetimes.") from exc

        if start_dt.tzinfo is None or end_dt.tzinfo is None:
            raise ValueError("Gemini option timestamps must include timezone information.")

        key = f"{start_dt.isoformat()}|{end_dt.isoformat()}"
        if key not in candidate_keys:
            logger.warning("Option %s does not match any candidate slot; skipping.", option_id)
            continue

        recommendation_options.append(
            RecommendationOption(
                id=option_id,
                label=label,
                start=start_dt,
                end=end_dt,
                reason=reason,
            )
        )

    if len(recommendation_options) < 2:
        raise ValueError("Gemini did not return two valid options from the provided slots.")

    message = response_payload.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Gemini response is missing a descriptive message.")

    return RecommendationResponse(
        scenario=request.scenario,
        message=message.strip(),
        options=recommendation_options[:2],
        model=model_name,
    )


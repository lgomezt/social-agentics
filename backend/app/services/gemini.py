from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, List, Sequence, Tuple

from google import genai
from google.genai import types

from app.prompts import load_prompt
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

DEFAULT_RECOMMENDATION_MESSAGE = "Here are two meeting options that fit your availability."

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


def _extract_option_from_payload(
    payload: dict,
    *,
    candidate_keys: dict[str, CandidateSlot],
    option_id: str,
    option_label: str,
) -> tuple[str, RecommendationOption]:
    if not isinstance(payload, dict):
        raise ValueError("Gemini response payload must be a JSON object.")

    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("Gemini response is missing a descriptive message.")

    option_payload = payload.get("option")
    if option_payload is None:
        options_payload = payload.get("options")
        if isinstance(options_payload, list) and options_payload:
            option_payload = options_payload[0]

    if not isinstance(option_payload, dict):
        raise ValueError("Gemini response did not include a single option.")

    try:
        start_str = option_payload["start"]
        end_str = option_payload["end"]
        reason = option_payload.get("reason") or ""
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
        raise ValueError(f"Gemini option ({option_label}) did not match any available slot.")

    option = RecommendationOption(
        id=option_id,
        label=option_label,
        start=start_dt,
        end=end_dt,
        reason=reason,
    )

    return message.strip(), option


def _call_gemini(
    client: genai.Client,
    model_name: str,
    scenario: str,
    timezone: str,
    slots: Sequence[CandidateSlot],
    conversation: Sequence[ConversationTurn],
    previous_options: Sequence[RecommendationOption],
    *,
    system_prompt: str,
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

Select exactly one option from the numbered list above. Use the ISO timestamps in brackets when forming the JSON response.
"""

    logger.debug("Sending prompt to Gemini with %d candidate slots", len(slots))

    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_prompt)],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
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
    prompt_option_a: str,
    prompt_option_b: str,
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

    try:
        system_prompt_a = load_prompt(prompt_option_a)
    except (FileNotFoundError, ValueError) as exc:
        raise ValueError(f"System prompt '{prompt_option_a}' could not be loaded.") from exc

    try:
        system_prompt_b = load_prompt(prompt_option_b)
    except (FileNotFoundError, ValueError) as exc:
        raise ValueError(f"System prompt '{prompt_option_b}' could not be loaded.") from exc

    candidate_keys = {slot.key: slot for slot in candidates}

    def _invoke(system_prompt: str, option_id: str, option_label: str) -> tuple[str, RecommendationOption]:
        payload = _call_gemini(
            client=client,
            model_name=model_name,
            scenario=request.scenario,
            timezone=tz_name,
            slots=candidates,
            conversation=request.conversation,
            previous_options=request.previous_options,
            system_prompt=system_prompt,
        )
        return _extract_option_from_payload(
            payload,
            candidate_keys=candidate_keys,
            option_id=option_id,
            option_label=option_label,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_a = executor.submit(_invoke, system_prompt_a, "option_a", "Option A")
        future_b = executor.submit(_invoke, system_prompt_b, "option_b", "Option B")

        message_a, option_a = future_a.result()
        message_b, option_b = future_b.result()

    combined_messages = [text for text in (message_a.strip(), message_b.strip()) if text]
    if not combined_messages:
        raise ValueError("Gemini responses did not include descriptive messages.")

    return RecommendationResponse(
        scenario=request.scenario,
        message=DEFAULT_RECOMMENDATION_MESSAGE,
        options=[option_a, option_b],
        model=model_name,
    )


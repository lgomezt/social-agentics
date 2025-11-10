import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from google import genai

from app.schemas.recommendations import (
    RecommendationRequest,
    RecommendationResponse,
)
from app.services.gemini import generate_recommendations
from app.state.busy import get_busy_response

logger = logging.getLogger(__name__)

router = APIRouter()

API_KEY_ENV_KEYS = ("GEMINI_API_KEY", "GENAI_API_KEY", "GOOGLE_API_KEY")
GEMINI_MODEL_ENV_KEY = "GEMINI_MODEL"
MEETING_DURATION_ENV_KEY = "MEETING_DURATION_MINUTES"
WINDOW_DAYS_ENV_KEY = "RECOMMENDATION_WINDOW_DAYS"

DEFAULT_MODEL_NAME = "gemini-2.5-pro"
DEFAULT_DURATION_MINUTES = 60
DEFAULT_WINDOW_DAYS = 7


def _resolve_env_key(keys: tuple[str, ...]) -> Optional[str]:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


_api_key = _resolve_env_key(API_KEY_ENV_KEYS)
if _api_key:
    _gemini_client: Optional[genai.Client] = genai.Client(api_key=_api_key)
else:
    _gemini_client = None
    logger.warning(
        "Gemini API key not configured. Set one of %s to enable recommendations.",
        ", ".join(API_KEY_ENV_KEYS),
    )

MODEL_NAME = os.getenv(GEMINI_MODEL_ENV_KEY, DEFAULT_MODEL_NAME)

try:
    MEETING_DURATION_MINUTES = int(os.getenv(MEETING_DURATION_ENV_KEY, DEFAULT_DURATION_MINUTES))
except ValueError:
    logger.warning(
        "Invalid %s value. Falling back to %s minutes.",
        MEETING_DURATION_ENV_KEY,
        DEFAULT_DURATION_MINUTES,
    )
    MEETING_DURATION_MINUTES = DEFAULT_DURATION_MINUTES

try:
    WINDOW_DAYS = int(os.getenv(WINDOW_DAYS_ENV_KEY, DEFAULT_WINDOW_DAYS))
except ValueError:
    logger.warning(
        "Invalid %s value. Falling back to %s days.",
        WINDOW_DAYS_ENV_KEY,
        DEFAULT_WINDOW_DAYS,
    )
    WINDOW_DAYS = DEFAULT_WINDOW_DAYS


def _get_client() -> genai.Client:
    if _gemini_client is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gemini API key is not configured.",
        )
    return _gemini_client


@router.post(
    "",
    response_model=RecommendationResponse,
    status_code=status.HTTP_200_OK,
)
def create_recommendations(payload: RecommendationRequest) -> RecommendationResponse:
    busy_response = get_busy_response()
    if busy_response is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No busy availability submitted. Please mark busy slots in the calendar first.",
        )

    client = _get_client()

    try:
        recommendation = generate_recommendations(
            client=client,
            request=payload,
            busy_response=busy_response,
            duration_minutes=MEETING_DURATION_MINUTES,
            days_ahead=WINDOW_DAYS,
            model_name=MODEL_NAME,
        )
    except ValueError as exc:
        logger.warning("Unable to generate recommendations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gemini recommendation request failed.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini service failed to return recommendations.",
        ) from exc

    return recommendation


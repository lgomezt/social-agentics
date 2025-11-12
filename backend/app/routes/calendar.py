import logging
from fastapi import APIRouter, HTTPException, status

from app.schemas import BusyPayload, BusyResponse
from app.services.calendar import normalize_busy_payload
from app.state.busy import clear_busy_response, get_busy_response, set_busy_response

router = APIRouter()

logger = logging.getLogger(__name__)


@router.post("/busy", response_model=BusyResponse, status_code=status.HTTP_200_OK)
def post_busy_availability(payload: BusyPayload) -> BusyResponse:
    """
    Accept user busy slot events and normalize them into ISO8601 intervals.
    """
    logger.info("Received busy payload with %d events", len(payload.events))
    normalized = normalize_busy_payload(payload)
    set_busy_response(normalized)
    logger.info("Busy payload normalized to %d intervals", len(normalized.intervals))
    return normalized

@router.get("/busy", response_model=BusyResponse)
def get_busy_availability() -> BusyResponse:
    """
    Retrieve the last known normalized busy intervals.
    """
    latest_busy_response = get_busy_response()
    if latest_busy_response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No busy availability has been submitted yet.",
        )
    logger.info("Serving latest busy response with %d intervals", len(latest_busy_response.intervals))
    return latest_busy_response


@router.delete("/busy", status_code=status.HTTP_204_NO_CONTENT)
def delete_busy_availability() -> None:
    """
    Clear all stored busy intervals.
    """
    clear_busy_response()


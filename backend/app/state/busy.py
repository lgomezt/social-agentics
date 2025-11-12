from typing import Optional

from app.schemas import BusyResponse

_latest_busy_response: Optional[BusyResponse] = None


def set_busy_response(response: BusyResponse) -> None:
    global _latest_busy_response
    _latest_busy_response = response


def get_busy_response() -> Optional[BusyResponse]:
    return _latest_busy_response


def clear_busy_response() -> None:
    global _latest_busy_response
    _latest_busy_response = None


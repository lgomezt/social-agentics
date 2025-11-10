from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, model_validator


class SlotEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Unique identifier for the event")
    slot_date: date = Field(
        ..., alias="date", description="Date of the slot in YYYY-MM-DD"
    )
    start_time_index: int = Field(..., ge=0, description="Start slot index (inclusive)")
    end_time_index: int = Field(..., gt=0, description="End slot index (exclusive)")
    slots_per_hour: int = Field(..., gt=0, description="Number of slots per hour")

    @model_validator(mode="after")
    def validate_time_indices(cls, model):
        if (
            model.start_time_index is not None
            and model.end_time_index <= model.start_time_index
        ):
            raise ValueError("end_time_index must be greater than start_time_index")
        return model


class BusyPayload(BaseModel):
    timezone: Optional[str] = Field(default="UTC", description="IANA timezone string")
    events: List[SlotEvent] = Field(default_factory=list, description="Busy slot events")


class BusyInterval(BaseModel):
    event_id: str = Field(..., description="Original event identifier")
    start: str = Field(..., description="ISO8601 start datetime with timezone")
    end: str = Field(..., description="ISO8601 end datetime with timezone")
    source: Literal["user", "backend"] = Field(
        default="user", description="Origin of the event"
    )


class BusyResponse(BaseModel):
    timezone: str = Field(..., description="Timezone context for the intervals")
    intervals: List[BusyInterval] = Field(
        default_factory=list, description="Normalized busy intervals"
    )


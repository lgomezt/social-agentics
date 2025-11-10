from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ConversationTurn(BaseModel):
    role: Literal["system", "user", "assistant"] = Field(
        ..., description="Role of the speaker"
    )
    content: str = Field(..., description="Message content for the conversation turn")


class RecommendationOption(BaseModel):
    id: str = Field(..., description="Unique identifier for the recommended slot")
    label: str = Field(..., description="Human-readable label, e.g. Option A")
    start: datetime = Field(..., description="ISO8601 start datetime with timezone")
    end: datetime = Field(..., description="ISO8601 end datetime with timezone")
    reason: str = Field(..., description="Explanation for why this option is suitable")


class RecommendationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scenario: str = Field(..., description="Free-form scenario entered by the user")
    conversation: List[ConversationTurn] = Field(
        default_factory=list,
        description="Conversation turns to provide context to the model",
    )
    timezone: Optional[str] = Field(
        default=None,
        description="IANA timezone identifier. Falls back to busy payload timezone.",
    )
    previous_options: List[RecommendationOption] = Field(
        default_factory=list,
        serialization_alias="previousOptions",
        validation_alias="previousOptions",
        description="Historical options previously returned to the user",
    )


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scenario: str = Field(..., description="Scenario used for generating recommendations")
    message: str = Field(..., description="Assistant response with rationale")
    options: List[RecommendationOption] = Field(
        default_factory=list,
        description="Top recommended slots returned by Gemini",
    )
    model: str = Field(..., description="Gemini model name used for generation")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp capturing when the recommendations were generated",
        serialization_alias="createdAt",
    )


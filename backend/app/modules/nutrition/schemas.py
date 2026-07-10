import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class MealItemEstimate(BaseModel):
    name: str
    quantity: str | None = None
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float


class ParsedMeal(BaseModel):
    items: list[MealItemEstimate]
    total_calories: int
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    confidence: float
    assumptions: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    suggested_template_name: str | None = None
    meal_type: str | None = None


class MealDraft(BaseModel):
    id: uuid.UUID
    parsed: ParsedMeal
    raw_input: str
    resolved_from_template_id: uuid.UUID | None = None


class ChatRequest(BaseModel):
    message: str
    conversation_id: uuid.UUID | None = None


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    reply: str
    state: str
    meal_draft: MealDraft | None = None
    follow_up_questions: list[str] = Field(default_factory=list)


class ConfirmMealRequest(BaseModel):
    save_as_template: bool = False
    template_name: str | None = None


class MealItemResponse(BaseModel):
    name: str
    quantity: str | None
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None


class MealResponse(BaseModel):
    id: uuid.UUID
    logged_at: datetime
    meal_type: str | None
    raw_input: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: float
    status: str
    items: list[MealItemResponse]


class MealTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    aliases: list[str]
    description: str | None
    calories: int | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None
    use_count: int


class WeightLogRequest(BaseModel):
    weight_kg: float
    measured_at: datetime | None = None
    note: str | None = None


class WeightContext(BaseModel):
    current_weight_kg: float | None
    goal_weight_kg: float | None
    weekly_change_kg: float | None
    maintenance_calories: int | None
    estimated_deficit_today: int | None
    trend_7d: list[float]

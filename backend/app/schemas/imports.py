from datetime import date

from pydantic import BaseModel, field_validator

from app.models.observation import ObservationType


class ImportPreviewRequest(BaseModel):
    text: str


class ImportSummary(BaseModel):
    total_rows: int = 0
    importable: int = 0
    conflicts: int = 0
    errors: int = 0
    skipped: int = 0
    imported: int = 0


class ImportItem(BaseModel):
    row: int
    date: str
    type: ObservationType
    label: str
    incoming_value: str
    existing_value: str | None = None
    status: str
    conflict: bool = False
    error: str | None = None
    overwrite: bool = False

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value


class ImportApplyRequest(BaseModel):
    items: list[ImportItem]


class ImportRow(BaseModel):
    row: int
    date: str | None
    status: str
    message: str | None = None


class ImportPreviewResponse(BaseModel):
    rows: list[ImportRow]
    items: list[ImportItem]
    summary: ImportSummary


class ImportApplyResponse(BaseModel):
    items: list[ImportItem]
    summary: ImportSummary

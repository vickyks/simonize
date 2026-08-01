from pydantic import BaseModel


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
    type: str
    label: str
    incoming_value: str
    existing_value: str | None = None
    status: str
    error: str | None = None
    overwrite: bool = False


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

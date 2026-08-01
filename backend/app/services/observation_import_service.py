import csv
import re
from datetime import date
from io import StringIO

from sqlmodel import Session

from app.models.observation import ObservationType
from app.models.user import User
from app.schemas.imports import (
    ImportApplyResponse,
    ImportItem,
    ImportPreviewResponse,
    ImportRow,
    ImportSummary,
)
from app.services.observation_service import ObservationService, ValidationError

COLUMN_MAP = {
    "Column 2": (ObservationType.WEIGHT, "Weight"),
    "Resting Pulse": (ObservationType.PULSE, "Pulse"),
    "BP": (ObservationType.BP, "Blood pressure"),
    "Walk distance": (ObservationType.WALK_DISTANCE, "Walk distance"),
    "Walk Time": (ObservationType.WALK_TIME, "Walk time"),
    "Stops": (ObservationType.WALK_STOPS, "Stops"),
    "Songs": (ObservationType.SONGS, "Songs"),
    "NYHA": (ObservationType.NYHA, "NYHA"),
    "Notes": (ObservationType.NOTES, "Notes"),
    "Column 1": (ObservationType.OXYGEN, "Oxygen"),
}


class ObservationImportService:
    def __init__(self, session: Session):
        self.session = session
        self.observations = ObservationService(session)

    def preview(self, user: User, text: str) -> ImportPreviewResponse:
        rows: list[ImportRow] = []
        items: list[ImportItem] = []
        reader = csv.DictReader(StringIO(text.strip()), delimiter="\t")
        for row_number, row in enumerate(reader, start=2):
            day = self._parse_date(row.get("Date", ""))
            if day is None:
                rows.append(
                    ImportRow(
                        row=row_number,
                        date=None,
                        status="error",
                        message="Invalid date",
                    )
                )
                continue
            rows.append(ImportRow(row=row_number, date=day.isoformat(), status="ok"))
            existing = self.observations.get_for_date(user, day)
            for column, (observation_type, label) in COLUMN_MAP.items():
                raw = (row.get(column) or "").strip()
                if raw == "":
                    continue
                item = ImportItem(
                    row=row_number,
                    date=day.isoformat(),
                    type=observation_type.value,
                    label=label,
                    incoming_value=raw,
                    status="ready",
                )
                try:
                    incoming = self._normalize_value(observation_type, raw)
                    item = item.model_copy(update={"incoming_value": incoming})
                    self.observations._serialize_value(observation_type, incoming)
                except (ValueError, ValidationError) as exc:
                    items.append(
                        item.model_copy(update={"status": "error", "error": str(exc)})
                    )
                    continue
                if observation_type in existing:
                    items.append(
                        item.model_copy(
                            update={
                                "status": "conflict",
                                "conflict": True,
                                "existing_value": existing[observation_type].value,
                            }
                        )
                    )
                else:
                    items.append(item)
        return ImportPreviewResponse(
            rows=rows,
            items=items,
            summary=self._summary(rows, items),
        )

    def apply(self, user: User, items: list[ImportItem]) -> ImportApplyResponse:
        result_items: list[ImportItem] = []
        for item in items:
            if item.status == "error":
                result_items.append(item)
                continue
            observation_type = ObservationType(item.type)
            day = date.fromisoformat(item.date)
            existing = self.observations.get_for_date(user, day)
            if observation_type in existing and not item.overwrite:
                result_items.append(
                    item.model_copy(
                        update={
                            "status": "skipped",
                            "conflict": False,
                            "existing_value": existing[observation_type].value,
                        }
                    )
                )
                continue
            try:
                self.observations.upsert(
                    user,
                    day,
                    observation_type,
                    item.incoming_value,
                )
            except ValidationError as exc:
                result_items.append(
                    item.model_copy(
                        update={"status": "error", "conflict": False, "error": str(exc)}
                    )
                )
                continue
            result_items.append(
                item.model_copy(update={"status": "imported", "conflict": False})
            )
        return ImportApplyResponse(
            items=result_items,
            summary=self._summary([], result_items),
        )

    def _parse_date(self, value: str) -> date | None:
        try:
            day, month, year = value.strip().split("/")
            return date(int(year), int(month), int(day))
        except (TypeError, ValueError):
            return None

    def _normalize_value(self, observation_type: ObservationType, value: str) -> str:
        if observation_type == ObservationType.OXYGEN:
            match = re.search(r"\d+", value)
            return match.group(0) if match else value
        if observation_type == ObservationType.WALK_TIME:
            minutes = float(value)
            return str(round(minutes * 60))
        return value

    def _summary(self, rows: list[ImportRow], items: list[ImportItem]) -> ImportSummary:
        return ImportSummary(
            total_rows=len(rows),
            importable=sum(1 for item in items if item.status == "ready"),
            conflicts=sum(1 for item in items if item.status == "conflict"),
            errors=sum(1 for item in items if item.status == "error"),
            skipped=sum(1 for item in items if item.status == "skipped"),
            imported=sum(1 for item in items if item.status == "imported"),
        )

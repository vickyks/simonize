from datetime import date

from app.models.observation import ObservationType
from app.models.user import User
from app.services.observation_import_service import ObservationImportService
from app.services.observation_service import ObservationService
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

SAMPLE_TSV = "\n".join(
    [
        "Date\tColumn 3\tColumn 2\tResting Pulse\tBP\tWalk distance\t"
        "Walk Time\tStops\tSongs\tNYHA\tNotes\tColumn 1",
        "28/06/2026\t\t80.9\t71\t134/68\t325\t14\t1\t6\t4\t"
        "Walked around house and had bath.\tOxygen 97",
        "09/07/2026\tth\t75.7\t90\t113/65\t\t\t\t\t3.5\t"
        "nurse again 58 heart rate.\t99",
        "",
    ]
)


def make_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def make_user(session: Session, username: str = "simon") -> User:
    user = User(username=username, hashed_password="hash")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def item_by_type(preview, day: str, observation_type: str):
    return next(
        item
        for item in preview.items
        if item.date == day and item.type == observation_type
    )


def test_preview_maps_mums_tsv_and_flags_invalid_nyha():
    with make_session() as session:
        user = make_user(session)

        preview = ObservationImportService(session).preview(user=user, text=SAMPLE_TSV)

        assert preview.summary.total_rows == 2
        assert item_by_type(preview, "2026-06-28", "weight").incoming_value == "80.9"
        assert item_by_type(preview, "2026-06-28", "pulse").incoming_value == "71"
        assert item_by_type(preview, "2026-06-28", "bp").incoming_value == "134/68"
        assert (
            item_by_type(preview, "2026-06-28", "walk_distance").incoming_value
            == "325"
        )
        assert item_by_type(preview, "2026-06-28", "walk_time").incoming_value == "840"
        assert item_by_type(preview, "2026-06-28", "walk_stops").incoming_value == "1"
        assert item_by_type(preview, "2026-06-28", "songs").incoming_value == "6"
        assert item_by_type(preview, "2026-06-28", "nyha").incoming_value == "4"
        assert item_by_type(preview, "2026-06-28", "oxygen").incoming_value == "97"
        assert item_by_type(preview, "2026-07-09", "nyha").incoming_value == "3.5"
        assert item_by_type(preview, "2026-07-09", "nyha").status == "error"
        assert item_by_type(preview, "2026-07-09", "nyha").error is not None


def test_preview_flags_invalid_walk_time_without_dropping_valid_same_row_fields():
    text = "\n".join(
        [
            "Date\tColumn 2\tWalk Time\tColumn 1",
            "28/06/2026\t80.9\tvery tired\t97",
            "",
        ]
    )

    with make_session() as session:
        user = make_user(session)

        preview = ObservationImportService(session).preview(user=user, text=text)

        walk_time = item_by_type(preview, "2026-06-28", "walk_time")
        assert walk_time.incoming_value == "very tired"
        assert walk_time.status == "error"
        assert walk_time.error is not None
        assert item_by_type(preview, "2026-06-28", "weight").status == "ready"
        assert item_by_type(preview, "2026-06-28", "oxygen").status == "ready"


def test_preview_counts_invalid_date_rows_as_errors():
    text = "\n".join(
        [
            "Date\tColumn 2",
            "not-a-date\t80.9",
            "28/06/2026\t81.0",
            "",
        ]
    )

    with make_session() as session:
        user = make_user(session)

        preview = ObservationImportService(session).preview(user=user, text=text)

        assert preview.summary.total_rows == 2
        assert preview.summary.errors == 1
        assert preview.summary.importable == 1


def test_preview_detects_conflicts_and_apply_skips_by_default():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "81.0",
        )

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        conflict = item_by_type(preview, "2026-06-28", "weight")

        assert conflict.status == "conflict"
        assert conflict.conflict is True
        assert conflict.existing_value == "81"
        assert conflict.incoming_value == "80.9"
        assert item_by_type(preview, "2026-06-28", "oxygen").conflict is False

        result = service.apply(user=user, items=preview.items)
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))
        skipped = item_by_type(result, "2026-06-28", "weight")

        assert result.summary.imported > 0
        assert result.summary.skipped >= 1
        assert skipped.conflict is False
        assert observations[ObservationType.WEIGHT].value == "81"
        assert observations[ObservationType.OXYGEN].value == "97"


def test_apply_overwrites_selected_conflict_only():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "81.0",
        )

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        items = [
            item.model_copy(update={"overwrite": item.type == "weight"})
            for item in preview.items
        ]

        result = service.apply(user=user, items=items)
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))
        imported = item_by_type(result, "2026-06-28", "weight")

        assert result.summary.imported > 0
        assert imported.status == "imported"
        assert observations[ObservationType.WEIGHT].value == "80.9"


def test_apply_skips_stale_conflict_when_existing_value_changed_since_preview():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "81.0",
        )

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        conflict = item_by_type(preview, "2026-06-28", "weight")
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "82.0",
        )

        result = service.apply(
            user=user,
            items=[conflict.model_copy(update={"overwrite": True})],
        )
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))
        skipped = item_by_type(result, "2026-06-28", "weight")

        assert result.summary.imported == 0
        assert result.summary.skipped == 1
        assert skipped.status == "skipped"
        assert skipped.conflict is True
        assert skipped.existing_value == "82"
        assert observations[ObservationType.WEIGHT].value == "82"


def test_apply_skips_stale_non_conflict_overwrite_when_observation_now_exists():
    with make_session() as session:
        user = make_user(session)

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        ready_weight = item_by_type(preview, "2026-06-28", "weight")
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "81.0",
        )

        result = service.apply(
            user=user,
            items=[ready_weight.model_copy(update={"overwrite": True})],
        )
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))
        skipped = item_by_type(result, "2026-06-28", "weight")

        assert result.summary.imported == 0
        assert result.summary.skipped == 1
        assert skipped.status == "skipped"
        assert skipped.existing_value == "81"
        assert observations[ObservationType.WEIGHT].value == "81"

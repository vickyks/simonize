from datetime import date

import pytest
from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.observation_service import ObservationService
from app.services.summary_service import SummaryRangeError, SummaryService
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


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


def test_summary_builds_all_sections_for_range():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        old_day = date(2026, 6, 1)
        in_range = date(2026, 7, 13)
        service.upsert(user, old_day, ObservationType.WEIGHT, "91.0")
        service.upsert(user, in_range, ObservationType.WEIGHT, "92.3")
        service.upsert(user, in_range, ObservationType.PULSE, "71")
        service.upsert(user, in_range, ObservationType.BP, "121/78")
        service.upsert(
            user,
            in_range,
            ObservationType.WALK_DISTANCE,
            "325",
            metadata={"time_seconds": 840, "stops": 2},
        )
        service.upsert(user, in_range, ObservationType.SONGS, "3")
        service.upsert(user, in_range, ObservationType.NYHA, "3")
        service.upsert(user, in_range, ObservationType.SYMPTOMS, ["breathless"])
        service.upsert(user, in_range, ObservationType.NOTES, "Felt stronger today")

        summary = SummaryService(session).build(
            user_id=user.id, days="7", today=date(2026, 7, 13)
        )

        assert summary.range.days == 7
        assert summary.range.start_date == "2026-07-07"
        assert summary.range.end_date == "2026-07-13"
        assert summary.vitals.weight == [{"date": "2026-07-13", "value": 92.3}]
        assert summary.vitals.pulse == [{"date": "2026-07-13", "value": 71}]
        assert summary.vitals.bp == [
            {"date": "2026-07-13", "systolic": 121, "diastolic": 78}
        ]
        assert summary.activity.walk == [
            {"date": "2026-07-13", "distance": 325, "time_seconds": 840, "stops": 2}
        ]
        assert summary.activity.songs == [{"date": "2026-07-13", "value": 3}]
        assert summary.functional.nyha == [{"date": "2026-07-13", "value": 3}]
        assert summary.symptoms == [{"date": "2026-07-13", "values": ["breathless"]}]
        assert summary.notes == [{"date": "2026-07-13", "text": "Felt stronger today"}]


def test_walk_uses_same_day_time_and_stops_fallbacks_when_metadata_missing():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        day = date(2026, 7, 13)
        service.upsert(user, day, ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, day, ObservationType.WALK_TIME, "840")
        service.upsert(user, day, ObservationType.WALK_STOPS, "2")

        summary = SummaryService(session).build(user_id=user.id, days="7", today=day)

        assert summary.activity.walk == [
            {"date": "2026-07-13", "distance": 325, "time_seconds": 840, "stops": 2}
        ]


def test_summary_is_scoped_to_user_and_skips_invalid_values():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        day = date(2026, 7, 13)
        ObservationService(session).upsert(vicky, day, ObservationType.WEIGHT, "99.9")
        session.add(
            Observation(
                user_id=simon.id,
                date=day,
                type=ObservationType.PULSE,
                value="not-a-number",
            )
        )
        session.commit()

        summary = SummaryService(session).build(user_id=simon.id, days="7", today=day)

        assert summary.vitals.weight == []
        assert summary.vitals.pulse == []


def test_invalid_range_raises_summary_range_error():
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(SummaryRangeError):
            SummaryService(session).build(
                user_id=user.id, days="14", today=date(2026, 7, 13)
            )

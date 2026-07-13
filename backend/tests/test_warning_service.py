from datetime import date

from app.models.observation import ObservationType
from app.services.warning_service import DailyWarningObservations, WarningService


def test_red_for_chest_discomfort_today():
    result = WarningService().evaluate(
        today={ObservationType.SYMPTOMS: ["chest_discomfort"]},
        recent=[],
    )

    assert result.status == "red"
    assert "Chest discomfort was recorded today." in result.messages
    assert (
        "If symptoms are severe or sudden, call 999. Otherwise contact the Heart "
        "Failure team urgently."
        in result.messages
    )


def test_red_for_nyha_four_today():
    result = WarningService().evaluate(
        today={ObservationType.NYHA: 4},
        recent=[],
    )

    assert result.status == "red"
    assert "NYHA class IV was recorded today." in result.messages


def test_red_for_three_kg_weight_gain_within_two_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 11), values={ObservationType.WEIGHT: 90.0}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WEIGHT: 93.1}
            ),
        ],
    )

    assert result.status == "red"
    assert "Your weight has increased 3 kg over 2 days." in result.messages


def test_amber_for_two_kg_weight_gain_within_three_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 10), values={ObservationType.WEIGHT: 91.0}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WEIGHT: 93.0}
            ),
        ],
    )

    assert result.status == "amber"
    assert "Your weight has increased 2 kg over 3 days." in result.messages
    assert (
        "Consider contacting the Heart Failure team if this continues."
        in result.messages
    )


def test_amber_for_pulse_average_rise():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 7), values={ObservationType.PULSE: 70}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 8), values={ObservationType.PULSE: 72}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 12), values={ObservationType.PULSE: 84}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.PULSE: 85}
            ),
        ],
    )

    assert result.status == "amber"
    assert (
        "Your resting pulse average has increased by more than 10 BPM over 7 days."
        in result.messages
    )


def test_amber_for_walk_distance_falling():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 7), values={ObservationType.WALK_DISTANCE: 500}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 10), values={ObservationType.WALK_DISTANCE: 420}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WALK_DISTANCE: 390}
            ),
        ],
    )

    assert result.status == "amber"
    assert (
        "Your walk distance has fallen by more than 20% over 7 days." in result.messages
    )


def test_amber_for_nyha_worsening_three_consecutive_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 10), values={ObservationType.NYHA: 2}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 11), values={ObservationType.NYHA: 3}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 12), values={ObservationType.NYHA: 3}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.NYHA: 3}
            ),
        ],
    )

    assert result.status == "amber"
    assert "NYHA class has worsened for 3 consecutive days." in result.messages


def test_amber_for_repeated_symptom_excluding_good_day():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 7), values={ObservationType.SYMPTOMS: ["good_day"]}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 8), values={ObservationType.SYMPTOMS: ["breathless"]}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 10),
                values={ObservationType.SYMPTOMS: ["breathless"]},
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13),
                values={ObservationType.SYMPTOMS: ["breathless"]},
            ),
        ],
    )

    assert result.status == "amber"
    assert "Breathless was recorded on 3 of the last 7 days." in result.messages


def test_repeated_symptom_counts_at_most_once_per_day():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 11),
                values={ObservationType.SYMPTOMS: ["breathless", "breathless"]},
            ),
            DailyWarningObservations(
                date=date(2026, 7, 12),
                values={ObservationType.SYMPTOMS: ["breathless"]},
            ),
        ],
    )

    assert result.status == "green"
    assert result.messages == []


def test_bool_values_do_not_trigger_numeric_warnings():
    result = WarningService().evaluate(
        today={ObservationType.NYHA: True},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 10), values={ObservationType.WEIGHT: True}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 11),
                values={
                    ObservationType.WEIGHT: 3.0,
                    ObservationType.PULSE: True,
                    ObservationType.WALK_DISTANCE: True,
                    ObservationType.NYHA: True,
                },
            ),
            DailyWarningObservations(
                date=date(2026, 7, 12),
                values={
                    ObservationType.WEIGHT: False,
                    ObservationType.PULSE: True,
                    ObservationType.WALK_DISTANCE: True,
                    ObservationType.NYHA: True,
                },
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13),
                values={
                    ObservationType.PULSE: True,
                    ObservationType.WALK_DISTANCE: False,
                    ObservationType.NYHA: True,
                },
            ),
        ],
    )

    assert result.status == "green"
    assert result.messages == []


def test_green_when_no_warning_conditions_or_not_enough_data():
    result = WarningService().evaluate(
        today={ObservationType.WEIGHT: 92.0},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WEIGHT: 92.0}
            )
        ],
    )

    assert result.status == "green"
    assert result.messages == []

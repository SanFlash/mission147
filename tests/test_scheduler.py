from datetime import date
import pytest

from backend.scheduler import build_schedule, normalize_offsets, parse_date


def test_default_147_schedule():
    result = build_schedule("2026-10-22")
    assert [(item["offset_days"], item["scheduled_date"]) for item in result] == [
        (1, "2026-10-23"), (4, "2026-10-26"), (7, "2026-10-29")
    ]


def test_month_and_year_boundaries():
    assert [x["scheduled_date"] for x in build_schedule("2026-12-29", [1, 4, 7])] == [
        "2026-12-30", "2027-01-02", "2027-01-05"
    ]


def test_leap_day():
    assert [x["scheduled_date"] for x in build_schedule("2024-02-28", [1, 4, 7])] == [
        "2024-02-29", "2024-03-03", "2024-03-06"
    ]


def test_extended_intervals():
    result = build_schedule(date(2026, 10, 22), [30, 1, 7, 4, 30])
    assert [x["offset_days"] for x in result] == [1, 4, 7, 30]


@pytest.mark.parametrize("value", ["", "2026-02-30", "22-10-2026", None])
def test_invalid_date_rejected(value):
    with pytest.raises(ValueError):
        parse_date(value)


def test_invalid_intervals_rejected():
    with pytest.raises(ValueError):
        normalize_offsets([0, 1])
    with pytest.raises(ValueError):
        normalize_offsets([])

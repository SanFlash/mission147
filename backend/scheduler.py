"""Date-only revision scheduling for Mission147.

All offsets are calendar days from the original study date by default.
No UTC timestamp arithmetic is used for date-only schedule calculations.
"""
from datetime import date, timedelta
from typing import Iterable

DEFAULT_OFFSETS = (1, 4, 7)
EXTENDED_OFFSETS = (1, 4, 7, 14, 30, 60, 90)


def parse_date(value: str | date) -> date:
    """Parse an ISO calendar date or return an existing date object."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        raise ValueError("Date must be an ISO string in YYYY-MM-DD format")
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Date must be a valid ISO calendar date (YYYY-MM-DD)") from exc


def normalize_offsets(offsets: Iterable[int] = DEFAULT_OFFSETS) -> tuple[int, ...]:
    """Validate and normalize revision offsets in days from Day 0."""
    try:
        result = tuple(sorted(set(int(offset) for offset in offsets)))
    except (TypeError, ValueError) as exc:
        raise ValueError("Revision offsets must be whole numbers of days") from exc
    if not result:
        raise ValueError("At least one revision interval is required")
    if any(offset < 1 or offset > 3650 for offset in result):
        raise ValueError("Revision intervals must be between 1 and 3650 days")
    return result


def build_schedule(study_date: str | date, offsets: Iterable[int] = DEFAULT_OFFSETS) -> list[dict[str, str | int]]:
    """Return revision sessions based on the original study date.

    Example: 2026-10-22 with offsets [1, 4, 7] yields Oct 23, Oct 26,
    and Oct 29. Day 0 is the initial learning session and is not returned
    as a revision session.
    """
    base = parse_date(study_date)
    normalized = normalize_offsets(offsets)
    return [
        {
            "stage": index,
            "offset_days": offset,
            "scheduled_date": (base + timedelta(days=offset)).isoformat(),
            "status": "scheduled",
        }
        for index, offset in enumerate(normalized, start=1)
    ]

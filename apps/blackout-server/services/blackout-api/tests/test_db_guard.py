from __future__ import annotations

import importlib
from unittest.mock import MagicMock

import pytest


def _reload_db() -> None:
    import blackout_api.db as db

    importlib.reload(db)


def test_sqlite_without_flag_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BLACKOUT_API_DATABASE_URL", "sqlite:///./blackout_api.db")
    monkeypatch.delenv("BLACKOUT_API_ALLOW_SQLITE", raising=False)
    with pytest.raises(RuntimeError, match="Refusing to start blackout-api on SQLite"):
        _reload_db()


def test_sqlite_with_allow_flag_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BLACKOUT_API_DATABASE_URL", "sqlite:///./blackout_api.db")
    monkeypatch.setenv("BLACKOUT_API_ALLOW_SQLITE", "1")
    _reload_db()


def test_postgres_url_does_not_trigger_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    """Guard must only fire for sqlite URLs — verify via mocked create_engine."""
    monkeypatch.setenv(
        "BLACKOUT_API_DATABASE_URL",
        "postgresql://user:pw@localhost:5432/blackout",
    )
    monkeypatch.delenv("BLACKOUT_API_ALLOW_SQLITE", raising=False)
    monkeypatch.setattr("sqlalchemy.create_engine", MagicMock())
    _reload_db()

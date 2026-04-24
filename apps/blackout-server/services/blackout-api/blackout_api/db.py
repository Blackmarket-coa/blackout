from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import DateTime, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


DATABASE_URL = os.getenv("BLACKOUT_API_DATABASE_URL", "sqlite:///./blackout_api.db")
_ALLOW_SQLITE = os.getenv("BLACKOUT_API_ALLOW_SQLITE", "").lower() in {"1", "true", "yes"}
if DATABASE_URL.startswith("sqlite") and not _ALLOW_SQLITE:
    raise RuntimeError(
        "Refusing to start blackout-api on SQLite. "
        "Set BLACKOUT_API_DATABASE_URL to a PostgreSQL URL, "
        "or set BLACKOUT_API_ALLOW_SQLITE=1 for local development."
    )
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class UserMap(Base, TimestampMixin):
    __tablename__ = "user_map"

    app_user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    matrix_user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)


class ServerMap(Base, TimestampMixin):
    __tablename__ = "server_map"

    app_server_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    matrix_space_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)


class ChannelMap(Base, TimestampMixin):
    __tablename__ = "channel_map"

    app_channel_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    matrix_room_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    app_server_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="text", nullable=False)


class MembershipMap(Base):
    __tablename__ = "membership_map"

    app_server_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    app_user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), default="member", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Message(Base, TimestampMixin):
    __tablename__ = "message"

    message_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    app_channel_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sender_app_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

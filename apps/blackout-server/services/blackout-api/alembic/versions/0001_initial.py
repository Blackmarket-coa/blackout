"""initial blackout api tables

Revision ID: 0001_initial
Revises: 
Create Date: 2026-03-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_map",
        sa.Column("app_user_id", sa.String(length=128), nullable=False),
        sa.Column("matrix_user_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("app_user_id"),
        sa.UniqueConstraint("matrix_user_id"),
    )

    op.create_table(
        "server_map",
        sa.Column("app_server_id", sa.String(length=128), nullable=False),
        sa.Column("matrix_space_id", sa.String(length=255), nullable=False),
        sa.Column("owner_user_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("app_server_id"),
        sa.UniqueConstraint("matrix_space_id"),
    )

    op.create_table(
        "channel_map",
        sa.Column("app_channel_id", sa.String(length=128), nullable=False),
        sa.Column("matrix_room_id", sa.String(length=255), nullable=False),
        sa.Column("app_server_id", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("app_channel_id"),
        sa.UniqueConstraint("matrix_room_id"),
    )
    op.create_index("ix_channel_map_app_server_id", "channel_map", ["app_server_id"])

    op.create_table(
        "membership_map",
        sa.Column("app_server_id", sa.String(length=128), nullable=False),
        sa.Column("app_user_id", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("app_server_id", "app_user_id"),
    )

    op.create_table(
        "message",
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("app_channel_id", sa.String(length=128), nullable=False),
        sa.Column("sender_app_user_id", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("message_id"),
    )
    op.create_index("ix_message_app_channel_id", "message", ["app_channel_id"])


def downgrade() -> None:
    op.drop_index("ix_message_app_channel_id", table_name="message")
    op.drop_table("message")
    op.drop_table("membership_map")
    op.drop_index("ix_channel_map_app_server_id", table_name="channel_map")
    op.drop_table("channel_map")
    op.drop_table("server_map")
    op.drop_table("user_map")

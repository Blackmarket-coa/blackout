from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ServerCreateRequest(BaseModel):
    matrix_space_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=1024)


class ServerPatchRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = Field(default=None, max_length=1024)


class RoleUpdateRequest(BaseModel):
    role: str = Field(min_length=1, max_length=32)


class JoinRequest(BaseModel):
    role: str = Field(default="member", min_length=1, max_length=32)


class ChannelCreateRequest(BaseModel):
    matrix_room_id: str = Field(min_length=1, max_length=255)
    kind: str = Field(default="text", min_length=1, max_length=32)


class MessageCreateRequest(BaseModel):
    sender_app_user_id: str = Field(min_length=1, max_length=128)
    body: str = Field(min_length=1, max_length=5000)


class ServerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    app_server_id: str
    matrix_space_id: str
    owner_user_id: str
    name: str
    description: str
    created_at: datetime


class ChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    app_channel_id: str
    matrix_room_id: str
    app_server_id: str
    kind: str
    created_at: datetime


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    app_server_id: str
    app_user_id: str
    role: str
    joined_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    message_id: str
    app_channel_id: str
    sender_app_user_id: str
    body: str
    created_at: datetime


class UserRegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8)


class UserLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1)


class UserAuthOut(BaseModel):
    app_user_id: str
    matrix_user_id: str
    token: str
    matrix_access_token: str

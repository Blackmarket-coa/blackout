from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import httpx
import jwt
from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import ChannelMap, MembershipMap, Message, ServerMap, UserMap, get_db
from .schemas import (
    ChannelCreateRequest,
    ChannelOut,
    JoinRequest,
    MembershipOut,
    MessageCreateRequest,
    MessageOut,
    RoleUpdateRequest,
    ServerCreateRequest,
    ServerOut,
    ServerPatchRequest,
    UserAuthOut,
    UserLoginRequest,
    UserRegisterRequest,
)

app = FastAPI(title="Blackout API", version="0.3.0")

JWT_SECRET = os.getenv("BLACKOUT_API_JWT_SECRET", "change-me")
JWT_ALGORITHM = os.getenv("BLACKOUT_API_JWT_ALGORITHM", "HS256")
JWT_AUDIENCE = os.getenv("BLACKOUT_API_JWT_AUDIENCE", "blackout-api")
JWT_ISSUER = os.getenv("BLACKOUT_API_JWT_ISSUER", "blackout-auth")
# Default off: run `alembic upgrade head` as a separate one-shot before
# starting uvicorn (e.g. an init container). Inline migrations on startup
# block the lifespan and can wedge the API on a stuck migration.
RUN_MIGRATIONS = os.getenv("BLACKOUT_API_RUN_MIGRATIONS", "false").lower() == "true"
SYNAPSE_URL = os.getenv("BLACKOUT_API_SYNAPSE_URL", "http://localhost:8008")


@app.on_event("startup")
def startup() -> None:
    if RUN_MIGRATIONS:
        run_migrations()


def run_migrations() -> None:
    base_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(base_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(base_dir / "alembic"))
    command.upgrade(cfg, "head")


class GatewayManager:
    def __init__(self) -> None:
        self.connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, payload: Dict[str, str]) -> None:
        for conn in list(self.connections):
            await conn.send_json(payload)


manager = GatewayManager()


def _mint_jwt(sub: str, role: str = "member") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "role": role,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "exp": now + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_jwt(token: str) -> dict:
    return jwt.decode(
        token,
        JWT_SECRET,
        algorithms=[JWT_ALGORITHM],
        audience=JWT_AUDIENCE,
        issuer=JWT_ISSUER,
        options={"require": ["exp", "aud", "iss", "sub"]},
    )


def require_auth(
    authorization: str = Header(default="", alias="Authorization"),
    matrix_access_token: str = Header(default="", alias="X-Matrix-Access-Token"),
) -> Dict[str, str]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]

    try:
        payload = _decode_jwt(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not matrix_access_token:
        raise HTTPException(status_code=400, detail="Missing X-Matrix-Access-Token")

    return {
        "sub": str(payload["sub"]),
        "matrix_access_token": matrix_access_token,
    }


def _upsert_user_map(db: Session, matrix_user_id: str) -> str:
    existing = db.execute(
        select(UserMap).where(UserMap.matrix_user_id == matrix_user_id)
    ).scalar_one_or_none()
    if existing:
        return existing.app_user_id
    app_user_id = str(uuid.uuid4())
    db.add(UserMap(app_user_id=app_user_id, matrix_user_id=matrix_user_id, status="active"))
    db.commit()
    return app_user_id


def get_server_or_404(db: Session, server_id: str) -> ServerMap:
    server = db.get(ServerMap, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


def get_membership(db: Session, server_id: str, user_id: str) -> Optional[MembershipMap]:
    return db.get(MembershipMap, {"app_server_id": server_id, "app_user_id": user_id})


def require_server_membership(db: Session, server_id: str, user_id: str) -> MembershipMap:
    membership = get_membership(db, server_id, user_id)
    if membership is None:
        raise HTTPException(status_code=403, detail="Server membership required")
    return membership


def require_server_admin(db: Session, server: ServerMap, user_id: str) -> None:
    if user_id == server.owner_user_id:
        return
    membership = get_membership(db, server.app_server_id, user_id)
    if membership is None or membership.role not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Admin role required")


def require_server_owner(server: ServerMap, user_id: str) -> None:
    if user_id != server.owner_user_id:
        raise HTTPException(status_code=403, detail="Owner role required")


def get_channel_or_404(db: Session, channel_id: str) -> ChannelMap:
    channel = db.get(ChannelMap, channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


@app.get("/healthz")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/users/register", response_model=UserAuthOut)
async def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    async with httpx.AsyncClient() as client:
        r1 = await client.post(
            f"{SYNAPSE_URL}/_matrix/client/v3/register",
            json={"username": payload.username, "password": payload.password},
        )
        if r1.status_code == 200:
            data = r1.json()
        elif r1.status_code == 401:
            session = r1.json().get("session")
            r2 = await client.post(
                f"{SYNAPSE_URL}/_matrix/client/v3/register",
                json={
                    "username": payload.username,
                    "password": payload.password,
                    "auth": {"type": "m.login.dummy", "session": session},
                },
            )
            if r2.status_code != 200:
                raise HTTPException(
                    status_code=400, detail=r2.json().get("error", "Registration failed")
                )
            data = r2.json()
        else:
            raise HTTPException(
                status_code=400, detail=r1.json().get("error", "Registration failed")
            )

    matrix_user_id: str = data["user_id"]
    matrix_access_token: str = data["access_token"]
    app_user_id = _upsert_user_map(db, matrix_user_id)

    return {
        "app_user_id": app_user_id,
        "matrix_user_id": matrix_user_id,
        "token": _mint_jwt(app_user_id),
        "matrix_access_token": matrix_access_token,
    }


@app.post("/v1/users/login", response_model=UserAuthOut)
async def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{SYNAPSE_URL}/_matrix/client/v3/login",
            json={
                "type": "m.login.password",
                "identifier": {"type": "m.id.user", "user": payload.username},
                "password": payload.password,
            },
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        data = r.json()

    matrix_user_id: str = data["user_id"]
    matrix_access_token: str = data["access_token"]
    app_user_id = _upsert_user_map(db, matrix_user_id)

    return {
        "app_user_id": app_user_id,
        "matrix_user_id": matrix_user_id,
        "token": _mint_jwt(app_user_id),
        "matrix_access_token": matrix_access_token,
    }


@app.post("/v1/servers", response_model=ServerOut)
def create_server(
    payload: ServerCreateRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> ServerMap:
    server = ServerMap(
        app_server_id=str(uuid.uuid4()),
        matrix_space_id=payload.matrix_space_id,
        owner_user_id=auth["sub"],
        name=payload.name,
        description=payload.description,
    )
    db.add(server)
    db.add(
        MembershipMap(
            app_server_id=server.app_server_id,
            app_user_id=auth["sub"],
            role="owner",
            joined_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(server)
    return server


@app.get("/v1/servers/{server_id}/members", response_model=List[MembershipOut])
def get_server_members(
    server_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> List[MembershipMap]:
    require_server_membership(db, server_id, auth["sub"])
    rows = db.execute(
        select(MembershipMap).where(MembershipMap.app_server_id == server_id)
    ).scalars()
    return list(rows)


@app.patch("/v1/servers/{server_id}", response_model=ServerOut)
def patch_server(
    server_id: str,
    patch: ServerPatchRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> ServerMap:
    server = get_server_or_404(db, server_id)
    require_server_admin(db, server, auth["sub"])

    if patch.name is not None:
        server.name = patch.name
    if patch.description is not None:
        server.description = patch.description

    db.commit()
    db.refresh(server)
    return server


@app.delete("/v1/servers/{server_id}")
def delete_server(
    server_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    server = get_server_or_404(db, server_id)
    require_server_owner(server, auth["sub"])

    db.query(Message).filter(
        Message.app_channel_id.in_(
            select(ChannelMap.app_channel_id).where(ChannelMap.app_server_id == server_id)
        )
    ).delete(synchronize_session=False)
    db.query(ChannelMap).filter(ChannelMap.app_server_id == server_id).delete()
    db.query(MembershipMap).filter(MembershipMap.app_server_id == server_id).delete()
    db.delete(server)
    db.commit()
    return {"status": "deleted", "app_server_id": server_id}


@app.post("/v1/servers/{server_id}/join")
def join_server(
    server_id: str,
    payload: JoinRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    get_server_or_404(db, server_id)
    user_id = auth["sub"]

    membership = get_membership(db, server_id, user_id)
    if membership is None:
        membership = MembershipMap(
            app_server_id=server_id,
            app_user_id=user_id,
            role=payload.role,
            joined_at=datetime.now(timezone.utc),
        )
        db.add(membership)
    else:
        membership.role = payload.role

    db.commit()
    return {"status": "joined", "app_server_id": server_id, "app_user_id": user_id}


@app.delete("/v1/servers/{server_id}/leave")
def leave_server(
    server_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    get_server_or_404(db, server_id)
    user_id = auth["sub"]
    membership = get_membership(db, server_id, user_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.delete(membership)
    db.commit()
    return {"status": "left", "app_server_id": server_id, "app_user_id": user_id}


@app.put("/v1/servers/{server_id}/members/{member_id}/role")
def update_member_role(
    server_id: str,
    member_id: str,
    payload: RoleUpdateRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    server = get_server_or_404(db, server_id)
    require_server_admin(db, server, auth["sub"])

    membership = get_membership(db, server_id, member_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")

    membership.role = payload.role
    db.commit()
    return {"status": "updated", "app_server_id": server_id, "app_user_id": member_id}


@app.get("/v1/servers/{server_id}/channels", response_model=List[ChannelOut])
def get_server_channels(
    server_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> List[ChannelMap]:
    require_server_membership(db, server_id, auth["sub"])
    rows = db.execute(select(ChannelMap).where(ChannelMap.app_server_id == server_id)).scalars()
    return list(rows)


@app.post("/v1/servers/{server_id}/channels", response_model=ChannelOut)
def create_channel(
    server_id: str,
    payload: ChannelCreateRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> ChannelMap:
    server = get_server_or_404(db, server_id)
    require_server_admin(db, server, auth["sub"])

    channel = ChannelMap(
        app_channel_id=str(uuid.uuid4()),
        matrix_room_id=payload.matrix_room_id,
        app_server_id=server_id,
        kind=payload.kind,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return channel


@app.delete("/v1/channels/{channel_id}")
def delete_channel(
    channel_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    channel = get_channel_or_404(db, channel_id)
    server = get_server_or_404(db, channel.app_server_id)
    require_server_admin(db, server, auth["sub"])

    db.query(Message).filter(Message.app_channel_id == channel_id).delete()
    db.delete(channel)
    db.commit()
    return {"status": "deleted", "app_channel_id": channel_id}


@app.get("/v1/channels/{channel_id}/messages", response_model=List[MessageOut])
def get_messages(
    channel_id: str,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> List[Message]:
    channel = get_channel_or_404(db, channel_id)
    require_server_membership(db, channel.app_server_id, auth["sub"])
    rows = db.execute(select(Message).where(Message.app_channel_id == channel_id)).scalars()
    return list(rows)


@app.post("/v1/channels/{channel_id}/messages", response_model=MessageOut)
async def post_message(
    channel_id: str,
    payload: MessageCreateRequest,
    auth: Dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Message:
    channel = get_channel_or_404(db, channel_id)
    require_server_membership(db, channel.app_server_id, auth["sub"])

    txn_id = str(uuid.uuid4()).replace("-", "")
    async with httpx.AsyncClient() as client:
        synapse_resp = await client.put(
            f"{SYNAPSE_URL}/_matrix/client/v3/rooms/{channel.matrix_room_id}"
            f"/send/m.room.message/{txn_id}",
            headers={"Authorization": f"Bearer {auth['matrix_access_token']}"},
            json={"msgtype": "m.text", "body": payload.body},
        )
    if synapse_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to forward message to Synapse")

    message = Message(
        message_id=str(uuid.uuid4()),
        app_channel_id=channel_id,
        sender_app_user_id=payload.sender_app_user_id,
        body=payload.body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    await manager.broadcast({"type": "message.created", "channel_id": channel_id})
    return message


@app.websocket("/gateway")
async def gateway(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    try:
        if not token:
            raise jwt.InvalidTokenError("missing token")
        _decode_jwt(token)
    except jwt.PyJWTError:
        await websocket.close(code=4001)
        return
    await manager.connect(websocket)
    try:
        while True:
            _ = await websocket.receive_text()
            await websocket.send_json({"type": "ack"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

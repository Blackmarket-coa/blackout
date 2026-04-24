from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "blackout_api_test.db"
    monkeypatch.setenv("BLACKOUT_API_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("BLACKOUT_API_ALLOW_SQLITE", "1")
    monkeypatch.setenv("BLACKOUT_API_JWT_SECRET", "test-secret")
    monkeypatch.setenv("BLACKOUT_API_JWT_AUDIENCE", "blackout-api")
    monkeypatch.setenv("BLACKOUT_API_JWT_ISSUER", "blackout-auth")
    monkeypatch.setenv("BLACKOUT_API_RUN_MIGRATIONS", "true")
    monkeypatch.setenv("BLACKOUT_API_SYNAPSE_URL", "http://synapse-test:8008")

    import blackout_api.db as db
    import blackout_api.main as main

    importlib.reload(db)
    importlib.reload(main)

    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def synapse_mock(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Patch httpx.AsyncClient after the module reload so all Synapse calls are intercepted."""
    import blackout_api.main as main_mod

    put_ok = MagicMock()
    put_ok.status_code = 200
    put_ok.json.return_value = {"event_id": "$event1"}

    login_ok = MagicMock()
    login_ok.status_code = 200
    login_ok.json.return_value = {"user_id": "@alice:localhost", "access_token": "mat-tok"}

    register_401 = MagicMock()
    register_401.status_code = 401
    register_401.json.return_value = {"session": "sess1", "flows": [{"stages": ["m.login.dummy"]}]}

    register_ok = MagicMock()
    register_ok.status_code = 200
    register_ok.json.return_value = {"user_id": "@alice:localhost", "access_token": "mat-tok"}

    async def mock_post(url: str, **kwargs: object) -> MagicMock:
        if "register" in url:
            if kwargs.get("json", {}).get("auth"):
                return register_ok
            return register_401
        return login_ok

    async def mock_put(url: str, **kwargs: object) -> MagicMock:
        return put_ok

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post
    mock_client.put = mock_put

    monkeypatch.setattr(main_mod.httpx, "AsyncClient", lambda: mock_client)
    return mock_client


def _token(
    sub: str,
    *,
    secret: str = "test-secret",
    aud: str = "blackout-api",
    iss: str = "blackout-auth",
    expired: bool = False,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now - timedelta(minutes=1) if expired else now + timedelta(minutes=30)
    payload = {"sub": sub, "exp": exp, "aud": aud, "iss": iss}
    return jwt.encode(payload, secret, algorithm="HS256")


def _headers(
    sub: str,
    *,
    token: str | None = None,
    matrix_token: str = "matrix-token",
) -> dict[str, str]:
    jwt_token = token or _token(sub)
    return {
        "Authorization": f"Bearer {jwt_token}",
        "X-Matrix-Access-Token": matrix_token,
    }


# ---------------------------------------------------------------------------
# Auth failure tests
# ---------------------------------------------------------------------------

def test_auth_failures(client: TestClient) -> None:
    no_auth = client.get("/v1/servers/s/members")
    assert no_auth.status_code == 401

    invalid = client.get(
        "/v1/servers/s/members",
        headers={"Authorization": "Bearer not-a-token", "X-Matrix-Access-Token": "t"},
    )
    assert invalid.status_code == 401

    missing_matrix = client.get(
        "/v1/servers/s/members", headers={"Authorization": f"Bearer {_token('u1')}"}
    )
    assert missing_matrix.status_code == 400

    expired = client.get(
        "/v1/servers/s/members",
        headers=_headers("u1", token=_token("u1", expired=True)),
    )
    assert expired.status_code == 401


# ---------------------------------------------------------------------------
# Gateway auth tests
# ---------------------------------------------------------------------------

def test_gateway_rejects_missing_token(client: TestClient) -> None:
    with pytest.raises(Exception):
        with client.websocket_connect("/gateway") as ws:
            ws.receive_json()


def test_gateway_rejects_invalid_token(client: TestClient) -> None:
    with pytest.raises(Exception):
        with client.websocket_connect("/gateway?token=not-a-jwt") as ws:
            ws.receive_json()


# ---------------------------------------------------------------------------
# User register / login
# ---------------------------------------------------------------------------

def test_user_register(client: TestClient, synapse_mock: MagicMock) -> None:
    resp = client.post(
        "/v1/users/register", json={"username": "alice", "password": "password123"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matrix_user_id"] == "@alice:localhost"
    assert data["matrix_access_token"] == "mat-tok"
    assert "token" in data
    assert "app_user_id" in data


def test_user_register_idempotent(client: TestClient, synapse_mock: MagicMock) -> None:
    # Registering the same matrix user twice should reuse the same app_user_id.
    r1 = client.post(
        "/v1/users/register", json={"username": "alice", "password": "password123"}
    )
    r2 = client.post(
        "/v1/users/register", json={"username": "alice", "password": "password123"}
    )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["app_user_id"] == r2.json()["app_user_id"]


def test_user_login(client: TestClient, synapse_mock: MagicMock) -> None:
    resp = client.post(
        "/v1/users/login", json={"username": "alice", "password": "password123"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matrix_user_id"] == "@alice:localhost"
    assert data["matrix_access_token"] == "mat-tok"
    assert "token" in data
    assert "app_user_id" in data


def test_user_login_creates_user_map_entry(
    client: TestClient, synapse_mock: MagicMock, tmp_path: Path
) -> None:
    client.post("/v1/users/login", json={"username": "alice", "password": "password123"})
    db_path = tmp_path / "blackout_api_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        count = conn.execute(text("select count(*) from user_map")).scalar_one()
    assert count == 1


def test_user_login_bad_credentials(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import blackout_api.main as main_mod

    bad_resp = MagicMock()
    bad_resp.status_code = 403
    bad_resp.json.return_value = {"errcode": "M_FORBIDDEN", "error": "Invalid password"}

    async def mock_post(url: str, **kwargs: object) -> MagicMock:
        return bad_resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    monkeypatch.setattr(main_mod.httpx, "AsyncClient", lambda: mock_client)

    resp = client.post(
        "/v1/users/login", json={"username": "alice", "password": "wrongpass"}
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Full happy-path CRUD + permission tests
# ---------------------------------------------------------------------------

def test_happy_path_all_v1_routes_and_permissions(
    client: TestClient, synapse_mock: MagicMock
) -> None:
    owner = _headers("owner")
    member = _headers("member")

    create_server = client.post(
        "/v1/servers",
        headers=owner,
        json={"matrix_space_id": "!space:example.org", "name": "Core", "description": "d"},
    )
    assert create_server.status_code == 200
    server_id = create_server.json()["app_server_id"]

    join = client.post(f"/v1/servers/{server_id}/join", headers=member, json={"role": "member"})
    assert join.status_code == 200

    members = client.get(f"/v1/servers/{server_id}/members", headers=member)
    assert members.status_code == 200
    assert len(members.json()) == 2

    patch_forbidden = client.patch(f"/v1/servers/{server_id}", headers=member, json={"name": "X"})
    assert patch_forbidden.status_code == 403

    patch_ok = client.patch(
        f"/v1/servers/{server_id}",
        headers=owner,
        json={"name": "Renamed", "description": "updated"},
    )
    assert patch_ok.status_code == 200
    assert patch_ok.json()["name"] == "Renamed"

    create_channel = client.post(
        f"/v1/servers/{server_id}/channels",
        headers=owner,
        json={"matrix_room_id": "!room:example.org", "kind": "text"},
    )
    assert create_channel.status_code == 200
    channel_id = create_channel.json()["app_channel_id"]

    get_channels = client.get(f"/v1/servers/{server_id}/channels", headers=member)
    assert get_channels.status_code == 200
    assert get_channels.json()[0]["app_channel_id"] == channel_id

    post_message = client.post(
        f"/v1/channels/{channel_id}/messages",
        headers=member,
        json={"sender_app_user_id": "member", "body": "hello"},
    )
    assert post_message.status_code == 200

    get_messages = client.get(f"/v1/channels/{channel_id}/messages", headers=member)
    assert get_messages.status_code == 200
    assert len(get_messages.json()) == 1

    update_role = client.put(
        f"/v1/servers/{server_id}/members/member/role",
        headers=owner,
        json={"role": "admin"},
    )
    assert update_role.status_code == 200

    delete_channel_forbidden = client.delete(
        f"/v1/channels/{channel_id}", headers=_headers("third")
    )
    assert delete_channel_forbidden.status_code == 403

    delete_channel = client.delete(f"/v1/channels/{channel_id}", headers=owner)
    assert delete_channel.status_code == 200

    leave = client.delete(f"/v1/servers/{server_id}/leave", headers=member)
    assert leave.status_code == 200

    delete_server_forbidden = client.delete(f"/v1/servers/{server_id}", headers=member)
    assert delete_server_forbidden.status_code == 403

    delete_server = client.delete(f"/v1/servers/{server_id}", headers=owner)
    assert delete_server.status_code == 200


# ---------------------------------------------------------------------------
# Message persistence
# ---------------------------------------------------------------------------

def test_mapping_and_message_persistence(
    client: TestClient, synapse_mock: MagicMock, tmp_path: Path
) -> None:
    owner = _headers("owner")
    create_server = client.post(
        "/v1/servers",
        headers=owner,
        json={"matrix_space_id": "!space2:example.org", "name": "Persist", "description": "d"},
    )
    server_id = create_server.json()["app_server_id"]

    create_channel = client.post(
        f"/v1/servers/{server_id}/channels",
        headers=owner,
        json={"matrix_room_id": "!room2:example.org", "kind": "text"},
    )
    channel_id = create_channel.json()["app_channel_id"]

    client.post(
        f"/v1/channels/{channel_id}/messages",
        headers=owner,
        json={"sender_app_user_id": "owner", "body": "persisted"},
    )

    db_path = tmp_path / "blackout_api_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        assert conn.execute(text("select count(*) from server_map")).scalar_one() == 1
        assert conn.execute(text("select count(*) from channel_map")).scalar_one() == 1
        assert conn.execute(text("select count(*) from membership_map")).scalar_one() == 1
        assert conn.execute(text("select count(*) from message")).scalar_one() == 1


def test_post_message_synapse_failure_returns_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import blackout_api.main as main_mod

    fail_resp = MagicMock()
    fail_resp.status_code = 403
    fail_resp.json.return_value = {"errcode": "M_FORBIDDEN"}

    async def mock_put(url: str, **kwargs: object) -> MagicMock:
        return fail_resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.put = mock_put

    monkeypatch.setattr(main_mod.httpx, "AsyncClient", lambda: mock_client)

    # Set up a server + channel directly so we can hit post_message
    owner = _headers("owner")
    create_server = client.post(
        "/v1/servers",
        headers=owner,
        json={"matrix_space_id": "!space-fail:example.org", "name": "Fail", "description": ""},
    )
    server_id = create_server.json()["app_server_id"]
    create_channel = client.post(
        f"/v1/servers/{server_id}/channels",
        headers=owner,
        json={"matrix_room_id": "!room-fail:example.org", "kind": "text"},
    )
    channel_id = create_channel.json()["app_channel_id"]

    resp = client.post(
        f"/v1/channels/{channel_id}/messages",
        headers=owner,
        json={"sender_app_user_id": "owner", "body": "boom"},
    )
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# WebSocket gateway
# ---------------------------------------------------------------------------

def test_websocket_gateway_connect_and_broadcast(
    client: TestClient, synapse_mock: MagicMock
) -> None:
    owner = _headers("owner")
    create_server = client.post(
        "/v1/servers",
        headers=owner,
        json={"matrix_space_id": "!space3:example.org", "name": "WS", "description": "d"},
    )
    server_id = create_server.json()["app_server_id"]

    create_channel = client.post(
        f"/v1/servers/{server_id}/channels",
        headers=owner,
        json={"matrix_room_id": "!room3:example.org", "kind": "text"},
    )
    channel_id = create_channel.json()["app_channel_id"]

    ws_token = _token("owner")
    with client.websocket_connect(f"/gateway?token={ws_token}") as ws:
        ws.send_text("hello")
        assert ws.receive_json()["type"] == "ack"

        client.post(
            f"/v1/channels/{channel_id}/messages",
            headers=owner,
            json={"sender_app_user_id": "owner", "body": "hi"},
        )
        broadcast = ws.receive_json()
        assert broadcast["type"] == "message.created"
        assert broadcast["channel_id"] == channel_id

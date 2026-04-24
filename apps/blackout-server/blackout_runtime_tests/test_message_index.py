import time

from blackout_runtime.message_index import (
    MessageIndexPipeline,
    SearchFilters,
    benchmark_high_volume_canopies,
)


def _acl(user_id: str) -> set[str]:
    if user_id == "@analyst:test":
        return {"ops", "alerts"}
    return {"canopy-0", "canopy-1", "ops", "alerts"}


def test_pipeline_indexes_new_edit_delete_and_attachment_metadata() -> None:
    now = int(time.time() * 1000)
    index = MessageIndexPipeline(acl_resolver=_acl)

    index.process_event(
        event_type="new",
        payload={
            "message_id": "m1",
            "text": "Canopy alpha reports thermal drift",
            "author": "@alice:test",
            "channel": "ops",
            "created_at": now,
            "updated_at": now,
            "attachments": [
                {
                    "attachment_id": "a1",
                    "filename": "report.pdf",
                    "mimetype": "application/pdf",
                    "size_bytes": 42,
                }
            ],
        },
    )
    index.process_event(
        event_type="edit",
        payload={
            "message_id": "m1",
            "text": "Canopy alpha reports thermal drift resolved",
            "author": "@alice:test",
            "channel": "ops",
            "created_at": now,
            "updated_at": now + 50,
            "attachments": [],
        },
    )

    page = index.query(
        user_id="@analyst:test",
        filters=SearchFilters(keyword="thermal", author="@alice:test", channel="ops"),
    )
    assert page.total == 1
    assert page.results[0].message_id == "m1"
    assert "<em>thermal</em>" in page.results[0].snippet.lower()

    index.process_event(
        event_type="delete",
        payload={"message_id": "m1", "deleted_at": now + 100},
    )
    page_after_delete = index.query(
        user_id="@analyst:test",
        filters=SearchFilters(keyword="thermal"),
    )
    assert page_after_delete.total == 0


def test_acl_date_range_phrase_and_pagination_filters() -> None:
    now = int(time.time() * 1000)
    index = MessageIndexPipeline(acl_resolver=_acl)

    for i in range(8):
        index.process_event(
            event_type="new",
            payload={
                "message_id": f"msg-{i}",
                "text": f"routine canopy phrase match {i}",
                "author": "@bob:test" if i % 2 == 0 else "@carol:test",
                "channel": "alerts" if i < 6 else "private",
                "created_at": now + i,
                "updated_at": now + i,
                "attachments": [],
            },
        )

    page = index.query(
        user_id="@analyst:test",
        filters=SearchFilters(
            phrase="phrase match",
            date_start=now + 1,
            date_end=now + 6,
            channel="alerts",
        ),
        page=1,
        page_size=2,
    )
    assert page.total == 5
    assert len(page.results) == 2
    assert all(hit.channel == "alerts" for hit in page.results)


def test_retention_sync_and_typo_tolerance() -> None:
    now = int(time.time() * 1000)
    index = MessageIndexPipeline(acl_resolver=_acl)

    index.process_event(
        event_type="new",
        payload={
            "message_id": "expiring",
            "text": "sensor anomaly in canopy",
            "author": "@alice:test",
            "channel": "ops",
            "created_at": now,
            "updated_at": now,
            "retention_until": now + 1,
            "attachments": [],
        },
    )

    typo_page = index.query(
        user_id="@analyst:test",
        filters=SearchFilters(keyword="anomoly"),
        typo_tolerance=True,
    )
    assert typo_page.total == 1

    removed = index.sync_retention(now_ms=now + 5)
    assert removed == 1
    post_expiry = index.query(
        user_id="@analyst:test",
        filters=SearchFilters(keyword="anomaly"),
    )
    assert post_expiry.total == 0


def test_high_volume_canopy_benchmark() -> None:
    index = MessageIndexPipeline(acl_resolver=lambda _user: {f"canopy-{i}" for i in range(30)})
    metrics = benchmark_high_volume_canopies(index=index, canopy_count=4, messages_per_canopy=180)

    assert metrics["ingested_messages"] == 720
    assert metrics["query_p50_ms"] > 0
    assert metrics["query_p95_ms"] >= metrics["query_p50_ms"]

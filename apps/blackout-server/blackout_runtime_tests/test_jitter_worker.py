from blackout_runtime.jitter_worker import JitterBatchWorker


def test_enqueue_and_flush_due_events() -> None:
    worker = JitterBatchWorker(min_delay_ms=10, max_delay_ms=20, max_batch_size=2)

    e1 = worker.enqueue(event_id="$e1", room_id="!r:test", now_ms=1000)
    e2 = worker.enqueue(event_id="$e2", room_id="!r:test", now_ms=1000)

    assert 1010 <= e1.release_at_ms <= 1020
    assert 1010 <= e2.release_at_ms <= 1020

    none_due = worker.flush_due(now_ms=1005)
    assert list(none_due) == []

    due = worker.flush_due(now_ms=2000)
    assert len(due) == 2
    assert worker.stats()["queued"] == 0


def test_flush_respects_batch_size() -> None:
    worker = JitterBatchWorker(min_delay_ms=0, max_delay_ms=0, max_batch_size=1)
    worker.enqueue(event_id="$e1", room_id="!r:test", now_ms=0)
    worker.enqueue(event_id="$e2", room_id="!r:test", now_ms=0)

    first = worker.flush_due(now_ms=0)
    second = worker.flush_due(now_ms=0)

    assert len(first) == 1
    assert len(second) == 1


def test_invalid_jitter_bounds_fail() -> None:
    try:
        JitterBatchWorker(min_delay_ms=20, max_delay_ms=10)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass

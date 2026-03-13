/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect, useMemo, useState } from "react";

import { loadTaskBoard, saveTaskBoard } from "../../../services/crdt/mutualAidBinding";
import type { TaskBoardColumn, TaskBoardDocument, TaskBoardItem } from "../models/TaskBoard";

const ROOM_ID = "!blackout-mutual-aid:local";

interface BoardEvent {
    id: string;
    itemId: string;
    action: "create" | "advance" | "assign";
    at: number;
    detail: string;
}

function moveToNextColumn(column: TaskBoardColumn): TaskBoardColumn {
    if (column === "backlog") return "in_progress";
    if (column === "in_progress") return "done";
    return "done";
}

export default function MutualAidHome(): React.JSX.Element {
    const [board, setBoard] = useState<TaskBoardDocument>({
        roomId: ROOM_ID,
        needs: [],
        offers: [],
        updatedAt: Date.now(),
    });
    const [events, setEvents] = useState<BoardEvent[]>([]);
    const [activeLane, setActiveLane] = useState<"needs" | "offers">("needs");
    const [title, setTitle] = useState("");
    const [assigneeFilter, setAssigneeFilter] = useState("");
    const [urgencyFilter, setUrgencyFilter] = useState<"all" | "urgent" | "normal">("all");

    useEffect(() => {
        loadTaskBoard(ROOM_ID).then((persisted) => {
            if (persisted) {
                setBoard(persisted);
            }
        });
    }, []);

    const items = activeLane === "needs" ? board.needs : board.offers;
    const canCreate = Boolean(title.trim());
    const filteredItems = items.filter((item) => {
        const assigneeMatches = !assigneeFilter || item.assignedToUserId === assigneeFilter;
        const urgencyMatches =
            urgencyFilter === "all" ||
            (urgencyFilter === "urgent" && item.description?.toLowerCase().includes("urgent")) ||
            (urgencyFilter === "normal" && !item.description?.toLowerCase().includes("urgent"));

        return assigneeMatches && urgencyMatches;
    });
    const grouped = useMemo(
        () => ({
            backlog: filteredItems.filter((item) => item.column === "backlog"),
            in_progress: filteredItems.filter((item) => item.column === "in_progress"),
            done: filteredItems.filter((item) => item.column === "done"),
        }),
        [filteredItems],
    );

    const handleCreate = async (): Promise<void> => {
        if (!title.trim()) return;

        const now = Date.now();
        const item: TaskBoardItem = {
            id: `${activeLane}-${now}`,
            title: title.trim(),
            description: "normal",
            column: "backlog",
            updatedAt: now,
        };

        const nextBoard = {
            ...board,
            updatedAt: now,
            needs: activeLane === "needs" ? [item, ...board.needs] : board.needs,
            offers: activeLane === "offers" ? [item, ...board.offers] : board.offers,
        };
        await saveTaskBoard(nextBoard);
        setBoard(nextBoard);
        setEvents((current) => [
            ...current,
            { id: `event-${now}`, itemId: item.id, action: "create", at: now, detail: `${activeLane} item created` },
        ]);
        setTitle("");
    };

    const handleAdvance = async (itemId: string): Promise<void> => {
        const now = Date.now();
        const update = (item: TaskBoardItem): TaskBoardItem => {
            if (item.id !== itemId || item.column === "done") {
                return item;
            }

            return { ...item, column: moveToNextColumn(item.column), updatedAt: now };
        };

        const nextBoard = {
            ...board,
            updatedAt: now,
            needs: board.needs.map(update),
            offers: board.offers.map(update),
        };
        await saveTaskBoard(nextBoard);
        setBoard(nextBoard);
        setEvents((current) => [
            ...current,
            { id: `event-${now}`, itemId, action: "advance", at: now, detail: "Column advanced" },
        ]);
    };

    return (
        <section data-testid="blackout-mutual-aid-view">
            <h2>Mutual aid board</h2>
            <p>Track needs and offers through backlog, in-progress, and done.</p>
            <p>
                Total {activeLane}: {items.length} · Visible: {filteredItems.length}
            </p>

            <div>
                <button
                    type="button"
                    onClick={() => setActiveLane("needs")}
                    data-testid="blackout-mutual-aid-needs-lane"
                >
                    Needs
                </button>
                <button
                    type="button"
                    onClick={() => setActiveLane("offers")}
                    data-testid="blackout-mutual-aid-offers-lane"
                >
                    Offers
                </button>
            </div>

            <div>
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={`New ${activeLane.slice(0, -1)} item`}
                    data-testid="blackout-mutual-aid-item-title"
                />
                <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={!canCreate}
                    data-testid="blackout-mutual-aid-create-item"
                >
                    Add {activeLane.slice(0, -1)}
                </button>
            </div>

            <div>
                <input
                    value={assigneeFilter}
                    onChange={(event) => setAssigneeFilter(event.target.value)}
                    placeholder="Filter assignee"
                />
                <select
                    value={urgencyFilter}
                    onChange={(event) => setUrgencyFilter(event.target.value as "all" | "urgent" | "normal")}
                >
                    <option value="all">All urgency</option>
                    <option value="urgent">Urgent</option>
                    <option value="normal">Normal</option>
                </select>
            </div>

            {(["backlog", "in_progress", "done"] as const).map((column) => (
                <section key={column}>
                    <h3>{column}</h3>
                    <ul data-testid={`blackout-mutual-aid-column-${column}`}>
                        {grouped[column].length === 0 && <li>No items in {column}.</li>}
                        {grouped[column].map((item) => (
                            <li key={item.id}>
                                <span>{item.title}</span>
                                {item.column !== "done" && (
                                    <button type="button" onClick={() => void handleAdvance(item.id)}>
                                        Move to {moveToNextColumn(item.column)}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            <section>
                <h3>Board audit trail</h3>
                <ul>
                    {events.map((event) => (
                        <li key={event.id}>
                            {event.action}: {event.detail}
                        </li>
                    ))}
                </ul>
            </section>
        </section>
    );
}

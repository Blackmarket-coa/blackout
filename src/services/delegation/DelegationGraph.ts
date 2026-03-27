/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface DelegationResolution {
    effectiveVoter: string;
    path: string[];
    reason: "direct_vote" | "delegation_chain";
}

export interface DelegationAuditEntry {
    id: string;
    topic: string;
    fromUserId: string;
    toUserId?: string;
    action: "set" | "clear";
    at: number;
}

export interface DelegationPolicy {
    revocationWindowMs: number;
    maxDelegationsPerUserPerHour: number;
}

const DEFAULT_POLICY: DelegationPolicy = {
    revocationWindowMs: 60_000,
    maxDelegationsPerUserPerHour: 30,
};

export class DelegationGraph {
    public static readonly GlobalTopic = "*";

    private readonly graph = new Map<string, Map<string, string>>();
    private readonly auditTrail: DelegationAuditEntry[] = [];
    private readonly lastSetByEdge = new Map<string, number>();

    public constructor(private readonly policy: DelegationPolicy = DEFAULT_POLICY) {}

    public setDelegation(topic: string, fromUserId: string, toUserId: string, now: number = Date.now()): void {
        if (fromUserId === toUserId) {
            throw new Error("Self-delegation is not allowed");
        }

        const recentChanges = this.auditTrail.filter(
            (entry) => entry.fromUserId === fromUserId && now - entry.at <= 60 * 60_000,
        );
        if (recentChanges.length >= this.policy.maxDelegationsPerUserPerHour) {
            throw new Error("Delegation change rate limit exceeded");
        }

        const topicGraph = this.getTopicGraph(topic);
        topicGraph.set(fromUserId, toUserId);

        if (this.hasCycle(topic)) {
            topicGraph.delete(fromUserId);
            throw new Error("Delegation would introduce a cycle");
        }

        this.lastSetByEdge.set(`${topic}:${fromUserId}`, now);
        this.auditTrail.push({
            id: `delegation-audit-${now}-${Math.random().toString(36).slice(2, 7)}`,
            topic,
            fromUserId,
            toUserId,
            action: "set",
            at: now,
        });
    }

    public clearDelegation(topic: string, fromUserId: string, now: number = Date.now()): void {
        const lastSetAt = this.lastSetByEdge.get(`${topic}:${fromUserId}`) ?? 0;
        if (lastSetAt > 0 && now - lastSetAt > this.policy.revocationWindowMs) {
            throw new Error("Delegation revocation window has elapsed");
        }

        this.getTopicGraph(topic).delete(fromUserId);
        this.auditTrail.push({
            id: `delegation-audit-${now}-${Math.random().toString(36).slice(2, 7)}`,
            topic,
            fromUserId,
            action: "clear",
            at: now,
        });
    }

    public hasCycle(topic: string): boolean {
        const topicGraph = this.getTopicGraph(topic);
        const visited = new Set<string>();
        const inStack = new Set<string>();

        const visit = (node: string): boolean => {
            if (inStack.has(node)) return true;
            if (visited.has(node)) return false;

            visited.add(node);
            inStack.add(node);

            const next = topicGraph.get(node);
            if (next && visit(next)) {
                return true;
            }

            inStack.delete(node);
            return false;
        };

        for (const node of topicGraph.keys()) {
            if (visit(node)) {
                return true;
            }
        }

        return false;
    }

    public resolve(topic: string, userId: string, directVoterIds: Set<string>): DelegationResolution {
        if (directVoterIds.has(userId)) {
            return {
                effectiveVoter: userId,
                path: [userId],
                reason: "direct_vote",
            };
        }

        const path = [userId];
        const seen = new Set(path);
        let current = this.resolveNextDelegate(topic, userId);
        while (current) {
            path.push(current);
            if (directVoterIds.has(current)) {
                return {
                    effectiveVoter: current,
                    path,
                    reason: "delegation_chain",
                };
            }
            if (seen.has(current)) {
                break;
            }

            seen.add(current);
            current = this.resolveNextDelegate(topic, current);
        }

        return {
            effectiveVoter: userId,
            path: [userId],
            reason: "direct_vote",
        };
    }

    public getAuditTrail(): DelegationAuditEntry[] {
        return [...this.auditTrail];
    }

    public toDocument(
        topic: string,
        now: number = Date.now(),
    ): { schemaVersion: number; topic: string; delegationsByUserId: Record<string, string>; updatedAt: number } {
        return {
            schemaVersion: 1,
            topic,
            delegationsByUserId: Object.fromEntries(this.getTopicGraph(topic).entries()),
            updatedAt: now,
        };
    }

    public hydrateFromDocument(topic: string, delegationsByUserId: Record<string, string>): void {
        const topicGraph = this.getTopicGraph(topic);
        topicGraph.clear();
        for (const [from, to] of Object.entries(delegationsByUserId)) {
            topicGraph.set(from, to);
        }
    }

    private getTopicGraph(topic: string): Map<string, string> {
        let topicGraph = this.graph.get(topic);
        if (!topicGraph) {
            topicGraph = new Map();
            this.graph.set(topic, topicGraph);
        }

        return topicGraph;
    }

    private resolveNextDelegate(topic: string, userId: string): string | undefined {
        const topicDelegate = this.getTopicGraph(topic).get(userId);
        if (topicDelegate) {
            return topicDelegate;
        }

        if (topic === DelegationGraph.GlobalTopic) {
            return undefined;
        }

        return this.getTopicGraph(DelegationGraph.GlobalTopic).get(userId);
    }
}

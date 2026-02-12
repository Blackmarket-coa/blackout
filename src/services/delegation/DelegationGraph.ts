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

export class DelegationGraph {
    private readonly graph = new Map<string, Map<string, string>>();

    public setDelegation(topic: string, fromUserId: string, toUserId: string): void {
        if (fromUserId === toUserId) {
            throw new Error("Self-delegation is not allowed");
        }

        const topicGraph = this.getTopicGraph(topic);
        topicGraph.set(fromUserId, toUserId);

        if (this.hasCycle(topic)) {
            topicGraph.delete(fromUserId);
            throw new Error("Delegation would introduce a cycle");
        }
    }

    public clearDelegation(topic: string, fromUserId: string): void {
        this.getTopicGraph(topic).delete(fromUserId);
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

        const topicGraph = this.getTopicGraph(topic);
        const path = [userId];
        const seen = new Set(path);

        let current = topicGraph.get(userId);
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
            current = topicGraph.get(current);
        }

        return {
            effectiveVoter: userId,
            path: [userId],
            reason: "direct_vote",
        };
    }

    private getTopicGraph(topic: string): Map<string, string> {
        let topicGraph = this.graph.get(topic);
        if (!topicGraph) {
            topicGraph = new Map();
            this.graph.set(topic, topicGraph);
        }

        return topicGraph;
    }
}

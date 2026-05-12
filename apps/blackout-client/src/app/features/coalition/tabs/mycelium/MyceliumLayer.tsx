import React, { useMemo, useState } from 'react';
import {
    layoutMycelium,
    type MyceliumGraph,
    type MyceliumLayoutNode,
} from '../../../../../lib/bmc-core';
import { PLAYBOOK_ACCENT_TOKENS } from '../../../../styles/playbookTokens';

/**
 * SVG constellation overlay — the federation map's headline visual.
 *
 * Single-zoom, tap-to-reveal per the plan. v1 keeps the rendering
 * geometry simple (radial placement around the centre) and trades the
 * full "breathing" ambient animation for a still constellation; the
 * breathing pass and PMTiles backdrop are deferred.
 */
export interface MyceliumLayerProps {
    graph: MyceliumGraph;
    /** Layout box. Defaults to 480 × 360. */
    width?: number;
    height?: number;
    /** Tap-to-reveal callback. */
    onSelectNode?: (nodeId: string) => void;
}

const NODE_FILL = PLAYBOOK_ACCENT_TOKENS.moss.solid;
const NODE_HALO = PLAYBOOK_ACCENT_TOKENS.moss.soft;
const NODE_INK = PLAYBOOK_ACCENT_TOKENS.moss.ink;
const HYPHA = PLAYBOOK_ACCENT_TOKENS.lichen.solid;

export function MyceliumLayer({
    graph,
    width = 480,
    height = 360,
    onSelectNode,
}: MyceliumLayerProps) {
    const [hover, setHover] = useState<string | null>(null);

    const layout: MyceliumLayoutNode[] = useMemo(
        () => layoutMycelium(graph, { width, height }),
        [graph, width, height],
    );

    const positionById = useMemo(() => {
        const map = new Map<string, MyceliumLayoutNode>();
        for (const node of layout) map.set(node.id, node);
        return map;
    }, [layout]);

    if (layout.length === 0) {
        return (
            <p
                style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}
                data-testid="mycelium-empty"
            >
                No canopies in this constellation yet.
            </p>
        );
    }

    const maxEdgeWeight = Math.max(1, ...graph.edges.map((e) => e.weight));

    return (
        <svg
            data-testid="mycelium-layer"
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height="100%"
            role="img"
            aria-label="Federation constellation"
        >
            {graph.edges.map((edge) => {
                const a = positionById.get(edge.a);
                const b = positionById.get(edge.b);
                if (!a || !b) return null;
                const opacity = Math.min(0.6, 0.15 + (edge.weight / maxEdgeWeight) * 0.45);
                const strokeWidth = 0.75 + (edge.weight / maxEdgeWeight) * 1.5;
                return (
                    <line
                        key={`${edge.a}↔${edge.b}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={HYPHA}
                        strokeWidth={strokeWidth}
                        strokeOpacity={opacity}
                        strokeLinecap="round"
                    />
                );
            })}
            {layout.map((node) => {
                const focused = hover === node.id;
                return (
                    <g
                        key={node.id}
                        data-testid={`mycelium-node-${node.id}`}
                        onMouseEnter={() => setHover(node.id)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onSelectNode?.(node.id)}
                        style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                    >
                        <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.radius + (focused ? 3 : 1.5)}
                            fill={NODE_HALO}
                        />
                        <circle
                            cx={node.x}
                            cy={node.y}
                            r={node.radius}
                            fill={NODE_FILL}
                            stroke={NODE_INK}
                            strokeWidth={focused ? 1.5 : 0.75}
                        />
                        <text
                            x={node.x}
                            y={node.y + node.radius + 12}
                            textAnchor="middle"
                            fontSize="11"
                            fill="var(--text-primary)"
                        >
                            {node.label} · {node.memberCount}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default MyceliumLayer;

import { useEffect, useRef } from 'react';
import * as css from './EcosystemCanvas.css';

interface EcosystemCanvasProps {
    /** Warm/cool node+line colour, usually the time-of-day glow. */
    glow: string;
    /** Scales node count with how much is happening in the feed. */
    activity: number;
    reducedMotion: boolean;
}

interface Node {
    x: number;
    y: number;
    vx: number;
    vy: number;
    phase: number;
}

const MIN_NODES = 8;
const MAX_NODES = 20;
const LINK_DISTANCE = 180;

/**
 * Faint "community nervous system" layer: a handful of drifting nodes joined by
 * connection lines that fade with distance, each node gently pulsing. Cheap and
 * decorative — it draws nothing when motion is reduced or the canvas 2D context
 * is unavailable (jsdom), and pauses while the tab is hidden.
 */
export const EcosystemCanvas = ({
    glow,
    activity,
    reducedMotion,
}: EcosystemCanvasProps): JSX.Element | null => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (reducedMotion) return undefined;
        const canvas = canvasRef.current;
        // jsdom has no canvas backend — `getContext` may return null or throw.
        let ctx: CanvasRenderingContext2D | null = null;
        try {
            ctx = canvas?.getContext?.('2d') ?? null;
        } catch {
            ctx = null;
        }
        if (!canvas || !ctx) return undefined;
        if (typeof window.requestAnimationFrame !== 'function') return undefined;

        const count = Math.max(MIN_NODES, Math.min(MAX_NODES, MIN_NODES + Math.round(activity)));
        let width = 0;
        let height = 0;
        let nodes: Node[] = [];
        let frame = 0;

        const seed = () => {
            nodes = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.18,
                vy: (Math.random() - 0.5) * 0.18,
                phase: Math.random() * Math.PI * 2,
            }));
        };

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = rect.width;
            height = rect.height;
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (nodes.length === 0) seed();
        };

        const draw = (t: number) => {
            ctx.clearRect(0, 0, width, height);
            for (const node of nodes) {
                node.x += node.vx;
                node.y += node.vy;
                if (node.x < 0 || node.x > width) node.vx *= -1;
                if (node.y < 0 || node.y > height) node.vy *= -1;
            }
            for (let i = 0; i < nodes.length; i += 1) {
                for (let j = i + 1; j < nodes.length; j += 1) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > LINK_DISTANCE) continue;
                    const strength = 1 - dist / LINK_DISTANCE;
                    ctx.strokeStyle = glow;
                    ctx.globalAlpha = strength * 0.25;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }
            for (const node of nodes) {
                const pulse = 1.6 + Math.sin(t / 900 + node.phase) * 0.9;
                ctx.fillStyle = glow;
                ctx.globalAlpha = 0.55;
                ctx.beginPath();
                ctx.arc(node.x, node.y, Math.max(0.6, pulse), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            frame = window.requestAnimationFrame(draw);
        };

        const start = () => {
            if (!frame) frame = window.requestAnimationFrame(draw);
        };
        const stop = () => {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
        };
        const onVisibility = () => (document.hidden ? stop() : start());

        resize();
        start();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [glow, activity, reducedMotion]);

    if (reducedMotion) return null;
    return (
        <canvas
            ref={canvasRef}
            className={css.canvas}
            aria-hidden="true"
            data-testid="home-ecosystem-canvas"
        />
    );
};

export default EcosystemCanvas;

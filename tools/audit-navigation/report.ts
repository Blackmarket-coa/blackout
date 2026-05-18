import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { AuditCategory, AuditFinding, AuditReport } from './types';
import { summarize } from './types';

const CATEGORY_LABEL: Record<AuditCategory, string> = {
    'home-button': 'Home button visible',
    'dead-end': 'No dead ends',
    'back-navigation': 'Back navigation works',
    'modal-closure': 'Modals close',
    'responsive-layout': 'Responsive layouts render',
    overflow: 'No hidden overflow',
};

const SEVERITY_ICON = { error: '❌', warning: '⚠️', info: 'ℹ️' } as const;

export const renderMarkdown = (report: AuditReport): string => {
    const { errors, warnings, total } = summarize(report);
    const lines: string[] = [];
    lines.push(`# Navigation audit (${report.target})`);
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    if (report.baseUrl) lines.push(`Base URL: \`${report.baseUrl}\``);
    lines.push(`Routes inspected: ${report.routes.length}`);
    lines.push(
        `Findings: ${total} total — ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${
            warnings === 1 ? '' : 's'
        }`
    );
    lines.push('');

    if (total === 0) {
        lines.push('All invariants passed across every route and viewport. 🎉');
        return lines.join('\n');
    }

    const byCategory = new Map<AuditCategory, AuditFinding[]>();
    for (const finding of report.findings) {
        const bucket = byCategory.get(finding.category) ?? [];
        bucket.push(finding);
        byCategory.set(finding.category, bucket);
    }

    for (const [category, findings] of byCategory) {
        lines.push(`## ${CATEGORY_LABEL[category]} (${findings.length})`);
        lines.push('');
        lines.push('| Severity | Route | Viewport | Detail |');
        lines.push('| --- | --- | --- | --- |');
        for (const f of findings) {
            const detail = f.locator ? `${f.message} \`${f.locator}\`` : f.message;
            lines.push(
                `| ${SEVERITY_ICON[f.severity]} ${f.severity} | \`${f.route}\` | ${
                    f.viewport ?? '—'
                } | ${detail} |`
            );
        }
        lines.push('');
    }

    if (report.cleanRoutes.length > 0) {
        lines.push(`<details><summary>${report.cleanRoutes.length} clean routes</summary>`);
        lines.push('');
        for (const route of report.cleanRoutes) lines.push(`- \`${route}\``);
        lines.push('');
        lines.push('</details>');
    }

    return lines.join('\n');
};

export const writeReports = async (
    outDir: string,
    name: string,
    report: AuditReport
): Promise<{ jsonPath: string; markdownPath: string }> => {
    const jsonPath = resolve(outDir, `${name}-report.json`);
    const markdownPath = resolve(outDir, `${name}-report.md`);
    await mkdir(dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(markdownPath, renderMarkdown(report), 'utf8');
    return { jsonPath, markdownPath };
};

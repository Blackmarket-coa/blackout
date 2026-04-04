interface BugReportFabProps {
  open: boolean;
  issue: string;
  steps: string;
  suggestions: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderBugReportFab({ open, issue, steps, suggestions }: BugReportFabProps): string {
  const safeIssue = escapeHtml(issue);
  const safeSteps = escapeHtml(steps);
  const safeSuggestions = escapeHtml(suggestions);
  return `
    <button type="button" class="bug-report-fab" data-action="open-bug-report" aria-label="Report a bug" title="Report a bug">🐛</button>
    ${open ? `<div class="bug-report-modal-backdrop" data-action="close-bug-report">
      <section class="bug-report-modal" role="dialog" aria-modal="true" aria-label="Report a bug">
        <header>
          <h3>Report a bug</h3>
          <p class="meta">Share what happened and we’ll use it to improve Blackout.</p>
        </header>
        <form data-action="submit-bug-report">
          <label>Describe the issue*
            <textarea required rows="4" data-action="bug-report-issue" placeholder="What went wrong?">${safeIssue}</textarea>
          </label>
          <label>Steps to reproduce
            <textarea rows="3" data-action="bug-report-steps" placeholder="1) ... 2) ... 3) ...">${safeSteps}</textarea>
          </label>
          <label>Suggestions
            <textarea rows="3" data-action="bug-report-suggestions" placeholder="What would make this better?">${safeSuggestions}</textarea>
          </label>
          <div class="bug-report-modal-actions">
            <button type="button" class="ghost-btn" data-action="close-bug-report">Cancel</button>
            <button type="submit">Send report</button>
          </div>
        </form>
      </section>
    </div>` : ""}
  `;
}

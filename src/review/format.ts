import type {
  ReviewFinding,
  ReviewReport,
  ReviewSection,
  ReviewSeverity,
} from "./types.js";

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function renderReviewReport(
  report: Omit<ReviewReport, "rendered">,
): string {
  const lines: string[] = [
    `Pull request: ${report.metadata.pullRequestTitle}`,
    `Summary: ${report.summary}`,
    `Mode: ${report.metadata.mode}`,
    `Reviewer: ${report.metadata.provider}${report.metadata.model ? ` (${report.metadata.model})` : ""}`,
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("Findings: none");
  } else {
    lines.push("Findings:");
    report.findings.forEach((finding, index) => {
      lines.push(`${index + 1}. ${formatFinding(finding)}`);
    });
  }

  for (const section of report.sections) {
    lines.push("");
    lines.push(`${section.title}: ${section.summary}`);
    if (section.notes.length > 0) {
      section.notes.forEach((note) => lines.push(`- ${note}`));
    }
  }

  return lines.join("\n");
}

function formatFinding(finding: ReviewFinding): string {
  const location =
    finding.file !== undefined
      ? `${finding.file}${finding.line !== undefined ? `:${finding.line}` : ""}`
      : "workspace";

  return `[${finding.severity.toUpperCase()}] ${location} ${finding.title} - ${finding.detail}`;
}

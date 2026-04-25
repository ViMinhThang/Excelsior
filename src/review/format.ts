import type { ReviewFinding, ReviewReport, ReviewSection, ReviewSeverity } from "./types.js";

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function dedupeAndSortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const uniqueFindings = new Map<string, ReviewFinding>();

  for (const finding of findings) {
    const key = [
      finding.source,
      finding.severity,
      finding.file ?? "-",
      finding.line ?? "-",
      finding.title,
      finding.detail,
    ].join("|");

    if (!uniqueFindings.has(key)) {
      uniqueFindings.set(key, finding);
    }
  }

  return [...uniqueFindings.values()].sort((left, right) => {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return `${left.file ?? ""}${left.title}`.localeCompare(`${right.file ?? ""}${right.title}`);
  });
}

export function buildSummary(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "No concrete review findings were detected in the scanned diff.";
  }

  const counts = {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };

  return `Found ${findings.length} issue(s): ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;
}

export function renderReviewReport(report: Omit<ReviewReport, "rendered">): string {
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

export function flattenSectionFindings(sections: ReviewSection[]): ReviewFinding[] {
  return sections.flatMap((section) => section.findings);
}

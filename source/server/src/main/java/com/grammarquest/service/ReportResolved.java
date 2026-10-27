package com.grammarquest.service;

/** Published inside the decision transaction; notification is delivered only after commit. */
public record ReportResolved(
    long targetId,
    long reporterId,
    String source,
    long reportId,
    String decision
) {}

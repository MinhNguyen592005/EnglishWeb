package com.grammarquest.service;

import java.util.*;

/** Derives grades from immutable attempts; starting a retry never replaces a grade. */
public final class AssignmentResults {

    private AssignmentResults() {}

    public static List<Map<String, Object>> summarize(
        List<Map<String, Object>> rows,
        boolean teacher
    ) {
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (var row : rows)
            groups
                .computeIfAbsent(row.get("assignmentId") + ":" + row.get("userId"), key ->
                    new ArrayList<>()
                )
                .add(row);
        List<Map<String, Object>> results = new ArrayList<>();
        for (var history : groups.values()) {
            var latest = history.getLast();
            var completed = history
                .stream()
                .filter(r -> r.get("completedAt") != null)
                .toList();
            var eligible = completed
                .stream()
                .filter(r -> truth(r.get("eligible")))
                .toList();
            var best = eligible
                .stream()
                .max(Comparator.comparingDouble(AssignmentResults::score))
                .orElse(null);
            var first = completed.isEmpty() ? null : completed.getFirst();
            var firstPass = eligible
                .stream()
                .filter(r -> truth(r.get("passed")))
                .findFirst()
                .orElse(null);
            var result = new LinkedHashMap<>(teacher && best != null ? best : latest);
            if (teacher && best == null) {
                result.put("status", "IN_PROGRESS");
                result.put("correctCount", 0);
                result.put("completedAt", null);
            }
            result.put("passed", firstPass != null);
            result.put("attemptCount", history.size());
            result.put("completedCount", completed.size());
            result.put("bestAttempt", best);
            result.put("firstAttempt", first);
            result.put("latestAttempt", latest);
            result.put("firstPassedAt", firstPass == null ? null : firstPass.get("completedAt"));
            result.put("history", history);
            results.add(result);
        }
        return results;
    }

    private static boolean truth(Object value) {
        return Boolean.TRUE.equals(value) || (value instanceof Number n && n.intValue() != 0);
    }

    private static double score(Map<String, Object> row) {
        int total = ((Number) row.get("totalQuestions")).intValue();
        return total == 0 ? 0 : ((Number) row.get("correctCount")).doubleValue() / total;
    }
}

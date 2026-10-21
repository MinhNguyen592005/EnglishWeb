package com.grammarquest.repository;

/** Roadmap projection: deliberately excludes the potentially large theory TEXT. */
public record LessonOutline(Long id,String topicSlug,int ordinalNo,String title,String summary,String difficulty) {}

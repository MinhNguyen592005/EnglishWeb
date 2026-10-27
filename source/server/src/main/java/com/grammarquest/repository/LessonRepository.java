package com.grammarquest.repository;
import com.grammarquest.entity.Lesson;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface LessonRepository extends JpaRepository<Lesson,Long> {
    @org.springframework.data.jpa.repository.Query("select new com.grammarquest.repository.LessonOutline(l.id,l.topicSlug,l.ordinalNo,l.title,l.summary,l.difficulty) from Lesson l where l.published=true order by l.ordinalNo")
    List<LessonOutline> roadmapLessons();
    List<Lesson> findByPublishedTrueOrderByOrdinalNoAsc();
}

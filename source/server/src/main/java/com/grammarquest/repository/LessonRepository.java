package com.grammarquest.repository;
import com.grammarquest.entity.Lesson;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface LessonRepository extends JpaRepository<Lesson,Long> {
    List<Lesson> findByPublishedTrueOrderByOrdinalNoAsc();
}

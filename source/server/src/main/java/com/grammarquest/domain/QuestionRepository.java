package com.grammarquest.domain;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface QuestionRepository extends JpaRepository<Question,Long> {
    List<Question> findByLessonIdAndPublishedTrue(Long lessonId);
    List<Question> findByPublishedTrue();
    List<Question> findByLessonIdAndOwnerIdAndTeacherActiveTrue(Long lessonId, Long ownerId);
}

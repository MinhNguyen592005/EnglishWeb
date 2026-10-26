package com.grammarquest.repository;
import com.grammarquest.entity.Question;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface QuestionRepository extends JpaRepository<Question,Long> {
    @org.springframework.data.jpa.repository.Query("select q from Question q where q.lessonId=?1 and q.published=true and q.deleted=false and q.adminBlocked=false and q.ownerId is null")
    List<Question> findByLessonIdAndPublishedTrue(Long lessonId);
    @org.springframework.data.jpa.repository.Query("select q from Question q where q.published=true and q.deleted=false and q.adminBlocked=false and q.ownerId is null")
    List<Question> findByPublishedTrue();
    @org.springframework.data.jpa.repository.Query("select q from Question q where q.lessonId=?1 and q.ownerId=?2 and q.teacherActive=true and q.deleted=false and q.adminBlocked=false")
    List<Question> findByLessonIdAndOwnerIdAndTeacherActiveTrue(Long lessonId, Long ownerId);
}

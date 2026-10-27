package com.grammarquest.repository;

import com.grammarquest.entity.Attempt;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AttemptRepository extends JpaRepository<Attempt, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Attempt a where a.id = :id")
    Optional<Attempt> findWithLockById(@Param("id") Long id);

    List<Attempt> findByUserIdAndStatusAndKindOrderByCompletedAtDesc(
        Long userId,
        String status,
        String kind
    );

    @Query(
        "select distinct a.lessonId from Attempt a where a.userId = :userId and a.status = 'WON' and a.kind = 'LESSON_BOSS' and a.lessonId is not null"
    )
    List<Long> completedLessonIds(@Param("userId") Long userId);

    List<Attempt> findTop20ByUserIdOrderByIdDesc(Long userId);
}

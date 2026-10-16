package com.grammarquest.domain;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface AttemptRepository extends JpaRepository<Attempt,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Attempt a where a.id = :id") Optional<Attempt> findWithLockById(@Param("id") Long id);
    List<Attempt> findByUserIdAndStatusAndKindOrderByCompletedAtDesc(Long userId, String status, String kind);
    List<Attempt> findTop20ByUserIdOrderByIdDesc(Long userId);
}

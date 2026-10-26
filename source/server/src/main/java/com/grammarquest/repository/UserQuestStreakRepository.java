package com.grammarquest.repository;

import com.grammarquest.entity.UserQuestStreak;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserQuestStreakRepository extends JpaRepository<UserQuestStreak, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select s from UserQuestStreak s where s.userId = :userId")
    java.util.Optional<UserQuestStreak> findWithLockByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);
}

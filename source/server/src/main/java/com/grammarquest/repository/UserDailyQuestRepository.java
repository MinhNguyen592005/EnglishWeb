package com.grammarquest.repository;

import com.grammarquest.entity.UserDailyQuest;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserDailyQuestRepository extends JpaRepository<UserDailyQuest, Long> {
    List<UserDailyQuest> findByUserIdAndQuestDate(Long userId, LocalDate questDate);
    Optional<UserDailyQuest> findByUserIdAndQuestIdAndQuestDate(
        Long userId,
        Integer questId,
        LocalDate questDate
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from UserDailyQuest q where q.id = :id")
    Optional<UserDailyQuest> findWithLockById(@Param("id") Long id);
}

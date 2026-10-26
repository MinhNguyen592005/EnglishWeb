package com.grammarquest.repository;

import com.grammarquest.entity.UserDailyQuest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface UserDailyQuestRepository extends JpaRepository<UserDailyQuest, Long> {
    List<UserDailyQuest> findByUserIdAndQuestDate(Long userId, LocalDate questDate);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from UserDailyQuest q where q.userId = :userId and q.questDate = :questDate order by q.id")
    List<UserDailyQuest> findWithLockByUserIdAndQuestDate(@Param("userId") Long userId, @Param("questDate") LocalDate questDate);
    Optional<UserDailyQuest> findByUserIdAndQuestIdAndQuestDate(Long userId, Integer questId, LocalDate questDate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from UserDailyQuest q where q.id = :id")
    Optional<UserDailyQuest> findWithLockById(@Param("id") Long id);
}

package com.grammarquest.repository;

import com.grammarquest.entity.UserQuestStreak;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserQuestStreakRepository extends JpaRepository<UserQuestStreak, Long> {
}

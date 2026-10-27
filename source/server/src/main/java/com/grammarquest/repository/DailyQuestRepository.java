package com.grammarquest.repository;

import com.grammarquest.entity.DailyQuest;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyQuestRepository extends JpaRepository<DailyQuest, Integer> {
    List<DailyQuest> findByActiveTrue();
    List<DailyQuest> findByTierAndActiveTrue(String tier);
    Optional<DailyQuest> findByCode(String code);
}

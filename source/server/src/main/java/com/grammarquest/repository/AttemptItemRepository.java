package com.grammarquest.repository;

import com.grammarquest.entity.AttemptItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttemptItemRepository extends JpaRepository<AttemptItem, Long> {
    List<AttemptItem> findByAttemptIdOrderByOrdinalNoAsc(Long attemptId);
}

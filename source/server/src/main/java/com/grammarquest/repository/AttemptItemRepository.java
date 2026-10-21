package com.grammarquest.repository;
import com.grammarquest.entity.AttemptItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface AttemptItemRepository extends JpaRepository<AttemptItem,Long> {
    List<AttemptItem> findByAttemptIdOrderByOrdinalNoAsc(Long attemptId);
}

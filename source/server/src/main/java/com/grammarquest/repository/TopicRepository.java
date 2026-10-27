package com.grammarquest.repository;

import com.grammarquest.entity.Topic;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TopicRepository extends JpaRepository<Topic, String> {
    List<Topic> findByPublishedTrueOrderBySortOrderAscSlugAsc();
}

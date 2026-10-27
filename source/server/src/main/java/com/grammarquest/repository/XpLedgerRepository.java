package com.grammarquest.repository;

import com.grammarquest.entity.XpLedger;
import org.springframework.data.jpa.repository.JpaRepository;

public interface XpLedgerRepository extends JpaRepository<XpLedger, Long> {
    @org.springframework.data.jpa.repository.Query(
        "select x.rewardKey from XpLedger x where x.userId = :userId"
    )
    java.util.List<String> rewardKeys(
        @org.springframework.data.repository.query.Param("userId") Long userId
    );

    boolean existsByUserIdAndRewardKey(Long userId, String rewardKey);
}

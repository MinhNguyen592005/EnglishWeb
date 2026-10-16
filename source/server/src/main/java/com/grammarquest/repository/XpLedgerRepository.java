package com.grammarquest.repository;
import com.grammarquest.entity.XpLedger;
import org.springframework.data.jpa.repository.JpaRepository;
public interface XpLedgerRepository extends JpaRepository<XpLedger,Long> {
    boolean existsByUserIdAndRewardKey(Long userId, String rewardKey);
}

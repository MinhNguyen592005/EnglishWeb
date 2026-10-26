package com.grammarquest.repository;
import com.grammarquest.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;
public interface UserRepository extends JpaRepository<User,Long> {
    Optional<User> findByUsernameIgnoreCase(String username);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where lower(u.username) = lower(:username)")
    Optional<User> findWithLockByUsernameIgnoreCase(@Param("username") String username);
    boolean existsByUsernameIgnoreCase(String username);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select u from User u where u.id = :id") Optional<User> findWithLockById(@Param("id") Long id);
}

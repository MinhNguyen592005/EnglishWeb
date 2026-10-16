package com.grammarquest.controller;

import com.grammarquest.entity.User;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.*;

@RestController @RequestMapping("/api/v1/teacher")
public class TeacherDashboardController {
    private final JdbcTemplate db;
    private final UserRepository users;
    public TeacherDashboardController(JdbcTemplate db,UserRepository users){this.db=db;this.users=users;}
    @GetMapping("/overview") public Map<String,Object> overview(Authentication auth) {
        User user=users.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
        if(user.locked||!user.role.equals("TEACHER"))
            throw new ApiException(HttpStatus.FORBIDDEN,"TEACHER_ONLY","Chỉ giáo viên được phép xem");
        return Map.of(
            "classes",db.queryForObject("select count(*) from classrooms where teacher_id=?",Integer.class,user.id),
            "students",db.queryForObject("select count(distinct m.user_id) from class_members m join users student on student.id=m.user_id and student.role='LEARNER' join classrooms c on c.id=m.class_id where c.teacher_id=?",Integer.class,user.id),
            "openAssignments",db.queryForObject("select count(*) from assignments a join classrooms c on c.id=a.class_id where c.teacher_id=? and a.status='PUBLISHED' and a.due_at>current_timestamp",Integer.class,user.id),
            "questions",db.queryForObject("select count(*) from questions where owner_id=?",Integer.class,user.id),
            "recent",db.queryForList("select a.id,a.class_id as classId,c.name as className,a.title,a.due_at as dueAt,a.status,(select count(*) from class_members m join users student on student.id=m.user_id and student.role='LEARNER' where m.class_id=c.id) as students,(select count(distinct att.user_id) from assignment_attempts aa join attempts att on att.id=aa.attempt_id join class_members m on m.class_id=c.id and m.user_id=att.user_id join users student on student.id=att.user_id and student.role='LEARNER' where aa.assignment_id=a.id and att.status<>'IN_PROGRESS') as submitted from assignments a join classrooms c on c.id=a.class_id where c.teacher_id=? order by a.id desc limit 10",user.id)
        );
    }
}

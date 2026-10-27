package com.grammarquest.service;

import com.grammarquest.GrammarQuestApplication;
import com.grammarquest.controller.ClassroomController;
import com.grammarquest.controller.TeacherMaterialController;
import com.grammarquest.entity.User;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import java.sql.DriverManager;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real Flyway/MySQL in a fresh disposable schema; no application database is changed. */
@EnabledIfEnvironmentVariable(named="RUN_MATERIAL_TEST",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TeacherMaterialIntegrationTest {
    final String schema="grammar_quest_material_"+UUID.randomUUID().toString().replace("-","").substring(0,12)+"_test";
    String dbUser,dbPassword;
    ServletWebServerApplicationContext app;

    @BeforeAll void boot() throws Exception {
        dbUser=Objects.requireNonNull(System.getenv("DB_USERNAME"));dbPassword=Objects.requireNonNull(System.getenv("DB_PASSWORD"));
        assertTrue(schema.matches("grammar_quest_material_[0-9a-f]{12}_test"));
        try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()) {
            s.executeUpdate("CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        }
        app=(ServletWebServerApplicationContext)new SpringApplicationBuilder(GrammarQuestApplication.class).run(
            "--spring.profiles.active=test","--DB_TEST_NAME="+schema,"--server.port=0",
            "--spring.datasource.url=jdbc:mysql://127.0.0.1:3306/"+schema,
            "--spring.datasource.username="+dbUser,"--spring.datasource.password="+dbPassword,
            "--app.seed-demo=false","--spring.main.banner-mode=off","--debug=false","--logging.level.root=WARN");
    }
    @AfterAll void cleanup() throws Exception {
        if(app!=null)app.close();
        if(dbUser!=null&&schema.matches("grammar_quest_material_[0-9a-f]{12}_test"))
            try(var c=DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/",dbUser,dbPassword);var s=c.createStatement()) {s.executeUpdate("DROP DATABASE IF EXISTS `"+schema+"`");}
    }
    @Test void teacherCreatesOwnContentAndReusesItWithoutRoadmapOrChangingPublishedAssignments() {
        var users=app.getBean(UserRepository.class);var db=app.getBean(JdbcTemplate.class);
        var materials=app.getBean(TeacherMaterialController.class);var classes=app.getBean(ClassroomController.class);
        User teacher=new User("material_owner","Teacher","hash");teacher.role="TEACHER";users.save(teacher);
        User other=new User("material_other","Other teacher","hash");other.role="TEACHER";users.save(other);
        User learner=new User("material_learner","Learner","hash");users.save(learner);
        var ownerAuth=new UsernamePasswordAuthenticationToken(teacher.username,"n/a");
        var otherAuth=new UsernamePasswordAuthenticationToken(other.username,"n/a");
        var learnerAuth=new UsernamePasswordAuthenticationToken(learner.username,"n/a");
        assertTrue(materials.list(ownerAuth).isEmpty(),"No material is seeded for a new teacher");
        int roadmapLessons=db.queryForObject("select count(*) from lessons",Integer.class);
        var first=new TeacherMaterialController.Draft("She ___ to school.","go","goes","going","gone","B","Third person singular.","MCQ",null);
        var second=new TeacherMaterialController.Draft("They have lived here ___ 2020.","","","","","A","Since precedes a year.","FILL_BLANK","since");
        var created=materials.create(ownerAuth,new TeacherMaterialController.Body("Teacher's Unit 1","Own uploaded content",List.of(first,second)));
        long materialId=((Number)created.get("id")).longValue();
        assertEquals(2,((Number)created.get("questionCount")).intValue());
        assertEquals(roadmapLessons,db.queryForObject("select count(*) from lessons",Integer.class));
        assertEquals(2,db.queryForObject("select count(*) from questions where material_id=? and lesson_id is null",Integer.class,materialId));
        assertTrue(materials.list(otherAuth).isEmpty());
        assertThrows(ApiException.class,()->materials.detail(otherAuth,materialId));
        var classA=classes.create(ownerAuth,new ClassroomController.NewClass("Material class A"));
        var classB=classes.create(ownerAuth,new ClassroomController.NewClass("Material class B"));
        long a=((Number)classA.get("id")).longValue(),b=((Number)classB.get("id")).longValue();
        Instant due=Instant.now().plusSeconds(86400);
        var assignmentA=classes.assign(ownerAuth,a,new ClassroomController.NewAssignment("Homework A",null,"Read carefully",80,due,null,materialId));
        var assignmentB=classes.assign(ownerAuth,b,new ClassroomController.NewAssignment("Homework B",null,"",80,due.plusSeconds(3600),null,materialId));
        long assignmentId=((Number)assignmentA.get("id")).longValue();
        assertNotEquals(assignmentId,((Number)assignmentB.get("id")).longValue());
        assertNull(assignmentA.get("lessonId"));
        String snapshot=db.queryForObject("select question_snapshot_json from assignments where id=?",String.class,assignmentId);
        materials.update(ownerAuth,materialId,new TeacherMaterialController.Body("Updated title","",List.of(second)));
        assertEquals(snapshot,db.queryForObject("select question_snapshot_json from assignments where id=?",String.class,assignmentId));
        classes.join(learnerAuth,new ClassroomController.Join(classA.get("joinCode").toString()));
        var attempt=classes.start(learnerAuth,a,assignmentId);
        assertNull(attempt.lessonId());assertEquals(2,attempt.totalQuestions());
        assertEquals(first.prompt(),attempt.questions().getFirst().prompt());
        assertNull(attempt.questions().getFirst().correctOption());
        var exam=materials.exam(ownerAuth,materialId,new TeacherMaterialController.ExamInput(b,"Unit test",due));
        assertEquals(1,((Number)exam.get("questionsCount")).intValue());
        materials.archive(ownerAuth,materialId,Map.of("archived",true));
        assertThrows(ApiException.class,()->classes.assign(ownerAuth,a,new ClassroomController.NewAssignment("Archived",null,"",80,due,null,materialId)));
        assertThrows(ApiException.class,()->materials.exam(ownerAuth,materialId,new TeacherMaterialController.ExamInput(a,"Archived",due)));
    }
}

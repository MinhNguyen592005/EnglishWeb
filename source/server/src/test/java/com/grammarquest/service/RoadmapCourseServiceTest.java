package com.grammarquest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.grammarquest.exception.ApiException;
import com.grammarquest.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class RoadmapCourseServiceTest {
    @Test void newReviewExcludesBlockedQuestionButPreservesSameIdInAnotherLesson() throws Exception {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var placement=mock(PlacementService.class);
        var user=new com.grammarquest.entity.User("alice","Alice","hash");user.id=7L;
        org.mockito.Mockito.when(users.findWithLockByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        org.mockito.Mockito.when(db.queryForList("select * from study_modules where id=?","m1"))
            .thenReturn(List.of(Map.of("id","m1","title","Module","level_id",1)));
        org.mockito.Mockito.when(db.queryForObject(org.mockito.ArgumentMatchers.contains("count(distinct reference_id)"),org.mockito.ArgumentMatchers.eq(Integer.class),org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq(1),org.mockito.ArgumentMatchers.eq(1))).thenReturn(0);
        org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.contains("l.questions_json,m.id as module_id"),org.mockito.ArgumentMatchers.eq("m1")))
            .thenReturn(new ArrayList<>(List.of(
                Map.of("id","1.1","title","First","questions_json","[{\"id\":\"q1\",\"correctOption\":\"A\"},{\"id\":\"q2\",\"correctOption\":\"B\"}]","module_id","m1","module_title","Module"),
                Map.of("id","1.2","title","Second","questions_json","[{\"id\":\"q1\",\"correctOption\":\"C\"}]","module_id","m1","module_title","Module"))));
        org.mockito.Mockito.when(db.queryForList("select lesson_id,question_id from study_question_blocks"))
            .thenReturn(List.of(Map.of("lesson_id","1.1","question_id","q1")));
        var connection=mock(java.sql.Connection.class);var statement=mock(java.sql.PreparedStatement.class);
        org.mockito.Mockito.when(connection.prepareStatement(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyInt())).thenReturn(statement);
        var saved=new String[1];
        org.mockito.Mockito.doAnswer(invocation->{saved[0]=invocation.getArgument(1);return null;}).when(statement).setString(org.mockito.ArgumentMatchers.eq(6),org.mockito.ArgumentMatchers.anyString());
        org.mockito.Mockito.when(db.update(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),org.mockito.ArgumentMatchers.any(org.springframework.jdbc.support.KeyHolder.class))).thenAnswer(invocation->{
            invocation.getArgument(0,org.springframework.jdbc.core.PreparedStatementCreator.class).createPreparedStatement(connection);
            invocation.getArgument(1,org.springframework.jdbc.support.KeyHolder.class).getKeyList().add(Map.of("id",9L));return 1;
        });
        org.mockito.Mockito.when(db.queryForList("select * from study_attempts where id=? and user_id=?",9L,7L)).thenAnswer(invocation->List.of(Map.of("id",9L,"kind","MODULE_REVIEW","reference_id","m1","status","IN_PROGRESS","questions_json",saved[0],"answers_json","{}","required_correct",2)));
        var course=new RoadmapCourseService(db,json,users,mock(ApplicationEventPublisher.class),placement,mock(DailyQuestService.class),mock(StudyRewardService.class));
        var result=json.valueToTree(course.action("alice","ROADMAP_START",json.createObjectNode().put("kind","MODULE_REVIEW").put("referenceId","m1").put("requestKey","new")));
        assertEquals(2,result.path("questions").size());
        var selected=new HashSet<String>();for(var q:result.path("questions"))selected.add(q.path("lessonId").asText()+":"+q.path("id").asText());
        assertEquals(Set.of("1.1:q2","1.2:q1"),selected);
    }
    @Test void hiddenLessonCannotBeOpenedOrStartedThroughDirectSocketRequest() {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var placement=mock(PlacementService.class);
        var user=new com.grammarquest.entity.User("alice","Alice","hash");user.id=7L;
        org.mockito.Mockito.when(users.findWithLockByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.contains("where l.id=?"),org.mockito.ArgumentMatchers.eq("1.1")))
            .thenReturn(List.of(Map.of("id","1.1","module_id","m1","published",false)));
        var course=new RoadmapCourseService(db,json,users,mock(ApplicationEventPublisher.class),placement,mock(DailyQuestService.class),mock(StudyRewardService.class));
        assertThrows(ApiException.class,()->course.action("alice","ROADMAP_LESSON",json.createObjectNode().put("lessonId","1.1")));
        assertThrows(ApiException.class,()->course.action("alice","ROADMAP_START",json.createObjectNode().put("kind","LESSON").put("referenceId","1.1").put("requestKey","new")));
        org.mockito.Mockito.verify(db,org.mockito.Mockito.never()).update(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(Object[].class));
    }
    @Test void studyHistoryUsesAuthenticatedOwnerAndReturnsSafeMetadataOnly(){
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var placement=mock(PlacementService.class);
        var user=new com.grammarquest.entity.User("alice","Alice","hash");user.id=7L;
        org.mockito.Mockito.when(users.findWithLockByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        org.mockito.Mockito.lenient().when(users.findWithLockById(7L)).thenReturn(Optional.of(user));
        var history=List.<Map<String,Object>>of(Map.of("id",3L,"kind","LESSON","referenceId","1.1","status","COMPLETED","correctCount",2,"totalQuestions",3));
        org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.contains("from study_attempts a"),org.mockito.ArgumentMatchers.eq(7L))).thenReturn(history);
        var service=new RoadmapCourseService(db,json,users,mock(ApplicationEventPublisher.class),placement,mock(DailyQuestService.class),mock(StudyRewardService.class));
        assertSame(history,service.action("alice","ROADMAP_HISTORY",json.createObjectNode().put("userId",99)));
        var sql=org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(db).queryForList(sql.capture(),org.mockito.ArgumentMatchers.eq(7L));
        assertTrue(sql.getValue().contains("where a.user_id=?"));
        assertTrue(sql.getValue().contains("then null else a.correct_count"));
        assertFalse(sql.getValue().contains("answers_json"));
        org.mockito.Mockito.verify(placement).requireCompleted(user);
    }
    final ObjectMapper json=new ObjectMapper();
    final RoadmapCourseService service=new RoadmapCourseService(mock(JdbcTemplate.class),json,mock(UserRepository.class),mock(ApplicationEventPublisher.class),mock(PlacementService.class),mock(DailyQuestService.class),mock(StudyRewardService.class));
    @Test void batchSubmissionRejectsMissingUnknownAndInvalidAnswers()throws Exception {
        var questions=json.readTree("[{\"id\":\"one\",\"correctOption\":\"A\"},{\"id\":\"two\",\"correctOption\":\"B\"}]");
        assertThrows(ApiException.class,()->service.validateAnswers(questions,json.readTree("{\"one\":\"A\"}"),true));
        assertThrows(ApiException.class,()->service.validateAnswers(questions,json.readTree("{\"one\":\"A\",\"other\":\"B\"}"),false));
        assertThrows(ApiException.class,()->service.validateAnswers(questions,json.readTree("{\"one\":\"E\"}"),false));
        assertThrows(ApiException.class,()->service.validateAnswers(questions,json.readTree("{\"one\":0}"),false));
        assertEquals(1,service.validateAnswers(questions,json.readTree("{\"one\":\"A\"}"),false).size());
        assertEquals(0,RoadmapCourseService.score(questions,json.readTree("{\"one\":\"B\",\"two\":\"A\"}")));
    }
    @Test void tenQuestionExamAlwaysCoversAllModulesWithoutDuplicates(){
        var banks=new LinkedHashMap<String,List<com.fasterxml.jackson.databind.JsonNode>>();
        for(int module=0;module<7;module++){var bank=new ArrayList<com.fasterxml.jackson.databind.JsonNode>();for(int q=0;q<12;q++)bank.add(json.createObjectNode().put("id",module+"-"+q).put("module",module));banks.put("m"+module,bank);}
        for(int i=0;i<30;i++){
            var selected=RoadmapCourseService.selectBalanced(banks,10);
            assertEquals(10,selected.size());assertEquals(10,selected.stream().map(q->q.path("id").asText()).distinct().count());
            assertEquals(7,selected.stream().map(q->q.path("module").asInt()).distinct().count());
        }
        assertEquals(84,banks.values().stream().mapToInt(List::size).sum());
    }
    @Test void submissionUpdatesQuestsOnceAndAutosaveDoesNot() throws Exception {
        var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);
        var quests=mock(DailyQuestService.class);var placement=mock(PlacementService.class);
        var service=new RoadmapCourseService(db,json,users,mock(ApplicationEventPublisher.class),placement,quests,mock(StudyRewardService.class));
        var user=new com.grammarquest.entity.User("alice","Alice","hash");user.id=7L;
        org.mockito.Mockito.when(users.findWithLockByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
        org.mockito.Mockito.lenient().when(users.findWithLockById(7L)).thenReturn(Optional.of(user));
        var row=new HashMap<String,Object>();
        row.put("kind","LEVEL_REVIEW");row.put("reference_id","1");row.put("status","IN_PROGRESS");
        row.put("questions_json","[{\"id\":\"one\",\"correctOption\":\"A\"},{\"id\":\"two\",\"correctOption\":\"B\"}]");
        row.put("answers_json","{}");row.put("required_correct",0);
        org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.startsWith("select * from study_attempts"),org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.eq(7L))).thenReturn(List.of(row));
        org.mockito.Mockito.when(db.queryForObject(org.mockito.ArgumentMatchers.startsWith("select count(distinct reference_id)"),org.mockito.ArgumentMatchers.eq(Integer.class),org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq(1),org.mockito.ArgumentMatchers.eq(1))).thenReturn(0);
        var payload=json.readTree("{\"attemptId\":1,\"answers\":{\"one\":\"A\",\"two\":\"B\"}}");
        service.action("alice","ROADMAP_SAVE",payload);
        org.mockito.Mockito.verifyNoInteractions(quests);
        service.action("alice","ROADMAP_SUBMIT",payload);
        org.mockito.Mockito.verify(quests).recordProgress(7L,"CORRECT_COUNT",2);
        org.mockito.Mockito.verify(quests).recordProgress(7L,"STREAK_CORRECT",2);
        org.mockito.Mockito.verify(quests).recordProgress(7L,"PRACTICE_COUNT",1);
        org.mockito.Mockito.verify(quests,org.mockito.Mockito.never()).recordProgress(7L,"PERFECT_PRACTICE",1);
        org.mockito.Mockito.clearInvocations(quests);
        row.put("status","COMPLETED");
        service.action("alice","ROADMAP_SUBMIT",payload);
        org.mockito.Mockito.verifyNoInteractions(quests);
    }
    @Test void lessonRequiresEightyPercentBeforeCompletionRewardOrStreak() {
        for(int correct=0;correct<=3;correct++){
            var db=mock(JdbcTemplate.class);var users=mock(UserRepository.class);var quests=mock(DailyQuestService.class);var rewards=mock(StudyRewardService.class);
            var user=new com.grammarquest.entity.User("alice","Alice","hash");user.id=7L;
            org.mockito.Mockito.when(users.findWithLockByUsernameIgnoreCase("alice")).thenReturn(Optional.of(user));
            var service=new RoadmapCourseService(db,json,users,mock(ApplicationEventPublisher.class),mock(PlacementService.class),quests,rewards);
            var questions=json.createArrayNode();var answers=json.createObjectNode();
            for(int i=0;i<3;i++){questions.add(json.createObjectNode().put("id","q"+i).put("correctOption","A"));answers.put("q"+i,i<correct?"A":"B");}
            var row=new HashMap<String,Object>();row.put("kind","LESSON");row.put("reference_id","1.1");row.put("status","IN_PROGRESS");row.put("required_correct",0);row.put("questions_json",questions.toString());row.put("answers_json","{}");
            org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.startsWith("select * from study_attempts"),org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.eq(7L))).thenReturn(List.of(row));
            org.mockito.Mockito.when(db.queryForList(org.mockito.ArgumentMatchers.startsWith("select l.*,"),org.mockito.ArgumentMatchers.eq("1.1"))).thenReturn(List.of(Map.of("module_id","m1","level_id",1,"title","Lesson")));
            org.mockito.Mockito.when(db.queryForList("select * from study_modules where id=?","m1")).thenReturn(List.of(Map.of("level_id",1,"ordinal_no",1)));
            org.mockito.Mockito.when(db.queryForObject(org.mockito.ArgumentMatchers.startsWith("select count(distinct reference_id)"),org.mockito.ArgumentMatchers.eq(Integer.class),org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq(1),org.mockito.ArgumentMatchers.eq(1))).thenReturn(0);
            service.action("alice","ROADMAP_SUBMIT",json.createObjectNode().put("attemptId",1).set("answers",answers));
            if(correct==3){
                org.mockito.Mockito.verify(rewards).award(7L,"LESSON","1.1",1L);
                org.mockito.Mockito.verify(quests).recordLearningDay(7L);
                org.mockito.Mockito.verify(db).update(org.mockito.ArgumentMatchers.startsWith("insert into study_progress"),org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq("1.1"));
            }else{
                org.mockito.Mockito.verifyNoInteractions(rewards);
                org.mockito.Mockito.verify(quests,org.mockito.Mockito.never()).recordLearningDay(org.mockito.ArgumentMatchers.anyLong());
                org.mockito.Mockito.verify(db,org.mockito.Mockito.never()).update(org.mockito.ArgumentMatchers.startsWith("insert into study_progress"),org.mockito.ArgumentMatchers.eq(7L),org.mockito.ArgumentMatchers.eq("1.1"));
                org.mockito.Mockito.verify(db).update(org.mockito.ArgumentMatchers.startsWith("update study_attempts set answers_json="),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(correct),org.mockito.ArgumentMatchers.eq("FAILED"),org.mockito.ArgumentMatchers.eq(1L));
            }
        }
        assertEquals(8,RoadmapCourseService.requiredCorrect("MODULE_TEST",9));
        assertEquals(8,RoadmapCourseService.requiredCorrect("LEVEL_TEST",10));
    }
}

package com.grammarquest.entity;

import com.grammarquest.repository.AttemptItemRepository;
import com.grammarquest.repository.AttemptRepository;
import com.grammarquest.repository.LessonRepository;
import com.grammarquest.repository.QuestionRepository;
import com.grammarquest.repository.UserRepository;
import com.grammarquest.repository.XpLedgerRepository;
import com.grammarquest.service.LearningService;
import com.grammarquest.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LearningServiceTest {
    @Mock UserRepository users;
    @Mock LessonRepository lessons;
    @Mock QuestionRepository questions;
    @Mock AttemptRepository attempts;
    @Mock AttemptItemRepository items;
    @Mock XpLedgerRepository xp;
    @Mock JdbcTemplate db;
    LearningService service;
    User learner;
    Attempt boss;
    AttemptItem item;

    @BeforeEach void setup() {
        service=new LearningService(users,lessons,questions,attempts,items,xp,db);
        learner=new User("minh","Minh","hash"); learner.id=7L;
        boss=new Attempt(learner.id,1L,"LESSON_BOSS",5,5); boss.id=20L;
        Question q=new Question(); q.id=31L; q.prompt="If it rains, we ___ home.";
        q.optionA="stay"; q.optionB="will stay"; q.optionC="stayed"; q.optionD="would stay";
        q.correctOption="B"; q.explanation="Loại 1 dùng will + động từ.";
        item=new AttemptItem(boss.id,1,q);
        when(users.findByUsernameIgnoreCase("minh")).thenReturn(Optional.of(learner));
    }
    @Test void unfinishedBossNeverSendsCorrectAnswerOrExplanation() {
        item.answer="A";
        when(attempts.findById(20L)).thenReturn(Optional.of(boss));
        when(items.findByAttemptIdOrderByOrdinalNoAsc(20L)).thenReturn(List.of(item));
        var visible=service.get("minh",20L).questions().get(0);
        assertEquals("A",visible.answer());
        assertNull(visible.correctOption());
        assertNull(visible.explanation());
    }
    @Test void duplicateAnswerCannotBeChanged() {
        item.answer="A";
        when(attempts.findWithLockById(20L)).thenReturn(Optional.of(boss));
        when(items.findByAttemptIdOrderByOrdinalNoAsc(20L)).thenReturn(List.of(item));
        ApiException error=assertThrows(ApiException.class,() -> service.answer("minh",20L,1,"B"));
        assertEquals("ALREADY_ANSWERED",error.code);
        assertEquals("A",item.answer);
    }
    @Test void repeatedIdenticalAnswerReturnsSameFeedback() {
        item.answer="B";
        when(attempts.findWithLockById(20L)).thenReturn(Optional.of(boss));
        when(items.findByAttemptIdOrderByOrdinalNoAsc(20L)).thenReturn(List.of(item));
        var reply=service.answer("minh",20L,1,"B");
        assertTrue(reply.correct());
        assertNull(reply.correctOption());
        verifyNoInteractions(xp);
    }
    @Test void lockedLessonTheoryCannotBeReadByGuessingId() {
        Lesson next=new Lesson(); next.id=2L; next.ordinalNo=1; next.topicSlug="conditionals"; next.published=true; next.theory="Bí mật bài khóa";
        Lesson first=new Lesson(); first.id=1L; first.ordinalNo=0; first.topicSlug="conditionals"; first.published=true;
        when(lessons.findById(2L)).thenReturn(Optional.of(next));
        when(lessons.findByPublishedTrueOrderByOrdinalNoAsc()).thenReturn(List.of(first,next));
        when(db.queryForList(anyString(),eq(String.class))).thenReturn(List.of("conditionals"));
        ApiException error=assertThrows(ApiException.class,() -> service.lesson("minh",2L));
        assertEquals("LESSON_LOCKED",error.code);
    }
    @Test void nextPlanetCannotBeOpenedBeforePreviousChapterBoss() {
        Lesson next=new Lesson(); next.id=12L; next.ordinalNo=0; next.topicSlug="conditionals"; next.published=true;
        when(lessons.findById(12L)).thenReturn(Optional.of(next));
        when(db.queryForList(anyString(),eq(String.class))).thenReturn(List.of("basic-tenses","conditionals"));
        assertEquals("LESSON_LOCKED",assertThrows(ApiException.class,() -> service.lesson("minh",12L)).code);
        assertEquals("LESSON_LOCKED",assertThrows(ApiException.class,() -> service.start("minh","PRACTICE",12L)).code);
    }
    @Test void teacherCanChooseLessonForAssignmentButCannotDoStudentWork() {
        learner.role="TEACHER";
        assertTrue(service.listLessons("minh").isEmpty());
        assertEquals("LEARNER_ONLY",assertThrows(ApiException.class,() -> service.lesson("minh",1L)).code);
        assertEquals("LEARNER_ONLY",assertThrows(ApiException.class,() -> service.start("minh","PRACTICE",1L)).code);
        assertEquals("LEARNER_ONLY",assertThrows(ApiException.class,() -> service.startAssignment("minh",1L,7L)).code);
        assertEquals("LEARNER_ONLY",assertThrows(ApiException.class,() -> service.get("minh",20L)).code);
        assertEquals("LEARNER_ONLY",assertThrows(ApiException.class,() -> service.history("minh")).code);
    }
    @Test void textAnswerIgnoresCaseSpacingAndFinalPunctuationWithoutLeakingBossAnswer() {
        item.questionType="REWRITE";
        item.acceptedAnswer="If I had time, I would study.";
        item.optionA="";item.optionB="";item.optionC="";item.optionD="";
        Question nextQuestion=new Question();nextQuestion.id=32L;nextQuestion.prompt="Next";
        nextQuestion.optionA="A";nextQuestion.optionB="B";nextQuestion.optionC="C";nextQuestion.optionD="D";
        nextQuestion.correctOption="A";nextQuestion.explanation="Next explanation";
        AttemptItem next=new AttemptItem(boss.id,2,nextQuestion);
        when(attempts.findWithLockById(20L)).thenReturn(Optional.of(boss));
        when(attempts.findById(20L)).thenReturn(Optional.of(boss));
        when(items.findByAttemptIdOrderByOrdinalNoAsc(20L)).thenReturn(List.of(item,next));
        var result=service.answer("minh",20L,1,"  if  i had TIME, I would study! ");
        assertTrue(result.correct());
        assertEquals(1,result.correctCount());
        assertNull(result.correctOption());
        var visible=service.get("minh",20L).questions().get(0);
        assertEquals("REWRITE",visible.questionType());
        assertTrue(visible.options().isEmpty());
        assertNull(visible.correctOption());
    }
}

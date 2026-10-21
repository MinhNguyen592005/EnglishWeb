package com.grammarquest.entity;

import com.grammarquest.repository.*;
import com.grammarquest.service.LearningService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LearningRoadmapTest {
    final UserRepository users=mock(UserRepository.class);
    final LessonRepository lessons=mock(LessonRepository.class);
    final AttemptRepository attempts=mock(AttemptRepository.class);
    final XpLedgerRepository xp=mock(XpLedgerRepository.class);
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final LearningService service=new LearningService(users,lessons,mock(QuestionRepository.class),attempts,mock(AttemptItemRepository.class),xp,db);
    LearningRoadmapTest(){var u=new User("learner","Learner","hash");u.id=1L;u.role="LEARNER";when(users.findByUsernameIgnoreCase("learner")).thenReturn(Optional.of(u));}
    Map<String,Object> topic(String slug,int order){return Map.of("slug",slug,"title",slug,"description","Description","outcome","Outcome","sortOrder",order,"planetStyle","aqua");}
    LessonOutline lesson(long id,String slug,int order){return new LessonOutline(id,slug,order,"Lesson "+id,"Summary","BEGINNER");}
    @Test void queryCountIsConstantForOneThousandLessons(){
        var data=new ArrayList<LessonOutline>();for(int i=0;i<1000;i++)data.add(lesson(i+1L,"a",i));
        when(db.queryForList(anyString())).thenReturn(List.of(topic("a",1)));
        when(lessons.roadmapLessons()).thenReturn(data);
        when(attempts.completedLessonIds(1L)).thenReturn(List.of(1L));
        when(xp.rewardKeys(1L)).thenReturn(List.of());
        var result=service.roadmap("learner");
        assertEquals(1000,result.lessons().size());assertEquals("COMPLETED",result.lessons().get(0).status());
        assertEquals("AVAILABLE",result.lessons().get(1).status());assertEquals("LOCKED",result.lessons().get(2).status());
        verify(users).findByUsernameIgnoreCase("learner");verify(db).queryForList(anyString());
        verify(lessons).roadmapLessons();verify(attempts).completedLessonIds(1L);verify(xp).rewardKeys(1L);
        verifyNoMoreInteractions(users,db,lessons,attempts,xp);
    }
    @Test void preservesChapterUnlockAndLegacyRewardKeyAndReadsFreshProgress(){
        when(db.queryForList(anyString())).thenReturn(List.of(topic("conditionals",1),topic("passive-voice",2),topic("empty",3)));
        when(lessons.roadmapLessons()).thenReturn(List.of(lesson(1,"conditionals",0),lesson(2,"conditionals",1),lesson(3,"passive-voice",0)));
        when(attempts.completedLessonIds(1L)).thenReturn(List.of(1L));when(xp.rewardKeys(1L)).thenReturn(List.of());
        var first=service.roadmap("learner");assertEquals(2,first.topics().size());assertFalse(first.topics().get(1).unlocked());
        assertEquals("LOCKED",first.lessons().stream().filter(l->l.id()==3L).findFirst().orElseThrow().status());
        when(xp.rewardKeys(1L)).thenReturn(List.of("CHAPTER_BOSS:chapter"));
        var next=service.roadmap("learner");assertTrue(next.topics().get(0).chapterCompleted());assertTrue(next.topics().get(1).unlocked());
        assertEquals("AVAILABLE",next.lessons().stream().filter(l->l.id()==3L).findFirst().orElseThrow().status());
    }
}

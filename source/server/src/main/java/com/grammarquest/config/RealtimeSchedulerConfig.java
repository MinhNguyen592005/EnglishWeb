package com.grammarquest.config;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
@Configuration
public class RealtimeSchedulerConfig {
    @Bean(name="taskScheduler")
    ThreadPoolTaskScheduler taskScheduler(){
        var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(8);scheduler.setThreadNamePrefix("realtime-");
        scheduler.setRemoveOnCancelPolicy(true);scheduler.setWaitForTasksToCompleteOnShutdown(true);scheduler.setAwaitTerminationSeconds(10);return scheduler;
    }
}

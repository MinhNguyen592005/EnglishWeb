package com.grammarquest.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ServerCapacityTest {
    @Test void concurrentRegistrationsRespectAccountAndGlobalLimits()throws Exception {
        var cap=new ServerCapacity(6,5,2);var pool=Executors.newFixedThreadPool(12);
        try{var work=new java.util.ArrayList<Callable<Boolean>>();for(int i=0;i<50;i++){final int id=i;work.add(()->cap.register("s"+id,id%2==0?"ALICE":"alice"));}
            long accepted=pool.invokeAll(work).stream().filter(f->{try{return f.get();}catch(Exception e){throw new RuntimeException(e);}}).count();
            assertEquals(5,accepted);assertTrue(cap.register("bob","bob"));assertFalse(cap.register("eve","eve"));
            cap.unregister("bob");cap.unregister("bob");assertTrue(cap.register("eve","eve"));
        }finally{pool.shutdownNow();}
    }
    @Test void httpRejectsBusyWithoutCallingBusinessAndReleasesAfterFailure()throws Exception {
        var cap=new ServerCapacity(10,5,1);var filter=new CapacityFilter(cap,new ObjectMapper());
        var request=new MockHttpServletRequest();request.setServletPath("/api/v1/lessons");var chain=mock(FilterChain.class);
        assertTrue(cap.tryEnter());var response=new MockHttpServletResponse();filter.doFilter(request,response,chain);
        assertEquals(503,response.getStatus());assertEquals("3",response.getHeader("Retry-After"));verifyNoInteractions(chain);cap.leave();
        var second=new MockHttpServletResponse();doThrow(new ServletException("DB error")).when(chain).doFilter(request,second);
        assertThrows(ServletException.class,()->filter.doFilter(request,second,chain));
        assertEquals(0,cap.metrics().get("activeRequests"));assertTrue(cap.tryEnter());cap.leave();
    }
}

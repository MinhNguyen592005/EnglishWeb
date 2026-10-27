package com.grammarquest.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SupportChatServiceTest {
    @Test void automaticRepliesRecognizeVietnameseIssuesAndDoNotClaimToChangeData(){
        assertTrue(SupportChatService.automaticReply("Không đăng nhập được").contains("Không gửi mật khẩu"));
        assertTrue(SupportChatService.automaticReply("Tôi mất kết nối socket").contains("kiểm tra mạng"));
        assertTrue(SupportChatService.automaticReply("Điểm XP Boss bị lỗi").contains("không tự sửa điểm"));
        assertTrue(SupportChatService.automaticReply("LỘ TRÌNH không mở bài học").contains("mở khóa"));
        assertTrue(SupportChatService.automaticReply("Tôi cần người hỗ trợ").contains("quản trị viên"));
    }
}

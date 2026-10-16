package com.grammarquest.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class ApiErrors {
    private static final Logger log=LoggerFactory.getLogger(ApiErrors.class);
    public record ErrorBody(String code, String message, Map<String,String> fields, String requestId) {}
    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorBody> known(ApiException e, HttpServletRequest request) {
        return ResponseEntity.status(e.status).body(new ErrorBody(e.code,e.getMessage(),Map.of(),requestId(request)));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorBody> invalid(MethodArgumentNotValidException e, HttpServletRequest request) {
        Map<String,String> fields=new HashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.put(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.badRequest().body(new ErrorBody("VALIDATION_ERROR","Dữ liệu chưa hợp lệ",fields,requestId(request)));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorBody> body(HttpMessageNotReadableException e, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(new ErrorBody("INVALID_JSON","Nội dung JSON không hợp lệ",Map.of(),requestId(request)));
    }
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorBody> missing(NoResourceFoundException e, HttpServletRequest request) {
        return ResponseEntity.status(404).body(new ErrorBody("NOT_FOUND","Không tìm thấy tài nguyên",Map.of(),requestId(request)));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorBody> conflict(DataIntegrityViolationException e, HttpServletRequest request) {
        return ResponseEntity.status(409).body(new ErrorBody("DATA_CONFLICT","Dữ liệu đã thay đổi hoặc bị trùng",Map.of(),requestId(request)));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorBody> unexpected(Exception e, HttpServletRequest request) {
        log.error("Unexpected API error",e);
        return ResponseEntity.status(500).body(new ErrorBody("INTERNAL_ERROR","Máy chủ gặp lỗi, vui lòng thử lại",Map.of(),requestId(request)));
    }
    private String requestId(HttpServletRequest request) { return java.util.Objects.toString(request.getAttribute("requestId"),""); }
}

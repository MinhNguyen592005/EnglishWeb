package com.grammarquest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ModerationValidationTest {
    @Test void missingBooleanFieldsCannotSilentlyBecomeUnpublishOrUnlock() throws Exception {
        var json=new ObjectMapper();
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            assertFalse(validator.validate(json.readValue("{}",AdminController.Publish.class)).isEmpty());
            assertFalse(validator.validate(json.readValue("{}",AdminController.LockChange.class)).isEmpty());
            assertFalse(validator.validate(json.readValue("{}",TeacherCurriculumController.Publish.class)).isEmpty());
            assertFalse(validator.validate(json.readValue("{\"kind\":\"LESSON\",\"id\":\"1.1\"}",AdminStudyContentController.Publication.class)).isEmpty());
            assertTrue(validator.validate(new AdminController.Publish(false)).isEmpty());
            assertTrue(validator.validate(new AdminController.LockChange(false)).isEmpty());
        }
    }
    @Test void questionEditRequiresAnExplicitCorrectAnswer() {
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var body=new AdminController.EditQuestion("Prompt","A","B","C","D",null,"Explanation");
            assertTrue(factory.getValidator().validate(body).stream().anyMatch(v->v.getPropertyPath().toString().equals("correctOption")));
        }
    }
}

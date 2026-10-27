-- Keep existing attempts and results intact; only not-yet-started learners see welcome.
ALTER TABLE study_entry_profiles
  ADD COLUMN onboarding_json JSON NULL,
  ADD COLUMN placement_accepted_at TIMESTAMP(6) NULL;

-- =====================================================================
-- Migración 2/5: ÍNDICES
-- Los 13 originales + los marcados "(nuevo)" (FKs sin índice, auditoría).
-- =====================================================================

CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

CREATE INDEX idx_provider_categories_category ON provider_categories(category_id);
CREATE INDEX idx_provider_service_areas_neighborhood ON provider_service_areas(neighborhood_id);
CREATE INDEX idx_provider_availability_provider ON provider_availability(provider_profile_id);

CREATE INDEX idx_service_listings_provider ON service_listings(provider_profile_id);
CREATE INDEX idx_service_listings_category_status ON service_listings(category_id, status_id);

CREATE INDEX idx_needs_category_status ON needs(category_id, status_id);

CREATE INDEX idx_service_requests_client_status ON service_requests(client_id, status_id);
CREATE INDEX idx_service_requests_provider_status ON service_requests(provider_profile_id, status_id);

CREATE INDEX idx_chat_messages_request_sent ON chat_messages(service_request_id, sent_at);

CREATE INDEX idx_ratings_rated_user ON ratings(rated_user_id);

CREATE INDEX idx_claims_status_created ON claims(status_id, created_at);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- (nuevo) FKs consultadas con frecuencia que no tenían índice
CREATE INDEX idx_needs_client ON needs(client_id);
CREATE INDEX idx_need_interests_provider ON need_interests(provider_profile_id);
CREATE INDEX idx_service_requests_source_listing ON service_requests(source_service_listing_id);
CREATE INDEX idx_service_requests_source_need ON service_requests(source_need_id);
CREATE INDEX idx_claims_service_request ON claims(service_request_id);
CREATE INDEX idx_ratings_rated_by ON ratings(rated_by);
CREATE INDEX idx_work_evidence_provider ON work_evidence(provider_profile_id);
CREATE INDEX idx_work_evidence_photos_evidence ON work_evidence_photos(work_evidence_id);
CREATE INDEX idx_service_listing_photos_listing ON service_listing_photos(service_listing_id);
CREATE INDEX idx_need_photos_need ON need_photos(need_id);
CREATE INDEX idx_claim_photos_claim ON claim_photos(claim_id);
CREATE INDEX idx_identity_verification_photos_verification ON identity_verification_photos(identity_verification_id);
-- usado por el LATERAL de v_provider_public_profile (última verificación)
CREATE INDEX idx_identity_verifications_provider_created ON identity_verifications(provider_profile_id, created_at DESC);
-- agenda y auditoría
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_datetime);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_events_occurred ON audit_events(occurred_at);
-- barrido de fn_auto_complete_service_requests()
CREATE INDEX idx_service_requests_completion_requested ON service_requests(completion_requested_at) WHERE completion_requested_at IS NOT NULL;

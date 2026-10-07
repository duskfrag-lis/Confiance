-- =====================================================================
-- Migración 5/5: CATÁLOGOS (datos que la app necesita siempre)
-- Estados, tipos, días y bloques horarios. Sin datos de prueba.
-- OJO: no usar los IDs numéricos en el backend; buscar siempre por nombre.
-- =====================================================================

-- =====================================================================
-- 1. CATÁLOGOS (deben ir primero: todo lo demás depende de sus FK)
-- =====================================================================

INSERT INTO account_statuses (status_name) VALUES
    ('pending_verification'), ('active'), ('disabled');

INSERT INTO active_profiles (profile_name) VALUES
    ('client'), ('provider');

INSERT INTO days_of_week (day_name) VALUES
    ('monday'), ('tuesday'), ('wednesday'), ('thursday'), ('friday'), ('saturday'), ('sunday');

INSERT INTO time_blocks (block_name) VALUES
    ('morning'), ('afternoon'), ('evening');

INSERT INTO bank_account_types (type_name) VALUES
    ('savings'), ('checking');

INSERT INTO evidence_statuses (status_name) VALUES
    ('pending_approval'), ('approved'), ('rejected');

INSERT INTO listing_statuses (status_name) VALUES
    ('active'), ('paused'), ('rejected'), ('withdrawn');

INSERT INTO need_statuses (status_name) VALUES
    ('open'), ('provider_selected'), ('closed');

INSERT INTO interest_statuses (status_name) VALUES
    ('pending'), ('selected'), ('not_selected');

INSERT INTO request_statuses (status_name) VALUES
    ('solicitado'), ('aceptado'), ('confirmado'), ('en_curso'),
    ('finalizado'), ('completado'), ('cancelado'), ('rechazado');

INSERT INTO appointment_statuses (status_name) VALUES
    ('upcoming'), ('in_progress'), ('completed');

INSERT INTO reschedule_statuses (status_name) VALUES
    ('pending'), ('accepted'), ('rejected');

INSERT INTO claim_reasons (reason_name) VALUES
    ('Trabajo no realizado'), ('Calidad deficiente'), ('Cobro indebido'), ('Comportamiento inadecuado'), ('Otro');

INSERT INTO claim_statuses (status_name) VALUES
    ('abierto'), ('en_revision'), ('informacion_solicitada'), ('resuelto'), ('cerrado');

INSERT INTO document_types (type_name) VALUES
    ('cedula');

INSERT INTO verification_statuses (status_name) VALUES
    ('pending'), ('approved'), ('rejected'), ('correction_requested');

INSERT INTO force_majeure_statuses (status_name) VALUES
    ('pending'), ('approved'), ('rejected');

INSERT INTO notification_types (type_name) VALUES
    ('interest_received'), ('interest_selected'), ('request_received'), ('request_accepted'),
    ('request_rejected'), ('request_status_changed'), ('new_chat_message'), ('verification_result');

INSERT INTO token_types (type_name) VALUES
    ('email_verification'), ('password_reset');

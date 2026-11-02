-- =====================================================================
-- Notificación ligada a una necesidad (HU-62.3)
-- =====================================================================
-- Los avisos de interés (HU-25, HU-30, HU-26.6) son de una necesidad, no de una contratación: sin esta columna
-- no podían llevar a ninguna parte. Una notificación apunta a una contratación, a una necesidad o a ninguna.

ALTER TABLE notifications
    ADD COLUMN related_need_id BIGINT REFERENCES needs(need_id);

CREATE INDEX idx_notifications_need ON notifications(related_need_id);

-- HU-57.4 y HU-57.5: cada cambio de estado de un reclamo queda con su nota (la resolución aplicada) y quién lo hizo.
-- La primera fila es la apertura (HU-54.3): estado abierto, sin nota, hecha por quien presenta el reclamo.
-- claims.resolution guarda la nota del último cambio.
CREATE TABLE claim_status_history (
    claim_status_history_id  BIGSERIAL PRIMARY KEY,
    claim_id                 BIGINT NOT NULL REFERENCES claims(claim_id),
    status_id                SMALLINT NOT NULL REFERENCES claim_statuses(claim_status_id),
    note                     VARCHAR(1000),
    changed_by               BIGINT NOT NULL REFERENCES users(user_id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_status_history_claim ON claim_status_history(claim_id, created_at);

-- HU-59.3: fecha de la evaluación de la fuerza mayor (el resultado y el administrador ya tenían columna).
ALTER TABLE cancellations ADD COLUMN force_majeure_reviewed_at TIMESTAMPTZ;

ALTER TABLE cancellations ADD CONSTRAINT chk_cancellation_force_majeure_review CHECK (
    (force_majeure_reviewed_by IS NULL) = (force_majeure_reviewed_at IS NULL)
);

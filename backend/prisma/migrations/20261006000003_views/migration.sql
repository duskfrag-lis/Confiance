-- =====================================================================
-- Migración 3/5: VISTAS (sin cambios - sigue igual)
-- =====================================================================

CREATE VIEW v_provider_public_profile AS
SELECT
    pp.provider_profile_id,
    u.first_name,
    u.last_name,
    u.profile_photo_url,
    pp.bio,
    COALESCE(cat.categories, ARRAY[]::text[])      AS categories,
    COALESCE(area.neighborhoods, ARRAY[]::text[])   AS service_areas,
    COALESCE(rt.avg_score, 0)                        AS avg_rating,
    COALESCE(rt.rating_count, 0)                      AS rating_count,
    COALESCE(vs.status_name = 'approved', FALSE)        AS identity_verified
FROM provider_profiles pp
JOIN users u ON u.user_id = pp.user_id
LEFT JOIN LATERAL (
    SELECT array_agg(c.category_name ORDER BY c.category_name) AS categories
    FROM provider_categories pc
    JOIN categories c ON c.category_id = pc.category_id
    WHERE pc.provider_profile_id = pp.provider_profile_id
) cat ON true
LEFT JOIN LATERAL (
    SELECT array_agg(n.neighborhood_name ORDER BY n.neighborhood_name) AS neighborhoods
    FROM provider_service_areas psa
    JOIN neighborhoods n ON n.neighborhood_id = psa.neighborhood_id
    WHERE psa.provider_profile_id = pp.provider_profile_id
) area ON true
LEFT JOIN LATERAL (
    SELECT AVG(r.score)::numeric(3,2) AS avg_score, COUNT(*) AS rating_count
    FROM ratings r
    WHERE r.rated_user_id = pp.user_id
) rt ON true
LEFT JOIN LATERAL (
    SELECT iv2.status_id
    FROM identity_verifications iv2
    WHERE iv2.provider_profile_id = pp.provider_profile_id
    ORDER BY iv2.created_at DESC
    LIMIT 1
) iv_latest ON true
LEFT JOIN verification_statuses vs ON vs.verification_status_id = iv_latest.status_id;
 
-- HU-29/30: calificación promedio. Sirve para cualquier usuario calificado
-- (cliente o prestador, HU-47 califica a "la otra parte"), no solo prestadores.
CREATE OR REPLACE VIEW v_provider_rating_summary AS
SELECT
    rated_user_id AS user_id,
    AVG(score)::numeric(3,2) AS avg_rating,
    COUNT(*) AS rating_count
FROM ratings
GROUP BY rated_user_id;
 
-- HU-24: catálogo general de servicios (solo publicaciones activas).
CREATE VIEW v_service_listing_catalog AS
SELECT
    sl.service_listing_id,
    sl.title,
    sl.description,
    sl.min_price,
    sl.max_price,
    c.category_name,
    sl.provider_profile_id,
    u.first_name AS provider_first_name,
    u.last_name AS provider_last_name,
    rt.avg_rating AS provider_avg_rating,
    sl.created_at
FROM service_listings sl
JOIN categories c ON c.category_id = sl.category_id
JOIN provider_profiles pp ON pp.provider_profile_id = sl.provider_profile_id
JOIN users u ON u.user_id = pp.user_id
JOIN listing_statuses ls ON ls.listing_status_id = sl.status_id
LEFT JOIN v_provider_rating_summary rt ON rt.user_id = u.user_id
WHERE ls.status_name = 'active';
 
-- HU-25: catálogo de necesidades abiertas.
CREATE OR REPLACE VIEW v_need_catalog AS
SELECT
    n.need_id,
    n.title,
    n.description,
    n.budget_min,
    n.budget_max,
    c.category_name,
    nh.neighborhood_name,
    n.client_id,
    n.preferred_datetime,
    n.created_at
FROM needs n
JOIN categories c ON c.category_id = n.category_id
JOIN neighborhoods nh ON nh.neighborhood_id = n.neighborhood_id
JOIN need_statuses ns ON ns.need_status_id = n.status_id
WHERE ns.status_name = 'open';

-- =====================================================================
-- Confiance — CONSULTAS DE VERIFICACIÓN (solo lectura; usar después del dev_seed)
--   docker compose exec -T postgres psql -U confiance -d confiance < database/queries/verification.sql
-- =====================================================================

-- =====================================================================
-- 6. CONSULTAS DE VERIFICACIÓN (relaciones y filtros)
-- =====================================================================

-- a) Supertipo/subtipo: ¿quién tiene cuál(es) perfil(es) y cuál está activo?
SELECT u.user_id, u.first_name, ap.profile_name AS active_profile,
       (cp.client_profile_id IS NOT NULL) AS has_client_profile,
       (pp.provider_profile_id IS NOT NULL) AS has_provider_profile
FROM users u
JOIN active_profiles ap ON ap.active_profile_id = u.active_profile_id
LEFT JOIN client_profiles cp ON cp.user_id = u.user_id
LEFT JOIN provider_profiles pp ON pp.user_id = u.user_id
ORDER BY u.user_id;
-- Esperado: Laura (user_id=3) con has_client_profile = TRUE y has_provider_profile = TRUE.

-- b) Buscar prestadores por categoría + zona (HU-28/29).
SELECT pp.provider_profile_id, u.first_name, u.last_name, c.category_name, n.neighborhood_name
FROM provider_profiles pp
JOIN users u ON u.user_id = pp.user_id
JOIN provider_categories pc ON pc.provider_profile_id = pp.provider_profile_id
JOIN categories c ON c.category_id = pc.category_id
JOIN provider_service_areas psa ON psa.provider_profile_id = pp.provider_profile_id
JOIN neighborhoods n ON n.neighborhood_id = psa.neighborhood_id
WHERE c.category_name = 'Plomería' AND n.neighborhood_name = 'Barrio Centro';

-- c) Categorías con su categoría padre (jerarquía, RF-094).
SELECT child.category_name AS subcategoria, parent.category_name AS categoria_padre
FROM categories child
LEFT JOIN categories parent ON parent.category_id = child.parent_category_id
ORDER BY COALESCE(parent.category_name, child.category_name), child.category_name;

-- d) Historial completo de una contratación (HU-09): estado, cita, chat, calificación.
SELECT sr.service_request_id, rs.status_name, a.scheduled_datetime,
       (SELECT COUNT(*) FROM chat_messages cm WHERE cm.service_request_id = sr.service_request_id) AS mensajes,
       (SELECT array_agg(score) FROM ratings r WHERE r.service_request_id = sr.service_request_id) AS calificaciones
FROM service_requests sr
JOIN request_statuses rs ON rs.request_status_id = sr.status_id
LEFT JOIN appointments a ON a.service_request_id = sr.service_request_id
WHERE sr.client_id = 1
ORDER BY sr.service_request_id;

-- e) Calificación promedio de Carlos (debería dar 5.00 con 1 calificación).
SELECT * FROM v_provider_rating_summary WHERE user_id = 2;

-- f) Cancelaciones por fuerza mayor pendientes de evaluación administrativa.
SELECT c.cancellation_id, c.service_request_id, u.first_name AS cancelado_por, c.reason, fms.status_name
FROM cancellations c
JOIN users u ON u.user_id = c.cancelled_by
JOIN force_majeure_statuses fms ON fms.force_majeure_status_id = c.force_majeure_status_id
WHERE c.is_force_majeure = TRUE AND fms.status_name = 'pending';

-- g) Integridad del patrón supertipo/subtipo en service_requests (RF-042):
-- debe dar 0 filas (ninguna contratación con los dos orígenes o con ninguno).
SELECT service_request_id
FROM service_requests
WHERE (source_service_listing_id IS NOT NULL AND source_need_id IS NOT NULL)
   OR (source_service_listing_id IS NULL AND source_need_id IS NULL);

-- h) Reclamos, más recientes primero (HU-52, usa el índice compuesto status_id+created_at).
SELECT cl.claim_id, cl.service_request_id, cs.status_name, cl.created_at
FROM claims cl
JOIN claim_statuses cs ON cs.claim_status_id = cl.status_id
ORDER BY cl.created_at DESC;

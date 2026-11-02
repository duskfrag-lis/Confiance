-- Confiance — catálogos de PRODUCCIÓN (oficios y zonas), sin usuarios de prueba.
-- Generado desde frontend/src/app/shared/data/{trade,zone}-catalog.ts. Se puede correr varias veces.
-- En el servidor: docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
--   sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/seeds/prod_catalogs.sql

BEGIN;

INSERT INTO categories (parent_category_id, category_name) SELECT NULL, 'Construcción y obra' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra');
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Albañilería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Carpintería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Pintura' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Enchape y pisos' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Impermeabilización' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Soldadura' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Construcción y obra' ON CONFLICT DO NOTHING;

INSERT INTO categories (parent_category_id, category_name) SELECT NULL, 'Instalaciones' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_category_id IS NULL AND category_name = 'Instalaciones');
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Fontanería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Instalaciones' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Electricidad' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Instalaciones' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Gasodomésticos' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Instalaciones' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Aire acondicionado' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Instalaciones' ON CONFLICT DO NOTHING;

INSERT INTO categories (parent_category_id, category_name) SELECT NULL, 'Reparaciones y mantenimiento' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_category_id IS NULL AND category_name = 'Reparaciones y mantenimiento');
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Reparaciones generales' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Reparaciones y mantenimiento' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Cerrajería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Reparaciones y mantenimiento' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Electrodomésticos' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Reparaciones y mantenimiento' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Vidriería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Reparaciones y mantenimiento' ON CONFLICT DO NOTHING;

INSERT INTO categories (parent_category_id, category_name) SELECT NULL, 'Hogar y limpieza' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_category_id IS NULL AND category_name = 'Hogar y limpieza');
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Aseo' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Hogar y limpieza' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Fumigación' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Hogar y limpieza' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Jardinería' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Hogar y limpieza' ON CONFLICT DO NOTHING;
INSERT INTO categories (parent_category_id, category_name) SELECT category_id, 'Mudanzas' FROM categories WHERE parent_category_id IS NULL AND category_name = 'Hogar y limpieza' ON CONFLICT DO NOTHING;

INSERT INTO communes (commune_name) VALUES ('Comuna 10, La Candelaria') ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Prado' FROM communes WHERE commune_name = 'Comuna 10, La Candelaria' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Boston' FROM communes WHERE commune_name = 'Comuna 10, La Candelaria' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'San Benito' FROM communes WHERE commune_name = 'Comuna 10, La Candelaria' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Jesús Nazareno' FROM communes WHERE commune_name = 'Comuna 10, La Candelaria' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Bomboná' FROM communes WHERE commune_name = 'Comuna 10, La Candelaria' ON CONFLICT DO NOTHING;

INSERT INTO communes (commune_name) VALUES ('Comuna 11, Laureles-Estadio') ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Laureles' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Estadio' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Lorena' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'San Joaquín' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'La Castellana' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Los Conquistadores' FROM communes WHERE commune_name = 'Comuna 11, Laureles-Estadio' ON CONFLICT DO NOTHING;

INSERT INTO communes (commune_name) VALUES ('Comuna 12, La América') ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'La América' FROM communes WHERE commune_name = 'Comuna 12, La América' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Santa Lucía' FROM communes WHERE commune_name = 'Comuna 12, La América' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Simón Bolívar' FROM communes WHERE commune_name = 'Comuna 12, La América' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Calasanz' FROM communes WHERE commune_name = 'Comuna 12, La América' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Los Pinos' FROM communes WHERE commune_name = 'Comuna 12, La América' ON CONFLICT DO NOTHING;

INSERT INTO communes (commune_name) VALUES ('Comuna 14, El Poblado') ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'El Poblado' FROM communes WHERE commune_name = 'Comuna 14, El Poblado' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Manila' FROM communes WHERE commune_name = 'Comuna 14, El Poblado' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Astorga' FROM communes WHERE commune_name = 'Comuna 14, El Poblado' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Patio Bonito' FROM communes WHERE commune_name = 'Comuna 14, El Poblado' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Lalinde' FROM communes WHERE commune_name = 'Comuna 14, El Poblado' ON CONFLICT DO NOTHING;

INSERT INTO communes (commune_name) VALUES ('Comuna 16, Belén') ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Belén' FROM communes WHERE commune_name = 'Comuna 16, Belén' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Fátima' FROM communes WHERE commune_name = 'Comuna 16, Belén' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Rosales' FROM communes WHERE commune_name = 'Comuna 16, Belén' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'La Mota' FROM communes WHERE commune_name = 'Comuna 16, Belén' ON CONFLICT DO NOTHING;
INSERT INTO neighborhoods (commune_id, neighborhood_name) SELECT commune_id, 'Los Alpes' FROM communes WHERE commune_name = 'Comuna 16, Belén' ON CONFLICT DO NOTHING;

COMMIT;

SELECT (SELECT count(*) FROM categories WHERE parent_category_id IS NULL) AS categorias,
       (SELECT count(*) FROM categories WHERE parent_category_id IS NOT NULL) AS oficios,
       (SELECT count(*) FROM communes) AS comunas, (SELECT count(*) FROM neighborhoods) AS barrios;

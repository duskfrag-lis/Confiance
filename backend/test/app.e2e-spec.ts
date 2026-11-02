import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Prueba de humo: levanta el AppModule completo (variables de entorno, Prisma,
// storage, mail). Necesita Postgres arriba (docker compose up -d) y backend/.env.
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('responde 404 con el formato del filtro global en rutas inexistentes', () => {
    return request(app.getHttpServer())
      .get('/ruta-inexistente')
      .expect(404)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: false, statusCode: 404 });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});

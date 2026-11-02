// Crea una cuenta de administrador. Es la única forma de crearlas: no salen del registro público y no tienen
// perfil de cliente ni de prestador (decidido el 2026-10-31).
// Uso, desde backend/: npm run admin:create
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const RULES = {
  email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'un correo válido'],
  name: [/^\S.{0,98}$/, 'al menos un nombre'],
  idNumber: [/^\d{6,10}$/, 'una cédula de 6 a 10 dígitos'],
  phone: [/^3\d{9}$/, 'un celular de 10 dígitos que empiece por 3'],
};

// La misma regla de contraseña del registro: de 6 a 20 caracteres, con mayúscula, minúscula, número y ! @ # $ %
function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%'];
  const all = sets.join('');
  const chars = [...sets.map((s) => s[randomInt(s.length)]), ...Array.from({ length: 12 }, () => all[randomInt(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const splitName = (full) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  return [first, rest.length ? rest.join(' ') : null];
};

const rl = createInterface({ input: stdin, output: stdout });

async function ask(label, [pattern, hint], normalize = (v) => v.trim()) {
  for (;;) {
    const value = normalize(await rl.question(`${label}: `));
    if (pattern.test(value)) return value;
    console.log(`  Escribe ${hint}.`);
  }
}

const prisma = new PrismaClient();

try {
  console.log('Nueva cuenta de administrador (sin perfil de cliente ni de prestador)\n');
  const email = await ask('Correo', RULES.email, (v) => v.trim().toLowerCase());
  const names = await ask('Nombres', RULES.name);
  const surnames = await ask('Apellidos', RULES.name);
  const idNumber = await ask('Cédula', RULES.idNumber, (v) => v.replace(/\D/g, ''));
  const phone = await ask('Celular', RULES.phone, (v) => v.replace(/\D/g, ''));

  const taken = await prisma.users.findFirst({ where: { OR: [{ email }, { id_number: idNumber }] }, select: { email: true } });
  if (taken) {
    console.error(`\nYa existe una cuenta con ${taken.email === email ? 'ese correo' : 'esa cédula'}. Usa otros datos.`);
    process.exitCode = 1;
  } else {
    const [firstName, middleName] = splitName(names);
    const [lastName, secondLastName] = splitName(surnames);
    const password = generatePassword();

    // active_profile_id es obligatorio en la tabla; en un administrador no se usa
    const [status, profile] = await Promise.all([
      prisma.account_statuses.findUniqueOrThrow({ where: { status_name: 'active' } }),
      prisma.active_profiles.findUniqueOrThrow({ where: { profile_name: 'client' } }),
    ]);

    await prisma.users.create({
      data: {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        second_last_name: secondLastName,
        phone,
        email,
        id_number: idNumber,
        password_hash: await argon2.hash(password),
        is_admin: true,
        email_verified: true,
        active_profile_id: profile.active_profile_id,
        status_id: status.status_id,
      },
    });

    console.log(`\nCuenta creada: ${email}`);
    console.log(`Contraseña temporal: ${password}`);
    console.log('Se muestra una sola vez. Entrégala por un canal seguro y pide cambiarla con "¿Olvidaste tu contraseña?".');
  }
} finally {
  rl.close();
  await prisma.$disconnect();
}

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/*
La JwtStrategy que lee la cookie access_token se implementa cuando se construya el modulo
auth/ - este guard ya queda listo para usarla
*/
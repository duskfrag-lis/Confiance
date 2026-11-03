import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PseService } from './pse.service';
import type { WompiEvent } from './wompi.client';

/**
 * HU-43.3: URL de eventos que se configura en el panel de Wompi (https://<dominio>/api/payments/wompi/events). Es
 * pública porque la llama Wompi; la autenticidad se comprueba con la firma. Responde 200 aunque ignore el evento,
 * porque Wompi reintenta todo lo que no sea 200; si falla al guardarlo, el 500 hace que lo reintente.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('payments/wompi')
export class WompiEventsController {

  constructor(private pse: PseService) {}

  @HttpCode(HttpStatus.OK)
  @Post('events')
  events(@Body() event: WompiEvent) {

    return this.pse.handleEvent(event);
  }
}

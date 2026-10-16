import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ProviderDashboard } from '../models/provider-dashboard';

function bogotaDate(days: number, hour: number, minute = 0): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
    .format(new Date())
    .split('-')
    .map(Number);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const base = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${hh}:${mm}:00-05:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

@Injectable({ providedIn: 'root' })
export class ProviderDashboardService {
  // TODO: GET /api/provider/dashboard
  getDashboard(): Observable<ProviderDashboard> {
    return of({
      stats: [
        { icon: 'send', value: '1', label: 'Solicitudes nuevas' },
        { icon: 'briefcase', value: '5', label: 'Contrataciones activas' },
        { icon: 'wrench', value: '2', label: 'Servicios activos' },
        { icon: 'star', value: '4.5 (12)', label: 'Calificación' },
      ],
      attention: [
        {
          id: 'sr-31',
          icon: 'clock',
          title: 'Responde la solicitud',
          detail: 'Marcela Ortiz, Closets y muebles de cocina a medida',
          link: '/prestador/contrataciones',
        },
        {
          id: 'sr-28',
          icon: 'play',
          title: 'Marca el inicio del servicio',
          detail: 'Paula Duque, Closets y muebles de cocina a medida',
          link: '/prestador/contrataciones',
        },
        {
          id: 'sr-25',
          icon: 'check',
          title: 'Marca como finalizado',
          detail: 'Sebastián Cano, Puertas macizas y marcos',
          link: '/prestador/contrataciones',
        },
      ],
      profileChecks: [
        { label: 'Oficios', done: true },
        { label: 'Descripción', done: true },
        { label: 'Zonas de atención', done: true },
        { label: 'Disponibilidad semanal', done: true },
        { label: 'Trabajos realizados', done: true },
        { label: 'Identidad verificada', done: false },
      ],
      appointments: [
        {
          id: 'ap-2',
          service: 'Puertas macizas y marcos',
          clientName: 'Sebastián Cano',
          clientPhotoUrl: null,
          date: bogotaDate(0, 8),
          status: 'en_curso',
          price: 480000,
        },
        {
          id: 'ap-1',
          service: 'Closets y muebles de cocina a medida',
          clientName: 'Paula Duque',
          clientPhotoUrl: null,
          date: bogotaDate(2, 14),
          status: 'confirmado',
          price: 1200000,
        },
      ],
      needs: [
        {
          id: 'nd-7',
          title: 'Closet empotrado para habitación principal',
          clientName: 'Valentina Ríos',
          clientPhotoUrl: null,
          neighborhood: 'Laureles',
          budgetMin: 600000,
          budgetMax: 1200000,
          matchesProfile: true,
        },
        {
          id: 'nd-6',
          title: 'Reparación de puerta principal de madera',
          clientName: 'Andrés Gil',
          clientPhotoUrl: null,
          neighborhood: 'Estadio',
          budgetMin: 80000,
          budgetMax: 160000,
          matchesProfile: true,
        },
        {
          id: 'nd-5',
          title: 'Repisas flotantes para la sala',
          clientName: 'Lucía Herrera',
          clientPhotoUrl: null,
          neighborhood: 'Belén',
          budgetMin: 150000,
          budgetMax: 300000,
          matchesProfile: true,
        },
      ],
    });
  }
}

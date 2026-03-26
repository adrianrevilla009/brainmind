import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} a las ${formatTime(dateStr)}`
}

export const SPECIALIZATIONS = [
  'Ansiedad', 'Depresión', 'Trauma y PTSD', 'Terapia de pareja',
  'Trastornos alimentarios', 'TOC', 'TDAH', 'Duelo', 'Fobias',
  'Estrés laboral', 'Autoestima', 'Adicciones', 'Psicosis', 'Trastorno bipolar',
]

export const APPROACHES = [
  'Terapia Cognitivo-Conductual (TCC)', 'Psicoanálisis', 'Terapia Sistémica',
  'EMDR', 'Mindfulness', 'ACT', 'Gestalt', 'Humanista', 'Integradora',
]

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

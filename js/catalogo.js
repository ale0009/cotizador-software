// Catálogo de piezas y roles. TODAS las horas y salarios son supuestos ilustrativos, editables en la página.
//
// Origen de cada cifra (campo `origen`):
// - 'eco': horas probables de `optimizacion-presupuesto-ecommerce/datos/parametros.yaml`, caso «pequena»
//   (modulos_horas y horas_normativas). Optimista y pesimista salen de los porcentajes por defecto del
//   motor de riesgo de eiran: −20 % y +50 % (rango asimétrico: el software se alarga más de lo que se acorta).
// - 'propio': supuesto propio de este cotizador (calculado aquí), sin fuente externa. Verifícalo con tu equipo.

const eco = (m) => [Math.round(m * 0.8 * 10) / 10, m, Math.round(m * 1.5 * 10) / 10];

export const PIEZAS = Object.freeze([
  { id: 'login', nombre: 'Registro e inicio de sesión', corto: 'Login', horas: eco(90), origen: 'eco', nota: 'módulo «usuarios»' },
  { id: 'catalogo', nombre: 'Catálogo de productos', corto: 'Catálogo', horas: eco(160), origen: 'eco', nota: 'módulo «catalogo»' },
  { id: 'carrito', nombre: 'Carrito de compras', corto: 'Carrito', horas: eco(100), origen: 'eco', nota: 'módulo «carrito»' },
  { id: 'pagos', nombre: 'Pagos en línea', corto: 'Pagos', horas: eco(100), origen: 'eco', nota: 'módulo «pagos»' },
  { id: 'panel', nombre: 'Panel de administración', corto: 'Panel admin', horas: eco(110), origen: 'eco', nota: 'módulo «panel»' },
  { id: 'datos', nombre: 'Protección de datos (Ley 1581)', corto: 'Ley 1581', horas: eco(64), origen: 'eco', nota: 'horas normativas «ley_1581»' },
  { id: 'factura', nombre: 'Facturación electrónica', corto: 'Factura-e', horas: eco(56), origen: 'eco', nota: 'horas normativas «facturacion_electronica»' },
  { id: 'ux', nombre: 'Diseño UX/UI y prototipo', corto: 'Diseño UX', horas: [50, 70, 110], origen: 'propio' },
  { id: 'api', nombre: 'API pública documentada', corto: 'API', horas: [60, 80, 140], origen: 'propio' },
  { id: 'movil', nombre: 'App móvil (Android + iOS)', corto: 'App móvil', horas: [200, 280, 480], origen: 'propio' },
  { id: 'reportes', nombre: 'Reportes y tableros', corto: 'Reportes', horas: [40, 60, 110], origen: 'propio' },
  { id: 'notif', nombre: 'Notificaciones (correo y push)', corto: 'Avisos', horas: [24, 36, 70], origen: 'propio' },
  { id: 'busqueda', nombre: 'Búsqueda con filtros', corto: 'Búsqueda', horas: [30, 45, 80], origen: 'propio' },
  { id: 'chat', nombre: 'Chat en tiempo real', corto: 'Chat', horas: [60, 90, 180], origen: 'propio' },
  { id: 'integra', nombre: 'Integración con sistema externo', corto: 'Integración', horas: [40, 64, 140], origen: 'propio' },
  { id: 'deploy', nombre: 'Despliegue y CI/CD', corto: 'Despliegue', horas: [24, 40, 80], origen: 'propio' },
]);

// Salarios mensuales de `parametros.yaml` (roles) del repo de optimización: supuestos sintéticos, no encuestas.
export const ROLES = Object.freeze([
  { id: 'frontend', etiqueta: 'Frontend', salario: 4_800_000 },
  { id: 'backend', etiqueta: 'Backend', salario: 5_600_000 },
  { id: 'qa', etiqueta: 'QA / pruebas', salario: 3_900_000 },
  { id: 'ux', etiqueta: 'Diseño UX', salario: 4_500_000 },
  { id: 'lider', etiqueta: 'Líder técnico', salario: 7_500_000 },
  { id: 'devops', etiqueta: 'DevOps', salario: 6_100_000 },
]);

// Ejemplo precargado: una tienda en línea pequeña con el equipo del caso «pequena» (frontend, backend y QA).
export const EJEMPLO = Object.freeze({
  nombre: 'Ejemplo: tienda en línea pequeña',
  piezas: ['login', 'catalogo', 'carrito', 'pagos', 'panel', 'deploy'],
  equipo: { frontend: 1, backend: 1, qa: 1, ux: 0, lider: 0, devops: 0 },
});

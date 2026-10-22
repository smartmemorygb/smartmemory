/* =========================================================================
   SMART MEMORY - PROTOCOLO INVIAS
   Motor de consulta: búsqueda local (instantánea, costo cero) +
   respaldo con Gemini (IA generativa) para preguntas que no calcen
   con la base de conocimiento local.
   ========================================================================= */

// ⚠️ PEGAR AQUÍ LA URL DE TU WEB APP DE GOOGLE APPS SCRIPT
// (ver INSTRUCCIONES_DESPLIEGUE.md). Mientras esté vacía, el chat
// funciona igual con la base de conocimiento local (sin IA generativa).
const GEMINI_BACKEND_URL = "";
// Nota: se intentó conectar un backend de Gemini vía Google Apps Script,
// pero Apps Script no devuelve el header CORS necesario para que fetch()
// le hable desde un sitio externo (limitación conocida de la plataforma,
// no de esta configuración). Queda documentado en Code.gs por si se
// retoma más adelante con otro backend (ej. Cloudflare Workers, que sí
// soporta CORS de forma nativa y también es gratuito).

// Se usa jsDelivr (CDN sobre GitHub) en vez de raw.githubusercontent.com:
// GitHub raw sirve los PDF como application/octet-stream (fuerza una
// descarga silenciosa en vez de abrir el visor del navegador); jsDelivr
// sirve el content-type correcto (application/pdf) y además cachea el
// contenido, por lo que los enlaces de cita cargan más rápido.
const BASE_RAW_URL = "https://cdn.jsdelivr.net/gh/smartmemorygb/smartmemory@main/pdfs";
// Formatos FR individuales (plantillas/actas que se diligencian en campo).
// Carpeta separada en el mismo repo: cada código mapea a <BASE_FORMATOS_URL>/<código>.pdf
const BASE_FORMATOS_URL = "https://cdn.jsdelivr.net/gh/smartmemorygb/smartmemory@main/formatos";

// Nombre descriptivo de cada formato FR. Se usa para generar el enlace
// clicable directamente dentro de las respuestas del chat (citas <span class="cite">)
// y en la columna "Cita" de las tablas de checklist.
const FORMATOS = {
    "MEPI-MN1-IN-1-FR-1": "Orden de Inicio Contrato de Interventoría",
    "MEPI-MN1-IN-1-FR-2": "Orden de Inicio Contrato de Obra",
    "MEPI-MN1-IN-1-FR-3": "Acta Reunión Técnica Inicial",
    "MEPI-MN1-IN-1-FR-4": "Acta Aprobación Parcial de Estudios y Diseños",
    "MEPI-MN1-IN-1-FR-5": "Acta Aprobación Definitiva de Estudios y Diseños",
    "MEPI-MN1-IN-2-FR-1": "Plan de Inversión del Anticipo (Obra)",
    "MEPI-MN1-IN-2-FR-2": "Informe de Inversión y Buen Manejo (Obra)",
    "MEPI-MN1-IN-3-FR-1": "Plan de Inversión del Anticipo (Interventoría)",
    "MEPI-MN1-IN-3-FR-2": "Informe de Inversión y Buen Manejo (Interventoría)",
    "MEPI-MN1-IN-4-FR-1": "Acta de Recibo Parcial de Obra",
    "MEPI-MN1-IN-4-FR-2": "Hoja de Ruta y Orden de Pago (Obra)",
    "MEPI-MN1-IN-4-FR-3": "Recibo Parcial de Mantenimiento Rutinario",
    "MEPI-MN1-IN-5-FR-1": "Acta de Ajuste (caso general)",
    "MEPI-MN1-IN-5-FR-2": "Acta de Ajuste (factor Ia)",
    "MEPI-MN1-IN-6-FR-1": "Programa de Inversiones",
    "MEPI-MN1-IN-6-FR-2": "Seguimiento Mensual al Programa de Inversiones",
    "MEPI-MN1-IN-7-FR-1": "Acta de Modificación de Cantidades de Obra",
    "MEPI-MN1-IN-8-FR-1": "Acta de Costos (Interventoría)",
    "MEPI-MN1-IN-8-FR-2": "Hoja de Ruta y Orden de Pago (Interventoría)",
    "MEPI-MN1-IN-9-FR-1": "Acta de Modificación de Costos",
    "MEPI-MN1-IN-9-FR-2": "Plan de Cargas / Reprogramación al Plan de Cargas",
    "MEPI-MN1-IN-10-FR-1": "Análisis de Precios Unitarios (APU)",
    "MEPI-MN1-IN-10-FR-2": "Comparación de Precios Unitarios de Ítems No Previstos",
    "MEPI-MN1-IN-10-FR-3": "Reversión de Precios No Previstos",
    "MEPI-MN1-IN-10-FR-4": "Acta de Fijación de Ítems No Previstos",
    "MEPI-MN1-IN-11-FR-1": "Acta de Suspensión (Obra)",
    "MEPI-MN1-IN-11-FR-2": "Acta de Suspensión (Interventoría)",
    "MEPI-MN1-IN-11-FR-3": "Acta de Reanudación (Obra)",
    "MEPI-MN1-IN-11-FR-4": "Acta de Reanudación (Interventoría)",
    "MEPI-MN1-IN-12-FR-1": "Solicitud de Adición, Modificación y/o Prórroga (Obra)",
    "MEPI-MN1-IN-13-FR-1": "Solicitud de Adición, Modificación y/o Prórroga (Interventoría)",
    "MEPI-MN1-IN-14-FR-1": "Acta de Comité de Obra",
    "MEPI-MN1-IN-14-FR-2": "Acta de Reunión",
    "MEPI-MN1-IN-15-FR-1": "Lista de Chequeo Informe Mensual de Interventoría",
    "MEPI-MN1-IN-15-FR-2": "Resumen Mensual Estado General del Proyecto",
    "MEPI-MN1-IN-15-FR-3": "Informe Semanal",
    "MEPI-MN1-IN-15-FR-4": "Maquinaria y Equipo (Contrato de Obra)",
    "MEPI-MN1-IN-15-FR-5": "Equipo y Vehículos (Contrato de Interventoría)",
    "MEPI-MN1-IN-15-FR-6": "Personal, Control (Contrato de Obra)",
    "MEPI-MN1-IN-15-FR-7": "Personal, Control (Contrato de Interventoría)",
    "MEPI-MN1-IN-15-FR-8": "Informe Financiero y Presupuestal (Contrato de Obra)",
    "MEPI-MN1-IN-15-FR-9": "Informe Financiero y Presupuestal (Interventoría)",
    "MEPI-MN1-IN-15-FR-10": "Estado General del Tiempo",
    "MEPI-MN1-IN-15-FR-11": "Resumen Ensayos de Laboratorio",
    "MEPI-MN1-IN-15-FR-12": "Seguimiento Garantías y Seguros (Contrato de Obra)",
    "MEPI-MN1-IN-15-FR-13": "Seguimiento Garantías (Contrato de Interventoría)",
    "MEPI-MN1-IN-15-FR-14": "Seguimiento al Plan de Calidad (Contrato de Obra)",
    "MEPI-MN1-IN-15-FR-15": "Seguimiento Plan de Calidad (Contrato de Interventoría)",
    "MEPI-MN1-IN-16-FR-1": "Acta de Visita Previa para Recibo Definitivo de Obra",
    "MEPI-MN1-IN-16-FR-2": "Acta de Entrega y Recibo Definitivo de Obra",
    "MEPI-MN1-IN-17-FR-1": "Acta de Entrega y Recibo Definitivo de Interventoría",
    "MEPI-MN1-IN-18-FR-1": "Acta de Liquidación (Obra)",
    "MEPI-MN1-IN-18-FR-2": "Acta de Liquidación (Interventoría)",
    "MEPI-MN1-IN-18-FR-3": "Acta de Liquidación — Saldo a favor (variante 1)",
    "MEPI-MN1-IN-18-FR-4": "Acta de Liquidación — Saldo a favor (variante 2)"
};

// Si el texto de cita empieza con un código de formato FR conocido, lo
// convierte en enlace directo al PDF del formato (abre en pestaña nueva).
function renderCitation(text) {
    const m = String(text).match(/^(MEPI-MN1-IN-\d+-FR-\d+)/);
    if (m && FORMATOS[m[1]]) {
        return `<a class="cite-link" href="${BASE_FORMATOS_URL}/${m[1]}.pdf" target="_blank" title="${FORMATOS[m[1]]}">${text} 📎</a>`;
    }
    return text;
}

/* ---------------------- 1. ÍNDICE DE PROCEDIMIENTOS ---------------------- */
const PROCEDURE_INDEX = {
    inicio: {
        id: "inicio",
        title: "Inicio de ejecución: Obra e Interventoría",
        source_id: "MEPI-MN1-IN-1",
        summary: "Requisitos previos, orden de inicio de obra e interventoría, reunión técnica inicial, bitácora y aprobación de estudios y diseños.",
        checklist: [
            { step: "Registro Presupuestal y aprobación de garantías", evidence: "SECOP II", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-1 §V" },
            { step: "Orden de Inicio Contrato de Interventoría (FR-1)", evidence: "SECOP II (cambio a ejecución)", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-1-FR-1" },
            { step: "Orden de Inicio Contrato de Obra (FR-2)", evidence: "SECOP II (cambio a ejecución)", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-1-FR-2" },
            { step: "Entrega de documentos del Contratista (hojas de vida, APU, programas)", evidence: "Radicado físico/magnético", responsible: "Contratista", citation: "MEPI-MN1-IN-1 §VII" },
            { step: "Reunión Técnica Inicial + visita conjunta (máx. 3 días hábiles)", evidence: "Acta FR-3", responsible: "Interventor / Dir. Territorial", citation: "MEPI-MN1-IN-1-FR-3" },
            { step: "Apertura del Diario de Obra (bitácora)", evidence: "Libro foliado", responsible: "Interventoría", citation: "MEPI-MN1-IN-1 §Diario de Obra" },
        ],
        graph: `graph TD
            RP[Registro Presupuestal + Garantías] --> OII[Orden Inicio Interventoría FR-1]
            OII --> OIO[Orden Inicio Obra FR-2]
            OIO --> ED[Entrega docs. Contratista]
            ED --> RTI[Reunión Técnica Inicial FR-3]
            RTI --> BIT[Apertura Diario de Obra]
            RTI --> AED[Aprobación Estudios y Diseños FR-4/FR-5]
            click RTI call app.showDocs("inicio")`
    },
    apu: {
        id: "apu",
        title: "Análisis de Precios Unitarios (APU) e Ítems no Previstos",
        source_id: "MEPI-MN1-IN-10",
        summary: "Presentación de APU al inicio del contrato y trámite de aprobación de ítems no previstos durante la ejecución.",
        checklist: [
            { step: "Contratista presenta APU de la propuesta (máx. 3 días hábiles desde orden de inicio)", evidence: "Formato FR-1", responsible: "Contratista", citation: "MEPI-MN1-IN-10 §IV" },
            { step: "Solicitud de ítem no previsto con justificación técnica/económica/jurídica", evidence: "Carpeta foliada + 3 cotizaciones", responsible: "Contratista", citation: "MEPI-MN1-IN-10 §VIII" },
            { step: "Interventor compara precio vs. página web INVIAS (3 días hábiles)", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-10-FR-2" },
            { step: "Reversión de precios no previstos al mes de cierre del proceso", evidence: "Formato FR-3", responsible: "Interventor", citation: "MEPI-MN1-IN-10-FR-3" },
            { step: "Suscripción Acta de Fijación de Ítems no Previstos", evidence: "Formato FR-4", responsible: "Interventor + Contratista", citation: "MEPI-MN1-IN-10-FR-4" },
        ],
        graph: `graph TD
            APU[APU Propuesta Económica FR-1] --> SOL[Solicitud Ítem No Previsto]
            SOL --> COT[3 Cotizaciones + Justificación]
            COT --> COMP[Comparación vs. Web INVIAS FR-2]
            COMP --> REV[Reversión de Precios FR-3]
            REV --> ACTA[Acta Fijación Ítems No Previstos FR-4]
            click ACTA call app.showDocs("apu")`
    },
    suspension: {
        id: "suspension",
        title: "Suspensión, Ampliación y Reanudación",
        source_id: "MEPI-MN1-IN-11",
        summary: "Trámite de actas de suspensión por fuerza mayor/caso fortuito/interés público, su posible ampliación y la reanudación de obra e interventoría.",
        checklist: [
            { step: "Contratista solicita suspensión por escrito, con justificación", evidence: "Radicado escrito", responsible: "Contratista", citation: "MEPI-MN1-IN-11 §IV.1" },
            { step: "Interventor diligencia Acta de Suspensión Obra (FR-1)", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-11-FR-1" },
            { step: "Supervisor diligencia Acta de Suspensión Interventoría (FR-2)", evidence: "Formato FR-2", responsible: "Supervisor Interventoría", citation: "MEPI-MN1-IN-11-FR-2" },
            { step: "Suscripción en plataforma SECOP II (fecha prima sobre el formato)", evidence: "SECOP II", responsible: "Funcionario competente INVIAS", citation: "MEPI-MN1-IN-11 §IV.3-5" },
            { step: "Reanudación (automática en fecha prevista, o Acta FR-3/FR-4 si es antes)", evidence: "Formato FR-3/FR-4", responsible: "Interventor / Supervisor", citation: "MEPI-MN1-IN-11-FR-3" },
            { step: "Actualización de garantías dentro de 3 días hábiles tras reanudación", evidence: "Certificado de modificación", responsible: "Contratista/Interventor", citation: "MEPI-MN1-IN-11 §IV.10" },
        ],
        graph: `graph TD
            SOL[Solicitud Contratista por Fuerza Mayor] --> FR1[Acta Suspensión Obra FR-1]
            FR1 --> FR2[Acta Suspensión Interventoría FR-2]
            FR2 --> SECOP[Suscripción en SECOP II]
            SECOP --> REAN[Reanudación FR-3 / FR-4]
            REAN --> GAR[Actualización Garantías]
            click SECOP call app.showDocs("suspension")`
    },
    adicion: {
        id: "adicion",
        title: "Adición, Modificación y Prórroga de Interventoría",
        source_id: "MEPI-MN1-IN-13",
        summary: "Trámite para solicitar adición en valor, modificación o prórroga del contrato de interventoría ante el Comité de Contratación.",
        checklist: [
            { step: "Interventor presenta solicitud con justificación técnica/jurídica/financiera/presupuestal", evidence: "Comunicación escrita", responsible: "Interventor", citation: "MEPI-MN1-IN-13 §III.4" },
            { step: "Supervisor analiza viabilidad y diligencia FR-1 conjuntamente", evidence: "Formato FR-1", responsible: "Supervisor Interventoría", citation: "MEPI-MN1-IN-13-FR-1" },
            { step: "Verificación de garantías y seguros actualizados", evidence: "Pólizas vigentes", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-13 §IV.3" },
            { step: "Anexar Acta de Modificación de Costos y/o Plan de Cargas", evidence: "MEPI-MN1-IN-9-FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-13 §IV.4" },
            { step: "Presentación ante Comité de Contratación (mín. 30 días calendario antes del vencimiento)", evidence: "Acta del Comité", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-13 §IV.6" },
        ],
        graph: `graph TD
            SOL[Solicitud Interventor] --> FR1[Formato FR-1 + Concepto Supervisor]
            FR1 --> GAR[Verificación Garantías]
            GAR --> SOP[Documentos Soporte: Acta Mod. Costos]
            SOP --> COMITE[Comité de Contratación]
            COMITE --> MINUTA[Suscripción Minuta Adicional]
            click COMITE call app.showDocs("adicion")`
    },
    informes: {
        id: "informes",
        title: "Informe Semanal y Mensual de Interventoría",
        source_id: "MEPI-MN1-IN-15",
        summary: "Elaboración y presentación de los informes periódicos de seguimiento técnico, financiero, ambiental, social y predial de los contratos de obra e interventoría.",
        checklist: [
            { step: "Informe Semanal, corte jueves, firmado por Director de Interventoría", evidence: "Formato FR-3 (Excel/aplicativo)", responsible: "Interventoría", citation: "MEPI-MN1-IN-15-FR-3" },
            { step: "Lista de Chequeo Informe Mensual (primera página del informe)", evidence: "Formato FR-1", responsible: "Interventoría", citation: "MEPI-MN1-IN-15-FR-1" },
            { step: "Resumen Mensual Estado General del Proyecto (segunda página)", evidence: "Formato FR-2", responsible: "Interventoría", citation: "MEPI-MN1-IN-15-FR-2" },
            { step: "Reportes de maquinaria, personal y aportes a seguridad social", evidence: "Formatos FR-4 a FR-9", responsible: "Interventoría", citation: "MEPI-MN1-IN-15 §V.4" },
            { step: "Informe financiero/presupuestal + matriz de riesgos", evidence: "Formato FR-8/FR-9", responsible: "Interventoría", citation: "MEPI-MN1-IN-15 §5.5" },
            { step: "Entrega magnética a Unidad Ejecutora + copia a Dirección Territorial", evidence: "Medio magnético", responsible: "Interventor", citation: "MEPI-MN1-IN-15 §III.9" },
        ],
        graph: `graph TD
            SEM[Informe Semanal FR-3] --> CHK[Lista Chequeo FR-1]
            CHK --> RES[Resumen Estado General FR-2]
            RES --> FORM[Formatos FR-4 a FR-15]
            FORM --> FIN[Informe Financiero y Matriz Riesgos]
            FIN --> ENT[Entrega a Unidad Ejecutora]
            click ENT call app.showDocs("informes")`
    },
    recibo: {
        id: "recibo",
        title: "Recibo Definitivo de Interventoría e Informe Final",
        source_id: "MEPI-MN1-IN-17",
        summary: "Entrega y recibo definitivo del contrato de interventoría, informe final y documentos anexos requeridos para la liquidación.",
        checklist: [
            { step: "Interventor entrega Informe Final (requisito previo al Acta)", evidence: "Informe Final + anexos", responsible: "Interventor", citation: "MEPI-MN1-IN-17 §III.7" },
            { step: "Suscripción Acta de Entrega y Recibo Definitivo de Interventoría", evidence: "Formato FR-1", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-17-FR-1" },
            { step: "Resumen financiero verificado contra SIIF-NACIÓN", evidence: "Reporte SIIF", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-17 §IV.3.5" },
            { step: "Planos Record aprobados y compatibles con SIG-INVIAS", evidence: "Certificación SIG", responsible: "Interventor", citation: "MEPI-MN1-IN-17 §IV.3.6" },
            { step: "Plan de Cargas Final actualizado", evidence: "Plan de Cargas Final", responsible: "Interventor", citation: "MEPI-MN1-IN-17 §IV.3.7" },
            { step: "Entrega de carpetas digitales (obra e interventoría) al archivo central", evidence: "Medio físico y magnético - Fontibón", responsible: "Interventor", citation: "MEPI-MN1-IN-17 §V" },
            { step: "Actualización de garantías para la liquidación", evidence: "Pólizas actualizadas", responsible: "Interventor", citation: "MEPI-MN1-IN-17 §IV.7" },
        ],
        graph: `graph TD
            INF[Informe Final de Interventoría] --> ACTA[Acta Entrega y Recibo Definitivo FR-1]
            ACTA --> FIN[Resumen Financiero vs SIIF]
            FIN --> PLANOS[Planos Record + Cert. SIG]
            PLANOS --> CARGAS[Plan de Cargas Final]
            CARGAS --> ARCH[Entrega Archivo Central Fontibón]
            ARCH --> LIQ[Insumo para Acta de Liquidación]
            click ARCH call app.showDocs("recibo")`
    },
    anticipo_obra: {
        id: "anticipo_obra",
        title: "Anticipo y/o Pago Anticipado — Contrato de Obra",
        source_id: "MEPI-MN1-IN-2",
        summary: "Trámite, manejo, control, seguimiento y amortización del anticipo otorgado al contrato de obra.",
        checklist: [
            { step: "Contratista elabora Plan de Inversión del Anticipo", evidence: "Formato FR-1", responsible: "Contratista", citation: "MEPI-MN1-IN-2-FR-1" },
            { step: "Apertura de cuenta bancaria conjunta (o patrimonio autónomo) que genere rendimientos", evidence: "Certificación bancaria/fiduciaria", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-2 §III" },
            { step: "Máx. 15% del anticipo para compra de maquinaria y equipo (nunca para alquiler)", evidence: "Plan de Inversión aprobado", responsible: "Interventor", citation: "MEPI-MN1-IN-2 §IV.7-8" },
            { step: "Amortización vía Actas de Recibo Parcial de Obra (total 1 mes antes del vencimiento)", evidence: "Actas de Recibo Parcial", responsible: "Interventor", citation: "MEPI-MN1-IN-2 §III.11" },
            { step: "Informe de Inversión y Buen Manejo del Anticipo en cada informe mensual", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-2-FR-2" },
        ],
        graph: `graph TD
            PLAN[Plan Inversión Anticipo FR-1] --> CTA[Apertura Cuenta Conjunta / Fiducia]
            CTA --> DESEM[Desembolso INVIAS]
            DESEM --> AMORT[Amortización vía Actas Recibo Parcial]
            AMORT --> INF[Informe Buen Manejo FR-2]
            click DESEM call app.showDocs("anticipo_obra")`
    },
    anticipo_interventoria: {
        id: "anticipo_interventoria",
        title: "Anticipo y/o Pago Anticipado — Contrato de Interventoría",
        source_id: "MEPI-MN1-IN-3",
        summary: "Trámite, manejo, control, seguimiento y amortización del anticipo otorgado al contrato de interventoría.",
        checklist: [
            { step: "Interventor elabora Plan de Inversión del Anticipo de Interventoría", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-3-FR-1" },
            { step: "Cuenta conjunta vigilada por el Supervisor del contrato de interventoría", evidence: "Certificación bancaria", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-3 §III.10" },
            { step: "Uso exclusivo: equipos de medición, laboratorio, topografía, dotación, nómina (NO vehículos)", evidence: "Plan de Inversión aprobado", responsible: "Interventor", citation: "MEPI-MN1-IN-3 §IV.3" },
            { step: "Amortización vía Actas de Costos de interventoría", evidence: "Actas de Costos", responsible: "Interventor", citation: "MEPI-MN1-IN-3 §III.15" },
            { step: "Informe de Inversión y Buen Manejo en el informe mensual", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-3-FR-2" },
        ],
        graph: `graph TD
            PLAN[Plan Inversión Anticipo FR-1] --> CTA[Cuenta Conjunta Vigilada por Supervisor]
            CTA --> AMORT[Amortización vía Actas de Costos]
            AMORT --> INF[Informe Buen Manejo FR-2]
            click AMORT call app.showDocs("anticipo_interventoria")`
    },
    recibo_parcial_obra: {
        id: "recibo_parcial_obra",
        title: "Acta de Recibo Parcial de Obra",
        source_id: "MEPI-MN1-IN-4",
        summary: "Elaboración mensual del Acta de Recibo Parcial de Obra, pre-actas soporte, Hoja de Ruta y Orden de Pago.",
        checklist: [
            { step: "Elaboración de pre-actas (obra, ambiental, social, predial, sostenibilidad)", evidence: "Pre-actas firmadas", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-4 §III.6" },
            { step: "Acta de Recibo Parcial de Obra consecutiva, corte a fin de mes", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-4-FR-1" },
            { step: "Radicación dentro de 5 días calendario siguientes al mes ejecutado", evidence: "Radicado", responsible: "Contratista", citation: "MEPI-MN1-IN-4 §IV.10" },
            { step: "Hoja de Ruta y Orden de Pago con trazabilidad del trámite", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-4-FR-2" },
            { step: "Última acta debe indicarse expresamente como \"Acta Final\"", evidence: "Acta final", responsible: "Interventor", citation: "MEPI-MN1-IN-4 §III.11" },
        ],
        graph: `graph TD
            PREACTAS[Pre-actas Obra/Amb/Social/Predial] --> ACTA[Acta Recibo Parcial FR-1]
            ACTA --> HOJA[Hoja de Ruta y Orden de Pago FR-2]
            HOJA --> DT[Revisión Dirección Territorial]
            DT --> PAGO[Autorización de Pago]
            click ACTA call app.showDocs("recibo_parcial_obra")`
    },
    ajuste: {
        id: "ajuste",
        title: "Acta de Ajuste (costos de construcción)",
        source_id: "MEPI-MN1-IN-5",
        summary: "Cálculo de ajustes contractuales en los costos de obra con base en los índices DANE.",
        checklist: [
            { step: "Acta de Ajuste provisional dentro de 5 días calendario del mes ejecutado", evidence: "Formato FR-1", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-5-FR-1" },
            { step: "Acta de Ajuste con \"Ia\" si el anticipo se gira después de 120 días del cierre", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-5-FR-2" },
            { step: "Acta de Ajuste definitivo dentro de 5 días hábiles de publicados los índices DANE", evidence: "Índices DANE", responsible: "Contratista", citation: "MEPI-MN1-IN-5 §III.10" },
            { step: "Última acta debe indicarse expresamente como \"Acta Final\"", evidence: "Acta final", responsible: "Interventor", citation: "MEPI-MN1-IN-5 §III.11" },
        ],
        graph: `graph TD
            RECIBO[Acta Recibo Parcial de Obra] --> PROV[Acta Ajuste Provisional FR-1]
            PROV --> DANE[Publicación Índices DANE]
            DANE --> DEF[Acta Ajuste Definitivo]
            click DEF call app.showDocs("ajuste")`
    },
    programa_inversiones: {
        id: "programa_inversiones",
        title: "Programa de Obra, Programa de Inversiones y Seguimiento",
        source_id: "MEPI-MN1-IN-6",
        summary: "Elaboración del Programa de Obra (Gantt), el Programa de Inversiones, su reprogramación y el seguimiento mensual.",
        checklist: [
            { step: "Programa de Obra inicial (diagrama de Gantt, ruta crítica) dentro de 3 días hábiles", evidence: "Project o similar", responsible: "Contratista", citation: "MEPI-MN1-IN-6 §IV.4" },
            { step: "Programa de Inversiones por Grandes Partidas de Pago (GPP)", evidence: "Formato FR-1", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-6-FR-1" },
            { step: "Reprogramación consistente con el Acta de Modificación de Cantidades (IN-7)", evidence: "Formato FR-1 actualizado", responsible: "Contratista", citation: "MEPI-MN1-IN-6 §V" },
            { step: "Seguimiento mensual anexo a cada Acta de Recibo Parcial de Obra", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-6-FR-2" },
        ],
        graph: `graph TD
            OBRA[Programa de Obra - Gantt] --> INV[Programa de Inversiones FR-1]
            INV --> SEG[Seguimiento Mensual FR-2]
            SEG --> REPROG[Reprogramación si aplica]
            click INV call app.showDocs("programa_inversiones")`
    },
    modificacion_cantidades: {
        id: "modificacion_cantidades",
        title: "Acta de Modificación de Cantidades de Obra",
        source_id: "MEPI-MN1-IN-7",
        summary: "Modificaciones de cantidades de obra por contrato adicional en valor o necesidades del proyecto.",
        checklist: [
            { step: "Suscripción del contrato adicional ANTES del Acta de Modificación", evidence: "Minuta adicional firmada", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-7 §III.9" },
            { step: "El valor actualizado nunca puede exceder el valor total del contrato vigente", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-7 §III.7" },
            { step: "Justificación técnica precisa de las causales de modificación", evidence: "Formato FR-1 diligenciado", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-7-FR-1" },
            { step: "Entrega simultánea de Reprogramación al Programa de Inversiones actualizada", evidence: "MEPI-MN1-IN-6-FR-1", responsible: "Contratista", citation: "MEPI-MN1-IN-7 §III.8" },
        ],
        graph: `graph TD
            ADIC[Contrato Adicional Suscrito] --> ACTA[Acta Modificación Cantidades FR-1]
            ACTA --> REPROG[Reprogramación Programa Inversiones]
            click ACTA call app.showDocs("modificacion_cantidades")`
    },
    acta_costos: {
        id: "acta_costos",
        title: "Acta de Costos de Interventoría",
        source_id: "MEPI-MN1-IN-8",
        summary: "Elaboración y trámite mensual del Acta de Costos de interventoría (personal y otros costos directos).",
        checklist: [
            { step: "Acta de Costos mensual consecutiva, con soportes de nómina y seguridad social", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-8-FR-1" },
            { step: "Verificación de dedicación del personal (declaración jurada, no supera 100%)", evidence: "Declaración juramentada", responsible: "Interventor", citation: "MEPI-MN1-IN-8 §III.14" },
            { step: "Certificación de pago de aportes parafiscales y seguridad social", evidence: "Certificación representante legal/revisor fiscal", responsible: "Interventor", citation: "MEPI-MN1-IN-8 §III.16" },
            { step: "Hoja de Ruta y Orden de Pago de Interventoría", evidence: "Formato FR-2", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-8-FR-2" },
            { step: "Última acta se indica expresamente como \"Acta Final de Costos\"", evidence: "Acta final", responsible: "Interventor", citation: "MEPI-MN1-IN-8 §III.10" },
        ],
        graph: `graph TD
            ACTA[Acta de Costos FR-1] --> CERT[Certificación Seguridad Social]
            CERT --> HOJA[Hoja de Ruta y Orden de Pago FR-2]
            HOJA --> SUP[Firma Supervisor Interventoría]
            click ACTA call app.showDocs("acta_costos")`
    },
    modificacion_costos: {
        id: "modificacion_costos",
        title: "Acta de Modificación de Costos y Plan de Cargas",
        source_id: "MEPI-MN1-IN-9",
        summary: "Modificación de costos de interventoría por actualización de tarifas, adición, prórroga o suspensión; Plan de Cargas inicial, reprogramación y final.",
        checklist: [
            { step: "Plan de Cargas Inicial dentro de 10 días calendario desde inicio del contrato", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-9 §V" },
            { step: "Acta de Modificación de Costos cuando hay contrato adicional/prórroga/suspensión", evidence: "Formato FR-1", responsible: "Interventor + Supervisor", citation: "MEPI-MN1-IN-9-FR-1" },
            { step: "Reprogramación al Plan de Cargas consistente con el Acta de Modificación", evidence: "Formato FR-2", responsible: "Interventor", citation: "MEPI-MN1-IN-9-FR-2" },
            { step: "Plan de Cargas Final actualizado con el Acta de Entrega y Recibo Definitivo", evidence: "Plan de Cargas Final", responsible: "Interventor", citation: "MEPI-MN1-IN-9 §V" },
        ],
        graph: `graph TD
            CARGAS_INI[Plan de Cargas Inicial FR-2] --> MOD[Acta Modificación Costos FR-1]
            MOD --> REPROG[Reprogramación Plan de Cargas]
            REPROG --> FINAL[Plan de Cargas Final]
            click MOD call app.showDocs("modificacion_costos")`
    },
    adicion_obra: {
        id: "adicion_obra",
        title: "Adición, Modificación y Prórroga — Contrato de Obra",
        source_id: "MEPI-MN1-IN-12",
        summary: "Trámite para solicitar adición en valor, modificación o prórroga del contrato de OBRA (análogo al IN-13 de interventoría) ante el Comité de Contratación.",
        checklist: [
            { step: "Contratista presenta solicitud escrita a la Interventoría con justificación", evidence: "Comunicación escrita", responsible: "Contratista", citation: "MEPI-MN1-IN-12 §IV.1" },
            { step: "Interventor diligencia FR-1 y presenta su justificación técnica/jurídica/financiera", evidence: "Formato FR-1", responsible: "Interventor", citation: "MEPI-MN1-IN-12-FR-1" },
            { step: "Anexar Acta de Modificación de Cantidades y Reprogramación de Inversiones", evidence: "MEPI-MN1-IN-7-FR-1 / IN-6-FR-1", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-12 §IV.4" },
            { step: "Presentación ante Comité de Contratación (mín. 30 días calendario antes del vencimiento)", evidence: "Acta del Comité", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-12 §IV.6" },
        ],
        graph: `graph TD
            SOL[Solicitud Contratista] --> FR1[Formato FR-1 + Justificación Interventor]
            FR1 --> SOP[Acta Modificación Cantidades + Reprogramación]
            SOP --> COMITE[Comité de Contratación]
            COMITE --> MINUTA[Suscripción Minuta Adicional]
            click COMITE call app.showDocs("adicion_obra")`
    },
    comite_reunion: {
        id: "comite_reunion",
        title: "Acta de Comité de Obra y Acta de Reunión",
        source_id: "MEPI-MN1-IN-14",
        summary: "Desarrollo de los Comités de Obra (seguimiento semanal) y de otras Reuniones durante la ejecución del contrato.",
        checklist: [
            { step: "Comité de Obra semanal, presencial para Directores y residentes con dedicación 100%", evidence: "Formato FR-1", responsible: "Interventoría", citation: "MEPI-MN1-IN-14-FR-1" },
            { step: "Verificación de compromisos del Comité anterior", evidence: "Acta anterior", responsible: "Interventor", citation: "MEPI-MN1-IN-14 §IV.5" },
            { step: "Acta de Reunión para encuentros distintos al Comité de Obra (puede ser virtual)", evidence: "Formato FR-2", responsible: "Interventoría", citation: "MEPI-MN1-IN-14-FR-2" },
            { step: "Las decisiones del Comité NO modifican por sí solas el contrato", evidence: "N/A", responsible: "Interventor", citation: "MEPI-MN1-IN-14 §III.4" },
        ],
        graph: `graph TD
            CONV[Convocatoria Semanal] --> COMITE[Acta Comité de Obra FR-1]
            COMITE --> COMP[Verificación Compromisos Anteriores]
            CONV2[Otras Reuniones] --> ACTAR[Acta de Reunión FR-2]
            click COMITE call app.showDocs("comite_reunion")`
    },
    recibo_obra: {
        id: "recibo_obra",
        title: "Visita Previa y Recibo Definitivo de Obra",
        source_id: "MEPI-MN1-IN-16",
        summary: "Visita previa conjunta y suscripción del Acta de Entrega y Recibo Definitivo de las obras (distinto del recibo de la Interventoría, IN-17).",
        checklist: [
            { step: "Visita previa conjunta mín. 30 días antes del vencimiento (15 días si plazo < 6 meses)", evidence: "Formato FR-1", responsible: "Interventoría + Contratista", citation: "MEPI-MN1-IN-16-FR-1" },
            { step: "Registro fotográfico de obras que requieren acción correctiva", evidence: "Fotos/esquemas", responsible: "Interventor", citation: "MEPI-MN1-IN-16 §IV.2" },
            { step: "Verificación de aprobación de Planos Record y certificación SIG", evidence: "Certificación SIG", responsible: "Interventor", citation: "MEPI-MN1-IN-16 §IV.3-4" },
            { step: "Acta de Entrega y Recibo Definitivo de Obra el día del vencimiento", evidence: "Formato FR-2", responsible: "Contratista + Interventor", citation: "MEPI-MN1-IN-16-FR-2" },
            { step: "Si el Contratista no corrige lo pactado, el Interventor recibe en el estado actual y descuenta", evidence: "Acta con descuentos", responsible: "Interventor", citation: "MEPI-MN1-IN-16 §V.2" },
        ],
        graph: `graph TD
            VISITA[Visita Previa Conjunta FR-1] --> CORR[Acciones Correctivas del Contratista]
            CORR --> ACTA[Acta Entrega y Recibo Definitivo Obra FR-2]
            ACTA --> SIIF[Verificación Financiera vs SIIF]
            click ACTA call app.showDocs("recibo_obra")`
    },
    liquidacion: {
        id: "liquidacion",
        title: "Acta de Liquidación (Obra e Interventoría)",
        source_id: "MEPI-MN1-IN-18",
        summary: "Liquidación por mutuo acuerdo o unilateral de los contratos de obra y de interventoría — el cierre final de todo el proceso contractual.",
        checklist: [
            { step: "Liquidación por mutuo acuerdo dentro del plazo pactado contractualmente", evidence: "Formato FR-1 (obra) / FR-2 (interventoría)", responsible: "Interventor + Unidad Ejecutora", citation: "MEPI-MN1-IN-18 §III.7" },
            { step: "Si no hay acuerdo o el Contratista no se presenta: liquidación unilateral dentro de 2 meses", evidence: "Resolución de liquidación unilateral", responsible: "INVIAS", citation: "MEPI-MN1-IN-18 §III.8" },
            { step: "Verificar estado de amortización del anticipo (certificación Subdirección Financiera)", evidence: "Memorando Grupo de Contabilidad", responsible: "Interventor", citation: "MEPI-MN1-IN-18 §IV.7" },
            { step: "Determinar caso: saldo a favor de INVIAS, del Contratista/Interventor, o ambos (FR-3/FR-4)", evidence: "Formato FR-3/FR-4", responsible: "Unidad Ejecutora", citation: "MEPI-MN1-IN-18-FR-3" },
            { step: "No se puede liquidar con un proceso sancionatorio en curso sin terminar primero", evidence: "N/A", responsible: "INVIAS", citation: "MEPI-MN1-IN-18 §III.4" },
        ],
        graph: `graph TD
            RECIBO[Acta Recibo Definitivo Obra/Interventoría] --> DOC[Expediente de Liquidación]
            DOC --> MUTUO[Liquidación Mutuo Acuerdo]
            MUTUO -->|Sin acuerdo| UNILAT[Liquidación Unilateral]
            MUTUO --> SALDO[Determinación de Saldos FR-1 a FR-4]
            click SALDO call app.showDocs("liquidacion")`
    }
};

/* ------------------- 2. BASE DE CONOCIMIENTO (contenido real MEPI) ------------------- */
const KNOWLEDGE_BASE = [
    {
        id: "kb-inicio",
        procedureId: "inicio",
        keywords: ["inicio", "orden de inicio", "rti", "reunión técnica", "visita conjunta", "bitácora", "diario de obra", "estudios y diseños"],
        responseContent: `#### Inicio de ejecución de los contratos de obra e interventoría

Una vez cumplidos los requisitos del contrato (Registro Presupuestal, garantías aprobadas), la **Unidad Ejecutora** suscribe la orden de inicio y cambia el estado a ejecución en **SECOP II**. La ejecución de interventoría **no puede iniciarse después** de la orden de inicio de obra.

**Pasos clave:**
- Orden de Inicio Interventoría (<span class="cite" data-doc="MEPI-MN1-IN-1-FR-1">FR-1</span>) y Orden de Inicio Obra (<span class="cite" data-doc="MEPI-MN1-IN-1-FR-2">FR-2</span>), ambas vía SECOP II.
- El Contratista entrega documentos (hojas de vida, APU, programa de obra, PMT, etc.) dentro de **3 días hábiles**.
- Dentro de **3 días hábiles** siguientes se realiza la **Reunión Técnica Inicial** con visita conjunta previa (<span class="cite" data-doc="MEPI-MN1-IN-1-FR-3">FR-3</span>), fijando compromisos con plazo máximo de **8 días hábiles**.
- Se abre el **Diario de Obra (bitácora)** el mismo día de la reunión técnica, libro de pasta dura y foliado.`,
        evidence: [{ source_id: "MEPI-MN1-IN-1", source_name: "Instructivo Inicio de Ejecución", snippet: "La ejecución del contrato de interventoría no debe iniciarse con posterioridad a la orden de inicio del contrato de obra." }],
        location: "MEPI-MN1-IN-1, secciones V a IX",
        tags: ["RTI", "Visita Conjunta", "Bitácora"]
    },
    {
        id: "kb-apu",
        procedureId: "apu",
        keywords: ["apu", "precios unitarios", "ítem no previsto", "item no previsto", "análisis de precios"],
        responseContent: `#### Análisis de Precios Unitarios (APU) e Ítems no Previstos

El Contratista presenta los APU de la propuesta económica dentro de los **3 días hábiles** siguientes a la orden de inicio (<span class="cite" data-doc="MEPI-MN1-IN-10-FR-1">FR-1</span>). Los precios **no pueden diferir** de los consignados en la propuesta aprobada.

**Para ítems no previstos:**
- El Contratista radica solicitud con justificación técnica, económica y jurídica, más **3 cotizaciones** vigentes.
- El Interventor compara contra precios de referencia de la página web de INVIAS (<span class="cite" data-doc="MEPI-MN1-IN-10-FR-2">FR-2</span>); si el precio acordado es mayor, debe justificarlo por escrito.
- Se diligencia la **Reversión de Precios** al mes de cierre del proceso de selección (<span class="cite" data-doc="MEPI-MN1-IN-10-FR-3">FR-3</span>).
- No puede ejecutarse obra de un ítem no previsto sin la suscripción del **Acta de Fijación de Ítems no Previstos** (<span class="cite" data-doc="MEPI-MN1-IN-10-FR-4">FR-4</span>).`,
        evidence: [{ source_id: "MEPI-MN1-IN-10", source_name: "Instructivo Análisis de Precios Unitarios", snippet: "El Interventor no debe permitir la ejecución de actividades correspondientes a ítems no previstos, sin la suscripción del formato MEPI-MN1-IN-10-FR-4." }],
        location: "MEPI-MN1-IN-10, secciones IV a VIII",
        tags: ["APU", "Ítem no previsto"]
    },
    {
        id: "kb-suspension",
        procedureId: "suspension",
        keywords: ["suspensión", "suspension", "ampliación", "reanudación", "fuerza mayor", "caso fortuito"],
        responseContent: `#### Suspensión, Ampliación y Reanudación

La suspensión se tramita por **fuerza mayor, caso fortuito o interés público** que imposibiliten temporalmente la ejecución, debidamente justificada y avalada por la Interventoría.

**Puntos clave:**
- La suspensión del contrato de **interventoría conlleva la suspensión simultánea** del contrato de obra.
- El Acta de Suspensión (<span class="cite" data-doc="MEPI-MN1-IN-11-FR-1">FR-1</span> obra / <span class="cite" data-doc="MEPI-MN1-IN-11-FR-2">FR-2</span> interventoría) debe fijar la fecha prevista de reanudación.
- **No se entiende suspendido** el contrato sin la firma en **SECOP II** del funcionario facultado; la fecha de la plataforma **prima** sobre la del formato.
- La reanudación es automática en la fecha prevista; si las causales cesan antes, se suscribe Acta de Reanudación (<span class="cite" data-doc="MEPI-MN1-IN-11-FR-3">FR-3</span>/<span class="cite" data-doc="MEPI-MN1-IN-11-FR-4">FR-4</span>).
- Dentro de **3 días hábiles** tras la reanudación debe actualizarse la garantía única y el seguro.`,
        evidence: [{ source_id: "MEPI-MN1-IN-11", source_name: "Instructivo Suspensión, Ampliación y Reanudación", snippet: "La suspensión del contrato de interventoría conlleva a la suspensión simultánea del contrato de obra." }],
        location: "MEPI-MN1-IN-11, secciones III a V",
        tags: ["Suspensión", "Reanudación"]
    },
    {
        id: "kb-adicion",
        procedureId: "adicion",
        keywords: ["adición", "adicion", "prórroga", "prorroga", "modificación", "comité de contratación"],
        responseContent: `#### Solicitud de Adición, Modificación y Prórroga de Interventoría

El Interventor presenta la solicitud mediante comunicación escrita al Supervisor del contrato, con justificación **técnica, jurídica, financiera, presupuestal, ambiental, social, predial y de sostenibilidad** según corresponda.

**Puntos clave:**
- Se diligencia el formato <span class="cite" data-doc="MEPI-MN1-IN-13-FR-1">FR-1</span> conjuntamente con el Supervisor, incluyendo su concepto.
- Debe verificarse que garantías y seguros estén **actualizados** antes de suscribir la minuta.
- La solicitud debe presentarse con una **antelación mínima de 30 días calendario** al vencimiento del contrato.
- Solo se entiende aprobada con la **suscripción del Acta** del Comité de Contratación y la legalización de la minuta correspondiente.`,
        evidence: [{ source_id: "MEPI-MN1-IN-13", source_name: "Instructivo Solicitud de Adición, Modificación y Prórroga", snippet: "La solicitud de adición y/o modificación y/o prórroga solo se entiende aprobada por el Comité de Contratación con la suscripción del Acta correspondiente." }],
        location: "MEPI-MN1-IN-13, secciones III y IV",
        tags: ["Adición", "Prórroga", "Comité de Contratación"]
    },
    {
        id: "kb-informes",
        procedureId: "informes",
        keywords: ["informe semanal", "informe mensual", "informes", "reportes"],
        responseContent: `#### Informe Semanal y Mensual de Interventoría

El **Informe Semanal** (<span class="cite" data-doc="MEPI-MN1-IN-15-FR-3">FR-3</span>) tiene corte los días **jueves** y debe ir firmado por el Director de Interventoría; se anexa al informe mensual.

El **Informe Mensual** inicia siempre con la Lista de Chequeo (<span class="cite" data-doc="MEPI-MN1-IN-15-FR-1">FR-1</span>, página 1) y el Resumen del Estado General del Proyecto (<span class="cite" data-doc="MEPI-MN1-IN-15-FR-2">FR-2</span>, página 2), seguidos de los formatos de maquinaria, personal, aportes a seguridad social, informe financiero/presupuestal, estado del tiempo y resultados de laboratorio.

**Importante:** la presentación completa del informe mensual es **requisito indispensable** para autorizar el pago de los costos de interventoría. Debe entregarse en medio magnético a la Unidad Ejecutora con copia a la Dirección Territorial.`,
        evidence: [{ source_id: "MEPI-MN1-IN-15", source_name: "Instructivo Informe Semanal y Mensual", snippet: "La presentación completa del Informe mensual por parte del Interventor, es requisito indispensable para la autorización del pago de los costos de Interventoría correspondientes." }],
        location: "MEPI-MN1-IN-15, secciones III a V",
        tags: ["Informe Semanal", "Informe Mensual"]
    },
    {
        id: "kb-recibo",
        procedureId: "recibo",
        keywords: ["recibo definitivo", "informe final", "liquidación", "entrega de interventoría"],
        responseContent: `#### Recibo Definitivo de Interventoría e Informe Final

El día del vencimiento o terminación del contrato, el Supervisor y el Interventor suscriben el **Acta de Entrega y Recibo Definitivo de Interventoría** (<span class="cite" data-doc="MEPI-MN1-IN-17-FR-1">FR-1</span>), requisito previo la entrega del **Informe Final**.

**El Acta debe contener:** datos generales del contrato, descripción de actividades, resumen financiero (verificado contra **SIIF-Nación**), planos record, Plan de Cargas Final, gestión ambiental/social/predial/sostenibilidad y concepto del Supervisor.

**Documentos anexos clave:** carpetas digitales organizadas cronológicamente (obra e interventoría), bitácora original, registro fotográfico y fílmico, carteras topográficas, y el **proyecto de Acta de Liquidación**.

Este Acta es **requisito para el pago de la última Acta de Costos** y para iniciar el trámite de liquidación del contrato.`,
        evidence: [{ source_id: "MEPI-MN1-IN-17", source_name: "Instructivo Recibo Definitivo de Interventoría", snippet: "El Acta de Entrega y Recibo Definitivo de Interventoría es requisito para el trámite y pago de la última Acta de Costos." }],
        location: "MEPI-MN1-IN-17, secciones III a V",
        tags: ["Recibo Definitivo", "Liquidación"]
    },
    {
        id: "kb-anticipo-obra",
        procedureId: "anticipo_obra",
        keywords: ["anticipo obra", "pago anticipado", "anticipo del contratista", "manejo del anticipo"],
        responseContent: `#### Anticipo y/o Pago Anticipado — Contrato de Obra

El Contratista elabora el **Plan de Inversión del Anticipo** (<span class="cite" data-doc="MEPI-MN1-IN-2-FR-1">FR-1</span>) para aprobación de la Interventoría, y lo maneja en **cuenta bancaria conjunta** (firmas cruzadas Contratista-Interventor) o **patrimonio autónomo**, vigilado por la Interventoría.

**Puntos clave:**
- Solo hasta **15%** del anticipo puede destinarse a compra de maquinaria y equipo; **nunca a alquiler**.
- Los rendimientos financieros deben reintegrarse mensualmente al Instituto.
- La amortización se hace vía deducciones en las **Actas de Recibo Parcial de Obra**, y debe completarse **1 mes antes** del vencimiento del plazo (si el contrato supera 6 meses).
- El Interventor presenta el **Informe de Inversión y Buen Manejo** (<span class="cite" data-doc="MEPI-MN1-IN-2-FR-2">FR-2</span>) en cada informe mensual.`,
        evidence: [{ source_id: "MEPI-MN1-IN-2", source_name: "Instructivo Anticipo Contrato de Obra", snippet: "Sólo se permite hasta el quince por ciento (15%) del valor del anticipo para compra de maquinaria y equipo... No se podrá invertir porcentaje alguno del anticipo en alquiler de maquinaria." }],
        location: "MEPI-MN1-IN-2, secciones III a V",
        tags: ["Anticipo", "Obra"]
    },
    {
        id: "kb-anticipo-interventoria",
        procedureId: "anticipo_interventoria",
        keywords: ["anticipo interventoria", "anticipo del interventor"],
        responseContent: `#### Anticipo — Contrato de Interventoría

El Interventor elabora el Plan de Inversión (<span class="cite" data-doc="MEPI-MN1-IN-3-FR-1">FR-1</span>) para aprobación del **Supervisor del contrato de interventoría**, en cuenta conjunta vigilada por este último.

**Uso exclusivo:** equipos de medición, ensayos de laboratorio y topografía, dotación de oficina, arrendamientos, honorarios y nómina. **No aplica para compra ni alquiler de vehículos.**

La amortización se refleja en las **Actas de Costos** de interventoría. El Informe de Inversión y Buen Manejo (<span class="cite" data-doc="MEPI-MN1-IN-3-FR-2">FR-2</span>) va incluido en el informe mensual.`,
        evidence: [{ source_id: "MEPI-MN1-IN-3", source_name: "Instructivo Anticipo Contrato de Interventoría", snippet: "El anticipo se debe utilizar exclusivamente para el proyecto en equipos de medición, ensayos de laboratorio y de topografía... No aplica para compra ni alquiler de vehículos." }],
        location: "MEPI-MN1-IN-3, secciones III a V",
        tags: ["Anticipo", "Interventoría"]
    },
    {
        id: "kb-recibo-parcial",
        procedureId: "recibo_parcial_obra",
        keywords: ["recibo parcial", "acta mensual de obra", "pre-acta", "hoja de ruta"],
        responseContent: `#### Acta de Recibo Parcial de Obra

Documento mensual que registra la obra ejecutada en el periodo y acumulada, con base en las **pre-actas** (obra, ambiental, social, predial, sostenibilidad). Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-4-FR-1">FR-1</span>.

**Puntos clave:**
- Debe radicarse dentro de los **5 días calendario** siguientes al mes ejecutado.
- Si no se ejecuta obra en el mes, se presenta en **$0** indicando las razones.
- Tiene carácter **provisional**: el Interventor puede hacer correcciones en actas posteriores.
- Se acompaña de la **Hoja de Ruta y Orden de Pago** (<span class="cite" data-doc="MEPI-MN1-IN-4-FR-2">FR-2</span>), que registra la trazabilidad del trámite de pago.
- La última acta del contrato debe indicarse expresamente como **"Acta Final"**.`,
        evidence: [{ source_id: "MEPI-MN1-IN-4", source_name: "Instructivo Acta de Recibo Parcial de Obra", snippet: "Las Actas de Recibo Parcial de Obra tienen carácter provisional en lo que se refiere a la calidad de la obra y a las cantidades de obra aprobadas por el Interventor." }],
        location: "MEPI-MN1-IN-4, secciones III a V",
        tags: ["Recibo Parcial", "Pre-actas"]
    },
    {
        id: "kb-ajuste",
        procedureId: "ajuste",
        keywords: ["acta de ajuste", "ajustes", "índices dane", "ajuste de precios"],
        responseContent: `#### Acta de Ajuste

Calcula los ajustes contractuales en los costos de construcción con base en los **índices del DANE**. Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-5-FR-1">FR-1</span> (caso general) o el <span class="cite" data-doc="MEPI-MN1-IN-5-FR-2">FR-2</span> con factor "Ia" (cuando el anticipo se gira después de 120 días calendario del cierre del proceso).

**Puntos clave:**
- El **Acta de Ajuste provisional** se presenta dentro de **5 días calendario** del mes ejecutado.
- El **Acta de Ajuste definitivo** se presenta dentro de 5 días hábiles de publicados los índices DANE del mes, descontando el valor ya pagado en la provisional.
- Si el valor total es negativo, se descuenta en la siguiente acta con valor positivo.
- La numeración debe corresponder con el Acta de Recibo Parcial de Obra del mismo periodo.`,
        evidence: [{ source_id: "MEPI-MN1-IN-5", source_name: "Instructivo Acta de Ajuste", snippet: "El cálculo de los ajustes se realiza sobre el valor básico de obra... con base en los Índices calculados mensualmente por el DANE." }],
        location: "MEPI-MN1-IN-5, secciones III a VI",
        tags: ["Ajuste", "DANE"]
    },
    {
        id: "kb-programa-inversiones",
        procedureId: "programa_inversiones",
        keywords: ["programa de obra", "programa de inversiones", "cronograma", "gantt", "curva s", "reprogramación"],
        responseContent: `#### Programa de Obra, Programa de Inversiones y Seguimiento

El **Programa de Obra** (diagrama de Gantt, con ruta crítica) se presenta dentro de **3 días hábiles** desde la suscripción del contrato. El **Programa de Inversiones** (<span class="cite" data-doc="MEPI-MN1-IN-6-FR-1">FR-1</span>) organiza las inversiones por Grandes Partidas de Pago (GPP), con la "curva S" como representación gráfica acumulada.

**Puntos clave:**
- Siempre que se actualice el Programa de Obra debe actualizarse el de Inversiones, y viceversa.
- La **Reprogramación** se requiere por adiciones, suspensiones o modificación de cantidades, y **no puede ser retroactiva**.
- El **Seguimiento mensual** (<span class="cite" data-doc="MEPI-MN1-IN-6-FR-2">FR-2</span>) es requisito para el pago del Acta de Recibo Parcial de Obra correspondiente.`,
        evidence: [{ source_id: "MEPI-MN1-IN-6", source_name: "Instructivo Programa de Obra e Inversiones", snippet: "El Seguimiento al Programa de Inversiones debe ir anexo al Acta de Recibo parcial de obra, siendo requisito para el pago correspondiente." }],
        location: "MEPI-MN1-IN-6, secciones IV a VI",
        tags: ["Programa de Obra", "Reprogramación"]
    },
    {
        id: "kb-modificacion-cantidades",
        procedureId: "modificacion_cantidades",
        keywords: ["modificación de cantidades", "cantidades de obra", "acta de modificación"],
        responseContent: `#### Acta de Modificación de Cantidades de Obra

Registra los aumentos o disminuciones de cantidades de obra, originadas por contrato adicional en valor o necesidades del proyecto. Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-7-FR-1">FR-1</span>.

**Puntos clave:**
- El valor total actualizado **nunca puede exceder** el valor total del contrato vigente.
- Si requiere recursos adicionales, el **contrato adicional debe suscribirse antes** del Acta de Modificación.
- Debe acompañarse de la Reprogramación al Programa de Inversiones y la actualización del Programa de Obra.
- Si involucra ítems no previstos, debe citarse el número y fecha del Acta de Fijación correspondiente (MEPI-MN1-IN-10-FR-4).`,
        evidence: [{ source_id: "MEPI-MN1-IN-7", source_name: "Instructivo Acta de Modificación de Cantidades de Obra", snippet: "El valor total actualizado del Acta de Modificación de Cantidades de Obra, no puede por ningún motivo exceder el valor total del contrato vigente." }],
        location: "MEPI-MN1-IN-7, secciones III y IV",
        tags: ["Modificación de Cantidades"]
    },
    {
        id: "kb-acta-costos",
        procedureId: "acta_costos",
        keywords: ["acta de costos", "costos de interventoría", "pago de interventoría"],
        responseContent: `#### Acta de Costos de Interventoría

Registra mensualmente los costos de personal y otros costos directos de la interventoría, según la propuesta económica aprobada. Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-8-FR-1">FR-1</span>.

**Puntos clave:**
- Requiere certificación de pago de aportes parafiscales y seguridad social, verificada por el Supervisor.
- El personal de interventoría no puede superar el **100% de dedicación** entre todos sus proyectos (declaración jurada).
- Se acompaña de la **Hoja de Ruta y Orden de Pago** (<span class="cite" data-doc="MEPI-MN1-IN-8-FR-2">FR-2</span>).
- La última acta debe indicarse expresamente como **"Acta Final de Costos"**.`,
        evidence: [{ source_id: "MEPI-MN1-IN-8", source_name: "Instructivo Acta de Costos", snippet: "El Interventor debe velar porque el personal de interventoría adscrito a la ejecución del proyecto cumpla con lo expresado en la declaración juramentada acerca de que su dedicación total... no supera el 100%." }],
        location: "MEPI-MN1-IN-8, secciones III a V",
        tags: ["Acta de Costos", "Interventoría"]
    },
    {
        id: "kb-modificacion-costos",
        procedureId: "modificacion_costos",
        keywords: ["modificación de costos", "plan de cargas", "reprogramación plan de cargas"],
        responseContent: `#### Acta de Modificación de Costos y Plan de Cargas

Surge por actualización de tarifas, contrato adicional, prórroga o suspensión. Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-9-FR-1">FR-1</span>.

**Puntos clave:**
- El **Plan de Cargas Inicial** (<span class="cite" data-doc="MEPI-MN1-IN-9-FR-2">FR-2</span>) se presenta dentro de **10 días calendario** desde el inicio del contrato.
- Salvo adición en valor, las modificaciones deben **mantener el valor total del contrato** (redistribución de recursos).
- La **Reprogramación al Plan de Cargas** debe coincidir con la "Ejecución Total Acumulada" del Acta de Modificación en trámite.
- El **Plan de Cargas Final** se presenta junto con el Acta de Entrega y Recibo Definitivo de Interventoría.`,
        evidence: [{ source_id: "MEPI-MN1-IN-9", source_name: "Instructivo Acta de Modificación de Costos y Plan de Cargas", snippet: "Terminado el plazo del contrato de interventoría, el Interventor debe presentar el Plan de Cargas Final actualizado con el Acta de Entrega y Recibo Definitivo." }],
        location: "MEPI-MN1-IN-9, secciones III a V",
        tags: ["Plan de Cargas", "Modificación de Costos"]
    },
    {
        id: "kb-adicion-obra",
        procedureId: "adicion_obra",
        keywords: ["adición obra", "prórroga obra", "modificación obra", "adicion al contrato de obra"],
        responseContent: `#### Solicitud de Adición, Modificación y Prórroga — Contrato de Obra

Análogo al trámite de interventoría (IN-13) pero para el **contrato de obra**. El Contratista presenta la solicitud escrita a la Interventoría, quien diligencia el <span class="cite" data-doc="MEPI-MN1-IN-12-FR-1">FR-1</span> con justificación técnica, jurídica, financiera, presupuestal, ambiental, social, predial y de sostenibilidad.

**Puntos clave:**
- Debe anexarse el proyecto de Acta de Modificación de Cantidades de Obra y la Reprogramación al Programa de Inversiones.
- Verificar garantías y seguros **actualizados** antes de la minuta.
- Presentación con antelación mínima de **30 días calendario** al vencimiento.
- Solo se entiende aprobada con la **suscripción del Acta** del Comité de Contratación.`,
        evidence: [{ source_id: "MEPI-MN1-IN-12", source_name: "Instructivo Solicitud de Adición, Modificación y Prórroga Contrato de Obra", snippet: "La solicitud de adición y/o prórroga y/o modificación solo se entiende aprobada por el Comité con la suscripción del Acta correspondiente." }],
        location: "MEPI-MN1-IN-12, secciones III y IV",
        tags: ["Adición", "Obra"]
    },
    {
        id: "kb-comite-reunion",
        procedureId: "comite_reunion",
        keywords: ["comité de obra", "acta de reunión", "reunión semanal"],
        responseContent: `#### Acta de Comité de Obra y Acta de Reunión

El **Comité de Obra** es semanal, dirigido por la Interventoría, para seguimiento físico, financiero, ambiental, social y predial. Se diligencia en el <span class="cite" data-doc="MEPI-MN1-IN-14-FR-1">FR-1</span>. Los Directores y personal con dedicación 100% deben asistir **presencialmente**.

Para reuniones distintas al Comité de Obra (pueden ser virtuales), se usa el **Acta de Reunión** (<span class="cite" data-doc="MEPI-MN1-IN-14-FR-2">FR-2</span>).

**Importante:** las decisiones tomadas en el Comité **no modifican por sí solas** el contrato de obra ni de interventoría — se requiere el trámite contractual formal.`,
        evidence: [{ source_id: "MEPI-MN1-IN-14", source_name: "Instructivo Acta de Comité de Obra y de Reunión", snippet: "Las decisiones tomadas en el Comité de Obra, no pueden modificar ni modifican por si solas el Contrato de Obra ni el contrato de Interventoría suscritos." }],
        location: "MEPI-MN1-IN-14, secciones III a V",
        tags: ["Comité de Obra", "Acta de Reunión"]
    },
    {
        id: "kb-recibo-obra",
        procedureId: "recibo_obra",
        keywords: ["recibo definitivo de obra", "visita previa", "entrega de obra"],
        responseContent: `#### Visita Previa y Recibo Definitivo de Obra

Distinto del recibo de la Interventoría (IN-17): aquí se recibe la **obra física**. La visita previa conjunta (<span class="cite" data-doc="MEPI-MN1-IN-16-FR-1">FR-1</span>) se hace con mínimo **30 días calendario** antes del vencimiento (15 días si el plazo es menor a 6 meses), documentando con fotos las correcciones pendientes.

El día del vencimiento se suscribe el **Acta de Entrega y Recibo Definitivo de Obra** (<span class="cite" data-doc="MEPI-MN1-IN-16-FR-2">FR-2</span>), que certifica que las obras cumplen calidad y especificaciones.

**Importante:** si el Contratista no corrige lo pactado en la visita previa, el Interventor recibe la obra **en el estado en que se encuentre** y descuenta el valor de lo no corregido, iniciando el proceso sancionatorio correspondiente.`,
        evidence: [{ source_id: "MEPI-MN1-IN-16", source_name: "Instructivo Visita Previa y Recibo Definitivo de Obra", snippet: "Si las observaciones y compromisos descritos en el acta de visita previa no son atendidos por parte del Contratista, el Interventor debe proceder a efectuar el recibo definitivo de las obras en el estado en que se encuentren." }],
        location: "MEPI-MN1-IN-16, secciones III a V",
        tags: ["Recibo Definitivo de Obra", "Visita Previa"]
    },
    {
        id: "kb-liquidacion",
        procedureId: "liquidacion",
        keywords: ["liquidación", "liquidacion del contrato", "cierre del contrato", "acta de liquidación"],
        responseContent: `#### Acta de Liquidación — Obra e Interventoría

El **cierre final** de todo el proceso contractual, por mutuo acuerdo o, en su defecto, unilateral. Formatos: <span class="cite" data-doc="MEPI-MN1-IN-18-FR-1">FR-1</span> (obra), <span class="cite" data-doc="MEPI-MN1-IN-18-FR-2">FR-2</span> (interventoría), y FR-3/FR-4 cuando hay saldo a favor de las partes.

**Puntos clave:**
- Si no hay acuerdo o el Contratista no se presenta, INVIAS liquida **unilateralmente dentro de 2 meses** siguientes al vencimiento del plazo para mutuo acuerdo.
- **No se puede liquidar** mientras esté en curso un procedimiento administrativo sancionatorio (debe terminar primero).
- Se determina uno de 3 casos: saldo a favor de INVIAS, del Contratista/Interventor, o de ambos (prevalece el mayor).
- Requiere certificación de la Subdirección Financiera sobre el estado de amortización del anticipo.`,
        evidence: [{ source_id: "MEPI-MN1-IN-18", source_name: "Instructivo Acta de Liquidación", snippet: "Estando en curso un procedimiento administrativo sancionatorio en contra del Contratista o Interventor, solo podrá liquidarse el contrato una vez culminado dicho procedimiento." }],
        location: "MEPI-MN1-IN-18, secciones III a VII",
        tags: ["Liquidación", "Cierre del Contrato"]
    }
];

/* ------------- 3. CONTENIDO COMPLETO (grounding para Gemini / fallback) ------------- */
// Texto íntegro de cada instructivo, usado SOLO cuando la pregunta no
// coincide con la KB local y se necesita contexto real para Gemini.
const CONTENT_STORE = {
    inicio: "MEPI-MN1-IN-1 (v1, enero 2022). Instructivo para el inicio de la ejecución de los contratos de obra e interventoría. Formatos: FR-1 Orden de Inicio Interventoría, FR-2 Orden de Inicio Obra, FR-3 Acta Reunión Técnica Inicial, FR-4 Acta Aprobación Parcial Estudios y Diseños, FR-5 Acta Aprobación Definitiva Estudios y Diseños. [contenido completo cargado en el servidor de respaldo]",
    apu: "MEPI-MN1-IN-10 (v1, enero 2022). Instructivo Análisis de Precios Unitarios. Formatos FR-1 a FR-4 para APU e ítems no previstos. [contenido completo cargado en el servidor de respaldo]",
    suspension: "MEPI-MN1-IN-11 (v1, enero 2022). Instructivo Suspensión, Ampliación y Reanudación. Formatos FR-1 a FR-4. [contenido completo cargado en el servidor de respaldo]",
    adicion: "MEPI-MN1-IN-13 (v1, enero 2022). Instructivo Solicitud de Adición, Modificación y Prórroga Contrato de Interventoría. Formato FR-1. [contenido completo cargado en el servidor de respaldo]",
    informes: "MEPI-MN1-IN-15 (v1, enero 2022). Instructivo Informe Semanal y Mensual de Interventoría. Formatos FR-1 a FR-15. [contenido completo cargado en el servidor de respaldo]",
    recibo: "MEPI-MN1-IN-17 (v1, enero 2022). Instructivo Recibo Definitivo de Interventoría, Informe Final y Documentos Anexos. Formato FR-1. [contenido completo cargado en el servidor de respaldo]",
    anticipo_obra: "MEPI-MN1-IN-2. Instructivo Anticipo Contrato de Obra. El Contratista elabora el Plan de Inversión del Anticipo (FR-1) para aprobación de la Interventoría. Se maneja en cuenta bancaria conjunta o patrimonio autónomo. Solo hasta 15% del anticipo para compra de maquinaria y equipo (nunca alquiler). Los rendimientos financieros se reintegran mensualmente al Instituto. La amortización se hace vía deducciones en las Actas de Recibo Parcial de Obra, completándose 1 mes antes del vencimiento del plazo si el contrato supera 6 meses. Informe de Inversión y Buen Manejo (FR-2) en cada informe mensual.",
    anticipo_interventoria: "MEPI-MN1-IN-3. Instructivo Anticipo Contrato de Interventoría. El Interventor elabora el Plan de Inversión (FR-1) para aprobación del Supervisor del contrato de interventoría, en cuenta conjunta vigilada por este. Uso exclusivo: equipos de medición, ensayos de laboratorio y topografía, dotación de oficina, arrendamientos, honorarios y nómina. No aplica para compra ni alquiler de vehículos. Amortización en Actas de Costos de interventoría. Informe de Inversión y Buen Manejo (FR-2) en el informe mensual.",
    recibo_parcial_obra: "MEPI-MN1-IN-4. Instructivo Acta de Recibo Parcial de Obra. Documento mensual con obra ejecutada en el periodo y acumulada, basado en pre-actas (obra, ambiental, social, predial, sostenibilidad), diligenciado en FR-1. Debe radicarse dentro de 5 días calendario siguientes al mes ejecutado. Si no hay ejecución, se presenta en $0 con razones. Carácter provisional, corregible en actas posteriores. Acompañada de Hoja de Ruta y Orden de Pago (FR-2). La última acta debe indicarse como 'Acta Final'.",
    ajuste: "MEPI-MN1-IN-5. Instructivo Acta de Ajuste. Calcula ajustes contractuales en costos de construcción con base en índices DANE (FR-1, o FR-2 con factor Ia si el anticipo se gira después de 120 días del cierre del proceso). El Acta de Ajuste provisional se presenta dentro de 5 días calendario del mes ejecutado; el Acta de Ajuste definitivo dentro de 5 días hábiles de publicados los índices DANE del mes, descontando lo ya pagado en la provisional. Si el valor total es negativo, se descuenta en la siguiente acta positiva. Debe corresponder con el Acta de Recibo Parcial de Obra del mismo periodo.",
    programa_inversiones: "MEPI-MN1-IN-6. Instructivo Programa de Obra e Inversiones. Programa de Obra (Gantt con ruta crítica) se presenta dentro de 3 días hábiles desde la suscripción del contrato. Programa de Inversiones (FR-1) organiza inversiones por Grandes Partidas de Pago (GPP), con curva S como representación gráfica acumulada. Actualizar uno implica actualizar el otro. La Reprogramación por adiciones, suspensiones o modificación de cantidades no puede ser retroactiva. El Seguimiento mensual (FR-2) es requisito para el pago del Acta de Recibo Parcial de Obra correspondiente.",
    modificacion_cantidades: "MEPI-MN1-IN-7. Instructivo Acta de Modificación de Cantidades de Obra. Registra aumentos o disminuciones de cantidades de obra por contrato adicional en valor o necesidades del proyecto (FR-1). El valor total actualizado nunca puede exceder el valor total del contrato vigente. Si requiere recursos adicionales, el contrato adicional debe suscribirse antes del Acta. Debe acompañarse de Reprogramación al Programa de Inversiones y actualización del Programa de Obra. Si involucra ítems no previstos, citar el Acta de Fijación correspondiente (MEPI-MN1-IN-10-FR-4).",
    acta_costos: "MEPI-MN1-IN-8. Instructivo Acta de Costos. Registra mensualmente costos de personal y otros costos directos de interventoría según la propuesta económica aprobada (FR-1). Requiere certificación de pago de aportes parafiscales y seguridad social, verificada por el Supervisor. El personal de interventoría no puede superar 100% de dedicación entre todos sus proyectos (declaración jurada). Se acompaña de Hoja de Ruta y Orden de Pago (FR-2). La última acta debe indicarse como 'Acta Final de Costos'.",
    modificacion_costos: "MEPI-MN1-IN-9. Instructivo Acta de Modificación de Costos y Plan de Cargas. Surge por actualización de tarifas, contrato adicional, prórroga o suspensión (FR-1). Plan de Cargas Inicial (FR-2) se presenta dentro de 10 días calendario desde el inicio del contrato. Salvo adición en valor, las modificaciones deben mantener el valor total del contrato (redistribución de recursos). La Reprogramación al Plan de Cargas debe coincidir con la Ejecución Total Acumulada del Acta en trámite. El Plan de Cargas Final se presenta junto con el Acta de Entrega y Recibo Definitivo de Interventoría.",
    adicion_obra: "MEPI-MN1-IN-12. Instructivo Solicitud de Adición, Modificación y Prórroga Contrato de Obra. El Contratista presenta solicitud escrita a la Interventoría, quien diligencia FR-1 con justificación técnica, jurídica, financiera, presupuestal, ambiental, social, predial y de sostenibilidad. Anexar proyecto de Acta de Modificación de Cantidades de Obra y Reprogramación al Programa de Inversiones. Verificar garantías y seguros actualizados antes de la minuta. Presentación con antelación mínima de 30 días calendario al vencimiento. Solo se entiende aprobada con la suscripción del Acta del Comité de Contratación.",
    comite_reunion: "MEPI-MN1-IN-14. Instructivo Acta de Comité de Obra y de Reunión. El Comité de Obra es semanal, dirigido por la Interventoría, para seguimiento físico, financiero, ambiental, social y predial (FR-1). Directores y personal con dedicación 100% deben asistir presencialmente. Para reuniones distintas al Comité (pueden ser virtuales) se usa el Acta de Reunión (FR-2). Las decisiones del Comité no modifican por sí solas el contrato de obra ni de interventoría — se requiere el trámite contractual formal.",
    recibo_obra: "MEPI-MN1-IN-16. Instructivo Visita Previa y Recibo Definitivo de Obra. Distinto del recibo de la Interventoría (IN-17): aquí se recibe la obra física. Visita previa conjunta (FR-1) con mínimo 30 días calendario antes del vencimiento (15 días si el plazo es menor a 6 meses), documentando con fotos correcciones pendientes. El día del vencimiento se suscribe el Acta de Entrega y Recibo Definitivo de Obra (FR-2). Si el Contratista no corrige lo pactado, el Interventor recibe la obra en el estado en que se encuentre, descontando el valor de lo no corregido e iniciando el proceso sancionatorio.",
    liquidacion: "MEPI-MN1-IN-18. Instructivo Acta de Liquidación. Cierre final del proceso contractual (obra e interventoría), por mutuo acuerdo o, en su defecto, unilateral. Formatos FR-1 (obra), FR-2 (interventoría), FR-3/FR-4 (saldo a favor de las partes). Si no hay acuerdo o el Contratista no se presenta, INVIAS liquida unilateralmente dentro de 2 meses siguientes al vencimiento del plazo para mutuo acuerdo. No se puede liquidar mientras esté en curso un procedimiento administrativo sancionatorio. Se determina uno de 3 casos de saldo (a favor de INVIAS, del Contratista/Interventor, o de ambos, prevaleciendo el mayor). Requiere certificación de la Subdirección Financiera sobre el estado de amortización del anticipo."
};

/* ---------------------- 4. ESTRUCTURA DE MANUALES (PDF) ---------------------- */
const MANUAL_STRUCTURE = {
    inicio: {
        title: "Inicio de Ejecución",
        docs: [{ id: "IN-1", name: "Inicio Ejecución Obra e Interventoría", code: "MEPI-MN1-IN-1", url: `${BASE_RAW_URL}/MEPI-MN1-IN-1.pdf` }]
    },
    anticipos: {
        title: "Anticipos",
        docs: [
            { id: "IN-2", name: "Anticipo Contrato de Obra", code: "MEPI-MN1-IN-2", url: `${BASE_RAW_URL}/MEPI-MN1-IN-2.pdf` },
            { id: "IN-3", name: "Anticipo Contrato de Interventoría", code: "MEPI-MN1-IN-3", url: `${BASE_RAW_URL}/MEPI-MN1-IN-3.pdf` },
        ]
    },
    pagos: {
        title: "Actas de Pago y Ajustes",
        docs: [
            { id: "IN-4", name: "Acta de Recibo Parcial de Obra", code: "MEPI-MN1-IN-4", url: `${BASE_RAW_URL}/MEPI-MN1-IN-4.pdf` },
            { id: "IN-5", name: "Acta de Ajuste", code: "MEPI-MN1-IN-5", url: `${BASE_RAW_URL}/MEPI-MN1-IN-5.pdf` },
            { id: "IN-8", name: "Acta de Costos (Interventoría)", code: "MEPI-MN1-IN-8", url: `${BASE_RAW_URL}/MEPI-MN1-IN-8.pdf` },
        ]
    },
    tecnica: {
        title: "Gestión Técnica y Modificaciones",
        docs: [
            { id: "IN-6", name: "Programa de Obra e Inversiones", code: "MEPI-MN1-IN-6", url: `${BASE_RAW_URL}/MEPI-MN1-IN-6.pdf` },
            { id: "IN-7", name: "Modificación de Cantidades de Obra", code: "MEPI-MN1-IN-7", url: `${BASE_RAW_URL}/MEPI-MN1-IN-7.pdf` },
            { id: "IN-9", name: "Modificación de Costos y Plan de Cargas", code: "MEPI-MN1-IN-9", url: `${BASE_RAW_URL}/MEPI-MN1-IN-9.pdf` },
            { id: "IN-10", name: "Análisis de Precios Unitarios", code: "MEPI-MN1-IN-10", url: `${BASE_RAW_URL}/MEPI-MN1-IN-10.pdf` },
            { id: "IN-11", name: "Suspensión, Ampliación y Reanudación", code: "MEPI-MN1-IN-11", url: `${BASE_RAW_URL}/MEPI-MN1-IN-11.pdf` },
            { id: "IN-12", name: "Adición, Modificación y Prórroga Obra", code: "MEPI-MN1-IN-12", url: `${BASE_RAW_URL}/MEPI-MN1-IN-12.pdf` },
            { id: "IN-13", name: "Adición, Modificación y Prórroga Interventoría", code: "MEPI-MN1-IN-13", url: `${BASE_RAW_URL}/MEPI-MN1-IN-13.pdf` },
        ]
    },
    seguimiento: {
        title: "Seguimiento y Control",
        docs: [
            { id: "IN-14", name: "Acta de Comité de Obra y de Reunión", code: "MEPI-MN1-IN-14", url: `${BASE_RAW_URL}/MEPI-MN1-IN-14.pdf` },
            { id: "IN-15", name: "Informe Semanal y Mensual", code: "MEPI-MN1-IN-15", url: `${BASE_RAW_URL}/MEPI-MN1-IN-15.pdf` },
        ]
    },
    cierre: {
        title: "Cierre y Liquidación",
        docs: [
            { id: "IN-16", name: "Visita Previa y Recibo Definitivo de Obra", code: "MEPI-MN1-IN-16", url: `${BASE_RAW_URL}/MEPI-MN1-IN-16.pdf` },
            { id: "IN-17", name: "Recibo Definitivo de Interventoría", code: "MEPI-MN1-IN-17", url: `${BASE_RAW_URL}/MEPI-MN1-IN-17.pdf` },
            { id: "IN-18", name: "Acta de Liquidación", code: "MEPI-MN1-IN-18", url: `${BASE_RAW_URL}/MEPI-MN1-IN-18.pdf` },
        ]
    }
};

/* ============================= UTILIDADES ============================= */

// Quita tildes/diacríticos y pasa a minúsculas, para comparar texto sin
// que un acento (o la falta de uno) cambie el resultado de la búsqueda.
function normalizeText(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Compara una palabra clave de la base de conocimiento contra la pregunta
// del usuario. Primero intenta una coincidencia exacta de substring (rápida);
// si no la encuentra, compara por "raíz" de cada palabra (quitando tildes y
// usando solo sus primeros caracteres) para tolerar variaciones de forma
// (ej. "suspende"/"suspenden" vs. "suspensión").
function keywordMatches(query, keyword) {
    const nq = normalizeText(query);
    const nk = normalizeText(keyword);
    if (nq.includes(nk)) return true;
    const words = nk.split(/\s+/).filter(w => w.length >= 4);
    if (words.length === 0) return false;
    return words.every(w => nq.includes(w.slice(0, Math.min(w.length, 6))));
}

// Convierte Markdown (encabezados, negrilla, cursiva, listas) a HTML.
// Las citas embebidas (<span class="cite" data-doc="...">) son HTML crudo
// dentro del texto y marked las deja pasar sin tocarlas.
function renderMarkdown(text) {
    if (window.marked) {
        try { return marked.parse(text); } catch (e) { /* si falla, se muestra el texto plano */ }
    }
    return text;
}
if (window.marked) marked.setOptions({ breaks: true, gfm: true });

/* ============================= APP LOGIC ============================= */
const app = {
    currentProcedure: null,

    init() {
        this.renderNav();
        this.renderProcList();
        this.renderManuals();
        this.renderDefaultRelaciones();
        this.bindEvents();
        this.greet();
    },

    greet() {
        this.addMessage("bot", `¡Hola! Soy **Smart Memory**, tu asistente del Manual de Interventoría de INVIAS. Cubro todos los instructivos y formatos de la última versión aprobada del Manual. Pregúntame lo que necesites y te responderé citando la fuente exacta.`);
    },

    // Deja la pestaña "Relaciones" con el flujo del primer procedimiento
    // visible desde que carga la página, en vez de un panel vacío.
    renderDefaultRelaciones() {
        const first = Object.values(PROCEDURE_INDEX)[0];
        const container = document.getElementById("tab-relaciones");
        if (!first || !container) return;
        container.innerHTML = `
            <p style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Mostrando el flujo de <strong>${first.title}</strong>. Selecciona otro procedimiento (en "Detalles" o en el panel izquierdo) para ver el suyo.</p>
            <div id="mermaid-container"><pre class="mermaid">${first.graph}</pre></div>`;
        if (window.mermaid) {
            container.querySelector(".mermaid").removeAttribute("data-processed");
            mermaid.init(undefined, container.querySelectorAll(".mermaid"));
        }
    },

    renderNav() {
        const nav = document.getElementById("nav-procedures");
        nav.innerHTML = Object.values(PROCEDURE_INDEX).map(p => `
            <div class="nav-item" data-proc="${p.id}">
                <span class="ico">📋</span><span>${p.title}</span>
            </div>`).join("");
        nav.querySelectorAll(".nav-item").forEach(el => {
            el.addEventListener("click", () => this.showDocs(el.dataset.proc));
        });
    },

    renderProcList() {
        const container = document.getElementById("proc-list");
        if (!container) return;
        container.innerHTML = Object.values(PROCEDURE_INDEX).map(p => `
            <div class="proc-card" data-proc="${p.id}">
                <h4>${p.title}</h4>
                <p>${p.summary}</p>
                <span class="code">${p.source_id}</span>
            </div>`).join("");
        container.querySelectorAll(".proc-card").forEach(el => {
            el.addEventListener("click", () => this.showDocs(el.dataset.proc));
        });
    },

    renderManuals() {
        const container = document.getElementById("manual-list");
        if (!container) return;
        const manualsHtml = Object.entries(MANUAL_STRUCTURE).map(([key, group]) => `
            <div class="doc-group">
                <h5>${group.title}</h5>
                ${group.docs.map(d => `<a class="doc-link" href="${d.url}" target="_blank">📄 ${d.code} — ${d.name}</a>`).join("")}
            </div>`).join("");

        // Formatos FR individuales, agrupados por instructivo (IN-1, IN-2, ...).
        const byInstructivo = {};
        Object.entries(FORMATOS).forEach(([code, name]) => {
            const base = code.split("-FR-")[0];
            (byInstructivo[base] = byInstructivo[base] || []).push({ code, name });
        });
        const sortedBases = Object.keys(byInstructivo).sort((a, b) =>
            parseInt(a.match(/IN-(\d+)/)[1]) - parseInt(b.match(/IN-(\d+)/)[1]));
        const formatosHtml = `
            <div class="nav-label" style="margin-top:16px;">Formatos (FR)</div>
            ${sortedBases.map(base => `
                <div class="doc-group">
                    <h5>${base}</h5>
                    ${byInstructivo[base].map(f => `<a class="doc-link" href="${BASE_FORMATOS_URL}/${f.code}.pdf" target="_blank">📎 FR-${f.code.split("-FR-")[1]} — ${f.name}</a>`).join("")}
                </div>`).join("")}`;

        container.innerHTML = manualsHtml + formatosHtml;
    },

    showDocs(procId) {
        this.currentProcedure = procId;
        const p = PROCEDURE_INDEX[procId];
        if (!p) return;
        document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.proc === procId));

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelector('[data-tab="detalles"]').classList.add("active");
        document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
        document.getElementById("tab-detalles").classList.remove("hidden");

        document.getElementById("tab-detalles").innerHTML = `
            <h3 style="color:var(--secondary); margin-bottom:6px;">${p.title}</h3>
            <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:12px;">${p.summary}</p>
            <table class="checklist-table">
                <tr><th>Paso</th><th>Responsable</th><th>Cita</th></tr>
                ${p.checklist.map(c => `<tr><td>${c.step}</td><td>${c.responsible}</td><td>${renderCitation(c.citation)}</td></tr>`).join("")}
            </table>
            <button class="chip" style="margin-top:14px;" onclick="app.openChecklistModal('${procId}')">Ver checklist completo / Exportar CSV</button>`;

        document.getElementById("tab-relaciones").innerHTML = `<div id="mermaid-container"><pre class="mermaid">${p.graph}</pre></div>`;
        if (window.mermaid) {
            document.getElementById("tab-relaciones").querySelector(".mermaid").removeAttribute("data-processed");
            mermaid.init(undefined, document.querySelectorAll(".mermaid"));
        }
    },

    openChecklistModal(procId) {
        const p = PROCEDURE_INDEX[procId];
        const modal = document.getElementById("checklist-modal");
        document.getElementById("modal-title").innerText = p.title;
        document.getElementById("modal-body").innerHTML = `
            <table class="checklist-table">
                <tr><th>Paso</th><th>Evidencia</th><th>Responsable</th><th>Cita</th></tr>
                ${p.checklist.map(c => `<tr><td>${c.step}</td><td>${c.evidence}</td><td>${c.responsible}</td><td>${renderCitation(c.citation)}</td></tr>`).join("")}
            </table>
            <button class="chip" style="margin-top:14px;" onclick="app.exportCSV('${procId}')">⬇ Exportar CSV</button>`;
        modal.classList.add("open");
    },

    exportCSV(procId) {
        const p = PROCEDURE_INDEX[procId];
        let csv = "Paso,Evidencia,Responsable,Cita\n";
        p.checklist.forEach(c => { csv += `"${c.step}","${c.evidence}","${c.responsible}","${c.citation}"\n`; });
        const blob = new Blob([csv], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `checklist_${procId}.csv`;
        link.click();
    },

    closeModal() { document.getElementById("checklist-modal").classList.remove("open"); },

    bindEvents() {
        document.getElementById("send-btn").addEventListener("click", () => this.sendQuery());
        document.getElementById("chat-input").addEventListener("keypress", (e) => { if (e.key === "Enter") this.sendQuery(); });
        document.querySelectorAll(".chip[data-query]").forEach(el => {
            el.addEventListener("click", () => { document.getElementById("chat-input").value = el.dataset.query; this.sendQuery(); });
        });
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
                document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
            });
        });
        document.getElementById("modal-close")?.addEventListener("click", () => this.closeModal());
        document.getElementById("sidebar-toggle")?.addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
        document.getElementById("details-toggle")?.addEventListener("click", () => document.querySelector(".details-panel").classList.toggle("open"));
        document.getElementById("global-search")?.addEventListener("input", (e) => this.filterProcedures(e.target.value));
    },

    // Filtra en vivo el panel izquierdo (nav) y la lista de "Detalles" por
    // título o código de procedimiento, sin tildes y sin distinguir mayúsculas.
    filterProcedures(term) {
        const t = normalizeText(term.trim());
        document.querySelectorAll("#nav-procedures .nav-item").forEach(el => {
            el.style.display = !t || normalizeText(el.textContent).includes(t) ? "" : "none";
        });
        document.querySelectorAll("#proc-list .proc-card").forEach(el => {
            el.style.display = !t || normalizeText(el.textContent).includes(t) ? "" : "none";
        });
    },

    addMessage(role, html) {
        const box = document.getElementById("chat-messages");
        const div = document.createElement("div");
        div.className = `msg ${role}`;
        // El Markdown (###, **negrilla**, listas) solo se interpreta en los
        // mensajes del bot; el texto del usuario se muestra tal cual lo escribió.
        div.innerHTML = role === "bot" ? renderMarkdown(html) : html;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        return div;
    },

    findInKB(query) {
        let best = null, bestScore = 0;
        KNOWLEDGE_BASE.forEach(entry => {
            let score = 0;
            entry.keywords.forEach(k => { if (keywordMatches(query, k)) score += k.length; });
            if (score > bestScore) { bestScore = score; best = entry; }
        });
        return bestScore > 0 ? best : null;
    },

    async sendQuery() {
        const input = document.getElementById("chat-input");
        const query = input.value.trim();
        if (!query) return;
        this.addMessage("user", query);
        input.value = "";

        const hit = this.findInKB(query);
        if (hit) {
            this.showDocs(hit.procedureId);
            setTimeout(() => this.addMessage("bot", hit.responseContent + `<br><small style="color:var(--text-muted)">📍 Fuente: ${hit.location}</small>`), 250);
            return;
        }

        // Fallback: Gemini (si está configurado) con el contenido del manual como contexto
        if (!GEMINI_BACKEND_URL) {
            this.addMessage("bot", `No encontré una coincidencia exacta en la base local para esa pregunta. Puedes reformularla usando términos como <em>inicio, APU, suspensión, adición, informes o recibo definitivo</em>, o contactar al equipo para ampliar la base de conocimiento.`);
            return;
        }

        const loadingMsg = this.addMessage("loading", "🤖 Consultando con IA generativa (Gemini)...");
        try {
            // Contexto corto (solo títulos + códigos) en vez del contenido completo:
            // Apps Script maneja CORS de forma más confiable en GET, y un contexto
            // corto mantiene la URL dentro de límites seguros.
            const context = Object.values(PROCEDURE_INDEX)
                .map(p => `${p.source_id}: ${p.title}`)
                .join(" | ");
            const url = `${GEMINI_BACKEND_URL}?q=${encodeURIComponent(query)}&ctx=${encodeURIComponent(context)}`;
            const resp = await fetch(url, { method: "GET" });
            const data = await resp.json();
            loadingMsg.remove();
            if (data.answer) {
                this.addMessage("bot", data.answer + `<br><small style="color:var(--text-muted)">🤖 Respuesta generada por IA — verifica siempre contra el manual oficial.</small>`);
            } else {
                this.addMessage("bot", "El servicio de IA no respondió correctamente. Intenta reformular tu pregunta.");
            }
        } catch (err) {
            loadingMsg.remove();
            this.addMessage("bot", "No fue posible conectar con el servicio de IA en este momento. Intenta con palabras clave como <em>inicio, APU, suspensión, adición, informes, recibo</em>.");
        }
    }
};

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("cite")) {
        const fullCode = e.target.dataset.doc; // ej. MEPI-MN1-IN-11-FR-1
        if (FORMATOS[fullCode]) {
            window.open(`${BASE_FORMATOS_URL}/${fullCode}.pdf`, "_blank");
            return;
        }
        const code = fullCode.split("-FR-")[0];
        const proc = Object.values(PROCEDURE_INDEX).find(p => p.source_id === code);
        if (proc) app.showDocs(proc.id);
    }
});

document.addEventListener("DOMContentLoaded", () => app.init());

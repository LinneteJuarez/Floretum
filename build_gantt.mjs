import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const artifactTool = pathToFileURL('C:\\Users\\Win11\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\@oai\\artifact-tool\\dist\\artifact_tool.mjs').href;
const { SpreadsheetFile, Workbook } = await import(artifactTool);

const outputDir = 'C:\\Users\\Win11\\Documents\\Tesis\\outputs\\gantt_archivo_vivo';
await fs.mkdir(outputDir, { recursive: true });

const wb = Workbook.create();
const sh = wb.worksheets.add('Gantt');
sh.showGridLines = false;
sh.tabColor = '#2F6B5F';

const periods = [
  'S11','S12','S13','S14','S15','S16',
  'V1','V2','V3','V4',
  'S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14','S15','S16'
];
const periodDisplays = [
  'S11\n30 nov–6 dic', 'S12\n7–13 dic', 'S13\n14–20 dic', 'S14\n21–27 dic', 'S15\n28 dic–3 ene', 'S16\n4–10 ene',
  'V1\n11–17 ene', 'V2\n18–24 ene', 'V3\n25–31 ene', 'V4\n1–7 feb',
  'S1\n8–14 feb', 'S2\n15–21 feb', 'S3\n22–28 feb', 'S4\n1–7 mar', 'S5\n8–14 mar', 'S6\n15–21 mar',
  'S7\n22–28 mar', 'S8\n29 mar–4 abr', 'S9\n5–11 abr', 'S10\n12–18 abr', 'S11\n19–25 abr', 'S12\n26 abr–2 may',
  'S13\n3–9 may', 'S14\n10–16 may', 'S15\n17–23 may', 'S16\n24–30 may'
];
const headers = ['ID','Etapa / fase','Actividad o entregable','Responsable / nota', ...periodDisplays];

const tasks = [
  ['E1.1','Etapa 1','Investigación botánica y biocultural','Dalia: características, historia, usos y variables','S11','S12'],
  ['E1.2','Etapa 1','Configuración de Raspberry Pi y captura autónoma','Sistema de captura funcional','S11','S11'],
  ['E1.3','Etapa 1','Procesamiento de imágenes y extracción de variables','Datos estructurados en JSON o CSV','S12','S12'],
  ['E1.4','Etapa 1','Experimentación con sonificación','Demostración sonora basada en datos','S13','S13'],
  ['E1.5','Etapa 1','Integración 3D, información y audio','Primer prototipo web integrado','S14','S14'],
  ['E1.6','Etapa 1','Pruebas y ajustes','Resultados, problemas y limitaciones','S15','S15'],
  ['E1.7','Etapa 1','Documentación y presentación','Prueba de concepto y memoria técnica','S16','S16'],
  ['V.1','Vacaciones','Organización documental y técnica','Repositorio y materiales organizados','V1','V1'],
  ['V.2','Vacaciones','Investigación y clasificación preliminar','Matriz cualitativa y guía de entrevistas','V2','V2'],
  ['V.3','Vacaciones','Descanso','Sin actividades programadas','V3','V3'],
  ['V.4','Vacaciones','Preparación visual y tecnológica opcional','Moodboard y estructura web inicial','V4','V4'],
  ['E3.1','Etapa 3 · Fase 1','Profundización etnobotánica y ampliación cualitativa','Matriz cualitativa consolidada y fichas bioculturales','S1','S3'],
  ['E3.2','Etapa 3 · Fase 2','Sistema de diseño UX/UI e identidad visual','Sistema de diseño, prototipo y componentes iniciales','S4','S6'],
  ['E3.3','Etapa 3 · Fase 3','Refinamiento sonoro y composición multisensorial','Motor de sonificación refinado e integrado','S7','S9'],
  ['E3.4','Etapa 3 · Fase 4','Automatización del análisis visual y replicabilidad','Pipeline automatizado y guía metodológica','S10','S12'],
  ['E3.5','Etapa 3 · Fase 5','Evaluación con usuarios y optimización','Reporte de evaluación y prototipo corregido','S13','S14'],
  ['E3.6','Etapa 3 · Fase 6','Integración final y cierre de tesis','Plataforma, memoria, documentación, video y presentación','S15','S16'],
];

const stageColors = {
  'Etapa 1': '#76A89A',
  'Vacaciones': '#D8B365',
  'Etapa 3 · Fase 1': '#6E8FB5',
  'Etapa 3 · Fase 2': '#7B6FA5',
  'Etapa 3 · Fase 3': '#A66C84',
  'Etapa 3 · Fase 4': '#5E8F91',
  'Etapa 3 · Fase 5': '#B27B55',
  'Etapa 3 · Fase 6': '#3F6D62',
};

sh.mergeCells('A1:AD1');
sh.getRange('A1').values = [['Archivo Vivo Biocultural · Cronograma de Gantt · cierre última semana de mayo 2027']];
sh.mergeCells('A2:AD2');
sh.getRange('A2').values = [['Plan basado en semanas y periodos del documento fuente. S = semana académica; V = periodo vacacional. Cierre previsto: 24–30 de mayo de 2027.']];
sh.getRange('A4:AD4').values = [headers];

const rowValues = tasks.map(t => {
  const [id, stage, activity, note, start, end] = t;
  const startIdx = periods.indexOf(start);
  const endIdx = periods.indexOf(end);
  const timeline = periods.map((_, i) => (i >= startIdx && i <= endIdx ? '■' : ''));
  return [id, stage, activity, note, ...timeline];
});
sh.getRange(`A5:AD${4 + rowValues.length}`).values = rowValues;

// Section bands
sh.mergeCells('E3:J3');
sh.getRange('E3').values = [['Primer semestre · prueba de concepto']];
sh.mergeCells('K3:N3');
sh.getRange('K3').values = [['Vacaciones decembrinas']];
sh.mergeCells('O3:AD3');
sh.getRange('O3').values = [['Segundo semestre · consolidación y escalabilidad']];

// Main styling
const font = { name: 'Arial', size: 10, color: '#253238' };
sh.getRange('A1:AD40').format.font = font;
sh.getRange('A1:AD40').format.verticalAlignment = 'center';
sh.getRange('A1:AD1').format = { font: { name: 'Arial', size: 16, bold: true, color: '#1F3F38' } };
sh.getRange('A2:AD2').format = { font: { name: 'Arial', size: 10, italic: true, color: '#5B6A66' } };
sh.getRange('A3:AD3').format = { fill: '#E8EFEC', font: { name: 'Arial', size: 10, bold: true, color: '#315A50' }, horizontalAlignment: 'center' };
sh.getRange('A4:AD4').format = { fill: '#2F6B5F', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', wrapText: true };
sh.getRange(`A5:AD${4 + rowValues.length}`).format.wrapText = true;
sh.getRange(`A5:D${4 + rowValues.length}`).format.borders = { bottom: { style: 'thin', color: '#D9E2DE' } };
sh.getRange(`E5:AD${4 + rowValues.length}`).format.horizontalAlignment = 'center';
sh.getRange(`E5:AD${4 + rowValues.length}`).format.borders = { insideVertical: { style: 'thin', color: '#E4EBE8' }, bottom: { style: 'thin', color: '#D9E2DE' } };

// Color Gantt bars and stage cells
tasks.forEach((t, idx) => {
  const row = 5 + idx;
  const stage = t[1];
  const startIdx = periods.indexOf(t[4]);
  const endIdx = periods.indexOf(t[5]);
  const startCol = 5 + startIdx; // zero-based col for E = 4, but A1 col is 1
  const endCol = 5 + endIdx;
  const startLetter = colLetter(startCol);
  const endLetter = colLetter(endCol);
  sh.getRange(`B${row}`).format = { fill: stageColors[stage] || '#D9E2DE', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
  sh.getRange(`${startLetter}${row}:${endLetter}${row}`).format = { fill: stageColors[stage] || '#76A89A', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
});

// Notes and legend
sh.getRange('A25:D25').values = [['Leyenda', '', '', '']];
sh.getRange('A25:D25').format = { fill: '#E8EFEC', font: { name: 'Arial', size: 10, bold: true, color: '#315A50' } };
sh.getRange('A26:D33').values = [
  ['Color', 'Etapa / fase', 'Significado', ''],
  ['■', 'Etapa 1', 'Experimentación y prueba de concepto', ''],
  ['■', 'Vacaciones', 'Organización y preparación', ''],
  ['■', 'Etapa 3 · Fase 1–2', 'Investigación y sistema UX/UI', ''],
  ['■', 'Etapa 3 · Fase 3–4', 'Sonificación y automatización visual', ''],
  ['■', 'Etapa 3 · Fase 5–6', 'Evaluación, integración y cierre', ''],
  ['Nota', 'Duración', 'Las barras muestran el intervalo previsto en el documento fuente.', ''],
  ['Cierre', 'Última semana de mayo de 2027', 'Semana final prevista: 24–30 de mayo.', ''],
];
sh.getRange('A26:D33').format.wrapText = true;
sh.getRange('A26:D26').format = { fill: '#2F6B5F', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
sh.getRange('A27:A32').format.horizontalAlignment = 'center';
sh.getRange('A27').format.font = { name: 'Arial', size: 12, bold: true, color: '#76A89A' };
sh.getRange('A28').format.font = { name: 'Arial', size: 12, bold: true, color: '#D8B365' };
sh.getRange('A29').format.font = { name: 'Arial', size: 12, bold: true, color: '#6E8FB5' };
sh.getRange('A30').format.font = { name: 'Arial', size: 12, bold: true, color: '#A66C84' };
sh.getRange('A31').format.font = { name: 'Arial', size: 12, bold: true, color: '#B27B55' };

// Details table below
sh.getRange('F25:J25').values = [['Detalle de actividades', '', '', '', '']];
sh.getRange('F25:J25').format = { fill: '#E8EFEC', font: { name: 'Arial', size: 10, bold: true, color: '#315A50' } };
sh.getRange('F26:J26').values = [['ID', 'Etapa / fase', 'Actividad', 'Inicio', 'Fin']];
sh.getRange('F26:J26').format = { fill: '#2F6B5F', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center' };
sh.getRange('F27:J43').values = tasks.map(t => [t[0], t[1], t[2], t[4], t[5]]);
sh.getRange('F27:J43').format.wrapText = true;
sh.getRange('F27:J43').format.borders = { bottom: { style: 'thin', color: '#D9E2DE' } };
sh.getRange('F:F').format.columnWidth = 9;
sh.getRange('G:G').format.columnWidth = 18;
sh.getRange('H:H').format.columnWidth = 34;
sh.getRange('I:J').format.columnWidth = 8;
sh.getRange('F27:J43').format.rowHeight = 34;

// Dimensions and panes
sh.getRange('A:A').format.columnWidth = 10;
sh.getRange('B:B').format.columnWidth = 20;
sh.getRange('C:C').format.columnWidth = 38;
sh.getRange('D:D').format.columnWidth = 32;
sh.getRange('E:AD').format.columnWidth = 5.5;
sh.getRange('A1:AD43').format.rowHeight = 22;
sh.getRange('A1:AD2').format.rowHeight = 24;
sh.getRange('A3:AD3').format.rowHeight = 28;
sh.getRange('A4:AD4').format.rowHeight = 48;
sh.getRange('A25:J26').format.rowHeight = 24;
sh.getRange('A1:AD43').format.borders = { bottom: { style: 'thin', color: '#E4EBE8' } };
sh.freezePanes.freezeRows(4);
sh.freezePanes.freezeColumns(4);

workbookRecalculate(wb);

const inspect = await wb.inspect({ kind: 'table', range: 'Gantt!A1:AD22', include: 'values,formulas', tableMaxRows: 22, tableMaxCols: 30, maxChars: 12000 });
await fs.writeFile(`${outputDir}\\inspect.txt`, inspect.ndjson || String(inspect));
const preview = await wb.render({ sheetName: 'Gantt', range: 'A1:AD43', scale: 1, format: 'png' });
await fs.writeFile(`${outputDir}\\gantt_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(`${outputDir}\\archivo_vivo_biocultural_gantt.xlsx`);

function workbookRecalculate(workbook) {
  workbook.recalculate();
}
function colLetter(colNum) {
  let n = colNum;
  let s = '';
  while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
  return s;
}


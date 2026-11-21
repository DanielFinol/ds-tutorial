// Interface strings. Lesson text is translated separately (see scripts/i18n.mjs).
export const LANGS = ['en', 'es'] as const;
export type Lang = (typeof LANGS)[number];

export const AUTHOR = { name: 'Daniel E. Finol-González', url: 'https://danielfinol.github.io/' };

export const ui = {
  en: {
    langName: 'English',
    site: 'Data Science at Work',
    brand: ['Data Science', 'at Work'],
    description: 'Hands-on practice in the day-to-day skills of a working data scientist. Real Python and SQL, in your browser.',
    lessons: 'Lessons',
    footer:
      'All code runs locally in your browser (Python via Pyodide, SQL via DuckDB): no server, no sign-up. Your work is saved in this browser. Works offline after your first visit.',
    lede: (n: number, hours: number) =>
      `You know the theory. This is the practice: ${n} hands-on lessons (about ${hours} hours) in the tools and habits a data scientist uses in today's workplace. Every lesson is a series of real tasks on one company's data, run and checked right here in your browser.`,
    start: 'Start →',
    continue: 'Continue →',
    progress: '{n} of {total} lessons complete',
    lesson: 'Lesson',
    markComplete: 'Mark as complete',
    completed: '✓ Completed',
    allLessons: 'All lessons',
    exercise: 'Exercise',
    run: 'Run ▶',
    reset: 'Reset',
    hint: 'Hint',
    solution: 'Solution',
    copySolution: 'Copy into editor',
    solved: 'solved',
    onYourMachine: 'On your machine',
    byline: 'By',
    authorRole: 'Computer & Data Scientist',
    authorLink: 'About the author',
  },
  es: {
    langName: 'Español',
    site: 'Ciencia de datos en el trabajo',
    brand: ['Ciencia de datos', 'en el trabajo'],
    description: 'Práctica real de las habilidades del día a día de un científico de datos. Python y SQL de verdad, en tu navegador.',
    lessons: 'Lecciones',
    footer:
      'Todo el código se ejecuta en tu navegador (Python con Pyodide, SQL con DuckDB): sin servidor y sin registro. Tu trabajo se guarda en este navegador. Funciona sin conexión después de la primera visita.',
    lede: (n: number, hours: number) =>
      `Ya conoces la teoría. Esta es la práctica: ${n} lecciones (unas ${hours} horas) sobre las herramientas y los hábitos que usa un científico de datos en el trabajo de hoy. Cada lección es una serie de tareas reales con los datos de una misma empresa, que se ejecutan y se corrigen aquí mismo, en tu navegador.`,
    start: 'Empezar →',
    continue: 'Continuar →',
    progress: '{n} de {total} lecciones completadas',
    lesson: 'Lección',
    markComplete: 'Marcar como completada',
    completed: '✓ Completada',
    allLessons: 'Todas las lecciones',
    exercise: 'Ejercicio',
    run: 'Ejecutar ▶',
    reset: 'Restablecer',
    hint: 'Pista',
    solution: 'Solución',
    copySolution: 'Copiar al editor',
    solved: 'resuelto',
    onYourMachine: 'En tu equipo',
    byline: 'Por',
    authorRole: 'Computer & Data Scientist',
    authorLink: 'Página de presentación y CV',
  },
} as const;

/** Strings used by the in-page cell runtime (src/lib/cell.ts and the Python worker). */
export const runtime = {
  en: {
    starting: 'Starting…',
    earlier: 'Running earlier cells first…',
    loading: 'Loading Python…',
    running: 'Running…',
    correct: '✓ Correct.',
    noOutput: '(no output)',
    notQuite: 'Not quite: ',
    checkFailed: 'the check did not pass yet.',
    unsolved: 'Note: an earlier exercise on this page is not solved yet. Later cells build on it, so solve it first.',
    plotAlt: 'Plot produced by the code above',
    pythonCode: 'Python code',
    sqlCode: 'SQL code',
  },
  es: {
    starting: 'Iniciando…',
    earlier: 'Ejecutando primero las celdas anteriores…',
    loading: 'Cargando Python…',
    running: 'Ejecutando…',
    correct: '✓ Correcto.',
    noOutput: '(sin salida)',
    notQuite: 'Todavía no: ',
    checkFailed: 'la comprobación aún no pasa.',
    unsolved: 'Nota: un ejercicio anterior de esta página aún no está resuelto. Las celdas siguientes dependen de él, así que resuélvelo primero.',
    plotAlt: 'Gráfico generado por el código anterior',
    pythonCode: 'Código Python',
    sqlCode: 'Código SQL',
  },
} as const;

/** Language of a lesson entry id ("es/01-first-ticket" -> "es"). */
export function langOfId(id: string): Lang {
  const prefix = id.split('/')[0];
  return (LANGS as readonly string[]).includes(prefix) && id.includes('/') ? (prefix as Lang) : 'en';
}

/** Language of a site path ("/ds-tutorial/es/lessons/x/" -> "es"). */
export function langOfPath(pathname: string): Lang {
  return /\/es(\/|$)/.test(pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '')) ? 'es' : 'en';
}

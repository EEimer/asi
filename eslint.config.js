import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Verbietet in String-Literalen, was das Theme aushebelt (1:1 aus ../wealth).
 * Greift auf Literal und TemplateElement, damit auch `${...}`-Klassenlisten erfasst
 * werden.
 *
 * Der Grund, warum das hier steht und nicht nur in einer Doku: In dieser Codebase
 * standen vor der Umstellung ~700 rohe Paletten-Klassen. Ohne eine Regel, die beim
 * Lint anschlägt, sind sie in einem halben Jahr wieder da.
 */
const designTokenRules = [
  {
    selector: 'Literal[value=/(?:^|\\s|:)(?:bg|text|border|ring|divide|from|via|to|fill|stroke|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\\b/]',
    message: 'Rohe Tailwind-Palette. Theme-Token verwenden: content/muted (Text), surfaceBorder (Rahmen), panel/inputBg (Flaechen), bg-content/[0.04] (Overlay), success/danger/warning/primary/accent (Semantik).',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|\\s|:)(?:bg|text|border|ring|divide|from|via|to|fill|stroke|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\\b/]',
    message: 'Rohe Tailwind-Palette. Theme-Token verwenden: content/muted (Text), surfaceBorder (Rahmen), panel/inputBg (Flaechen), bg-content/[0.04] (Overlay), success/danger/warning/primary/accent (Semantik).',
  },
  {
    selector: 'Literal[value=/(?:bg|text|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\]/]',
    message: 'Hardcodierter Hex-Wert in einer Klasse. Token verwenden (bg-panel, bg-inputBg, bg-bg, border-surfaceBorder) oder in index.css als Variable definieren.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:bg|text|border|ring|fill|stroke)-\\[#[0-9a-fA-F]{3,8}\\]/]',
    message: 'Hardcodierter Hex-Wert in einer Klasse. Token verwenden (bg-panel, bg-inputBg, bg-bg, border-surfaceBorder) oder in index.css als Variable definieren.',
  },
  {
    selector: 'Literal[value=/(?<![a-z-])h-\\[(?:[2-4][0-9])px\\]|(?<![a-z-])h-\\[[12](?:\\.[0-9]+)?rem\\]/]',
    message: 'Magic-Height auf einem Control. controlHeight aus components/ui/controlSizes verwenden (xs/sm/md) – sonst fluchten Button, Input, Select und SegmentedControl nicht mehr.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?<![a-z-])h-\\[(?:[2-4][0-9])px\\]|(?<![a-z-])h-\\[[12](?:\\.[0-9]+)?rem\\]/]',
    message: 'Magic-Height auf einem Control. controlHeight aus components/ui/controlSizes verwenden (xs/sm/md) – sonst fluchten Button, Input, Select und SegmentedControl nicht mehr.',
  },
]

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'server/data']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // React Compiler / experimental rules (zu noisy für dieses Projekt)
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      // Aus derselben experimentellen v7-Familie: meldet Funktionen, die vor ihrer
      // Deklaration referenziert werden (Hoisting) – in dieser Codebase durchgehend
      // gewollt (`useEffect(() => { load() }, [])` über der Definition von load).
      'react-hooks/immutability': 'off',

      // 22 bewusst leere catch-Bloecke: Netzwerkfehler in Hintergrund-Pollings sollen
      // die Ansicht nicht abbrechen. Leere Bloecke SONST bleiben ein Fehler.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // TS strictness: pragmatisch halten
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'warn',

      // Design-System: rohe Paletten-Farben und Magic-Heights halten das Theme nicht
      // durch (Dark Mode bricht) und umgehen die Tokens aus index.css.
      // 'error', nicht 'warn': in wealth steht die Regel auf warn und wird von
      // `eslint .` ohne --max-warnings nicht durchgesetzt – das UI-Review dort
      // nennt genau das als Grund, warum Verstoesse durchrutschen.
      'no-restricted-syntax': ['error', ...designTokenRules],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Toasts liegen frei über dem Inhalt und brauchen drei eigene Ebenen pro Ton –
    // mit bg-success/10 text-success kollabiert das zu einem Ton. Begründung steht
    // ausführlich in der Datei selbst.
    files: ['src/components/ToastStack.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])

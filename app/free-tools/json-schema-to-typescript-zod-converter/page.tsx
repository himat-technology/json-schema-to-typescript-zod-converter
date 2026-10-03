import type { Metadata } from "next";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { JsonSchemaConverter } from "@/components/tools/json-schema-converter/JsonSchemaConverter";
import { SITE } from "@/lib/site";

const PATH = "/free-tools/json-schema-to-typescript-zod-converter";
const TITLE = "JSON Schema to TypeScript & Zod Converter";
const DESCRIPTION =
  "Convert JSON Schema (Draft 4, 6, 7, 2019-09 and 2020-12) into TypeScript types and Zod validation schemas. Supports $ref, $defs, enums, unions and constraints. Runs 100% in your browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | ${SITE.name}`,
    description: DESCRIPTION,
    url: PATH,
    siteName: SITE.name,
    type: "website",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  {
    title: "Paste, upload or pick a sample",
    body: "Drop in any JSON Schema document, upload a .json file, or start from one of six working samples.",
  },
  {
    title: "Choose output and naming",
    body: "Generate TypeScript, Zod or both. Set the root type name, indentation and whether schema titles drive type names.",
  },
  {
    title: "Copy or download",
    body: "Copy each result, download separate .ts files, or grab both together as a zip. Warnings explain anything that could not be translated.",
  },
];

const FEATURES: Array<{ feature: string; typescript: string; zod: string }> = [
  { feature: "string, number, integer, boolean, null", typescript: "Supported", zod: "Supported (integer → z.int())" },
  { feature: "object, properties, required", typescript: "Supported (optional `?`)", zod: "Supported (.optional())" },
  { feature: "additionalProperties", typescript: "Index signatures", zod: "z.strictObject / z.looseObject / .catchall / z.record" },
  { feature: "array, items, minItems, maxItems", typescript: "Arrays and tuples", zod: "z.array().min().max()" },
  { feature: "prefixItems / tuple items", typescript: "Tuples", zod: "z.tuple() with optional elements and rest" },
  { feature: "enum, const", typescript: "Literal unions", zod: "z.enum / z.literal" },
  { feature: "anyOf, oneOf, allOf", typescript: "Unions and intersections", zod: "z.union / z.xor (exclusive) / .and()" },
  { feature: "$ref, $defs, definitions", typescript: "Named types", zod: "Named schemas, ordered by dependency" },
  { feature: "Recursive $ref", typescript: "Supported", zod: "Zod v4 getters; z.lazy outside objects" },
  { feature: "minLength, maxLength, pattern", typescript: "JSDoc tags", zod: ".min() .max() .regex()" },
  { feature: "minimum, maximum, exclusive*, multipleOf", typescript: "JSDoc tags", zod: ".min() .max() .gt() .lt() .multipleOf()" },
  { feature: "format (email, uri, uuid, date-time, date, ipv4…)", typescript: "JSDoc tags", zod: "z.email(), z.url(), z.uuid(), z.iso.*…" },
  { feature: "uniqueItems, min/maxProperties", typescript: "JSDoc tags", zod: ".refine() checks" },
  { feature: "type arrays and nullable", typescript: "Unions with null", zod: "z.union / .nullable()" },
  { feature: "not, if/then/else, dependentSchemas, contains", typescript: "Not supported (warning)", zod: "Not supported (warning)" },
  { feature: "patternProperties, propertyNames", typescript: "Index signatures (partial)", zod: "Not supported (warning)" },
  { feature: "External / anchor $ref", typescript: "Rejected with an error", zod: "Rejected with an error" },
];

const FAQS = [
  {
    question: "Is my JSON Schema uploaded anywhere?",
    answer:
      "No. Parsing, validation and code generation run in a Web Worker inside your browser. The tool has no conversion API, does not send your schema or generated code to analytics, and does not store your input.",
  },
  {
    question: "Which JSON Schema drafts are supported?",
    answer:
      "Draft 4, Draft 6, Draft 7, Draft 2019-09 and Draft 2020-12. The $schema keyword selects the meta-schema used for validation; schemas without $schema are validated as Draft 7.",
  },
  {
    question: "Which Zod version does the output target?",
    answer:
      "The generated code targets Zod 4 (for example z.email(), z.int(), z.strictObject() and getter-based recursion). Each schema is exported with a matching type derived via z.infer.",
  },
  {
    question: "How are optional and nullable fields handled?",
    answer:
      "Properties not listed in required become optional (`?` in TypeScript, .optional() in Zod). Types that include null, anyOf with a null branch, and OpenAPI-style nullable: true become nullable unions.",
  },
  {
    question: "What happens with keywords that cannot be converted?",
    answer:
      "They are never silently dropped. The diagnostics panel lists each unsupported keyword with its location, flags unknown keywords that may be typos, and explains constraints that TypeScript cannot enforce.",
  },
  {
    question: "Can I use $ref to other files or URLs?",
    answer:
      "No. To keep everything offline and private, only local references such as #/$defs/Address are resolved. Copy external schemas into $defs and reference them locally.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function JsonSchemaConverterPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <li>Home</li>
          <ChevronRight aria-hidden className="size-4" />
          <li>Free Tools</li>
          <ChevronRight aria-hidden className="size-4" />
          <li aria-current="page" className="font-medium text-slate-700">
            JSON Schema to TypeScript &amp; Zod
          </li>
        </ol>
      </nav>

      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Developer Tools</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">{TITLE}</h1>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">
          Turn JSON Schema into clean TypeScript types and ready-to-use Zod validation schemas. Handles nested objects,
          arrays, enums, unions, <code className="font-mono text-[0.9em]">$ref</code> and{" "}
          <code className="font-mono text-[0.9em]">$defs</code>, and common constraints, and tells you exactly what
          could not be translated.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <ShieldCheck aria-hidden className="size-4 shrink-0" />
          Your schemas stay in your browser. Nothing is uploaded to our servers.
        </p>
      </header>

      <JsonSchemaConverter />

      <div className="mt-16 grid gap-16">
        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-2xl font-bold tracking-tight text-navy-900">
            How to convert JSON Schema to TypeScript and Zod
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold text-navy-900">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="engine">
          <h2 id="engine" className="text-2xl font-bold tracking-tight text-navy-900">
            How the conversion engine works
          </h2>
          <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-3">
            <p>
              <strong className="text-navy-900">Validation.</strong> Your input is parsed as JSON and validated against
              the official meta-schema for its draft. Local references, value ranges and regular expressions are checked,
              and unknown keywords are flagged.
            </p>
            <p>
              <strong className="text-navy-900">TypeScript.</strong> Types are produced by the open-source{" "}
              <code className="font-mono">json-schema-to-typescript</code> compiler, running in your browser. Constraints
              TypeScript cannot express are kept as JSDoc tags.
            </p>
            <p>
              <strong className="text-navy-900">Zod.</strong> A dedicated generator emits Zod 4 code. Definitions become
              named, exported schemas in dependency order, and recursive references use Zod getters so the inferred types
              stay accurate.
            </p>
          </div>
        </section>

        <section aria-labelledby="supported-features">
          <h2 id="supported-features" className="text-2xl font-bold tracking-tight text-navy-900">
            Supported JSON Schema features
          </h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Keyword</th>
                  <th scope="col" className="px-4 py-3 font-semibold">TypeScript</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Zod</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEATURES.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="px-4 py-2.5 font-mono text-xs font-medium text-navy-900">{row.feature}</th>
                    <td className="px-4 py-2.5 text-slate-600">{row.typescript}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.zod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-bold tracking-tight text-navy-900">
            Frequently asked questions
          </h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded font-medium text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
                  {faq.question}
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}

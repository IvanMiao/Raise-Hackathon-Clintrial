const workflowSteps = [
  "Upload invoice evidence",
  "Retrieve policy context",
  "Ask Vultr Serverless Inference",
  "Record the decision trail",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="m-0 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          WiseGate
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-6xl">
          Guarded finance decisions for clinical trial payment workflows.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          A full-stack Next.js foundation with TypeScript and TailwindCSS.
          Provider calls stay behind server-side API routes, so browser code
          never receives inference keys.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {workflowSteps.map((step, index) => (
            <div
              className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm"
              key={step}
            >
              <span className="mr-3 font-bold text-risk-blue">
                {index + 1}
              </span>
              {step}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="m-0 text-base font-semibold">Server boundary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Call <code className="rounded bg-slate-100 px-1.5 py-0.5">/api/inference</code>{" "}
            from the app. The route calls Vultr through the OpenAI TypeScript
            SDK on the server only.
          </p>
        </div>
      </section>
    </main>
  );
}

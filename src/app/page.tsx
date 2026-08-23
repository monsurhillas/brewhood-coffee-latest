import { createElement } from "react";

export default function Home() {
    const features = [
      {
              title: "App Router",
              description:
                        "File-based routing with layouts, server components, and streaming built in.",
      },
      {
              title: "TypeScript",
              description:
                        "Strict types configured out of the box for a safer, faster feedback loop.",
      },
      {
              title: "Tailwind CSS",
              description: "Utility-first styling ready to go, no extra configuration needed.",
      },
      {
              title: "Zero-config deploys",
              description: "Push to Vercel and get previews, edge caching, and analytics for free.",
      },
        ];

  return createElement(
        "div",
    { className: "flex flex-1 flex-col bg-white dark:bg-black" },
        createElement(
                "main",
          {
                    className:
                                "mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-12 px-6 py-24 text-center",
          },
                createElement(
                          "div",
                  { className: "flex flex-col items-center gap-4" },
                          createElement(
                                      "span",
                            {
                                          className:
                                                          "rounded-full border border-black/10 px-3 py-1 text-xs font-medium tracking-wide text-zinc-600 dark:border-white/15 dark:text-zinc-400",
                            },
                                      "Next.js starter"
                                    ),
                          createElement(
                                      "h1",
                            {
                                          className:
                                                          "text-4xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-5xl",
                            },
                                      "Your app is ready to ship"
                                    ),
                          createElement(
                                      "p",
                            { className: "max-w-lg text-lg leading-8 text-zinc-600 dark:text-zinc-400" },
                                      "This is a clean Next.js + TypeScript + Tailwind starter, scaffolded and build-verified so it deploys to Vercel without surprises."
                                    )
                        ),
                createElement(
                          "div",
                  { className: "grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2" },
                          features.map((feature) =>
                                      createElement(
                                                    "div",
                                        {
                                                        key: feature.title,
                                                        className: "rounded-xl border border-black/10 p-5 dark:border-white/15",
                                        },
                                                    createElement(
                                                                    "h2",
                                                      { className: "text-sm font-semibold text-black dark:text-zinc-50" },
                                                                    feature.title
                                                                  ),
                                                    createElement(
                                                                    "p",
                                                      { className: "mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400" },
                                                                    feature.description
                                                                  )
                                                  )
                                               )
                        ),
                createElement(
                          "div",
                  { className: "flex flex-col gap-3 text-sm text-zinc-500 dark:text-zinc-500" },
                          createElement(
                                      "p",
                                      null,
                                      "Edit ",
                                      createElement(
                                                    "code",
                                        {
                                                        className:
                                                                          "rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-white/[.08]",
                                        },
                                                    "src/app/page.tsx"
                                                  ),
                                      " to get started."
                                    )
                        )
              )
      );
}

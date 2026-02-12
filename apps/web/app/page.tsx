"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-6"
      style={{ background: "var(--color-bg)" }}
    >
      {/* Logo / brand mark */}
      <div
        className="mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(232, 93, 58, 0.12)" }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-accent)" }}
        >
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      </div>

      {/* Heading */}
      <h1
        className="text-4xl font-bold tracking-tight mb-3 text-center"
        style={{ color: "var(--color-text)" }}
      >
        Ironclaw
      </h1>

      {/* Tagline */}
      <p
        className="text-lg mb-8 text-center max-w-md"
        style={{ color: "var(--color-text-muted)" }}
      >
        Your AI workspace &mdash; chat, knowledge, skills, and memory in one place.
      </p>

      {/* CTA */}
      <Link
        href="/workspace"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: "var(--color-accent)",
          color: "#fff",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--color-accent-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--color-accent)";
        }}
      >
        Open Workspace
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </Link>

      {/* Subtle footer link */}
      <p
        className="mt-12 text-xs"
        style={{ color: "var(--color-text-muted)", opacity: 0.5 }}
      >
        Powered by OpenClaw
      </p>
    </div>
  );
}

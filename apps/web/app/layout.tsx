import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ironclaw",
  description: "AI CRM with an agent that connects to your apps and does the work for you",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

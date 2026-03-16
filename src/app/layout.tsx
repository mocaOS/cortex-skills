import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>CORTEXSKILLS — Knowledge for AI Agents</title>
        <meta name="description" content="Curated knowledge files for AI agents building on Cortex." />
      </head>
      <body>{children}</body>
    </html>
  );
}

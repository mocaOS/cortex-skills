import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cortex Skills — Knowledge Files for AI Agents",
  description:
    "Curated Markdown skill files that teach AI agents how to build on the Cortex intelligence ecosystem. Fetch via HTTP — upload documents, search knowledge graphs, build RAG pipelines, and more.",
  metadataBase: new URL("https://cortexskills.org"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Cortex Skills — Knowledge Files for AI Agents",
    description:
      "Curated Markdown skill files that teach AI agents how to build on the Cortex intelligence ecosystem. Upload, search, graph, RAG — all documented for agents.",
    url: "https://cortexskills.org",
    siteName: "Cortex Skills",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Cortex Skills",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cortex Skills — Knowledge Files for AI Agents",
    description:
      "Curated Markdown skill files that teach AI agents how to build on the Cortex intelligence ecosystem.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    "cortex",
    "AI agents",
    "skill files",
    "knowledge graph",
    "RAG",
    "vector search",
    "hybrid search",
    "document ingestion",
    "LangChain",
    "CrewAI",
    "MCP",
    "GraphRAG",
    "Neo4j",
    "agent memory",
    "API documentation",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import { skills, categories } from "@/data/skills";
import { SkillsClient } from "./skills-client";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Cortex Skills",
    url: "https://cortexskills.org",
    description:
      "Curated Markdown skill files that teach AI agents how to build on the Cortex intelligence ecosystem.",
    publisher: {
      "@type": "Organization",
      name: "MOCA",
      url: "https://museumofcryptoart.com",
    },
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Cortex Skills",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    url: "https://cortexskills.org",
    description:
      "Curated knowledge files for AI agents building on the Cortex intelligence ecosystem. Covers document ingestion, hybrid search, knowledge graphs, RAG, and integrations.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      {/* Server-rendered SEO content — visible to crawlers */}
      <noscript>
        <header>
          <h1>Cortex Skills — Knowledge Files for AI Agents</h1>
          <p>
            Curated Markdown skill files that teach AI agents how to build on
            the Cortex intelligence ecosystem. Fetch the skill you need via HTTP
            and get ground-truth API knowledge.
          </p>
          <p>
            Entry point:{" "}
            <a href="/SKILL.md">cortexskills.org/SKILL.md</a>
          </p>
        </header>
        <main>
          {categories.map((cat) => (
            <section key={cat.id}>
              <h2>
                {cat.label} — {cat.description}
              </h2>
              <ul>
                {skills
                  .filter((s) => s.category === cat.id)
                  .map((skill) => (
                    <li key={skill.slug}>
                      <a href={`/${skill.slug}/SKILL.md`}>
                        <strong>{skill.name}</strong>
                      </a>
                      {" — "}
                      {skill.description}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </main>
      </noscript>

      {/* Hidden from visual display but crawlable */}
      <div className="sr-only" aria-hidden="false">
        <h1>Cortex Skills — Knowledge Files for AI Agents</h1>
        <p>
          Curated Markdown skill files that teach AI agents how to build on the
          Cortex intelligence ecosystem. Covers document upload, hybrid search,
          knowledge graphs, RAG Q&A, collections, integrations with LangChain,
          CrewAI, MCP, and more.
        </p>
        <nav aria-label="Skill files">
          <ul>
            {skills.map((skill) => (
              <li key={skill.slug}>
                <a href={`/${skill.slug}/SKILL.md`}>
                  {skill.name}: {skill.description}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Interactive client component */}
      <SkillsClient />
    </>
  );
}

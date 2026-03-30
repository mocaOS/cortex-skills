"use client";

import { useState } from "react";
import { skills } from "@/data/skills";
import { renderMarkdown } from "@/lib/markdown";

export default function Home() {
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSkill = async (slug: string, title: string) => {
    setModalTitle(title);
    setLoading(true);
    setError(null);
    setModalContent("");
    
    // Show modal immediately
    document.getElementById("modal-overlay")!.style.display = "block";
    document.body.style.overflow = "hidden";

    try {
      const res = await fetch(`/${slug}/SKILL.md`);
      if (!res.ok) throw new Error("Failed to load skill");
      const text = await res.text();
      setModalContent(renderMarkdown(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    document.getElementById("modal-overlay")!.style.display = "none";
    document.body.style.overflow = "";
    setModalContent(null);
  };

  return (
    <>
      <div className="terminal-header">
        <h1 className="terminal-title">CORTEXSKILLS</h1>
        <p className="terminal-subtitle">
          The missing knowledge between AI agents and the Cortex ecosystem.
        </p>
        <p className="mt-4 text-[var(--dim)] text-sm">
          Instead of hallucinating stale API patterns, agents can fetch these curated Markdown files via HTTP to learn exactly how to build on MOCA Library.
        </p>
      </div>

      <ul className="skill-list">
        {skills.map((skill) => (
          <li key={skill.slug} className="skill-item">
            <div className="skill-title">
              <span className="skill-name">{skill.name}</span>
              <span 
                className="skill-url"
                onClick={() => openSkill(skill.slug, skill.name)}
              >
                /cortexskills.com/{skill.slug}/SKILL.md
              </span>
            </div>
            <p className="skill-desc">{skill.description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--dim)]">
        <p>Built by <a href="https://museumofcryptoart.com" target="_blank" rel="noopener noreferrer">MOCA</a>. Open source on <a href="https://github.com/mocaOS/cortex-skills" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
        <p className="mt-2">
          Agent entry point: <a href="/SKILL.md" target="_blank">cortexskills.com/SKILL.md</a>
        </p>
      </div>

      <div id="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div id="modal-content">
          <button id="modal-close" onClick={closeModal}>[X]</button>
          <div className="text-[var(--dim)] text-sm mb-4">Reading: {modalTitle}</div>
          
          {loading && <div className="text-[var(--accent)] blink">Loading skill data...</div>}
          {error && <div className="text-red-500">Error: {error}</div>}
          
          <div id="md-container" dangerouslySetInnerHTML={{ __html: modalContent || "" }} />
        </div>
      </div>

      <style jsx>{`
        .blink { animation: blinker 1s linear infinite; }
        @keyframes blinker { 50% { opacity: 0; } }
      `}</style>
    </>
  );
}

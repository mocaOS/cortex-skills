"use client";

import { useState, useEffect, useCallback } from "react";
import { skills } from "@/data/skills";
import { renderMarkdown } from "@/lib/markdown";

export function SkillsClient() {
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const copyUrl = (slug: string | null, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = slug
      ? `https://cortexskills.org/${slug}/SKILL.md`
      : "https://cortexskills.org/SKILL.md";
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug ?? "__root__");
    setTimeout(() => setCopiedSlug(null), 1500);
  };

  const CopyIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "middle", marginLeft: "6px" }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "middle", marginLeft: "6px" }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const openSkill = async (slug: string, title: string) => {
    setLoading(true);
    setError(null);
    setModalContent("");

    document.getElementById("modal-overlay")!.style.display = "block";
    document.body.style.overflow = "hidden";

    try {
      const res = await fetch(slug ? `/${slug}/SKILL.md` : "/SKILL.md");
      if (!res.ok) throw new Error("Failed to load skill");
      const text = await res.text();
      setModalContent(renderMarkdown(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const closeModal = useCallback(() => {
    document.getElementById("modal-overlay")!.style.display = "none";
    document.body.style.overflow = "";
    setModalContent(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeModal]);

  return (
    <>
      <div
        className="skill-item skill-item-hero"
        onClick={() => openSkill("", "Cortex Skills")}
      >
        <div className="skill-title">
          <span className="skill-name skill-name-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hero-logo" src="/logo.svg" alt="Cortex" />
            Cortex Skills
          </span>
          <button className="skill-url" onClick={(e) => copyUrl(null, e)}>
            {copiedSlug === "__root__"
              ? "copied!"
              : "cortexskills.org/SKILL.md"}
            {copiedSlug === "__root__" ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
        <p className="skill-desc">
          The missing knowledge between AI agents and the Cortex ecosystem.
          Integrate the main skill and let your agent navigate the rest.
        </p>
      </div>

      <ul className="skill-list">
        {skills.map((skill) => (
          <li
            key={skill.slug}
            className="skill-item"
            onClick={() => openSkill(skill.slug, skill.name)}
          >
            <div className="skill-title">
              <span className="skill-name">{skill.name}</span>
              <button
                className="skill-url"
                onClick={(e) => copyUrl(skill.slug, e)}
              >
                {copiedSlug === skill.slug
                  ? "copied!"
                  : `cortexskills.org/${skill.slug}/SKILL.md`}
                {copiedSlug === skill.slug ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            <p className="skill-desc">{skill.description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--dim)]">
        <p>
          Built by{" "}
          <a
            href="https://museumofcryptoart.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            MOCA
          </a>
          . Open source on{" "}
          <a
            href="https://github.com/mocaOS/cortex-skills"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </div>

      <div
        id="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div id="modal-content">
          <button id="modal-close" onClick={closeModal}>
            [X]
          </button>

          {loading && (
            <div className="text-[var(--accent)] blink">
              Loading skill data...
            </div>
          )}
          {error && <div className="text-red-500">Error: {error}</div>}

          <div
            id="md-container"
            dangerouslySetInnerHTML={{ __html: modalContent || "" }}
          />
        </div>
      </div>

      <style jsx>{`
        .blink {
          animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

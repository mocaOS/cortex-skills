import type { MetadataRoute } from "next";
import { skills } from "@/data/skills";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://cortexskills.org";

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/SKILL.md`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...skills.map((skill) => ({
      url: `${base}/${skill.slug}/SKILL.md`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}

/**
 * Lightweight Markdown-to-HTML renderer.
 * Handles headings, code blocks, tables, lists, blockquotes, inline formatting, and links.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" = "ul";
  let listItems: string[] = [];

  function flushList() {
    if (inList && listItems.length > 0) {
      const tag = listType;
      html.push(`<${tag} class="md-list">${listItems.join("")}</${tag}>`);
      listItems = [];
      inList = false;
    }
  }

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      let t = '<div class="md-table-wrap"><table class="md-table">';
      tableRows.forEach((row, i) => {
        const cells = row
          .split("|")
          .filter((c) => c.trim() !== "");
        if (i === 0) {
          t += "<thead><tr>";
          cells.forEach((c) => (t += `<th>${inlineFormat(c.trim())}</th>`));
          t += "</tr></thead><tbody>";
        } else if (i === 1 && /^[\s\-:|]+$/.test(row)) {
          // separator row, skip
        } else {
          t += "<tr>";
          cells.forEach((c) => (t += `<td>${inlineFormat(c.trim())}</td>`));
          t += "</tr>";
        }
      });
      t += "</tbody></table></div>";
      html.push(t);
      tableRows = [];
      inTable = false;
    }
  }

  function inlineFormat(text: string): string {
    // Escape HTML entities
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/_(.+?)_/g, "<em>$1</em>");
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    // Links
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
    );
    return text;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(
          `<pre class="md-code-block"><code class="language-${codeBlockLang}">${codeBuffer.join("\n")}</code></pre>`
        );
        codeBuffer = [];
        inCodeBlock = false;
        codeBlockLang = "";
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim() || "text";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
      continue;
    }

    // YAML frontmatter
    if (i === 0 && line.trim() === "---") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "---") j++;
      i = j; // skip to end of frontmatter
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      flushTable();
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      flushList();
      if (!inTable) inTable = true;
      tableRows.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      html.push(`<h${level} class="md-h${level}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushList();
      html.push(
        `<blockquote class="md-blockquote">${inlineFormat(line.slice(2))}</blockquote>`
      );
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s+/.test(line)) {
      if (!inList || listType !== "ul") {
        flushList();
        inList = true;
        listType = "ul";
      }
      const text = line.replace(/^[\s]*[-*+]\s+/, "");
      listItems.push(`<li>${inlineFormat(text)}</li>`);
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s+/.test(line)) {
      if (!inList || listType !== "ol") {
        flushList();
        inList = true;
        listType = "ol";
      }
      const text = line.replace(/^[\s]*\d+\.\s+/, "");
      listItems.push(`<li>${inlineFormat(text)}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      html.push('<hr class="md-hr" />');
      continue;
    }

    // Paragraph
    flushList();
    html.push(`<p class="md-p">${inlineFormat(line)}</p>`);
  }

  flushList();
  flushTable();

  return html.join("\n");
}

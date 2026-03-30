/**
 * Lightweight Markdown-to-HTML renderer.
 * Handles headings, code blocks, tables, lists (with nesting), blockquotes, inline formatting, and links.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

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
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/_(.+?)_/g, "<em>$1</em>");
    text = text.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
    );
    return text;
  }

  // Collect a contiguous list block (including blank lines between items)
  // starting at index `start`. Returns the HTML and the next index to process.
  function parseListBlock(start: number): { html: string; nextIndex: number } {
    type ListNode = {
      type: "ul" | "ol";
      items: { text: string; children: string }[];
    };

    const stack: ListNode[] = [];
    let i = start;

    function currentIndent(line: string): number {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    }

    function isOlItem(line: string) {
      return /^(\s*)\d+\.\s+/.test(line);
    }

    function isUlItem(line: string) {
      return /^(\s*)[-*+]\s+/.test(line);
    }

    function isListItem(line: string) {
      return isOlItem(line) || isUlItem(line);
    }

    function itemText(line: string): string {
      return line.replace(/^[\s]*(?:\d+\.|[-*+])\s+/, "");
    }

    function itemType(line: string): "ol" | "ul" {
      return isOlItem(line) ? "ol" : "ul";
    }

    // Determine the base indent level (first item)
    const baseIndent = currentIndent(lines[start]);

    while (i < lines.length) {
      const line = lines[i];

      // Empty line — skip if the list continues after at the same or deeper indent
      if (line.trim() === "") {
        let next = i + 1;
        while (next < lines.length && lines[next].trim() === "") next++;
        if (next < lines.length && isListItem(lines[next]) && currentIndent(lines[next]) >= baseIndent) {
          i = next;
          continue;
        }
        break;
      }

      if (!isListItem(line)) break;

      const indent = currentIndent(line);

      // Item at a lower indent means we've exited this nesting level
      if (indent < baseIndent) break;

      const type = itemType(line);
      const text = itemText(line);

      if (stack.length === 0) {
        stack.push({ type, items: [{ text, children: "" }] });
      } else if (indent > baseIndent) {
        // Nested item — append as sub-list to the last item of the current top
        const parent = stack[stack.length - 1];
        const lastItem = parent.items[parent.items.length - 1];

        // Collect all items at this indent level into a sub-list
        const sub = parseListBlock(i);
        lastItem.children += sub.html;
        i = sub.nextIndex;
        continue;
      } else {
        // Same level
        const top = stack[stack.length - 1];
        if (top.type === type) {
          top.items.push({ text, children: "" });
        } else {
          // Type changed at same level (e.g., ol -> ul) — start new list
          stack.push({ type, items: [{ text, children: "" }] });
        }
      }

      i++;
    }

    // Render all lists in the stack
    let result = "";
    for (const list of stack) {
      const tag = list.type;
      const items = list.items
        .map((item) => `<li>${inlineFormat(item.text)}${item.children}</li>`)
        .join("");
      result += `<${tag} class="md-list">${items}</${tag}>`;
    }

    return { html: result, nextIndex: i };
  }

  function isListLine(line: string): boolean {
    return /^[\s]*(?:\d+\.|[-*+])\s+/.test(line);
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
      i = j;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushTable();
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) inTable = true;
      tableRows.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      html.push(`<h${level} class="md-h${level}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      html.push(
        `<blockquote class="md-blockquote">${inlineFormat(line.slice(2))}</blockquote>`
      );
      continue;
    }

    // List (ordered or unordered) — hand off to list parser
    if (isListLine(line)) {
      const result = parseListBlock(i);
      html.push(result.html);
      i = result.nextIndex - 1; // -1 because the for loop increments
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      html.push('<hr class="md-hr" />');
      continue;
    }

    // Paragraph
    html.push(`<p class="md-p">${inlineFormat(line)}</p>`);
  }

  flushTable();

  return html.join("\n");
}

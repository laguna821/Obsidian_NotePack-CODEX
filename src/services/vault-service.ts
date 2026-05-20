import { type App, normalizePath } from "obsidian";
import { getPrimaryAnnotation } from "../data/annotations";
import type { PackCard, WorkbenchCard } from "../types";

export class VaultService {
  constructor(private app: App) {}

  async promoteCard(card: WorkbenchCard, folder: string, author?: string): Promise<string> {
    const folderPath = normalizePath(folder);
    await this.ensureFolder(folderPath);

    const title = this.sanitizeFileName(card.title || card.text.substring(0, 40));
    let filePath = normalizePath(`${folderPath}/${title}.md`);

    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = normalizePath(`${folderPath}/${title} (${counter}).md`);
      counter += 1;
    }

    await this.app.vault.create(filePath, this.buildNoteContent(card, author));
    return filePath;
  }

  async promotePackCard(
    packCard: PackCard,
    sourceCard: WorkbenchCard,
    folder: string,
    author?: string,
  ): Promise<string> {
    const folderPath = normalizePath(folder);
    await this.ensureFolder(folderPath);

    const title = this.sanitizeFileName(packCard.card_name || packCard.main_question.substring(0, 40));
    let filePath = normalizePath(`${folderPath}/${title}.md`);

    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = normalizePath(`${folderPath}/${title} (${counter}).md`);
      counter += 1;
    }

    const baseContent = packCard.obsidian_template || this.buildPackCardContent(packCard, sourceCard, author);
    const content = author && packCard.obsidian_template
      ? this.injectAuthorIntoFrontmatter(baseContent, author)
      : baseContent;
    await this.app.vault.create(filePath, content);
    return filePath;
  }

  async mergeIntoNote(card: WorkbenchCard, notePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!file) throw new Error(`Note not found: ${notePath}`);

    const existing = await this.app.vault.read(file as any);
    await this.app.vault.modify(file as any, `${existing}\n\n---\n\n## Added Card\n\n${card.text}`);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized) return;

    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private sanitizeFileName(name: string): string {
    return (
      name
        .replace(/[\\/:*?"<>|#^[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 60) || "Untitled"
    );
  }

  private escapeFrontmatterValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/[:#\n\r"'\\\[\]{}&*!|>%@`?]/.test(trimmed)) {
      const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return trimmed;
  }

  private buildAuthorLine(author?: string): string {
    if (!author) return "";
    const safe = this.escapeFrontmatterValue(author);
    if (!safe) return "";
    return `author: ${safe}\n`;
  }

  private injectAuthorIntoFrontmatter(template: string, author: string): string {
    const safe = this.escapeFrontmatterValue(author);
    if (!safe) return template;
    if (!template.startsWith("---\n")) return template;
    if (/^author:\s/m.test(template.split("\n---", 1)[0] ?? "")) return template;
    return template.replace(/^---\n/, `---\nauthor: ${safe}\n`);
  }

  private buildNoteContent(card: WorkbenchCard, author?: string): string {
    const tags = card.category ? [`card/${card.kind}`, card.category] : [`card/${card.kind}`];
    if (card.rarity) tags.push(`rarity/${card.rarity}`);

    let content = `---
${this.buildAuthorLine(author)}type: ${card.kind}
contentType: ${card.contentType || "general"}
category: ${card.category || "uncategorized"}
createdAt: ${new Date(card.createdAt).toISOString()}
tags:
${tags.map((tag) => `  - ${tag}`).join("\n")}
---

# ${card.title || card.text.substring(0, 60)}

${card.text}
`;

    const primaryAnnotation = getPrimaryAnnotation(card);
    if (primaryAnnotation?.annotation) {
      content += `\n## AI Annotation\n\n${primaryAnnotation.annotation}\n`;
    }

    if (card.annotations && card.annotations.length > 1) {
      const extras = card.annotations
        .filter((annotation) => annotation.id !== primaryAnnotation?.id && annotation.annotation)
        .map((annotation) => `- ${annotation.label || annotation.agentId || "Annotation"}: ${annotation.annotation}`)
        .join("\n");
      if (extras) content += `\n## Additional Annotations\n\n${extras}\n`;
    }

    const sources = primaryAnnotation?.sources ?? card.sources;
    if (sources && sources.length > 0) {
      content += `\n## Sources\n\n${sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}\n`;
    }

    return content;
  }

  private buildPackCardContent(packCard: PackCard, sourceCard: WorkbenchCard, author?: string): string {
    return `---
${this.buildAuthorLine(author)}type: growth-card
rarity: ${packCard.rarity}
sourceCard: "${sourceCard.text.substring(0, 40)}"
tags:
  - card/${packCard.rarity}
${packCard.suggested_tags.map((tag) => `  - ${tag}`).join("\n")}
---

# ${packCard.card_name}

> ${packCard.hook}

## Main Question

${packCard.main_question}

## Bridge Steps

${packCard.bridge_steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Write Now

${packCard.write_now.map((step) => `- ${step}`).join("\n")}

## Followups

${packCard.followups.map((question) => `- ${question}`).join("\n")}

${packCard.failure_signal ? `## Failure Signal\n\n${packCard.failure_signal}\n` : ""}

## Suggested Links

${packCard.suggested_links.map((link) => `- ${link}`).join("\n")}
`;
  }
}

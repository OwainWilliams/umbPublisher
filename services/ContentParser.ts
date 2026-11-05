import { MarkdownView, Notice, App } from 'obsidian';

export interface ParsedContent {
    title: string;
    tags: string[];
    description?: string;
    featured: boolean;
    status: string;
    excerpt?: string;
    feature_image?: string;
    content: string;
}

export class ContentParser {
    constructor(private app: App) {}

    async parseContent(view: MarkdownView): Promise<ParsedContent | null> {
        const noteFile = view.app.workspace.getActiveFile();
        if (!noteFile) {
            new Notice('No active file found.');
            return null;
        }

        const fileCache = this.app.metadataCache.getFileCache(noteFile);
        const metaMatter = fileCache?.frontmatter;
        const fileContent = await this.app.vault.read(noteFile);

        let content = fileContent;
        if (fileCache?.frontmatterPosition) {
            const { end } = fileCache.frontmatterPosition;
            const lines = fileContent.split('\n');
            content = lines.slice(end.line + 1).join('\n');
        }

        return {
            title: metaMatter?.title || view.file?.basename || 'Untitled',
            tags: metaMatter?.tags || [],
            description: this.parseDescription(metaMatter?.description),
            featured: metaMatter?.featured || false,
            status: metaMatter?.published ? "published" : "draft",
            excerpt: metaMatter?.excerpt || undefined,
            feature_image: metaMatter?.feature_image || undefined,
            content: content,
        };
    }

    /**
     * Frontmatter values can be any YAML type. The description is always treated
     * as plain text: non-strings are stringified and blank values are dropped.
     */
    private parseDescription(value: unknown): string | undefined {
        if (value === null || value === undefined) return undefined;
        const text = (typeof value === 'string' ? value : String(value)).trim();
        return text.length > 0 ? text : undefined;
    }

    getActiveFileTitle(): string | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view ? view.getDisplayText() : null;
    }
}
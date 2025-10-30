import { MarkdownView, Notice, App } from 'obsidian';

export interface ParsedContent {
    title: string;
    tags: string[];
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
            const { start, end } = fileCache.frontmatterPosition;
            const lines = fileContent.split('\n');
            content = lines.slice(end.line + 1).join('\n');
        }

        return {
            title: metaMatter?.title || view.file?.basename || 'Untitled',
            tags: metaMatter?.tags || [],
            featured: metaMatter?.featured || false,
            status: metaMatter?.published ? "published" : "draft",
            excerpt: metaMatter?.excerpt || undefined,
            feature_image: metaMatter?.feature_image || undefined,
            content: content,
        };
    }

    getActiveFileTitle(): string | null {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.getDisplayText) {
            return activeLeaf.getDisplayText();
        }
        return null;
    }
}
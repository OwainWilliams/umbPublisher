import { Notice } from 'obsidian';

export class ErrorHandler {
    static handle(error: unknown, context = 'Operation'): void {
        let message = `${context} failed`;
        
        if (typeof error === 'object' && error !== null && 'message' in error) {
            message += `: ${(error as { message: string }).message}`;
        } else if (typeof error === 'string') {
            message += `: ${error}`;
        }
        
        new Notice(message);
    }

    static async handleAsync(error: unknown, context = 'Operation'): Promise<void> {
        return Promise.resolve(this.handle(error, context));
    }
}
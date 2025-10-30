import { Notice } from 'obsidian';

export class ErrorHandler {
    static handle(error: any, context: string = 'Operation'): void {
        console.error(`${context} failed:`, error);
        
        let message = `${context} failed`;
        
        if (error.message) {
            message += `: ${error.message}`;
        } else if (typeof error === 'string') {
            message += `: ${error}`;
        }
        
        new Notice(message);
    }

    static async handleAsync(error: any, context: string = 'Operation'): Promise<void> {
        return Promise.resolve(this.handle(error, context));
    }
}
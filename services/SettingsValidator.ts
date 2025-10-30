import { umbpublisherSettings } from '../types/index';
import { Notice } from 'obsidian';

export class SettingsValidator {
    static validateBasicSettings(settings: umbpublisherSettings): boolean {
        const required = ['websiteUrl', 'clientId', 'clientSecret'];
        const missing = required.filter(key => !settings[key as keyof umbpublisherSettings]);
        
        if (missing.length > 0) {
            new Notice(`Missing required settings: ${missing.join(', ')}`);
            return false;
        }
        
        return true;
    }
    
    static validatePublishSettings(settings: umbpublisherSettings): boolean {
        if (!this.validateBasicSettings(settings)) {
            return false;
        }
        
        const publishRequired = ['blogDocTypeId', 'titleAlias', 'blogContentAlias'];
        const missing = publishRequired.filter(key => !settings[key as keyof umbpublisherSettings]);
        
        if (missing.length > 0) {
            new Notice(`Missing required publish settings: ${missing.join(', ')}`);
            return false;
        }
        
        return true;
    }
}
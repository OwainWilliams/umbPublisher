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

        // Base requirement: document type and title
        const baseRequired = ['blogDocTypeId', 'titleAlias'];
        const missingBase = baseRequired.filter(key => !settings[key as keyof umbpublisherSettings]);

        if (missingBase.length > 0) {
            new Notice(`Missing required publish settings: ${missingBase.join(', ')}`);
            return false;
        }

        // Validate based on mode
        if (settings.useBlockList) {
            // BlockList mode validation
            const blockListRequired = ['blockListPropertyAlias', 'blockListElementTypeId', 'blockListContentPropertyAlias'];
            const missingBlockList = blockListRequired.filter(key => !settings[key as keyof umbpublisherSettings]);

            if (missingBlockList.length > 0) {
                new Notice(`Missing required BlockList settings: ${missingBlockList.join(', ')}`);
                return false;
            }
        } else {
            // Legacy mode validation
            const legacyRequired = ['blogContentAlias'];
            const missingLegacy = legacyRequired.filter(key => !settings[key as keyof umbpublisherSettings]);

            if (missingLegacy.length > 0) {
                new Notice(`Missing required content settings: ${missingLegacy.join(', ')}`);
                return false;
            }
        }

        return true;
    }
}
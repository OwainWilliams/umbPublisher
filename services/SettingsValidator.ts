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

        // Validate based on content mode
        if (settings.contentMode === 'blockList' || settings.contentMode === 'blockGrid') {
            const blockRequired = ['blockPropertyAlias', 'blockElementTypeId', 'blockContentPropertyAlias'];
            const missingBlock = blockRequired.filter(key => !settings[key as keyof umbpublisherSettings]);

            if (missingBlock.length > 0) {
                const modeLabel = settings.contentMode === 'blockGrid' ? 'Block Grid' : 'Block List';
                new Notice(`Missing required ${modeLabel} settings: ${missingBlock.join(', ')}`);
                return false;
            }
        } else {
            // Property Editor mode validation
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
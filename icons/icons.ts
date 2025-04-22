import { addIcon } from "obsidian";

import umbracoLogo from "./img/umbracidian-logo.svg";

export class UmbracidianIcons {
    private icons = [{ iconId: "umbracidian-logo", svg: umbracoLogo }];

    registerIcons = () => {
        this.icons.forEach(({ iconId, svg }) => {
            addIcon(iconId, svg);
        });
    };
}
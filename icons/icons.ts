import { addIcon } from "obsidian";

import umbracoLogo from "./img/umbPublisher-Logo.svg";

export class umbPublisherIcons {
    private icons = [{ iconId: "umbPublisher-logo", svg: umbracoLogo }];

    registerIcons = () => {
        this.icons.forEach(({ iconId, svg }) => {
            addIcon(iconId, svg);
        });
    };
}
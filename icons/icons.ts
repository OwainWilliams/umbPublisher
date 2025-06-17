import { addIcon } from "obsidian";

import umbracoLogo from "./img/umbpublisher-Logo.svg";

export class umbpublisherIcons {
    private icons = [{ iconId: "umbpublisher-logo", svg: umbracoLogo }];

    registerIcons = () => {
        this.icons.forEach(({ iconId, svg }) => {
            addIcon(iconId, svg);
        });
    };
}
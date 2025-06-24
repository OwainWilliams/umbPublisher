import { addIcon } from "obsidian";

import umbPublisherLogo from "./img/umbpublisher-logo.svg";

export class umbpublisherIcons {
    private icons = [{ iconId: "umbpublisher-logo", svg: umbPublisherLogo }];

    registerIcons = () => {
        this.icons.forEach(({ iconId, svg }) => {
            addIcon(iconId, svg);
        });
    };
}
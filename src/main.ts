import { Plugin, WorkspaceLeaf } from "obsidian";
import { GalleryDashboardView, VIEW_TYPE_GALLERY } from "./view";
import { GalleryViewSettings, DEFAULT_SETTINGS } from "./types";
import { GalleryViewSettingTab } from "./settings";

export default class GalleryViewPlugin extends Plugin {
    settings!: GalleryViewSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GalleryViewSettingTab(this.app, this));
        
        this.registerView(
            VIEW_TYPE_GALLERY,
            (leaf: WorkspaceLeaf) => new GalleryDashboardView(leaf, this)
        );

        this.addRibbonIcon("library", "Open Library Gallery", () => {
            this.activateGalleryView();
        });

        this.addCommand({
            id: "open-gallery-dashboard",
            name: "Open Gallery Dashboard Layout",
            callback: () => this.activateGalleryView(),
        });

        // 🌟 Re-sync explicitly if layout structures load out of alignment
        this.app.workspace.onLayoutReady(async () => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
            for (const leaf of leaves) {
                if (leaf.view instanceof GalleryDashboardView) {
                    // Only apply if the workspace didn't load its own serialized view path state
                    if (!leaf.view.currentPath) {
                        leaf.view.currentPath = this.settings.lastOpenPath || this.settings.rootSearchPath || "";
                        await leaf.view.renderCanvas();
                    }
                }
            }
        });
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALLERY);
    }

    async activateGalleryView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        const existingLeaf = leaves[0];

        if (existingLeaf) {
            workspace.revealLeaf(existingLeaf);
        } else {
            const leaf = workspace.getLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_GALLERY,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        for (const leaf of leaves) {
            if (leaf.view instanceof GalleryDashboardView) {
                const existingPath = leaf.view.currentPath;
                leaf.view.currentPath = existingPath || this.settings.rootSearchPath || "";
                leaf.view.renderCanvas();
            }
        }
    }
}
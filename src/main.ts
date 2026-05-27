import { Plugin, WorkspaceLeaf } from "obsidian";
import { GalleryDashboardView, VIEW_TYPE_GALLERY } from "./view";
import { GalleryViewSettings, DEFAULT_SETTINGS } from "./types";
import { GalleryViewSettingTab } from "./settings";

export default class GalleryViewPlugin extends Plugin {
    settings!: GalleryViewSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GalleryViewSettingTab(this.app, this));
        
        // Register custom view structure type blueprint
        this.registerView(
            VIEW_TYPE_GALLERY,
            (leaf: WorkspaceLeaf) => new GalleryDashboardView(leaf, this)
        );

        // Add Left Ribbon Sidebar Icon
        this.addRibbonIcon("library", "Open Library Gallery", () => {
            this.activateGalleryView();
        });

        // Add a Command palette shortcut alternative
        this.addCommand({
            id: "open-gallery-dashboard",
            name: "Open Gallery Dashboard Layout",
            callback: () => this.activateGalleryView(),
        });
    }

    async onunload() {
        // Clear references out of workspace windows layout upon plugin disable
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALLERY);
    }

    /**
     * Spawns or brings focus into our unified interface leaf viewport
     */
    async activateGalleryView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
        const existingLeaf = leaves[0]; // Extract first

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
        
        // Refresh active layouts dynamically if window state properties change inside settings context tabs
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
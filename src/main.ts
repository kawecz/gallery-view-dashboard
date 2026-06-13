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
			(leaf: WorkspaceLeaf) => new GalleryDashboardView(leaf, this),
		);

		this.addRibbonIcon("library", "Open Library Gallery", () => {
			void this.activateGalleryView();
		});

		this.addCommand({
			id: "open-gallery-dashboard",
			name: "Open Gallery Dashboard Layout",
			callback: () => void this.activateGalleryView(),
		});

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void (async () => {
					let layoutChanged = false;

					if (this.settings.folderOverrides[oldPath]) {
						const dataConfig =
							this.settings.folderOverrides[oldPath];
						dataConfig.folderPath = file.path;
						this.settings.folderOverrides[file.path] = dataConfig;
						delete this.settings.folderOverrides[oldPath];
						layoutChanged = true;
					}

					if (this.settings.folderSortMethods[oldPath]) {
						this.settings.folderSortMethods[file.path] =
							this.settings.folderSortMethods[oldPath];
						delete this.settings.folderSortMethods[oldPath];
						layoutChanged = true;
					}

					if (this.settings.folderManualOrders[oldPath]) {
						this.settings.folderManualOrders[file.path] =
							this.settings.folderManualOrders[oldPath];
						delete this.settings.folderManualOrders[oldPath];
						layoutChanged = true;
					}

					if (
						this.settings.folderCardSizes &&
						this.settings.folderCardSizes[oldPath]
					) {
						this.settings.folderCardSizes[file.path] =
							this.settings.folderCardSizes[oldPath];
						delete this.settings.folderCardSizes[oldPath];
						layoutChanged = true;
					}

					const oldParentPath =
						oldPath.substring(0, oldPath.lastIndexOf("/")) || "";
					const oldName = oldPath.substring(
						oldPath.lastIndexOf("/") + 1,
					);

					if (this.settings.folderManualOrders[oldParentPath]) {
						this.settings.folderManualOrders[oldParentPath] =
							this.settings.folderManualOrders[oldParentPath].map(
								(itemName: string) =>
									itemName === oldName ? file.name : itemName,
							);
						layoutChanged = true;
					}

					if (layoutChanged) {
						await this.saveSettings();
					}
				})();
			}),
		);

		this.app.workspace.onLayoutReady(async () => {
			const leaves =
				this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
			for (const leaf of leaves) {
				if (leaf.view instanceof GalleryDashboardView) {
					if (!leaf.view.currentPath) {
						leaf.view.currentPath =
							this.settings.lastOpenPath ||
							this.settings.rootSearchPath ||
							"";
						await leaf.view.renderCanvas();
					}
				}
			}
		});
	}

	onunload(): void {
		// Don't detach leaves - let Obsidian handle it
		// Just clean up any plugin-specific resources if needed
	}

	async activateGalleryView() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		const existingLeaf: WorkspaceLeaf | undefined = leaves[0];

		if (existingLeaf) {
			// Replace revealLeaf with setActiveLeaf for broader compatibility
			workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			const leaf = workspace.getLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_GALLERY, active: true });
			workspace.setActiveLeaf(leaf, { focus: true });
		}
	}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			loadedData as Partial<GalleryViewSettings>,
		);
		if (!this.settings.folderCardSizes) {
			this.settings.folderCardSizes = {};
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GALLERY);
		for (const leaf of leaves) {
			if (leaf.view instanceof GalleryDashboardView) {
				const existingPath = leaf.view.currentPath;
				leaf.view.currentPath =
					existingPath || this.settings.rootSearchPath || "";
				void leaf.view.renderCanvas();
			}
		}
	}
}

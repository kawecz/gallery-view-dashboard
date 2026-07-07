import { App, Modal, Setting, TAbstractFile, TFile } from "obsidian";

export class RenameModal extends Modal {
	private item: TAbstractFile;
	private onConfirm: () => void;

	constructor(app: App, item: TAbstractFile, onConfirm: () => void) {
		super(app);
		this.item = item;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: `Rename: ${this.item.name}`,
			attr: { style: "margin-top: 0;" },
		});

		let currentName =
			this.item instanceof TFile ? this.item.basename : this.item.name;
		const ext = this.item instanceof TFile ? `.${this.item.extension}` : "";

		new Setting(contentEl).setName("New Name").addText((text) =>
			text.setValue(currentName).onChange((value) => {
				currentName = value.trim();
			}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Rename",
			cls: "mod-cta",
		});

		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			void (async () => {
				if (!currentName) return;
				const parentPath = this.item.parent ? this.item.parent.path : "";
				const trailingSlash =
					parentPath === "/" || !parentPath ? "" : "/";
				const newPath = `${parentPath}${trailingSlash}${currentName}${ext}`;
				try {
					await this.app.fileManager.renameFile(this.item, newPath);
					this.onConfirm();
				} catch (err) {
					console.error("Failed to rename item:", err);
				}
				this.close();
			})();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
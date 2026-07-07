import { App, Modal, Setting } from "obsidian";

export class CreateFolderModal extends Modal {
	private onSubmit: (folderName: string) => void;

	constructor(app: App, onSubmit: (folderName: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "Create New Folder",
			attr: { style: "margin-top: 0;" },
		});
		let folderName = "New Folder";

		new Setting(contentEl).setName("Folder Name").addText((text) =>
			text
				.setPlaceholder("New Folder")
				.setValue(folderName)
				.onChange((value) => {
					folderName = value;
				}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			this.onSubmit(folderName.trim());
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
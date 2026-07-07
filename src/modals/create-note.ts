import { App, Modal, Setting } from "obsidian";

export interface PropertyEntry {
	key: string;
	value: string;
}

export class CreateNoteModal extends Modal {
	private onSubmit: (title: string, properties: PropertyEntry[]) => void;
	private defaultProperties: PropertyEntry[];
	private currentFolder: string;

	constructor(
		app: App,
		onSubmit: (title: string, properties: PropertyEntry[]) => void,
		defaultProperties: PropertyEntry[] = [],
		currentFolder: string = "",
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.defaultProperties = [...defaultProperties];
		this.currentFolder = currentFolder;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl("h3", {
			text: "Create New Note",
			attr: { style: "margin-top: 0; margin-bottom: 4px;" },
		});

		if (this.currentFolder) {
			contentEl.createDiv({
				text: `Location: ${this.currentFolder || "Root"}`,
				attr: {
					style: "font-size: 0.8em; color: var(--text-muted); margin-bottom: 12px; font-family: var(--font-monospace);",
				},
			});
		}

		let noteTitle = "Untitled Note";
		new Setting(contentEl).setName("Note Title").addText((text) =>
			text
				.setPlaceholder("Untitled Note")
				.setValue(noteTitle)
				.onChange((value) => {
					noteTitle = value;
				}),
		);

		// Properties Section - ALWAYS visible
		const propsHeader = contentEl.createDiv({
			attr: {
				style: "margin-top: 20px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;",
			},
		});
		propsHeader.createEl("h4", {
			text: "📋 Properties",
			attr: { style: "margin: 0;" },
		});

		// Show info about potential plugin interference
		const infoDiv = contentEl.createDiv({
			attr: {
				style: "font-size: 0.75em; color: var(--text-muted); margin-bottom: 8px; padding: 6px 10px; background: var(--background-secondary); border-radius: 4px;",
			},
		});
		infoDiv.setText(
			"ℹ️ Properties shown below will be added to the note frontmatter. Plugins like Folder Auto Properties or Templater may add additional properties when the note is created.",
		);

		const propertiesContainer = contentEl.createDiv({
			cls: "gallery-create-note-properties",
		});

		const renderProperties = () => {
			propertiesContainer.empty();

			if (this.defaultProperties.length === 0) {
				propertiesContainer.createDiv({
					text: "No properties defined yet. Click '+ Add Property' to start.",
					attr: {
						style: "text-align: center; padding: 12px; color: var(--text-faint); font-style: italic; font-size: 0.85em;",
					},
				});
				return;
			}

			this.defaultProperties.forEach((prop, index) => {
				const row = propertiesContainer.createDiv({
					cls: "gallery-property-row",
				});

				const keyInput = row.createEl("input", {
					type: "text",
					value: prop.key,
					placeholder: "key",
					cls: "gallery-property-key-input",
				});
				keyInput.setCssProps({
					width: "120px",
					padding: "4px 8px",
					fontSize: "0.85em",
					borderRadius: "4px",
					border: "1px solid var(--background-modifier-border)",
					background: "var(--background-primary)",
				});

				const valueInput = row.createEl("input", {
					type: "text",
					value: prop.value,
					placeholder: "value",
					cls: "gallery-property-value-input",
				});
				valueInput.setCssProps({
					flex: "1",
					padding: "4px 8px",
					fontSize: "0.85em",
					borderRadius: "4px",
					border: "1px solid var(--background-modifier-border)",
					background: "var(--background-primary)",
				});

				keyInput.addEventListener("input", () => {
					const entry = this.defaultProperties[index];
					if (entry) {
						entry.key = keyInput.value;
					}
				});

				valueInput.addEventListener("input", () => {
					const entry = this.defaultProperties[index];
					if (entry) {
						entry.value = valueInput.value;
					}
				});

				const deleteBtn = row.createEl("button", {
					text: "×",
					attr: { "aria-label": "Remove property" },
				});
				deleteBtn.setCssProps({
					padding: "2px 8px",
					fontSize: "1em",
					cursor: "pointer",
					border: "none",
					background: "transparent",
					color: "var(--text-muted)",
					borderRadius: "4px",
				});
				deleteBtn.addEventListener("click", () => {
					this.defaultProperties.splice(index, 1);
					renderProperties();
				});
			});
		};

		renderProperties();

		// Add property button
		const addPropBtn = contentEl.createEl("button", {
			text: "+ Add Property",
			cls: "gallery-add-property-btn",
		});
		addPropBtn.setCssProps({
			marginTop: "8px",
			padding: "4px 12px",
			fontSize: "0.8em",
			cursor: "pointer",
			background: "var(--background-secondary)",
			border: "1px solid var(--background-modifier-border)",
			borderRadius: "4px",
			color: "var(--text-muted)",
		});
		addPropBtn.addEventListener("click", () => {
			this.defaultProperties.push({ key: "", value: "" });
			renderProperties();
		});

		// Footer buttons
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
			const validProps = this.defaultProperties.filter(
				(p) => p.key.trim().length > 0,
			);
			this.onSubmit(noteTitle.trim(), validProps);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
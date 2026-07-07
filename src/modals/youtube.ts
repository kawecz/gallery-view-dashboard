import { App, Modal, Setting } from "obsidian";
import { getYouTubeDuration } from "../importers/youtube";

export class YouTubeUrlPromptModal extends Modal {
	private onSubmit: (url: string) => void;

	constructor(app: App, onSubmit: (url: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "Import from YouTube",
			attr: { style: "margin-top: 0;" },
		});
		let inputUrl = "";
		new Setting(contentEl).setName("YouTube Link URL").addText((text) =>
			text
				.setPlaceholder("https://www.youtube.com/watch?v=...")
				.onChange((value) => {
					inputUrl = value;
				}),
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "Next",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			if (inputUrl.trim()) this.onSubmit(inputUrl.trim());
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class YouTubeConfirmModal extends Modal {
	private videoId: string;
	private defaultTitle: string;
	private onConfirm: (finalTitle: string, thumbnailUrl: string) => void;
	private properties: { key: string; value: string }[];
	private apiKey: string;
	private addPropertiesOnCreate: boolean;

	constructor(
		app: App,
		videoUrl: string,
		videoId: string,
		defaultTitle: string,
		onConfirm: (finalTitle: string, thumbnailUrl: string) => void,
		properties: { key: string; value: string }[] = [],
		apiKey: string = "",
		addPropertiesOnCreate: boolean = false,
	) {
		super(app);
		this.videoId = videoId;
		this.defaultTitle = defaultTitle.replace(/[\\/:?*"<>|]/g, " ");
		this.onConfirm = onConfirm;
		this.properties = properties;
		this.apiKey = apiKey;
		this.addPropertiesOnCreate = addPropertiesOnCreate;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "Confirm YouTube Asset Details" });

		const titleRow = contentEl.createDiv({
			attr: {
				style: "display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;",
			},
		});
		const titleInput = titleRow.createEl("input", {
			type: "text",
			value: this.defaultTitle,
			attr: { style: "width: 100%; padding: 6px;" },
		});

		const previewContainer = contentEl.createDiv({
			attr: {
				style: "position: relative; width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 6px; overflow: hidden; margin-bottom: 20px;",
			},
		});
		const thumbnailUrl = `https://img.youtube.com/vi/${this.videoId}/maxresdefault.jpg`;
		previewContainer.createEl("img", {
			attr: {
				src: thumbnailUrl,
				style: "width: 100%; height: 100%; object-fit: cover;",
			},
		});

		// ---- PROPERTIES PREVIEW ----
		const propsHeader = contentEl.createDiv({
			attr: {
				style: "margin-bottom: 8px;",
			},
		});
		propsHeader.createEl("h4", {
			text: "📋 Properties that will be added",
			attr: { style: "margin: 0 0 4px 0; font-size: 0.9em;" },
		});

		const propsContainer = contentEl.createDiv({
			attr: {
				style: "background: var(--background-secondary); border-radius: 8px; padding: 10px; margin-bottom: 16px;",
			},
		});

		// Show properties
		const displayProps = [...this.properties];

		// Add banner only if not already in properties
		if (!displayProps.some((p) => p.key === "banner")) {
			displayProps.push({ key: "banner", value: thumbnailUrl });
		}
		if (!displayProps.some((p) => p.key === "type")) {
			displayProps.push({ key: "type", value: "youtube" });
		}

		// Try to get duration if API key is available
		// Try to get duration if API key is available
		let durationStr: string | null = null;
		if (this.apiKey) {
			durationStr = await getYouTubeDuration(
				`https://www.youtube.com/watch?v=${this.videoId}`,
				this.apiKey,
			);
		}
		if (durationStr && !displayProps.some((p) => p.key === "duration")) {
			displayProps.push({ key: "duration", value: durationStr });
		}
		if (durationStr) {
			displayProps.push({ key: "duration", value: durationStr });
		}

		// Add created date if enabled
		if (this.addPropertiesOnCreate) {
			const dateStr = new Date().toISOString().split("T")[0];
			if (dateStr && !displayProps.some((p) => p.key === "created")) {
				displayProps.push({ key: "created", value: dateStr });
			}
		}

		if (displayProps.length === 0) {
			propsContainer.createDiv({
				text: "No properties will be added.",
				attr: {
					style: "color: var(--text-faint); font-style: italic; font-size: 0.85em; text-align: center; padding: 8px;",
				},
			});
		} else {
			// In the displayProps.forEach section, replace the propRow creation:

			displayProps.forEach((prop) => {
				const propRow = propsContainer.createDiv({
					attr: {
						style: "display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 0.82em;",
					},
				});
				propRow.createSpan({
					text: prop.key,
					attr: {
						style: "font-weight: 600; color: var(--text-muted); min-width: 80px; font-family: var(--font-monospace); font-size: 0.85em;",
					},
				});
				const valueDisplay =
					prop.value.length > 60
						? prop.value.substring(0, 60) + "..."
						: prop.value;
				propRow.createSpan({
					text: valueDisplay,
					attr: {
						style: "color: var(--text-normal); word-break: break-all; flex: 1;",
					},
				});

				// Copy button
				const copyBtn = propRow.createEl("button", {
					text: "📋",
					attr: {
						"aria-label": "Copy value",
						style: "padding: 1px 4px; font-size: 0.7em; cursor: pointer; border: none; background: transparent; opacity: 0.5; border-radius: 3px; transition: all 0.15s ease;",
					},
				});
				copyBtn.addEventListener("click", () => {
					void navigator.clipboard.writeText(prop.value).then(() => {
						copyBtn.setText("✓");
						copyBtn.setCssProps({
							opacity: "1",
							color: "var(--color-green)",
						});
						window.setTimeout(() => {
							copyBtn.setText("📋");
							copyBtn.setCssProps({ opacity: "0.5", color: "" });
						}, 1500);
					});
				});
				copyBtn.addEventListener("mouseenter", () => {
					copyBtn.setCssProps({
						opacity: "1",
						background: "var(--background-modifier-hover)",
					});
				});
				copyBtn.addEventListener("mouseleave", () => {
					if (copyBtn.textContent !== "✓") {
						copyBtn.setCssProps({
							opacity: "0.5",
							background: "transparent",
						});
					}
				});
			});
		}

		// Info about other plugins
		const infoDiv = contentEl.createDiv({
			attr: {
				style: "font-size: 0.72em; color: var(--text-faint); margin-bottom: 16px; padding: 6px 10px; background: var(--background-primary-alt); border-radius: 4px; font-style: italic;",
			},
		});
		infoDiv.setText(
			"ℹ️ Plugins like Folder Auto Properties or Templater may add additional properties based on your rules when the note is created.",
		);

		const footerBtnRow = contentEl.createDiv({
			attr: {
				style: "display: flex; justify-content: flex-end; gap: 12px;",
			},
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = footerBtnRow.createEl("button", {
			text: "OK",
			cls: "mod-cta",
		});
		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", () => {
			this.onConfirm(
				titleInput.value.trim() || this.defaultTitle,
				thumbnailUrl,
			);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

import { App, Modal } from "obsidian";
import { searchGoogleBooks, type BookMetadata } from "../importers/books";

export class GoogleBookModal extends Modal {
	private onConfirm: (book: BookMetadata) => void;
	private apiKey: string;

	constructor(app: App, apiKey: string, onConfirm: (book: BookMetadata) => void) {
		super(app);
		this.onConfirm = onConfirm;
		this.apiKey = apiKey;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: "📚 Import Book from Google Books",
			attr: { style: "margin-top: 0;" },
		});

		if (!this.apiKey) {
			contentEl.createDiv({
				text: "Please set your Google Books API key in the plugin settings first.",
				attr: { style: "text-align: center; padding: 20px; color: var(--text-error);" },
			});
			const footerBtnRow = contentEl.createDiv({
				attr: { style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;" },
			});
			const closeBtn = footerBtnRow.createEl("button", { text: "Close" });
			closeBtn.addEventListener("click", () => this.close());
			return;
		}

		contentEl.createEl("p", {
			text: "Search by title, author, or ISBN.",
			attr: { style: "color: var(--text-muted); font-size: 0.85em; margin-bottom: 12px;" },
		});

		let searchQuery = "";
		const resultsContainer = contentEl.createDiv({ cls: "gallery-search-results" });

		// Search row
		const searchRow = contentEl.createDiv({
			attr: { style: "display: flex; gap: 8px; align-items: center; margin-bottom: 14px;" },
		});

		const inputEl = searchRow.createEl("input", {
			type: "text",
			placeholder: "e.g., The Hobbit, Sherlock Holmes",
			attr: {
				style: "flex: 1; padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--background-modifier-border); font-size: 0.9em;",
			},
		});

		inputEl.addEventListener("input", (e) => {
			searchQuery = (e.target as HTMLInputElement).value;
		});

		// Also allow Enter key to search
		inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				void performSearch();
			}
		});

		const searchBtn = searchRow.createEl("button", {
			text: "Search",
			cls: "mod-cta",
			attr: { style: "padding: 8px 16px;" },
		});

		const performSearch = async () => {
			const query = searchQuery.trim();
			if (!query) return;

			resultsContainer.empty();
			resultsContainer.createDiv({
				text: "Searching Google Books...",
				attr: { style: "text-align: center; padding: 20px; color: var(--text-muted);" },
			});

			console.log("Searching for:", query);
			console.log("API key present:", !!this.apiKey);

			try {
				const results = await searchGoogleBooks(query, this.apiKey);
				resultsContainer.empty();

				console.log("Results found:", results.length);

				if (results.length === 0) {
					resultsContainer.createDiv({
						text: "No books found. Try a different search term.",
						attr: { style: "text-align: center; padding: 20px; color: var(--text-muted);" },
					});
					return;
				}

				results.forEach((book) => {
					const bookItem = resultsContainer.createDiv({ cls: "gallery-book-result-item" });
					bookItem.setCssProps({
						display: "flex",
						gap: "12px",
						padding: "10px",
						border: "1px solid var(--background-modifier-border)",
						borderRadius: "8px",
						marginBottom: "8px",
						cursor: "pointer",
					});

					if (book.coverUrl) {
						const coverEl = bookItem.createDiv({
							attr: {
								style: "width: 60px; height: 90px; flex-shrink: 0; background: var(--background-secondary); border-radius: 4px; overflow: hidden;",
							},
						});
						coverEl.createEl("img", {
							attr: {
								src: book.coverUrl,
								style: "width: 100%; height: 100%; object-fit: cover;",
							},
						});
					} else {
						const placeholderEl = bookItem.createDiv({
							attr: {
								style: "width: 60px; height: 90px; flex-shrink: 0; background: var(--background-secondary); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1.5em;",
							},
						});
						placeholderEl.setText("📖");
					}

					const infoEl = bookItem.createDiv({ attr: { style: "flex: 1; min-width: 0;" } });
					infoEl.createEl("strong", {
						text: book.title,
						attr: { style: "display: block; margin-bottom: 4px;" },
					});
					infoEl.createEl("div", {
						text: `by ${book.author}`,
						attr: { style: "font-size: 0.85em; color: var(--text-muted);" },
					});
					if (book.year) {
						infoEl.createEl("div", {
							text: `Published: ${book.year}`,
							attr: { style: "font-size: 0.8em; color: var(--text-faint);" },
						});
					}
					if (book.publisher) {
						infoEl.createEl("div", {
							text: book.publisher,
							attr: { style: "font-size: 0.75em; color: var(--text-faint);" },
						});
					}

					bookItem.addEventListener("click", () => {
						console.log("Selected book:", book.title);
						this.onConfirm(book);
						this.close();
					});

					bookItem.addEventListener("mouseenter", () => {
						bookItem.setCssProps({
							background: "var(--background-modifier-hover)",
							borderColor: "var(--interactive-accent)",
						});
					});
					bookItem.addEventListener("mouseleave", () => {
						bookItem.setCssProps({
							background: "",
							borderColor: "var(--background-modifier-border)",
						});
					});
				});
			} catch (err) {
				console.error("Search error:", err);
				resultsContainer.empty();
				resultsContainer.createDiv({
					text: `Error: ${err instanceof Error ? err.message : "Search failed"}. Check console for details.`,
					attr: { style: "text-align: center; padding: 20px; color: var(--text-error);" },
				});
			}
		};

		searchBtn.addEventListener("click", () => {
			void performSearch();
		});

		// Footer
		const footerBtnRow = contentEl.createDiv({
			attr: { style: "display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;" },
		});
		const cancelBtn = footerBtnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
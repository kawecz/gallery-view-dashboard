import { requestUrl } from "obsidian";

export interface BookMetadata {
	title: string;
	author: string;
	coverUrl: string;
	isbn: string;
	description: string;
	subjects: string;
	year: string;
	publisher: string;
}

export async function searchGoogleBooks(
	query: string,
	apiKey: string,
): Promise<BookMetadata[]> {
	const results: BookMetadata[] = [];

	try {
		const cleanApiKey = apiKey.trim();
		
		// Debug: check key format
		console.log("API Key length:", cleanApiKey.length);
		console.log("API Key first 5 chars:", cleanApiKey.substring(0, 5));
		console.log("API Key last 5 chars:", cleanApiKey.substring(cleanApiKey.length - 5));
		
		// Try with a completely clean URL - no encodeURIComponent at all for the query
		const rawQuery = query.trim().replace(/\s+/g, "+");
		const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${rawQuery}&maxResults=8&key=${cleanApiKey}`;

		console.log("Full URL (key hidden):", searchUrl.replace(cleanApiKey, "KEY_HIDDEN"));

		// Try with fetch directly first to see the real error
		try {
			const testResponse = await fetch(searchUrl);
			const testData = await testResponse.json();
			console.log("Direct fetch status:", testResponse.status);
			console.log("Direct fetch response:", JSON.stringify(testData).substring(0, 300));
		} catch (fetchErr) {
			console.error("Direct fetch error:", fetchErr);
		}

		const response = await requestUrl({
			url: searchUrl,
			headers: { "Accept": "application/json" },
			throw: false, // Don't throw on non-200
		});

		console.log("requestUrl status:", response.status);
		
		if (response.status !== 200) {
			// Try to parse error body
			try {
				const errorBody = response.text ? JSON.parse(response.text) : response.json;
				console.error("Google Books error details:", JSON.stringify(errorBody).substring(0, 500));
			} catch {
				console.error("Google Books raw error:", response.text?.substring(0, 300) || "No error body");
			}
			return results;
		}

		
		let data: any;
		if (response.json) {
			data = response.json;
		} else if (response.text) {
			data = JSON.parse(response.text);
		} else {
			return results;
		}

		console.log("Total items:", data.totalItems);

		if (data.items && Array.isArray(data.items)) {
		
			for (const item of data.items as any[]) {
				const volumeInfo = item.volumeInfo || {};
				const imageLinks = volumeInfo.imageLinks || {};
				const rawCoverUrl = imageLinks.thumbnail || imageLinks.smallThumbnail || "";
				const coverUrl = rawCoverUrl ? rawCoverUrl.replace("http:", "https:") : "";

				const identifiers = volumeInfo.industryIdentifiers || [];
			
				const isbnObj = identifiers.find((id: any) => id.type === "ISBN_13" || id.type === "ISBN_10");
				const isbn = isbnObj ? isbnObj.identifier : "";

				results.push({
					title: volumeInfo.title || "Unknown Title",
					author: volumeInfo.authors ? volumeInfo.authors.join(", ") : "Unknown Author",
					coverUrl,
					isbn,
					description: volumeInfo.description || "",
					subjects: volumeInfo.categories ? volumeInfo.categories.join(", ") : "",
					year: volumeInfo.publishedDate ? volumeInfo.publishedDate.substring(0, 4) : "",
					publisher: volumeInfo.publisher || "",
				});
			}
		}
	} catch (err) {
		console.error("Google Books search failed:", err);
	}

	return results;
}

export async function fetchBookByISBN(
	isbn: string,
	apiKey: string,
): Promise<BookMetadata | null> {
	try {
		const cleanApiKey = apiKey.trim();
		const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${cleanApiKey}`;
		const response = await requestUrl({
			url,
			headers: { "Accept": "application/json" },
		});

		if (response.status !== 200) return null;

		
		let data: any;
		if (response.json) {
			data = response.json;
		} else if (response.text) {
			data = JSON.parse(response.text);
		} else {
			return null;
		}

		const item = data.items?.[0];
		if (!item) return null;

		const volumeInfo = item.volumeInfo || {};
		const imageLinks = volumeInfo.imageLinks || {};
		const rawCoverUrl = imageLinks.thumbnail || imageLinks.smallThumbnail || "";

		return {
			title: volumeInfo.title || "Unknown Title",
			author: volumeInfo.authors ? volumeInfo.authors.join(", ") : "Unknown Author",
			coverUrl: rawCoverUrl ? rawCoverUrl.replace("http:", "https:") : "",
			isbn,
			description: volumeInfo.description || "",
			subjects: volumeInfo.categories ? volumeInfo.categories.join(", ") : "",
			year: volumeInfo.publishedDate ? volumeInfo.publishedDate.substring(0, 4) : "",
			publisher: volumeInfo.publisher || "",
		};
	} catch {
		return null;
	}
}
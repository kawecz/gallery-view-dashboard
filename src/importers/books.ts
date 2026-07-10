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

interface GoogleBooksApiResponse {
    totalItems: number;
    items?: GoogleBookItem[];
}

interface GoogleBookItem {
    volumeInfo: GoogleVolumeInfo;
}

interface GoogleVolumeInfo {
    title?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    publisher?: string;
    categories?: string[];
    imageLinks?: GoogleImageLinks;
    industryIdentifiers?: IndustryIdentifier[];
}

interface GoogleImageLinks {
    thumbnail?: string;
    smallThumbnail?: string;
}

interface IndustryIdentifier {
    type: string;
    identifier: string;
}

function parseResponseData(response: { json?: unknown; text?: string }): GoogleBooksApiResponse | null {
    if (response.json && typeof response.json === "object") {
        return response.json as GoogleBooksApiResponse;
    }
    if (response.text) {
        try {
            return JSON.parse(response.text) as GoogleBooksApiResponse;
        } catch {
            return null;
        }
    }
    return null;
}

function buildBookMetadata(item: GoogleBookItem): BookMetadata {
    const volumeInfo = item.volumeInfo;
    const imageLinks = volumeInfo.imageLinks;
    const rawCoverUrl = imageLinks?.thumbnail || imageLinks?.smallThumbnail || "";
    const coverUrl = rawCoverUrl ? rawCoverUrl.replace("http:", "https:") : "";

    const identifiers = volumeInfo.industryIdentifiers || [];
    const isbnObj = identifiers.find(
        (id) => id.type === "ISBN_13" || id.type === "ISBN_10"
    );
    const isbn = isbnObj ? isbnObj.identifier : "";

    return {
        title: volumeInfo.title || "Unknown Title",
        author: volumeInfo.authors ? volumeInfo.authors.join(", ") : "Unknown Author",
        coverUrl,
        isbn,
        description: volumeInfo.description || "",
        subjects: volumeInfo.categories ? volumeInfo.categories.join(", ") : "",
        year: volumeInfo.publishedDate ? volumeInfo.publishedDate.substring(0, 4) : "",
        publisher: volumeInfo.publisher || "",
    };
}

export async function searchGoogleBooks(
    query: string,
    apiKey: string,
): Promise<BookMetadata[]> {
    const results: BookMetadata[] = [];

    try {
        const cleanApiKey = apiKey.trim();
        const rawQuery = query.trim().replace(/\s+/g, "+");
        const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${rawQuery}&maxResults=8&key=${cleanApiKey}`;

        const response = await requestUrl({
            url: searchUrl,
            headers: { "Accept": "application/json" },
            throw: false,
        });

        if (response.status !== 200) {
            return results;
        }

        const data = parseResponseData(response);
        if (!data || !data.items || !Array.isArray(data.items)) {
            return results;
        }

        for (const item of data.items) {
            results.push(buildBookMetadata(item));
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

        const data = parseResponseData(response);
        if (!data || !data.items || !Array.isArray(data.items)) {
            return null;
        }

        const item = data.items[0];
        if (!item) return null;

        return buildBookMetadata(item);
    } catch {
        return null;
    }
}
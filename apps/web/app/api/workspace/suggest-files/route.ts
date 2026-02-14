import { readdirSync, type Dirent } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { resolveDenchRoot } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SuggestItem = {
	name: string;
	path: string;
	type: "folder" | "file" | "document" | "database";
};

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	".Trash",
	"__pycache__",
	".cache",
	".DS_Store",
]);

/** List entries in a directory, sorted folders-first then alphabetically. */
function listDir(absDir: string, filter?: string): SuggestItem[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(absDir, { withFileTypes: true });
	} catch {
		return [];
	}

	const lowerFilter = filter?.toLowerCase();

	const sorted = entries
		.filter((e) => !e.name.startsWith("."))
		.filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name)))
		.filter((e) => !lowerFilter || e.name.toLowerCase().includes(lowerFilter))
		.toSorted((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) {return -1;}
			if (!a.isDirectory() && b.isDirectory()) {return 1;}
			return a.name.localeCompare(b.name);
		});

	const items: SuggestItem[] = [];
	for (const entry of sorted) {
		if (items.length >= 30) {break;}
		const absPath = join(absDir, entry.name);

		if (entry.isDirectory()) {
			items.push({ name: entry.name, path: absPath, type: "folder" });
		} else if (entry.isFile()) {
			const ext = entry.name.split(".").pop()?.toLowerCase();
			const isDocument = ext === "md" || ext === "mdx";
			const isDatabase =
				ext === "duckdb" || ext === "sqlite" || ext === "sqlite3" || ext === "db";
			items.push({
				name: entry.name,
				path: absPath,
				type: isDatabase ? "database" : isDocument ? "document" : "file",
			});
		}
	}
	return items;
}

/** Recursively search for files matching a query, up to a limit. */
function searchFiles(
	absDir: string,
	query: string,
	results: SuggestItem[],
	maxResults: number,
	depth = 0,
): void {
	if (depth > 6 || results.length >= maxResults) {return;}

	let entries: Dirent[];
	try {
		entries = readdirSync(absDir, { withFileTypes: true });
	} catch {
		return;
	}

	const lowerQuery = query.toLowerCase();

	for (const entry of entries) {
		if (results.length >= maxResults) {return;}
		if (entry.name.startsWith(".")) {continue;}
		if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {continue;}

		const absPath = join(absDir, entry.name);

		if (entry.isFile() && entry.name.toLowerCase().includes(lowerQuery)) {
			const ext = entry.name.split(".").pop()?.toLowerCase();
			const isDocument = ext === "md" || ext === "mdx";
			const isDatabase =
				ext === "duckdb" || ext === "sqlite" || ext === "sqlite3" || ext === "db";
			results.push({
				name: entry.name,
				path: absPath,
				type: isDatabase ? "database" : isDocument ? "document" : "file",
			});
		} else if (
			entry.isDirectory() &&
			entry.name.toLowerCase().includes(lowerQuery)
		) {
			results.push({ name: entry.name, path: absPath, type: "folder" });
		}

		if (entry.isDirectory()) {
			searchFiles(absPath, query, results, maxResults, depth + 1);
		}
	}
}

/**
 * Resolve a user-typed path query into a directory to list and an optional filter.
 *
 * Examples:
 *   "../"        → list parent of workspace root
 *   "/"          → list filesystem root
 *   "~/"         → list home dir
 *   "~/Doc"      → list home dir, filter "Doc"
 *   "src/utils"  → list <workspace>/src, filter "utils"
 *   "foo.ts"     → search by filename
 */
function resolvePath(
	raw: string,
	workspaceRoot: string,
): { dir: string; filter?: string } | null {
	const home = homedir();

	if (raw.startsWith("~/")) {
		const rest = raw.slice(2);
		if (!rest || rest.endsWith("/")) {
			// List the directory
			const dir = rest ? resolve(home, rest) : home;
			return { dir };
		}
		// Has a trailing segment → list parent, filter by segment
		const dir = resolve(home, dirname(rest));
		return { dir, filter: basename(rest) };
	}

	if (raw.startsWith("/")) {
		if (raw === "/") {return { dir: "/" };}
		if (raw.endsWith("/")) {
			return { dir: resolve(raw) };
		}
		const dir = dirname(resolve(raw));
		return { dir, filter: basename(raw) };
	}

	if (raw.startsWith("../") || raw === "..") {
		const resolved = resolve(workspaceRoot, raw);
		if (raw.endsWith("/") || raw === "..") {
			return { dir: resolved };
		}
		return { dir: dirname(resolved), filter: basename(resolved) };
	}

	if (raw.startsWith("./")) {
		const rest = raw.slice(2);
		if (!rest || rest.endsWith("/")) {
			const dir = rest ? resolve(workspaceRoot, rest) : workspaceRoot;
			return { dir };
		}
		const dir = resolve(workspaceRoot, dirname(rest));
		return { dir, filter: basename(rest) };
	}

	// Contains a slash → treat as relative path from workspace
	if (raw.includes("/")) {
		if (raw.endsWith("/")) {
			return { dir: resolve(workspaceRoot, raw) };
		}
		const dir = resolve(workspaceRoot, dirname(raw));
		return { dir, filter: basename(raw) };
	}

	// No path separator → this is a filename search
	return null;
}

export async function GET(req: Request) {
	const url = new URL(req.url);
	const pathQuery = url.searchParams.get("path");
	const searchQuery = url.searchParams.get("q");
	const workspaceRoot = resolveDenchRoot() ?? homedir();

	// Search mode: find files by name
	if (searchQuery) {
		const results: SuggestItem[] = [];
		searchFiles(workspaceRoot, searchQuery, results, 20);
		// Also search home dir if workspace didn't yield enough
		if (results.length < 20) {
			searchFiles(homedir(), searchQuery, results, 20);
		}
		return Response.json({ items: results });
	}

	// Browse mode: resolve path and list directory
	if (pathQuery) {
		const resolved = resolvePath(pathQuery, workspaceRoot);
		if (!resolved) {
			// Treat as filename search
			const results: SuggestItem[] = [];
			searchFiles(workspaceRoot, pathQuery, results, 20);
			return Response.json({ items: results });
		}
		const items = listDir(resolved.dir, resolved.filter);
		return Response.json({ items });
	}

	// Default: list workspace root
	const items = listDir(workspaceRoot);
	return Response.json({ items });
}

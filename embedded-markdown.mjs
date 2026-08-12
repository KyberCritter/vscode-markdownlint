// @ts-check

// Tools for linting Markdown embedded in documents of other languages

// Constants
const lineEndingRe = /\r?\n/gu;
const leadingWhitespaceRe = /^[ \t]*/u;

/**
 * Returns the number of newline characters in the specified text.
 * @param {string} text Text to inspect.
 * @returns {number} Number of newline characters.
 */
function countNewLines (text) {
	const matches = text.match(lineEndingRe);
	return matches ? matches.length : 0;
}

/**
 * Returns the number of leading space/tab characters in the specified line.
 * @param {string} line Line to inspect.
 * @returns {number} Number of leading space/tab characters.
 */
function getLeadingWhitespaceCount (line) {
	return leadingWhitespaceRe.exec(line)[0].length;
}

/**
 * Returns the number of leading characters to strip from the specified line.
 * @param {string} line Line to inspect.
 * @param {number} columnOffset Maximum indentation to strip.
 * @returns {number} Number of leading characters to strip.
 */
function getStrippedCount (line, columnOffset) {
	return Math.min(columnOffset, getLeadingWhitespaceCount(line));
}

/**
 * Describes an embedded Markdown section of a document.
 * @typedef {{ "markdown": string, "lineOffset": number, "columnOffsets": number[] }} EmbeddedMarkdownSection
 */

/**
 * Returns a description of the embedded Markdown section matched by the pattern.
 * @param {string} text Full document text.
 * @param {RegExpMatchArray} match Regular expression match.
 * @param {string} pattern Regular expression pattern.
 * @param {string | undefined} prefix Regular expression for stripping a per-line prefix.
 * @returns {EmbeddedMarkdownSection | null} Embedded Markdown section or null.
 */
function getSection (text, match, pattern, prefix) {
	const markdown = match.groups?.markdown;
	if (typeof markdown !== "string") {
		throw new TypeError(
			`The embedded Markdown pattern "${pattern}" must include a named capture group "(?<markdown>...)"`
		);
	}
	if (markdown.trim().length === 0) {
		return null;
	}
	const markdownStart = match.index + match[0].indexOf(markdown);
	const previousNewLineIndex = text.lastIndexOf("\n", markdownStart - 1);
	const firstLineColumnOffset = markdownStart - (previousNewLineIndex + 1);
	const lineOffset = countNewLines(text.slice(0, markdownStart));
	const lines = markdown.split(/\r?\n/u);
	const prefixRe = prefix ? new RegExp(prefix, "u") : null;
	let columnOffset = Number.MAX_SAFE_INTEGER;
	if (!prefixRe) {
		const firstLineIndex = (firstLineColumnOffset > 0) ? 1 : 0;
		for (let index = firstLineIndex; index < lines.length; index++) {
			if (lines[index].trim().length > 0) {
				columnOffset = Math.min(columnOffset, getLeadingWhitespaceCount(lines[index]));
			}
		}
	}
	/** @type {number[]} */
	const columnOffsets = [];
	/** @type {string[]} */
	const strippedLines = [];
	for (const line of lines) {
		let stripped = 0;
		let strippedLine = line;
		if (prefixRe) {
			const prefixMatch = prefixRe.exec(line);
			if (prefixMatch && (prefixMatch.index === 0)) {
				stripped = prefixMatch[0].length;
				strippedLine = line.slice(stripped);
			}
		} else {
			stripped = getStrippedCount(line, columnOffset);
			strippedLine = line.slice(stripped);
		}
		columnOffsets.push(stripped);
		strippedLines.push(strippedLine);
	}
	columnOffsets[0] += firstLineColumnOffset;
	return {
		"markdown": strippedLines.join("\n"),
		lineOffset,
		columnOffsets
	};
}

/**
 * Returns the embedded Markdown sections of a document or null when not applicable.
 * @param {string} text Full document text.
 * @param {string} languageId Document language identifier.
 * @param {Object<string, Array<string | { "pattern": string, "prefix"?: string }>> | undefined} embeddedMarkdownConfig Value of the "embeddedMarkdown" setting.
 * @returns {EmbeddedMarkdownSection[] | null} Embedded Markdown sections or null.
 */
function getEmbeddedMarkdownSections (text, languageId, embeddedMarkdownConfig) {
	const patterns = embeddedMarkdownConfig?.[languageId];
	if (!patterns || (patterns.length === 0)) {
		return null;
	}
	/** @type {Array<{ "start": number, "section": EmbeddedMarkdownSection }>} */
	const matches = [];
	for (const entry of patterns) {
		const pattern = (typeof entry === "string") ? entry : entry?.pattern;
		if (typeof pattern !== "string") {
			throw new TypeError(
				`The embedded Markdown pattern for the "${languageId}" language must be a string or an object with a "pattern" string`
			);
		}
		const prefix = (typeof entry === "object") ? entry?.prefix : undefined;
		const regex = new RegExp(pattern, "gm");
		for (const match of text.matchAll(regex)) {
			const section = getSection(text, match, pattern, prefix);
			if (section) {
				matches.push({ "start": match.index, section });
			}
		}
	}
	matches.sort((first, second) => first.start - second.start);
	return matches.map((entry) => entry.section);
}

/**
 * Adjusts lint results for an embedded Markdown section to use document coordinates.
 * @param {Array<{ "lineNumber": number, "errorRange"?: number[] }>} results Lint results for the section.
 * @param {EmbeddedMarkdownSection} section Embedded Markdown section.
 * @returns {Array} Adjusted lint results.
 */
function adjustResults (results, section) {
	const {
		lineOffset,
		columnOffsets
	} = section;
	for (const result of results) {
		const lineNumber = result.lineNumber;
		result.lineNumber = lineNumber + lineOffset;
		const columnOffset = columnOffsets[lineNumber - 1] ?? columnOffsets.at(-1);
		if (result.errorRange) {
			result.errorRange[0] += columnOffset;
		}
		// @ts-ignore
		if (result.fixInfo) {
			// @ts-ignore
			const fixLineNumber = result.fixInfo.lineNumber || lineNumber;
			// @ts-ignore
			result.fixInfo.lineNumber = fixLineNumber + lineOffset;
			const fixColumnOffset = columnOffsets[fixLineNumber - 1] ?? columnOffsets.at(-1);
			// @ts-ignore
			result.fixInfo.editColumn += fixColumnOffset;
		}
	}
	return results;
}

export { getEmbeddedMarkdownSections, adjustResults };

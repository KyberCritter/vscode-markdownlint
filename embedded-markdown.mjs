// @ts-check

// Tools for linting Markdown embedded in documents of other languages

// Constants
const newLineRe = /\r?\n/gu;
const leadingWhitespaceRe = /^[ \t]*/u;

/**
 * Returns the number of newline characters in the specified text.
 * @param {string} text Text to inspect.
 * @returns {number} Number of newline characters.
 */
function countNewLines (text) {
	const matches = text.match(newLineRe);
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
 * Describes an embedded Markdown section of a document.
 * @typedef {{ "markdown": string, "lineOffset": number, "firstLineColumnOffset": number, "columnOffset": number }} EmbeddedMarkdownSection
 */

/**
 * Returns a description of the embedded Markdown section matched by the pattern.
 * @param {string} text Full document text.
 * @param {RegExpMatchArray} match Regular expression match.
 * @param {string} pattern Regular expression pattern.
 * @returns {EmbeddedMarkdownSection | null} Embedded Markdown section or null.
 */
function getSection (text, match, pattern) {
	const markdown = match.groups?.markdown;
	if (typeof markdown !== "string") {
		throw new Error(
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
	let columnOffset = Number.MAX_SAFE_INTEGER;
	for (const line of lines) {
		if (line.trim().length > 0) {
			columnOffset = Math.min(columnOffset, getLeadingWhitespaceCount(line));
		}
	}
	const dedentedMarkdown = lines.map((line) => {
		const count = Math.min(columnOffset, getLeadingWhitespaceCount(line));
		return count > 0 ? line.slice(count) : line;
	}).join("\n");
	return {
		"markdown": dedentedMarkdown,
		"lineOffset": lineOffset,
		"firstLineColumnOffset": firstLineColumnOffset,
		"columnOffset": columnOffset
	};
}

/**
 * Returns the embedded Markdown sections of a document or null when not applicable.
 * @param {string} text Full document text.
 * @param {string} languageId Document language identifier.
 * @param {Object<string, string[]> | undefined} embeddedMarkdownConfig Value of the "embeddedMarkdown" setting.
 * @returns {EmbeddedMarkdownSection[] | null} Embedded Markdown sections or null.
 */
function getEmbeddedMarkdownSections (text, languageId, embeddedMarkdownConfig) {
	const patterns = embeddedMarkdownConfig?.[languageId];
	if (!patterns || (patterns.length === 0)) {
		return null;
	}
	/** @type {Array<{ "start": number, "section": EmbeddedMarkdownSection }>} */
	const matches = [];
	for (const pattern of patterns) {
		const regex = new RegExp(pattern, "gm");
		for (const match of text.matchAll(regex)) {
			const section = getSection(text, match, pattern);
			if (section) {
				matches.push({ "start": match.index, "section": section });
			}
		}
	}
	matches.sort((a, b) => a.start - b.start);
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
		firstLineColumnOffset,
		columnOffset
	} = section;
	for (const result of results) {
		const lineNumber = result.lineNumber;
		result.lineNumber = lineNumber + lineOffset;
		if (result.errorRange) {
			result.errorRange[0] += (lineNumber === 1) ? firstLineColumnOffset : columnOffset;
		}
		// @ts-ignore
		if (result.fixInfo) {
			// @ts-ignore
			const fixLineNumber = result.fixInfo.lineNumber || lineNumber;
			// @ts-ignore
			result.fixInfo.lineNumber = fixLineNumber + lineOffset;
			// @ts-ignore
			result.fixInfo.editColumn += (fixLineNumber === 1) ? firstLineColumnOffset : columnOffset;
		}
	}
	return results;
}

export { getEmbeddedMarkdownSections, adjustResults };

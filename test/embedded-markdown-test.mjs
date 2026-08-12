// @ts-check

import { describe, test } from "node:test";
import { getEmbeddedMarkdownSections, adjustResults } from "../embedded-markdown.mjs";

const heredocPattern = String.raw`^[ \t]*@(?:moduledoc|doc|typedoc)[ \t]+~?[a-zA-Z]?[ \t]*(?:"""|''')[ \t]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*(?:"""|''')[ \t]*$`;
const rustPattern = String.raw`(?<markdown>(?:^[ \t]*//[/!][^\r\n]*\r?\n?)+)`;
const rustPrefix = String.raw`^[ \t]*//[/!][ \t]?`;
const jsdocPattern = String.raw`^[ \t]*/\*\*[^\r\n]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*\*/[ \t]*$`;
const jsdocPrefix = String.raw`^[ \t]*\*[ \t]?`;
const jsdocSinglePattern = String.raw`^[ \t]*/\*\*[ \t]*(?<markdown>[^\r\n]*?)[ \t]*\*/[ \t]*$`;

describe("embedded-markdown", () => {

	test("getEmbeddedMarkdownSections with no configuration", (t) => {
		t.plan(1);
		const actual = getEmbeddedMarkdownSections("text", "elixir", undefined);
		t.assert.equal(actual, null);
	});

	test("getEmbeddedMarkdownSections with unconfigured language", (t) => {
		t.plan(1);
		const actual = getEmbeddedMarkdownSections("text", "python", { "elixir": [ heredocPattern ] });
		t.assert.equal(actual, null);
	});

	test("getEmbeddedMarkdownSections with empty patterns", (t) => {
		t.plan(1);
		const actual = getEmbeddedMarkdownSections("text", "elixir", { "elixir": [] });
		t.assert.equal(actual, null);
	});

	test("getEmbeddedMarkdownSections with no matches", (t) => {
		t.plan(1);
		const actual = getEmbeddedMarkdownSections("no markdown here", "elixir", { "elixir": [ heredocPattern ] });
		t.assert.deepEqual(actual, []);
	});

	test("getEmbeddedMarkdownSections with heredoc sections", (t) => {
		t.plan(1);
		const text = "defmodule MyApp do\n  @moduledoc \"\"\"\n  # Hello\n\n  This is a paragraph.\n  \"\"\"\n  @doc \"\"\"\n  Says hello.\n  \"\"\"\nend\n";
		const expected = [
			{ "markdown": "# Hello\n\nThis is a paragraph.\n", "lineOffset": 2, "columnOffsets": [ 2, 0, 2 ] },
			{ "markdown": "Says hello.\n", "lineOffset": 7, "columnOffsets": [ 2 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ heredocPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with CRLF sections", (t) => {
		t.plan(1);
		const text = "defmodule MyApp do\r\n  @moduledoc \"\"\"\r\n  # Hello\r\n  \"\"\"\r\nend\r\n";
		const expected = [
			{ "markdown": "# Hello\n", "lineOffset": 2, "columnOffsets": [ 2 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ heredocPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with whitespace-only line", (t) => {
		t.plan(1);
		const text = "@doc \"\"\"\n  # H\n  \n  body\n  \"\"\"\n";
		const pattern = String.raw`^@doc[ \t]*"""[ \t]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*"""$`;
		const expected = [
			{ "markdown": "# H\n\nbody\n", "lineOffset": 1, "columnOffsets": [ 2, 2, 2 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with single-line section at document start", (t) => {
		t.plan(1);
		const text = "@doc \"Hello\"";
		const pattern = String.raw`@doc[ \t]+"(?<markdown>[\s\S]*?)"`;
		const expected = [
			{ "markdown": "Hello\n", "lineOffset": 0, "columnOffsets": [ 6 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with multiple patterns in document order", (t) => {
		t.plan(1);
		const text = "@doc \"\"\"\nOne\n\"\"\"\n@summary \"Two\"\n@doc \"\"\"\nThree\n\"\"\"\n";
		const docPattern = String.raw`^@doc[ \t]*"""[ \t]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*"""$`;
		const summaryPattern = String.raw`@summary[ \t]+"(?<markdown>[\s\S]*?)"`;
		const expected = [
			{ "markdown": "One\n", "lineOffset": 1, "columnOffsets": [ 0 ] },
			{ "markdown": "Two\n", "lineOffset": 3, "columnOffsets": [ 10 ] },
			{ "markdown": "Three\n", "lineOffset": 5, "columnOffsets": [ 0 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ docPattern, summaryPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with rust sections", (t) => {
		t.plan(1);
		const text = "fn hello() {\n    /// Summary line\n    /// more details\n}\n";
		const expected = [
			{ "markdown": "Summary line\nmore details\n", "lineOffset": 1, "columnOffsets": [ 8, 8, 0 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "rust", { "rust": [ { "pattern": rustPattern, "prefix": rustPrefix } ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with python section", (t) => {
		t.plan(1);
		const text = "def greet(name):\n    \"\"\"Greets the user.\n\n    Returns a greeting.\n    \"\"\"\n    return name\n";
		const pythonPattern = String.raw`^[ \t]*(?:(?:async[ \t]+)?def[ \t]+[A-Za-z_]\w*|class[ \t]+[A-Za-z_]\w*)[^\r\n]*:[ \t]*\r?\n[ \t]*(?:"""|''')(?<markdown>[\s\S]*?)(?:"""|''')`;
		const expected = [
			{ "markdown": "Greets the user.\n\nReturns a greeting.\n", "lineOffset": 1, "columnOffsets": [ 7, 0, 4, 4 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "python", { "python": [ pythonPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with jsdoc sections", (t) => {
		t.plan(1);
		const text = "/**\n * Summary\n * details\n */\n";
		const expected = [
			{ "markdown": "Summary\ndetails\n", "lineOffset": 1, "columnOffsets": [ 3, 3 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "javascript", { "javascript": [ { "pattern": jsdocPattern, "prefix": jsdocPrefix } ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with single-line jsdoc section", (t) => {
		t.plan(1);
		const text = "/** Summary */\n";
		const expected = [
			{ "markdown": "Summary\n", "lineOffset": 0, "columnOffsets": [ 4 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "javascript", { "javascript": [ { "pattern": jsdocSinglePattern, "prefix": jsdocPrefix } ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with prefix not matching", (t) => {
		t.plan(1);
		const text = "no star here *";
		const pattern = String.raw`(?<markdown>[^\r\n]+)`;
		const prefix = String.raw`\*[ \t]?`;
		const expected = [
			{ "markdown": "no star here *\n", "lineOffset": 0, "columnOffsets": [ 0 ] }
		];
		const actual = getEmbeddedMarkdownSections(text, "javascript", { "javascript": [ { pattern, prefix } ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with empty markdown", (t) => {
		t.plan(1);
		const text = "@doc \"\"\"\"\"\"\n";
		const pattern = String.raw`@doc[ \t]+"""(?<markdown>[\s\S]*?)"""`;
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
		t.assert.deepEqual(actual, []);
	});

	test("getEmbeddedMarkdownSections with pattern without markdown group", (t) => {
		t.plan(1);
		const text = "@doc text";
		const pattern = String.raw`@doc[ \t]+(?<content>[^\n]+)`;
		t.assert.throws(
			() => {
				getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
			},
			/\(?<markdown>\.\.\.\)/u
		);
	});

	test("getEmbeddedMarkdownSections with pattern without named groups", (t) => {
		t.plan(1);
		const text = "@doc text";
		const pattern = String.raw`@doc[ \t]+[^\n]+`;
		t.assert.throws(
			() => {
				getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
			},
			/\(?<markdown>\.\.\.\)/u
		);
	});

	test("getEmbeddedMarkdownSections with pattern object without pattern", (t) => {
		t.plan(1);
		const text = "@doc text";
		t.assert.throws(
			() => {
				getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ { "prefix": "" } ] });
			},
			/must be a string or an object/u
		);
	});

	test("getEmbeddedMarkdownSections with null pattern", (t) => {
		t.plan(1);
		const text = "@doc text";
		t.assert.throws(
			() => {
				getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ null ] });
			},
			/must be a string or an object/u
		);
	});

	test("getEmbeddedMarkdownSections with invalid pattern", (t) => {
		t.plan(1);
		const pattern = "(";
		t.assert.throws(
			() => {
				getEmbeddedMarkdownSections("text", "elixir", { "elixir": [ pattern ] });
			},
			SyntaxError
		);
	});

	test("adjustResults with offsets", (t) => {
		t.plan(1);
		const section = { "markdown": "# Hello\nworld", "lineOffset": 10, "columnOffsets": [ 0, 2, 2, 2 ] };
		/** @type {any[]} */
		const results = [
			{ "lineNumber": 1, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 1, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 2, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 2, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 3, "fixInfo": { "editColumn": 7, "deleteCount": 1, "insertText": "x" } },
			{ "lineNumber": 4 },
			{ "lineNumber": 5, "errorRange": [ 1, 1 ] },
			{ "lineNumber": 2, "fixInfo": { "lineNumber": 6, "editColumn": 5, "deleteCount": 1, "insertText": "" } }
		];
		const expected = [
			{ "lineNumber": 11, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 11, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 12, "errorRange": [ 5, 5 ], "fixInfo": { "lineNumber": 12, "editColumn": 5, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 13, "fixInfo": { "lineNumber": 13, "editColumn": 9, "deleteCount": 1, "insertText": "x" } },
			{ "lineNumber": 14 },
			{ "lineNumber": 15, "errorRange": [ 3, 1 ] },
			{ "lineNumber": 12, "fixInfo": { "lineNumber": 16, "editColumn": 7, "deleteCount": 1, "insertText": "" } }
		];
		adjustResults(results, section);
		t.assert.deepEqual(results, expected);
	});

	test("adjustResults with first-line column offset", (t) => {
		t.plan(1);
		const section = { "markdown": "Hello\n", "lineOffset": 5, "columnOffsets": [ 8 ] };
		const results = [
			{ "lineNumber": 1, "errorRange": [ 2, 3 ] }
		];
		const expected = [
			{ "lineNumber": 6, "errorRange": [ 10, 3 ] }
		];
		adjustResults(results, section);
		t.assert.deepEqual(results, expected);
	});

});

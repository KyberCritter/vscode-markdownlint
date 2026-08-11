// @ts-check

import { describe, test } from "node:test";
import { getEmbeddedMarkdownSections, adjustResults } from "../embedded-markdown.mjs";

const heredocPattern = String.raw`^[ \t]*@(?:moduledoc|doc|typedoc)[ \t]+(?:~[a-zA-Z]?)?[ \t]*(?:"""|''')[ \t]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*(?:"""|''')[ \t]*$`;

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
			{ "markdown": "# Hello\n\nThis is a paragraph.", "lineOffset": 2, "firstLineOffset": 2, "columnOffset": 2 },
			{ "markdown": "Says hello.", "lineOffset": 7, "firstLineOffset": 2, "columnOffset": 2 }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ heredocPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with CRLF sections", (t) => {
		t.plan(1);
		const text = "defmodule MyApp do\r\n  @moduledoc \"\"\"\r\n  # Hello\r\n  \"\"\"\r\nend\r\n";
		const expected = [
			{ "markdown": "# Hello", "lineOffset": 2, "firstLineOffset": 2, "columnOffset": 2 }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ heredocPattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with whitespace-only line", (t) => {
		t.plan(1);
		const text = "@doc \"\"\"\n  # H\n  \n  body\n  \"\"\"\n";
		const pattern = String.raw`^@doc[ \t]*"""[ \t]*\r?\n(?<markdown>[\s\S]*?)\r?\n[ \t]*"""$`;
		const expected = [
			{ "markdown": "# H\n\nbody", "lineOffset": 1, "firstLineOffset": 2, "columnOffset": 2 }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ pattern ] });
		t.assert.deepEqual(actual, expected);
	});

	test("getEmbeddedMarkdownSections with single-line section at document start", (t) => {
		t.plan(1);
		const text = "@doc \"Hello\"";
		const pattern = String.raw`@doc[ \t]+"(?<markdown>[\s\S]*?)"`;
		const expected = [
			{ "markdown": "Hello", "lineOffset": 0, "firstLineOffset": 6, "columnOffset": 0 }
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
			{ "markdown": "One", "lineOffset": 1, "firstLineOffset": 0, "columnOffset": 0 },
			{ "markdown": "Two", "lineOffset": 3, "firstLineOffset": 10, "columnOffset": 0 },
			{ "markdown": "Three", "lineOffset": 5, "firstLineOffset": 0, "columnOffset": 0 }
		];
		const actual = getEmbeddedMarkdownSections(text, "elixir", { "elixir": [ docPattern, summaryPattern ] });
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
		const section = { "markdown": "# Hello\nworld", "lineOffset": 10, "firstLineOffset": 0, "columnOffset": 2 };
		/** @type {any[]} */
		const results = [
			{ "lineNumber": 1, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 1, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 2, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 2, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 3, "fixInfo": { "editColumn": 7, "deleteCount": 1, "insertText": "x" } },
			{ "lineNumber": 4 }
		];
		const expected = [
			{ "lineNumber": 11, "errorRange": [ 3, 5 ], "fixInfo": { "lineNumber": 11, "editColumn": 3, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 12, "errorRange": [ 5, 5 ], "fixInfo": { "lineNumber": 12, "editColumn": 5, "deleteCount": 2, "insertText": "" } },
			{ "lineNumber": 13, "fixInfo": { "lineNumber": 13, "editColumn": 9, "deleteCount": 1, "insertText": "x" } },
			{ "lineNumber": 14 }
		];
		adjustResults(results, section);
		t.assert.deepEqual(results, expected);
	});

	test("adjustResults with first-line column offset", (t) => {
		t.plan(1);
		const section = { "markdown": "Hello", "lineOffset": 5, "firstLineOffset": 8, "columnOffset": 0 };
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

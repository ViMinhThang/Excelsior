package tui

import (
	"strings"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/formatters"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
)

// HighlightCode returns ANSI-highlighted code using chroma. Falls back to plain code on error.
// It uses the 256-color terminal formatter and the "github" style which works on both light/dark terminals.
func HighlightCode(code, lang string) string {
	trimmed := strings.Trim(code, "\n")
	if trimmed == "" {
		return code
	}
	var lexer chroma.Lexer
	if lang != "" {
		lexer = lexers.Get(lang)
	}
	if lexer == nil {
		lexer = lexers.Analyse(trimmed)
	}
	if lexer == nil {
		lexer = lexers.Fallback
	}
	lexer = chroma.Coalesce(lexer)

	formatter := formatters.Get("terminal256")
	if formatter == nil {
		formatter = formatters.Fallback
	}
	style := styles.Get("github")
	if style == nil {
		style = styles.Fallback
	}

	iterator, err := lexer.Tokenise(nil, trimmed)
	if err != nil {
		return code
	}
	var sb strings.Builder
	if err := formatter.Format(&sb, style, iterator); err != nil {
		return code
	}
	return sb.String()
}

var extToLang = map[string]string{
	".tsx": "tsx", ".ts": "typescript", ".jsx": "jsx", ".js": "javascript",
	".py": "python", ".go": "go", ".json": "json", ".md": "markdown",
	".css": "css", ".html": "html", ".yaml": "yaml", ".yml": "yaml",
	".sh": "bash", ".bash": "bash", ".sql": "sql", ".rs": "rust",
}

var extPriority = []string{".tsx", ".ts", ".jsx", ".js", ".py", ".go", ".json", ".md", ".css", ".html", ".yaml", ".yml", ".sh", ".bash", ".sql", ".rs"}

func inferToolLang(content, meta string) string {
	lower := strings.ToLower(content + " " + meta)
	for _, ext := range extPriority {
		if strings.Contains(lower, ext) {
			return extToLang[ext]
		}
	}
	if isBashLike(lower) {
		return "bash"
	}
	return ""
}

func isBashLike(s string) bool { return strings.Contains(s, "bash") || strings.Contains(s, "shell") }

func isCodeLike(content string) bool {
	if !strings.Contains(content, "\n") || len(strings.TrimSpace(content)) < 40 {
		return false
	}
	// Heuristic: contains code tokens or line-numbered view output
	if strings.Contains(content, ": ") && strings.Contains(content, "import ") {
		return true
	}
	return strings.Contains(content, "{") || strings.Contains(content, "}") ||
		strings.Contains(content, "function") || strings.Contains(content, "const ") ||
		strings.Contains(content, "import ") || strings.Contains(content, "export ") ||
		strings.Contains(content, "return") || strings.Contains(content, "=>")
}

// renderMarkdownWithHighlight splits content by fenced code blocks (```lang) and highlights code.
// Non-code chunks are returned as plain text (already styled by caller).
func renderMarkdownWithHighlight(content string, width int) string {
	// Reuse simple chunking similar to web MarkdownRenderer
	type chunk struct {
		kind string // "text" | "code"
		lang string
		body string
	}
	var chunks []chunk
	remaining := content
	for len(remaining) > 0 {
		start := strings.Index(remaining, "```")
		if start == -1 {
			chunks = append(chunks, chunk{kind: "text", body: remaining})
			break
		}
		if start > 0 {
			chunks = append(chunks, chunk{kind: "text", body: remaining[:start]})
		}
		after := remaining[start+3:]
		end := strings.Index(after, "```")
		if end == -1 {
			// unclosed fence -> treat rest as code
			nl := strings.Index(after, "\n")
			var lang, body string
			if nl != -1 {
				lang = strings.TrimSpace(after[:nl])
				body = after[nl+1:]
			} else {
				body = after
			}
			chunks = append(chunks, chunk{kind: "code", lang: lang, body: body})
			break
		}
		block := after[:end]
		nl := strings.Index(block, "\n")
		var lang, body string
		if nl != -1 {
			lang = strings.TrimSpace(block[:nl])
			body = block[nl+1:]
		} else {
			body = block
		}
		chunks = append(chunks, chunk{kind: "code", lang: lang, body: body})
		remaining = after[end+3:]
	}

	var sb strings.Builder
	for _, c := range chunks {
		if c.kind == "code" {
			highlighted := HighlightCode(c.body, c.lang)
			header := ""
			if c.lang != "" {
				header = codeHeaderStyle.Render(c.lang)
				sb.WriteString(header + "\n")
			}
			boxed := codeBlockStyle.Width(width).Render(highlighted)
			sb.WriteString(boxed + "\n")
		} else {
			// Preserve assistant styling for plain text segments
			if strings.TrimSpace(c.body) != "" {
				sb.WriteString(assistantStyle.Render(c.body))
			} else {
				sb.WriteString(c.body)
			}
		}
	}
	return sb.String()
}

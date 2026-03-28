package workflow

const (
	TemplateKnowledgeQA         = "knowledge_qa"
	TemplateDocumentSummary     = "document_summary"
	TemplateMultiDocumentCompare = "multi_document_compare"
	TemplateWebpageDigest       = "webpage_digest"
	TemplateStructuredExtraction = "structured_extraction"
)

type NodeType string

const (
	NodeTypeInput    NodeType = "input"
	NodeTypeRetrieve NodeType = "retrieve"
	NodeTypeTool     NodeType = "tool"
	NodeTypePrompt   NodeType = "prompt"
	NodeTypeFinalize NodeType = "finalize"
)

type BuiltInNode struct {
	Type       NodeType `json:"type"`
	Name       string   `json:"name"`
	ToolName   string   `json:"toolName,omitempty"`
	PromptHint string   `json:"promptHint,omitempty"`
}

type BuiltInTemplate struct {
	Key         string        `json:"key"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Nodes       []BuiltInNode `json:"nodes"`
}

func BuiltInCatalog() map[string]BuiltInTemplate {
	return map[string]BuiltInTemplate{
		TemplateKnowledgeQA: {
			Key:         TemplateKnowledgeQA,
			Name:        "Knowledge Q&A",
			Description: "Answer a question from selected knowledge spaces.",
			Nodes: []BuiltInNode{
				{Type: NodeTypeInput, Name: "question"},
				{Type: NodeTypeRetrieve, Name: "retrieve_knowledge"},
				{Type: NodeTypePrompt, Name: "compose_answer", PromptHint: "Answer with citations."},
				{Type: NodeTypeFinalize, Name: "finalize"},
			},
		},
		TemplateDocumentSummary: {
			Key:         TemplateDocumentSummary,
			Name:        "Document Summary",
			Description: "Summarize selected knowledge documents.",
			Nodes: []BuiltInNode{
				{Type: NodeTypeInput, Name: "summary_request"},
				{Type: NodeTypeRetrieve, Name: "retrieve_documents"},
				{Type: NodeTypePrompt, Name: "summarize_documents", PromptHint: "Produce a concise summary."},
				{Type: NodeTypeFinalize, Name: "finalize"},
			},
		},
		TemplateMultiDocumentCompare: {
			Key:         TemplateMultiDocumentCompare,
			Name:        "Multi-document Comparison",
			Description: "Compare multiple retrieved documents.",
			Nodes: []BuiltInNode{
				{Type: NodeTypeInput, Name: "comparison_request"},
				{Type: NodeTypeRetrieve, Name: "retrieve_documents"},
				{Type: NodeTypePrompt, Name: "compare_documents", PromptHint: "Highlight similarities and differences."},
				{Type: NodeTypeFinalize, Name: "finalize"},
			},
		},
		TemplateWebpageDigest: {
			Key:         TemplateWebpageDigest,
			Name:        "Webpage Digest",
			Description: "Fetch a webpage and summarize it.",
			Nodes: []BuiltInNode{
				{Type: NodeTypeInput, Name: "url"},
				{Type: NodeTypeTool, Name: "fetch_page", ToolName: "fetch_url"},
				{Type: NodeTypePrompt, Name: "summarize_page", PromptHint: "Summarize webpage contents."},
				{Type: NodeTypeFinalize, Name: "finalize"},
			},
		},
		TemplateStructuredExtraction: {
			Key:         TemplateStructuredExtraction,
			Name:        "Structured Extraction",
			Description: "Extract structured data from the input.",
			Nodes: []BuiltInNode{
				{Type: NodeTypeInput, Name: "content"},
				{Type: NodeTypeTool, Name: "transform_text", ToolName: "text_transform"},
				{Type: NodeTypePrompt, Name: "format_output", PromptHint: "Return structured output."},
				{Type: NodeTypeFinalize, Name: "finalize"},
			},
		},
	}
}

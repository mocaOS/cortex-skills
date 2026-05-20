# LangChain Integration — Complete Reference

> This reference complements the SKILL.md by providing full implementation details for custom retrievers, tool definitions, agent configurations, chain compositions, and end-to-end working examples.

## Prerequisites

```bash
pip install langchain langchain-openai langchain-community requests
```

You also need the `CortexClient` class from SKILL.md copied into your project.

---

## Custom Retriever — Full Implementation

The SKILL.md shows a minimal retriever. This is the production-grade version with collection filtering, score thresholds, metadata mapping, and async support.

```python
from langchain.schema import BaseRetriever, Document
from langchain.callbacks.manager import CallbackManagerForRetrieverRun
from typing import List, Optional
from cortex_client import CortexClient


class CortexRetriever(BaseRetriever):
    """LangChain retriever backed by Cortex hybrid search."""

    client: CortexClient
    top_k: int = 10
    collection_id: Optional[str] = None
    score_threshold: float = 0.0

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun = None
    ) -> List[Document]:
        results = self.client.search(
            query,
            top_k=self.top_k,
            collection_id=self.collection_id,
        )
        docs = []
        for r in results:
            score = r.get("score", 0.0)
            if score < self.score_threshold:
                continue
            docs.append(
                Document(
                    page_content=r["content"],
                    metadata={
                        "document_id": r.get("document_id", ""),
                        "chunk_id": r.get("chunk_id", ""),
                        "score": score,
                        "filename": r.get("metadata", {}).get("filename", ""),
                        "page": r.get("metadata", {}).get("page", None),
                        "source": "cortex",
                    },
                )
            )
        return docs
```

### Usage Patterns

```python
client = CortexClient("http://localhost:8000", "moca_ro_your_key")

# Basic retriever
retriever = CortexRetriever(client=client, top_k=5)
docs = retriever.get_relevant_documents("deployment architecture")

# Collection-scoped retriever
eng_retriever = CortexRetriever(
    client=client,
    top_k=10,
    collection_id="engineering",
    score_threshold=0.5,  # Only return results with score >= 0.5
)

# Multiple retrievers for different collections
hr_retriever = CortexRetriever(client=client, collection_id="hr_policies", top_k=3)
finance_retriever = CortexRetriever(client=client, collection_id="finance", top_k=3)
```

---

## Tool Definitions — Full Implementation

The SKILL.md shows basic lambda tools. Below are structured tool implementations with proper descriptions, error handling, and output formatting.

### Search Tool

```python
from langchain.tools import Tool, StructuredTool
from pydantic import BaseModel, Field
from typing import Optional


class SearchInput(BaseModel):
    query: str = Field(description="The search query in natural language")
    top_k: int = Field(default=5, description="Number of results to return (1-20)")
    collection_id: Optional[str] = Field(
        default=None, description="Optional collection ID to scope the search"
    )


def cortex_search_func(query: str, top_k: int = 5, collection_id: str = None) -> str:
    results = client.search(query, top_k=top_k, collection_id=collection_id)
    if not results:
        return "No results found."
    output_parts = []
    for i, r in enumerate(results, 1):
        score = r.get("score", 0.0)
        content = r["content"][:300]
        filename = r.get("metadata", {}).get("filename", "unknown")
        output_parts.append(f"[{i}] (score: {score:.2f}, file: {filename})\n{content}")
    return "\n\n".join(output_parts)


cortex_search_tool = StructuredTool.from_function(
    func=cortex_search_func,
    name="cortex_search",
    description=(
        "Search the Cortex knowledge base using hybrid search (vector + keyword + graph). "
        "Use this to find specific information, facts, or passages from uploaded documents."
    ),
    args_schema=SearchInput,
)
```

### Ask Tool

```python
class AskInput(BaseModel):
    question: str = Field(description="The question to ask the knowledge base")
    use_graph: bool = Field(
        default=True,
        description="Whether to use knowledge graph context for richer answers",
    )
    collection_id: Optional[str] = Field(
        default=None, description="Optional collection ID to scope the question"
    )


def cortex_ask_func(
    question: str, use_graph: bool = True, collection_id: str = None
) -> str:
    result = client.ask(question, use_graph=use_graph, collection_id=collection_id)
    answer = result.get("answer", "No answer generated.")
    sources = result.get("sources", [])
    source_list = ", ".join(
        [s.get("document_id", "unknown")[:8] for s in sources[:5]]
    )
    return f"{answer}\n\n[Sources: {source_list}]"


cortex_ask_tool = StructuredTool.from_function(
    func=cortex_ask_func,
    name="cortex_ask",
    description=(
        "Ask a question to the Cortex knowledge base and get a synthesized answer "
        "with source citations. Uses RAG with optional knowledge graph context. "
        "Prefer this over cortex_search when you need a direct answer rather than raw passages."
    ),
    args_schema=AskInput,
)
```

### Upload Tool

```python
class UploadInput(BaseModel):
    file_path: str = Field(description="Local file path to upload")
    collection_id: Optional[str] = Field(
        default=None, description="Collection to upload into"
    )


def cortex_upload_func(file_path: str, collection_id: str = None) -> str:
    result = client.upload(file_path, collection_id=collection_id)
    return f"Uploaded {result['filename']} (doc_id: {result['doc_id']}, status: {result['status']})"


cortex_upload_tool = StructuredTool.from_function(
    func=cortex_upload_func,
    name="cortex_upload",
    description="Upload a document to the Cortex knowledge base for processing and indexing.",
    args_schema=UploadInput,
)
```

### Entity Lookup Tool

```python
def cortex_entity_func(name: str) -> str:
    entity = client.entity(name)
    if not entity:
        return f"Entity '{name}' not found."
    rels = entity.get("relationships", [])
    rel_text = "\n".join(
        [f"  --[{r['type']}]--> {r['target']}" for r in rels[:10]]
    )
    return (
        f"Entity: {entity['name']} ({entity['type']})\n"
        f"Description: {entity.get('description', 'N/A')}\n"
        f"Documents: {len(entity.get('documents', []))}\n"
        f"Relationships:\n{rel_text or '  (none)'}"
    )


cortex_entity_tool = Tool(
    name="cortex_entity_lookup",
    description=(
        "Look up a specific entity in the knowledge graph to see its type, "
        "description, relationships, and source documents."
    ),
    func=cortex_entity_func,
)
```

---

## Agent Setup — ReAct Agent with Tools

### Basic Agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_react_agent
from langchain.prompts import PromptTemplate

llm = ChatOpenAI(model="gpt-4o", temperature=0)

tools = [cortex_search_tool, cortex_ask_tool, cortex_entity_tool]

react_prompt = PromptTemplate.from_template(
    """You are a research assistant with access to a Cortex knowledge base.

Available tools:
{tools}

Tool names: {tool_names}

Use the following format:

Question: the input question
Thought: think about what to do
Action: the tool to use
Action Input: the input for the tool
Observation: the result
... (repeat Thought/Action/Observation as needed)
Thought: I now know the final answer
Final Answer: the final answer

Question: {input}
{agent_scratchpad}"""
)

agent = create_react_agent(llm, tools, react_prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=5,
    handle_parsing_errors=True,
)

result = agent_executor.invoke({"input": "What is the deployment architecture?"})
print(result["output"])
```

### OpenAI Functions Agent (Structured Tool Calling)

```python
from langchain.agents import create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a knowledge base assistant. Use the Cortex tools to answer questions. "
        "Always cite your sources. If the knowledge base does not contain relevant information, "
        "say so clearly rather than making up an answer."
    )),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=8,
)

result = agent_executor.invoke({"input": "Compare the Q2 and Q3 revenue figures"})
```

---

## Chain Compositions

### RAG Chain with Custom Retriever

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

retriever = CortexRetriever(client=client, top_k=5, score_threshold=0.3)
llm = ChatOpenAI(model="gpt-4o", temperature=0)

template = ChatPromptTemplate.from_template(
    """Answer the question based only on the following context.
If the context does not contain enough information, say "I don't have enough information."

Context:
{context}

Question: {question}

Answer:"""
)


def format_docs(docs):
    return "\n\n---\n\n".join(
        [f"[Source: {d.metadata.get('filename', 'unknown')}]\n{d.page_content}" for d in docs]
    )


rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | template
    | llm
    | StrOutputParser()
)

answer = rag_chain.invoke("What are the system requirements?")
print(answer)
```

### Multi-Collection RAG Chain

Route questions to different collections based on topic classification.

```python
from langchain_core.runnables import RunnableLambda

engineering_retriever = CortexRetriever(
    client=client, collection_id="engineering", top_k=5
)
hr_retriever = CortexRetriever(
    client=client, collection_id="hr_policies", top_k=5
)
finance_retriever = CortexRetriever(
    client=client, collection_id="finance", top_k=5
)

classifier_prompt = ChatPromptTemplate.from_template(
    """Classify this question into exactly one category: engineering, hr, finance.
Return only the category name, nothing else.

Question: {question}"""
)

classifier_chain = classifier_prompt | llm | StrOutputParser()


def route_to_retriever(question: str) -> list:
    category = classifier_chain.invoke({"question": question}).strip().lower()
    retriever_map = {
        "engineering": engineering_retriever,
        "hr": hr_retriever,
        "finance": finance_retriever,
    }
    retriever = retriever_map.get(category, engineering_retriever)
    return retriever.get_relevant_documents(question)


routed_rag_chain = (
    {"context": RunnableLambda(route_to_retriever) | format_docs, "question": RunnablePassthrough()}
    | template
    | llm
    | StrOutputParser()
)

answer = routed_rag_chain.invoke("What is the vacation policy?")
```

### Conversational RAG with Memory

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory

store = {}

def get_session_history(session_id: str):
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]

retriever = CortexRetriever(client=client, top_k=5)

contextualize_prompt = ChatPromptTemplate.from_messages([
    ("system", "Given the chat history, reformulate the latest question to be standalone."),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
])

standalone_chain = contextualize_prompt | llm | StrOutputParser()

qa_prompt = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a helpful assistant. Answer questions using the provided context. "
        "Cite sources when possible.\n\nContext:\n{context}"
    )),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}"),
])


def retrieve_with_history(input_dict):
    if input_dict.get("chat_history"):
        standalone = standalone_chain.invoke(input_dict)
    else:
        standalone = input_dict["input"]
    docs = retriever.get_relevant_documents(standalone)
    return format_docs(docs)


conversational_chain = (
    RunnablePassthrough.assign(context=retrieve_with_history)
    | qa_prompt
    | llm
    | StrOutputParser()
)

with_history = RunnableWithMessageHistory(
    conversational_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
)

# Usage
config = {"configurable": {"session_id": "session_001"}}

answer1 = with_history.invoke({"input": "What is the system architecture?"}, config=config)
print(answer1)

answer2 = with_history.invoke({"input": "What databases does it use?"}, config=config)
print(answer2)  # Understands "it" refers to the system from the previous question
```

---

## CrewAI Integration — Extended

The SKILL.md shows a basic CrewAI setup. Below is a multi-agent configuration with specialized roles and shared Cortex memory.

```python
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0)

# Agent 1: Researcher - finds information
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find comprehensive information from the knowledge base to answer questions thoroughly",
    backstory="You are an expert at formulating search queries and synthesizing information from multiple sources.",
    tools=[cortex_search_tool, cortex_entity_tool],
    llm=llm,
    verbose=True,
)

# Agent 2: Analyst - synthesizes and reasons
analyst = Agent(
    role="Technical Analyst",
    goal="Analyze research findings and produce clear, actionable insights",
    backstory="You excel at finding patterns, identifying gaps, and producing structured analysis.",
    tools=[cortex_ask_tool],
    llm=llm,
    verbose=True,
)

# Agent 3: Writer - produces the final output
writer = Agent(
    role="Technical Writer",
    goal="Produce clear, well-structured reports from analysis",
    backstory="You write concise, accurate technical documentation.",
    tools=[],
    llm=llm,
    verbose=True,
)

# Define tasks
research_task = Task(
    description="Research the following topic in the knowledge base: {topic}. Find all relevant documents, entities, and relationships.",
    expected_output="A comprehensive list of findings with source references.",
    agent=researcher,
)

analysis_task = Task(
    description="Analyze the research findings. Identify key themes, contradictions, and gaps in the information.",
    expected_output="A structured analysis with key insights and identified gaps.",
    agent=analyst,
)

report_task = Task(
    description="Write a concise report based on the analysis. Include an executive summary, key findings, and recommendations.",
    expected_output="A formatted report with executive summary, findings, and recommendations.",
    agent=writer,
)

crew = Crew(
    agents=[researcher, analyst, writer],
    tasks=[research_task, analysis_task, report_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "system deployment architecture and scaling strategy"})
print(result)
```

---

## LangGraph Integration

For more complex agent workflows with conditional branching and cycles.

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage, HumanMessage
import operator


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    search_results: str
    answer: str
    needs_more_info: bool


def search_node(state: AgentState) -> dict:
    query = state["messages"][-1].content
    results = client.search(query, top_k=5)
    formatted = "\n".join([f"- {r['content'][:200]}" for r in results])
    return {"search_results": formatted}


def evaluate_node(state: AgentState) -> dict:
    results = state["search_results"]
    has_content = len(results.strip()) > 50
    return {"needs_more_info": not has_content}


def answer_node(state: AgentState) -> dict:
    question = state["messages"][-1].content
    result = client.ask(question, use_graph=True)
    return {"answer": result.get("answer", "Could not generate an answer.")}


def fallback_node(state: AgentState) -> dict:
    return {"answer": "I could not find enough information in the knowledge base to answer this question."}


def route_after_eval(state: AgentState) -> str:
    if state["needs_more_info"]:
        return "fallback"
    return "answer"


workflow = StateGraph(AgentState)
workflow.add_node("search", search_node)
workflow.add_node("evaluate", evaluate_node)
workflow.add_node("answer", answer_node)
workflow.add_node("fallback", fallback_node)

workflow.set_entry_point("search")
workflow.add_edge("search", "evaluate")
workflow.add_conditional_edges("evaluate", route_after_eval, {"answer": "answer", "fallback": "fallback"})
workflow.add_edge("answer", END)
workflow.add_edge("fallback", END)

app = workflow.compile()

result = app.invoke({
    "messages": [HumanMessage(content="What is the deployment architecture?")],
    "search_results": "",
    "answer": "",
    "needs_more_info": False,
})
print(result["answer"])
```

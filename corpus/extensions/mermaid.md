# Mermaid diagrams

Standard fenced diagram with source available through Edit source:

```mermaid
flowchart LR
  Start --> Finish
```

Wide diagram scrolls sideways at its drawn size:

```mermaid
flowchart LR
  A[One] --> B[Two] --> C[Three] --> D[Four] --> E[Five] --> F[Six] --> G[Seven] --> H[Eight]
```

Tilde fence, mixed-case language, and preserved extra info:

~~~Mermaid title="workflow"
sequenceDiagram
  Alice->>Bob: Hello
~~~

Configuration directive stays editable as source:

```mermaid
%%{init: {'htmlLabels': true}}%%
flowchart LR
  A --> B
```

Malformed diagram stays editable as source:

```mermaid
flowchart LR
  A[unterminated
```

Unknown language remains an ordinary code block:

```mermaidish
flowchart LR
  A --> B
```

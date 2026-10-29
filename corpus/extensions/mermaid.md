# Mermaid diagrams

Standard fenced diagram; click the diagram to edit its source with a preview below:

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

## A rendered diagram stays fully visible

This 12-line Mermaid source renders as one complete diagram. Click it to edit the source and leave it to restore the full diagram; the rendered image has no collapse controls.

```mermaid
flowchart TD
  Bed1 --> Bed2
  Bed2 --> Bed3
  Bed3 --> Bed4
  Bed4 --> Bed5
  Bed5 --> Bed6
  Bed6 --> Bed7
  Bed7 --> Bed8
  Bed8 --> Bed9
  Bed9 --> Bed10
  Bed10 --> Bed11
  Bed11 --> Bed12
```

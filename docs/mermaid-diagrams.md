# Mermaid Diagrams

bmd renders fenced `mermaid` code blocks as ASCII/Unicode art inline in the terminal — no browser, no DOM, no external renderer required.

## Quick Start

```sh
printf '```mermaid\ngraph LR\n    A --> B --> C\n```' | bmd -
```

Output:

```
┌───┐  ┌───┐  ┌───┐
│   │  │   │  │   │
│ A ├─►│ B ├─►│ C │
│   │  │   │  │   │
└───┘  └───┘  └───┘
```

## Supported Diagram Types

| Type      | Keyword       | Description                         |
| --------- | ------------- | ----------------------------------- |
| Flowchart | `graph`, `flowchart` | Directed graphs with nodes and edges |
| Sequence  | `sequenceDiagram`    | Actor-to-actor message flows        |
| State     | `stateDiagram`       | State machines with transitions     |
| Class     | `classDiagram`       | UML class diagrams                  |
| ER        | `erDiagram`          | Entity-relationship diagrams        |

## Sample Diagrams

One compact example per supported type, plus a **subgraph** flowchart (grouped nodes).

### Flowchart (Top-Down)

```mermaid
graph TD
    A[Request] --> B{Auth?}
    B -->|yes| C[Handler]
    B -->|no| D[401]
    C --> E[Cache]
    E -->|hit| F[Response]
    E -->|miss| G[DB]
    G --> F
```

### Flowchart (Left-Right)

```mermaid
graph LR
    In[In] --> V[Validate]
    V --> R{Route}
    R -->|hi| F[Fast]
    R -->|lo| Q[Queue]
    F --> Out[Out]
    Q --> Out
```

### Flowchart (subgraphs)

`subgraph` groups nodes; edges can cross group boundaries.

```mermaid
graph LR
    subgraph In
        A[Parse] --> B[Validate]
    end
    subgraph Out
        C[Write] --> D[Done]
    end
    B --> C
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant S as Service
    C->>G: POST /order
    G->>S: create()
    S-->>G: ok id=1
    G-->>C: 201
```

### State Diagram

```mermaid
stateDiagram-v2
    [*] --> Open
    Open --> Review: submit
    Review --> Open: changes
    Review --> Done: approve
    Done --> [*]
    Open --> Closed: cancel
    Closed --> [*]
```

### Class Diagram

```mermaid
classDiagram
    class Bus {
        +subscribe(t, h)
        +publish(e)
    }
    class Event {
        +id
        +type
    }
    class Handler {
        <<interface>>
        +handle(e)
    }
    Bus --> Event
    Bus ..> Handler
```

### ER Diagram

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE : has
    USER {
        uuid id PK
        text email
    }
    ORDER {
        uuid id PK
        uuid user_id FK
    }
    LINE {
        uuid order_id FK
        text sku
        int qty
    }
```

## Unsupported Diagram Types

Diagram types not listed above (gantt, pie, journey, etc.) render a labeled placeholder:

```
[mermaid: gantt — unsupported diagram type]
```

The placeholder identifies the type so you know what's missing. It does not break rendering of the rest of the document.

## Inline Mermaid

Semicolons act as line separators when the opening fence and body are on a single line:

```sh
echo '```mermaid;graph LR; A --> B; B --> C```' | bmd -
```

This is equivalent to:

````markdown
```mermaid
graph LR
    A --> B
    B --> C
```
````

Useful for one-liner diagrams in shell scripts or inline documentation.

## Output Modes

| Mode            | Behavior                                           |
| --------------- | -------------------------------------------------- |
| UTF-8 + ANSI    | Box-drawing characters with theme-controlled color |
| UTF-8 no ANSI   | Box-drawing characters, no color                   |
| ASCII (`-a`)    | Plain ASCII art                                    |

## Error Handling

Syntax errors in a mermaid block produce a visible error message in the output but do not affect rendering of the rest of the document. Each block is parsed independently.

## Theming

Mermaid diagram colors are controlled by the `mer` theme facet:

```sh
bmd --theme "mer:dracula" README.md
```

Bundled themes: `dark`, `light`, `dracula`. See [themes.md](themes.md) for custom theme creation.

## Browser Preview

In `bmd serve`, mermaid blocks render as text art in the preview pane, matching terminal output. The same rendering engine is used for both terminal and browser.

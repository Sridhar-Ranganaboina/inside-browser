<img width="1160" height="796" alt="image" src="https://github.com/user-attachments/assets/7f2a2d8d-1554-4466-9093-99e88ac7dca2" />
<img width="1883" height="1332" alt="image" src="https://github.com/user-attachments/assets/b6b7c3a3-840c-4cd4-9c26-33ccdc33acdd" />

<img width="2000" height="1126" alt="image" src="https://github.com/user-attachments/assets/f12de13d-aaaf-40f6-b2db-fa2c781ffb1c" />
<img width="1000" height="563" alt="image" src="https://github.com/user-attachments/assets/7b5bd09e-df90-4c59-bdfe-7576ad4c29d4" />
<img width="1200" height="632" alt="image" src="https://github.com/user-attachments/assets/6f4f9f41-e655-42f3-8a9d-94797492ec59" />

## ┌────────────────────────────────────────────────────────┐
│ Browser Extension (Agent Control Node)                  │
│                                                        │
│  - Goal Intake                                         │
│  - Context Awareness (DOM + user state + memory hints) │
│  - Lightweight Planning                                │
│  - Execution Mode Decision                             │
│  - Local Policy Guard                                  │
└────────────────────────────────────────────────────────┘
                    │
          Observe + Act (Agent Abstraction)
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────────────┐   ┌────────────────────────┐
│ Visible Browser Tab   │   │ Headless Chromium       │
│ (Same user session)   │   │ (Isolated backend)     │
│                      │   │                        │
│ - DOM observation     │   │ - DOM observation      │
│ - User-visible steps  │   │ - Silent execution     │
│ - Screenshots         │   │ - Screenshots          │
│ - Document download   │   │ - Document download    │
└──────────────────────┘   └────────────────────────┘
        │                       │
        │  Extracted Content    │  Extracted Content
        │  (HTML, PDF, DOC,     │  (HTML, PDF, DOC,
        │   XLS, PPT, Images)   │   XLS, PPT, Images)
        └───────────┬───────────┘
                    ▼
┌────────────────────────────────────────────────────────┐
│ Content Processing & RAG Ingestion Layer                │
│                                                        │
│  - Text / Table / Image extraction                     │
│  - Chunking                                            │
│  - Embedding generation                                │
│  - Metadata tagging (source, time, confidence)         │
└────────────────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│ Vector Store + Knowledge Index                          │
│                                                        │
│  - Semantic search                                     │
│  - Versioned memory                                    │
│  - Cross-page & cross-run linking                      │
└────────────────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────┐
│ Backend Intelligence Services (AGENT BRAIN)             │
│                                                        │
│  - Deep Planner (re-planning allowed)                  │
│  - RAG Retriever                                       │
│  - Reasoner                                            │
│  - Critic / Confidence Scoring                          │
│  - Learning & Memory Update                             │
└────────────────────────────────────────────────────────┘
                    │
           Feedback / Next Action Decision
                    │
                    └────── back to Agent Control Node




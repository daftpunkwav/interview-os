# 我的初始想法:





我是想做一个这样的ai面试助手.  

而且是可以打开摄像头的,面试者需要提交简历,等待叫号.然后打开摄像头面对ai面试官进行面试.agent需要根据简历和求职者的应聘岗位问问题,收听求职者的回答追问.最后求职者也可以问面试官有关公司的问题.总之就是完全模拟真实面试的场景.且可以手动调整面试官的态度,严厉程度等个性.还可以选择模拟某个公司的面试场景,如字节,腾讯等.系统需要在网上收集一些人发布的相关公司的面试经验来模拟一个公司的面试流程等.另外需要BYOK.  

agent需要最少40分钟的面试时长.需要有优秀的上下文管理和工具调用,需要接入github mcp来获取真实的项目信息.需要有自我成长的属性.需要面对不同情景有不同的workflow,需要真正理解用户的意思是不是需要rag等.


# claude的建议:


这个项目野心很大，比 RepoPilot 还要复杂——建议先把系统拆开看，再决定从哪切入。  

**先拆模块，对应你提的每个需求：**  

| 需求           | 对应模块                       | 技术选型建议                      |
| ------------ | -------------------------- | --------------------------- |
| 简历提交+叫号      | Intake/Queue Agent         | 简单状态机，不需要 LLM               |
| 摄像头面试+听/追问   | Interviewer Agent（核心）      | LangGraph 主图，STT→LLM→TTS 级联 |
| 候选人反问公司      | 同一 Interviewer Agent，切换工具集 | 公司知识库 RAG                   |
| 态度/严厉度可调     | 参数化 system prompt          | 不是难点，就是个配置层                 |
| 模拟字节/腾讯风格    | Company Profile RAG        | 面经数据 pipeline（离线）           |
| GitHub 真实性核验 | Verifier Agent             | GitHub MCP tool call        |
| BYOK         | API 层                      | 用户自带 key，走标准 /v1/messages   |
| 自我成长         | 待你明确                       | 见下面                         |

**关于 RAG vs 直接工具调用——你问"真正理解是不是需要 RAG"，这里有明确答案：**  

- 候选人简历、GitHub 项目：不需要 RAG，直接全文注入 context 或 MCP 实时 fetch，文档量小，检索反而增加延迟和噪音。  
- 公司面试风格/题库（字节/腾讯面经）：这个才真正需要 RAG。因为面经语料量大、时效性强，需要按"公司+岗位+题型"做向量检索召回，再让 Interviewer Agent 用检索到的片段调整提问策略和话术风格。  

**40 分钟上下文管理是真正的硬骨头：**  
不要让 raw transcript 一直往 context 里堆。建议用 LangGraph 的 checkpointing + 结构化 state（而不是纯对话历史）：  

- state 里维护"已问问题列表""候选人薄弱点""待追问线索""GitHub 核实结果"这些结构化字段  
- 每隔几轮做一次摘要压缩，只保留结构化事实，丢弃寒暄  
- 这和你在 Sentient Souls 里处理 LLM 延迟用的分层 FSM+LLM 思路是同一类问题：不是让 LLM 记住一切，而是设计好状态载体让它只需要"当下推理"  

**面经数据爬取——说一句实话：**  
牛客网、看准网这类平台的面经是否允许批量抓取要打个问号，多数有 ToS 限制。真要做，比较稳的路是：小范围人工整理种子数据 + 让用户自己上传/分享面经做众包，而不是大规模爬虫，否则数据源本身就是项目的法律风险点。  

**"自我成长"你指的是哪种？**  

- 系统跨多次面试自己迭代题库/策略（可行，用 memory store 记录哪些问题效果好）  
- 候选人跨多次模拟面试的进步追踪（更简单，做个 progress dashboard 就行）  
  两者实现难度差很多，你是哪个意思？  

**关于 MVP：** 你在 RepoPilot 上已经踩过"文档写太多、backend 没开工"的坑。这个项目比 RepoPilot 更庞大——语音实时管线本身就是一个子系统级工程量。建议第一版先砍掉摄像头/语音，纯文字面试打通 Interviewer Agent + GitHub MCP + 上下文管理这条核心链路，验证"追问是否像真人"这个最难的点，再往外扩语音和公司模拟。 



# gpt的建议


有，而且最近半年突然多了不少。但是没有一个项目真正达到你设想的完整程度。  

你这个想法其实已经不是"AI Mock Interview"了，而是一个Agentic Interview Platform（智能面试平台）。  

按照我搜索到的项目，我会这样分类。  

第一梯队（最值得参考）  

1. OASIS（我认为最值得看）  

这是目前最接近Agent架构的项目。  

它已经有：  

✅ Voice Interview  

✅ 实时语音  

✅ 多模型（BYOK）  

✅ LiteLLM  

✅ RAG  

✅ Docker部署  

✅ Agent Pipeline  

✅ Interview Workflow  

✅ PostgreSQL + pgvector  

✅ 结构化访谈  

但是没有：  

❌ GitHub MCP  

❌ 简历深入分析  

❌ 公司模拟  

❌ 多Agent成长  

❌ 长达40分钟上下文优化  

它最大的价值在于整个Interview Workflow已经搭好了。  

---  

2. DeepInterview  

这个项目和你的方向非常接近。  

支持：  

上传CV  

上传JD  

调研目标公司  

Voice Interview  

Follow-up  

多语言  

最终评分  

已经开始研究  

> 根据公司真实面试风格生成问题  

这和你的"腾讯、字节模拟"很像。  

---  

3. FoloUp  

这是最近GitHub比较火的。  

特点：  

Job Description生成问题  

AI Voice  

Dashboard  

Transcript  

Score  

MIT协议  

自部署  

比较偏HR初筛。  

---  

第二梯队（功能可以借鉴）  

TalentTalk  

有：  

Resume Analysis  

Whisper  

ElevenLabs  

LangGraph Workflow  

PDF Report  

里面LangGraph值得参考。  

---  

InterviewSim  

重点不是语音，而是：  

Clarification  

推理评分  

Learning Recommendation  

GitHub同步  

---  

Avatar Interview Assistant  

特点：  

Avatar  

Resume  

Company Research  

Multi-Agent  

Semantic Kernel  

Avatar做得不错。  

---  

但是，你的想法比这些都更进一步  

真正让我觉得比较新的地方有几个。  

① GitHub MCP  

目前几乎没人做。  

例如：  

> 简历写  

> 我写过一个LangGraph Agent。  

Agent：  

> 我连接GitHub MCP。  

> 找到你的langgraph-agent。  

> 看README。  

> 看commit。  

> 看Issue。  

> 看PR。  

然后问：  

> 我看到你这里用了StateGraph而不是MessageGraph，是为什么？  

这种是真正HR都做不到的。  

---  

② 长时间Agent（40~60分钟）  

目前绝大多数：  

15分钟  

20分钟  

最多30分钟。  

原因很简单：  

上下文爆炸。  

而你已经考虑：  

> Context Engineering  

说明你意识到了真正的问题。  

例如需要：  

Summary Memory  

Episodic Memory  

Rolling Window  

Long-term Memory  

Tool Recall  

这已经进入Agent开发范畴。  

---  

③ 公司模拟  

这个目前基本没人做好。  

例如：  

腾讯  

字节  

阿里  

美团  

网易  

实际上可以建立：  

Company Profile  

↓  

Interview Experience  

↓  

面试流程  

↓  

岗位JD  

↓  

真实八股  

↓  

面试官风格  

↓  

Agent Persona  

形成Company RAG。  

---  

④ 面试官人格  

例如：  

Friendly  

HR  

Leader  

Principal Engineer  

CTO  

压力面  

拷打型  

循循善诱型  

这个国外项目基本只有Temperature，没有真正的人格Workflow。  

---  

⑤ GitHub成长  

你提到：  

> 自我成长  

如果理解成：  

Interview结束  

↓  

分析哪些追问效果最好  

↓  

保存Prompt  

↓  

更新Workflow  

↓  

优化下一次  

其实已经接近Research Agent了。  

---  

如果让我给这个项目定位  

我不会叫它：  

> AI Interview  

我会叫：  

> Agentic Interview Platform  

或者  

> InterviewOS  

因为它已经包括：  

Resume Parser  

Company RAG  

GitHub MCP  

Voice Agent  

Workflow Engine  

Long Context Memory  

Persona Engine  

Evaluation Agent  

Report Agent  

Learning Agent  

BYOK  

多模型支持  

它更像一个完整的平台，而不是单一的面试机器人。  

如果这个项目完全按照你的设想完成，我认为它会明显超过目前 GitHub 上大多数开源 AI 面试项目。 目前这些项目通常只覆盖其中一部分能力（语音、简历分析、评分或公司调研），而你设想的是把它们整合到一个完整的 Agent 系统中，再加入 GitHub MCP、长时上下文管理、公司级 RAG 和可配置人格，这样的完整方案目前还比较少见。
